"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const DEFAULT_PORT = 42069;
const DEFAULT_HA_DATA_DIR = "/homeassistant/dfrobot_mmwave";
const DEFAULT_FRONTEND_DIST = node_path_1.default.resolve(__dirname, "../../frontend/dist");
const trimTrailingSlash = (value) => value.replace(/\/+$/, "");
const parsePort = (value, fallback) => {
    if (!value) {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const loadAddonOptions = () => {
    try {
        const raw = node_fs_1.default.readFileSync("/data/options.json", "utf8");
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed !== null ? parsed : {};
    }
    catch {
        return {};
    }
};
const stringOption = (options, key) => {
    const value = options[key];
    if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
    }
    return undefined;
};
const readFirstExistingFile = (paths) => {
    for (const filePath of paths) {
        try {
            const value = node_fs_1.default.readFileSync(filePath, "utf8").trim();
            if (value.length > 0) {
                return value;
            }
        }
        catch {
            // Ignore missing files outside add-on runtime.
        }
    }
    return undefined;
};
const resolveToken = (options) => {
    const fromFiles = readFirstExistingFile([
        "/run/s6/container_environment/SUPERVISOR_TOKEN",
        "/var/run/s6/container_environment/SUPERVISOR_TOKEN",
    ]);
    return (process.env.HA_LONG_LIVED_TOKEN?.trim() ||
        stringOption(options, "ha_long_lived_token") ||
        process.env.SUPERVISOR_TOKEN?.trim() ||
        fromFiles);
};
const detectHaConfig = (options) => {
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
const detectMqttConfig = (options) => {
    const host = process.env.MQTT_HOST?.trim() || stringOption(options, "mqtt_host");
    if (!host) {
        return null;
    }
    return {
        host,
        port: parsePort(process.env.MQTT_PORT, Number(options.mqtt_port ?? 1883)),
        username: process.env.MQTT_USERNAME?.trim() || stringOption(options, "mqtt_username"),
        password: process.env.MQTT_PASSWORD?.trim() || stringOption(options, "mqtt_password"),
        clientId: process.env.MQTT_CLIENT_ID?.trim() ||
            stringOption(options, "mqtt_client_id") ||
            "dfrobot-mmwave-addon",
    };
};
const loadConfig = () => {
    const options = loadAddonOptions();
    const defaultDataDir = DEFAULT_HA_DATA_DIR;
    return {
        port: parsePort(process.env.PORT, Number(options.port ?? DEFAULT_PORT)),
        dataDir: process.env.DATA_DIR ?? defaultDataDir,
        frontendDist: process.env.FRONTEND_DIST ? node_path_1.default.resolve(process.env.FRONTEND_DIST) : DEFAULT_FRONTEND_DIST,
        ha: detectHaConfig(options),
        mqtt: detectMqttConfig(options),
    };
};
exports.loadConfig = loadConfig;
