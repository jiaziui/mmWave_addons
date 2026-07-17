"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const config_1 = require("./config");
const storage_1 = require("./config/storage");
const deviceLogStorage_1 = require("./config/deviceLogStorage");
const liveHub_1 = require("./domain/liveHub");
const mqttBridge_1 = require("./domain/mqttBridge");
const mmwaveService_1 = require("./domain/mmwaveService");
const client_1 = require("./ha/client");
const eventBridge_1 = require("./ha/eventBridge");
const logger_1 = require("./logger");
const server_1 = require("./server");
const start = async () => {
    const config = (0, config_1.loadConfig)();
    const haClient = config.ha ? new client_1.HaClient(config.ha) : null;
    const storage = new storage_1.DeviceStorage(config.dataDir);
    const deviceLogStorage = new deviceLogStorage_1.DeviceLogStorage(config.dataDir);
    const liveHub = new liveHub_1.LiveHub(logger_1.logger);
    let service;
    const mqttBridge = new mqttBridge_1.MqttBridge(config.mqtt, logger_1.logger, {
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
    });
    service = new mmwaveService_1.MmwaveService(haClient, storage, mqttBridge, logger_1.logger, deviceLogStorage);
    service.setLiveNotifier((deviceId) => {
        liveHub.notifyDevice(deviceId);
    });
    deviceLogStorage.startRetentionScheduler(() => storage.listDevices(), (error) => logger_1.logger.error({ error }, "Failed to clean device logs at midnight"));
    const haEventBridge = config.ha && haClient
        ? new eventBridge_1.HaEventBridge(config.ha, haClient, logger_1.logger, {
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
    const app = (0, server_1.createServer)(config, { service });
    const httpServer = http_1.default.createServer(app);
    const wss = new ws_1.WebSocketServer({ server: httpServer, path: "/api/live/ws" });
    wss.on("connection", (ws) => {
        liveHub.attach(ws);
    });
    httpServer.listen(config.port, () => {
        logger_1.logger.info({
            port: config.port,
            frontendDist: config.frontendDist,
            dataDir: config.dataDir,
            haLinked: Boolean(config.ha),
            mqttConfigured: Boolean(config.mqtt),
        }, "DFRobot mmWave backend started");
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
    logger_1.logger.error({ error }, "Failed to start server");
    process.exit(1);
});
