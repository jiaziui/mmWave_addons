import type {
  ConfigApplyResult,
  DetectionMode,
  MetaConfig,
  MmwaveDeviceConfig,
  MmwaveDeviceDetail,
  MmwaveOverviewDeviceCard,
  MmwaveOverviewMetrics,
  StoredMmwaveDevice,
  StoredRegionConfig,
  TrajectoryPoint,
} from "./client";

const now = "2026-07-14T01:47:00.000Z";
let mockTick = 0;

const learnedPolygonCm = [
  { x: -320, y: 20 },
  { x: 280, y: 20 },
  { x: 360, y: 420 },
  { x: 120, y: 680 },
  { x: -180, y: 680 },
  { x: -360, y: 420 },
];

const customPolygonCm = [
  { x: -220, y: 80 },
  { x: 180, y: 80 },
  { x: 240, y: 520 },
  { x: -40, y: 620 },
  { x: -260, y: 420 },
];

const createRegionConfig = (variant: "kitchen" | "living" | "study"): StoredRegionConfig => {
  if (variant === "kitchen") {
    return {
      version: 2,
      coordinate: { xMin: -5, xMax: 5, yMin: -1, yMax: 9 },
      rangeBox: { xMin: -2, xMax: 2, yMin: 0, yMax: 7 },
      detection: {
        mode: "rect",
        appliedMode: "rect",
        rectCm: { xMin: -200, xMax: 200, yMin: 0, yMax: 700 },
        learnedPointsCm: [],
        customPointsCm: [],
        customConfirmed: false,
      },
      regions: [
        {
          id: "kitchen-boundary",
          index: 0,
          label: "核心警戒区-A",
          regionType: "boundary",
          geometry: { shape: "rect", centerXCm: 375, centerYCm: 312, widthCm: 375, heightCm: 250 },
          ioIndex: 0,
          mcuIo: -1,
          x: 3.75,
          y: 3.12,
          enabled: true,
          visible: true,
        },
        {
          id: "kitchen-table",
          index: 1,
          label: "外围监测区-B",
          regionType: "status_detection",
          geometry: { shape: "rect", centerXCm: 781, centerYCm: 281, widthCm: 312, heightCm: 312 },
          ioIndex: 2,
          mcuIo: 10,
          x: 7.81,
          y: 2.81,
          enabled: true,
          visible: true,
        },
        {
          id: "kitchen-approach",
          index: 2,
          label: "入口环形区",
          regionType: "approach_depart",
          geometry: { shape: "circle", centerXCm: 375, centerYCm: 625, radiusCm: 100 },
          ioIndex: 0,
          mcuIo: -1,
          x: 3.75,
          y: 6.25,
          enabled: true,
          visible: true,
        },
      ],
      backgroundInstances: [],
      syncState: { fourSidedRange: "synced", regionMcuIo: "synced", updatedAt: now },
    };
  }

  if (variant === "living") {
    return {
      version: 2,
      coordinate: { xMin: -5, xMax: 5, yMin: -1, yMax: 9 },
      rangeBox: { xMin: -3.6, xMax: 3.6, yMin: 0, yMax: 7.2 },
      detection: {
        mode: "learned",
        appliedMode: "learned",
        rectCm: { xMin: -360, xMax: 360, yMin: 0, yMax: 720 },
        learnedPointsCm: learnedPolygonCm,
        customPointsCm: [],
        customConfirmed: false,
      },
      regions: [
        {
          id: "living-sofa",
          index: 0,
          label: "沙发区域",
          regionType: "status_detection",
          geometry: { shape: "rect", centerXCm: 0, centerYCm: 430, widthCm: 360, heightCm: 180 },
          ioIndex: 3,
          mcuIo: 13,
          x: 0,
          y: 4.3,
          enabled: true,
          visible: true,
        },
        {
          id: "living-approach",
          index: 1,
          label: "靠近电视",
          regionType: "approach_depart",
          geometry: { shape: "circle", centerXCm: -210, centerYCm: 220, radiusCm: 90 },
          ioIndex: 0,
          mcuIo: -1,
          x: -2.1,
          y: 2.2,
          enabled: true,
          visible: true,
        },
        {
          id: "living-tv",
          index: 2,
          label: "电视边界",
          regionType: "boundary",
          geometry: { shape: "rect", centerXCm: -250, centerYCm: 120, widthCm: 140, heightCm: 80 },
          ioIndex: 0,
          mcuIo: -1,
          x: -2.5,
          y: 1.2,
          enabled: true,
          visible: true,
        },
      ],
      backgroundInstances: [
        {
          id: "bg-living-sofa",
          sourceType: "system",
          sourceId: "沙发",
          xCm: -220,
          yCm: 280,
          widthCm: 440,
          heightCm: 260,
          visible: true,
          zIndex: 0,
        },
      ],
      syncState: { fourSidedRange: "local_only", regionMcuIo: "synced", updatedAt: now },
    };
  }

  return {
    version: 2,
    coordinate: { xMin: -5, xMax: 5, yMin: -1, yMax: 9 },
    rangeBox: { xMin: -3, xMax: 3, yMin: 0, yMax: 6 },
    detection: {
      mode: "custom",
      appliedMode: "custom",
      rectCm: { xMin: -300, xMax: 300, yMin: 0, yMax: 600 },
      learnedPointsCm: [],
      customPointsCm: customPolygonCm,
      customConfirmed: true,
    },
    regions: [
      {
        id: "study-desk",
        index: 0,
        label: "书桌区域",
        regionType: "status_detection",
        geometry: { shape: "rect", centerXCm: 60, centerYCm: 280, widthCm: 200, heightCm: 140 },
        ioIndex: 4,
        mcuIo: 8,
        x: 0.6,
        y: 2.8,
        enabled: true,
        visible: true,
      },
    ],
    backgroundInstances: [],
    syncState: { fourSidedRange: "pending", regionMcuIo: "pending", updatedAt: now },
  };
};

