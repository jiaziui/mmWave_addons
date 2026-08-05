import type { HaEntityState } from "../../ha/types";
import type { StoredMmwaveDevice } from "../../config/storage";
import type {
  C4004DeviceSettings,
  MmwaveDeviceDetail,
  MmwaveOverviewDeviceCard,
  RangeBox,
  RegionOverlay,
  TagEventType,
  TagRegionRuntime,
  StoredRegionConfig,
  StoredZoneSnapshot,
  TrajectoryPoint,
} from "../../types/mmwave";
import type { MmwaveProfileAdapter } from "./contracts";
import { countTrajectoryByFeature, toDisplayTrajectoryPoints } from "../trajectory";
import {
  buildDeviceStateMap,
  findWritableEntityId,
  loadEntityRegistry,
  toEntityId,
  writeC4004Entity,
} from "./profileRuntime";

const DEFAULT_COORDINATE: RangeBox = { xMin: -5, xMax: 5, yMin: 0, yMax: 9 };

/** 初次绑定默认下发的四方探测范围（米）：8m × 8m */
export const INIT_FOUR_SIDED_RANGE_BOX: RangeBox = { xMin: -4, xMax: 4, yMin: 0, yMax: 8 };

/** 恢复出厂后若非四方模式，强制下发的四方范围（米）：xmin/xmax ±2m，ymin 0，ymax 4m（cm: -200~200 / 0~400） */
export const FACTORY_FOUR_SIDED_RANGE_BOX: RangeBox = { xMin: -2, xMax: 2, yMin: 0, yMax: 4 };

export const isFourSidedDetectionMode = (
  rawValue: string | null | undefined,
  appliedMode?: StoredRegionConfig["detection"]["appliedMode"],
): boolean => {
  const normalized = rawValue?.trim().toLowerCase();
  if (normalized === "four-sided range" || normalized === "four sided range") {
    return true;
  }
  if (normalized === "trajectory" || normalized === "config file") {
    return false;
  }
  if (normalized && normalized !== "unknown" && normalized !== "unavailable" && normalized !== "") {
    return false;
  }
  return appliedMode === "rect";
};

const DETECTION_MODE_PARAMS = {
  1: {
    frameGenerateCount: 2,
    unoccupiedTime: 5,
  },
  2: {
    frameGenerateCount: 7,
    unoccupiedTime: 30,
  },
} as const;

const normalizeState = (value: string | null | undefined): string => (value ? value.toLowerCase() : "");

const isTruthyState = (value: string | null | undefined): boolean => {
  const normalized = normalizeState(value);
  return normalized === "on" || normalized === "true" || normalized === "online";
};

const isUnavailable = (value: string | null | undefined): boolean => {
  const normalized = normalizeState(value);
  return normalized === "unknown" || normalized === "unavailable" || normalized === "";
};

const isAvailableState = (value: string | null | undefined): boolean => !isUnavailable(value);

