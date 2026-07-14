import type { Logger } from "pino";
import {
  DeviceStorage,
  normalizeRegionConfig,
  type InitializeDeviceInput,
  type StoredMmwaveDevice,
} from "../config/storage";
import type { HaClient } from "../ha/client";
import type { MqttBridge } from "./mqttBridge";
import { getMmwaveProfile, resolveDiscoveredProfiles } from "./profiles/registry";
import { RuntimeCacheStore } from "./runtimeCache";
import type {
  C4004DeviceSettings,
  MmwaveDeviceDetail,
  MmwaveOverviewDeviceCard,
  MmwaveOverviewMetrics,
  MmwaveOverviewResponse,
  RangeBox,
  RegionOverlay,
  TrajectorySnapshot,
  StoredRegionConfig,
} from "../types/mmwave";

export interface MmwaveDeviceConfig {
  id: string;
  deviceNo?: string;
  initialized: boolean;
  profileId: StoredMmwaveDevice["profileId"];
  prefix: string;
  mqttTopicPrefix: string;
  mqttKey: string;
  installInfo: StoredMmwaveDevice["installInfo"];
  detectionMode: StoredMmwaveDevice["detectionMode"];
  regionConfig: StoredMmwaveDevice["regionConfig"];
  deviceSettings: C4004DeviceSettings;
}

export interface UpdateDeviceConfigInput {
  deviceSettings?: C4004DeviceSettings;
  regionConfig?: unknown;
  apply?: {
    fourSidedRange?: boolean;
    regionMcuIo?: boolean;
  };
}

export type ConfigApplyStatus = "applied" | "failed" | "skipped";

export interface ConfigApplyResult {
  fourSidedRange: ConfigApplyStatus;
  regionMcuIo: ConfigApplyStatus;
  warnings: string[];
}

export interface UpdateDeviceConfigResult {
  config: MmwaveDeviceConfig;
  applyResult: ConfigApplyResult;
}

const ZONE_MCU_SETTING_KEYS = [
  "zone1McuIo",
  "zone2McuIo",
  "zone3McuIo",
  "zone4McuIo",
  "zone5McuIo",
  "zone6McuIo",
] as const;

const cloneRangeBox = (rangeBox: RangeBox): RangeBox => ({ ...rangeBox });

const buildGenericRegions = (device: StoredMmwaveDevice): RegionOverlay[] => {
  const presenceById = new Map(device.lastZoneSnapshot.presenceStates.map((state) => [state.id, state.active]));
  return device.regionConfig.regions
    .filter((region) => region.enabled)
    .map((region) => ({
      id: region.id,
      label: region.label,
      active: presenceById.get(region.id) ?? false,
      x: region.x,
      y: region.y,
    }));
};

const buildGenericDeviceCard = (
  device: StoredMmwaveDevice,
  mqttBridge: MqttBridge,
  trajectory: TrajectorySnapshot | null,
): MmwaveOverviewDeviceCard => ({
  id: device.id,
  name: device.name,
  model: device.model,
  online: device.discovery.status === "online",
  status: device.discovery.status === "online" ? "Online" : "Offline",
  signal: device.discovery.signal,
  peopleCount: device.lastZoneSnapshot.counts.peopleCount,
  targetCount: device.lastZoneSnapshot.counts.targetCount,
  staticCount: device.lastZoneSnapshot.counts.staticCount,
  trajectoryAvailable: Boolean(trajectory),
  mqttConnected: mqttBridge.isConnected(),
  coordinate: cloneRangeBox(device.regionConfig.coordinate),
  rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
  detection: device.regionConfig.detection,
  regions: buildGenericRegions(device),
  targets: trajectory?.points ?? [],
});