const regionConfigs: Record<string, StoredRegionConfig> = {
  "mock-c4004-1": createRegionConfig("kitchen"),
  "mock-c4004-2": createRegionConfig("living"),
  "mock-c4004-3": createRegionConfig("study"),
};

const baseDevices: StoredMmwaveDevice[] = [
  {
    id: "mock-c4004-1",
    deviceNo: "1",
    initialized: true,
    profileId: "c4004",
    haDeviceId: "mock-ha-device-1",
    name: "c4004_0",
    deploymentName: "厨房",
    model: "dfrobot_c4004",
    manufacturer: "DFRobot",
    firmwareVersion: "2026.07.08-a3",
    prefix: "c4004_0",
    mqttTopicPrefix: "c4004_0",
    mqttKey: "c4004_0",
    macAddress: "30:C9:22:B0:D4:2C",
    binding: { entityCount: 86 },
    installInfo: { installMode: "side", installAngleDeg: 0, installHeightM: 1.8 },
    detectionMode: 1,
    deviceSettings: {
      trajectoryLed: true,
      motionLed: true,
      realTimePeopleTime: 2,
      trackMeters: 50,
      trackExistsTime: 10,
      unmannedTime: 5,
      checkToActiveFrames: 2,
    },
    discovery: { status: "online", signal: -48, lastSeen: now, discoveredAt: now, lastUpdated: now },
    regionConfig: regionConfigs["mock-c4004-1"],
    lastZoneSnapshot: {
      updatedAt: now,
      presenceStates: [],
      zones: [],
      counts: { peopleCount: 2, targetCount: 2, movingCount: 1, staticCount: 1 },
    },
  },
  {
    id: "mock-c4004-2",
    deviceNo: "2",
    initialized: true,
    profileId: "c4004",
    haDeviceId: "mock-ha-device-2",
    name: "c4004_2",
    deploymentName: "客厅",
    model: "dfrobot_c4004",
    manufacturer: "DFRobot",
    firmwareVersion: "2026.07.08-a3",
    prefix: "c4004_2",
    mqttTopicPrefix: "c4004_2",
    mqttKey: "c4004_2",
    macAddress: "30:C9:22:B0:D4:3D",
    binding: { entityCount: 86 },
    installInfo: { installMode: "side", installAngleDeg: 0, installHeightM: 1.85 },
    detectionMode: 2,
    deviceSettings: {
      trajectoryLed: true,
      motionLed: false,
      realTimePeopleTime: 2,
      trackMeters: 50,
      trackExistsTime: 10,
      unmannedTime: 30,
      checkToActiveFrames: 7,
    },
    discovery: { status: "online", signal: -56, lastSeen: now, discoveredAt: now, lastUpdated: now },
    regionConfig: regionConfigs["mock-c4004-2"],
    lastZoneSnapshot: {
      updatedAt: now,
      presenceStates: [],
      zones: [],
      counts: { peopleCount: 1, targetCount: 1, movingCount: 1, staticCount: 0 },
    },
  },
  {
    id: "mock-c4004-3",
    deviceNo: "3",
    initialized: true,
    profileId: "c4004",
    haDeviceId: "mock-ha-device-3",
    name: "c4004_3",
    deploymentName: "书房",
    model: "dfrobot_c4004",
    manufacturer: "DFRobot",
    firmwareVersion: "2026.07.08-a3",
    prefix: "c4004_3",
    mqttTopicPrefix: "c4004_3",
    mqttKey: "c4004_3",
    macAddress: "30:C9:22:B0:D4:4E",
    binding: { entityCount: 86 },
    installInfo: { installMode: "side", installAngleDeg: 0, installHeightM: 1.9 },
    detectionMode: 2,
    deviceSettings: {
      trajectoryLed: false,
      motionLed: true,
      realTimePeopleTime: 3,
      trackMeters: 40,
      trackExistsTime: 8,
      unmannedTime: 20,
      checkToActiveFrames: 5,
    },
    discovery: { status: "offline", signal: -72, lastSeen: "2026-07-13T18:20:00.000Z", discoveredAt: now, lastUpdated: now },
    regionConfig: regionConfigs["mock-c4004-3"],
    lastZoneSnapshot: {
      updatedAt: "2026-07-13T18:20:00.000Z",
      presenceStates: [],
      zones: [],
      counts: { peopleCount: 0, targetCount: 0, movingCount: 0, staticCount: 0 },
    },
  },
  {
    id: "mock-c4004-4",
    initialized: false,
    profileId: "c4004",
    name: "c4004_new",
    deploymentName: "",
    model: "dfrobot_c4004",
    manufacturer: "DFRobot",
    firmwareVersion: "2026.07.08-a3",
    prefix: "c4004_new",
    mqttTopicPrefix: "c4004_new",
    mqttKey: "c4004_new",
    macAddress: "30:C9:22:B0:D4:5F",
    binding: { entityCount: 0 },
    discovery: { status: "online", signal: -63, lastSeen: now, discoveredAt: now, lastUpdated: now },
    regionConfig: createRegionConfig("kitchen"),
    lastZoneSnapshot: {
      updatedAt: now,
      presenceStates: [],
      zones: [],
      counts: { peopleCount: 0, targetCount: 0, movingCount: 0, staticCount: 0 },
    },
  },
];

