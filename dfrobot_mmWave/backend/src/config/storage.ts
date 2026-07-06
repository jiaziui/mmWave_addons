import fs from "node:fs";
import path from "node:path";
import type { RangeBox, StoredRegionConfig, StoredRegionConfigRegion, StoredZoneSnapshot } from "../types/mmwave";

const SNAPSHOT_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const DEVICE_META_FILE = "device.json";
const DEVICE_DATA_FILE = "data.json";
const DEFAULT_COORDINATE: RangeBox = { xMin: -5, xMax: 5, yMin: 0, yMax: 9 };
const DEFAULT_REGION_POSITIONS = [
  { x: -3.6, y: 6.8 },
  { x: -1.4, y: 6.2 },
  { x: 1.1, y: 6.5 },
  { x: -2.5, y: 3.4 },
  { x: 2.6, y: 3.6 },
  { x: 0, y: 1.8 },
];

export interface StoredMmwaveDevice {
  id: string;
  profileId: "c4004";
  haDeviceId?: string;
  name: string;
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
  profileId: "c4004";
  haDeviceId?: string;
  name: string;
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
  regionConfig: StoredRegionConfig;
}

export interface StoredDeviceDataFile {
  discovery: {
    status: "online" | "offline";
    signal: number;
    lastSeen: string;
    discoveredAt: string;
    lastUpdated: string;
  };
  lastZoneSnapshot: StoredZoneSnapshot;
}

