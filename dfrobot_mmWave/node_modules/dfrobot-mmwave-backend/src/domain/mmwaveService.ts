import type { Logger } from "pino";
import {
  DeviceStorage,
  normalizeRegionConfig,
  type InitializeDeviceInput,
  type StoredMmwaveDevice,
} from "../config/storage";
import { nextShanghaiMidnight, type DeviceLogStorage } from "../config/deviceLogStorage";
import type { HaClient } from "../ha/client";
import type { HaEntityRegistryEntry, HaEntityState } from "../ha/types";
import type {
  ConfigFileRangeResultSnapshot,
  LearnedTrajectoryRangeResultSnapshot,
  LearnedTrajectoryRangeSnapshot,
  MqttBridge,
  MultiTagConfigResultSnapshot,
} from "./mqttBridge";
import { assertRawCustomRangePointCount, buildConfigFileRangeHex } from "./configFileRange";
import { getMmwaveProfile, resolveDiscoveredProfiles } from "./profiles/registry";
import { RuntimeCacheStore } from "./runtimeCache";
import { assertUniqueRegionIoBindings, buildRegionMcuSettings } from "./regionIo";
import type { TagEventSnapshot } from "./tagEvent";
import { buildMultiTagConfigHex } from "./tagConfig";
import { toDisplayTrajectoryPoints } from "./trajectory";
import { parseLearnedRangeHex } from "./learnedRange";
import type {
  C4004DeviceSettings,
  DeviceLogCalendar,
  DeviceLogPage,
  DeviceLogEntry,
  DeviceLogRetention,
  MmwaveDeviceDetail,
  MmwaveOverviewDeviceCard,
  MmwaveOverviewMetrics,
  MmwaveOverviewResponse,
  LearnedRangeRuntime,
  RangeBox,
  RegionOverlay,
  StoredRegionConfig,
  TrajectorySnapshot,
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
  logRetention: DeviceLogRetention;
  nextCleanupAt: string;
}

export interface UpdateDeviceConfigInput {
  deviceSettings?: C4004DeviceSettings;
  logRetention?: DeviceLogRetention;
  regionConfig?: unknown;
  apply?: {
    fourSidedRange?: boolean;
    regionMcuIo?: boolean;
    tagConfig?: boolean;
    customRange?: boolean;
  };
}

export type LearnedRangeAction = "start" | "stop" | "query";

export type ConfigApplyStatus = "applied" | "failed" | "skipped";

export interface ConfigApplyResult {
  fourSidedRange: ConfigApplyStatus;
  regionMcuIo: ConfigApplyStatus;
  tagConfig: ConfigApplyStatus;
  customRange: ConfigApplyStatus;
  warnings: string[];
}

export interface UpdateDeviceConfigResult {
  config: MmwaveDeviceConfig;
  applyResult: ConfigApplyResult;
}

const cloneRangeBox = (rangeBox: RangeBox): RangeBox => ({ ...rangeBox });

const buildGenericRegions = (device: StoredMmwaveDevice): RegionOverlay[] =>
  device.regionConfig.regions
    .filter((region) => region.enabled)
    .map((region) => ({
      id: region.id,
      label: region.label,
      active: false,
      x: region.x,
      y: region.y,
      tagIndex: region.index,
      tagDataAvailable: false,
    }));

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
  targets: toDisplayTrajectoryPoints(trajectory?.points ?? []),
  backgroundInstances: device.regionConfig.backgroundInstances ?? [],
  viewPreferences: device.regionConfig.viewPreferences ?? {
    gridVisible: true,
    backgroundVisible: (device.regionConfig.backgroundInstances ?? []).some((instance) => instance.visible),
  },
  deploymentName: device.deploymentName,
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
    targets: toDisplayTrajectoryPoints(trajectory?.points ?? []),
    backgroundInstances: device.regionConfig.backgroundInstances ?? [],
    viewPreferences: device.regionConfig.viewPreferences ?? {
      gridVisible: true,
      backgroundVisible: (device.regionConfig.backgroundInstances ?? []).some((instance) => instance.visible),
    },
    movingCount: device.lastZoneSnapshot.counts.movingCount,
    staticCount: device.lastZoneSnapshot.counts.staticCount,
    deploymentName: device.deploymentName,
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
    learnedRange: {
      status: "idle",
      learningEnabled: false,
      singleTargetConfirmCount: 0,
      pointCount: device.regionConfig.detection.learnedPointsCm.length,
      pointsCm: device.regionConfig.detection.learnedPointsCm,
      updatedAt: new Date().toISOString(),
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
  logRetention: device.logRetention ?? { mode: "forever", updatedAt: new Date(0).toISOString() },
  nextCleanupAt: nextShanghaiMidnight(),
});

