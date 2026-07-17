import type { StoredMmwaveDevice } from "../config/storage";
import type {
  RangeBox,
  StoredRegionConfig,
  StoredZoneSnapshot,
  TagRegionRuntime,
  TrajectorySnapshot,
  LearnedRangeRuntime,
} from "../types/mmwave";
import type { ProfileSource, ProfileStatus } from "../types/profiles";
import type { TagEventSnapshot } from "./tagEvent";

export interface C4004RuntimeIdentity {
  name?: string;
  deploymentName?: string;
  model?: string;
  manufacturer?: string;
  firmwareVersion?: string;
  macAddress?: string;
  profileSource?: ProfileSource;
  profileStatus?: ProfileStatus;
  entityCount?: number;
}

export interface C4004DiscoveryRuntime {
  status: "online" | "offline";
  signal: number;
  lastSeen: string;
  discoveredAt: string;
  lastUpdated: string;
}

export interface C4004NativeRuntime {
  regionConfig?: StoredRegionConfig;
  lastZoneSnapshot?: StoredZoneSnapshot;
  rangeBox?: RangeBox;
  updatedAt?: string;
}

export interface C4004MqttRuntime {
  trajectory?: TrajectorySnapshot;
  tagRegions: Map<number, TagRegionRuntime>;
  lastEmittedTargetCount?: number;
  lastEmittedAt?: string;
  updatedAt?: string;
}

export interface C4004RuntimeCache {
  deviceId: string;
  profileId: "c4004";
  identity: C4004RuntimeIdentity;
  discovery: C4004DiscoveryRuntime;
  native: C4004NativeRuntime;
  mqtt: C4004MqttRuntime;
  learnedRange: LearnedRangeRuntime;
  updatedAt: string;
}

export type MmwaveRuntimeCache = { profileId: "c4004"; state: C4004RuntimeCache };

const createDefaultDiscovery = (timestamp: string): C4004DiscoveryRuntime => ({
  status: "offline",
  signal: 0,
  lastSeen: timestamp,
  discoveredAt: timestamp,
  lastUpdated: timestamp,
});

export class RuntimeCacheStore {
  private readonly devices = new Map<string, MmwaveRuntimeCache>();

  ensureDevice(device: StoredMmwaveDevice): MmwaveRuntimeCache {
    const existing = this.devices.get(device.id);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const cache: MmwaveRuntimeCache = {
      profileId: "c4004",
      state: {
        deviceId: device.id,
        profileId: "c4004",
        identity: {},
        discovery: createDefaultDiscovery(now),
        native: {},
        mqtt: {
          tagRegions: new Map(),
        },
        learnedRange: {
          status: "idle",
          learningEnabled: false,
          singleTargetConfirmCount: 0,
          pointCount: device.regionConfig.detection.learnedPointsCm.length,
          pointsCm: device.regionConfig.detection.learnedPointsCm.map((point) => ({ ...point })),
          updatedAt: now,
        },
        updatedAt: now,
      },
    };
    this.devices.set(device.id, cache);
    return cache;
  }

  upsertIdentity(device: StoredMmwaveDevice, identity: C4004RuntimeIdentity): C4004RuntimeCache {
    const cache = this.ensureDevice(device).state;
    cache.identity = {
      ...cache.identity,
      ...identity,
    };
    cache.updatedAt = new Date().toISOString();
    return cache;
  }

  updateDiscovery(
    device: StoredMmwaveDevice,
    discovery: Partial<C4004DiscoveryRuntime>,
  ): C4004RuntimeCache {
    const cache = this.ensureDevice(device).state;
    const now = new Date().toISOString();
    cache.discovery = {
      ...cache.discovery,
      ...discovery,
      lastUpdated: discovery.lastUpdated ?? now,
    };
    cache.updatedAt = now;
    return cache;
  }

  updateNative(
    device: StoredMmwaveDevice,
    native: C4004NativeRuntime,
  ): C4004RuntimeCache {
    const cache = this.ensureDevice(device).state;
    const now = new Date().toISOString();
    cache.native = {
      ...cache.native,
      ...native,
      updatedAt: native.updatedAt ?? now,
    };
    cache.updatedAt = now;
    return cache;
  }