export interface DiscoveredMmwaveDeviceInput {
  haDeviceId?: string;
  name: string;
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

const sanitizeIdPart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toStableDeviceId = (device: DiscoveredMmwaveDeviceInput) => {
  if (device.haDeviceId) {
    return `c4004-${sanitizeIdPart(device.haDeviceId)}`;
  }
  if (device.macAddress) {
    return `c4004-${sanitizeIdPart(device.macAddress)}`;
  }
  return `c4004-${sanitizeIdPart(device.prefix) || "device"}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const createDefaultRegions = (): StoredRegionConfigRegion[] =>
  DEFAULT_REGION_POSITIONS.map((position, index) => ({
    id: `zone-${index + 1}`,
    label: `Zone ${index + 1}`,
    x: position.x,
    y: position.y,
    enabled: true,
  }));

const createDefaultRegionConfig = (): StoredRegionConfig => ({
  coordinate: cloneRangeBox(DEFAULT_COORDINATE),
  rangeBox: cloneRangeBox(DEFAULT_COORDINATE),
  regions: createDefaultRegions(),
});

const createEmptyZoneSnapshot = (updatedAt: string): StoredZoneSnapshot => ({
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

const normalizeRegionConfig = (value: unknown): StoredRegionConfig => {
  const fallback = createDefaultRegionConfig();
  if (!isRecord(value)) {
    return fallback;
  }

  const rawRegions = Array.isArray(value.regions) ? value.regions : [];
  const regionById = new Map<string, Record<string, unknown>>();
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

const normalizeZoneSnapshot = (value: unknown, fallbackTimestamp: string): StoredZoneSnapshot => {
  const fallback = createEmptyZoneSnapshot(fallbackTimestamp);
  if (!isRecord(value)) {
    return fallback;
  }

  const rawPresenceStates = Array.isArray(value.presenceStates) ? value.presenceStates : [];
  const presenceById = new Map<string, Record<string, unknown>>();
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

const isOnlineStatus = (value: unknown): value is "online" | "offline" => value === "online" || value === "offline";

const normalizeMetaFile = (raw: unknown, fallbackId: string): StoredDeviceMetaFile | null => {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId,
    profileId: raw.profileId === "c4004" ? "c4004" : "c4004",
    haDeviceId: typeof raw.haDeviceId === "string" && raw.haDeviceId.trim() ? raw.haDeviceId : undefined,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : fallbackId,
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model : "DFRobot C4004",
    manufacturer: typeof raw.manufacturer === "string" && raw.manufacturer.trim() ? raw.manufacturer : undefined,
    firmwareVersion:
      typeof raw.firmwareVersion === "string" && raw.firmwareVersion.trim() ? raw.firmwareVersion : undefined,
    prefix: typeof raw.prefix === "string" && raw.prefix.trim() ? raw.prefix : fallbackId,
    mqttTopicPrefix:
      typeof raw.mqttTopicPrefix === "string" && raw.mqttTopicPrefix.trim()
        ? raw.mqttTopicPrefix
        : typeof raw.prefix === "string" && raw.prefix.trim()
          ? raw.prefix
          : fallbackId,
    mqttKey: typeof raw.mqttKey === "string" && raw.mqttKey.trim() ? raw.mqttKey : "main",
    macAddress: typeof raw.macAddress === "string" && raw.macAddress.trim() ? raw.macAddress : "Unknown",
    binding: {
      entityCount: toFiniteNumber(isRecord(raw.binding) ? raw.binding.entityCount : undefined, 0),
    },
    regionConfig: normalizeRegionConfig(raw.regionConfig),
  };
};

const normalizeDataFile = (
  raw: unknown,
  fallbackTimestamp: string,
  fallbackStatus: "online" | "offline" = "offline",
): StoredDeviceDataFile => {
  const parsed = isRecord(raw) ? raw : {};
  const discovery = isRecord(parsed.discovery) ? parsed.discovery : {};
  const lastUpdated =
    typeof discovery.lastUpdated === "string" && discovery.lastUpdated.trim()
      ? discovery.lastUpdated
      : fallbackTimestamp;

  return {
    discovery: {
      status: isOnlineStatus(discovery.status) ? discovery.status : fallbackStatus,
      signal: toFiniteNumber(discovery.signal, 0),
      lastSeen:
        typeof discovery.lastSeen === "string" && discovery.lastSeen.trim() ? discovery.lastSeen : lastUpdated,
      discoveredAt:
        typeof discovery.discoveredAt === "string" && discovery.discoveredAt.trim()
          ? discovery.discoveredAt
          : lastUpdated,
      lastUpdated,
    },
    lastZoneSnapshot: normalizeZoneSnapshot(parsed.lastZoneSnapshot, lastUpdated),
  };
};

const combineStoredDevice = (meta: StoredDeviceMetaFile, data: StoredDeviceDataFile): StoredMmwaveDevice => ({
  ...meta,
  discovery: data.discovery,
  lastZoneSnapshot: data.lastZoneSnapshot,
});

const splitStoredDevice = (
  device: StoredMmwaveDevice,
): {
  meta: StoredDeviceMetaFile;
  data: StoredDeviceDataFile;
} => ({
  meta: {
    id: device.id,
    profileId: device.profileId,
    haDeviceId: device.haDeviceId,
    name: device.name,
    model: device.model,
    manufacturer: device.manufacturer,
    firmwareVersion: device.firmwareVersion,
    prefix: device.prefix,
    mqttTopicPrefix: device.mqttTopicPrefix,
    mqttKey: device.mqttKey,
    macAddress: device.macAddress,
    binding: device.binding,
    regionConfig: device.regionConfig,
  },
  data: {
    discovery: device.discovery,
    lastZoneSnapshot: device.lastZoneSnapshot,
  },
});

const sameJson = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

export class DeviceStorage {
  constructor(private readonly dataDir: string) {}

  listDevices(): StoredMmwaveDevice[] {
    this.ensureDataDir();
    try {
      return fs
        .readdirSync(this.dataDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.readDevice(entry.name))
        .filter((device): device is StoredMmwaveDevice => Boolean(device))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return [];
    }
  }

  getDevice(id: string): StoredMmwaveDevice | null {
    return this.readDevice(id);
  }

  async replaceFromDiscovery(devices: DiscoveredMmwaveDeviceInput[]): Promise<StoredMmwaveDevice[]> {
    const existingById = new Map(this.listDevices().map((device) => [device.id, device]));
    const now = new Date().toISOString();

    const nextDevices = devices.map((device, index) => {
      const id = toStableDeviceId(device);
      const existing = existingById.get(id);
      return {
        id,
        profileId: "c4004" as const,
        haDeviceId: device.haDeviceId ?? existing?.haDeviceId,
        name: device.name || `C4004 Device ${index + 1}`,
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
    });

    this.ensureDataDir();
    const activeIds = new Set(nextDevices.map((device) => device.id));
    for (const device of nextDevices) {
      this.saveDevice(device);
    }

    for (const entry of fs.readdirSync(this.dataDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || activeIds.has(entry.name)) {
        continue;
      }
      fs.rmSync(this.getDeviceDir(entry.name), { recursive: true, force: true });
    }

    return nextDevices;
  }

  updateRuntimeState(
    current: StoredMmwaveDevice,
    updates: {
      regionConfig?: StoredRegionConfig;
      lastZoneSnapshot?: StoredZoneSnapshot;
    },
    options?: {
      forceSnapshot?: boolean;
    },
  ): StoredMmwaveDevice {
    let nextRegionConfig = current.regionConfig;
    let nextZoneSnapshot = current.lastZoneSnapshot;

    if (updates.regionConfig) {
      nextRegionConfig = normalizeRegionConfig(updates.regionConfig);
    }

    if (updates.lastZoneSnapshot) {
      const normalizedSnapshot = normalizeZoneSnapshot(
        updates.lastZoneSnapshot,
        updates.lastZoneSnapshot.updatedAt || new Date().toISOString(),
      );
      const snapshotChanged = !sameJson(normalizedSnapshot, current.lastZoneSnapshot);
      if (snapshotChanged) {
        const previousUpdatedAt = Date.parse(current.lastZoneSnapshot.updatedAt);
        const canWriteSnapshot =
          options?.forceSnapshot ||
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

    const nextDevice: StoredMmwaveDevice = {
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

  private ensureDataDir(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  private getDeviceDir(id: string): string {
    return path.join(this.dataDir, id);
  }

  private getDeviceMetaPath(id: string): string {
    return path.join(this.getDeviceDir(id), DEVICE_META_FILE);
  }

  private getDeviceDataPath(id: string): string {
    return path.join(this.getDeviceDir(id), DEVICE_DATA_FILE);
  }

  private readDevice(id: string): StoredMmwaveDevice | null {
    try {
      const rawMeta = fs.readFileSync(this.getDeviceMetaPath(id), "utf8");
      const meta = normalizeMetaFile(JSON.parse(rawMeta) as unknown, id);
      if (!meta) {
        return null;
      }

      const fallbackTimestamp = new Date().toISOString();
      let data = normalizeDataFile(null, fallbackTimestamp);
      try {
        const rawData = fs.readFileSync(this.getDeviceDataPath(id), "utf8");
        data = normalizeDataFile(JSON.parse(rawData) as unknown, fallbackTimestamp, data.discovery.status);
      } catch {
        data = normalizeDataFile(null, fallbackTimestamp);
      }

      return combineStoredDevice(meta, data);
    } catch {
      return null;
    }
  }

  private saveDevice(device: StoredMmwaveDevice): void {
    this.ensureDataDir();
    const deviceDir = this.getDeviceDir(device.id);
    fs.mkdirSync(deviceDir, { recursive: true });

    const { meta, data } = splitStoredDevice(device);
    fs.writeFileSync(this.getDeviceMetaPath(device.id), JSON.stringify(meta, null, 2), "utf8");
    fs.writeFileSync(this.getDeviceDataPath(device.id), JSON.stringify(data, null, 2), "utf8");
  }
}
