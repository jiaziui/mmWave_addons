"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceStorage = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const SNAPSHOT_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const BINDING_REGISTRY_FILE = "devices.json";
const DEVICE_META_FILE = "device.json";
const DEVICE_DATA_FILE = "data.json";
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
const toStableDeviceId = (device) => {
    if (device.haDeviceId) {
        return `c4004-${sanitizeIdPart(device.haDeviceId)}`;
    }
    if (device.macAddress) {
        return `c4004-${sanitizeIdPart(device.macAddress)}`;
    }
    return `c4004-${sanitizeIdPart(device.prefix) || "device"}`;
};
const formatDeviceNo = (sequence) => String(sequence);
const normalizeDeviceNo = (value) => {
    const trimmed = value.trim();
    const legacyMatch = /^C4004-(\d+)$/i.exec(trimmed);
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
const normalizeDetectionMode = (value) => value === "static_stable" ? "static_stable" : "high_sensitivity";
const normalizeInstallInfo = (value) => {
    const record = isRecord(value) ? value : {};
    return {
        installMode: "side",
        installAngleDeg: 0,
        installHeightM: normalizeInstallHeightM(record.installHeightM),
    };
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
const normalizeZoneSnapshot = (value, fallbackTimestamp) => {
    const fallback = createEmptyZoneSnapshot(fallbackTimestamp);
    if (!isRecord(value)) {
        return fallback;
    }
    const rawPresenceStates = Array.isArray(value.presenceStates) ? value.presenceStates : [];
    const presenceById = new Map();
    for (const entry of rawPresenceStates) {
        if (!isRecord(entry) || typeof entry.id !== "string") {
            continue;
        }
        presenceById.set(entry.id, entry);
    }
    const counts = isRecord(value.counts) ? value.counts : {};
    return {
        updatedAt: typeof value.updatedAt === "string" && value.updatedAt.trim() ? value.updatedAt : fallbackTimestamp,
        presenceStates: fallback.presenceStates.map((entry) => {
            const current = presenceById.get(entry.id);
            return {
                id: entry.id,
                active: typeof current?.active === "boolean" ? current.active : entry.active,
            };
        }),
        counts: {
            peopleCount: toFiniteNumber(counts.peopleCount, 0),
            targetCount: toFiniteNumber(counts.targetCount, 0),
            movingCount: toFiniteNumber(counts.movingCount, 0),
            staticCount: toFiniteNumber(counts.staticCount, 0),
        },
    };
};
const normalizeBinding = (value) => {
    if (!isRecord(value)) {
        return null;
    }
    const deviceNo = typeof value.deviceNo === "string" ? normalizeDeviceNo(value.deviceNo) : "";
    const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
    const prefix = typeof value.prefix === "string" && value.prefix.trim() ? value.prefix.trim() : "";
    if (!deviceNo || !id || !prefix) {
        return null;
    }
    const now = new Date().toISOString();
    return {
        deviceNo,
        id,
        haDeviceId: typeof value.haDeviceId === "string" && value.haDeviceId.trim() ? value.haDeviceId.trim() : undefined,
        macAddress: typeof value.macAddress === "string" && value.macAddress.trim() ? value.macAddress.trim() : "Unknown",
        prefix,
        mqttTopicPrefix: typeof value.mqttTopicPrefix === "string" && value.mqttTopicPrefix.trim()
            ? value.mqttTopicPrefix.trim()
            : prefix,
        mqttKey: typeof value.mqttKey === "string" && value.mqttKey.trim() ? value.mqttKey.trim() : "main",
        name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : prefix,
        deploymentName: typeof value.deploymentName === "string" && value.deploymentName.trim()
            ? value.deploymentName.trim()
            : undefined,
        model: typeof value.model === "string" && value.model.trim() ? value.model.trim() : "DFRobot C4004",
        manufacturer: typeof value.manufacturer === "string" && value.manufacturer.trim() ? value.manufacturer.trim() : undefined,
        firmwareVersion: typeof value.firmwareVersion === "string" && value.firmwareVersion.trim()
            ? value.firmwareVersion.trim()
            : undefined,
        installInfo: normalizeInstallInfo(value.installInfo),
        detectionMode: normalizeDetectionMode(value.detectionMode),
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
const isOnlineStatus = (value) => value === "online" || value === "offline";
const normalizeMetaFile = (raw, fallbackId) => {
    if (!isRecord(raw)) {
        return null;
    }
    return {
        id: typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId,
        deviceNo: typeof raw.deviceNo === "string" && raw.deviceNo.trim() ? normalizeDeviceNo(raw.deviceNo) : undefined,
        initialized: typeof raw.initialized === "boolean" ? raw.initialized : undefined,
        profileId: raw.profileId === "c4004" ? "c4004" : "c4004",
        haDeviceId: typeof raw.haDeviceId === "string" && raw.haDeviceId.trim() ? raw.haDeviceId : undefined,
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name : fallbackId,
        deploymentName: typeof raw.deploymentName === "string" && raw.deploymentName.trim() ? raw.deploymentName : undefined,
        model: typeof raw.model === "string" && raw.model.trim() ? raw.model : "DFRobot C4004",
        manufacturer: typeof raw.manufacturer === "string" && raw.manufacturer.trim() ? raw.manufacturer : undefined,
        firmwareVersion: typeof raw.firmwareVersion === "string" && raw.firmwareVersion.trim() ? raw.firmwareVersion : undefined,
        prefix: typeof raw.prefix === "string" && raw.prefix.trim() ? raw.prefix : fallbackId,
        mqttTopicPrefix: typeof raw.mqttTopicPrefix === "string" && raw.mqttTopicPrefix.trim()
            ? raw.mqttTopicPrefix
            : typeof raw.prefix === "string" && raw.prefix.trim()
                ? raw.prefix
                : fallbackId,
        mqttKey: typeof raw.mqttKey === "string" && raw.mqttKey.trim() ? raw.mqttKey : "main",
        macAddress: typeof raw.macAddress === "string" && raw.macAddress.trim() ? raw.macAddress : "Unknown",
        binding: {
            entityCount: toFiniteNumber(isRecord(raw.binding) ? raw.binding.entityCount : undefined, 0),
        },
        installInfo: isRecord(raw.installInfo) ? normalizeInstallInfo(raw.installInfo) : undefined,
        detectionMode: raw.detectionMode === "high_sensitivity" || raw.detectionMode === "static_stable"
            ? raw.detectionMode
            : undefined,
        regionConfig: normalizeRegionConfig(raw.regionConfig),
    };
};
const normalizeDataFile = (raw, fallbackTimestamp, fallbackStatus = "offline") => {
    const parsed = isRecord(raw) ? raw : {};
    const discovery = isRecord(parsed.discovery) ? parsed.discovery : {};
    const lastUpdated = typeof discovery.lastUpdated === "string" && discovery.lastUpdated.trim()
        ? discovery.lastUpdated
        : fallbackTimestamp;
    return {
        discovery: {
            status: isOnlineStatus(discovery.status) ? discovery.status : fallbackStatus,
            signal: toFiniteNumber(discovery.signal, 0),
            lastSeen: typeof discovery.lastSeen === "string" && discovery.lastSeen.trim() ? discovery.lastSeen : lastUpdated,
            discoveredAt: typeof discovery.discoveredAt === "string" && discovery.discoveredAt.trim()
                ? discovery.discoveredAt
                : lastUpdated,
            lastUpdated,
        },
        lastZoneSnapshot: normalizeZoneSnapshot(parsed.lastZoneSnapshot, lastUpdated),
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
        id: binding.id,
        deviceNo: binding.deviceNo,
        initialized: true,
        haDeviceId: binding.haDeviceId ?? device.haDeviceId,
        name: binding.name,
        deploymentName: binding.deploymentName,
        model: binding.model,
        manufacturer: binding.manufacturer,
        firmwareVersion: binding.firmwareVersion,
        prefix: binding.prefix,
        mqttTopicPrefix: binding.mqttTopicPrefix,
        mqttKey: binding.mqttKey,
        macAddress: binding.macAddress,
        binding: {
            entityCount: Math.max(device.binding.entityCount, 1),
        },
        installInfo: binding.installInfo,
        detectionMode: binding.detectionMode,
    };
};
const combineStoredDevice = (meta, data, binding) => applyBindingToDevice({
    ...meta,
    initialized: Boolean(meta.initialized),
    discovery: data.discovery,
    lastZoneSnapshot: data.lastZoneSnapshot,
}, binding);
const createDeviceFromBinding = (binding) => {
    const now = new Date().toISOString();
    return {
        id: binding.id,
        deviceNo: binding.deviceNo,
        initialized: true,
        profileId: "c4004",
        haDeviceId: binding.haDeviceId,
        name: binding.name,
        deploymentName: binding.deploymentName,
        model: binding.model,
        manufacturer: binding.manufacturer,
        firmwareVersion: binding.firmwareVersion,
        prefix: binding.prefix,
        mqttTopicPrefix: binding.mqttTopicPrefix,
        mqttKey: binding.mqttKey,
        macAddress: binding.macAddress,
        binding: {
            entityCount: 1,
        },
        installInfo: binding.installInfo,
        detectionMode: binding.detectionMode,
        discovery: {
            status: "offline",
            signal: 0,
            lastSeen: binding.updatedAt,
            discoveredAt: binding.boundAt,
            lastUpdated: now,
        },
        regionConfig: createDefaultRegionConfig(),
        lastZoneSnapshot: createEmptyZoneSnapshot(now),
    };
};
const splitStoredDevice = (device) => ({
    meta: {
        id: device.id,
        deviceNo: device.deviceNo,
        initialized: device.initialized,
        profileId: device.profileId,
        haDeviceId: device.haDeviceId,
        name: device.name,
        deploymentName: device.deploymentName,
        model: device.model,
        manufacturer: device.manufacturer,
        firmwareVersion: device.firmwareVersion,
        prefix: device.prefix,
        mqttTopicPrefix: device.mqttTopicPrefix,
        mqttKey: device.mqttKey,
        macAddress: device.macAddress,
        binding: device.binding,
        installInfo: device.installInfo,
        detectionMode: device.detectionMode,
        regionConfig: device.regionConfig,
    },
    data: {
        discovery: device.discovery,
        lastZoneSnapshot: device.lastZoneSnapshot,
    },
});
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
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
            const matchingBinding = this.findBindingForDiscoveredDevice(registry, id, device);
            const binding = matchingBinding ? { ...matchingBinding, id } : undefined;
            if (!binding && device.status !== "online") {
                continue;
            }
            const existing = existingById.get(binding?.id ?? id) ?? existingById.get(id);
            const nextDevice = {
                id,
                initialized: false,
                profileId: "c4004",
                haDeviceId: device.haDeviceId ?? existing?.haDeviceId,
                name: device.name || `C4004 Device ${index + 1}`,
                deploymentName: device.deploymentName ?? existing?.deploymentName,
                model: device.model || "DFRobot C4004",
                manufacturer: device.manufacturer ?? existing?.manufacturer,
                firmwareVersion: device.firmwareVersion ?? existing?.firmwareVersion,
                prefix: device.prefix,
                mqttTopicPrefix: device.mqttTopicPrefix ?? device.prefix,
                mqttKey: device.mqttKey ?? existing?.mqttKey ?? "main",
                macAddress: device.macAddress || existing?.macAddress || "Unknown",
                binding: {
                    entityCount: device.entityCount,
                },
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
                const discovered = nextDevices.find((device) => binding.id === device.id ||
                    (binding.haDeviceId && binding.haDeviceId === device.haDeviceId) ||
                    (binding.macAddress !== "Unknown" && binding.macAddress === device.macAddress) ||
                    binding.prefix === device.prefix);
                if (!discovered) {
                    return binding;
                }
                return this.createBindingFromDevice(discovered, binding.deviceNo, binding.installInfo, binding.detectionMode, binding.boundAt, now);
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
        return this.listDevices();
    }
    updateRuntimeState(current, updates, options) {
        let nextRegionConfig = current.regionConfig;
        let nextZoneSnapshot = current.lastZoneSnapshot;
        if (updates.regionConfig) {
            nextRegionConfig = normalizeRegionConfig(updates.regionConfig);
        }
        if (updates.lastZoneSnapshot) {
            const normalizedSnapshot = normalizeZoneSnapshot(updates.lastZoneSnapshot, updates.lastZoneSnapshot.updatedAt || new Date().toISOString());
            const snapshotChanged = !sameJson(normalizedSnapshot, current.lastZoneSnapshot);
            if (snapshotChanged) {
                const previousUpdatedAt = Date.parse(current.lastZoneSnapshot.updatedAt);
                const canWriteSnapshot = options?.forceSnapshot ||
                    !Number.isFinite(previousUpdatedAt) ||
                    Date.now() - previousUpdatedAt >= SNAPSHOT_WRITE_INTERVAL_MS;
                if (canWriteSnapshot) {
                    nextZoneSnapshot = normalizedSnapshot;
                }
            }
        }
        const regionChanged = !sameJson(nextRegionConfig, current.regionConfig);
        const zoneSnapshotChanged = !sameJson(nextZoneSnapshot, current.lastZoneSnapshot);
        if (!regionChanged && !zoneSnapshotChanged) {
            return current;
        }
        const nextDevice = {
            ...current,
            discovery: {
                ...current.discovery,
                lastUpdated: new Date().toISOString(),
            },
            regionConfig: nextRegionConfig,
            lastZoneSnapshot: nextZoneSnapshot,
        };
        this.saveDevice(nextDevice);
        return nextDevice;
    }
    updateDiscoveryStatuses(statusesByPrefix, timestamp = new Date().toISOString()) {
        const devices = this.listDevices();
        for (const device of devices) {
            const status = statusesByPrefix.get(device.prefix);
            if (!status) {
                continue;
            }
            const statusChanged = device.discovery.status !== status;
            const nextLastSeen = status === "online" ? timestamp : device.discovery.lastSeen;
            const lastSeenChanged = device.discovery.lastSeen !== nextLastSeen;
            if (!statusChanged && !lastSeenChanged) {
                continue;
            }
            this.saveDevice({
                ...device,
                discovery: {
                    ...device.discovery,
                    status,
                    lastSeen: nextLastSeen,
                    lastUpdated: timestamp,
                },
            });
        }
        return this.listDevices();
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
            discovery: {
                ...current.discovery,
                lastUpdated: now,
            },
        };
        const existingBinding = registry.devices.find((device) => device.id === id);
        const nextBinding = this.createBindingFromDevice(nextDevice, deviceNo, installInfo, updates.detectionMode, existingBinding?.boundAt ?? now, now);
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
    findBindingForDiscoveredDevice(registry, id, device) {
        return registry.devices.find((binding) => binding.id === id ||
            (device.haDeviceId && binding.haDeviceId === device.haDeviceId) ||
            (device.macAddress && binding.macAddress !== "Unknown" && binding.macAddress === device.macAddress) ||
            binding.prefix === device.prefix);
    }
    createBindingFromDevice(device, deviceNo, installInfo, detectionMode, boundAt, updatedAt) {
        return {
            deviceNo,
            id: device.id,
            haDeviceId: device.haDeviceId,
            macAddress: device.macAddress,
            prefix: device.prefix,
            mqttTopicPrefix: device.mqttTopicPrefix,
            mqttKey: device.mqttKey,
            name: device.name,
            deploymentName: device.deploymentName,
            model: device.model,
            manufacturer: device.manufacturer,
            firmwareVersion: device.firmwareVersion,
            installInfo,
            detectionMode,
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
    getDeviceDataPath(id) {
        return node_path_1.default.join(this.getDeviceDir(id), DEVICE_DATA_FILE);
    }
    readDevice(id, bindingsById = new Map()) {
        try {
            const rawMeta = node_fs_1.default.readFileSync(this.getDeviceMetaPath(id), "utf8");
            const meta = normalizeMetaFile(JSON.parse(rawMeta), id);
            if (!meta) {
                return null;
            }
            const fallbackTimestamp = new Date().toISOString();
            let data = normalizeDataFile(null, fallbackTimestamp);
            try {
                const rawData = node_fs_1.default.readFileSync(this.getDeviceDataPath(id), "utf8");
                data = normalizeDataFile(JSON.parse(rawData), fallbackTimestamp, data.discovery.status);
            }
            catch {
                data = normalizeDataFile(null, fallbackTimestamp);
            }
            return combineStoredDevice(meta, data, bindingsById.get(meta.id));
        }
        catch {
            return null;
        }
    }
    saveDevice(device) {
        this.ensureDataDir();
        const deviceDir = this.getDeviceDir(device.id);
        node_fs_1.default.mkdirSync(deviceDir, { recursive: true });
        const { meta, data } = splitStoredDevice(device);
        node_fs_1.default.writeFileSync(this.getDeviceMetaPath(device.id), JSON.stringify(meta, null, 2), "utf8");
        node_fs_1.default.writeFileSync(this.getDeviceDataPath(device.id), JSON.stringify(data, null, 2), "utf8");
    }
}
exports.DeviceStorage = DeviceStorage;
