import mqtt, { MqttClient } from "mqtt";
import type { Logger } from "pino";
import type { MqttConfig } from "../config";
import type { StoredMmwaveDevice } from "../config/storage";
import { getMmwaveProfile } from "./profiles/registry";
import { REGION_METADATA_TOPIC_SUFFIX } from "./regionMetadataBridge";
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
  onMqttRouteDiscovered?: (deviceId: string, route: { topicPrefix: string; mqttKey: string }) => void;
  /** Fired after MQTT (re)connect — use to republish retained layouts. */
  onConnected?: () => void;
}

const AUTO_DISCOVERY_STATE_TOPICS = [
  "state/target_trajectory",
  "state/tag_event",
  "state/multi_tag_config",
  "state/learned_trajectory_range",
  "state/config_file_range",
];

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
  private readonly recentMessages = new Map<string, number>();
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
      try {
        this.handlers.onConnected?.();
      } catch (error) {
        this.logger.warn({ error }, "MQTT onConnected handler failed");
      }
    });

    this.client.on("close", () => {
      this.connected = false;
    });

    this.client.on("error", (error) => {
      this.logger.warn({ error }, "MQTT bridge error");
    });

    this.client.on("message", (topic, payload) => {
      const raw = payload.toString("utf8");
      if (this.shouldSkipDuplicate(topic, raw)) {
        return;
      }
      const route = parseBridgeTopic(topic);

      const trajectory = parseTrajectorySnapshot(topic, raw);
      if (trajectory) {
        const device = this.resolveDeviceByRoute(trajectory.topicPrefix, trajectory.mqttKey);
        if (device) {
          this.handlers.onTrajectorySnapshot?.(device.id, trajectory);
        } else {
          this.logger.warn(
            {
              topic,
              topicPrefix: trajectory.topicPrefix,
              mqttKey: trajectory.mqttKey,
              knownRoutes: this.devices.map((entry) => ({
                deviceId: entry.id,
                topicPrefix: entry.mqttTopicPrefix,
                mqttKey: entry.mqttKey,
              })),
            },
            "MQTT trajectory has no matching device route",
          );
        }
        return;
      }

      const tagEvent = parseTagEventSnapshot(topic, raw);
      if (tagEvent) {
        const device = this.resolveDeviceByRoute(tagEvent.topicPrefix, tagEvent.mqttKey);
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
        const device = this.resolveDeviceByRoute(result.topicPrefix, result.mqttKey);
        if (device) {
          this.handlers.onMultiTagConfigResult?.(device.id, result);
        }
      }

      if (route?.suffix === "result/config_file_range/set") {
        const result = parseConfigFileRangeResult(topic, raw);
        if (!result) {
          return;
        }
        const device = this.resolveDeviceByRoute(result.topicPrefix, result.mqttKey);
        if (device) {
          this.handlers.onConfigFileRangeResult?.(device.id, result);
        }
      }

      if (route?.suffix === "state/learned_trajectory_range") {
        const snapshot = parseLearnedTrajectoryRangeState(topic, raw);
        const device = snapshot ? this.resolveDeviceByRoute(snapshot.topicPrefix, snapshot.mqttKey) : undefined;
        if (snapshot && device) {
          this.handlers.onLearnedTrajectoryRangeState?.(device.id, snapshot);
        }
        return;
      }

      if (route?.suffix === "result/learned_trajectory_range/set" || route?.suffix === "result/learned_trajectory_range/query") {
        const snapshot = parseLearnedTrajectoryRangeResult(topic, raw);
        const device = snapshot ? this.resolveDeviceByRoute(snapshot.topicPrefix, snapshot.mqttKey) : undefined;
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
      this.logger.warn(
        {
          topic,
          retain,
          hasClient: Boolean(this.client),
          connected: this.connected,
          configured: Boolean(this.config),
        },
        "MQTT publish skipped: bridge not connected",
      );
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

  /** Retained Addon detection range for HA mmwave_map card (local_only / config layer). */
  publishAddonDetectionRange(device: StoredMmwaveDevice, payload: unknown): boolean {
    const topic = this.buildTopic(device, "state/addon_detection_range");
    if (!topic) {
      this.logger.warn(
        {
          deviceId: device.id,
          mqttTopicPrefix: device.mqttTopicPrefix,
          mqttKey: device.mqttKey,
        },
        "addon_detection_range publish aborted: cannot build MQTT topic",
      );
      return false;
    }
    const ok = this.publishJson(topic, payload, 1, true);
    this.logger.warn(
      { deviceId: device.id, topic, published: ok },
      ok ? "addon_detection_range publish OK (retain=true)" : "addon_detection_range publish FAILED",
    );
    return ok;
  }

  /** Retained JSON layout for HA mmwave_map card (paths + geometry, no binary). */
  publishBaseMapLayout(device: StoredMmwaveDevice, payload: unknown): boolean {
    const profile = getMmwaveProfile(device.profileId);
    const topic = this.buildTopic(device, "state/base_map_layout");
    if (!topic) {
      this.logger.warn(
        {
          deviceId: device.id,
          profileId: device.profileId,
          mqttTopicPrefix: device.mqttTopicPrefix,
          mqttKey: device.mqttKey,
          hasProfile: Boolean(profile),
          component: profile?.mqttTopics.component ?? null,
        },
        "base_map_layout publish aborted: cannot build MQTT topic",
      );
      return false;
    }
    const body = JSON.stringify(payload);
    const layout = payload as {
      instances?: Array<{ id?: string; source_id?: string; image_url?: string }>;
      background_visible?: boolean;
    };
    const imageUrls = (layout.instances ?? []).map((item) => ({
      id: item.id ?? "",
      source_id: item.source_id ?? "",
      image_url: item.image_url || "(empty)",
    }));
    this.logger.warn(
      {
        deviceId: device.id,
        topic,
        mqttConnected: this.connected,
        mqttConfigured: Boolean(this.config),
        bytes: body.length,
        background_visible: layout.background_visible,
        imageUrls,
        preview: body.slice(0, 800),
      },
      "base_map_layout publishing (含 image_url 路径)",
    );
    const ok = this.publishJson(topic, payload, 1, true);
    this.logger.warn(
      { deviceId: device.id, topic, published: ok, imageUrls },
      ok ? "base_map_layout publish OK (retain=true)" : "base_map_layout publish FAILED",
    );
    return ok;
  }

  regionMetadataTopic(device: StoredMmwaveDevice): string | null {
    return this.buildTopic(device, REGION_METADATA_TOPIC_SUFFIX);
  }

  /** Retained Add-on-owned region names for HA mmwave_map. */
  publishRegionMetadata(device: StoredMmwaveDevice, payload: unknown): boolean {
    const topic = this.regionMetadataTopic(device);
    if (!topic) {
      this.logger.warn(
        {
          deviceId: device.id,
          mqttTopicPrefix: device.mqttTopicPrefix,
          mqttKey: device.mqttKey,
        },
        "region_metadata publish aborted: cannot build MQTT topic",
      );
      return false;
    }
    const ok = this.publishJson(topic, payload, 1, true);
    this.logger.warn(
      { deviceId: device.id, topic, published: ok },
      ok ? "region_metadata publish OK (qos=1 retain=true)" : "region_metadata publish FAILED",
    );
    return ok;
  }

  /** Clear one exact retained topic by publishing an empty retained payload. */
  clearRetainedTopic(topic: string): boolean {
    if (!topic || topic.includes("#") || topic.includes("+") || !this.client || !this.connected) {
      this.logger.warn(
        { topic, hasClient: Boolean(this.client), connected: this.connected },
        "retained MQTT topic clear deferred",
      );
      return false;
    }
    this.client.publish(topic, "", { qos: 1, retain: true });
    this.logger.warn({ topic }, "retained MQTT topic clear queued (qos=1 retain=true)");
    return true;
  }

  private findDeviceByRoute(topicPrefix: string, mqttKey: string): StoredMmwaveDevice | undefined {
    return this.devices.find(
      (entry) => entry.mqttTopicPrefix === topicPrefix && entry.mqttKey === mqttKey,
    );
  }

  private resolveDeviceByRoute(topicPrefix: string, mqttKey: string): StoredMmwaveDevice | undefined {
    const exact = this.findDeviceByRoute(topicPrefix, mqttKey);
    if (exact) {
      return exact;
    }

    const compatibleDevices = this.devices.filter((device) => {
      const profile = getMmwaveProfile(device.profileId);
      return profile?.mqttTopics.component === "dfrobot_c4004" && device.mqttKey === mqttKey;
    });
    if (compatibleDevices.length !== 1) {
      this.logger.warn(
        {
          topicPrefix,
          mqttKey,
          compatibleDeviceCount: compatibleDevices.length,
          knownRoutes: this.devices.map((device) => ({
            deviceId: device.id,
            topicPrefix: device.mqttTopicPrefix,
            mqttKey: device.mqttKey,
          })),
        },
        "MQTT route auto-discovery skipped",
      );
      return undefined;
    }

    const device = compatibleDevices[0];
    this.logger.warn(
      {
        deviceId: device.id,
        previousTopicPrefix: device.mqttTopicPrefix,
        discoveredTopicPrefix: topicPrefix,
        mqttKey,
      },
      "MQTT route auto-discovered from incoming bridge topic",
    );
    device.mqttTopicPrefix = topicPrefix;
    device.mqttKey = mqttKey;
    this.handlers.onMqttRouteDiscovered?.(device.id, { topicPrefix, mqttKey });
    return device;
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

      for (const suffix of AUTO_DISCOVERY_STATE_TOPICS) {
        const topic = `+/${profile.mqttTopics.component}/+/${suffix}`;
        if (this.subscriptions.has(topic)) {
          continue;
        }
        this.client.subscribe(topic, { qos: 1 }, (error) => {
          if (error) {
            this.logger.warn({ error, topic }, "MQTT wildcard subscribe failed");
            return;
          }
          this.subscriptions.add(topic);
          this.logger.info({ topic }, "MQTT bridge wildcard subscription active");
        });
      }
    }
  }

  private shouldSkipDuplicate(topic: string, payload: string): boolean {
    const now = Date.now();
    const key = `${topic}\u0000${payload}`;
    const previous = this.recentMessages.get(key);
    this.recentMessages.set(key, now);
    for (const [entryKey, timestamp] of this.recentMessages) {
      if (now - timestamp > 1000) {
        this.recentMessages.delete(entryKey);
      }
    }
    return previous !== undefined && now - previous < 500;
  }
}
