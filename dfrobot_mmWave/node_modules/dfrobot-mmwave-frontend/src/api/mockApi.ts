import type {
  ConfigApplyResult,
  DetectionMode,
  DeviceLogCalendar,
  DeviceLogEntry,
  DeviceLogPage,
  LearnedRangeRuntime,
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
      viewPreferences: { gridVisible: true, backgroundVisible: false },
      syncState: { fourSidedRange: "synced", regionMcuIo: "synced", tagConfig: "synced", customRange: "local_only", learnedRange: "local_only", updatedAt: now },
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
          rotationDeg: 0,
          visible: true,
          zIndex: 0,
        },
      ],
      viewPreferences: { gridVisible: true, backgroundVisible: true },
      syncState: { fourSidedRange: "local_only", regionMcuIo: "synced", tagConfig: "synced", customRange: "local_only", learnedRange: "synced", updatedAt: now },
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
    viewPreferences: { gridVisible: true, backgroundVisible: false },
    syncState: { fourSidedRange: "pending", regionMcuIo: "pending", tagConfig: "pending", customRange: "synced", learnedRange: "local_only", updatedAt: now },
  };
};

const regionConfigs: Record<string, StoredRegionConfig> = {
  "mock-c4004-1": createRegionConfig("kitchen"),
  "mock-c4004-2": createRegionConfig("living"),
  "mock-c4004-3": createRegionConfig("study"),
};

const mockLearnedRanges: Record<string, LearnedRangeRuntime> = {};

const defaultLearnedRange = (deviceId: string): LearnedRangeRuntime => {
  const points = regionConfigs[deviceId]?.detection.learnedPointsCm ?? [];
  return {
    status: points.length >= 3 ? "ready" : "idle",
    learningEnabled: false,
    singleTargetConfirmCount: 0,
    pointCount: points.length,
    pointsCm: structuredClone(points),
    updatedAt: now,
  };
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
    name: device.name,
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
    backgroundInstances: regionConfigs[device.id].backgroundInstances,
    viewPreferences: regionConfigs[device.id].viewPreferences ?? {
      gridVisible: true,
      backgroundVisible: regionConfigs[device.id].backgroundInstances.some((instance) => instance.visible),
    },
    deploymentName: device.deploymentName,
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
  logRetention: device.logRetention ?? {
    mode: "forever",
    updatedAt: new Date(0).toISOString(),
  },
  nextCleanupAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
  const learnedRange = mockLearnedRanges[deviceId] ?? defaultLearnedRange(deviceId);
  mockLearnedRanges[deviceId] = learnedRange;
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
          key: "detectionRangeMode",
          label: "探测范围",
          value:
            regionConfigs[deviceId].detection.appliedMode === "learned"
              ? "学习探测范围"
              : regionConfigs[deviceId].detection.appliedMode === "custom"
                ? "自定义范围"
                : "四方探测范围",
        },
      ],
      actions: { canReset: online, canRefresh: online, canManageRegions: devices[index].initialized },
      learnedRange: structuredClone(learnedRange),
    },
  };
};

export const mockLearnedRangeAction = async (
  deviceId: string,
  action: "start" | "stop" | "query",
): Promise<{ ok: boolean; learnedRange: LearnedRangeRuntime; detail?: MmwaveDeviceDetail }> => {
  const device = devices.find((entry) => entry.id === deviceId);
  if (!device) throw new Error("Mock device not found");
  if (device.discovery.status !== "online") throw new Error("设备离线，无法执行学习探测范围操作");
  const current = mockLearnedRanges[deviceId] ?? defaultLearnedRange(deviceId);
  if (action === "start") {
    regionConfigs[deviceId].detection.mode = "learned";
    regionConfigs[deviceId].detection.learnedPointsCm = [];
    regionConfigs[deviceId].syncState.learnedRange = "local_only";
    current.status = "confirming_single_target";
    current.learningEnabled = true;
    current.singleTargetConfirmCount = 0;
    current.pointCount = 0;
    current.pointsCm = [];
    current.message = "正在确认单目标条件";
  } else if (action === "stop") {
    // 关闭学习 = 学习完成：固件自动采用学习范围
    const points = current.pointsCm.length >= 3 ? current.pointsCm : structuredClone(learnedPolygonCm);
    regionConfigs[deviceId].detection = {
      ...regionConfigs[deviceId].detection,
      mode: "learned",
      appliedMode: "learned",
      learnedPointsCm: structuredClone(points),
    };
    regionConfigs[deviceId].syncState.learnedRange = "synced";
    current.status = "ready";
    current.learningEnabled = false;
    current.singleTargetConfirmCount = 0;
    current.pointCount = points.length;
    current.pointsCm = structuredClone(points);
    current.message = "学习范围已更新，固件已切换为学习探测范围";
  } else {
    if (current.pointCount >= 3 || regionConfigs[deviceId].detection.learnedPointsCm.length >= 3) {
      const points = current.pointsCm.length >= 3
        ? current.pointsCm
        : regionConfigs[deviceId].detection.learnedPointsCm;
      regionConfigs[deviceId].detection = {
        ...regionConfigs[deviceId].detection,
        mode: "learned",
        appliedMode: "learned",
        learnedPointsCm: structuredClone(points),
      };
      regionConfigs[deviceId].syncState.learnedRange = "synced";
      current.status = "ready";
      current.pointCount = points.length;
      current.pointsCm = structuredClone(points);
      current.message = "学习范围读取完成";
    } else {
      current.status = "error";
      current.message = "学习已停止，但最终范围读取失败";
    }
  }
  current.updatedAt = new Date().toISOString();
  mockLearnedRanges[deviceId] = current;
  const detail = (await mockFetchDetail(deviceId)).detail;
  return { ok: true, learnedRange: structuredClone(current), detail };
};

