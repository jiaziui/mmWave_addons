import type { StoredMmwaveDevice } from "../config/storage";
import type { RangeBox, StoredRegionConfig, StoredZoneSnapshot, TrajectorySnapshot } from "../types/mmwave";
import type { ProfileSource, ProfileStatus } from "../types/profiles";

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
  updatedAt?: string;
}

export interface C4004RuntimeCache {
  deviceId: string;
  profileId: "c4004";
  identity: C4004RuntimeIdentity;
  discovery: C4004DiscoveryRuntime;
  native: C4004NativeRuntime;
  mqtt: C4004MqttRuntime;
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
        mqtt: {},
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

  updateTrajectory(deviceId: string, trajectory: TrajectorySnapshot): void {
    const current = this.devices.get(deviceId);
    if (!current) {
      return;
    }
    current.state.mqtt = {
      ...current.state.mqtt,
      trajectory,
      updatedAt: trajectory.updatedAt,
    };
    current.state.updatedAt = new Date().toISOString();
  }

  getTrajectory(deviceId: string): TrajectorySnapshot | null {
    return this.devices.get(deviceId)?.state.mqtt.trajectory ?? null;
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
