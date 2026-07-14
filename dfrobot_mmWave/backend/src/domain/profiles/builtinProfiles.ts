import type { HaEntityState } from "../../ha/types";
import type {
  C4004DeviceSettings,
  MmwaveDeviceDetail,
  MmwaveOverviewDeviceCard,
  RangeBox,
  RegionOverlay,
  StoredRegionConfig,
  StoredZoneSnapshot,
} from "../../types/mmwave";
import type { MmwaveProfileAdapter } from "./contracts";
import { findWritableEntityId, toEntityId, writeC4004Entity } from "./profileRuntime";

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

const cloneRangeBox = (rangeBox: RangeBox): RangeBox => ({ ...rangeBox });

const resolveStoredRegions = (storedConfig?: StoredRegionConfig): StoredRegionConfig["regions"] =>
  storedConfig?.regions ?? [];

const buildRangeBox = (statesById: Map<string, HaEntityState>, prefix: string): RangeBox => {
  const xMin = readNumber(statesById, toEntityId(prefix, { key: "rangeXMin", domain: "number", slug: "range_x_min", access: "readwrite" }));
  const xMax = readNumber(statesById, toEntityId(prefix, { key: "rangeXMax", domain: "number", slug: "range_x_max", access: "readwrite" }));
  const yMin = readNumber(statesById, toEntityId(prefix, { key: "rangeYMin", domain: "number", slug: "range_y_min", access: "readwrite" }));
  const yMax = readNumber(statesById, toEntityId(prefix, { key: "rangeYMax", domain: "number", slug: "range_y_max", access: "readwrite" }));

  return {
    xMin: xMin !== null ? xMin / 100 : DEFAULT_COORDINATE.xMin,
    xMax: xMax !== null ? xMax / 100 : DEFAULT_COORDINATE.xMax,
    yMin: yMin !== null ? yMin / 100 : DEFAULT_COORDINATE.yMin,
    yMax: yMax !== null ? yMax / 100 : DEFAULT_COORDINATE.yMax,
  };
};

const sumZoneCounts = (
  statesById: Map<string, HaEntityState>,
  prefix: string,
  kind: "moving" | "static",
): number => {
  let total = 0;
  for (let index = 1; index <= 5; index += 1) {
    const slug = `zone_${index}_${kind}_count`;
    const value = readNumber(statesById, `sensor.${prefix}_${slug}`);
    if (value !== null) {
      total += value;
    }
  }
  return total;
};

const buildRegions = (
  statesById: Map<string, HaEntityState>,
  prefix: string,
  storedConfig?: StoredRegionConfig,
): RegionOverlay[] =>
  resolveStoredRegions(storedConfig).filter((region) => region.enabled && region.visible).map((region) => {
    const zoneNumber = region.index + 1;
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
      active: isTruthyState(readString(statesById, entityId)),
      x: region.x,
      y: region.y,
      regionType: region.regionType,
      geometry,
      movingCount: movingCount ?? undefined,
      staticCount: staticCount ?? undefined,
      boundaryState: boundaryState && !isUnavailable(boundaryState) ? boundaryState : undefined,
      approachAwayState: approachAwayState && !isUnavailable(approachAwayState) ? approachAwayState : undefined,
    };
  });