const mockDeviceLogs = (deviceId: string): DeviceLogEntry[] => {
  const device = devices.find((entry) => entry.id === deviceId);
  const identity = {
    deviceName: device?.name ?? "c4004",
    deploymentName: device?.deploymentName ?? "",
  };
  return [
  {
    ...identity,
    occurredAt: "2026-07-14T03:23:00.000Z",
    localDate: "2026-07-14",
    regionIndex: 0,
    regionLabel: "办公区",
    regionType: "status_detection",
    eventType: "status_changed",
    movingCount: 1,
    staticCount: 2,
    totalCount: 3,
    message: "1号办公区当前运动人数为1人，静止人数为2人，总人数为3人",
  },
  {
    ...identity,
    occurredAt: "2026-07-14T03:20:00.000Z",
    localDate: "2026-07-14",
    regionIndex: 1,
    regionLabel: "卧室",
    regionType: "approach_depart",
    eventType: "approach",
    message: "2号卧室区域有人靠近",
  },
  {
    ...identity,
    occurredAt: "2026-07-14T03:18:00.000Z",
    localDate: "2026-07-14",
    regionIndex: 2,
    regionLabel: "卧室门",
    regionType: "boundary",
    eventType: "enter",
    message: "3号卧室门区域有人进入",
  },
  ];
};

export const mockFetchDeviceLogCalendar = async (
  deviceId: string,
  year: number,
  month: number,
): Promise<{ ok: boolean } & DeviceLogCalendar> => {
  if (!devices.some((device) => device.id === deviceId)) throw new Error("Mock device not found");
  return {
    ok: true,
    year,
    month,
    years: [2026],
    months: year === 2026 ? [7] : [],
    days: year === 2026 && month === 7 ? [14] : [],
  };
};

export const mockFetchDeviceLogs = async (
  deviceId: string,
  date: string,
  page: number,
  pageSize: number,
): Promise<{ ok: boolean } & DeviceLogPage> => {
  if (!devices.some((device) => device.id === deviceId)) throw new Error("Mock device not found");
  const logs = mockDeviceLogs(deviceId).filter((entry) => entry.localDate === date);
  const offset = (page - 1) * pageSize;
  return {
    ok: true,
    date,
    page,
    pageSize,
    total: logs.length,
    hasMore: offset + pageSize < logs.length,
    logs: logs.slice(offset, offset + pageSize),
  };
};

export const mockFetchConfig = async (deviceId: string) => {
  const device = devices.find((entry) => entry.id === deviceId);
  if (!device) throw new Error("Mock device not found");
  return { ok: true, config: structuredClone(configFor(device)) };
};

