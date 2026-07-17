"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MqttBridge = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const registry_1 = require("./profiles/registry");
const tagEvent_1 = require("./tagEvent");
const trajectory_1 = require("./trajectory");
const parseBridgeTopic = (topic) => {
    const marker = "/dfrobot_c4004/";
    const markerIndex = topic.indexOf(marker);
    if (markerIndex <= 0) {
        return null;
    }
    const topicPrefix = topic.slice(0, markerIndex);
    const remainder = topic.slice(markerIndex + marker.length);
    const [mqttKey, ...rest] = remainder.split("/");
    if (!topicPrefix || !mqttKey || !rest.length) {
        return null;
    }
    return {
        topicPrefix,
        mqttKey,
        suffix: rest.join("/"),
    };
};
const parseMultiTagConfigResult = (topic, payload) => {
    try {
        const parsed = JSON.parse(payload);
        if (!parsed || typeof parsed.ok !== "boolean") {
            return null;
        }
        const route = parseBridgeTopic(topic);
        if (!route) {
            return null;
        }
        return {
            topic,
            topicPrefix: route.topicPrefix,
            mqttKey: route.mqttKey,
            requestId: typeof parsed.request_id === "string" ? parsed.request_id : undefined,
            ok: parsed.ok,
            error: typeof parsed.error === "string" ? parsed.error : undefined,
            tagCount: typeof parsed.tag_count === "number" ? parsed.tag_count : undefined,
            hex: typeof parsed.hex === "string" ? parsed.hex : undefined,
            receivedAt: new Date().toISOString(),
        };
    }
    catch {
        return null;
    }
};
const parseConfigFileRangeResult = (topic, payload) => {
    try {
        const parsed = JSON.parse(payload);
        if (!parsed || typeof parsed.ok !== "boolean") {
            return null;
        }
        const route = parseBridgeTopic(topic);
        if (!route) {
            return null;
        }
        return {
            topic,
            topicPrefix: route.topicPrefix,
            mqttKey: route.mqttKey,
            requestId: typeof parsed.request_id === "string" ? parsed.request_id : undefined,
            ok: parsed.ok,
            error: typeof parsed.error === "string" ? parsed.error : undefined,
            pointCount: typeof parsed.point_count === "number" ? parsed.point_count : undefined,
            hex: typeof parsed.hex === "string" ? parsed.hex : undefined,
            receivedAt: new Date().toISOString(),
        };
    }
    catch {
        return null;
    }
};
const parseLearnedTrajectoryRangeState = (topic, payload) => {
    try {
        const parsed = JSON.parse(payload);
        const route = parseBridgeTopic(topic);
        if (!route || typeof parsed.learning_enabled !== "boolean" || typeof parsed.point_count !== "number") {
            return null;
        }
        return {
            topic,
            topicPrefix: route.topicPrefix,
            mqttKey: route.mqttKey,
            learningEnabled: parsed.learning_enabled,
            pointCount: parsed.point_count,
            hex: typeof parsed.hex === "string" ? parsed.hex : undefined,
            receivedAt: new Date().toISOString(),
        };
    }
    catch {
        return null;
    }
};
const parseLearnedTrajectoryRangeResult = (topic, payload) => {
    try {
        const parsed = JSON.parse(payload);
        const route = parseBridgeTopic(topic);
        if (!route || typeof parsed.ok !== "boolean") {
            return null;
        }
        return {
            topic,
            topicPrefix: route.topicPrefix,
            mqttKey: route.mqttKey,
            requestId: typeof parsed.request_id === "string" ? parsed.request_id : undefined,
            ok: parsed.ok,
            learningEnabled: typeof parsed.learning_enabled === "boolean" ? parsed.learning_enabled : undefined,
            pointCount: typeof parsed.point_count === "number" ? parsed.point_count : undefined,
            hex: typeof parsed.hex === "string" ? parsed.hex : undefined,
            error: typeof parsed.error === "string" ? parsed.error : undefined,
            receivedAt: new Date().toISOString(),
        };
    }
    catch {
        return null;
    }
};
class MqttBridge {
    constructor(config, logger, handlers = {}) {
        this.config = config;
        this.logger = logger;
        this.handlers = handlers;
        this.client = null;
        this.subscriptions = new Set();
        this.connected = false;
        this.devices = [];
    }
    start() {
        if (!this.config) {
            this.logger.warn("MQTT bridge is not configured; live tag events and device logs are disabled");
            return;
        }
        if (this.client) {
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
            const raw = payload.toString("utf8");
            const route = parseBridgeTopic(topic);
            const trajectory = (0, trajectory_1.parseTrajectorySnapshot)(topic, raw);
            if (trajectory) {
                const device = this.findDeviceByRoute(trajectory.topicPrefix, trajectory.mqttKey);
                if (device) {
                    this.handlers.onTrajectorySnapshot?.(device.id, trajectory);
                }
                return;
            }
            const tagEvent = (0, tagEvent_1.parseTagEventSnapshot)(topic, raw);
            if (tagEvent) {
                const device = this.findDeviceByRoute(tagEvent.topicPrefix, tagEvent.mqttKey);
                if (device) {
                    this.logger.debug({
                        deviceId: device.id,
                        topic,
                        tagIndex: tagEvent.tagIndex,
                        tagType: tagEvent.tagType,
                    }, "MQTT tag event received");
                    this.handlers.onTagEventSnapshot?.(device.id, tagEvent);
                }
                else {
                    this.logger.warn({
                        topic,
                        topicPrefix: tagEvent.topicPrefix,
                        mqttKey: tagEvent.mqttKey,
                        tagIndex: tagEvent.tagIndex,
                    }, "MQTT tag event has no matching device route");
                }
                return;
            }
            if (route?.suffix === "state/tag_event") {
                this.logger.warn({ topic, payload: raw.slice(0, 1000) }, "MQTT tag event payload was rejected");
                return;
            }
            if (route?.suffix === "result/multi_tag_config/set") {
                const result = parseMultiTagConfigResult(topic, raw);
                if (!result) {
                    return;
                }
                const device = this.findDeviceByRoute(result.topicPrefix, result.mqttKey);
                if (device) {
                    this.handlers.onMultiTagConfigResult?.(device.id, result);
                }
            }
            if (route?.suffix === "result/config_file_range/set") {
                const result = parseConfigFileRangeResult(topic, raw);
                if (!result) {
                    return;
                }
                const device = this.findDeviceByRoute(result.topicPrefix, result.mqttKey);
                if (device) {
                    this.handlers.onConfigFileRangeResult?.(device.id, result);
                }
            }
            if (route?.suffix === "state/learned_trajectory_range") {
                const snapshot = parseLearnedTrajectoryRangeState(topic, raw);
                const device = snapshot ? this.findDeviceByRoute(snapshot.topicPrefix, snapshot.mqttKey) : undefined;
                if (snapshot && device) {
                    this.handlers.onLearnedTrajectoryRangeState?.(device.id, snapshot);
                }
                return;
            }
            if (route?.suffix === "result/learned_trajectory_range/set" || route?.suffix === "result/learned_trajectory_range/query") {
                const snapshot = parseLearnedTrajectoryRangeResult(topic, raw);
                const device = snapshot ? this.findDeviceByRoute(snapshot.topicPrefix, snapshot.mqttKey) : undefined;
                if (snapshot && device) {
                    if (route.suffix.endsWith("/set")) {
                        this.handlers.onLearnedTrajectoryRangeSetResult?.(device.id, snapshot);
                    }
                    else {
                        this.handlers.onLearnedTrajectoryRangeQueryResult?.(device.id, snapshot);
                    }
                }
                return;
            }
        });
    }
    setDevices(devices) {
        this.devices = devices;
        this.logger.info({
            devices: devices.map((device) => ({
                deviceId: device.id,
                topicPrefix: device.mqttTopicPrefix,
                mqttKey: device.mqttKey,
            })),
        }, "MQTT bridge device routes updated");
        this.syncSubscriptions();
    }
    isConnected() {
        return this.connected;
    }
    isConfigured() {
        return Boolean(this.config);
    }
    publishJson(topic, payload, qos = 1, retain = false) {
        if (!this.client || !this.connected) {
            return false;
        }
        this.client.publish(topic, JSON.stringify(payload), { qos, retain });
        return true;
    }
    publishMultiTagConfigCommand(device, payload) {
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        const topic = profile?.mqttTopics.multiTagConfigCommandTopic
            ? this.buildTopic(device, profile.mqttTopics.multiTagConfigCommandTopic)
            : null;
        if (!topic) {
            return false;
        }
        return this.publishJson(topic, {
            schema: 1,
            type: "multi_tag_config",
            device_topic_prefix: device.mqttTopicPrefix,
            mqtt_key: device.mqttKey,
            request_id: payload.request_id,
            hex: payload.hex,
        }, 1, false);
    }
    publishConfigFileRangeCommand(device, payload) {
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        const topic = profile?.mqttTopics.configFileRangeCommandTopic
            ? this.buildTopic(device, profile.mqttTopics.configFileRangeCommandTopic)
            : null;
        if (!topic) {
            return false;
        }
        return this.publishJson(topic, {
            schema: 1,
            type: "config_file_range",
            device_topic_prefix: device.mqttTopicPrefix,
            mqtt_key: device.mqttKey,
            request_id: payload.request_id,
            hex: payload.hex,
        }, 1, false);
    }
    publishLearnedTrajectoryRangeSetCommand(device, payload) {
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        const suffix = profile?.mqttTopics.learnedTrajectoryRangeSetCommandTopic;
        const topic = suffix ? this.buildTopic(device, suffix) : null;
        return topic
            ? this.publishJson(topic, {
                schema: 1,
                type: "learned_trajectory_range",
                device_topic_prefix: device.mqttTopicPrefix,
                mqtt_key: device.mqttKey,
                request_id: payload.request_id,
                learning_enabled: payload.learning_enabled,
            }, 1, false)
            : false;
    }
    publishLearnedTrajectoryRangeQueryCommand(device, payload) {
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        const suffix = profile?.mqttTopics.learnedTrajectoryRangeQueryCommandTopic;
        const topic = suffix ? this.buildTopic(device, suffix) : null;
        return topic
            ? this.publishJson(topic, {
                schema: 1,
                type: "learned_trajectory_range_query",
                device_topic_prefix: device.mqttTopicPrefix,
                mqtt_key: device.mqttKey,
                request_id: payload.request_id,
            }, 1, false)
            : false;
    }
    findDeviceByRoute(topicPrefix, mqttKey) {
        return this.devices.find((entry) => entry.mqttTopicPrefix === topicPrefix && entry.mqttKey === mqttKey);
    }
    buildTopic(device, suffix) {
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        if (!profile?.mqttTopics.component) {
            return null;
        }
        return `${device.mqttTopicPrefix}/${profile.mqttTopics.component}/${device.mqttKey}/${suffix}`;
    }
    syncSubscriptions() {
        if (!this.connected || !this.client) {
            return;
        }
        for (const device of this.devices) {
            const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
            if (!profile) {
                continue;
            }
            const topics = [
                profile.mqttTopics.trajectoryStateTopic,
                profile.mqttTopics.tagEventStateTopic,
                profile.mqttTopics.multiTagConfigResultTopic,
                profile.mqttTopics.configFileRangeResultTopic,
                profile.mqttTopics.learnedTrajectoryRangeStateTopic,
                profile.mqttTopics.learnedTrajectoryRangeSetResultTopic,
                profile.mqttTopics.learnedTrajectoryRangeQueryResultTopic,
            ];
            for (const suffix of topics) {
                if (!suffix) {
                    continue;
                }
                const topic = this.buildTopic(device, suffix);
                if (!topic || this.subscriptions.has(topic)) {
                    continue;
                }
                this.client.subscribe(topic, { qos: 1 }, (error) => {
                    if (error) {
                        this.logger.warn({ error, topic }, "MQTT subscribe failed");
                        return;
                    }
                    this.subscriptions.add(topic);
                    this.logger.info({ topic }, "MQTT bridge subscription active");
                });
            }
        }
    }
}
exports.MqttBridge = MqttBridge;
