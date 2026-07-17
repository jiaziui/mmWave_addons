"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadDeviceProfileDefinitions = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const resolveDeviceProfileDir = () => {
    if (process.env.DEVICE_PROFILE_DIR?.trim()) {
        return node_path_1.default.resolve(process.env.DEVICE_PROFILE_DIR.trim());
    }
    // backend/src|dist/domain/profiles -> addon root/config/device
    return node_path_1.default.resolve(__dirname, "../../../../config/device");
};
const normalizeDefinition = (value, fallbackId) => {
    if (!isRecord(value)) {
        return null;
    }
    const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : fallbackId;
    if (!id || id === "unknown") {
        return null;
    }
    if (!isRecord(value.capabilities) || !isRecord(value.mqttTopics) || !isRecord(value.entitySignature)) {
        return null;
    }
    const entities = Array.isArray(value.entitySignature.entities) ? value.entitySignature.entities : [];
    return {
        id,
        displayName: typeof value.displayName === "string" && value.displayName.trim() ? value.displayName.trim() : id,
        metadataHints: Array.isArray(value.metadataHints)
            ? value.metadataHints.filter((item) => typeof item === "string")
            : [],
        markerValues: Array.isArray(value.markerValues)
            ? value.markerValues.filter((item) => typeof item === "string")
            : [],
        runtimeSupported: value.runtimeSupported !== false,
        capabilities: value.capabilities,
        mqttTopics: value.mqttTopics,
        entitySignature: {
            minScore: typeof value.entitySignature.minScore === "number" ? value.entitySignature.minScore : 1,
            entities: entities
                .filter(isRecord)
                .map((entity) => ({
                domain: typeof entity.domain === "string" ? entity.domain : "",
                slug: typeof entity.slug === "string" ? entity.slug : "",
            }))
                .filter((entity) => entity.domain && entity.slug),
        },
    };
};
const definitionsFromFile = (filePath, fallbackId) => {
    const raw = JSON.parse(node_fs_1.default.readFileSync(filePath, "utf8"));
    if (isRecord(raw) && Array.isArray(raw.profiles)) {
        return raw.profiles
            .map((item) => normalizeDefinition(item, fallbackId))
            .filter((item) => item !== null);
    }
    const single = normalizeDefinition(raw, fallbackId);
    return single ? [single] : [];
};
/** Load every `*.json` under addon `config/device/` (one device profile per file). */
const loadDeviceProfileDefinitions = () => {
    const dir = resolveDeviceProfileDir();
    if (!node_fs_1.default.existsSync(dir)) {
        throw new Error(`Device profile directory not found: ${dir}`);
    }
    const files = node_fs_1.default
        .readdirSync(dir)
        .filter((name) => name.toLowerCase().endsWith(".json"))
        .sort((a, b) => a.localeCompare(b));
    const definitions = [];
    const seen = new Set();
    for (const fileName of files) {
        const filePath = node_path_1.default.join(dir, fileName);
        const fallbackId = node_path_1.default.basename(fileName, node_path_1.default.extname(fileName));
        for (const definition of definitionsFromFile(filePath, fallbackId)) {
            if (seen.has(definition.id)) {
                throw new Error(`Duplicate device profile id "${definition.id}" in ${filePath}`);
            }
            seen.add(definition.id);
            definitions.push(definition);
        }
    }
    if (definitions.length === 0) {
        throw new Error(`No device profile JSON found in ${dir}`);
    }
    return definitions;
};
exports.loadDeviceProfileDefinitions = loadDeviceProfileDefinitions;