const normalizeLogRetention = (value: DeviceLogRetention): DeviceLogRetention => {
  if (!value || !["forever", "limited", "none"].includes(value.mode)) {
    throw new Error("Invalid log retention mode");
  }
  if (value.mode !== "limited") {
    return { mode: value.mode, updatedAt: new Date().toISOString() };
  }
  const periodValue = value.value;
  if (typeof periodValue !== "number" || !Number.isInteger(periodValue) || periodValue < 1 || !["day", "week", "month", "year"].includes(value.unit ?? "")) {
    throw new Error("Invalid log retention period");
  }
  return {
    mode: "limited",
    value: periodValue,
    unit: value.unit,
    updatedAt: new Date().toISOString(),
  };
};

export interface TagEventHandlingResult {
  updated: boolean;
  entry?: DeviceLogEntry;
  persisted?: boolean;
}

export class MmwaveService {
  private readonly runtimeCache = new RuntimeCacheStore();
  private readonly pendingMultiTagConfig = new Map<
    string,
    {
      deviceId: string;
      resolve: () => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private readonly pendingConfigFileRange = new Map<
    string,
    {
      deviceId: string;
      resolve: () => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private readonly pendingLearnedRangeSet = new Map<
    string,
    {
      deviceId: string;
      resolve: (snapshot: LearnedTrajectoryRangeResultSnapshot) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private readonly pendingLearnedRangeQuery = new Map<
    string,
    {
      deviceId: string;
      resolve: (snapshot: LearnedTrajectoryRangeResultSnapshot) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private liveNotifier?: (deviceId: string) => void;

  constructor(
    private readonly haClient: HaClient | null,
    private readonly storage: DeviceStorage,
    private readonly mqttBridge: MqttBridge,
    private readonly logger: Logger,
    private readonly deviceLogStorage?: DeviceLogStorage,
  ) {}

  setLiveNotifier(notifier: (deviceId: string) => void): void {
    this.liveNotifier = notifier;
  }

  private notifyRuntime(deviceId: string): void {
    this.liveNotifier?.(deviceId);
  }

  private getManagedMqttDevices(devices: StoredMmwaveDevice[]): StoredMmwaveDevice[] {
    return devices.filter((device) => {
      if (!device.initialized || device.profileStatus !== "resolved") {
        return false;
      }
      const profile = getMmwaveProfile(device.profileId);
      return Boolean(profile?.capabilities.supportsMqttBridge);
    });
  }

  private hydrateDevices(devices: StoredMmwaveDevice[]): StoredMmwaveDevice[] {
    return devices.map((device) => this.runtimeCache.hydrateDevice(device));
  }

  private mapDeviceStates(
    device: StoredMmwaveDevice,
    statesById: Map<string, HaEntityState>,
    entityRegistryEntries: readonly HaEntityRegistryEntry[],
  ): Map<string, HaEntityState> {
    const profile = getMmwaveProfile(device.profileId);
    return profile?.mapEntityStates?.(device, statesById, entityRegistryEntries) ?? statesById;
  }

  private waitForMultiTagResult(deviceId: string, requestId: string, timeoutMs = 4000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMultiTagConfig.delete(requestId);
        reject(new Error("Timed out waiting for multi tag config result"));
      }, timeoutMs);
      this.pendingMultiTagConfig.set(requestId, {
        deviceId,
        resolve: () => {
          clearTimeout(timeout);
          this.pendingMultiTagConfig.delete(requestId);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.pendingMultiTagConfig.delete(requestId);
          reject(error);
        },
        timeout,
      });
    });
  }

