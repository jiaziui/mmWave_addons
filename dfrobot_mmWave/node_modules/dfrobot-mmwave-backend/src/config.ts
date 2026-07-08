import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { HaConfig } from "./ha/types";

dotenv.config();

const DEFAULT_PORT = 42069;
const DEFAULT_HA_DATA_DIR = "/config/dfrobot_mmwave";
const DEFAULT_FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

export interface MqttConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  clientId: string;
}

export interface AppConfig {
  port: number;
  dataDir: string;
  frontendDist: string | null;
  ha: HaConfig | null;
  mqtt: MqttConfig | null;
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const parsePort = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const loadAddonOptions = (): Record<string, unknown> => {
  try {
    const raw = fs.readFileSync("/data/options.json", "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const stringOption = (options: Record<string, unknown>, key: string): string | undefined => {
  const value = options[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
};

const readFirstExistingFile = (paths: string[]): string | undefined => {
  for (const filePath of paths) {
    try {
      const value = fs.readFileSync(filePath, "utf8").trim();
      if (value.length > 0) {
        return value;
      }
    } catch {
      // Ignore missing files outside add-on runtime.
    }
  }
  return undefined;
};

const resolveToken = (options: Record<string, unknown>): string | undefined => {
  const fromFiles = readFirstExistingFile([
    "/run/s6/container_environment/SUPERVISOR_TOKEN",
    "/var/run/s6/container_environment/SUPERVISOR_TOKEN",
  ]);

  return (
    process.env.HA_LONG_LIVED_TOKEN?.trim() ||
    stringOption(options, "ha_long_lived_token") ||
    process.env.SUPERVISOR_TOKEN?.trim() ||
    fromFiles
  );
};

const detectHaConfig = (options: Record<string, unknown>): HaConfig | null => {
  const token = resolveToken(options);
  if (!token) {
    return null;
  }

  const standaloneBaseUrl = process.env.HA_BASE_URL?.trim() || stringOption(options, "ha_base_url");
  if (standaloneBaseUrl) {
    return {
      mode: "standalone",
      baseUrl: trimTrailingSlash(standaloneBaseUrl),
      token,
    };
  }

  return {
    mode: "supervisor",
    baseUrl: "http://supervisor/core/api",
    token,
  };
};

const detectMqttConfig = (options: Record<string, unknown>): MqttConfig | null => {
  const host = process.env.MQTT_HOST?.trim() || stringOption(options, "mqtt_host");
  if (!host) {
    return null;
  }

  return {
    host,
    port: parsePort(process.env.MQTT_PORT, Number(options.mqtt_port ?? 1883)),
    username: process.env.MQTT_USERNAME?.trim() || stringOption(options, "mqtt_username"),
    password: process.env.MQTT_PASSWORD?.trim() || stringOption(options, "mqtt_password"),
    clientId:
      process.env.MQTT_CLIENT_ID?.trim() ||
      stringOption(options, "mqtt_client_id") ||
      "dfrobot-mmwave-addon",
  };
};

export const loadConfig = (): AppConfig => {
  const options = loadAddonOptions();
  const defaultDataDir = DEFAULT_HA_DATA_DIR;

  return {
    port: parsePort(process.env.PORT, Number(options.port ?? DEFAULT_PORT)),
    dataDir: process.env.DATA_DIR ?? defaultDataDir,
    frontendDist: process.env.FRONTEND_DIST ? path.resolve(process.env.FRONTEND_DIST) : DEFAULT_FRONTEND_DIST,
    ha: detectHaConfig(options),
    mqtt: detectMqttConfig(options),
  };
};
