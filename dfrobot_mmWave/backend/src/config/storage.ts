import fs from "node:fs";
import path from "node:path";
import type {
  C4004DeviceSettings,
  BaseMapInstance,
  DetectionRangeConfig,
  RangeBox,
  RegionGeometry,
  RegionSyncState,
  RegionType,
  StoredRegionConfig,
  StoredRegionConfigRegion,
  StoredZoneSnapshot,
} from "../types/mmwave";
import {
  isMmwaveProfileId,
  isStoredMmwaveProfileId,
  type MmwaveProfileId,
  type ProfileSource,
  type ProfileStatus,
  type StoredMmwaveProfileId,
} from "../types/profiles";

const BINDING_REGISTRY_FILE = "devices.json";
const DEVICE_META_FILE = "config.json";
const LEGACY_DEVICE_DATA_FILE = "data.json";
const BINDING_REGISTRY_VERSION = 1;
const DEFAULT_COORDINATE: RangeBox = { xMin: -5, xMax: 5, yMin: -1, yMax: 9 };
const DEFAULT_RANGE_BOX: RangeBox = { xMin: -5, xMax: 5, yMin: 0, yMax: 9 };
const MAX_REGIONS = 32;
const VALID_REGION_TYPES = new Set<RegionType>([
  "status_detection",
  "noise",
  "approach_depart",
  "boundary",
  "empty_tag",
]);
const VALID_IO_INDEXES = new Set([0, 2, 3, 4, 5, 6]);

export type DetectionMode = 1 | 2;

export interface StoredInstallInfo {
  installMode: "side";
  installAngleDeg: 0;
  installHeightM: number;
}

export interface StoredMmwaveDevice {
  id: string;
  deviceNo?: string;
  initialized: boolean;
  profileId: StoredMmwaveProfileId;
  profileSource?: ProfileSource;
  profileStatus: ProfileStatus;
  profileOverride?: MmwaveProfileId;
  haDeviceId?: string;
  name: string;
  deploymentName?: string;
  model: string;
  manufacturer?: string;
  firmwareVersion?: string;
  prefix: string;
  mqttTopicPrefix: string;
  mqttKey: string;
  macAddress: string;
  binding: {
    entityCount: number;
  };
  installInfo?: StoredInstallInfo;
  detectionMode?: DetectionMode;
  deviceSettings?: C4004DeviceSettings;
  discovery: {
    status: "online" | "offline";
    signal: number;
    lastSeen: string;
    discoveredAt: string;
    lastUpdated: string;
  };
  regionConfig: StoredRegionConfig;
  lastZoneSnapshot: StoredZoneSnapshot;
}

export interface StoredDeviceMetaFile {
  id: string;
  profileId: StoredMmwaveProfileId;
  profileOverride?: MmwaveProfileId;
  haDeviceId?: string;
  macAddress?: string;
  deploymentName?: string;
  prefix: string;
  mqttTopicPrefix: string;
  mqttKey: string;
  installInfo?: StoredInstallInfo;
  detectionMode?: DetectionMode;
  deviceSettings?: C4004DeviceSettings;
  regionConfig: StoredRegionConfig;
}

export interface DiscoveredMmwaveDeviceInput {
  profileId: StoredMmwaveProfileId;
  profileSource: ProfileSource;
  profileStatus: ProfileStatus;
  haDeviceId?: string;
  name: string;
  deploymentName?: string;
  model: string;
  manufacturer?: string;
  firmwareVersion?: string;
  prefix: string;
  mqttTopicPrefix?: string;
  mqttKey?: string;
  status: "online" | "offline";
  signal: number;
  entityCount: number;
  macAddress?: string;
}

export interface InitializeDeviceInput {
  deviceNoMode: "auto" | "custom";
  customDeviceNo?: string;
  installHeightM: number;
  detectionMode: DetectionMode;
}

export interface StoredDeviceBinding {
  deviceNo: string;
  id: string;
  haDeviceId?: string;
  macAddress?: string;
  prefix?: string;
  mqttTopicPrefix?: string;
  deploymentName?: string;
  boundAt: string;
  updatedAt: string;
}

export interface DeviceBindingRegistryFile {
  version: number;
  nextSequence: number;
  devices: StoredDeviceBinding[];
}