  private waitForConfigFileRangeResult(deviceId: string, requestId: string, timeoutMs = 4000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingConfigFileRange.delete(requestId);
        reject(new Error("Timed out waiting for config file range result"));
      }, timeoutMs);
      this.pendingConfigFileRange.set(requestId, {
        deviceId,
        resolve: () => {
          clearTimeout(timeout);
          this.pendingConfigFileRange.delete(requestId);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.pendingConfigFileRange.delete(requestId);
          reject(error);
        },
        timeout,
      });
    });
  }

  private waitForLearnedRangeResult(
    pendingMap: Map<string, { deviceId: string; resolve: (snapshot: LearnedTrajectoryRangeResultSnapshot) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>,
    deviceId: string,
    requestId: string,
    timeoutMessage: string,
    timeoutMs = 4000,
  ): Promise<LearnedTrajectoryRangeResultSnapshot> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingMap.delete(requestId);
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      pendingMap.set(requestId, {
        deviceId,
        resolve: (snapshot) => {
          clearTimeout(timeout);
          pendingMap.delete(requestId);
          resolve(snapshot);
        },
        reject: (error) => {
          clearTimeout(timeout);
          pendingMap.delete(requestId);
          reject(error);
        },
        timeout,
      });
    });
  }

  async discoverDevices(): Promise<StoredMmwaveDevice[]> {
    if (!this.haClient) {
      return this.storage.listDevices();
    }

    const existingDevices = this.storage.listDevices();
    const candidates = await resolveDiscoveredProfiles(this.haClient, existingDevices, this.logger);
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

    const [states, entityRegistryEntries] = await Promise.all([
      this.haClient.getAllStates(),
      this.haClient.getEntityRegistry(),
    ]);
    const statesById = new Map(states.map((state) => [state.entity_id, state]));
    for (const device of devices) {
      const profile = getMmwaveProfile(device.profileId);
      if (!profile?.resolveDeviceOnline) {
        continue;
      }
      const deviceStatesById = this.mapDeviceStates(device, statesById, entityRegistryEntries);
      const status = profile.resolveDeviceOnline(device, deviceStatesById, states) ? "online" : "offline";
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
    statesById: Map<HaEntityState["entity_id"], HaEntityState>,
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

    const [states, entityRegistryEntries] = await Promise.all([
      this.haClient.getAllStates(),
      this.haClient.getEntityRegistry(),
    ]);
    const statesById = new Map(states.map((state) => [state.entity_id, state]));
    const cards = devices.map((device) => {
      const deviceStatesById = this.mapDeviceStates(device, statesById, entityRegistryEntries);
      const syncedDevice = this.syncDeviceState(device, deviceStatesById);
      const trajectory = this.runtimeCache.getTrajectory(syncedDevice.id);
      const tagRegions = this.runtimeCache.getTagRegions(syncedDevice.id);
      const profile = getMmwaveProfile(syncedDevice.profileId);
      if (profile?.buildOverviewCard) {
        return profile.buildOverviewCard(syncedDevice, deviceStatesById, {
          trajectory,
          tagRegions,
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

    const [states, entityRegistryEntries] = await Promise.all([
      this.haClient.getAllStates(),
      this.haClient.getEntityRegistry(),
    ]);
    const statesById = new Map(states.map((state) => [state.entity_id, state]));
    const deviceStatesById = this.mapDeviceStates(device, statesById, entityRegistryEntries);
    const profile = getMmwaveProfile(device.profileId);
    const syncedDevice = this.syncDeviceState(device, deviceStatesById, options);
    let detailDevice = syncedDevice;
    if (profile?.readDeviceSettings) {
      const syncedSettings = profile.readDeviceSettings(syncedDevice, deviceStatesById);
      const currentSettings = syncedDevice.deviceSettings as Record<string, unknown> | undefined;
      const hasSettingsChanges = Object.entries(syncedSettings).some(
        ([key, value]) => currentSettings?.[key] !== value,
      );
      if (hasSettingsChanges) {
        detailDevice = this.runtimeCache.hydrateDevice(this.storage.updateDeviceSettings(deviceId, syncedSettings));
      }
    }
    const trajectory = this.runtimeCache.getTrajectory(detailDevice.id);
    const tagRegions = this.runtimeCache.getTagRegions(detailDevice.id);
    if (profile?.buildDeviceDetail) {
      return {
        ...profile.buildDeviceDetail(detailDevice, deviceStatesById, {
          trajectory,
          tagRegions,
          mqttConnected: this.mqttBridge.isConnected(),
        }),
        learnedRange: this.runtimeCache.getLearnedRange(detailDevice.id) ?? {
          status: "idle",
          learningEnabled: false,
          singleTargetConfirmCount: 0,
          pointCount: detailDevice.regionConfig.detection.learnedPointsCm.length,
          pointsCm: detailDevice.regionConfig.detection.learnedPointsCm,
          updatedAt: new Date().toISOString(),
        },
      };
    }

    return buildGenericDeviceDetail(detailDevice, this.mqttBridge, trajectory);
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
      const [states, entityRegistryEntries] = await Promise.all([
        this.haClient.getAllStates(),
        this.haClient.getEntityRegistry(),
      ]);
      const statesById = new Map(states.map((state) => [state.entity_id, state]));
      const deviceStatesById = this.mapDeviceStates(device, statesById, entityRegistryEntries);
      this.syncDeviceState(device, deviceStatesById);
      const syncedSettings = profile.readDeviceSettings(device, deviceStatesById);
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
    if (
      input.apply?.customRange &&
      (input.apply.fourSidedRange || input.apply.regionMcuIo || input.apply.tagConfig)
    ) {
      throw new Error("Invalid region config: custom range synchronization must be requested separately");
    }
    const learnedRuntime = this.runtimeCache.getLearnedRange(deviceId);
    if (
      learnedRuntime &&
      ["confirming_single_target", "starting", "learning", "stopping", "querying"].includes(learnedRuntime.status) &&
      (input.apply?.fourSidedRange || input.apply?.customRange)
    ) {
      throw new Error("学习探测范围进行中，请先关闭学习后再切换探测范围。");
    }
    const profile = getMmwaveProfile(device.profileId);
    if (input.logRetention) {
      device = this.storage.updateLogRetention(deviceId, normalizeLogRetention(input.logRetention));
    }
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
      tagConfig: "skipped",
      customRange: "skipped",
      warnings: [],
    };

    const regionConfigProvided = input.regionConfig !== undefined;
    let normalizedRegionConfig = regionConfigProvided ? normalizeRegionConfig(input.regionConfig) : device.regionConfig;
    if (regionConfigProvided || input.apply?.regionMcuIo || input.apply?.tagConfig) {
      assertUniqueRegionIoBindings(normalizedRegionConfig);
    }

    if (input.apply?.customRange) {
      try {
        if (regionConfigProvided) {
          assertRawCustomRangePointCount(input.regionConfig);
        }
        const profileSupportsCustomRange =
          this.mqttBridge.isConfigured() &&
          Boolean(profile?.capabilities.supportsMqttBridge) &&
          Boolean(profile?.mqttTopics.configFileRangeCommandTopic) &&
          Boolean(profile?.mqttTopics.configFileRangeResultTopic);
        if (!profileSupportsCustomRange) {
          throw new Error("Custom range MQTT synchronization is unavailable");
        }

        const { hex } = buildConfigFileRangeHex(normalizedRegionConfig);
        const requestId = `${device.id}-range-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const resultPromise = this.waitForConfigFileRangeResult(device.id, requestId);
        const published = this.mqttBridge.publishConfigFileRangeCommand(device, {
          request_id: requestId,
          hex,
        });
        if (!published) {
          const error = new Error("Failed to publish config file range command");
          this.pendingConfigFileRange.get(requestId)?.reject(error);
          await resultPromise;
        }
        await resultPromise;

        normalizedRegionConfig = {
          ...normalizedRegionConfig,
          detection: {
            ...normalizedRegionConfig.detection,
            mode: "custom",
            appliedMode: "custom",
            customConfirmed: true,
          },
          syncState: {
            ...normalizedRegionConfig.syncState,
            customRange: "synced",
            updatedAt: new Date().toISOString(),
          },
        };
        device = this.storage.updateRegionConfig(deviceId, normalizedRegionConfig);
        applyResult.customRange = "applied";
      } catch (error) {
        applyResult.customRange = "failed";
        applyResult.warnings.push(
          `自定义探测范围未保存，设备同步失败：${error instanceof Error ? error.message : String(error)}`,
        );
        return {
          config: buildDeviceConfig(device),
          applyResult,
        };
      }
    }

    if (regionConfigProvided || input.apply?.tagConfig) {
      const normalized = normalizedRegionConfig;
      const pendingConfig: StoredRegionConfig = {
        ...normalized,
        syncState: {
          ...normalized.syncState,
          fourSidedRange: input.apply?.fourSidedRange ? "pending" : normalized.syncState.fourSidedRange,
          regionMcuIo: input.apply?.regionMcuIo ? "pending" : normalized.syncState.regionMcuIo,
          tagConfig: input.apply?.tagConfig ? "pending" : normalized.syncState.tagConfig,
          customRange: normalized.syncState.customRange,
          learnedRange: normalized.syncState.learnedRange,
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
        const mcuSettings = buildRegionMcuSettings(device.regionConfig);
        if (!this.haClient || !profile?.writeDeviceSettings) {
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

      if (input.apply?.tagConfig) {
        const canPublishTagConfig =
          this.mqttBridge.isConfigured() &&
          Boolean(profile?.capabilities.supportsMqttBridge) &&
          Boolean(profile?.mqttTopics.multiTagConfigCommandTopic) &&
          Boolean(profile?.mqttTopics.multiTagConfigResultTopic);

        if (!canPublishTagConfig) {
          applyResult.tagConfig = "failed";
          applyResult.warnings.push("标签配置已保存到本地，但 MQTT 同步不可用");
        } else {
          try {
            const { hex } = buildMultiTagConfigHex(device.regionConfig);
            const requestId = `${device.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const resultPromise = this.waitForMultiTagResult(device.id, requestId);
            const published = this.mqttBridge.publishMultiTagConfigCommand(device, {
              request_id: requestId,
              hex,
            });
            if (!published) {
              const error = new Error("Failed to publish multi tag config command");
              this.pendingMultiTagConfig.get(requestId)?.reject(error);
              await resultPromise;
            }
            await resultPromise;
            applyResult.tagConfig = "applied";
          } catch (error) {
            applyResult.tagConfig = "failed";
            applyResult.warnings.push(
              `标签配置已保存到本地，但设备同步失败：${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      const nextSyncState = {
        ...device.regionConfig.syncState,
        fourSidedRange:
          applyResult.fourSidedRange === "applied"
            ? ("synced" as const)
            : applyResult.fourSidedRange === "failed"
              ? ("pending" as const)
              : device.regionConfig.syncState.fourSidedRange,
        regionMcuIo:
          applyResult.regionMcuIo === "applied"
            ? ("synced" as const)
            : applyResult.regionMcuIo === "failed"
              ? ("pending" as const)
              : device.regionConfig.syncState.regionMcuIo,
        tagConfig:
          applyResult.tagConfig === "applied"
            ? ("synced" as const)
            : applyResult.tagConfig === "failed"
              ? ("pending" as const)
              : device.regionConfig.syncState.tagConfig,
        customRange:
          applyResult.customRange === "applied"
            ? ("synced" as const)
            : device.regionConfig.syncState.customRange,
        learnedRange: device.regionConfig.syncState.learnedRange,
        updatedAt: new Date().toISOString(),
      };
      device = this.storage.updateRegionConfig(deviceId, {
        ...device.regionConfig,
        syncState: nextSyncState,
      });
    }

    if (!input.deviceSettings && !input.logRetention && !regionConfigProvided && !input.apply?.tagConfig && !input.apply?.customRange) {
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
    this.deviceLogStorage?.forgetDevice(deviceId);
    const devices = this.haClient ? await this.discoverDevices() : this.storage.listDevices();
    this.mqttBridge.setDevices(this.getManagedMqttDevices(devices));
    return this.hydrateDevices(devices);
  }

  private learnedRangeCommandAvailable(device: StoredMmwaveDevice): boolean {
    const profile = getMmwaveProfile(device.profileId);
    return this.mqttBridge.isConfigured() && this.mqttBridge.isConnected() && Boolean(
      profile?.mqttTopics.learnedTrajectoryRangeSetCommandTopic &&
      profile.mqttTopics.learnedTrajectoryRangeSetResultTopic &&
      profile.mqttTopics.learnedTrajectoryRangeQueryCommandTopic &&
      profile.mqttTopics.learnedTrajectoryRangeQueryResultTopic,
    );
  }

  private async startLearningAfterConfirmation(deviceId: string): Promise<void> {
    const device = this.storage.getDevice(deviceId);
    const current = this.runtimeCache.getLearnedRange(deviceId);
    if (!device || !current || current.status !== "starting") {
      return;
    }
    const requestId = `${device.id}-learn-start-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const resultPromise = this.waitForLearnedRangeResult(
        this.pendingLearnedRangeSet,
        deviceId,
        requestId,
        "Timed out waiting for learned range start result",
      );
      if (!this.mqttBridge.publishLearnedTrajectoryRangeSetCommand(device, {
        request_id: requestId,
        learning_enabled: true,
      })) {
        this.pendingLearnedRangeSet.get(requestId)?.reject(new Error("Failed to publish learned range start command"));
      }
      const result = await resultPromise;
      if (!result.ok) {
        throw new Error(result.error || "Device rejected learned range start");
      }
      this.runtimeCache.updateLearnedRange(deviceId, {
        status: "learning",
        learningEnabled: true,
        error: undefined,
        message: "学习进行中，请沿探测范围边界行走。",
      });
      this.notifyRuntime(deviceId);
    } catch (error) {
      this.runtimeCache.updateLearnedRange(deviceId, {
        status: "error",
        learningEnabled: false,
        error: error instanceof Error ? error.message : String(error),
        message: "学习探测范围启动失败，请重试。",
      });
      this.notifyRuntime(deviceId);
    }
  }

  private async queryLearnedRange(deviceId: string): Promise<LearnedRangeRuntime> {
    const device = this.storage.getDevice(deviceId);
    if (!device) {
      throw new Error("Device not found");
    }
    this.runtimeCache.updateLearnedRange(deviceId, {
      status: "querying",
      error: undefined,
      message: "正在读取学习结果。",
    });
    this.notifyRuntime(deviceId);
    const requestId = `${device.id}-learn-query-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const resultPromise = this.waitForLearnedRangeResult(
        this.pendingLearnedRangeQuery,
        deviceId,
        requestId,
        "Timed out waiting for learned range query result",
      );
      if (!this.mqttBridge.publishLearnedTrajectoryRangeQueryCommand(device, { request_id: requestId })) {
        this.pendingLearnedRangeQuery.get(requestId)?.reject(new Error("Failed to publish learned range query command"));
      }
      const result = await resultPromise;
      if (!result.ok || !result.hex) {
        throw new Error(result.error || "Learned range query returned no points");
      }
      const pointsCm = parseLearnedRangeHex(result.hex);
      const currentDevice = this.storage.getDevice(deviceId);
      if (!currentDevice) {
        throw new Error("Device not found");
      }
      const regionConfig = normalizeRegionConfig({
        ...currentDevice.regionConfig,
        detection: {
          ...currentDevice.regionConfig.detection,
          mode: "learned",
          appliedMode: "learned",
          learnedPointsCm: pointsCm,
        },
        syncState: {
          ...currentDevice.regionConfig.syncState,
          learnedRange: "synced",
          updatedAt: new Date().toISOString(),
        },
      });
      this.storage.updateRegionConfig(deviceId, regionConfig);
      const runtime = this.runtimeCache.updateLearnedRange(deviceId, {
        status: "ready",
        learningEnabled: false,
        singleTargetConfirmCount: 0,
        pointCount: pointsCm.length,
        pointsCm,
        error: undefined,
        message: "学习范围已更新。",
      });
      this.notifyRuntime(deviceId);
      return runtime ?? {
        status: "ready",
        learningEnabled: false,
        singleTargetConfirmCount: 0,
        pointCount: pointsCm.length,
        pointsCm,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.runtimeCache.updateLearnedRange(deviceId, {
        status: "error",
        learningEnabled: false,
        error: error instanceof Error ? error.message : String(error),
        message: "学习已停止，但最终范围读取失败。",
      });
      this.notifyRuntime(deviceId);
      throw error;
    }
  }

  async learnedRangeAction(deviceId: string, action: LearnedRangeAction): Promise<LearnedRangeRuntime> {
    const device = this.storage.getDevice(deviceId);
    if (!device) {
      throw new Error("Device not found");
    }
    this.runtimeCache.ensureDevice(device);
    const current = this.runtimeCache.getLearnedRange(deviceId);
    if (!current) {
      throw new Error("Learned range runtime unavailable");
    }
    if (device.discovery.status !== "online" || !this.learnedRangeCommandAvailable(device)) {
      throw new Error("当前设备离线或 MQTT 未连接，无法执行学习探测范围操作。");
    }

    if (action === "start") {
      if (["confirming_single_target", "starting", "learning", "stopping", "querying"].includes(current.status)) {
        return current;
      }
      const runtime = this.runtimeCache.updateLearnedRange(deviceId, {
        status: "confirming_single_target",
        learningEnabled: false,
        singleTargetConfirmCount: 0,
        error: undefined,
        message: "正在确认单目标条件，等待 3 帧目标数为 1 的轨迹数据。",
      });
      this.notifyRuntime(deviceId);
      return runtime ?? current;
    }

    if (action === "stop") {
      if (current.status === "confirming_single_target") {
        const runtime = this.runtimeCache.updateLearnedRange(deviceId, {
          status: "idle",
          singleTargetConfirmCount: 0,
          message: "学习确认已取消。",
        });
        this.notifyRuntime(deviceId);
        return runtime ?? current;
      }
      if (!["learning", "starting"].includes(current.status)) {
        return current;
      }
      this.runtimeCache.updateLearnedRange(deviceId, { status: "stopping", message: "正在停止学习。" });
      this.notifyRuntime(deviceId);
      const requestId = `${device.id}-learn-stop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        const resultPromise = this.waitForLearnedRangeResult(
          this.pendingLearnedRangeSet,
          deviceId,
          requestId,
          "Timed out waiting for learned range stop result",
        );
        if (!this.mqttBridge.publishLearnedTrajectoryRangeSetCommand(device, {
          request_id: requestId,
          learning_enabled: false,
        })) {
          this.pendingLearnedRangeSet.get(requestId)?.reject(new Error("Failed to publish learned range stop command"));
        }
        const result = await resultPromise;
        if (!result.ok) {
          throw new Error(result.error || "Device rejected learned range stop");
        }
        await new Promise((resolve) => setTimeout(resolve, 30));
        return await this.queryLearnedRange(deviceId);
      } catch (error) {
        this.runtimeCache.updateLearnedRange(deviceId, {
          status: "error",
          learningEnabled: false,
          error: error instanceof Error ? error.message : String(error),
          message: "学习已停止，但最终范围读取失败。",
        });
        this.notifyRuntime(deviceId);
        throw error;
      }
    }

    if (["confirming_single_target", "starting", "learning", "stopping"].includes(current.status)) {
      throw new Error("学习探测范围进行中，请先关闭学习后再查询结果。");
    }
    return this.queryLearnedRange(deviceId);
  }

  handleTrajectorySnapshot(deviceId: string, snapshot: TrajectorySnapshot): boolean {
    const device = this.storage.getDevice(deviceId);
    if (device) {
      this.runtimeCache.ensureDevice(device);
    }
    const learned = this.runtimeCache.getLearnedRange(deviceId);
    if (learned?.status === "confirming_single_target") {
      if (snapshot.targetCount === 1) {
        const count = learned.singleTargetConfirmCount + 1;
        if (count >= 3) {
          this.runtimeCache.updateLearnedRange(deviceId, {
            status: "starting",
            singleTargetConfirmCount: count,
            message: "单目标条件已确认，正在启动学习。",
          });
          this.notifyRuntime(deviceId);
          void this.startLearningAfterConfirmation(deviceId);
        } else {
          this.runtimeCache.updateLearnedRange(deviceId, {
            singleTargetConfirmCount: count,
            message: `正在确认单目标条件，已确认 ${count}/3。`,
          });
          this.notifyRuntime(deviceId);
        }
      } else {
        this.runtimeCache.updateLearnedRange(deviceId, {
          singleTargetConfirmCount: 0,
          message: "开始学习前请确保探测范围内只有一个轨迹目标。",
        });
        this.notifyRuntime(deviceId);
      }
    }
    return this.runtimeCache.updateTrajectory(deviceId, snapshot);
  }

  async handleTagEventSnapshot(deviceId: string, snapshot: TagEventSnapshot): Promise<TagEventHandlingResult> {
    const device = this.storage.getDevice(deviceId);
    if (device) {
      this.runtimeCache.ensureDevice(device);
    }
    const updated = this.runtimeCache.updateTagRegion(deviceId, snapshot);
    let entry: DeviceLogEntry | undefined;
    if (device && this.deviceLogStorage) {
      try {
        const region = device.regionConfig.regions.find((candidate) => candidate.index === snapshot.tagIndex);
        if (!region) {
          this.logger.warn(
            {
              deviceId,
              tagIndex: snapshot.tagIndex,
              configuredIndexes: device.regionConfig.regions.map((candidate) => candidate.index),
            },
            "MQTT tag event has no configured region",
          );
        } else if (!region.enabled) {
          this.logger.warn(
            { deviceId, tagIndex: snapshot.tagIndex, regionId: region.id },
            "MQTT tag event region is disabled",
          );
        } else {
          const compatible =
            (region.regionType === "status_detection" && snapshot.tagType === "people_counting") ||
            (region.regionType === "approach_depart" && snapshot.tagType === "approach_away") ||
            (region.regionType === "boundary" && snapshot.tagType === "boundary") ||
            region.regionType === "noise" ||
            region.regionType === "empty_tag";
          if (!compatible) {
            this.logger.warn(
              {
                deviceId,
                tagIndex: snapshot.tagIndex,
                configuredRegionType: region.regionType,
                eventTagType: snapshot.tagType,
              },
              "MQTT tag event type does not match configured region",
            );
          }
        }
        const recordedEntry = await this.deviceLogStorage.recordTagEvent(device, snapshot);
        if (recordedEntry) {
          entry = recordedEntry;
          this.logger.info(
            { deviceId, tagIndex: snapshot.tagIndex, eventType: recordedEntry.eventType, persisted: device.logRetention?.mode !== "none" },
            device.logRetention?.mode === "none" ? "Device region event kept in memory" : "Device region event persisted",
          );
        }
      } catch (error) {
        this.logger.error({ deviceId, tagIndex: snapshot.tagIndex, err: error }, "Failed to persist device region event");
      }
    }
    return { updated, entry, persisted: entry ? device?.logRetention?.mode !== "none" : undefined };
  }

  getDeviceLogCalendar(deviceId: string, year: number, month: number): DeviceLogCalendar {
    if (!this.storage.getDevice(deviceId)) {
      throw new Error("Device not found");
    }
    if (!this.deviceLogStorage) {
      throw new Error("Device logs unavailable");
    }
    return this.deviceLogStorage.getCalendar(deviceId, year, month);
  }

  getDeviceLogs(deviceId: string, date: string, page: number, pageSize: number): DeviceLogPage {
    const device = this.storage.getDevice(deviceId);
    if (!device) {
      throw new Error("Device not found");
    }
    if (!this.deviceLogStorage) {
      throw new Error("Device logs unavailable");
    }
    return this.deviceLogStorage.getLogs(deviceId, date, page, pageSize, {
      deviceName: device.name || device.prefix,
      deploymentName: device.deploymentName || "",
    });
  }

  handleMultiTagConfigResult(deviceId: string, snapshot: MultiTagConfigResultSnapshot): void {
    if (!snapshot.requestId) {
      return;
    }
    const pending = this.pendingMultiTagConfig.get(snapshot.requestId);
    if (!pending || pending.deviceId !== deviceId) {
      return;
    }
    if (snapshot.ok) {
      pending.resolve();
      return;
    }
    pending.reject(new Error(snapshot.error || "Multi tag config rejected by device"));
  }

  handleConfigFileRangeResult(deviceId: string, snapshot: ConfigFileRangeResultSnapshot): void {
    if (!snapshot.requestId) {
      return;
    }
    const pending = this.pendingConfigFileRange.get(snapshot.requestId);
    if (!pending || pending.deviceId !== deviceId) {
      return;
    }
    if (snapshot.ok) {
      pending.resolve();
      return;
    }
    pending.reject(new Error(snapshot.error || "Config file range rejected by device"));
  }

  handleLearnedTrajectoryRangeState(deviceId: string, snapshot: LearnedTrajectoryRangeSnapshot): void {
    const device = this.storage.getDevice(deviceId);
    if (!device) {
      return;
    }
    this.runtimeCache.ensureDevice(device);
    const current = this.runtimeCache.getLearnedRange(deviceId);
    this.runtimeCache.updateLearnedRange(deviceId, {
      learningEnabled: snapshot.learningEnabled,
      pointCount: snapshot.learningEnabled ? 0 : snapshot.pointCount,
      status: snapshot.learningEnabled ? "learning" : (current?.status === "querying" ? "querying" : current?.status ?? "idle"),
    });
    this.notifyRuntime(deviceId);
  }

  handleLearnedTrajectoryRangeSetResult(deviceId: string, snapshot: LearnedTrajectoryRangeResultSnapshot): void {
    if (!snapshot.requestId) {
      return;
    }
    const pending = this.pendingLearnedRangeSet.get(snapshot.requestId);
    if (!pending || pending.deviceId !== deviceId) {
      return;
    }
    if (snapshot.ok) {
      pending.resolve(snapshot);
    } else {
      pending.reject(new Error(snapshot.error || "Learned range command rejected by device"));
    }
  }

  handleLearnedTrajectoryRangeQueryResult(deviceId: string, snapshot: LearnedTrajectoryRangeResultSnapshot): void {
    if (!snapshot.requestId) {
      return;
    }
    const pending = this.pendingLearnedRangeQuery.get(snapshot.requestId);
    if (!pending || pending.deviceId !== deviceId) {
      return;
    }
    if (snapshot.ok) {
      pending.resolve(snapshot);
    } else {
      pending.reject(new Error(snapshot.error || "Learned range query rejected by device"));
    }
  }
}
