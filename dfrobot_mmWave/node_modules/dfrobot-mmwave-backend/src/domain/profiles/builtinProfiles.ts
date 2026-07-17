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
} from "../../types/mmwave";
import type { MmwaveProfileAdapter } from "./contracts";
import { toDisplayTrajectoryPoints } from "../trajectory";
import {
  buildDeviceStateMap,
  findWritableEntityId,
  loadEntityRegistry,
  toEntityId,
  writeC4004Entity,
} from "./profileRuntime";

const DEFAULT_COORDINATE: RangeBox = { xMin: -5, xMax: 5, yMin: 0, yMax: 9 };

const DETECTION_MODE_PARAMS = {
  1: {
    checkToActiveFrames: 2,
    unmannedTime: 5,
  },
  2: {
    checkToActiveFrames: 7,
    unmannedTime: 30,
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
  const normalized = rawValue?.trim().toLowerCase();
  if (normalized === "four-sided range" || normalized === "four sided range") {
    return "四方探测范围";
  }
  if (normalized === "trajectory") {
    return "学习探测范围";
  }
  if (normalized === "config file") {
    return "自定义探测范围";
  }
  if (rawValue && !isUnavailable(rawValue) && normalized !== "unknown") {
    return rawValue;
  }
  if (appliedMode === "learned") {
    return "学习探测范围";
  }
  if (appliedMode === "custom") {
    return "自定义探测范围";
  }
  if (appliedMode === "rect") {
    return "四方探测范围";
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

const sumZoneCounts = (
  statesById: Map<string, HaEntityState>,
  prefix: string,
  kind: "moving" | "static",
): number | null => {
  let total = 0;
  let hasValue = false;
  for (let index = 1; index <= 5; index += 1) {
    const slug = `zone_${index}_${kind}_count`;
    const value = readNumber(statesById, `sensor.${prefix}_${slug}`);
    if (value !== null) {
      total += value;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
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

const buildZoneSnapshot = (
  statesById: Map<string, HaEntityState>,
  prefix: string,
  fallback?: StoredZoneSnapshot,
): StoredZoneSnapshot => {
  const zones = Array.from({ length: 6 }, (_, index) => {
    const zoneNumber = index + 1;
    const entityId = toEntityId(prefix, {
      key: `zone${zoneNumber}Presence`,
      domain: "binary_sensor",
      slug: `zone_${zoneNumber}_presence`,
      access: "read",
    });
    const movingCount = readNumber(statesById, `sensor.${prefix}_zone_${zoneNumber}_moving_count`);
    const staticCount = readNumber(statesById, `sensor.${prefix}_zone_${zoneNumber}_static_count`);
    const boundaryState = readString(statesById, `text_sensor.${prefix}_zone_${zoneNumber}_boundary_state`);
    const approachAwayState = readString(statesById, `text_sensor.${prefix}_zone_${zoneNumber}_approach_away_state`);
    const presenceState = readString(statesById, entityId);
    const fallbackZone = fallback?.zones.find((zone) => zone.index === index);

    return {
      index,
      active: isUnavailable(presenceState) ? fallbackZone?.active ?? false : isTruthyState(presenceState),
      movingCount: movingCount ?? fallbackZone?.movingCount,
      staticCount: staticCount ?? fallbackZone?.staticCount,
      boundaryState: boundaryState && !isUnavailable(boundaryState) ? boundaryState : undefined,
      approachAwayState: approachAwayState && !isUnavailable(approachAwayState) ? approachAwayState : undefined,
    };
  });
  const peopleCount = readNumber(statesById, `sensor.${prefix}_people_count`);
  const targetCount = readNumber(statesById, `sensor.${prefix}_target_count`);
  const movingCount = sumZoneCounts(statesById, prefix, "moving");
  const staticCount = sumZoneCounts(statesById, prefix, "static");
  return {
    updatedAt: new Date().toISOString(),
    presenceStates: zones.map((zone) => ({ id: `zone-${zone.index + 1}`, active: zone.active })),
    zones,
    counts: {
      peopleCount: peopleCount ?? fallback?.counts.peopleCount ?? 0,
      targetCount: targetCount ?? fallback?.counts.targetCount ?? 0,
      movingCount: movingCount ?? fallback?.counts.movingCount ?? 0,
      staticCount: staticCount ?? fallback?.counts.staticCount ?? 0,
    },
  };
};

const C4004_DEVICE_SETTING_KEYS = [
  "presenceEnable",
  "trajectoryTrackEnable",
  "trajectoryLed",
  "motionLed",
  "installZAngle",
  "realTimePeopleTime",
  "trackMeters",
  "trackExistsTime",
  "checkToActiveFrames",
  "unmannedTime",
  "zone1McuIo",
  "zone2McuIo",
  "zone3McuIo",
  "zone4McuIo",
  "zone5McuIo",
  "zone6McuIo",
] as const;

const buildDeviceSettings = (statesById: Map<string, HaEntityState>, prefix: string): C4004DeviceSettings => {
  const settings: C4004DeviceSettings = {};
  const booleanKeys = ["presenceEnable", "trajectoryTrackEnable", "trajectoryLed", "motionLed"] as const;
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
            : key === "trajectoryLed"
              ? "trajectory_led"
              : "motion_led",
    });
    const value = readBoolean(statesById, entityId);
    if (value !== undefined) {
      settings[key] = value;
    }
  }

  const numberEntitySlugs: Record<(typeof numberKeys)[number], string> = {
    installZAngle: "install_z_angle",
    realTimePeopleTime: "real_time_people_time",
    trackMeters: "track_meters",
    trackExistsTime: "track_exists_time",
    checkToActiveFrames: "check_to_active_frames",
    unmannedTime: "unmanned_time",
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
  buildRuntimeState: (device, statesById) => ({
    regionConfig: {
      ...device.regionConfig,
      coordinate: cloneRangeBox(device.regionConfig.coordinate),
      rangeBox: buildRangeBox(statesById, device.prefix, device.regionConfig.rangeBox),
      regions: resolveStoredRegions(device.regionConfig),
    },
    lastZoneSnapshot: buildZoneSnapshot(statesById, device.prefix, device.lastZoneSnapshot),
  }),
  buildOverviewCard: (device, statesById, runtime) => {
    const peopleCount = readNumber(statesById, `sensor.${device.prefix}_people_count`) ?? device.lastZoneSnapshot.counts.peopleCount;
    const movingCount = tagCounts(runtime, device.regionConfig, "moving");
    const staticCount = tagCounts(runtime, device.regionConfig, "static");
    const onlineState = readOnlineState(statesById, device.prefix);
    const online = onlineState === null ? device.discovery.status === "online" : isTruthyState(onlineState);
    const status = readString(statesById, `text_sensor.${device.prefix}_status`) ?? (online ? "Online" : "Offline");

    return {
      id: device.id,
      name: device.name,
      model: device.model,
      online,
      status,
      signal: device.discovery.signal,
      peopleCount,
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
      },
      deploymentName: device.deploymentName,
    };
  },
  buildDeviceDetail: (device, statesById, runtime) => {
    const onlineState = readOnlineState(statesById, device.prefix);
    const online = onlineState === null ? device.discovery.status === "online" : isTruthyState(onlineState);
    const status = readString(statesById, `text_sensor.${device.prefix}_status`) ?? (online ? "Online" : "Offline");
    const peopleCount = readNumber(statesById, `sensor.${device.prefix}_people_count`) ?? device.lastZoneSnapshot.counts.peopleCount;
    const targetCount = readNumber(statesById, `sensor.${device.prefix}_target_count`) ?? device.lastZoneSnapshot.counts.targetCount;
    const movingCount = tagCounts(runtime, device.regionConfig, "moving");
    const staticCount = tagCounts(runtime, device.regionConfig, "static");
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
      peopleCount,
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
          label: "安装方式",
          value: readString(statesById, `select.${device.prefix}_install_mode`) ?? (device.installInfo?.installMode === "side" ? "Side" : "-"),
        },
        {
          key: "realTimePeopleTime",
          label: "实时人数上报时间",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_real_time_people_time`) ?? settings.realTimePeopleTime ?? null, " s"),
        },
        {
          key: "installHeight",
          label: "安装高度",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_install_height`) ?? storedInstallHeightCm, " cm"),
        },
        {
          key: "trackMeters",
          label: "轨迹产生米数",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_track_meters`) ?? settings.trackMeters ?? null, " m"),
        },
        {
          key: "detectionRangeMode",
          label: "探测范围",
          value: detectionRangeLabel(
            readString(statesById, `text_sensor.${device.prefix}_detection_range_mode`),
            device.regionConfig.detection.appliedMode,
          ),
        },
        {
          key: "trackExistsTime",
          label: "轨迹存在时间",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_track_exists_time`) ?? settings.trackExistsTime ?? null, " s"),
        },
        {
          key: "checkToActiveFrames",
          label: "确认帧数",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_check_to_active_frames`) ?? settings.checkToActiveFrames ?? null),
        },
        {
          key: "unmannedTime",
          label: "无人时间",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_unmanned_time`) ?? settings.unmannedTime ?? null, " s"),
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
    await writeC4004Entity(client, device, "installHeight", Math.round(payload.installHeightM * 100), entityRegistryEntries);
    await writeC4004Entity(client, device, "checkToActiveFrames", modeParams.checkToActiveFrames, entityRegistryEntries);
    await writeC4004Entity(client, device, "unmannedTime", modeParams.unmannedTime, entityRegistryEntries);
  },
  resetDevice: async (client, device) => {
    await writeC4004Entity(client, device, "reset");
  },
  factoryResetDevice: async (client, device) => {
    await writeC4004Entity(client, device, "factoryReset");
  },
};