export const mockUpdateConfig = async (
  deviceId: string,
  payload: {
    deviceSettings?: MmwaveDeviceConfig["deviceSettings"];
    regionConfig?: StoredRegionConfig;
    logRetention?: Omit<MmwaveDeviceConfig["logRetention"], "updatedAt">;
    apply?: { fourSidedRange?: boolean; regionMcuIo?: boolean; tagConfig?: boolean; customRange?: boolean };
  },
): Promise<{ ok: boolean; config: MmwaveDeviceConfig; applyResult: ConfigApplyResult }> => {
  const device = devices.find((entry) => entry.id === deviceId);
  if (!device) throw new Error("Mock device not found");
  if (device.discovery.status !== "online") {
    throw new Error("设备离线，当前为只读模式");
  }
  const previousAppliedMode =
    regionConfigs[deviceId]?.detection.appliedMode ?? regionConfigs[deviceId]?.detection.mode ?? "rect";
  if (payload.regionConfig) {
    const next = structuredClone(payload.regionConfig);
    if (payload.apply?.fourSidedRange) {
      // 与后端一致：仅同步成功后才把 appliedMode 切到四方
      next.detection.mode = "rect";
      next.detection.appliedMode = "rect";
    }
    if (payload.apply?.customRange) {
      next.detection.mode = "custom";
      next.detection.appliedMode = "custom";
      next.detection.customConfirmed = true;
      next.syncState.customRange = "synced";
    }
    if (!payload.apply?.fourSidedRange && !payload.apply?.customRange) {
      // 纯本地草稿保存时保留固件生效模式
      next.detection.appliedMode = previousAppliedMode;
    }
    regionConfigs[deviceId] = next;
    device.regionConfig = regionConfigs[deviceId];
  }
  if (payload.deviceSettings) {
    device.deviceSettings = { ...device.deviceSettings, ...payload.deviceSettings };
  }
  if (payload.logRetention) {
    device.logRetention = {
      ...payload.logRetention,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    ok: true,
    config: structuredClone(configFor(device)),
    applyResult: {
      fourSidedRange: payload.apply?.fourSidedRange ? "applied" : "skipped",
      regionMcuIo: payload.apply?.regionMcuIo ? "applied" : "skipped",
      tagConfig: payload.apply?.tagConfig ? "applied" : "skipped",
      customRange: payload.apply?.customRange ? "applied" : "skipped",
      warnings: [],
    },
  };
};

export const mockFactoryResetDevice = async (
  deviceId: string,
): Promise<{ ok: boolean; config: MmwaveDeviceConfig }> => {
  const device = devices.find((entry) => entry.id === deviceId);
  if (!device) throw new Error("Mock device not found");
  if (device.discovery.status !== "online") {
    throw new Error("设备离线，无法恢复出厂设置");
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  // 模拟出厂后从设备拉取的默认探测范围
  const factoryRangeBox = { xMin: -3, xMax: 3, yMin: 0, yMax: 6 };
  const current = regionConfigs[deviceId] ?? device.regionConfig;
  regionConfigs[deviceId] = {
    ...structuredClone(current),
    rangeBox: factoryRangeBox,
    detection: {
      mode: "rect",
      appliedMode: "rect",
      rectCm: { xMin: -300, xMax: 300, yMin: 0, yMax: 600 },
      learnedPointsCm: [],
      customPointsCm: [],
      customConfirmed: false,
    },
    regions: [],
    syncState: {
      fourSidedRange: "synced",
      regionMcuIo: "synced",
      tagConfig: "synced",
      customRange: "synced",
      learnedRange: "synced",
      updatedAt: new Date().toISOString(),
    },
  };
  device.regionConfig = regionConfigs[deviceId];
  device.deviceSettings = {
    trajectoryLed: true,
    motionLed: true,
    realTimePeopleTime: 2,
    trackMeters: 50,
    trackExistsTime: 10,
    unmannedTime: 5,
    checkToActiveFrames: 3,
  };
  return { ok: true, config: structuredClone(configFor(device)) };
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
  if (device.discovery.status !== "online") {
    throw new Error("设备离线，无法进行初始化绑定");
  }
  const usedNumbers = devices
    .filter((entry) => entry.id !== deviceId)
    .map((entry) => entry.deviceNo)
    .filter((value): value is string => Boolean(value));
  const requestedNo = (payload.customDeviceNo ?? "").trim();
  let nextNo = requestedNo;
  if (payload.deviceNoMode === "custom") {
    if (!requestedNo) throw new Error("请输入自定义设备号");
    if (usedNumbers.includes(requestedNo)) throw new Error("设备号已存在，请更换后再继续");
    nextNo = requestedNo;
  } else {
    if (!requestedNo) {
      const maxNo = usedNumbers
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0)
        .reduce((max, value) => Math.max(max, value), 0);
      nextNo = String(maxNo + 1);
    }
    if (usedNumbers.includes(nextNo)) throw new Error("设备号已存在，请更换后再继续");
  }
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
  // 与正式后端一致：初次绑定默认四方 8×8（cm: -400~400 / 0~800）
  regionConfigs[deviceId] = {
    ...createRegionConfig("kitchen"),
    rangeBox: { xMin: -4, xMax: 4, yMin: 0, yMax: 8 },
    detection: {
      mode: "rect",
      appliedMode: "rect",
      rectCm: { xMin: -400, xMax: 400, yMin: 0, yMax: 800 },
      learnedPointsCm: [],
      customPointsCm: [],
      customConfirmed: false,
    },
    syncState: {
      fourSidedRange: "synced",
      regionMcuIo: "local_only",
      tagConfig: "local_only",
      customRange: "local_only",
      learnedRange: "local_only",
      updatedAt: new Date().toISOString(),
    },
  };
  device.regionConfig = regionConfigs[deviceId];
  return { ok: true, device: structuredClone(device) };
};

export const mockUnbind = async (deviceId: string) => {
  devices = devices.filter((device) => device.id !== deviceId);
  delete regionConfigs[deviceId];
  return { ok: true, devices: structuredClone(devices) };
};