let devices = structuredClone(baseDevices);

const wave = (tick: number, amplitude: number, speed = 0.35) => Math.sin(tick * speed) * amplitude;

const targetsFor = (deviceId: string, tick: number): TrajectoryPoint[] => {
  if (deviceId === "mock-c4004-1") {
    return [
      { id: 1, x: -1.1 + wave(tick, 0.18), y: 4.2 + wave(tick + 2, 0.12), feature: "moving" },
      { id: 2, x: 1.35 + wave(tick + 1, 0.08), y: 5.55 + wave(tick, 0.05), feature: "static" },
    ];
  }
  if (deviceId === "mock-c4004-2") {
    return [{ id: 3, x: 0.45 + wave(tick, 0.22), y: 3.8 + wave(tick + 1, 0.16), feature: "moving" }];
  }
  return [];
};

const overlayRegions = (deviceId: string, tick: number) =>
  regionConfigs[deviceId].regions
    .filter((region) => region.visible)
    .map((region, index) => ({
      id: region.id,
      label: region.label,
      active: index === 0,
      x: region.x,
      y: region.y,
      regionType: region.regionType,
      geometry:
        region.geometry.shape === "circle"
          ? {
              shape: "circle" as const,
              centerX: region.geometry.centerXCm / 100,
              centerY: region.geometry.centerYCm / 100,
              radius: region.geometry.radiusCm / 100,
            }
          : {
              shape: "rect" as const,
              centerX: region.geometry.centerXCm / 100,
              centerY: region.geometry.centerYCm / 100,
              width: region.geometry.widthCm / 100,
              height: region.geometry.heightCm / 100,
            },
      movingCount: region.regionType === "status_detection" ? 1 : 0,
      staticCount: region.regionType === "status_detection" && deviceId === "mock-c4004-1" ? (tick % 10 < 5 ? 1 : 0) : 0,
      boundaryState:
        region.regionType === "boundary"
          ? deviceId === "mock-c4004-1"
            ? tick % 16 < 8
              ? "in"
              : "none"
            : "out"
          : undefined,
      approachAwayState:
        region.regionType === "approach_depart"
          ? tick % 20 < 10
            ? "approach"
            : "away"
          : undefined,
    }));

