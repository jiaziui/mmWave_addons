import mqtt, { MqttClient } from "mqtt";
import type { Logger } from "pino";
import type { MqttConfig } from "../config";
import type { StoredMmwaveDevice } from "../config/storage";
import { getMmwaveProfile } from "./profiles/registry";
import { parseTrajectorySnapshot } from "./trajectory";
import type { TrajectorySnapshot } from "../types/mmwave";

export class MqttBridge {
  private client: MqttClient | null = null;
  private readonly subscriptions = new Set<string>();
  private connected = false;
  private devices: StoredMmwaveDevice[] = [];

  constructor(
    private readonly config: MqttConfig | null,
    private readonly logger: Logger,
    private readonly onSnapshot?: (deviceId: string, snapshot: TrajectorySnapshot) => void,
  ) {}

  start(): void {
    if (!this.config || this.client) {
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
      const snapshot = parseTrajectorySnapshot(topic, payload.toString("utf8"));
      if (!snapshot) {
        return;
      }

      const device = this.devices.find(
        (entry) => entry.mqttTopicPrefix === snapshot.topicPrefix && entry.mqttKey === snapshot.mqttKey,
      );
      if (!device) {
        return;
      }

      this.onSnapshot?.(device.id, snapshot);
    });
  }

  setDevices(devices: StoredMmwaveDevice[]): void {
    this.devices = devices;
    this.syncSubscriptions();
  }

  isConnected(): boolean {
    return this.connected;
  }

  isConfigured(): boolean {
    return Boolean(this.config);
  }

  private syncSubscriptions(): void {
    if (!this.connected || !this.client) {
      return;
    }

    for (const device of this.devices) {
      const profile = getMmwaveProfile(device.profileId);
      const topic = profile?.getTrajectoryTopic?.(device);
      if (!topic) {
        continue;
      }
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
