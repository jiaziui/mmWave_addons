"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.c4004ProfileAdapter = void 0;
const profileRuntime_1 = require("./profileRuntime");
const DEFAULT_COORDINATE = { xMin: -5, xMax: 5, yMin: 0, yMax: 9 };
const REGION_POSITIONS = [
    { x: -3.6, y: 6.8 },
    { x: -1.4, y: 6.2 },
    { x: 1.1, y: 6.5 },
    { x: -2.5, y: 3.4 },
    { x: 2.6, y: 3.6 },
    { x: 0, y: 1.8 },
];
const DETECTION_MODE_PARAMS = {
    1: {
        checkToActiveFrames: 2,
        unmannedTime: 5,
    },
    2: {
        checkToActiveFrames: 7,
        unmannedTime: 30,
    },
};
const normalizeState = (value) => (value ? value.toLowerCase() : "");
const isTruthyState = (value) => {
    const normalized = normalizeState(value);
    return normalized === "on" || normalized === "true" || normalized === "online";
};
const isUnavailable = (value) => {
    const normalized = normalizeState(value);
    return normalized === "unknown" || normalized === "unavailable" || normalized === "";
};
const isAvailableState = (value) => !isUnavailable(value);
const toNumber = (value) => {
    if (!value || isUnavailable(value)) {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const numberLabel = (value, suffix = "") => {
    if (value === null) {
        return "-";
    }
    return `${value}${suffix}`;
};
const getEntityState = (statesById, entityId) => statesById.get(entityId);
const readString = (statesById, entityId) => getEntityState(statesById, entityId)?.state ?? null;
const readNumber = (statesById, entityId) => toNumber(readString(statesById, entityId));
const readBoolean = (statesById, entityId) => {
    const value = readString(statesById, entityId);
    if (isUnavailable(value)) {
        return undefined;
    }
    return isTruthyState(value);
};
const objectIdFromEntityId = (entityId) => entityId.split(".", 2)[1] ?? "";
const cloneRangeBox = (rangeBox) => ({ ...rangeBox });
const resolveStoredRegions = (storedConfig) => Array.from({ length: 6 }, (_, index) => {
    const id = `zone-${index + 1}`;
    const storedRegion = storedConfig?.regions.find((region) => region.id === id);
    return {
        id,
        label: storedRegion?.label ?? `Zone ${index + 1}`,
        x: storedRegion?.x ?? REGION_POSITIONS[index]?.x ?? 0,
        y: storedRegion?.y ?? REGION_POSITIONS[index]?.y ?? 0,
        enabled: storedRegion?.enabled ?? true,
    };
});
const buildRangeBox = (statesById, prefix) => {
    const xMin = readNumber(statesById, (0, profileRuntime_1.toEntityId)(prefix, { key: "rangeXMin", domain: "number", slug: "range_x_min", access: "readwrite" }));
    const xMax = readNumber(statesById, (0, profileRuntime_1.toEntityId)(prefix, { key: "rangeXMax", domain: "number", slug: "range_x_max", access: "readwrite" }));
    const yMin = readNumber(statesById, (0, profileRuntime_1.toEntityId)(prefix, { key: "rangeYMin", domain: "number", slug: "range_y_min", access: "readwrite" }));
    const yMax = readNumber(statesById, (0, profileRuntime_1.toEntityId)(prefix, { key: "rangeYMax", domain: "number", slug: "range_y_max", access: "readwrite" }));
    return {
        xMin: xMin !== null ? xMin / 100 : DEFAULT_COORDINATE.xMin,
        xMax: xMax !== null ? xMax / 100 : DEFAULT_COORDINATE.xMax,
        yMin: yMin !== null ? yMin / 100 : DEFAULT_COORDINATE.yMin,
        yMax: yMax !== null ? yMax / 100 : DEFAULT_COORDINATE.yMax,
    };
};
const sumZoneCounts = (statesById, prefix, kind) => {
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
const buildRegions = (statesById, prefix, storedConfig) => resolveStoredRegions(storedConfig).map((region, index) => {
    const entityId = (0, profileRuntime_1.toEntityId)(prefix, {
        key: `zone${index + 1}Presence`,
        domain: "binary_sensor",
        slug: `zone_${index + 1}_presence`,
        access: "read",
    });
    return {
        id: region.id,
        label: region.label,
        active: isTruthyState(readString(statesById, entityId)),
        x: region.x,
        y: region.y,
    };
});
const buildZoneSnapshot = (statesById, prefix) => ({
    updatedAt: new Date().toISOString(),
    presenceStates: Array.from({ length: 6 }, (_, index) => {
        const entityId = (0, profileRuntime_1.toEntityId)(prefix, {
            key: `zone${index + 1}Presence`,
            domain: "binary_sensor",
            slug: `zone_${index + 1}_presence`,
            access: "read",
        });
        return {
            id: `zone-${index + 1}`,
            active: isTruthyState(readString(statesById, entityId)),
        };
    }),
    counts: {
        peopleCount: readNumber(statesById, `sensor.${prefix}_people_count`) ?? 0,
        targetCount: readNumber(statesById, `sensor.${prefix}_target_count`) ?? 0,
        movingCount: sumZoneCounts(statesById, prefix, "moving"),
        staticCount: sumZoneCounts(statesById, prefix, "static"),
    },
});
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
];
const buildDeviceSettings = (statesById, prefix) => {
    const settings = {};
    const booleanKeys = ["presenceEnable", "trajectoryTrackEnable", "trajectoryLed", "motionLed"];
    const numberKeys = C4004_DEVICE_SETTING_KEYS.filter((key) => !booleanKeys.includes(key));
    for (const key of booleanKeys) {
        const definition = { key, domain: "switch", slug: "", access: "readwrite" };
        const entityId = (0, profileRuntime_1.toEntityId)(prefix, {
            ...definition,
            slug: key === "presenceEnable"
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
    const numberEntitySlugs = {
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
const writeDeviceSettings = async (client, prefix, settings) => {
    for (const key of C4004_DEVICE_SETTING_KEYS) {
        const value = settings[key];
        if (value === undefined) {
            continue;
        }
        await (0, profileRuntime_1.writeC4004Entity)(client, prefix, key, value);
    }
};
exports.c4004ProfileAdapter = {
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
        return states.some((state) => objectIdFromEntityId(state.entity_id).startsWith(`${device.prefix}_`) && isAvailableState(state.state));
    },
    buildRuntimeState: (device, statesById) => ({
        regionConfig: {
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
            regions: buildRegions(statesById, device.prefix, device.regionConfig),
            targets: runtime.trajectory?.points ?? [],
        };
    },
    buildDeviceDetail: (device, statesById, runtime) => {
        const online = isTruthyState(readString(statesById, `binary_sensor.${device.prefix}_online`));
        const movingCount = sumZoneCounts(statesById, device.prefix, "moving");
        const staticCount = sumZoneCounts(statesById, device.prefix, "static");
        return {
            id: device.id,
            name: device.name,
            model: device.model,
            deviceId: device.haDeviceId ?? device.prefix,
            online,
            firmwareVersion: device.firmwareVersion,
            trajectoryAvailable: Boolean(runtime.trajectory),
            mqttConnected: runtime.mqttConnected,
            lastUpdated: new Date().toISOString(),
            coordinate: cloneRangeBox(device.regionConfig.coordinate),
            rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
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
                canReset: Boolean((0, profileRuntime_1.findWritableEntityId)(device.prefix, "reset")),
                canRefresh: true,
                canManageRegions: true,
            },
        };
    },
    readDeviceSettings: (device, statesById) => buildDeviceSettings(statesById, device.prefix),
    writeDeviceSettings: async (client, device, settings) => {
        await writeDeviceSettings(client, device.prefix, settings);
    },
    initializeDevice: async (client, device, payload) => {
        const modeParams = DETECTION_MODE_PARAMS[payload.detectionMode];
        await (0, profileRuntime_1.writeC4004Entity)(client, device.prefix, "installHeight", Math.round(payload.installHeightM * 100));
        await (0, profileRuntime_1.writeC4004Entity)(client, device.prefix, "checkToActiveFrames", modeParams.checkToActiveFrames);
        await (0, profileRuntime_1.writeC4004Entity)(client, device.prefix, "unmannedTime", modeParams.unmannedTime);
    },
    resetDevice: async (client, device) => {
        await (0, profileRuntime_1.writeC4004Entity)(client, device.prefix, "reset");
    },
};
