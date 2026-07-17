import mqtt, { MqttClient } from "mqtt";
import type { Logger } from "pino";
import type { MqttConfig } from "../config";
import type { StoredMmwaveDevice } from "../config/storage";
import { getMmwaveProfile } from "./profiles/registry";
import { parseTagEventSnapshot, type TagEventSnapshot } from "./tagEvent";
import { parseTrajectorySnapshot } from "./trajectory";
import type { TrajectorySnapshot } from "../types/mmwave";

export interface MultiTagConfigResultSnapshot {
  topic: string;
  topicPrefix: string;
  mqttKey: string;
  requestId?: string;
  ok: boolean;
  error?: string;
  tagCount?: number;
  hex?: string;
  receivedAt: string;
}

export interface ConfigFileRangeResultSnapshot {
  topic: string;
  topicPrefix: string;
  mqttKey: string;
  requestId?: string;
  ok: boolean;
  error?: string;
  pointCount?: number;
  hex?: string;
  receivedAt: string;
}

export interface LearnedTrajectoryRangeSnapshot {
  topic: string;
  topicPrefix: string;
  mqttKey: string;
  learningEnabled: boolean;
  pointCount: number;
  hex?: string;
  receivedAt: string;
}

export interface LearnedTrajectoryRangeResultSnapshot {
  topic: string;
  topicPrefix: string;
  mqttKey: string;
  requestId?: string;
  ok: boolean;
  learningEnabled?: boolean;
  pointCount?: number;
  hex?: string;
  error?: string;
  receivedAt: string;
}

export interface MqttBridgeHandlers {
  onTrajectorySnapshot?: (deviceId: string, snapshot: TrajectorySnapshot) => void;
  onTagEventSnapshot?: (deviceId: string, snapshot: TagEventSnapshot) => void | Promise<void>;
  onMultiTagConfigResult?: (deviceId: string, snapshot: MultiTagConfigResultSnapshot) => void;
  onConfigFileRangeResult?: (deviceId: string, snapshot: ConfigFileRangeResultSnapshot) => void;
  onLearnedTrajectoryRangeState?: (deviceId: string, snapshot: LearnedTrajectoryRangeSnapshot) => void;
  onLearnedTrajectoryRangeSetResult?: (deviceId: string, snapshot: LearnedTrajectoryRangeResultSnapshot) => void;
  onLearnedTrajectoryRangeQueryResult?: (deviceId: string, snapshot: LearnedTrajectoryRangeResultSnapshot) => void;
}

const parseBridgeTopic = (
  topic: string,
): { topicPrefix: string; mqttKey: string; suffix: string } | null => {
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

const parseMultiTagConfigResult = (topic: string, payload: string): MultiTagConfigResultSnapshot | null => {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
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
  } catch {
    return null;
  }
};

const parseConfigFileRangeResult = (topic: string, payload: string): ConfigFileRangeResultSnapshot | null => {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
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
  } catch {
    return null;
  }
};

const parseLearnedTrajectoryRangeState = (topic: string, payload: string): LearnedTrajectoryRangeSnapshot | null => {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
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
  } catch {
    return null;
  }
};

const parseLearnedTrajectoryRangeResult = (topic: string, payload: string): LearnedTrajectoryRangeResultSnapshot | null => {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
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
  } catch {
    return null;
  }
};

export class MqttBridge {
  private client: MqttClient | null = null;
  private readonly subscriptions = new Set<string>();
  private connected = false;
  private devices: StoredMmwaveDevice[] = [];

  constructor(
    private readonly config: MqttConfig | null,
    private readonly logger: Logger,
    private readonly handlers: MqttBridgeHandlers = {},
  ) {}