const overviewCard = (device: StoredMmwaveDevice, tick: number): MmwaveOverviewDeviceCard => {
  const online = device.discovery.status === "online";
  const targets = online ? targetsFor(device.id, tick) : [];
  const movingCount = targets.filter((target) => target.feature === "moving").length;
  const staticCount = targets.filter((target) => target.feature === "static").length;
  return {
    id: device.id,
    name: device.deploymentName?.trim() || device.name,
    model: device.model,
    online,
    status: online ? "ONLINE" : "OFFLINE",
    signal: device.discovery.signal,
    peopleCount: movingCount + staticCount,
    targetCount: targets.length,
    staticCount,
    trajectoryAvailable: online,
    mqttConnected: online,
    coordinate: regionConfigs[device.id].coordinate,
    rangeBox: regionConfigs[device.id].rangeBox,
    detection: regionConfigs[device.id].detection,
    regions: overlayRegions(device.id, tick),
    targets,
  };
};

const configFor = (device: StoredMmwaveDevice): MmwaveDeviceConfig => ({
  id: device.id,
  deviceNo: device.deviceNo,
  initialized: device.initialized,
  profileId: "c4004",
  prefix: device.prefix,
  mqttTopicPrefix: device.mqttTopicPrefix,
  mqttKey: device.mqttKey,
  installInfo: device.installInfo,
  detectionMode: device.detectionMode,
  regionConfig: regionConfigs[device.id],
  deviceSettings: device.deviceSettings ?? {},
});

const nextTick = () => {
  mockTick += 1;
  return mockTick;
};

export const mockFetchMeta = async (): Promise<MetaConfig> => ({
  appVersion: "local-mock",
  port: 5173,
  mode: "local-mock",
  linked: true,
  mqttConfigured: true,
  mqttConnected: true,
  dataDir: "memory-only",
});

export const mockFetchDevices = async () => ({ ok: true, devices: structuredClone(devices) });

export const mockFetchOverview = async (): Promise<{ ok: boolean; metrics: MmwaveOverviewMetrics; devices: MmwaveOverviewDeviceCard[] }> => {
  const tick = nextTick();
  const initializedDevices = devices.filter((device) => device.initialized);
  const cards = initializedDevices.map((device) => overviewCard(device, tick));
  return {
    ok: true,
    metrics: {
      deviceCount: initializedDevices.length,
      peopleCount: cards.reduce((sum, card) => sum + card.peopleCount, 0),
      targetCount: cards.reduce((sum, card) => sum + card.targetCount, 0),
      staticCount: cards.reduce((sum, card) => sum + card.staticCount, 0),
    },
    devices: cards,
  };
};

