"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttBridge = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const trajectory_1 = require("./trajectory");
class MqttBridge {
    constructor(config, logger, onSnapshot) {
        this.config = config;
        this.logger = logger;
        this.onSnapshot = onSnapshot;
        this.client = null;
        this.snapshots = new Map();
        this.subscriptions = new Set();
        this.connected = false;
        this.devices = [];
    }
    start() {
        if (!this.config || this.client) {
            return;
        }
        const auth = this.config.username || this.config.password
            ? `${encodeURIComponent(this.config.username ?? "")}:${encodeURIComponent(this.config.password ?? "")}@`
            : "";
        const url = `mqtt://${auth}${this.config.host}:${this.config.port}`;
        this.client = mqtt_1.default.connect(url, {
            clientId: this.config.clientId,
            reconnectPeriod: 5000,
            username: this.config.username,
            password: this.config.password,
        });
        this.client.on("connect", () => {
            this.connected = true;
            this.logger.info({ host: this.config?.host, port: this.config?.port }, "MQTT bridge connected");
            this.syncSubscriptions();
        });
        this.client.on("close", () => {
            this.connected = false;
        });
        this.client.on("error", (error) => {
            this.logger.warn({ error }, "MQTT bridge error");
        });
        this.client.on("message", (topic, payload) => {
            const snapshot = (0, trajectory_1.parseTrajectorySnapshot)(topic, payload.toString("utf8"));
            if (!snapshot) {
                return;
            }
            const device = this.devices.find((entry) => entry.mqttTopicPrefix === snapshot.topicPrefix && entry.mqttKey === snapshot.mqttKey);
            if (!device) {
                return;
            }
            this.snapshots.set(device.id, snapshot);
            this.onSnapshot?.(device.id, snapshot);
        });
    }
    setDevices(devices) {
        this.devices = devices;
        this.syncSubscriptions();
    }
    getSnapshot(deviceId) {
        return this.snapshots.get(deviceId) ?? null;
    }
    isConnected() {
        return this.connected;
    }
    isConfigured() {
        return Boolean(this.config);
    }
    syncSubscriptions() {
        if (!this.connected || !this.client) {
            return;
        }
        for (const device of this.devices) {
            const topic = `${device.mqttTopicPrefix}/dfrobot_c4004/${device.mqttKey}/state/target_trajectory`;
            if (this.subscriptions.has(topic)) {
                continue;
            }
            this.client.subscribe(topic, { qos: 1 }, (error) => {
                if (error) {
                    this.logger.warn({ error, topic }, "MQTT subscribe failed");
                    return;
                }
                this.subscriptions.add(topic);
            });
        }
    }
}
exports.MqttBridge = MqttBridge;