  updateTrajectory(deviceId: string, trajectory: TrajectorySnapshot): boolean {
    const current = this.devices.get(deviceId);
    if (!current) {
      return false;
    }
    const previousCount = current.state.mqtt.lastEmittedTargetCount;
    const targetCount = trajectory.targetCount;
    if (targetCount === 0 && previousCount === 0) {
      return false;
    }
    current.state.mqtt = {
      ...current.state.mqtt,
      trajectory,
      lastEmittedTargetCount: targetCount,
      lastEmittedAt: trajectory.updatedAt,
      updatedAt: trajectory.updatedAt,
    };
    current.state.updatedAt = new Date().toISOString();
    return true;
  }

  updateTagRegion(deviceId: string, event: TagEventSnapshot): boolean {
    const current = this.devices.get(deviceId);
    if (!current) {
      return false;
    }

    current.state.mqtt.tagRegions.set(event.tagIndex, {
      tagIndex: event.tagIndex,
      tagType: event.tagType,
      tagTypeCode: event.tagTypeCode,
      ioIndex: event.ioIndex,
      centerXCm: event.centerXCm,
      centerYCm: event.centerYCm,
      movingCount: event.movingCount,
      staticCount: event.staticCount,
      boundaryState: event.boundaryState,
      approachAwayState: event.approachAwayState,
      receivedAt: event.receivedAt,
      dataAvailable: true,
    });
    current.state.mqtt.updatedAt = event.receivedAt;
    current.state.updatedAt = event.receivedAt;
    return true;
  }

  getTrajectory(deviceId: string): TrajectorySnapshot | null {
    return this.devices.get(deviceId)?.state.mqtt.trajectory ?? null;
  }

  getTagRegions(deviceId: string): Map<number, TagRegionRuntime> {
    return this.devices.get(deviceId)?.state.mqtt.tagRegions ?? new Map();
  }

  getLearnedRange(deviceId: string): LearnedRangeRuntime | undefined {
    const learned = this.devices.get(deviceId)?.state.learnedRange;
    return learned ? { ...learned, pointsCm: learned.pointsCm.map((point) => ({ ...point })) } : undefined;
  }

  updateLearnedRange(deviceId: string, update: Partial<LearnedRangeRuntime>): LearnedRangeRuntime | undefined {
    const current = this.devices.get(deviceId)?.state;
    if (!current) {
      return undefined;
    }
    current.learnedRange = {
      ...current.learnedRange,
      ...update,
      pointsCm: update.pointsCm ? update.pointsCm.map((point) => ({ ...point })) : current.learnedRange.pointsCm,
      updatedAt: update.updatedAt ?? new Date().toISOString(),
    };
    current.updatedAt = current.learnedRange.updatedAt;
    return this.getLearnedRange(deviceId);
  }

  hydrateDevice(device: StoredMmwaveDevice): StoredMmwaveDevice {
    const cache = this.devices.get(device.id)?.state;
    if (!cache) {
      return device;
    }

    return {
      ...device,
      name: cache.identity.name ?? device.name,
      deploymentName: cache.identity.deploymentName ?? device.deploymentName,
      model: cache.identity.model ?? device.model,
      manufacturer: cache.identity.manufacturer ?? device.manufacturer,
      firmwareVersion: cache.identity.firmwareVersion ?? device.firmwareVersion,
      macAddress: cache.identity.macAddress ?? device.macAddress,
      profileSource: cache.identity.profileSource ?? device.profileSource,
      profileStatus: cache.identity.profileStatus ?? device.profileStatus,
      binding: {
        entityCount: cache.identity.entityCount ?? device.binding.entityCount,
      },
      discovery: cache.discovery,
      regionConfig: cache.native.regionConfig ?? device.regionConfig,
      lastZoneSnapshot: cache.native.lastZoneSnapshot ?? device.lastZoneSnapshot,
    };
  }

  deleteDevice(deviceId: string): void {
    this.devices.delete(deviceId);
  }
}