const sanitizeIdPart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const defaultModelForProfileId = (profileId: StoredMmwaveProfileId): string => {
  if (profileId === "unknown") {
    return "DFRobot mmWave";
  }
  return `DFRobot ${profileId.toUpperCase()}`;
};

const toStableDeviceId = (device: DiscoveredMmwaveDeviceInput) => {
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

const formatDeviceNo = (sequence: number): string => String(sequence);

const normalizeDeviceNo = (value: string): string => {
  const trimmed = value.trim();
  const legacyMatch = /^C400\d-(\d+)$/i.exec(trimmed);
  const digits = legacyMatch?.[1] ?? trimmed.replace(/\D+/g, "");
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : "";
};

const normalizeInstallHeightM = (value: unknown): number => {
  const parsed = toFiniteNumber(value, 1.8);
  return Math.round(Math.max(1.8, Math.min(2, parsed)) * 100) / 100;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toOptionalFiniteNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toOptionalBoolean = (value: unknown): boolean | undefined => {
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

const normalizeDetectionMode = (value: unknown): DetectionMode => {
  if (value === 2 || value === "2" || value === "static_stable") {
    return 2;
  }
  return 1;
};

const normalizeStoredProfileId = (value: unknown, fallback: StoredMmwaveProfileId = "c4004"): StoredMmwaveProfileId =>
  isStoredMmwaveProfileId(value) ? value : fallback;

const normalizeProfileOverride = (value: unknown): MmwaveProfileId | undefined =>
  isMmwaveProfileId(value) ? value : undefined;

const normalizeInstallInfo = (value: unknown): StoredInstallInfo => {
  const record = isRecord(value) ? value : {};
  return {
    installMode: "side",
    installAngleDeg: 0,
    installHeightM: normalizeInstallHeightM(record.installHeightM),
  };
};

const normalizeDeviceSettings = (value: unknown): C4004DeviceSettings | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const settings: C4004DeviceSettings = {};
  const booleanKeys = ["presenceEnable", "trajectoryTrackEnable", "trajectoryLed", "motionLed"] as const;
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
  ] as const;

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

const cloneRangeBox = (box: RangeBox): RangeBox => ({
  xMin: box.xMin,
  xMax: box.xMax,
  yMin: box.yMin,
  yMax: box.yMax,
});

const normalizeRangeBox = (value: unknown, fallback: RangeBox): RangeBox => {
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

const createDefaultDetection = (): DetectionRangeConfig => ({
  mode: "rect",
  appliedMode: "rect",
  rectCm: {
    xMin: DEFAULT_RANGE_BOX.xMin * 100,
    xMax: DEFAULT_RANGE_BOX.xMax * 100,
    yMin: DEFAULT_RANGE_BOX.yMin * 100,
    yMax: DEFAULT_RANGE_BOX.yMax * 100,
  },
  learnedPointsCm: [],
  customPointsCm: [],
  customConfirmed: false,
});

const createDefaultSyncState = (): RegionSyncState => ({
  fourSidedRange: "local_only",
  regionMcuIo: "local_only",
});

export const createDefaultRegionConfig = (): StoredRegionConfig => ({
  version: 2,
  coordinate: cloneRangeBox(DEFAULT_COORDINATE),
  rangeBox: cloneRangeBox(DEFAULT_RANGE_BOX),
  regions: [],
  detection: createDefaultDetection(),
  backgroundInstances: [],
  syncState: createDefaultSyncState(),
});

const createEmptyZoneSnapshot = (updatedAt: string): StoredZoneSnapshot => ({
  updatedAt,
  presenceStates: Array.from({ length: 6 }, (_, index) => ({
    id: `zone-${index + 1}`,
    active: false,
  })),
  zones: Array.from({ length: 6 }, (_, index) => ({
    index,
    active: false,
  })),
  counts: {
    peopleCount: 0,
    targetCount: 0,
    movingCount: 0,
    staticCount: 0,
  },
});

const createDefaultDiscovery = (timestamp: string): StoredMmwaveDevice["discovery"] => ({
  status: "offline",
  signal: 0,
  lastSeen: timestamp,
  discoveredAt: timestamp,
  lastUpdated: timestamp,
});

const normalizePointList = (value: unknown): Array<{ x: number; y: number }> => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((point) => ({
      x: Math.round(toFiniteNumber(point.x, 0)),
      y: Math.round(toFiniteNumber(point.y, 0)),
    }))
    .slice(0, 150);
};

const normalizeDetection = (value: unknown): DetectionRangeConfig => {
  const fallback = createDefaultDetection();
  if (!isRecord(value)) {
    return fallback;
  }

  const mode = value.mode === "learned" || value.mode === "custom" ? value.mode : "rect";
  const appliedMode =
    value.appliedMode === "rect" || value.appliedMode === "learned" || value.appliedMode === "custom"
      ? value.appliedMode
      : undefined;
  const rect = isRecord(value.rectCm) ? value.rectCm : {};
  const rectCm = {
    xMin: Math.round(toFiniteNumber(rect.xMin, fallback.rectCm.xMin)),
    xMax: Math.round(toFiniteNumber(rect.xMax, fallback.rectCm.xMax)),
    yMin: Math.round(toFiniteNumber(rect.yMin, fallback.rectCm.yMin)),
    yMax: Math.round(toFiniteNumber(rect.yMax, fallback.rectCm.yMax)),
  };
  if (rectCm.xMin >= rectCm.xMax || rectCm.yMin >= rectCm.yMax) {
    throw new Error("Invalid region config: detection rectangle bounds are invalid");
  }

  return {
    mode,
    appliedMode,
    rectCm,
    learnedPointsCm: normalizePointList(value.learnedPointsCm),
    customPointsCm: normalizePointList(value.customPointsCm),
    customConfirmed: Boolean(value.customConfirmed),
  };
};

const normalizeGeometry = (value: unknown): RegionGeometry => {
  if (!isRecord(value)) {
    throw new Error("Invalid region config: region geometry is required");
  }
  const centerXCm = Math.round(toFiniteNumber(value.centerXCm, 0));
  const centerYCm = Math.round(toFiniteNumber(value.centerYCm, 0));
  if (value.shape === "circle") {
    const radiusCm = Math.round(toFiniteNumber(value.radiusCm, 0));
    if (radiusCm <= 0) {
      throw new Error("Invalid region config: circle radius must be positive");
    }
    return { shape: "circle", centerXCm, centerYCm, radiusCm };
  }

  const widthCm = Math.round(toFiniteNumber(value.widthCm, 0));
  const heightCm = Math.round(toFiniteNumber(value.heightCm, 0));
  if (widthCm <= 0 || heightCm <= 0) {
    throw new Error("Invalid region config: rectangle size must be positive");
  }
  return { shape: "rect", centerXCm, centerYCm, widthCm, heightCm };
};

const normalizeRegion = (value: unknown): StoredRegionConfigRegion => {
  if (!isRecord(value)) {
    throw new Error("Invalid region config: region must be an object");
  }
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
  const index = Math.round(toFiniteNumber(value.index, -1));
  if (!id || index < 0 || index >= MAX_REGIONS) {
    throw new Error("Invalid region config: region id or index is invalid");
  }
  const regionType = VALID_REGION_TYPES.has(value.regionType as RegionType)
    ? (value.regionType as RegionType)
    : "empty_tag";
  const geometry = normalizeGeometry(value.geometry);
  const rawIoIndex = Math.round(toFiniteNumber(value.ioIndex, 0));
  const ioIndex = regionType === "status_detection" && VALID_IO_INDEXES.has(rawIoIndex)
    ? (rawIoIndex as StoredRegionConfigRegion["ioIndex"])
    : 0;
  const rawMcuIo = Math.round(toFiniteNumber(value.mcuIo, -1));
  if (regionType === "status_detection" && index < 6 && (rawMcuIo < -1 || rawMcuIo > 255)) {
    throw new Error("Invalid region config: MCU IO must be between -1 and 255");
  }
  const mcuIo = regionType === "status_detection" && index < 6
    ? rawMcuIo
    : -1;

  return {
    id,
    index,
    label: typeof value.label === "string" && value.label.trim() ? value.label.trim() : `区域 ${index + 1}`,
    regionType,
    geometry,
    ioIndex,
    mcuIo,
    x: geometry.centerXCm / 100,
    y: geometry.centerYCm / 100,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    visible: typeof value.visible === "boolean" ? value.visible : true,
  };
};

const normalizeBackgroundInstance = (value: unknown): BaseMapInstance | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
  const sourceId = typeof value.sourceId === "string" && value.sourceId.trim() ? value.sourceId.trim() : "";
  const widthCm = Math.round(toFiniteNumber(value.widthCm, 0));
  const heightCm = Math.round(toFiniteNumber(value.heightCm, 0));
  if (!id || !sourceId || widthCm <= 0 || heightCm <= 0) {
    return null;
  }
  return {
    id,
    sourceType: value.sourceType === "user" ? "user" : "system",
    sourceId,
    xCm: Math.round(toFiniteNumber(value.xCm, 0)),
    yCm: Math.round(toFiniteNumber(value.yCm, 0)),
    widthCm,
    heightCm,
    visible: typeof value.visible === "boolean" ? value.visible : true,
    zIndex: Math.round(toFiniteNumber(value.zIndex, 0)),
  };
};

const normalizeSyncState = (value: unknown): RegionSyncState => {
  const record = isRecord(value) ? value : {};
  const normalizeStatus = (status: unknown): RegionSyncState["fourSidedRange"] =>
    status === "synced" || status === "pending" ? status : "local_only";
  return {
    fourSidedRange: normalizeStatus(record.fourSidedRange),
    regionMcuIo: normalizeStatus(record.regionMcuIo),
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt.trim() ? record.updatedAt : undefined,
  };
};

export const normalizeRegionConfig = (value: unknown): StoredRegionConfig => {
  const fallback = createDefaultRegionConfig();
  if (!isRecord(value) || value.version !== 2) {
    return fallback;
  }
  const rawRegions = Array.isArray(value.regions) ? value.regions : [];
  if (rawRegions.length > MAX_REGIONS) {
    throw new Error(`Invalid region config: at most ${MAX_REGIONS} regions are allowed`);
  }
  const regions = rawRegions.map(normalizeRegion);
  const indexes = new Set<number>();
  for (const region of regions) {
    if (indexes.has(region.index)) {
      throw new Error("Invalid region config: region indexes must be unique");
    }
    indexes.add(region.index);
  }
  const detection = normalizeDetection(value.detection);
  const coordinate = normalizeRangeBox(value.coordinate, fallback.coordinate);
  if (coordinate.xMin >= coordinate.xMax || coordinate.yMin >= coordinate.yMax) {
    throw new Error("Invalid region config: coordinate bounds are invalid");
  }

  return {
    version: 2,
    coordinate,
    rangeBox: {
      xMin: detection.rectCm.xMin / 100,
      xMax: detection.rectCm.xMax / 100,
      yMin: detection.rectCm.yMin / 100,
      yMax: detection.rectCm.yMax / 100,
    },
    regions,
    detection,
    backgroundInstances: (Array.isArray(value.backgroundInstances) ? value.backgroundInstances : [])
      .map(normalizeBackgroundInstance)
      .filter((instance): instance is BaseMapInstance => Boolean(instance)),
    syncState: normalizeSyncState(value.syncState),
  };
};

const normalizeBinding = (value: unknown): StoredDeviceBinding | null => {
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
    mqttTopicPrefix:
      typeof value.mqttTopicPrefix === "string" && value.mqttTopicPrefix.trim()
        ? value.mqttTopicPrefix.trim()
        : undefined,
    deploymentName:
      typeof value.deploymentName === "string" && value.deploymentName.trim()
        ? value.deploymentName.trim()
        : undefined,
    boundAt: typeof value.boundAt === "string" && value.boundAt.trim() ? value.boundAt.trim() : now,
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt.trim() ? value.updatedAt.trim() : now,
  };
};