export const mockFetchDetail = async (deviceId: string): Promise<{ ok: boolean; detail: MmwaveDeviceDetail }> => {
  const index = devices.findIndex((device) => device.id === deviceId);
  if (index < 0) throw new Error("Mock device not found");
  const tick = nextTick();
  const card = overviewCard(devices[index], tick);
  const online = devices[index].discovery.status === "online";
  return {
    ok: true,
    detail: {
      ...card,
      deviceId,
      firmwareVersion: devices[index].firmwareVersion,
      lastUpdated: now,
      movingCount: card.targets.filter((target) => target.feature === "moving").length,
      ioStates: Array.from({ length: 6 }, (_, ioIndex) => ({
        id: `io-${ioIndex + 1}`,
        label: `IO${ioIndex + 1}`,
        active: online && ioIndex < (deviceId === "mock-c4004-1" ? 2 : 1),
      })),
      basics: [
        { key: "installMode", label: "安装方式", value: "侧装" },
        {
          key: "installHeight",
          label: "安装高度",
          value: `${(devices[index].installInfo?.installHeightM ?? 1.8).toFixed(2)} m`,
        },
        {
          key: "detectionMode",
          label: "探测模式",
          value: devices[index].detectionMode === 1 ? "高灵敏度" : "静态稳定",
        },
        {
          key: "rangeMode",
          label: "范围模式",
          value:
            regionConfigs[deviceId].detection.appliedMode === "learned"
              ? "学习探测范围"
              : regionConfigs[deviceId].detection.appliedMode === "custom"
                ? "自定义范围"
                : "四方探测范围",
        },
      ],
      actions: { canReset: online, canRefresh: online, canManageRegions: devices[index].initialized },
    },
  };
};

export const mockFetchConfig = async (deviceId: string) => {
  const device = devices.find((entry) => entry.id === deviceId);
  if (!device) throw new Error("Mock device not found");
  return { ok: true, config: structuredClone(configFor(device)) };
};

export const mockUpdateConfig = async (
  deviceId: string,
  payload: { deviceSettings?: MmwaveDeviceConfig["deviceSettings"]; regionConfig?: StoredRegionConfig },
): Promise<{ ok: boolean; config: MmwaveDeviceConfig; applyResult: ConfigApplyResult }> => {
  const device = devices.find((entry) => entry.id === deviceId);
  if (!device) throw new Error("Mock device not found");
  if (device.discovery.status !== "online") {
    throw new Error("设备离线，当前为只读模式");
  }
  if (payload.regionConfig) {
    regionConfigs[deviceId] = structuredClone(payload.regionConfig);
    device.regionConfig = regionConfigs[deviceId];
  }
  if (payload.deviceSettings) {
    device.deviceSettings = { ...device.deviceSettings, ...payload.deviceSettings };
  }
  return {
    ok: true,
    config: structuredClone(configFor(device)),
    applyResult: { fourSidedRange: "applied", regionMcuIo: "applied", warnings: [] },
  };
};

export const mockInitializeDevice = async (
  deviceId: string,
  payload: {
    deviceNoMode: "auto" | "custom";
    customDeviceNo?: string;
    installHeightM: number;
    detectionMode: DetectionMode;
  },
): Promise<{ ok: boolean; device: StoredMmwaveDevice }> => {
  const device = devices.find((entry) => entry.id === deviceId);
  if (!device) throw new Error("Mock device not found");
  const usedNumbers = devices
    .map((entry) => Number(entry.deviceNo))
    .filter((value) => Number.isFinite(value) && value > 0);
  const nextNo =
    payload.deviceNoMode === "custom" && payload.customDeviceNo
      ? payload.customDeviceNo
      : String((usedNumbers.length ? Math.max(...usedNumbers) : 0) + 1);
  device.initialized = true;
  device.deviceNo = nextNo;
  device.deploymentName = device.deploymentName || `设备 ${nextNo}`;
  device.installInfo = { installMode: "side", installAngleDeg: 0, installHeightM: payload.installHeightM };
  device.detectionMode = payload.detectionMode;
  device.deviceSettings = {
    trajectoryLed: true,
    motionLed: payload.detectionMode === 1,
    realTimePeopleTime: 2,
    trackMeters: 50,
    trackExistsTime: 10,
    unmannedTime: payload.detectionMode === 1 ? 5 : 30,
    checkToActiveFrames: payload.detectionMode === 1 ? 2 : 7,
  };
  device.prefix = `c4004_${nextNo}`;
  device.mqttTopicPrefix = `c4004_${nextNo}`;
  device.mqttKey = `c4004_${nextNo}`;
  device.name = `c4004_${nextNo}`;
  regionConfigs[deviceId] = createRegionConfig("kitchen");
  device.regionConfig = regionConfigs[deviceId];
  return { ok: true, device: structuredClone(device) };
};

export const mockUnbind = async (deviceId: string) => {
  devices = devices.filter((device) => device.id !== deviceId);
  delete regionConfigs[deviceId];
  return { ok: true, devices: structuredClone(devices) };
};
