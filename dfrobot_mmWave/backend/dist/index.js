"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const config_1 = require("./config");
const storage_1 = require("./config/storage");
const mqttBridge_1 = require("./domain/mqttBridge");
const mmwaveService_1 = require("./domain/mmwaveService");
const client_1 = require("./ha/client");
const logger_1 = require("./logger");
const server_1 = require("./server");
const start = async () => {
    const config = (0, config_1.loadConfig)();
    const haClient = config.ha ? new client_1.HaClient(config.ha) : null;
    const storage = new storage_1.DeviceStorage(config.dataDir);
    let service;
    const mqttBridge = new mqttBridge_1.MqttBridge(config.mqtt, logger_1.logger, (deviceId, snapshot) => {
        service.handleTrajectorySnapshot(deviceId, snapshot);
    });
    service = new mmwaveService_1.MmwaveService(haClient, storage, mqttBridge, logger_1.logger);
    mqttBridge.start();
    mqttBridge.setDevices(storage.listDevices());
    const app = (0, server_1.createServer)(config, { service });
    const httpServer = http_1.default.createServer(app);
    const wss = new ws_1.WebSocketServer({ server: httpServer, path: "/api/live/ws" });
    wss.on("connection", (ws) => {
        let timer = null;
        let subscription = null;
        const publish = async () => {
            if (ws.readyState !== ws_1.WebSocket.OPEN || !subscription) {
                return;
            }
            try {
                if (subscription.scope === "overview") {
                    ws.send(JSON.stringify({ type: "overview", payload: await service.getOverview() }));
                    return;
                }
                ws.send(JSON.stringify({ type: "detail", payload: await service.getDeviceDetail(subscription.deviceId) }));
            }
            catch (error) {
                ws.send(JSON.stringify({
                    type: "error",
                    error: error instanceof Error ? error.message : "Failed to publish live state",
                }));
            }
        };
        ws.on("message", (raw) => {
            try {
                const message = JSON.parse(raw.toString());
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
            }
            catch {
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
        logger_1.logger.info({
            port: config.port,
            frontendDist: config.frontendDist,
            dataDir: config.dataDir,
            haLinked: Boolean(config.ha),
            mqttConfigured: Boolean(config.mqtt),
        }, "DFRobot mmWave backend started");
    });
};
start().catch((error) => {
    logger_1.logger.error({ error }, "Failed to start server");
    process.exit(1);
});