  start(): void {
    if (!this.config) {
      this.logger.warn("MQTT bridge is not configured; live tag events and device logs are disabled");
      return;
    }
    if (this.client) {
      return;
    }

    const auth =
      this.config.username || this.config.password
        ? `${encodeURIComponent(this.config.username ?? "")}:${encodeURIComponent(this.config.password ?? "")}@`
        : "";
    const url = `mqtt://${auth}${this.config.host}:${this.config.port}`;
    this.client = mqtt.connect(url, {
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

      const trajectory = parseTrajectorySnapshot(topic, raw);
      if (trajectory) {
        const device = this.findDeviceByRoute(trajectory.topicPrefix, trajectory.mqttKey);
        if (device) {
          this.handlers.onTrajectorySnapshot?.(device.id, trajectory);
        }
        return;
      }

      const tagEvent = parseTagEventSnapshot(topic, raw);
      if (tagEvent) {
        const device = this.findDeviceByRoute(tagEvent.topicPrefix, tagEvent.mqttKey);
        if (device) {
          this.logger.debug(
            {
              deviceId: device.id,
              topic,
              tagIndex: tagEvent.tagIndex,
              tagType: tagEvent.tagType,
            },
            "MQTT tag event received",
          );
          this.handlers.onTagEventSnapshot?.(device.id, tagEvent);
        } else {
          this.logger.warn(
            {
              topic,
              topicPrefix: tagEvent.topicPrefix,
              mqttKey: tagEvent.mqttKey,
              tagIndex: tagEvent.tagIndex,
            },
            "MQTT tag event has no matching device route",
          );
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
          } else {
            this.handlers.onLearnedTrajectoryRangeQueryResult?.(device.id, snapshot);
          }
        }
        return;
      }
    });
  }

  setDevices(devices: StoredMmwaveDevice[]): void {
    this.devices = devices;
    this.logger.info(
      {
        devices: devices.map((device) => ({
          deviceId: device.id,
          topicPrefix: device.mqttTopicPrefix,
          mqttKey: device.mqttKey,
        })),
      },
      "MQTT bridge device routes updated",
    );
    this.syncSubscriptions();
  }

  isConnected(): boolean {
    return this.connected;
  }

  isConfigured(): boolean {
    return Boolean(this.config);
  }

  publishJson(topic: string, payload: unknown, qos: 0 | 1 | 2 = 1, retain = false): boolean {
    if (!this.client || !this.connected) {
      return false;
    }
    this.client.publish(topic, JSON.stringify(payload), { qos, retain });
    return true;
  }

  publishMultiTagConfigCommand(
    device: StoredMmwaveDevice,
    payload: { request_id: string; hex: string },
  ): boolean {
    const profile = getMmwaveProfile(device.profileId);
    const topic = profile?.mqttTopics.multiTagConfigCommandTopic
      ? this.buildTopic(device, profile.mqttTopics.multiTagConfigCommandTopic)
      : null;
    if (!topic) {
      return false;
    }
    return this.publishJson(
      topic,
      {
        schema: 1,
        type: "multi_tag_config",
        device_topic_prefix: device.mqttTopicPrefix,
        mqtt_key: device.mqttKey,
        request_id: payload.request_id,
        hex: payload.hex,
      },
      1,
      false,
    );
  }

  publishConfigFileRangeCommand(
    device: StoredMmwaveDevice,
    payload: { request_id: string; hex: string },
  ): boolean {
    const profile = getMmwaveProfile(device.profileId);
    const topic = profile?.mqttTopics.configFileRangeCommandTopic
      ? this.buildTopic(device, profile.mqttTopics.configFileRangeCommandTopic)
      : null;
    if (!topic) {
      return false;
    }
    return this.publishJson(
      topic,
      {
        schema: 1,
        type: "config_file_range",
        device_topic_prefix: device.mqttTopicPrefix,
        mqtt_key: device.mqttKey,
        request_id: payload.request_id,
        hex: payload.hex,
      },
      1,
      false,
    );
  }

  publishLearnedTrajectoryRangeSetCommand(
    device: StoredMmwaveDevice,
    payload: { request_id: string; learning_enabled: boolean },
  ): boolean {
    const profile = getMmwaveProfile(device.profileId);
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

  publishLearnedTrajectoryRangeQueryCommand(
    device: StoredMmwaveDevice,
    payload: { request_id: string },
  ): boolean {
    const profile = getMmwaveProfile(device.profileId);
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

  private findDeviceByRoute(topicPrefix: string, mqttKey: string): StoredMmwaveDevice | undefined {
    return this.devices.find(
      (entry) => entry.mqttTopicPrefix === topicPrefix && entry.mqttKey === mqttKey,
    );
  }

  private buildTopic(device: StoredMmwaveDevice, suffix: string): string | null {
    const profile = getMmwaveProfile(device.profileId);
    if (!profile?.mqttTopics.component) {
      return null;
    }
    return `${device.mqttTopicPrefix}/${profile.mqttTopics.component}/${device.mqttKey}/${suffix}`;
  }

  private syncSubscriptions(): void {
    if (!this.connected || !this.client) {
      return;
    }

    for (const device of this.devices) {
      const profile = getMmwaveProfile(device.profileId);
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