const buildGenericDeviceDetail = (
  device: StoredMmwaveDevice,
  mqttBridge: MqttBridge,
  trajectory: TrajectorySnapshot | null,
): MmwaveDeviceDetail => {
  const profile = getMmwaveProfile(device.profileId);
  return {
    id: device.id,
    name: device.name,
    model: device.model,
    deviceId: device.haDeviceId ?? device.prefix,
    online: device.discovery.status === "online",
    status: device.discovery.status === "online" ? "Online" : "Offline",
    signal: device.discovery.signal,
    peopleCount: device.lastZoneSnapshot.counts.peopleCount,
    targetCount: device.lastZoneSnapshot.counts.targetCount,
    firmwareVersion: device.firmwareVersion,
    trajectoryAvailable: Boolean(trajectory),
    mqttConnected: mqttBridge.isConnected(),
    lastUpdated: device.discovery.lastUpdated,
    coordinate: cloneRangeBox(device.regionConfig.coordinate),
    rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
    detection: device.regionConfig.detection,
    regions: buildGenericRegions(device),
    targets: trajectory?.points ?? [],
    movingCount: device.lastZoneSnapshot.counts.movingCount,
    staticCount: device.lastZoneSnapshot.counts.staticCount,
    ioStates: [],
    basics: [
      { key: "profileId", label: "设备类型", value: device.profileId },
      { key: "profileStatus", label: "适配状态", value: device.profileStatus },
      { key: "profileSource", label: "识别来源", value: device.profileSource ?? "-" },
      { key: "manufacturer", label: "厂商", value: device.manufacturer ?? "-" },
      { key: "firmwareVersion", label: "固件版本", value: device.firmwareVersion ?? "-" },
      { key: "runtimeSupport", label: "运行时支持", value: profile?.runtimeSupported ? "supported" : "pending" },
    ],
    actions: {
      canReset: Boolean(profile?.capabilities.supportsReset),
      canRefresh: true,
      canManageRegions: Boolean(profile?.capabilities.supportsRegions),
    },
  };
};

const buildMetrics = (devices: MmwaveOverviewDeviceCard[]): MmwaveOverviewMetrics => ({
  deviceCount: devices.length,
  peopleCount: devices.reduce((sum, device) => sum + device.peopleCount, 0),
  targetCount: devices.reduce((sum, device) => sum + device.targetCount, 0),
  staticCount: devices.reduce((sum, device) => sum + device.staticCount, 0),
});

const buildDeviceConfig = (device: StoredMmwaveDevice): MmwaveDeviceConfig => ({
  id: device.id,
  deviceNo: device.deviceNo,
  initialized: device.initialized,
  profileId: device.profileId,
  prefix: device.prefix,
  mqttTopicPrefix: device.mqttTopicPrefix,
  mqttKey: device.mqttKey,
  installInfo: device.installInfo,
  detectionMode: device.detectionMode,
  regionConfig: device.regionConfig,
  deviceSettings: device.deviceSettings ?? {},
});

export class MmwaveService {
  private readonly runtimeCache = new RuntimeCacheStore();

  constructor(
    private readonly haClient: HaClient | null,
    private readonly storage: DeviceStorage,
    private readonly mqttBridge: MqttBridge,
    private readonly logger: Logger,
  ) {}

  private getManagedMqttDevices(devices: StoredMmwaveDevice[]): StoredMmwaveDevice[] {
    return devices.filter((device) => {
      if (!device.initialized || device.profileStatus !== "resolved") {
        return false;
      }
      const profile = getMmwaveProfile(device.profileId);
      return Boolean(profile?.capabilities.supportsMqttBridge && profile.getTrajectoryTopic?.(device));
    });
  }

  private hydrateDevices(devices: StoredMmwaveDevice[]): StoredMmwaveDevice[] {
    return devices.map((device) => this.runtimeCache.hydrateDevice(device));
  }

