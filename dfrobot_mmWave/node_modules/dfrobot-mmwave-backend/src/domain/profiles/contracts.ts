import type { InitializeDeviceInput, StoredMmwaveDevice } from "../../config/storage";
import type { HaClient } from "../../ha/client";
import type { HaAreaRegistryEntry, HaDeviceRegistryEntry, HaEntityRegistryEntry, HaEntityState } from "../../ha/types";
import type {
  C4004DeviceSettings,
  MmwaveDeviceDetail,
  MmwaveOverviewDeviceCard,
  RangeBox,
  TagRegionRuntime,
  StoredRegionConfig,
  StoredZoneSnapshot,
  TrajectorySnapshot,
} from "../../types/mmwave";
import type {
  MmwaveProfileId,
  ProfileCapabilities,
  ProfileMqttTopics,
  ProfileSource,
  ProfileStatus,
} from "../../types/profiles";

export interface ProfileDiscoveryContext {
  states: HaEntityState[];
  statesById: Map<string, HaEntityState>;
  entityRegistryEntries: HaEntityRegistryEntry[];
  entityRegistry: Map<string, HaEntityRegistryEntry>;
  deviceRegistryEntries: HaDeviceRegistryEntry[];
  deviceRegistry: Map<string, HaDeviceRegistryEntry>;
  areaRegistryEntries: HaAreaRegistryEntry[];
  areaRegistry: Map<string, string | undefined>;
}

export interface ProfileDiscoveryCandidate {
  profileId: MmwaveProfileId;
  profileSource: ProfileSource;
  profileStatus: ProfileStatus;
  prefix: string;
  score: number;
  status: "online" | "offline";
  deviceId?: string;
  deviceName?: string;
  deploymentName?: string;
  manufacturer?: string;
  deviceModel?: string;
  firmwareVersion?: string;
  macAddress?: string;
  entityCount: number;
}

export interface ProfileRuntimeStateUpdates {
  regionConfig?: StoredRegionConfig;
  lastZoneSnapshot?: StoredZoneSnapshot;
}

export interface ProfileCardRuntime {
  trajectory: TrajectorySnapshot | null;
  tagRegions: Map<number, TagRegionRuntime>;
  mqttConnected: boolean;
}

export interface MmwaveProfileAdapter {
  id: MmwaveProfileId;
  displayName: string;
  metadataHints: readonly string[];
  markerValues: readonly string[];
  capabilities: ProfileCapabilities;
  mqttTopics: ProfileMqttTopics;
  runtimeSupported: boolean;
  mapEntityStates?(
    device: StoredMmwaveDevice,
    statesById: Map<string, HaEntityState>,
    entityRegistryEntries: readonly HaEntityRegistryEntry[],
  ): Map<string, HaEntityState>;
  resolveDeviceOnline?(
    device: StoredMmwaveDevice,
    statesById: Map<string, HaEntityState>,
    states: HaEntityState[],
  ): boolean;
  buildRuntimeState?(
    device: StoredMmwaveDevice,
    statesById: Map<string, HaEntityState>,
    options?: { forceSnapshot?: boolean },
  ): ProfileRuntimeStateUpdates;
  buildOverviewCard?(
    device: StoredMmwaveDevice,
    statesById: Map<string, HaEntityState>,
    runtime: ProfileCardRuntime,
  ): MmwaveOverviewDeviceCard;
  buildDeviceDetail?(
    device: StoredMmwaveDevice,
    statesById: Map<string, HaEntityState>,
    runtime: ProfileCardRuntime,
  ): MmwaveDeviceDetail;
  readDeviceSettings?(device: StoredMmwaveDevice, statesById: Map<string, HaEntityState>): C4004DeviceSettings;
  writeDeviceSettings?(client: HaClient, device: StoredMmwaveDevice, settings: C4004DeviceSettings): Promise<void>;
  applyFourSidedRange?(client: HaClient, device: StoredMmwaveDevice, rangeBox: RangeBox): Promise<void>;
  initializeDevice?(client: HaClient, device: StoredMmwaveDevice, payload: InitializeDeviceInput): Promise<void>;
  resetDevice?(client: HaClient, device: StoredMmwaveDevice): Promise<void>;
  factoryResetDevice?(client: HaClient, device: StoredMmwaveDevice): Promise<void>;
  clearPeopleCount?(client: HaClient, device: StoredMmwaveDevice): Promise<void>;
  getTrajectoryTopic?(device: StoredMmwaveDevice): string | null;
}
