export interface RangeBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export type RegionType =
  | "status_detection"
  | "noise"
  | "approach_depart"
  | "boundary"
  | "empty_tag";

export type RegionGeometry =
  | {
      shape: "rect";
      centerXCm: number;
      centerYCm: number;
      widthCm: number;
      heightCm: number;
    }
  | {
      shape: "circle";
      centerXCm: number;
      centerYCm: number;
      radiusCm: number;
    };

export type RegionGeometryMeters =
  | {
      shape: "rect";
      centerX: number;
      centerY: number;
      width: number;
      height: number;
    }
  | {
      shape: "circle";
      centerX: number;
      centerY: number;
      radius: number;
    };

export type DetectionRangeMode = "rect" | "learned" | "custom";

export interface DetectionRangeConfig {
  mode: DetectionRangeMode;
  appliedMode?: DetectionRangeMode;
  rectCm: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  learnedPointsCm: Array<{ x: number; y: number }>;
  customPointsCm: Array<{ x: number; y: number }>;
  customConfirmed: boolean;
}

export interface BaseMapInstance {
  id: string;
  sourceType: "system" | "user";
  sourceId: string;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  visible: boolean;
  zIndex: number;
}

export type RegionDeviceSyncStatus = "synced" | "pending" | "local_only";

export interface RegionSyncState {
  fourSidedRange: RegionDeviceSyncStatus;
  regionMcuIo: RegionDeviceSyncStatus;
  updatedAt?: string;
}

export interface RegionOverlay {
  id: string;
  label: string;
  active: boolean;
  x: number;
  y: number;
  regionType?: RegionType;
  geometry?: RegionGeometryMeters;
  movingCount?: number;
  staticCount?: number;
  boundaryState?: string;
  approachAwayState?: string;
}

export interface StoredRegionConfigRegion {
  id: string;
  index: number;
  label: string;
  regionType: RegionType;
  geometry: RegionGeometry;
  ioIndex: 0 | 2 | 3 | 4 | 5 | 6;
  mcuIo: number;
  x: number;
  y: number;
  enabled: boolean;
  visible: boolean;
}

export interface StoredRegionConfig {
  version: 2;
  coordinate: RangeBox;
  rangeBox: RangeBox;
  regions: StoredRegionConfigRegion[];
  detection: DetectionRangeConfig;
  backgroundInstances: BaseMapInstance[];
  syncState: RegionSyncState;
}

export interface C4004DeviceSettings {
  presenceEnable?: boolean;
  trajectoryTrackEnable?: boolean;
  trajectoryLed?: boolean;
  motionLed?: boolean;
  installZAngle?: number;
  realTimePeopleTime?: number;
  trackMeters?: number;
  trackExistsTime?: number;
  checkToActiveFrames?: number;
  unmannedTime?: number;
  zone1McuIo?: number;
  zone2McuIo?: number;
  zone3McuIo?: number;
  zone4McuIo?: number;
  zone5McuIo?: number;
  zone6McuIo?: number;
}

export interface StoredZoneSnapshot {
  updatedAt: string;
  presenceStates: Array<{ id: string; active: boolean }>;
  zones: Array<{
    index: number;
    active: boolean;
    movingCount?: number;
    staticCount?: number;
    boundaryState?: string;
    approachAwayState?: string;
  }>;
  counts: {
    peopleCount: number;
    targetCount: number;
    movingCount: number;
    staticCount: number;
  };
}

export interface TrajectoryPoint {
  id: number;
  x: number;
  y: number;
  feature: "static" | "moving" | "unknown";
  speed?: number;
}

export interface TrajectorySnapshot {
  topic: string;
  topicPrefix: string;
  mqttKey: string;
  targetCount: number;
  points: TrajectoryPoint[];
  hex: string;
  updatedAt: string;
}

export interface MmwaveOverviewMetrics {
  deviceCount: number;
  peopleCount: number;
  targetCount: number;
  staticCount: number;
}

export interface MmwaveOverviewDeviceCard {
  id: string;
  name: string;
  model: string;
  online: boolean;
  status: string;
  signal: number;
  peopleCount: number;
  targetCount: number;
  staticCount: number;
  trajectoryAvailable: boolean;
  mqttConnected: boolean;
  rangeBox: RangeBox;
  detection: DetectionRangeConfig;
  coordinate: RangeBox;
  regions: RegionOverlay[];
  targets: TrajectoryPoint[];
}

export interface MmwaveDeviceDetail {
  id: string;
  name: string;
  model: string;
  deviceId: string;
  online: boolean;
  status: string;
  signal: number;
  peopleCount: number;
  targetCount: number;
  firmwareVersion?: string;
  trajectoryAvailable: boolean;
  mqttConnected: boolean;
  lastUpdated: string;
  rangeBox: RangeBox;
  detection: DetectionRangeConfig;
  coordinate: RangeBox;
  regions: RegionOverlay[];
  targets: TrajectoryPoint[];
  movingCount: number;
  staticCount: number;
  ioStates: Array<{ id: string; label: string; active: boolean }>;
  basics: Array<{ key: string; label: string; value: string }>;
  actions: {
    canReset: boolean;
    canRefresh: boolean;
    canManageRegions: boolean;
  };
}

export interface MmwaveOverviewResponse {
  ok: boolean;
  metrics: MmwaveOverviewMetrics;
  devices: MmwaveOverviewDeviceCard[];
}
