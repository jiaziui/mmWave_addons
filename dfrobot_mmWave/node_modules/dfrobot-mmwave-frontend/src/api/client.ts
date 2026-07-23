export type DetectionMode = 1 | 2;
export type RegionType = "status_detection" | "noise" | "approach_depart" | "boundary" | "empty_tag";
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
export type DeviceLogEventType = "status_changed" | "approach" | "away" | "enter" | "exit";
export type DeviceLogRetentionMode = "forever" | "limited" | "none";
export type DeviceLogRetentionUnit = "day" | "week" | "month" | "year";

export interface DeviceLogRetention {
  mode: DeviceLogRetentionMode;
  value?: number;
  unit?: DeviceLogRetentionUnit;
  updatedAt: string;
}

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
  /** Degrees; rotate around image center. */
  rotationDeg?: number;
  visible: boolean;
  zIndex: number;
}

export interface RegionViewPreferences {
  gridVisible: boolean;
  backgroundVisible: boolean;
}

export interface StoredRegionConfig {
  version: 2;
  coordinate: RangeBox;
  rangeBox: RangeBox;
  detection: DetectionRangeConfig;
  regions: RegionDefinition[];
  backgroundInstances: BaseMapInstance[];
  viewPreferences?: RegionViewPreferences;
  syncState: {
    fourSidedRange: "synced" | "pending" | "local_only";
    regionMcuIo: "synced" | "pending" | "local_only";
    tagConfig: "synced" | "pending" | "local_only";
    customRange: "synced" | "pending" | "local_only";
    learnedRange: "synced" | "pending" | "local_only";
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
  logRetention?: DeviceLogRetention;
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
  tagIndex?: number;
  tagType?: "none" | "boundary" | "approach_away" | "people_counting" | "noise";
  tagTypeCode?: number;
  tagDataAvailable?: boolean;
  tagUpdatedAt?: string;
  tagTypeMismatch?: boolean;
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
  backgroundInstances?: BaseMapInstance[];
  viewPreferences?: RegionViewPreferences;
  deploymentName?: string;
}

export interface MmwaveDeviceDetail extends MmwaveOverviewDeviceCard {
  deviceId: string;
  firmwareVersion?: string;
  lastUpdated: string;
  movingCount: number;
  ioStates: Array<{ id: string; label: string; active: boolean }>;
  basics: Array<{ key: string; label: string; value: string }>;
  actions: { canReset: boolean; canRefresh: boolean; canManageRegions: boolean };
  learnedRange: LearnedRangeRuntime;
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
  logRetention: DeviceLogRetention;
  nextCleanupAt: string;
}

export interface ConfigApplyResult {
  fourSidedRange: "applied" | "failed" | "skipped";
  regionMcuIo: "applied" | "failed" | "skipped";
  tagConfig: "applied" | "failed" | "skipped";
  customRange: "applied" | "failed" | "skipped";
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

const LOCAL_MOCK_STORAGE_KEY = "dfrobot_mmwave_local_mock";

/** Cursor Simple Browser may turn `?mock=1` into `?mock%3D1` (param name becomes `mock=1`). */
const queryRequestsLocalMock = (search: string): boolean => {
  const params = new URLSearchParams(search);
  if (params.get("mock") === "1") {
    return true;
  }
  if (params.has("mock=1")) {
    return true;
  }
  return /(?:^|[?&])mock(?:=|%3[Dd])1(?:&|$)/.test(search);
};

const localMockEnabled = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return false;
  }
  if (queryRequestsLocalMock(window.location.search)) {
    try {
      sessionStorage.setItem(LOCAL_MOCK_STORAGE_KEY, "1");
    } catch {
      // ignore quota / private mode
    }
    return true;
  }
  try {
    return sessionStorage.getItem(LOCAL_MOCK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

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
export const fetchDeviceLogCalendar = async (
  deviceId: string,
  year: number,
  month: number,
): Promise<{ ok: boolean } & DeviceLogCalendar> =>
  localMockEnabled()
    ? (await mockApi()).mockFetchDeviceLogCalendar(deviceId, year, month)
    : handle(await fetch(ingressAware(
        `api/mmwave/devices/${encodeURIComponent(deviceId)}/logs/calendar?year=${year}&month=${month}`,
      )));
export const fetchDeviceLogs = async (
  deviceId: string,
  date: string,
  page = 1,
  pageSize = 50,
): Promise<{ ok: boolean } & DeviceLogPage> =>
  localMockEnabled()
    ? (await mockApi()).mockFetchDeviceLogs(deviceId, date, page, pageSize)
    : handle(await fetch(ingressAware(
        `api/mmwave/devices/${encodeURIComponent(deviceId)}/logs?date=${encodeURIComponent(date)}&page=${page}&pageSize=${pageSize}`,
      )));
export const fetchDeviceConfig = async (deviceId: string): Promise<{ ok: boolean; config: MmwaveDeviceConfig }> =>
  localMockEnabled() ? (await mockApi()).mockFetchConfig(deviceId) : handle(await fetch(ingressAware(`api/mmwave/devices/${encodeURIComponent(deviceId)}/config`)));

export const updateDeviceConfig = async (
  deviceId: string,
  payload: {
    deviceSettings?: C4004DeviceSettings;
    regionConfig?: StoredRegionConfig;
    logRetention?: Omit<DeviceLogRetention, "updatedAt">;
    apply?: { fourSidedRange?: boolean; regionMcuIo?: boolean; tagConfig?: boolean; customRange?: boolean };
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
export const factoryResetDevice = async (deviceId: string): Promise<{ ok: boolean; config: MmwaveDeviceConfig }> =>
  localMockEnabled() ? (await mockApi()).mockFactoryResetDevice(deviceId) : postDeviceAction(deviceId, "factory-reset");
export const clearPeopleCount = async (deviceId: string): Promise<{ ok: boolean; detail: MmwaveDeviceDetail }> =>
  localMockEnabled() ? (await mockApi()).mockClearPeopleCount(deviceId) : postDeviceAction(deviceId, "clear-people-count");
export const unbindDevice = async (deviceId: string): Promise<{ ok: boolean; devices: StoredMmwaveDevice[] }> =>
  localMockEnabled() ? (await mockApi()).mockUnbind(deviceId) : postDeviceAction(deviceId, "unbind");
export const initializeDevice = async (
  deviceId: string,
  payload: { deviceNoMode: "auto" | "custom"; customDeviceNo?: string; installHeightM: number; detectionMode: DetectionMode },
): Promise<{ ok: boolean; device: StoredMmwaveDevice }> =>
  localMockEnabled() ? (await mockApi()).mockInitializeDevice(deviceId, payload) : postDeviceAction(deviceId, "initialize", payload);

export const learnedRangeAction = async (
  deviceId: string,
  action: "start" | "stop" | "query",
): Promise<{ ok: boolean; learnedRange: LearnedRangeRuntime; detail?: MmwaveDeviceDetail }> =>
  localMockEnabled()
    ? (await mockApi()).mockLearnedRangeAction(deviceId, action)
    : postDeviceAction(deviceId, "learned-range", { action });

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
export const deleteUserBaseMap = async (assetId: string): Promise<{ ok: boolean }> =>
  handle(await fetch(ingressAware(`api/mmwave/base-maps/user/${encodeURIComponent(assetId)}`), {
    method: "DELETE",
  }));
