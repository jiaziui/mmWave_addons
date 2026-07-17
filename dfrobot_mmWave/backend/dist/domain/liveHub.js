"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveHub = void 0;
const ws_1 = require("ws");
class LiveHub {
    constructor(logger) {
        this.logger = logger;
        this.subscriptions = new Map();
    }
    attach(ws) {
        ws.on("message", (raw) => {
            this.handleMessage(ws, raw.toString("utf8"));
        });
        ws.on("close", () => {
            this.subscriptions.delete(ws);
        });
        ws.on("error", () => {
            this.subscriptions.delete(ws);
        });
    }
    notifyOverview() {
        this.broadcast({ type: "refresh", scope: "overview" });
    }
    notifyDevice(deviceId) {
        this.broadcast({ type: "refresh", scope: "device", deviceId });
    }
    notifyDeviceLog(deviceId, entry, persisted) {
        this.broadcast({ type: "log_event", scope: "device", deviceId, entry, persisted });
    }
    handleMessage(ws, raw) {
        try {
            const message = JSON.parse(raw);
            if (message.type !== "subscribe") {
                this.send(ws, { type: "error", error: "Invalid message type" });
                return;
            }
            const subscription = message.scope === "overview"
                ? { scope: "overview" }
                : message.deviceId
                    ? { scope: "device", deviceId: message.deviceId }
                    : null;
            if (!subscription) {
                this.send(ws, { type: "error", error: "Missing subscription target" });
                return;
            }
            this.subscriptions.set(ws, subscription);
            this.send(ws, { type: "subscribed", scope: subscription.scope });
        }
        catch {
            this.send(ws, { type: "error", error: "Invalid message" });
        }
    }
    broadcast(message) {
        for (const [ws, subscription] of this.subscriptions) {
            if (message.type === "refresh" || message.type === "log_event") {
                if (message.scope === "overview" && subscription.scope !== "overview") {
                    continue;
                }
                if (message.scope === "device" && (subscription.scope !== "device" || subscription.deviceId !== message.deviceId)) {
                    continue;
                }
            }
            this.send(ws, message);
        }
    }
    send(ws, message) {
        if (ws.readyState !== ws_1.WebSocket.OPEN) {
            this.subscriptions.delete(ws);
            return;
        }
        try {
            ws.send(JSON.stringify(message));
        }
        catch (error) {
            this.subscriptions.delete(ws);
            this.logger.warn({ error }, "Failed to send live websocket message");
        }
    }
}
exports.LiveHub = LiveHub;
