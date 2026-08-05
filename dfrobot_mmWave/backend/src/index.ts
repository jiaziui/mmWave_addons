import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { loadConfig } from "./config";
import { migrateLegacyDeviceData } from "./config/dataCleanup";
import { DeviceStorage } from "./config/storage";
import { RetainedTopicStorage } from "./config/retainedTopicStorage";
import { BaseMapStorage } from "./config/baseMapStorage";
import { DeviceLogStorage } from "./config/deviceLogStorage";
import { LiveHub } from "./domain/liveHub";
import { MqttBridge } from "./domain/mqttBridge";
import { MmwaveService } from "./domain/mmwaveService";
import { HaClient } from "./ha/client";
import { HaEventBridge } from "./ha/eventBridge";
import { logger } from "./logger";
import { createServer } from "./server";

const start = async () => {
  const config = loadConfig();
  migrateLegacyDeviceData({
    legacyDataDir: config.legacyDataDir,
    deviceDataDir: config.deviceDataDir,
    logger,
  });
  const haClient = config.ha ? new HaClient(config.ha) : null;
  const storage = new DeviceStorage(config.deviceDataDir);
  const retainedTopicStorage = new RetainedTopicStorage(config.deviceDataDir);
  const deviceLogStorage = new DeviceLogStorage(config.deviceDataDir);
  const baseMapStorage = new BaseMapStorage(config.userBaseMapDir);
  const liveHub = new LiveHub(logger);
  let service: MmwaveService;
  const mqttBridge = new MqttBridge(config.mqtt, logger, {
    onTrajectorySnapshot: (deviceId, snapshot) => {
      if (service.handleTrajectorySnapshot(deviceId, snapshot)) {
        liveHub.notifyOverview();
        liveHub.notifyDevice(deviceId);
      }
    },
    onTagEventSnapshot: async (deviceId, snapshot) => {
      const result = await service.handleTagEventSnapshot(deviceId, snapshot);
      if (result.updated) {
        liveHub.notifyOverview();
        liveHub.notifyDevice(deviceId);
      }
      if (result.entry) {
        liveHub.notifyDeviceLog(deviceId, result.entry, result.persisted === true);
      }
    },
    onMultiTagConfigResult: (deviceId, snapshot) => {
      service.handleMultiTagConfigResult(deviceId, snapshot);
    },
    onConfigFileRangeResult: (deviceId, snapshot) => {
      service.handleConfigFileRangeResult(deviceId, snapshot);
    },
    onLearnedTrajectoryRangeState: (deviceId, snapshot) => {
      service.handleLearnedTrajectoryRangeState(deviceId, snapshot);
    },
    onLearnedTrajectoryRangeSetResult: (deviceId, snapshot) => {
      service.handleLearnedTrajectoryRangeSetResult(deviceId, snapshot);
    },
    onLearnedTrajectoryRangeQueryResult: (deviceId, snapshot) => {
      service.handleLearnedTrajectoryRangeQueryResult(deviceId, snapshot);
    },
    onMqttRouteDiscovered: (deviceId, route) => {
      service.handleMqttRouteDiscovered(deviceId, route);
    },
    onConnected: () => {
      logger.warn("MQTT connected: clear tombstones and republish retained map states");
      service.flushPendingRetainedTopicClears();
      service.republishAllRetainedMapStates();
    },
  });
  service = new MmwaveService(
    haClient,
    storage,
    mqttBridge,
    logger,
    deviceLogStorage,
    baseMapStorage,
    retainedTopicStorage,
  );
  service.setLiveNotifier((deviceId) => {
    liveHub.notifyDevice(deviceId);
  });
  deviceLogStorage.startRetentionScheduler(
    () => storage.listDevices(),
    (error) => logger.error({ error }, "Failed to clean device logs at midnight"),
  );
  const haEventBridge = config.ha && haClient
    ? new HaEventBridge(config.ha, haClient, logger, {
        getDevices: () => storage.listDevices(),
        onDeviceStateChanged: (deviceId) => {
          liveHub.notifyOverview();
          liveHub.notifyDevice(deviceId);
        },
      })
    : null;
  mqttBridge.start();
  mqttBridge.setDevices(storage.listDevices());
  haEventBridge?.start();

  const app = createServer(config, { service });
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/api/live/ws" });

  wss.on("connection", (ws: WebSocket) => {
    liveHub.attach(ws);
  });

  httpServer.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        frontendDist: config.frontendDist,
        deviceDataDir: config.deviceDataDir,
        userBaseMapDir: config.userBaseMapDir,
        legacyDataDir: config.legacyDataDir,
        haLinked: Boolean(config.ha),
        mqttConfigured: Boolean(config.mqtt),
      },
      "DFRobot mmWave backend started",
    );
  });

  const shutdown = () => {
    deviceLogStorage.stopRetentionScheduler();
    haEventBridge?.stop();
    httpServer.close();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
};

start().catch((error) => {
  logger.error({ error }, "Failed to start server");
  process.exit(1);
});