  async discoverDevices(): Promise<StoredMmwaveDevice[]> {
    if (!this.haClient) {
      return this.storage.listDevices();
    }

    const existingDevices = this.storage.listDevices();
    const candidates = await resolveDiscoveredProfiles(this.haClient, existingDevices);
    const devices = await this.storage.replaceFromDiscovery(
      candidates.map((candidate) => ({
        profileId: candidate.profileId,
        profileSource: candidate.profileSource,
        profileStatus: candidate.profileStatus,
        haDeviceId: candidate.deviceId,
        name: candidate.deviceName ?? candidate.prefix,
        deploymentName: candidate.deploymentName,
        model: candidate.deviceModel ?? `DFRobot ${candidate.profileId.toUpperCase()}`,
        manufacturer: candidate.manufacturer,
        firmwareVersion: candidate.firmwareVersion,
        prefix: candidate.prefix,
        mqttTopicPrefix: candidate.prefix,
        mqttKey: "main",
        status: candidate.status,
        signal: Math.min(98, 64 + candidate.score * 4),
        entityCount: candidate.entityCount,
        macAddress: candidate.macAddress,
      })),
    );
    for (const device of devices) {
      const candidate = candidates.find((entry) => entry.prefix === device.prefix);
      this.runtimeCache.ensureDevice(device);
      if (candidate) {
        const now = new Date().toISOString();
        this.runtimeCache.upsertIdentity(device, {
          name: candidate.deviceName ?? candidate.prefix,
          deploymentName: candidate.deploymentName,
          model: candidate.deviceModel ?? `DFRobot ${candidate.profileId.toUpperCase()}`,
          manufacturer: candidate.manufacturer,
          firmwareVersion: candidate.firmwareVersion,
          macAddress: candidate.macAddress,
          profileSource: candidate.profileSource,
          profileStatus: candidate.profileStatus,
          entityCount: candidate.entityCount,
        });
        this.runtimeCache.updateDiscovery(device, {
          status: candidate.status,
          signal: Math.min(98, 64 + candidate.score * 4),
          lastSeen: candidate.status === "online" ? now : device.discovery.lastSeen,
          discoveredAt: device.discovery.discoveredAt,
          lastUpdated: now,
        });
      }
    }
    const hydratedDevices = this.hydrateDevices(devices);
    this.mqttBridge.setDevices(this.getManagedMqttDevices(hydratedDevices));
    return hydratedDevices;
  }

  async listDevices(): Promise<StoredMmwaveDevice[]> {
    const devices = await this.refreshDeviceStatuses();
    this.mqttBridge.setDevices(this.getManagedMqttDevices(devices));
    return devices;
  }

  private async refreshDeviceStatuses(): Promise<StoredMmwaveDevice[]> {
    const devices = this.storage.listDevices();
    if (!this.haClient || !devices.length) {
      return this.hydrateDevices(devices);
    }

    const states = await this.haClient.getAllStates();
    const statesById = new Map(states.map((state) => [state.entity_id, state]));
    for (const device of devices) {
      const profile = getMmwaveProfile(device.profileId);
      if (!profile?.resolveDeviceOnline) {
        continue;
      }
      const status = profile.resolveDeviceOnline(device, statesById, states) ? "online" : "offline";
      const cachedDevice = this.runtimeCache.hydrateDevice(device);
      const now = new Date().toISOString();
      this.runtimeCache.updateDiscovery(device, {
        status,
        lastSeen: status === "online" ? now : cachedDevice.discovery.lastSeen,
        lastUpdated: now,
      });
    }

    return this.hydrateDevices(devices);
  }

  isMqttConnected(): boolean {
    return this.mqttBridge.isConnected();
  }

  private syncDeviceState(
    device: StoredMmwaveDevice,
    statesById: Map<string, import("../ha/types").HaEntityState>,
    options?: { forceSnapshot?: boolean },
  ): StoredMmwaveDevice {
    const profile = getMmwaveProfile(device.profileId);
    if (!profile?.buildRuntimeState) {
      return this.runtimeCache.hydrateDevice(device);
    }
    this.runtimeCache.updateNative(device, profile.buildRuntimeState(device, statesById, options));
    return this.runtimeCache.hydrateDevice(device);
  }

  async getOverview(): Promise<MmwaveOverviewResponse> {
    const devices = (await this.listDevices()).filter((device) => device.initialized);
    if (!this.haClient || !devices.length) {
      return { ok: true, metrics: buildMetrics([]), devices: [] };
    }

    const states = await this.haClient.getAllStates();
    const statesById = new Map(states.map((state) => [state.entity_id, state]));
    const cards = devices.map((device) => {
      const syncedDevice = this.syncDeviceState(device, statesById);
      const trajectory = this.runtimeCache.getTrajectory(syncedDevice.id);
      const profile = getMmwaveProfile(syncedDevice.profileId);
      if (profile?.buildOverviewCard) {
        return profile.buildOverviewCard(syncedDevice, statesById, {
          trajectory,
          mqttConnected: this.mqttBridge.isConnected(),
        });
      }
      return buildGenericDeviceCard(syncedDevice, this.mqttBridge, trajectory);
    });

    return {
      ok: true,
      metrics: buildMetrics(cards),
      devices: cards,
    };
  }

