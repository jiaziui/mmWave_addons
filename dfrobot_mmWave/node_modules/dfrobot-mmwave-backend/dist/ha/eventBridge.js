"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HaEventBridge = exports.buildHaWebSocketUrl = void 0;
const ws_1 = require("ws");
const profileRuntime_1 = require("../domain/profiles/profileRuntime");
const RECONNECT_DELAY_MS = 5000;
const ROUTE_REFRESH_MS = 60000;
const SUBSCRIPTION_ID = 1;
const IO_STATE_KEYS = [
    "zone1Presence",
    "zone2Presence",
    "zone3Presence",
    "zone4Presence",
    "zone5Presence",
    "zone6Presence",
];
const buildHaWebSocketUrl = (config) => {
    const url = new URL(config.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const path = url.pathname.replace(/\/+$/, "");
    if (config.mode === "supervisor") {
        url.pathname = path.replace(/\/api$/, "/websocket");
    }
    else if (path.endsWith("/api")) {
        url.pathname = `${path}/websocket`;
    }
    else {
        url.pathname = `${path}/api/websocket`;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
};
exports.buildHaWebSocketUrl = buildHaWebSocketUrl;
const isIoStateEntity = (entityId) => IO_STATE_KEYS.some((key) => {
    const definition = (0, profileRuntime_1.getDefinition)(key);
    return definition ? (0, profileRuntime_1.matchesDefinition)(entityId, definition) : false;
});
class HaEventBridge {
    constructor(config, client, logger, callbacks) {
        this.config = config;
        this.client = client;
        this.logger = logger;
        this.callbacks = callbacks;
        this.socket = null;
        this.reconnectTimer = null;
        this.routeRefreshTimer = null;
        this.stopped = true;
        this.entityRoutes = new Map();
    }
    start() {
        if (!this.stopped) {
            return;
        }
        this.stopped = false;
        this.connect();
        this.routeRefreshTimer = setInterval(() => void this.refreshEntityRoutes(), ROUTE_REFRESH_MS);
    }
    stop() {
        this.stopped = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.routeRefreshTimer) {
            clearInterval(this.routeRefreshTimer);
            this.routeRefreshTimer = null;
        }
        this.socket?.close();
        this.socket = null;
    }
    connect() {
        if (this.stopped) {
            return;
        }
        const socket = new ws_1.WebSocket((0, exports.buildHaWebSocketUrl)(this.config));
        this.socket = socket;
        socket.on("message", (raw) => this.handleMessage(raw.toString("utf8")));
        socket.on("error", (error) => {
            this.logger.warn({ error }, "Home Assistant event websocket error");
        });
        socket.on("close", () => {
            if (this.socket === socket) {
                this.socket = null;
            }
            this.scheduleReconnect();
        });
    }
    handleMessage(raw) {
        let message;
        try {
            message = JSON.parse(raw);
        }
        catch {
            return;
        }
        if (message.type === "auth_required") {
            this.send({ type: "auth", access_token: this.config.token });
            return;
        }
        if (message.type === "auth_ok") {
            this.send({ id: SUBSCRIPTION_ID, type: "subscribe_events", event_type: "state_changed" });
            void this.refreshEntityRoutes();
            return;
        }
        if (message.type === "auth_invalid") {
            this.logger.error("Home Assistant event websocket authentication failed");
            this.socket?.close();
            return;
        }
        if (message.type === "result" && message.success === true) {
            this.logger.info("Home Assistant state_changed event subscription active");
            return;
        }
        if (message.type !== "event" || message.event?.event_type !== "state_changed") {
            return;
        }
        const entityId = message.event.data?.entity_id;
        if (!entityId || !isIoStateEntity(entityId)) {
            return;
        }
        const deviceId = this.entityRoutes.get(entityId);
        if (deviceId) {
            this.callbacks.onDeviceStateChanged(deviceId, entityId);
            return;
        }
        // A device may have been discovered or an entity renamed after startup.
        void this.refreshEntityRoutes().then(() => {
            const refreshedDeviceId = this.entityRoutes.get(entityId);
            if (refreshedDeviceId) {
                this.callbacks.onDeviceStateChanged(refreshedDeviceId, entityId);
            }
        });
    }
    async refreshEntityRoutes() {
        let entries;
        try {
            entries = await this.client.getEntityRegistry();
        }
        catch (error) {
            this.logger.warn({ error }, "Failed to refresh Home Assistant IO entity routes");
            return;
        }
        const nextRoutes = new Map();
        for (const device of this.callbacks.getDevices()) {
            for (const key of IO_STATE_KEYS) {
                const definition = (0, profileRuntime_1.getDefinition)(key);
                if (!definition) {
                    continue;
                }
                const entityId = (0, profileRuntime_1.resolveEntityId)(device, definition, entries);
                if (entries.some((entry) => entry.entity_id === entityId)) {
                    nextRoutes.set(entityId, device.id);
                }
            }
        }
        this.entityRoutes.clear();
        for (const [entityId, deviceId] of nextRoutes) {
            this.entityRoutes.set(entityId, deviceId);
        }
    }
    send(message) {
        if (this.socket?.readyState === ws_1.WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }
    scheduleReconnect() {
        if (this.stopped || this.reconnectTimer) {
            return;
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, RECONNECT_DELAY_MS);
    }
}
exports.HaEventBridge = HaEventBridge;
