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

export type DeviceLogEventType =
  | "status_changed"
  | "approach"
  | "away"
  | "enter"
  | "exit";

export type DeviceLogRetentionMode = "forever" | "limited" | "none";
export type DeviceLogRetentionUnit = "day" | "week" | "month" | "year";

export interface DeviceLogRetention {
  mode: DeviceLogRetentionMode;
  value?: number;
  unit?: DeviceLogRetentionUnit;
  updatedAt: string;
}

export interface DeviceLogEntry {
  occurredAt: string;
  localDate: string;
  deviceName: string;
  deploymentName: string;
  regionIndex: number;
  regionLabel: string;
  regionType: RegionType;
  eventType: DeviceLogEventType;
  movingCount?: number;
  staticCount?: number;
  totalCount?: number;
  message: string;
}

export interface DeviceLogCalendar {
  year: number;
  month: number;
  years: number[];
  months: number[];
  days: number[];
}

export interface DeviceLogPage {
  date: string;
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  logs: DeviceLogEntry[];
}

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

export type LearnedRangeStatus =
  | "idle"
  | "confirming_single_target"
  | "starting"
  | "learning"
  | "stopping"
  | "querying"
  | "ready"
  | "error";

export interface LearnedRangeRuntime {
  status: LearnedRangeStatus;
  learningEnabled: boolean;
  singleTargetConfirmCount: number;
  pointCount: number;
  pointsCm: Array<{ x: number; y: number }>;
  error?: string;
  message?: string;
  updatedAt: string;
}

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
  /** Degrees; rotate around image center. */
  rotationDeg?: number;
  visible: boolean;
  zIndex: number;
}

export type RegionDeviceSyncStatus = "synced" | "pending" | "local_only";

export interface RegionSyncState {
  fourSidedRange: RegionDeviceSyncStatus;
  regionMcuIo: RegionDeviceSyncStatus;
  tagConfig: RegionDeviceSyncStatus;
  customRange: RegionDeviceSyncStatus;
  learnedRange: RegionDeviceSyncStatus;
  updatedAt?: string;
}

export type TagEventType = "none" | "boundary" | "approach_away" | "people_counting" | "noise";
export type TagBoundaryState = "enter" | "exit" | "none";
export type TagApproachAwayState = "approach" | "away" | "none";

export interface TagRegionRuntime {
  tagIndex: number;
  tagType: TagEventType;
  tagTypeCode: number;
  ioIndex: number;
  centerXCm?: number;
  centerYCm?: number;
  movingCount?: number;
  staticCount?: number;
  boundaryState?: TagBoundaryState;
  approachAwayState?: TagApproachAwayState;
  receivedAt: string;
  dataAvailable: boolean;
}

export interface RegionOverlay {
  id: string;
  label: string;
  active: boolean;
  x: number;
  y: number;
  regionType?: RegionType;
  geometry?: RegionGeometryMeters;
  tagIndex?: number;
  tagType?: TagEventType;
  tagTypeCode?: number;
  tagDataAvailable?: boolean;
  tagUpdatedAt?: string;
  tagTypeMismatch?: boolean;
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

export interface RegionViewPreferences {
  gridVisible: boolean;
  backgroundVisible: boolean;
}

export interface StoredRegionConfig {
  version: 2;
  coordinate: RangeBox;
  rangeBox: RangeBox;
  regions: StoredRegionConfigRegion[];
  detection: DetectionRangeConfig;
  backgroundInstances: BaseMapInstance[];
  viewPreferences: RegionViewPreferences;
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
  backgroundInstances: BaseMapInstance[];
  viewPreferences: RegionViewPreferences;
  deploymentName?: string;
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
  backgroundInstances: BaseMapInstance[];
  viewPreferences: RegionViewPreferences;
  deploymentName?: string;
  movingCount: number;
  staticCount: number;
  ioStates: Array<{ id: string; label: string; active: boolean }>;
  basics: Array<{ key: string; label: string; value: string }>;
  actions: {
    canReset: boolean;
    canRefresh: boolean;
    canManageRegions: boolean;
  };
  learnedRange: LearnedRangeRuntime;
}

export interface MmwaveOverviewResponse {
  ok: boolean;
  metrics: MmwaveOverviewMetrics;
  devices: MmwaveOverviewDeviceCard[];
}
