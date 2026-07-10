export interface RangeBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface RegionOverlay {
  id: string;
  label: string;
  active: boolean;
  x: number;
  y: number;
}

export interface StoredRegionConfigRegion {
  id: string;
  label: string;
  x: number;
  y: number;
  enabled: boolean;
}

export interface StoredRegionConfig {
  coordinate: RangeBox;
  rangeBox: RangeBox;
  regions: StoredRegionConfigRegion[];
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
  firmwareVersion?: string;
  trajectoryAvailable: boolean;
  mqttConnected: boolean;
  lastUpdated: string;
  rangeBox: RangeBox;
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