const toNumber = (value: string | null | undefined): number | null => {
  if (!value || isUnavailable(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const numberLabel = (value: number | null, suffix = ""): string => {
  if (value === null) {
    return "-";
  }
  return `${value}${suffix}`;
};

const detectionRangeLabel = (
  rawValue: string | null,
  appliedMode: StoredRegionConfig["detection"]["appliedMode"],
): string => {
  // 上位机以本地已确认生效的 appliedMode 为准（同步成功后才会写入）
  if (appliedMode === "learned") {
    return "Learned Trajectory Range";
  }
  if (appliedMode === "custom") {
    return "Custom Range";
  }
  if (appliedMode === "rect") {
    return "Four-sided Range";
  }

  const normalized = rawValue?.trim().toLowerCase();
  if (normalized === "four-sided range" || normalized === "four sided range") {
    return "Four-sided Range";
  }
  if (normalized === "trajectory") {
    return "Learned Trajectory Range";
  }
  if (normalized === "config file") {
    return "Custom Range";
  }
  if (rawValue && !isUnavailable(rawValue) && normalized !== "unknown") {
    return rawValue;
  }
  return "-";
};

const getEntityState = (statesById: Map<string, HaEntityState>, entityId: string): HaEntityState | undefined =>
  statesById.get(entityId);

const readString = (statesById: Map<string, HaEntityState>, entityId: string): string | null =>
  getEntityState(statesById, entityId)?.state ?? null;

const readNumber = (statesById: Map<string, HaEntityState>, entityId: string): number | null =>
  toNumber(readString(statesById, entityId));

const readBoolean = (statesById: Map<string, HaEntityState>, entityId: string): boolean | undefined => {
  const value = readString(statesById, entityId);
  if (isUnavailable(value)) {
    return undefined;
  }
  return isTruthyState(value);
};

const objectIdFromEntityId = (entityId: string): string => entityId.split(".", 2)[1] ?? "";

const readOnlineState = (statesById: Map<string, HaEntityState>, prefix: string): string | null => {
  const exactEntityId = `binary_sensor.${prefix}_online`;
  const exactState = statesById.get(exactEntityId);
  if (exactState) {
    return exactState.state;
  }

  const expectedObjectId = `${prefix}_online`;
  for (const state of statesById.values()) {
    if (!state.entity_id.startsWith("binary_sensor.")) {
      continue;
    }
    const normalizedObjectId = objectIdFromEntityId(state.entity_id).replace(/_\d+$/, "");
    if (normalizedObjectId === expectedObjectId) {
      return state.state;
    }
  }
  return null;
};

const cloneRangeBox = (rangeBox: RangeBox): RangeBox => ({ ...rangeBox });

const resolveStoredRegions = (storedConfig?: StoredRegionConfig): StoredRegionConfig["regions"] =>
  storedConfig?.regions ?? [];

const buildRangeBox = (
  statesById: Map<string, HaEntityState>,
  prefix: string,
  fallback: RangeBox = DEFAULT_COORDINATE,
): RangeBox => {
  const xMin = readNumber(statesById, toEntityId(prefix, { key: "rangeXMin", domain: "number", slug: "range_x_min", access: "readwrite" }));
  const xMax = readNumber(statesById, toEntityId(prefix, { key: "rangeXMax", domain: "number", slug: "range_x_max", access: "readwrite" }));
  const yMin = readNumber(statesById, toEntityId(prefix, { key: "rangeYMin", domain: "number", slug: "range_y_min", access: "readwrite" }));
  const yMax = readNumber(statesById, toEntityId(prefix, { key: "rangeYMax", domain: "number", slug: "range_y_max", access: "readwrite" }));

  return {
    xMin: xMin !== null ? xMin / 100 : fallback.xMin,
    xMax: xMax !== null ? xMax / 100 : fallback.xMax,
    yMin: yMin !== null ? yMin / 100 : fallback.yMin,
    yMax: yMax !== null ? yMax / 100 : fallback.yMax,
  };
};

const peopleCountingCounts = (
  tag: TagRegionRuntime | undefined,
): { movingCount?: number; staticCount?: number } => {
  if (!tag?.dataAvailable || tag.tagType !== "people_counting") {
    return {};
  }
  return {
    movingCount: tag.movingCount,
    staticCount: tag.staticCount,
  };
};

const regionTypeToTagType = (regionType: StoredRegionConfig["regions"][number]["regionType"]): TagEventType =>
  regionType === "status_detection"
    ? "people_counting"
    : regionType === "boundary"
      ? "boundary"
      : regionType === "approach_depart"
        ? "approach_away"
        : regionType === "noise"
          ? "noise"
          : "none";

const tagCounts = (
  runtime: { tagRegions: Map<number, TagRegionRuntime> },
  storedConfig: StoredRegionConfig | undefined,
  kind: "moving" | "static",
): number =>
  resolveStoredRegions(storedConfig).reduce((sum, region) => {
    if (!region.enabled || region.regionType !== "status_detection") {
      return sum;
    }
    const entry = runtime.tagRegions.get(region.index);
    if (!entry?.dataAvailable || entry.tagType !== "people_counting") {
      return sum;
    }
    return sum + (kind === "moving" ? entry.movingCount ?? 0 : entry.staticCount ?? 0);
  }, 0);

/** Prefer unique trajectory targets; fall back to per-tag sum when trajectory is empty. */
const resolveDeviceMotionCounts = (
  runtime: {
    tagRegions: Map<number, TagRegionRuntime>;
    trajectory?: { points: readonly Pick<TrajectoryPoint, "id" | "feature">[] } | null;
  },
  storedConfig: StoredRegionConfig | undefined,
): { movingCount: number; staticCount: number } => {
  const points = runtime.trajectory?.points ?? [];
  if (points.length > 0) {
    return countTrajectoryByFeature(points);
  }
  return {
    movingCount: tagCounts(runtime, storedConfig, "moving"),
    staticCount: tagCounts(runtime, storedConfig, "static"),
  };
};

const buildRegions = (
  runtime: { tagRegions: Map<number, TagRegionRuntime> },
  storedConfig?: StoredRegionConfig,
): RegionOverlay[] =>
  resolveStoredRegions(storedConfig).filter((region) => region.enabled && region.visible).map((region) => {
    const tag = runtime.tagRegions.get(region.index);
    const expectedTagType = regionTypeToTagType(region.regionType);
    const geometry = region.geometry.shape === "circle"
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
        };

    return {
      id: region.id,
      label: region.label,
      active: Boolean(tag?.dataAvailable && tag.tagType === expectedTagType && (
        (expectedTagType === "people_counting" && ((tag.movingCount ?? 0) + (tag.staticCount ?? 0) > 0))
        || (expectedTagType === "boundary" && (tag.boundaryState ?? "none") !== "none")
        || (expectedTagType === "approach_away" && (tag.approachAwayState ?? "none") !== "none")
      )),
      x: region.x,
      y: region.y,
      regionType: region.regionType,
      geometry,
      tagIndex: tag?.tagIndex ?? region.index,
      tagType: tag?.tagType,
      tagTypeCode: tag?.tagTypeCode,
      tagDataAvailable: Boolean(tag?.dataAvailable),
      tagUpdatedAt: tag?.receivedAt,
      tagTypeMismatch: Boolean(tag && tag.tagType !== expectedTagType),
      movingCount:
        tag?.dataAvailable && tag.tagType === "people_counting" ? tag.movingCount ?? undefined : undefined,
      staticCount:
        tag?.dataAvailable && tag.tagType === "people_counting" ? tag.staticCount ?? undefined : undefined,
      boundaryState:
        tag?.dataAvailable && tag.tagType === "boundary" && tag.boundaryState ? tag.boundaryState : undefined,
      approachAwayState:
        tag?.dataAvailable && tag.tagType === "approach_away" && tag.approachAwayState ? tag.approachAwayState : undefined,
    };
  });

/** Zone presence from Native IO; moving/static counts from MQTT tag_event (tag_index 0..4). */
export const buildZoneSnapshot = (
  statesById: Map<string, HaEntityState>,
  prefix: string,
  fallback?: StoredZoneSnapshot,
  tagRegions: Map<number, TagRegionRuntime> = new Map(),
): StoredZoneSnapshot => {
  const zones = Array.from({ length: 6 }, (_, index) => {
    const zoneNumber = index + 1;
    const entityId = toEntityId(prefix, {
      key: `zone${zoneNumber}Presence`,
      domain: "binary_sensor",
      slug: `zone_${zoneNumber}_presence`,
      access: "read",
    });
    const presenceState = readString(statesById, entityId);
    const fallbackZone = fallback?.zones.find((zone) => zone.index === index);
    const fromTag = peopleCountingCounts(tagRegions.get(index));

    return {
      index,
      active: isUnavailable(presenceState) ? fallbackZone?.active ?? false : isTruthyState(presenceState),
      movingCount: fromTag.movingCount ?? fallbackZone?.movingCount,
      staticCount: fromTag.staticCount ?? fallbackZone?.staticCount,
    };
  });
  const liveCount = readNumber(statesById, `sensor.${prefix}_live_count`);
  const targetCount = readNumber(statesById, `sensor.${prefix}_target_count`);
  let movingTotal = 0;
  let staticTotal = 0;
  let hasTagCounts = false;
  for (const zone of zones) {
    if (zone.movingCount !== undefined || zone.staticCount !== undefined) {
      hasTagCounts = true;
      movingTotal += zone.movingCount ?? 0;
      staticTotal += zone.staticCount ?? 0;
    }
  }
  return {
    updatedAt: new Date().toISOString(),
    presenceStates: zones.map((zone) => ({ id: `zone-${zone.index + 1}`, active: zone.active })),
    zones,
    counts: {
      liveCount: liveCount ?? fallback?.counts.liveCount ?? 0,
      targetCount: targetCount ?? fallback?.counts.targetCount ?? 0,
      movingCount: hasTagCounts ? movingTotal : fallback?.counts.movingCount ?? 0,
      staticCount: hasTagCounts ? staticTotal : fallback?.counts.staticCount ?? 0,
    },
  };
};

const C4004_DEVICE_SETTING_KEYS = [
  "presenceEnable",
  "trajectoryTrackEnable",
  "trkLed",
  "occLed",
  "installZAngle",
  "realTimeReportInterval",
  "trajectoryGenerationDistance",
  "trajectoryLifetime",
  "frameGenerateCount",
  "unoccupiedTime",
  "zone1McuIo",
  "zone2McuIo",
  "zone3McuIo",
  "zone4McuIo",
  "zone5McuIo",
  "zone6McuIo",
] as const;

/** Defaults restored after factory reset (and shown in overview/detail basics). */
export const FACTORY_INSTALL_HEIGHT_M = 1.8;
export const FACTORY_DEVICE_SETTINGS: C4004DeviceSettings = {
  trkLed: true,
  occLed: true,
  installZAngle: 0,
  realTimeReportInterval: 1,
  trajectoryGenerationDistance: 0,
  trajectoryLifetime: 0,
  unoccupiedTime: 30,
  frameGenerateCount: 7,
};

const buildDeviceSettings = (statesById: Map<string, HaEntityState>, prefix: string): C4004DeviceSettings => {
  const settings: C4004DeviceSettings = {};
  const booleanKeys = ["presenceEnable", "trajectoryTrackEnable", "trkLed", "occLed"] as const;
  const numberKeys = C4004_DEVICE_SETTING_KEYS.filter(
    (key): key is Exclude<(typeof C4004_DEVICE_SETTING_KEYS)[number], (typeof booleanKeys)[number]> =>
      !booleanKeys.includes(key as (typeof booleanKeys)[number]),
  );

  for (const key of booleanKeys) {
    const definition = { key, domain: "switch", slug: "", access: "readwrite" } as const;
    const entityId = toEntityId(prefix, {
      ...definition,
      slug:
        key === "presenceEnable"
          ? "presence_enable"
          : key === "trajectoryTrackEnable"
            ? "trajectory_track_enable"
            : key === "trkLed"
              ? "trk_led"
              : "occ_led",
    });
    const value = readBoolean(statesById, entityId);
    if (value !== undefined) {
      settings[key] = value;
    }
  }

  const numberEntitySlugs: Record<(typeof numberKeys)[number], string> = {
    installZAngle: "install_z_angle",
    realTimeReportInterval: "real_time_report_interval",
    trajectoryGenerationDistance: "trajectory_generation_distance",
    trajectoryLifetime: "trajectory_lifetime",
    frameGenerateCount: "frame_generate_count",
    unoccupiedTime: "unoccupied_time",
    zone1McuIo: "zone_1_mcu_io",
    zone2McuIo: "zone_2_mcu_io",
    zone3McuIo: "zone_3_mcu_io",
    zone4McuIo: "zone_4_mcu_io",
    zone5McuIo: "zone_5_mcu_io",
    zone6McuIo: "zone_6_mcu_io",
  };

  for (const key of numberKeys) {
    const value = readNumber(statesById, `number.${prefix}_${numberEntitySlugs[key]}`);
    if (value !== null) {
      settings[key] = value;
    }
  }

  return settings;
};

const writeDeviceSettings = async (
  client: Parameters<typeof writeC4004Entity>[0],
  device: StoredMmwaveDevice,
  settings: C4004DeviceSettings,
): Promise<void> => {
  const entityRegistryEntries = await loadEntityRegistry(client);
  for (const key of C4004_DEVICE_SETTING_KEYS) {
    const value = settings[key];
    if (value === undefined) {
      continue;
    }
    await writeC4004Entity(client, device, key, value, entityRegistryEntries);
  }
};

export const c4004ProfileAdapter: MmwaveProfileAdapter = {
  id: "c4004",
  displayName: "DFRobot C4004",
  metadataHints: ["c4004", "dfrobot c4004", "dfrobot_c4004"],
  markerValues: ["c4004"],
  capabilities: {
    supportsTrajectory: true,
    supportsRegions: true,
    supportsInitializeWorkflow: true,
    supportsReset: true,
    supportsFactoryReset: true,
    supportsMqttBridge: true,
  },
  mqttTopics: {
    component: "dfrobot_c4004",
    trajectoryStateTopic: "state/target_trajectory",
    tagEventStateTopic: "state/tag_event",
    multiTagConfigStateTopic: "state/multi_tag_config",
    multiTagConfigCommandTopic: "command/multi_tag_config/set",
    multiTagConfigResultTopic: "result/multi_tag_config/set",
    configFileRangeStateTopic: "state/config_file_range",
    configFileRangeCommandTopic: "command/config_file_range/set",
    configFileRangeResultTopic: "result/config_file_range/set",
    learnedTrajectoryRangeStateTopic: "state/learned_trajectory_range",
    learnedTrajectoryRangeSetCommandTopic: "command/learned_trajectory_range/set",
    learnedTrajectoryRangeSetResultTopic: "result/learned_trajectory_range/set",
    learnedTrajectoryRangeQueryCommandTopic: "command/learned_trajectory_range/query",
    learnedTrajectoryRangeQueryResultTopic: "result/learned_trajectory_range/query",
  },
  runtimeSupported: true,
  mapEntityStates: (device, statesById, entityRegistryEntries) =>
    buildDeviceStateMap(device, statesById, entityRegistryEntries),
  resolveDeviceOnline: (device, statesById, states) => {
    const onlineState = readOnlineState(statesById, device.prefix);
    if (onlineState !== null) {
      return isTruthyState(onlineState);
    }
    return states.some(
      (state) => objectIdFromEntityId(state.entity_id).startsWith(`${device.prefix}_`) && isAvailableState(state.state),
    );
  },
  buildRuntimeState: (device, statesById, options) => {
    const modeRaw = readString(statesById, `text_sensor.${device.prefix}_detection_range_mode`);
    const haRangeBox = buildRangeBox(statesById, device.prefix, device.regionConfig.rangeBox);
    // 本地已确认四方生效、但 HA 模式实体尚未跟上时，不要用旧的 range_* number 覆盖上位机范围
    // local_only：配置层已保存、未下发固件，始终以上位机 regionConfig 为准，避免被 HA 旧 range_* 覆盖
    const keepLocalRange =
      device.regionConfig.syncState?.fourSidedRange === "local_only" ||
      (device.regionConfig.detection.appliedMode === "rect" &&
        device.regionConfig.syncState?.fourSidedRange === "synced" &&
        !isFourSidedDetectionMode(modeRaw, undefined));

    return {
      regionConfig: {
        ...device.regionConfig,
        coordinate: cloneRangeBox(device.regionConfig.coordinate),
        rangeBox: keepLocalRange ? cloneRangeBox(device.regionConfig.rangeBox) : haRangeBox,
        regions: resolveStoredRegions(device.regionConfig),
      },
      lastZoneSnapshot: buildZoneSnapshot(
        statesById,
        device.prefix,
        device.lastZoneSnapshot,
        options?.tagRegions,
      ),
    };
  },
  buildOverviewCard: (device, statesById, runtime) => {
    const liveCount = readNumber(statesById, `sensor.${device.prefix}_live_count`) ?? device.lastZoneSnapshot.counts.liveCount;
    const { movingCount, staticCount } = resolveDeviceMotionCounts(runtime, device.regionConfig);
    const onlineState = readOnlineState(statesById, device.prefix);
    const online = onlineState === null ? device.discovery.status === "online" : isTruthyState(onlineState);
    const status = online ? "Online" : "Offline";

    return {
      id: device.id,
      name: device.name,
      model: device.model,
      online,
      status,
      signal: device.discovery.signal,
      liveCount,
      targetCount: movingCount,
      staticCount,
      trajectoryAvailable: Boolean(runtime.trajectory),
      mqttConnected: runtime.mqttConnected,
      coordinate: cloneRangeBox(device.regionConfig.coordinate),
      rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
      detection: device.regionConfig.detection,
      regions: buildRegions(runtime, device.regionConfig),
      targets: toDisplayTrajectoryPoints(runtime.trajectory?.points ?? []),
      backgroundInstances: device.regionConfig.backgroundInstances ?? [],
      viewPreferences: device.regionConfig.viewPreferences ?? {
        gridVisible: true,
        backgroundVisible: (device.regionConfig.backgroundInstances ?? []).some((instance) => instance.visible),
        fillVisible: true,
      },
      deploymentName: device.deploymentName,
    };
  },
  buildDeviceDetail: (device, statesById, runtime) => {
    const onlineState = readOnlineState(statesById, device.prefix);
    const online = onlineState === null ? device.discovery.status === "online" : isTruthyState(onlineState);
    const status = online ? "Online" : "Offline";
    const liveCount = readNumber(statesById, `sensor.${device.prefix}_live_count`) ?? device.lastZoneSnapshot.counts.liveCount;
    const haTargetCount = readNumber(statesById, `sensor.${device.prefix}_target_count`) ?? device.lastZoneSnapshot.counts.targetCount;
    // Prefer live MQTT trajectory target count when available; otherwise HA sensor.
    const targetCount = runtime.trajectory
      ? Math.max(runtime.trajectory.targetCount, runtime.trajectory.points.length)
      : haTargetCount;
    const { movingCount, staticCount } = resolveDeviceMotionCounts(runtime, device.regionConfig);
    const settings = device.deviceSettings ?? {};
    const readIoActive = (zoneNumber: number): boolean => {
      const state = readString(statesById, `binary_sensor.${device.prefix}_zone_${zoneNumber}_presence`);
      if (!isUnavailable(state)) {
        return isTruthyState(state);
      }
      return device.lastZoneSnapshot.zones.find((zone) => zone.index === zoneNumber - 1)?.active ?? false;
    };
    const storedInstallHeightCm = device.installInfo ? Math.round(device.installInfo.installHeightM * 100) : null;

    return {
      id: device.id,
      name: device.name,
      model: device.model,
      deviceId: device.haDeviceId ?? device.prefix,
      online,
      status,
      signal: device.discovery.signal,
      liveCount,
      targetCount,
      firmwareVersion: device.firmwareVersion,
      trajectoryAvailable: Boolean(runtime.trajectory),
      mqttConnected: runtime.mqttConnected,
      lastUpdated: new Date().toISOString(),
      coordinate: cloneRangeBox(device.regionConfig.coordinate),
      rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
      detection: device.regionConfig.detection,
      regions: buildRegions(runtime, device.regionConfig),
      targets: toDisplayTrajectoryPoints(runtime.trajectory?.points ?? []),
      movingCount,
      staticCount,
      backgroundInstances: device.regionConfig.backgroundInstances ?? [],
      viewPreferences: device.regionConfig.viewPreferences ?? {
        gridVisible: true,
        backgroundVisible: (device.regionConfig.backgroundInstances ?? []).some((instance) => instance.visible),
        fillVisible: true,
      },
      deploymentName: device.deploymentName,
      ioStates: [
        { id: "io1", label: "IO1", active: readIoActive(1) },
        { id: "io2", label: "IO2", active: readIoActive(2) },
        { id: "io3", label: "IO3", active: readIoActive(3) },
        { id: "io4", label: "IO4", active: readIoActive(4) },
        { id: "io5", label: "IO5", active: readIoActive(5) },
        { id: "io6", label: "IO6", active: readIoActive(6) },
      ],
      basics: [
        {
          key: "installMode",
          label: "Install Mode",
          value: readString(statesById, `select.${device.prefix}_install_mode`) ?? (device.installInfo?.installMode === "side" ? "Side" : "-"),
        },
        {
          key: "installAngle",
          label: "Install Angle",
          value: numberLabel(
            readNumber(statesById, `number.${device.prefix}_install_z_angle`)
              ?? settings.installZAngle
              ?? device.installInfo?.installAngleDeg
              ?? null,
            "°",
          ),
        },
        {
          key: "realTimeReportInterval",
          label: "Real-time Report Interval",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_real_time_report_interval`) ?? settings.realTimeReportInterval ?? null, " s"),
        },
        {
          key: "installHeight",
          label: "Install Height",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_install_height`) ?? storedInstallHeightCm, " cm"),
        },
        {
          key: "trajectoryGenerationDistance",
          label: "Trajectory Generation Distance",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_trajectory_generation_distance`) ?? settings.trajectoryGenerationDistance ?? null, " cm"),
        },
        {
          key: "detectionRangeMode",
          label: "Detection Range",
          value: detectionRangeLabel(
            readString(statesById, `text_sensor.${device.prefix}_detection_range_mode`),
            device.regionConfig.detection.appliedMode,
          ),
        },
        {
          key: "trajectoryLifetime",
          label: "Trajectory Lifetime",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_trajectory_lifetime`) ?? settings.trajectoryLifetime ?? null, " s"),
        },
        {
          key: "frameGenerateCount",
          label: "Frame Generation Count",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_frame_generate_count`) ?? settings.frameGenerateCount ?? null),
        },
        {
          key: "unoccupiedTime",
          label: "Unoccupied Time",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_unoccupied_time`) ?? settings.unoccupiedTime ?? null, " s"),
        },
      ],
      actions: {
        canReset: Boolean(findWritableEntityId(device.prefix, "reset")),
        canRefresh: true,
        canManageRegions: true,
      },
      learnedRange: {
        status: "idle",
        learningEnabled: false,
        singleTargetConfirmCount: 0,
        pointCount: device.regionConfig.detection.learnedPointsCm.length,
        pointsCm: device.regionConfig.detection.learnedPointsCm.map((point) => ({ ...point })),
        updatedAt: new Date().toISOString(),
      },
    };
  },
  readDeviceSettings: (device, statesById) => buildDeviceSettings(statesById, device.prefix),
  writeDeviceSettings: async (client, device, settings) => {
    await writeDeviceSettings(client, device, settings);
  },
  applyFactoryDefaults: async (client, device) => {
    const entityRegistryEntries = await loadEntityRegistry(client);
    // 与初始化向导 Step2 一致：侧装 / 0° / 默认安装高度，再下发参数面板默认值
    await writeC4004Entity(client, device, "installMode", "Side", entityRegistryEntries);
    await writeC4004Entity(client, device, "installZAngle", 0, entityRegistryEntries);
    await writeC4004Entity(
      client,
      device,
      "installHeight",
      Math.round(FACTORY_INSTALL_HEIGHT_M * 100),
      entityRegistryEntries,
    );
    await writeC4004Entity(client, device, "setInstallInfo", undefined, entityRegistryEntries);
    await writeDeviceSettings(client, device, FACTORY_DEVICE_SETTINGS);
  },
  applyFourSidedRange: async (client, device, rangeBox) => {
    const entityRegistryEntries = await loadEntityRegistry(client);
    await writeC4004Entity(client, device, "rangeXMin", Math.round(rangeBox.xMin * 100), entityRegistryEntries);
    await writeC4004Entity(client, device, "rangeXMax", Math.round(rangeBox.xMax * 100), entityRegistryEntries);
    await writeC4004Entity(client, device, "rangeYMin", Math.round(rangeBox.yMin * 100), entityRegistryEntries);
    await writeC4004Entity(client, device, "rangeYMax", Math.round(rangeBox.yMax * 100), entityRegistryEntries);
    await writeC4004Entity(client, device, "setFourSidedRangeMode", undefined, entityRegistryEntries);
  },
  initializeDevice: async (client, device, payload) => {
    const modeParams = DETECTION_MODE_PARAMS[payload.detectionMode];
    const entityRegistryEntries = await loadEntityRegistry(client);
    // 安装参数先写入 HA pending 实体，再按 set_install_info 真正下发固件
    // 与向导 Step2 一致：侧装 / 0° / 安装高度
    await writeC4004Entity(client, device, "installMode", "Side", entityRegistryEntries);
    await writeC4004Entity(client, device, "installZAngle", 0, entityRegistryEntries);
    await writeC4004Entity(
      client,
      device,
      "installHeight",
      Math.round(payload.installHeightM * 100),
      entityRegistryEntries,
    );
    await writeC4004Entity(client, device, "setInstallInfo", undefined, entityRegistryEntries);
    // 默认四方探测范围 8×8：xmin:-400,xmax:400,ymin:0,ymax:800（cm）
    await writeC4004Entity(client, device, "rangeXMin", Math.round(INIT_FOUR_SIDED_RANGE_BOX.xMin * 100), entityRegistryEntries);
    await writeC4004Entity(client, device, "rangeXMax", Math.round(INIT_FOUR_SIDED_RANGE_BOX.xMax * 100), entityRegistryEntries);
    await writeC4004Entity(client, device, "rangeYMin", Math.round(INIT_FOUR_SIDED_RANGE_BOX.yMin * 100), entityRegistryEntries);
    await writeC4004Entity(client, device, "rangeYMax", Math.round(INIT_FOUR_SIDED_RANGE_BOX.yMax * 100), entityRegistryEntries);
    await writeC4004Entity(client, device, "setFourSidedRangeMode", undefined, entityRegistryEntries);
    await writeC4004Entity(client, device, "frameGenerateCount", modeParams.frameGenerateCount, entityRegistryEntries);
    await writeC4004Entity(client, device, "unoccupiedTime", modeParams.unoccupiedTime, entityRegistryEntries);
    // 默认开启人数汇报，周期 2s（等同 setRealTimeReportInterval(2)）
    await writeC4004Entity(client, device, "realTimeReportInterval", 2, entityRegistryEntries);
  },
  resetDevice: async (client, device) => {
    await writeC4004Entity(client, device, "reset");
  },
  factoryResetDevice: async (client, device) => {
    await writeC4004Entity(client, device, "factoryReset");
  },
  clearLiveCount: async (client, device) => {
    await writeC4004Entity(client, device, "clearLiveCount");
  },
};