  async getDeviceDetail(deviceId: string, options?: { forceSnapshot?: boolean }): Promise<MmwaveDeviceDetail> {
    const device = this.storage.getDevice(deviceId);
    if (!device) {
      throw new Error("Device not found");
    }

    if (!this.haClient) {
      throw new Error("Home Assistant is not linked");
    }

    const states = await this.haClient.getAllStates();
    const statesById = new Map(states.map((state) => [state.entity_id, state]));
    const syncedDevice = this.syncDeviceState(device, statesById, options);
    const trajectory = this.runtimeCache.getTrajectory(syncedDevice.id);
    const profile = getMmwaveProfile(syncedDevice.profileId);
    if (profile?.buildDeviceDetail) {
      return profile.buildDeviceDetail(syncedDevice, statesById, {
        trajectory,
        mqttConnected: this.mqttBridge.isConnected(),
      });
    }

    return buildGenericDeviceDetail(syncedDevice, this.mqttBridge, trajectory);
  }

  async refreshDevice(deviceId: string): Promise<MmwaveDeviceDetail> {
    const devices = await this.discoverDevices();
    const exists = devices.some((device) => device.id === deviceId);
    if (!exists) {
      this.logger.warn({ deviceId }, "Refresh requested for missing device after discovery");
    }
    return this.getDeviceDetail(deviceId, { forceSnapshot: true });
  }

  async resetDevice(deviceId: string): Promise<MmwaveDeviceDetail> {
    const device = this.storage.getDevice(deviceId);
    if (!device) {
      throw new Error("Device not found");
    }
    if (!this.haClient) {
      throw new Error("Home Assistant is not linked");
    }

    const profile = getMmwaveProfile(device.profileId);
    if (!profile?.capabilities.supportsReset || !profile.resetDevice) {
      throw new Error("Device profile does not support reset yet");
    }

    await profile.resetDevice(this.haClient, device);
    return this.getDeviceDetail(deviceId);
  }

  async getDeviceConfig(deviceId: string): Promise<MmwaveDeviceConfig> {
    const device = this.storage.getDevice(deviceId);
    if (!device) {
      throw new Error("Device not found");
    }

    const profile = getMmwaveProfile(device.profileId);
    if (!this.haClient || !profile?.readDeviceSettings) {
      return buildDeviceConfig(device);
    }

    try {
      const states = await this.haClient.getAllStates();
      const statesById = new Map(states.map((state) => [state.entity_id, state]));
      this.syncDeviceState(device, statesById);
      const syncedSettings = profile.readDeviceSettings(device, statesById);
      const syncedDevice = this.storage.updateDeviceSettings(deviceId, syncedSettings);
      return buildDeviceConfig(this.runtimeCache.hydrateDevice(syncedDevice));
    } catch (error) {
      this.logger.warn({ deviceId, error }, "Returning local device config because HA refresh failed");
      return buildDeviceConfig(device);
    }
  }