const normalizeBindingRegistry = (raw: unknown): DeviceBindingRegistryFile => {
  if (!isRecord(raw)) {
    throw new Error(`${BINDING_REGISTRY_FILE} must contain a JSON object`);
  }

  const devices = (Array.isArray(raw.devices) ? raw.devices : [])
    .map(normalizeBinding)
    .filter((device): device is StoredDeviceBinding => Boolean(device));
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

const normalizeMetaFile = (raw: unknown, fallbackId: string): StoredDeviceMetaFile | null => {
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
    deploymentName:
      typeof raw.deploymentName === "string" && raw.deploymentName.trim() ? raw.deploymentName : undefined,
    prefix,
    mqttTopicPrefix:
      typeof raw.mqttTopicPrefix === "string" && raw.mqttTopicPrefix.trim()
        ? raw.mqttTopicPrefix
        : prefix,
    mqttKey: typeof raw.mqttKey === "string" && raw.mqttKey.trim() ? raw.mqttKey : "main",
    installInfo: isRecord(raw.installInfo) ? normalizeInstallInfo(raw.installInfo) : undefined,
    detectionMode:
      raw.detectionMode === 1 ||
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

const applyBindingToDevice = (
  device: StoredMmwaveDevice,
  binding?: StoredDeviceBinding,
): StoredMmwaveDevice => {
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

const combineStoredDevice = (
  meta: StoredDeviceMetaFile,
  binding?: StoredDeviceBinding,
): StoredMmwaveDevice =>
  applyBindingToDevice(
    {
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
    },
    binding,
  );

const createDeviceFromBinding = (binding: StoredDeviceBinding): StoredMmwaveDevice => {
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

const splitStoredDevice = (
  device: StoredMmwaveDevice,
): {
  meta: StoredDeviceMetaFile;
} => ({
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

export class DeviceStorage {
  constructor(private readonly dataDir: string) {}

  listDevices(): StoredMmwaveDevice[] {
    this.ensureDataDir();
    const registry = this.readBindingRegistry();
    const bindingsById = new Map(registry.devices.map((device) => [device.id, device]));
    const devicesById = new Map<string, StoredMmwaveDevice>();

    for (const entry of fs.readdirSync(this.dataDir, { withFileTypes: true })) {
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

  getDevice(id: string): StoredMmwaveDevice | null {
    const registry = this.readBindingRegistry();
    const bindingsById = new Map(registry.devices.map((device) => [device.id, device]));
    const stored = this.readDevice(id, bindingsById);
    if (stored) {
      return stored;
    }
    const binding = registry.devices.find((device) => device.id === id);
    return binding ? createDeviceFromBinding(binding) : null;
  }

  async replaceFromDiscovery(devices: DiscoveredMmwaveDeviceInput[]): Promise<StoredMmwaveDevice[]> {
    const existingById = new Map(this.listDevices().map((device) => [device.id, device]));
    const registry = this.readBindingRegistry();
    const bindingsById = new Map(registry.devices.map((device) => [device.id, device]));
    const now = new Date().toISOString();

    const nextDevices: StoredMmwaveDevice[] = [];
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

    for (const entry of fs.readdirSync(this.dataDir, { withFileTypes: true })) {
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
      fs.rmSync(this.getDeviceDir(entry.name), { recursive: true, force: true });
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

  validateInitializeDevice(id: string, updates: InitializeDeviceInput): StoredMmwaveDevice {
    const current = this.getDevice(id);
    if (!current) {
      throw new Error("Device not found");
    }
    this.resolveDeviceNo(this.readBindingRegistry(), id, updates, false);
    return current;
  }

  initializeDevice(id: string, updates: InitializeDeviceInput): StoredMmwaveDevice {
    const current = this.getDevice(id);
    if (!current) {
      throw new Error("Device not found");
    }

    const registry = this.readBindingRegistry();
    const { deviceNo, nextSequence } = this.resolveDeviceNo(registry, id, updates, true);
    const now = new Date().toISOString();
    const installInfo: StoredInstallInfo = {
      installMode: "side",
      installAngleDeg: 0,
      installHeightM: normalizeInstallHeightM(updates.installHeightM),
    };

    const nextDevice: StoredMmwaveDevice = {
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
    const nextBinding = this.createBindingFromDevice(
      nextDevice,
      deviceNo,
      existingBinding?.boundAt ?? now,
      now,
    );
    const nextRegistry: DeviceBindingRegistryFile = {
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

  updateDeviceSettings(id: string, settings: C4004DeviceSettings): StoredMmwaveDevice {
    const current = this.getDevice(id);
    if (!current) {
      throw new Error("Device not found");
    }
    const normalizedSettings = normalizeDeviceSettings(settings) ?? {};

    const nextDevice: StoredMmwaveDevice = {
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

  updateRegionConfig(id: string, regionConfig: unknown): StoredMmwaveDevice {
    const current = this.getDevice(id);
    if (!current) {
      throw new Error("Device not found");
    }
    const nextDevice: StoredMmwaveDevice = {
      ...current,
      regionConfig: normalizeRegionConfig(regionConfig),
      discovery: {
        ...current.discovery,
        lastUpdated: new Date().toISOString(),
      },
    };
    this.saveDevice(nextDevice);
    return nextDevice;
  }

  unbindDevice(id: string): void {
    const registry = this.readBindingRegistry();
    const nextDevices = registry.devices.filter((device) => device.id !== id);
    if (nextDevices.length === registry.devices.length && !fs.existsSync(this.getDeviceDir(id))) {
      throw new Error("Device not found");
    }

    this.writeBindingRegistry({
      ...registry,
      devices: nextDevices,
    });
    fs.rmSync(this.getDeviceDir(id), { recursive: true, force: true });
  }

  private findBindingForDiscoveredDevice(
    registry: DeviceBindingRegistryFile,
    id: string,
  ): StoredDeviceBinding | undefined {
    return registry.devices.find((binding) => binding.id === id);
  }

  private createBindingFromDevice(
    device: StoredMmwaveDevice,
    deviceNo: string,
    boundAt: string,
    updatedAt: string,
  ): StoredDeviceBinding {
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

  private resolveDeviceNo(
    registry: DeviceBindingRegistryFile,
    id: string,
    updates: InitializeDeviceInput,
    consumeSequence: boolean,
  ): { deviceNo: string; nextSequence: number } {
    const existing = registry.devices.find((device) => device.id === id);
    if (updates.deviceNoMode === "custom") {
      const customDeviceNo = normalizeDeviceNo(updates.customDeviceNo ?? "");
      if (!customDeviceNo) {
        throw new Error("Device number is required");
      }
      if (customDeviceNo.length > 24) {
        throw new Error("Device number is too long");
      }
      const duplicated = registry.devices.some(
        (device) => device.deviceNo === customDeviceNo && device.id !== id,
      );
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

  private readBindingRegistry(): DeviceBindingRegistryFile {
    this.ensureDataDir();
    const registryPath = this.getBindingRegistryPath();
    if (!fs.existsSync(registryPath)) {
      return {
        version: BINDING_REGISTRY_VERSION,
        nextSequence: 1,
        devices: [],
      };
    }

    try {
      const raw = fs.readFileSync(registryPath, "utf8");
      return normalizeBindingRegistry(JSON.parse(raw) as unknown);
    } catch (error) {
      throw new Error(
        `Failed to read ${BINDING_REGISTRY_FILE}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private writeBindingRegistry(registry: DeviceBindingRegistryFile): void {
    this.ensureDataDir();
    const normalized = normalizeBindingRegistry(registry);
    const registryPath = this.getBindingRegistryPath();
    const tempPath = `${registryPath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, registryPath);
  }

  private ensureDataDir(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  private getBindingRegistryPath(): string {
    return path.join(this.dataDir, BINDING_REGISTRY_FILE);
  }

  private getDeviceDir(id: string): string {
    return path.join(this.dataDir, id);
  }

  private getDeviceMetaPath(id: string): string {
    return path.join(this.getDeviceDir(id), DEVICE_META_FILE);
  }

  private getLegacyDeviceDataPath(id: string): string {
    return path.join(this.getDeviceDir(id), LEGACY_DEVICE_DATA_FILE);
  }

  private readDevice(
    id: string,
    bindingsById: Map<string, StoredDeviceBinding> = new Map(),
  ): StoredMmwaveDevice | null {
    try {
      const rawMeta = fs.readFileSync(this.getDeviceMetaPath(id), "utf8");
      const meta = normalizeMetaFile(JSON.parse(rawMeta) as unknown, id);
      if (!meta) {
        return null;
      }

      return combineStoredDevice(meta, bindingsById.get(meta.id));
    } catch {
      return null;
    }
  }

  private saveDevice(device: StoredMmwaveDevice): void {
    this.ensureDataDir();
    const deviceDir = this.getDeviceDir(device.id);
    fs.mkdirSync(deviceDir, { recursive: true });

    const { meta } = splitStoredDevice(device);
    const metaPath = this.getDeviceMetaPath(device.id);
    const tempPath = `${metaPath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, metaPath);
    fs.rmSync(this.getLegacyDeviceDataPath(device.id), { force: true });
  }
}