const buildZoneSnapshot = (statesById: Map<string, HaEntityState>, prefix: string): StoredZoneSnapshot => {
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

    return {
      index,
      active: isTruthyState(readString(statesById, entityId)),
      movingCount: movingCount ?? undefined,
      staticCount: staticCount ?? undefined,
      boundaryState: boundaryState && !isUnavailable(boundaryState) ? boundaryState : undefined,
      approachAwayState: approachAwayState && !isUnavailable(approachAwayState) ? approachAwayState : undefined,
    };
  });
  return {
    updatedAt: new Date().toISOString(),
    presenceStates: zones.map((zone) => ({ id: `zone-${zone.index + 1}`, active: zone.active })),
    zones,
    counts: {
      peopleCount: readNumber(statesById, `sensor.${prefix}_people_count`) ?? 0,
      targetCount: readNumber(statesById, `sensor.${prefix}_target_count`) ?? 0,
      movingCount: sumZoneCounts(statesById, prefix, "moving"),
      staticCount: sumZoneCounts(statesById, prefix, "static"),
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
  prefix: string,
  settings: C4004DeviceSettings,
): Promise<void> => {
  for (const key of C4004_DEVICE_SETTING_KEYS) {
    const value = settings[key];
    if (value === undefined) {
      continue;
    }
    await writeC4004Entity(client, prefix, key, value);
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
    supportsMqttBridge: true,
  },
  mqttTopics: {
    component: "dfrobot_c4004",
    trajectoryStateTopic: "state/target_trajectory",
  },
  runtimeSupported: true,
  resolveDeviceOnline: (device, statesById, states) => {
    const onlineState = readString(statesById, `binary_sensor.${device.prefix}_online`);
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
      rangeBox: buildRangeBox(statesById, device.prefix),
      regions: resolveStoredRegions(device.regionConfig),
    },
    lastZoneSnapshot: buildZoneSnapshot(statesById, device.prefix),
  }),
  buildOverviewCard: (device, statesById, runtime) => {
    const peopleCount = readNumber(statesById, `sensor.${device.prefix}_people_count`) ?? 0;
    const targetCount = readNumber(statesById, `sensor.${device.prefix}_target_count`) ?? 0;
    const staticCount = sumZoneCounts(statesById, device.prefix, "static");
    const online = isTruthyState(readString(statesById, `binary_sensor.${device.prefix}_online`));
    const status = readString(statesById, `text_sensor.${device.prefix}_status`) ?? (online ? "Online" : "Offline");

    return {
      id: device.id,
      name: device.name,
      model: device.model,
      online,
      status,
      signal: device.discovery.signal,
      peopleCount,
      targetCount,
      staticCount,
      trajectoryAvailable: Boolean(runtime.trajectory),
      mqttConnected: runtime.mqttConnected,
      coordinate: cloneRangeBox(device.regionConfig.coordinate),
      rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
      detection: device.regionConfig.detection,
      regions: buildRegions(statesById, device.prefix, device.regionConfig),
      targets: runtime.trajectory?.points ?? [],
    };
  },
  buildDeviceDetail: (device, statesById, runtime) => {
    const online = isTruthyState(readString(statesById, `binary_sensor.${device.prefix}_online`));
    const status = readString(statesById, `text_sensor.${device.prefix}_status`) ?? (online ? "Online" : "Offline");
    const peopleCount = readNumber(statesById, `sensor.${device.prefix}_people_count`) ?? 0;
    const targetCount = readNumber(statesById, `sensor.${device.prefix}_target_count`) ?? 0;
    const movingCount = sumZoneCounts(statesById, device.prefix, "moving");
    const staticCount = sumZoneCounts(statesById, device.prefix, "static");

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
      regions: buildRegions(statesById, device.prefix, device.regionConfig),
      targets: runtime.trajectory?.points ?? [],
      movingCount,
      staticCount,
      ioStates: [
        { id: "io1", label: "IO1", active: isTruthyState(readString(statesById, `binary_sensor.${device.prefix}_presence`)) },
        { id: "io2", label: "IO2", active: isTruthyState(readString(statesById, `binary_sensor.${device.prefix}_zone_1_presence`)) },
        { id: "io3", label: "IO3", active: isTruthyState(readString(statesById, `binary_sensor.${device.prefix}_zone_2_presence`)) },
        { id: "io4", label: "IO4", active: isTruthyState(readString(statesById, `binary_sensor.${device.prefix}_zone_3_presence`)) },
        { id: "io5", label: "IO5", active: isTruthyState(readString(statesById, `binary_sensor.${device.prefix}_zone_4_presence`)) },
        { id: "io6", label: "IO6", active: isTruthyState(readString(statesById, `binary_sensor.${device.prefix}_zone_5_presence`)) },
      ],
      basics: [
        {
          key: "installMode",
          label: "安装方式",
          value: readString(statesById, `select.${device.prefix}_install_mode`) ?? "-",
        },
        {
          key: "realTimePeopleTime",
          label: "实时人数上报时间",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_real_time_people_time`), " s"),
        },
        {
          key: "installHeight",
          label: "安装高度",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_install_height`), " cm"),
        },
        {
          key: "trackMeters",
          label: "轨迹产生米数",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_track_meters`), " m"),
        },
        {
          key: "detectionRangeMode",
          label: "探测模式",
          value: readString(statesById, `text_sensor.${device.prefix}_detection_range_mode`) ?? "-",
        },
        {
          key: "trackExistsTime",
          label: "轨迹存在时间",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_track_exists_time`), " s"),
        },
        {
          key: "checkToActiveFrames",
          label: "确认帧数",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_check_to_active_frames`)),
        },
        {
          key: "unmannedTime",
          label: "无人时间",
          value: numberLabel(readNumber(statesById, `number.${device.prefix}_unmanned_time`), " s"),
        },
      ],
      actions: {
        canReset: Boolean(findWritableEntityId(device.prefix, "reset")),
        canRefresh: true,
        canManageRegions: true,
      },
    };
  },
  readDeviceSettings: (device, statesById) => buildDeviceSettings(statesById, device.prefix),
  writeDeviceSettings: async (client, device, settings) => {
    await writeDeviceSettings(client, device.prefix, settings);
  },
  applyFourSidedRange: async (client, device, rangeBox) => {
    await writeC4004Entity(client, device.prefix, "rangeXMin", Math.round(rangeBox.xMin * 100));
    await writeC4004Entity(client, device.prefix, "rangeXMax", Math.round(rangeBox.xMax * 100));
    await writeC4004Entity(client, device.prefix, "rangeYMin", Math.round(rangeBox.yMin * 100));
    await writeC4004Entity(client, device.prefix, "rangeYMax", Math.round(rangeBox.yMax * 100));
    await writeC4004Entity(client, device.prefix, "setFourSidedRangeMode");
  },
  initializeDevice: async (client, device, payload) => {
    const modeParams = DETECTION_MODE_PARAMS[payload.detectionMode];
    await writeC4004Entity(client, device.prefix, "installHeight", Math.round(payload.installHeightM * 100));
    await writeC4004Entity(client, device.prefix, "checkToActiveFrames", modeParams.checkToActiveFrames);
    await writeC4004Entity(client, device.prefix, "unmannedTime", modeParams.unmannedTime);
  },
  resetDevice: async (client, device) => {
    await writeC4004Entity(client, device.prefix, "reset");
  },
};
