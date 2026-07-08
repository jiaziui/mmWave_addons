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
  binding: {
    entityCount: number;
  };
  installInfo?: {
    installMode: "side";
    installAngleDeg: 0;
    installHeightM: number;
  };
  detectionMode?: "high_sensitivity" | "static_stable";
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
  coordinate: RangeBox;
  rangeBox: RangeBox;
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

export interface MetaConfig {
  appVersion: string;
  port: number;
  mode: string;
  linked: boolean;
  mqttConfigured: boolean;
  mqttConnected: boolean;
  dataDir: string;
}

const ingressAware = (relativePath: string): string => {
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `/${relativePath.replace(/^\/+/, "")}`;
  }

  const base = window.location.pathname.endsWith("/") ? window.location.pathname : `${window.location.pathname}/`;
  return `${base}${relativePath.replace(/^\/+/, "")}`;
};

const handle = async <T,>(response: Response): Promise<T> => {
  const text = await response.text();
  const data = text.trim() ? (JSON.parse(text) as T & { error?: string }) : null;

  if (!response.ok) {
    throw new Error((data && typeof data === "object" && "error" in data && data.error) || response.statusText);
  }

  if (data === null) {
    throw new Error("No response body");
  }

  return data;
};

export const fetchMeta = async (): Promise<MetaConfig> =>
  handle<MetaConfig>(await fetch(ingressAware("api/meta/config")));

export const discoverDevices = async (): Promise<{ ok: boolean; devices: StoredMmwaveDevice[] }> =>
  handle(await fetch(ingressAware("api/mmwave/devices/discover")));

export const fetchDevices = async (): Promise<{ ok: boolean; devices: StoredMmwaveDevice[] }> =>
  handle(await fetch(ingressAware("api/mmwave/devices")));

export const fetchOverview = async (): Promise<{ ok: boolean; metrics: MmwaveOverviewMetrics; devices: MmwaveOverviewDeviceCard[] }> =>
  handle(await fetch(ingressAware("api/mmwave/overview")));

export const fetchDeviceDetail = async (
  deviceId: string,
): Promise<{ ok: boolean; detail: MmwaveDeviceDetail }> =>
  handle(await fetch(ingressAware(`api/mmwave/devices/${encodeURIComponent(deviceId)}/detail`)));

export const refreshDevice = async (
  deviceId: string,
): Promise<{ ok: boolean; detail: MmwaveDeviceDetail }> =>
  handle(
    await fetch(ingressAware(`api/mmwave/devices/${encodeURIComponent(deviceId)}/actions/refresh`), {
      method: "POST",
    }),
  );

export const resetDevice = async (
  deviceId: string,
): Promise<{ ok: boolean; detail: MmwaveDeviceDetail }> =>
  handle(
    await fetch(ingressAware(`api/mmwave/devices/${encodeURIComponent(deviceId)}/actions/reset`), {
      method: "POST",
    }),
  );

export const unbindDevice = async (
  deviceId: string,
): Promise<{ ok: boolean; devices: StoredMmwaveDevice[] }> =>
  handle(
    await fetch(ingressAware(`api/mmwave/devices/${encodeURIComponent(deviceId)}/actions/unbind`), {
      method: "POST",
    }),
  );

export const initializeDevice = async (
  deviceId: string,
  payload: {
    deviceNoMode: "auto" | "custom";
    customDeviceNo?: string;
    installHeightM: number;
    detectionMode: "high_sensitivity" | "static_stable";
  },
): Promise<{ ok: boolean; device: StoredMmwaveDevice }> =>
  handle(
    await fetch(ingressAware(`api/mmwave/devices/${encodeURIComponent(deviceId)}/actions/initialize`), {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );

export const createLiveWsUrl = (): string => {
  const path = ingressAware("api/live/ws");
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
};
