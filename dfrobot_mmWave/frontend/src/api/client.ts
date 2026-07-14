export type DetectionMode = 1 | 2;
export type RegionType = "status_detection" | "noise" | "approach_depart" | "boundary" | "empty_tag";
export type DetectionRangeMode = "rect" | "learned" | "custom";

export interface RangeBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export type RegionGeometry =
  | { shape: "rect"; centerXCm: number; centerYCm: number; widthCm: number; heightCm: number }
  | { shape: "circle"; centerXCm: number; centerYCm: number; radiusCm: number };

export type RegionGeometryMeters =
  | { shape: "rect"; centerX: number; centerY: number; width: number; height: number }
  | { shape: "circle"; centerX: number; centerY: number; radius: number };

export interface RegionDefinition {
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

export interface DetectionRangeConfig {
  mode: DetectionRangeMode;
  appliedMode?: DetectionRangeMode;
  rectCm: { xMin: number; xMax: number; yMin: number; yMax: number };
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

export interface StoredRegionConfig {
  version: 2;
  coordinate: RangeBox;
  rangeBox: RangeBox;
  detection: DetectionRangeConfig;
  regions: RegionDefinition[];
  backgroundInstances: BaseMapInstance[];
  syncState: {
    fourSidedRange: "synced" | "pending" | "local_only";
    regionMcuIo: "synced" | "pending" | "local_only";
    updatedAt?: string;
  };
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
  counts: { peopleCount: number; targetCount: number; movingCount: number; staticCount: number };
}

export interface StoredMmwaveDevice {
  id: string;
  deviceNo?: string;
  initialized: boolean;
  profileId: "c4004";
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
  binding: { entityCount: number };
  installInfo?: { installMode: "side"; installAngleDeg: 0; installHeightM: number };
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

export interface TrajectoryPoint {
  id: number;
  x: number;
  y: number;
  feature: "static" | "moving" | "unknown";
  speed?: number;
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
  coordinate: RangeBox;
  rangeBox: RangeBox;
  detection: DetectionRangeConfig;
  regions: RegionOverlay[];
  targets: TrajectoryPoint[];
}

export interface MmwaveDeviceDetail extends MmwaveOverviewDeviceCard {
  deviceId: string;
  firmwareVersion?: string;
  lastUpdated: string;
  movingCount: number;
  ioStates: Array<{ id: string; label: string; active: boolean }>;
  basics: Array<{ key: string; label: string; value: string }>;
  actions: { canReset: boolean; canRefresh: boolean; canManageRegions: boolean };
}

export interface MmwaveDeviceConfig {
  id: string;
  deviceNo?: string;
  initialized: boolean;
  profileId: "c4004";
  prefix: string;
  mqttTopicPrefix: string;
  mqttKey: string;
  installInfo?: StoredMmwaveDevice["installInfo"];
  detectionMode?: DetectionMode;
  regionConfig: StoredRegionConfig;
  deviceSettings: C4004DeviceSettings;
}

export interface ConfigApplyResult {
  fourSidedRange: "applied" | "failed" | "skipped";
  regionMcuIo: "applied" | "failed" | "skipped";
  warnings: string[];
}

export interface UserBaseMapAsset {
  id: string;
  originalName: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  size: number;
  createdAt: string;
}

export interface MetaConfig {
  appVersion: string;
  port: number;
  mode: string;
  linked: boolean;
  mqttConfigured: boolean;
  mqttConnected: boolean;
  dataDir: string;
}

export const ingressAware = (relativePath: string): string => {
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `/${relativePath.replace(/^\/+/, "")}`;
  }
  const base = window.location.pathname.endsWith("/") ? window.location.pathname : `${window.location.pathname}/`;
  return `${base}${relativePath.replace(/^\/+/, "")}`;
};

const localMockEnabled = (): boolean =>
  ["localhost", "127.0.0.1"].includes(window.location.hostname) && new URLSearchParams(window.location.search).get("mock") === "1";

export const isLocalMockMode = (): boolean => localMockEnabled();

const mockApi = () => import("./mockApi");

const handle = async <T,>(response: Response): Promise<T> => {
  const responseText = await response.text();
  const data = responseText.trim() ? (JSON.parse(responseText) as T & { error?: string }) : null;
  if (!response.ok) {
    throw new Error((data && typeof data === "object" && "error" in data && data.error) || response.statusText);
  }
  if (data === null) {
    throw new Error("No response body");
  }
  return data;
};

export const fetchMeta = async (): Promise<MetaConfig> => localMockEnabled()
  ? (await mockApi()).mockFetchMeta()
  : handle(await fetch(ingressAware("api/meta/config")));
export const discoverDevices = async (): Promise<{ ok: boolean; devices: StoredMmwaveDevice[] }> =>
  localMockEnabled() ? (await mockApi()).mockFetchDevices() : handle(await fetch(ingressAware("api/mmwave/devices/discover")));
export const fetchDevices = async (): Promise<{ ok: boolean; devices: StoredMmwaveDevice[] }> =>
  localMockEnabled() ? (await mockApi()).mockFetchDevices() : handle(await fetch(ingressAware("api/mmwave/devices")));
export const fetchOverview = async (): Promise<{ ok: boolean; metrics: MmwaveOverviewMetrics; devices: MmwaveOverviewDeviceCard[] }> =>
  localMockEnabled() ? (await mockApi()).mockFetchOverview() : handle(await fetch(ingressAware("api/mmwave/overview")));
export const fetchDeviceDetail = async (deviceId: string): Promise<{ ok: boolean; detail: MmwaveDeviceDetail }> =>
  localMockEnabled() ? (await mockApi()).mockFetchDetail(deviceId) : handle(await fetch(ingressAware(`api/mmwave/devices/${encodeURIComponent(deviceId)}/detail`)));
export const fetchDeviceConfig = async (deviceId: string): Promise<{ ok: boolean; config: MmwaveDeviceConfig }> =>
  localMockEnabled() ? (await mockApi()).mockFetchConfig(deviceId) : handle(await fetch(ingressAware(`api/mmwave/devices/${encodeURIComponent(deviceId)}/config`)));

export const updateDeviceConfig = async (
  deviceId: string,
  payload: {
    deviceSettings?: C4004DeviceSettings;
    regionConfig?: StoredRegionConfig;
    apply?: { fourSidedRange?: boolean; regionMcuIo?: boolean };
  },
): Promise<{ ok: boolean; config: MmwaveDeviceConfig; applyResult: ConfigApplyResult }> =>
  localMockEnabled() ? (await mockApi()).mockUpdateConfig(deviceId, payload) : handle(await fetch(ingressAware(`api/mmwave/devices/${encodeURIComponent(deviceId)}/config`), {
    method: "PUT",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  }));

const postDeviceAction = async <T,>(deviceId: string, action: string, body?: unknown): Promise<T> =>
  handle(await fetch(ingressAware(`api/mmwave/devices/${encodeURIComponent(deviceId)}/actions/${action}`), {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  }));

export const refreshDevice = async (deviceId: string): Promise<{ ok: boolean; detail: MmwaveDeviceDetail }> =>
  localMockEnabled() ? (await mockApi()).mockFetchDetail(deviceId) : postDeviceAction(deviceId, "refresh");
export const resetDevice = async (deviceId: string): Promise<{ ok: boolean; detail: MmwaveDeviceDetail }> =>
  localMockEnabled() ? (await mockApi()).mockFetchDetail(deviceId) : postDeviceAction(deviceId, "reset");
export const unbindDevice = async (deviceId: string): Promise<{ ok: boolean; devices: StoredMmwaveDevice[] }> =>
  localMockEnabled() ? (await mockApi()).mockUnbind(deviceId) : postDeviceAction(deviceId, "unbind");
export const initializeDevice = async (
  deviceId: string,
  payload: { deviceNoMode: "auto" | "custom"; customDeviceNo?: string; installHeightM: number; detectionMode: DetectionMode },
): Promise<{ ok: boolean; device: StoredMmwaveDevice }> =>
  localMockEnabled() ? (await mockApi()).mockInitializeDevice(deviceId, payload) : postDeviceAction(deviceId, "initialize", payload);

export const fetchUserBaseMaps = async (): Promise<{ ok: boolean; assets: UserBaseMapAsset[] }> =>
  localMockEnabled() ? { ok: true, assets: [] } : handle(await fetch(ingressAware("api/mmwave/base-maps/user")));
export const userBaseMapUrl = (assetId: string): string =>
  ingressAware(`api/mmwave/base-maps/user/${encodeURIComponent(assetId)}`);
export const uploadUserBaseMap = async (assetId: string, file: File): Promise<{ ok: boolean; asset: UserBaseMapAsset }> => {
  const body = new FormData();
  body.append("file", file);
  return handle(await fetch(ingressAware(`api/mmwave/base-maps/user/${encodeURIComponent(assetId)}`), {
    method: "PUT",
    body,
  }));
};
