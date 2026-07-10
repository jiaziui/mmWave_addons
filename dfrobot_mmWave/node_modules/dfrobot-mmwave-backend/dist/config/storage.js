"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceStorage = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const profiles_1 = require("../types/profiles");
const BINDING_REGISTRY_FILE = "devices.json";
const DEVICE_META_FILE = "config.json";
const LEGACY_DEVICE_DATA_FILE = "data.json";
const BINDING_REGISTRY_VERSION = 1;
const DEFAULT_COORDINATE = { xMin: -5, xMax: 5, yMin: 0, yMax: 9 };
const DEFAULT_REGION_POSITIONS = [
    { x: -3.6, y: 6.8 },
    { x: -1.4, y: 6.2 },
    { x: 1.1, y: 6.5 },
    { x: -2.5, y: 3.4 },
    { x: 2.6, y: 3.6 },
    { x: 0, y: 1.8 },
];
const sanitizeIdPart = (value) => value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
const defaultModelForProfileId = (profileId) => {
    if (profileId === "unknown") {
        return "DFRobot mmWave";
    }
    return `DFRobot ${profileId.toUpperCase()}`;
};
const toStableDeviceId = (device) => {
    const profilePrefix = device.profileId === "unknown" ? "mmwave" : device.profileId;
    const prefixPart = sanitizeIdPart(device.prefix) || "device";
    if (device.haDeviceId) {
        return `${profilePrefix}-${sanitizeIdPart(device.haDeviceId)}-${prefixPart}`;
    }
    if (device.macAddress) {
        return `${profilePrefix}-${sanitizeIdPart(device.macAddress)}-${prefixPart}`;
    }
    return `${profilePrefix}-${prefixPart}`;
};
const formatDeviceNo = (sequence) => String(sequence);
const normalizeDeviceNo = (value) => {
    const trimmed = value.trim();
    const legacyMatch = /^C400\d-(\d+)$/i.exec(trimmed);
    const digits = legacyMatch?.[1] ?? trimmed.replace(/\D+/g, "");
    const parsed = Number(digits);
    return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : "";
};
const normalizeInstallHeightM = (value) => {
    const parsed = toFiniteNumber(value, 1.8);
    return Math.round(Math.max(1.8, Math.min(2, parsed)) * 100) / 100;
};
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const toFiniteNumber = (value, fallback) => {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toOptionalFiniteNumber = (value) => {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const toOptionalBoolean = (value) => {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "on" || normalized === "true" || normalized === "1") {
        return true;
    }
    if (normalized === "off" || normalized === "false" || normalized === "0") {
        return false;
    }
    return undefined;
};
const normalizeDetectionMode = (value) => {
    if (value === 2 || value === "2" || value === "static_stable") {
        return 2;
    }
    return 1;
};
const normalizeStoredProfileId = (value, fallback = "c4004") => (0, profiles_1.isStoredMmwaveProfileId)(value) ? value : fallback;
const normalizeProfileOverride = (value) => (0, profiles_1.isMmwaveProfileId)(value) ? value : undefined;
const normalizeInstallInfo = (value) => {
    const record = isRecord(value) ? value : {};
    return {
        installMode: "side",
        installAngleDeg: 0,
        installHeightM: normalizeInstallHeightM(record.installHeightM),
    };
};
const normalizeDeviceSettings = (value) => {
    if (!isRecord(value)) {
        return undefined;
    }
    const settings = {};
    const booleanKeys = ["presenceEnable", "trajectoryTrackEnable", "trajectoryLed", "motionLed"];
    const numberKeys = [
        "installZAngle",
        "realTimePeopleTime",
        "trackMeters",
        "trackExistsTime",
        "checkToActiveFrames",
        "unmannedTime",
        "zone1McuIo",
        "zone2McuIo",
        "zone3McuIo",
        "zone4McuIo",
        "zone5McuIo",
        "zone6McuIo",
    ];
    for (const key of booleanKeys) {
        const parsed = toOptionalBoolean(value[key]);
        if (parsed !== undefined) {
            settings[key] = parsed;
        }
    }
    for (const key of numberKeys) {
        const parsed = toOptionalFiniteNumber(value[key]);
        if (parsed !== undefined) {
            settings[key] = parsed;
        }
    }
    return Object.keys(settings).length ? settings : undefined;
};
const cloneRangeBox = (box) => ({
    xMin: box.xMin,
    xMax: box.xMax,
    yMin: box.yMin,
    yMax: box.yMax,
});
const normalizeRangeBox = (value, fallback) => {
    if (!isRecord(value)) {
        return cloneRangeBox(fallback);
    }
    return {
        xMin: toFiniteNumber(value.xMin, fallback.xMin),
        xMax: toFiniteNumber(value.xMax, fallback.xMax),
        yMin: toFiniteNumber(value.yMin, fallback.yMin),
        yMax: toFiniteNumber(value.yMax, fallback.yMax),
    };
};
const createDefaultRegions = () => DEFAULT_REGION_POSITIONS.map((position, index) => ({
    id: `zone-${index + 1}`,
    label: `Zone ${index + 1}`,
    x: position.x,
    y: position.y,
    enabled: true,
}));
const createDefaultRegionConfig = () => ({
    coordinate: cloneRangeBox(DEFAULT_COORDINATE),
    rangeBox: cloneRangeBox(DEFAULT_COORDINATE),
    regions: createDefaultRegions(),
});
const createEmptyZoneSnapshot = (updatedAt) => ({
    updatedAt,
    presenceStates: Array.from({ length: 6 }, (_, index) => ({
        id: `zone-${index + 1}`,
        active: false,
    })),
    counts: {
        peopleCount: 0,
        targetCount: 0,
        movingCount: 0,
        staticCount: 0,
    },
});
const createDefaultDiscovery = (timestamp) => ({
    status: "offline",
    signal: 0,
    lastSeen: timestamp,
    discoveredAt: timestamp,
    lastUpdated: timestamp,
});
const normalizeRegionConfig = (value) => {
    const fallback = createDefaultRegionConfig();
    if (!isRecord(value)) {
        return fallback;
    }
    const rawRegions = Array.isArray(value.regions) ? value.regions : [];
    const regionById = new Map();
    for (const entry of rawRegions) {
        if (!isRecord(entry) || typeof entry.id !== "string") {
            continue;
        }
        regionById.set(entry.id, entry);
    }
    return {
        coordinate: normalizeRangeBox(value.coordinate, fallback.coordinate),
        rangeBox: normalizeRangeBox(value.rangeBox, fallback.rangeBox),
        regions: fallback.regions.map((region) => {
            const current = regionById.get(region.id);
            if (!current) {
                return region;
            }
            return {
                id: region.id,
                label: typeof current.label === "string" && current.label.trim() ? current.label : region.label,
                x: toFiniteNumber(current.x, region.x),
                y: toFiniteNumber(current.y, region.y),
                enabled: typeof current.enabled === "boolean" ? current.enabled : region.enabled,
            };
        }),
    };
};
const normalizeBinding = (value) => {
    if (!isRecord(value)) {
        return null;
    }
    const deviceNo = typeof value.deviceNo === "string" ? normalizeDeviceNo(value.deviceNo) : "";
    const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
    if (!deviceNo || !id) {
        return null;
    }
    const now = new Date().toISOString();
    return {
        deviceNo,
        id,
        haDeviceId: typeof value.haDeviceId === "string" && value.haDeviceId.trim() ? value.haDeviceId.trim() : undefined,
        macAddress: typeof value.macAddress === "string" && value.macAddress.trim() ? value.macAddress.trim() : undefined,
        prefix: typeof value.prefix === "string" && value.prefix.trim() ? value.prefix.trim() : undefined,
        mqttTopicPrefix: typeof value.mqttTopicPrefix === "string" && value.mqttTopicPrefix.trim()
            ? value.mqttTopicPrefix.trim()
            : undefined,
        deploymentName: typeof value.deploymentName === "string" && value.deploymentName.trim()
            ? value.deploymentName.trim()
            : undefined,
        boundAt: typeof value.boundAt === "string" && value.boundAt.trim() ? value.boundAt.trim() : now,
        updatedAt: typeof value.updatedAt === "string" && value.updatedAt.trim() ? value.updatedAt.trim() : now,
    };
};
const normalizeBindingRegistry = (raw) => {
    if (!isRecord(raw)) {
        throw new Error(`${BINDING_REGISTRY_FILE} must contain a JSON object`);
    }
    const devices = (Array.isArray(raw.devices) ? raw.devices : [])
        .map(normalizeBinding)
        .filter((device) => Boolean(device));
    const maxSequence = devices.reduce((max, device) => {
        const parsed = Number(device.deviceNo);
        return Number.isSafeInteger(parsed) && parsed > 0 ? Math.max(max, parsed) : max;
    }, 0);
    const nextSequence = Math.max(1, toFiniteNumber(raw.nextSequence, maxSequence + 1), maxSequence + 1);
    return {
        version: BINDING_REGISTRY_VERSION,
        nextSequence,
        devices,
    };
};
const normalizeMetaFile = (raw, fallbackId) => {
    if (!isRecord(raw)) {
        return null;
    }
    const prefix = typeof raw.prefix === "string" && raw.prefix.trim() ? raw.prefix : fallbackId;
    return {
        id: typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId,
        profileId: normalizeStoredProfileId(raw.profileId, "c4004"),
        profileOverride: normalizeProfileOverride(raw.profileOverride),
        haDeviceId: typeof raw.haDeviceId === "string" && raw.haDeviceId.trim() ? raw.haDeviceId : undefined,
        macAddress: typeof raw.macAddress === "string" && raw.macAddress.trim() ? raw.macAddress : undefined,
        deploymentName: typeof raw.deploymentName === "string" && raw.deploymentName.trim() ? raw.deploymentName : undefined,
        prefix,
        mqttTopicPrefix: typeof raw.mqttTopicPrefix === "string" && raw.mqttTopicPrefix.trim()
            ? raw.mqttTopicPrefix
            : prefix,
        mqttKey: typeof raw.mqttKey === "string" && raw.mqttKey.trim() ? raw.mqttKey : "main",
        installInfo: isRecord(raw.installInfo) ? normalizeInstallInfo(raw.installInfo) : undefined,
        detectionMode: raw.detectionMode === 1 ||
            raw.detectionMode === 2 ||
            raw.detectionMode === "1" ||
            raw.detectionMode === "2" ||
            raw.detectionMode === "high_sensitivity" ||
            raw.detectionMode === "static_stable"
            ? normalizeDetectionMode(raw.detectionMode)
            : undefined,
        deviceSettings: normalizeDeviceSettings(raw.deviceSettings),
        regionConfig: normalizeRegionConfig(raw.regionConfig),
    };
};
const applyBindingToDevice = (device, binding) => {
    if (!binding) {
        return {
            ...device,
            initialized: false,
            deviceNo: undefined,
        };
    }
    return {
        ...device,
        deviceNo: binding.deviceNo,
        initialized: true,
        haDeviceId: device.haDeviceId ?? binding.haDeviceId,
        macAddress: device.macAddress !== "Unknown" ? device.macAddress : binding.macAddress ?? "Unknown",
        deploymentName: device.deploymentName ?? binding.deploymentName,
        prefix: device.prefix || binding.prefix || device.id,
        mqttTopicPrefix: device.mqttTopicPrefix || binding.mqttTopicPrefix || device.prefix,
        binding: {
            entityCount: Math.max(device.binding.entityCount, 1),
        },
    };
};
const combineStoredDevice = (meta, binding) => applyBindingToDevice({
    id: meta.id,
    initialized: false,
    profileId: meta.profileId,
    profileStatus: "resolved",
    profileOverride: meta.profileOverride,
    haDeviceId: meta.haDeviceId,
    deploymentName: meta.deploymentName,
    name: meta.prefix,
    model: defaultModelForProfileId(meta.profileId),
    prefix: meta.prefix,
    mqttTopicPrefix: meta.mqttTopicPrefix,
    mqttKey: meta.mqttKey,
    macAddress: meta.macAddress ?? "Unknown",
    binding: {
        entityCount: 0,
    },
    installInfo: meta.installInfo,
    detectionMode: meta.detectionMode,
    deviceSettings: meta.deviceSettings,
    discovery: createDefaultDiscovery(new Date().toISOString()),
    regionConfig: meta.regionConfig,
    lastZoneSnapshot: createEmptyZoneSnapshot(new Date().toISOString()),
}, binding);
const createDeviceFromBinding = (binding) => {
    const now = new Date().toISOString();
    return {
        id: binding.id,
        deviceNo: binding.deviceNo,
        initialized: true,
        profileId: "c4004",
        profileStatus: "resolved",
        haDeviceId: binding.haDeviceId,
        name: binding.id,
        model: defaultModelForProfileId("c4004"),
        deploymentName: binding.deploymentName,
        prefix: binding.prefix ?? binding.id,
        mqttTopicPrefix: binding.mqttTopicPrefix ?? binding.prefix ?? binding.id,
        mqttKey: "main",
        macAddress: binding.macAddress ?? "Unknown",
        binding: {
            entityCount: 1,
        },
        discovery: createDefaultDiscovery(now),
        regionConfig: createDefaultRegionConfig(),
        lastZoneSnapshot: createEmptyZoneSnapshot(now),
    };
};
const splitStoredDevice = (device) => ({
    meta: {
        id: device.id,
        profileId: device.profileId,
        profileOverride: device.profileOverride,
        haDeviceId: device.haDeviceId,
        macAddress: device.macAddress !== "Unknown" ? device.macAddress : undefined,
        deploymentName: device.deploymentName,
        prefix: device.prefix,
        mqttTopicPrefix: device.mqttTopicPrefix,
        mqttKey: device.mqttKey,
        installInfo: device.installInfo,
        detectionMode: device.detectionMode,
        deviceSettings: device.deviceSettings,
        regionConfig: device.regionConfig,
    },
});
class DeviceStorage {
    constructor(dataDir) {
        this.dataDir = dataDir;
    }
    listDevices() {
        this.ensureDataDir();
        const registry = this.readBindingRegistry();
        const bindingsById = new Map(registry.devices.map((device) => [device.id, device]));
        const devicesById = new Map();
        for (const entry of node_fs_1.default.readdirSync(this.dataDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }
            const device = this.readDevice(entry.name, bindingsById);
            if (device) {
                devicesById.set(device.id, device);
            }
        }
        for (const binding of registry.devices) {
            if (!devicesById.has(binding.id)) {
                devicesById.set(binding.id, createDeviceFromBinding(binding));
            }
        }
        return [...devicesById.values()].filter((device) => device.initialized || device.discovery.status === "online").sort((left, right) => {
            if (left.initialized !== right.initialized) {
                return left.initialized ? -1 : 1;
            }
            return (left.deviceNo ?? left.name).localeCompare(right.deviceNo ?? right.name);
        });
    }
    getDevice(id) {
        const registry = this.readBindingRegistry();
        const bindingsById = new Map(registry.devices.map((device) => [device.id, device]));
        const stored = this.readDevice(id, bindingsById);
        if (stored) {
            return stored;
        }
        const binding = registry.devices.find((device) => device.id === id);
        return binding ? createDeviceFromBinding(binding) : null;
    }
    async replaceFromDiscovery(devices) {
        const existingById = new Map(this.listDevices().map((device) => [device.id, device]));
        const registry = this.readBindingRegistry();
        const bindingsById = new Map(registry.devices.map((device) => [device.id, device]));
        const now = new Date().toISOString();
        const nextDevices = [];
        for (const [index, device] of devices.entries()) {
            const id = toStableDeviceId(device);
            const binding = this.findBindingForDiscoveredDevice(registry, id);
            if (!binding && device.status !== "online") {
                continue;
            }
            const existing = existingById.get(binding?.id ?? id) ?? existingById.get(id);
            const nextDevice = {
                id,
                initialized: false,
                profileId: device.profileId,
                profileSource: device.profileSource,
                profileStatus: device.profileStatus,
                profileOverride: existing?.profileOverride,
                haDeviceId: device.haDeviceId ?? existing?.haDeviceId,
                name: device.name || `${(device.profileId === "unknown" ? "mmwave" : device.profileId).toUpperCase()} Device ${index + 1}`,
                deploymentName: device.deploymentName ?? existing?.deploymentName,
                model: device.model || existing?.model || defaultModelForProfileId(device.profileId),
                manufacturer: device.manufacturer ?? existing?.manufacturer,
                firmwareVersion: device.firmwareVersion ?? existing?.firmwareVersion,
                prefix: device.prefix,
                mqttTopicPrefix: device.mqttTopicPrefix ?? device.prefix,
                mqttKey: device.mqttKey ?? existing?.mqttKey ?? "main",
                macAddress: device.macAddress || existing?.macAddress || "Unknown",
                binding: {
                    entityCount: device.entityCount,
                },
                deviceSettings: existing?.deviceSettings,
                discovery: {
                    status: device.status,
                    signal: device.signal,
                    lastSeen: now,
                    discoveredAt: existing?.discovery.discoveredAt ?? now,
                    lastUpdated: now,
                },
                regionConfig: existing?.regionConfig ?? createDefaultRegionConfig(),
                lastZoneSnapshot: existing?.lastZoneSnapshot ?? createEmptyZoneSnapshot(now),
            };
            nextDevices.push(applyBindingToDevice(nextDevice, binding));
        }
        this.ensureDataDir();
        const activeIds = new Set(nextDevices.map((device) => device.id));
        for (const device of nextDevices) {
            this.saveDevice(device);
        }
        const normalizedRegistry = {
            ...registry,
            devices: registry.devices.map((binding) => {
                const discovered = nextDevices.find((device) => binding.id === device.id);
                if (!discovered) {
                    return binding;
                }
                return this.createBindingFromDevice(discovered, binding.deviceNo, binding.boundAt, now);
            }),
        };
        this.writeBindingRegistry(normalizedRegistry);
        const boundIds = new Set(normalizedRegistry.devices.map((device) => device.id));
        for (const entry of node_fs_1.default.readdirSync(this.dataDir, { withFileTypes: true })) {
            if (!entry.isDirectory() || activeIds.has(entry.name) || boundIds.has(entry.name)) {
                continue;
            }
            const stored = this.readDevice(entry.name, bindingsById);
            if (stored?.initialized) {
                this.saveDevice({
                    ...stored,
                    discovery: {
                        ...stored.discovery,
                        status: "offline",
                        lastUpdated: now,
                    },
                });
                continue;
            }
            node_fs_1.default.rmSync(this.getDeviceDir(entry.name), { recursive: true, force: true });
        }
        const devicesById = new Map(this.listDevices().map((device) => [device.id, device]));
        for (const device of nextDevices) {
            devicesById.set(device.id, device);
        }
        return [...devicesById.values()].sort((left, right) => {
            if (left.initialized !== right.initialized) {
                return left.initialized ? -1 : 1;
            }
            return (left.deviceNo ?? left.name).localeCompare(right.deviceNo ?? right.name);
        });
    }
    validateInitializeDevice(id, updates) {
        const current = this.getDevice(id);
        if (!current) {
            throw new Error("Device not found");
        }
        this.resolveDeviceNo(this.readBindingRegistry(), id, updates, false);
        return current;
    }
    initializeDevice(id, updates) {
        const current = this.getDevice(id);
        if (!current) {
            throw new Error("Device not found");
        }
        const registry = this.readBindingRegistry();
        const { deviceNo, nextSequence } = this.resolveDeviceNo(registry, id, updates, true);
        const now = new Date().toISOString();
        const installInfo = {
            installMode: "side",
            installAngleDeg: 0,
            installHeightM: normalizeInstallHeightM(updates.installHeightM),
        };
        const nextDevice = {
            ...current,
            deviceNo,
            initialized: true,
            binding: {
                entityCount: Math.max(current.binding.entityCount, 1),
            },
            installInfo,
            detectionMode: updates.detectionMode,
            deviceSettings: {
                ...current.deviceSettings,
                checkToActiveFrames: updates.detectionMode === 1 ? 2 : 7,
                unmannedTime: updates.detectionMode === 1 ? 5 : 30,
            },
            discovery: {
                ...current.discovery,
                lastUpdated: now,
            },
        };
        const existingBinding = registry.devices.find((device) => device.id === id);
        const nextBinding = this.createBindingFromDevice(nextDevice, deviceNo, existingBinding?.boundAt ?? now, now);
        const nextRegistry = {
            ...registry,
            nextSequence,
            devices: [
                ...registry.devices.filter((device) => device.id !== id && device.deviceNo !== deviceNo),
                nextBinding,
            ].sort((left, right) => left.deviceNo.localeCompare(right.deviceNo)),
        };
        this.writeBindingRegistry(nextRegistry);
        this.saveDevice(nextDevice);
        return nextDevice;
    }
    updateDeviceSettings(id, settings) {
        const current = this.getDevice(id);
        if (!current) {
            throw new Error("Device not found");
        }
        const normalizedSettings = normalizeDeviceSettings(settings) ?? {};
        const nextDevice = {
            ...current,
            deviceSettings: {
                ...current.deviceSettings,
                ...normalizedSettings,
            },
            discovery: {
                ...current.discovery,
                lastUpdated: new Date().toISOString(),
            },
        };
        this.saveDevice(nextDevice);
        return nextDevice;
    }
    unbindDevice(id) {
        const registry = this.readBindingRegistry();
        const nextDevices = registry.devices.filter((device) => device.id !== id);
        if (nextDevices.length === registry.devices.length && !node_fs_1.default.existsSync(this.getDeviceDir(id))) {
            throw new Error("Device not found");
        }
        this.writeBindingRegistry({
            ...registry,
            devices: nextDevices,
        });
        node_fs_1.default.rmSync(this.getDeviceDir(id), { recursive: true, force: true });
    }
    findBindingForDiscoveredDevice(registry, id) {
        return registry.devices.find((binding) => binding.id === id);
    }
    createBindingFromDevice(device, deviceNo, boundAt, updatedAt) {
        return {
            deviceNo,
            id: device.id,
            haDeviceId: device.haDeviceId,
            macAddress: device.macAddress !== "Unknown" ? device.macAddress : undefined,
            prefix: device.prefix,
            mqttTopicPrefix: device.mqttTopicPrefix,
            deploymentName: device.deploymentName,
            boundAt,
            updatedAt,
        };
    }
    resolveDeviceNo(registry, id, updates, consumeSequence) {
        const existing = registry.devices.find((device) => device.id === id);
        if (updates.deviceNoMode === "custom") {
            const customDeviceNo = normalizeDeviceNo(updates.customDeviceNo ?? "");
            if (!customDeviceNo) {
                throw new Error("Device number is required");
            }
            if (customDeviceNo.length > 24) {
                throw new Error("Device number is too long");
            }
            const duplicated = registry.devices.some((device) => device.deviceNo === customDeviceNo && device.id !== id);
            if (duplicated) {
                throw new Error("Device number already exists");
            }
            return {
                deviceNo: customDeviceNo,
                nextSequence: registry.nextSequence,
            };
        }
        if (existing?.deviceNo) {
            return {
                deviceNo: existing.deviceNo,
                nextSequence: registry.nextSequence,
            };
        }
        let sequence = Math.max(1, Math.floor(registry.nextSequence));
        let deviceNo = formatDeviceNo(sequence);
        const used = new Set(registry.devices.map((device) => device.deviceNo));
        while (used.has(deviceNo)) {
            sequence += 1;
            deviceNo = formatDeviceNo(sequence);
        }
        return {
            deviceNo,
            nextSequence: consumeSequence ? sequence + 1 : registry.nextSequence,
        };
    }
    readBindingRegistry() {
        this.ensureDataDir();
        const registryPath = this.getBindingRegistryPath();
        if (!node_fs_1.default.existsSync(registryPath)) {
            return {
                version: BINDING_REGISTRY_VERSION,
                nextSequence: 1,
                devices: [],
            };
        }
        try {
            const raw = node_fs_1.default.readFileSync(registryPath, "utf8");
            return normalizeBindingRegistry(JSON.parse(raw));
        }
        catch (error) {
            throw new Error(`Failed to read ${BINDING_REGISTRY_FILE}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    writeBindingRegistry(registry) {
        this.ensureDataDir();
        const normalized = normalizeBindingRegistry(registry);
        const registryPath = this.getBindingRegistryPath();
        const tempPath = `${registryPath}.tmp`;
        node_fs_1.default.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
        node_fs_1.default.renameSync(tempPath, registryPath);
    }
    ensureDataDir() {
        node_fs_1.default.mkdirSync(this.dataDir, { recursive: true });
    }
    getBindingRegistryPath() {
        return node_path_1.default.join(this.dataDir, BINDING_REGISTRY_FILE);
    }
    getDeviceDir(id) {
        return node_path_1.default.join(this.dataDir, id);
    }
    getDeviceMetaPath(id) {
        return node_path_1.default.join(this.getDeviceDir(id), DEVICE_META_FILE);
    }
    getLegacyDeviceDataPath(id) {
        return node_path_1.default.join(this.getDeviceDir(id), LEGACY_DEVICE_DATA_FILE);
    }
    readDevice(id, bindingsById = new Map()) {
        try {
            const rawMeta = node_fs_1.default.readFileSync(this.getDeviceMetaPath(id), "utf8");
            const meta = normalizeMetaFile(JSON.parse(rawMeta), id);
            if (!meta) {
                return null;
            }
            return combineStoredDevice(meta, bindingsById.get(meta.id));
        }
        catch {
            return null;
        }
    }
    saveDevice(device) {
        this.ensureDataDir();
        const deviceDir = this.getDeviceDir(device.id);
        node_fs_1.default.mkdirSync(deviceDir, { recursive: true });
        const { meta } = splitStoredDevice(device);
        node_fs_1.default.writeFileSync(this.getDeviceMetaPath(device.id), JSON.stringify(meta, null, 2), "utf8");
        node_fs_1.default.rmSync(this.getLegacyDeviceDataPath(device.id), { force: true });
    }
}
exports.DeviceStorage = DeviceStorage;
