import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { loadConfig } from "./config";
import { DeviceStorage } from "./config/storage";
import { MqttBridge } from "./domain/mqttBridge";
import { MmwaveService } from "./domain/mmwaveService";
import { HaClient } from "./ha/client";
import { logger } from "./logger";
import { createServer } from "./server";

type LiveSubscription =
  | { scope: "overview" }
  | { scope: "device"; deviceId: string };

const start = async () => {
  const config = loadConfig();
  const haClient = config.ha ? new HaClient(config.ha) : null;
  const storage = new DeviceStorage(config.dataDir);
  let service: MmwaveService;
  const mqttBridge = new MqttBridge(config.mqtt, logger, (deviceId, snapshot) => {
    service.handleTrajectorySnapshot(deviceId, snapshot);
  });
  service = new MmwaveService(haClient, storage, mqttBridge, logger);
  mqttBridge.start();
  mqttBridge.setDevices(storage.listDevices());

  const app = createServer(config, { service });
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/api/live/ws" });

  wss.on("connection", (ws: WebSocket) => {
    let timer: NodeJS.Timeout | null = null;
    let subscription: LiveSubscription | null = null;

    const publish = async () => {
      if (ws.readyState !== WebSocket.OPEN || !subscription) {
        return;
      }
      try {
        if (subscription.scope === "overview") {
          ws.send(JSON.stringify({ type: "overview", payload: await service.getOverview() }));
          return;
        }
        ws.send(JSON.stringify({ type: "detail", payload: await service.getDeviceDetail(subscription.deviceId) }));
      } catch (error) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Failed to publish live state",
          }),
        );
      }
    };

    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as {
          type?: string;
          scope?: "overview";
          deviceId?: string;
        };

        if (message.type !== "subscribe") {
          ws.send(JSON.stringify({ type: "error", error: "Invalid message type" }));
          return;
        }

        subscription =
          message.scope === "overview"
            ? { scope: "overview" }
            : message.deviceId
              ? { scope: "device", deviceId: message.deviceId }
              : null;

        if (!subscription) {
          ws.send(JSON.stringify({ type: "error", error: "Missing subscription target" }));
          return;
        }

        ws.send(JSON.stringify({ type: "subscribed", scope: subscription.scope }));
        void publish();

        if (!timer) {
          timer = setInterval(() => {
            void publish();
          }, 2000);
        }
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "Invalid message" }));
      }
    });

    ws.on("close", () => {
      if (timer) {
        clearInterval(timer);
      }
    });
  });

  httpServer.listen(config.port, () => {
    logger.info(
      {
        port: config.port,
        frontendDist: config.frontendDist,
        dataDir: config.dataDir,
        haLinked: Boolean(config.ha),
        mqttConfigured: Boolean(config.mqtt),
      },
      "DFRobot mmWave backend started",
    );
  });
};

start().catch((error) => {
  logger.error({ error }, "Failed to start server");
  process.exit(1);
});