  async updateDeviceConfig(deviceId: string, input: UpdateDeviceConfigInput): Promise<UpdateDeviceConfigResult> {
    let device = this.storage.getDevice(deviceId);
    if (!device) {
      throw new Error("Device not found");
    }
    const profile = getMmwaveProfile(device.profileId);
    if (input.deviceSettings) {
      if (!this.haClient) {
        throw new Error("Home Assistant is not linked");
      }
      if (!profile?.writeDeviceSettings) {
        throw new Error("Device profile does not support config yet");
      }
      await profile.writeDeviceSettings(this.haClient, device, input.deviceSettings);
      device = this.storage.updateDeviceSettings(deviceId, input.deviceSettings);
    }

    const applyResult: ConfigApplyResult = {
      fourSidedRange: "skipped",
      regionMcuIo: "skipped",
      warnings: [],
    };

    if (input.regionConfig !== undefined) {
      const normalized = normalizeRegionConfig(input.regionConfig);
      const pendingConfig: StoredRegionConfig = {
        ...normalized,
        syncState: {
          ...normalized.syncState,
          fourSidedRange: input.apply?.fourSidedRange ? "pending" : normalized.syncState.fourSidedRange,
          regionMcuIo: input.apply?.regionMcuIo ? "pending" : normalized.syncState.regionMcuIo,
          updatedAt: new Date().toISOString(),
        },
      };
      device = this.storage.updateRegionConfig(deviceId, pendingConfig);

      if (input.apply?.fourSidedRange) {
        if (!this.haClient || !profile?.applyFourSidedRange) {
          applyResult.fourSidedRange = "failed";
          applyResult.warnings.push("四方探测范围已保存到本地，但设备同步不可用");
        } else {
          try {
            await profile.applyFourSidedRange(this.haClient, device, device.regionConfig.rangeBox);
            applyResult.fourSidedRange = "applied";
          } catch (error) {
            applyResult.fourSidedRange = "failed";
            applyResult.warnings.push(
              `四方探测范围已保存到本地，但设备同步失败：${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      if (input.apply?.regionMcuIo) {
        const mcuSettings: C4004DeviceSettings = {};
        for (const region of device.regionConfig.regions) {
          if (region.regionType !== "status_detection" || region.index < 0 || region.index >= 6) {
            continue;
          }
          mcuSettings[ZONE_MCU_SETTING_KEYS[region.index]] = region.mcuIo;
        }
        if (!Object.keys(mcuSettings).length) {
          applyResult.regionMcuIo = "skipped";
        } else if (!this.haClient || !profile?.writeDeviceSettings) {
          applyResult.regionMcuIo = "failed";
          applyResult.warnings.push("区域 MCU IO 已保存到本地，但设备同步不可用");
        } else {
          try {
            await profile.writeDeviceSettings(this.haClient, device, mcuSettings);
            device = this.storage.updateDeviceSettings(deviceId, mcuSettings);
            applyResult.regionMcuIo = "applied";
          } catch (error) {
            applyResult.regionMcuIo = "failed";
            applyResult.warnings.push(
              `区域 MCU IO 已保存到本地，但设备同步失败：${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      const nextSyncState = {
        ...device.regionConfig.syncState,
        fourSidedRange:
          applyResult.fourSidedRange === "applied"
            ? "synced" as const
            : applyResult.fourSidedRange === "failed"
              ? "pending" as const
              : device.regionConfig.syncState.fourSidedRange,
        regionMcuIo:
          applyResult.regionMcuIo === "applied"
            ? "synced" as const
            : applyResult.regionMcuIo === "failed"
              ? "pending" as const
              : device.regionConfig.syncState.regionMcuIo,
        updatedAt: new Date().toISOString(),
      };
      device = this.storage.updateRegionConfig(deviceId, {
        ...device.regionConfig,
        syncState: nextSyncState,
      });
    }

    if (!input.deviceSettings && input.regionConfig === undefined) {
      throw new Error("No valid config update provided");
    }

    return {
      config: buildDeviceConfig(device),
      applyResult,
    };
  }

  async initializeDevice(
    deviceId: string,
    payload: InitializeDeviceInput,
  ): Promise<StoredMmwaveDevice> {
    const current = this.storage.validateInitializeDevice(deviceId, payload);
    if (!this.haClient) {
      throw new Error("Home Assistant is not linked");
    }

    const profile = getMmwaveProfile(current.profileId);
    if (!profile?.capabilities.supportsInitializeWorkflow || !profile.initializeDevice) {
      throw new Error("Device profile does not support initialization yet");
    }

    await profile.initializeDevice(this.haClient, current, payload);
    const device = this.storage.initializeDevice(deviceId, payload);
    this.mqttBridge.setDevices(this.getManagedMqttDevices(this.storage.listDevices()));
    return this.runtimeCache.hydrateDevice(device);
  }

  async unbindDevice(deviceId: string): Promise<StoredMmwaveDevice[]> {
    this.storage.unbindDevice(deviceId);
    this.runtimeCache.deleteDevice(deviceId);
    const devices = this.haClient ? await this.discoverDevices() : this.storage.listDevices();
    this.mqttBridge.setDevices(this.getManagedMqttDevices(devices));
    return this.hydrateDevices(devices);
  }

  handleTrajectorySnapshot(deviceId: string, snapshot: TrajectorySnapshot): void {
    const device = this.storage.getDevice(deviceId);
    if (device) {
      this.runtimeCache.ensureDevice(device);
    }
    this.runtimeCache.updateTrajectory(deviceId, snapshot);
  }
}
