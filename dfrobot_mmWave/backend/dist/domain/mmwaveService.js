"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MmwaveService = void 0;
const c4004Profile_1 = require("./c4004Profile");
const DEFAULT_COORDINATE = { xMin: -5, xMax: 5, yMin: 0, yMax: 9 };
const REGION_POSITIONS = [
    { x: -3.6, y: 6.8 },
    { x: -1.4, y: 6.2 },
    { x: 1.1, y: 6.5 },
    { x: -2.5, y: 3.4 },
    { x: 2.6, y: 3.6 },
    { x: 0, y: 1.8 },
];
const normalizeState = (value) => (value ? value.toLowerCase() : "");
const isTruthyState = (value) => {
    const normalized = normalizeState(value);
    return normalized === "on" || normalized === "true" || normalized === "online";
};
const isUnavailable = (value) => {
    const normalized = normalizeState(value);
    return normalized === "unknown" || normalized === "unavailable" || normalized === "";
};
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
const cloneRangeBox = (rangeBox) => ({ ...rangeBox });
const buildRangeBox = (statesById, prefix) => {
    const xMin = readNumber(statesById, (0, c4004Profile_1.toEntityId)(prefix, { key: "rangeXMin", domain: "number", slug: "range_x_min", access: "readwrite" }));
    const xMax = readNumber(statesById, (0, c4004Profile_1.toEntityId)(prefix, { key: "rangeXMax", domain: "number", slug: "range_x_max", access: "readwrite" }));
    const yMin = readNumber(statesById, (0, c4004Profile_1.toEntityId)(prefix, { key: "rangeYMin", domain: "number", slug: "range_y_min", access: "readwrite" }));
    const yMax = readNumber(statesById, (0, c4004Profile_1.toEntityId)(prefix, { key: "rangeYMax", domain: "number", slug: "range_y_max", access: "readwrite" }));
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
const buildRegionConfig = (statesById, prefix, storedConfig) => ({
    coordinate: cloneRangeBox(storedConfig?.coordinate ?? DEFAULT_COORDINATE),
    rangeBox: buildRangeBox(statesById, prefix),
    regions: resolveStoredRegions(storedConfig),
});
const buildRegions = (statesById, prefix, storedConfig) => resolveStoredRegions(storedConfig).map((region, index) => {
    const entityId = (0, c4004Profile_1.toEntityId)(prefix, {
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
        const entityId = (0, c4004Profile_1.toEntityId)(prefix, {
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
const resolveTrajectory = (deviceId, mqttBridge) => mqttBridge.getSnapshot(deviceId) ?? null;
const buildDeviceCard = (device, statesById, mqttBridge) => {
    const peopleCount = readNumber(statesById, `sensor.${device.prefix}_people_count`) ?? 0;
    const targetCount = readNumber(statesById, `sensor.${device.prefix}_target_count`) ?? 0;
    const staticCount = sumZoneCounts(statesById, device.prefix, "static");
    const trajectory = resolveTrajectory(device.id, mqttBridge);
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
        trajectoryAvailable: Boolean(trajectory),
        mqttConnected: mqttBridge.isConnected(),
        coordinate: cloneRangeBox(device.regionConfig.coordinate),
        rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
        regions: buildRegions(statesById, device.prefix, device.regionConfig),
        targets: trajectory?.points ?? [],
    };
};
const buildMetrics = (devices) => ({
    deviceCount: devices.length,
    peopleCount: devices.reduce((sum, device) => sum + device.peopleCount, 0),
    targetCount: devices.reduce((sum, device) => sum + device.targetCount, 0),
    staticCount: devices.reduce((sum, device) => sum + device.staticCount, 0),
});
class MmwaveService {
    constructor(haClient, storage, mqttBridge, logger) {
        this.haClient = haClient;
        this.storage = storage;
        this.mqttBridge = mqttBridge;
        this.logger = logger;
    }
    async discoverDevices() {
        if (!this.haClient) {
            return this.storage.listDevices();
        }
        const candidates = await (0, c4004Profile_1.discoverC4004Devices)(this.haClient);
        const devices = await this.storage.replaceFromDiscovery(candidates.map((candidate) => ({
            haDeviceId: candidate.deviceId,
            name: candidate.deviceName ?? candidate.prefix,
            model: candidate.deviceModel ?? "DFRobot C4004",
            manufacturer: candidate.manufacturer,
            firmwareVersion: candidate.firmwareVersion,
            prefix: candidate.prefix,
            mqttTopicPrefix: candidate.prefix,
            mqttKey: "main",
            status: candidate.status,
            signal: Math.min(98, 64 + candidate.score * 4),
            entityCount: candidate.entityCount,
            macAddress: candidate.macAddress,
        })));
        this.mqttBridge.setDevices(devices);
        return devices;
    }
    listDevices() {
        const devices = this.storage.listDevices();
        this.mqttBridge.setDevices(devices);
        return devices;
    }
    isMqttConnected() {
        return this.mqttBridge.isConnected();
    }
    syncDeviceState(device, statesById, options) {
        return this.storage.updateRuntimeState(device, {
            regionConfig: buildRegionConfig(statesById, device.prefix, device.regionConfig),
            lastZoneSnapshot: buildZoneSnapshot(statesById, device.prefix),
        }, options);
    }
    async getOverview() {
        const devices = this.listDevices();
        if (!this.haClient || !devices.length) {
            return { ok: true, metrics: buildMetrics([]), devices: [] };
        }
        const states = await this.haClient.getAllStates();
        const statesById = new Map(states.map((state) => [state.entity_id, state]));
        const cards = devices.map((device) => {
            const syncedDevice = this.syncDeviceState(device, statesById);
            return buildDeviceCard(syncedDevice, statesById, this.mqttBridge);
        });
        return {
            ok: true,
            metrics: buildMetrics(cards),
            devices: cards,
        };
    }
    async getDeviceDetail(deviceId, options) {
        const device = this.storage.getDevice(deviceId);
        if (!device) {
            throw new Error("Device not found");
        }
        if (!this.haClient) {
            throw new Error("Home Assistant is not linked");
        }
        const states = await this.haClient.getAllStates();
        const statesById = new Map(states.map((state) => [state.entity_id, state]));
        const syncedDevice = this.syncDeviceState(device, statesById, options);
        const trajectory = resolveTrajectory(syncedDevice.id, this.mqttBridge);
        const online = isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_online`));
        const movingCount = sumZoneCounts(statesById, syncedDevice.prefix, "moving");
        const staticCount = sumZoneCounts(statesById, syncedDevice.prefix, "static");
        return {
            id: syncedDevice.id,
            name: syncedDevice.name,
            model: syncedDevice.model,
            deviceId: syncedDevice.haDeviceId ?? syncedDevice.prefix,
            online,
            firmwareVersion: syncedDevice.firmwareVersion,
            trajectoryAvailable: Boolean(trajectory),
            mqttConnected: this.mqttBridge.isConnected(),
            lastUpdated: new Date().toISOString(),
            coordinate: cloneRangeBox(syncedDevice.regionConfig.coordinate),
            rangeBox: cloneRangeBox(syncedDevice.regionConfig.rangeBox),
            regions: buildRegions(statesById, syncedDevice.prefix, syncedDevice.regionConfig),
            targets: trajectory?.points ?? [],
            movingCount,
            staticCount,
            ioStates: [
                { id: "io1", label: "IO1", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_presence`)) },
                { id: "io2", label: "IO2", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_zone_1_presence`)) },
                { id: "io3", label: "IO3", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_zone_2_presence`)) },
                { id: "io4", label: "IO4", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_zone_3_presence`)) },
                { id: "io5", label: "IO5", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_zone_4_presence`)) },
                { id: "io6", label: "IO6", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_zone_5_presence`)) },
            ],
            basics: [
                {
                    key: "installMode",
                    label: "瀹夎鏂瑰紡",
                    value: readString(statesById, `select.${syncedDevice.prefix}_install_mode`) ?? "-",
                },
                {
                    key: "realTimePeopleTime",
                    label: "瀹炴椂浜烘暟涓婃姤鏃堕棿",
                    value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_real_time_people_time`), " s"),
                },
                {
                    key: "installHeight",
                    label: "瀹夎楂樺害",
                    value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_install_height`), " cm"),
                },
                {
                    key: "trackMeters",
                    label: "杞ㄨ抗浜х敓绫虫暟",
                    value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_track_meters`), " m"),
                },
                {
                    key: "detectionRangeMode",
                    label: "鎺㈡祴妯″紡",
                    value: readString(statesById, `text_sensor.${syncedDevice.prefix}_detection_range_mode`) ?? "-",
                },
                {
                    key: "trackExistsTime",
                    label: "杞ㄨ抗瀛樺湪鏃堕棿",
                    value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_track_exists_time`), " s"),
                },
                {
                    key: "checkToActiveFrames",
                    label: "纭甯ф暟",
                    value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_check_to_active_frames`)),
                },
                {
                    key: "unmannedTime",
                    label: "鏃犱汉鏃堕棿",
                    value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_unmanned_time`), " s"),
                },
            ],
            actions: {
                canReset: Boolean((0, c4004Profile_1.findWritableEntityId)(syncedDevice.prefix, "reset")),
                canRefresh: true,
                canManageRegions: true,
            },
        };
    }
    async refreshDevice(deviceId) {
        const devices = await this.discoverDevices();
        const exists = devices.some((device) => device.id === deviceId);
        if (!exists) {
            this.logger.warn({ deviceId }, "Refresh requested for missing device after discovery");
        }
        return this.getDeviceDetail(deviceId, { forceSnapshot: true });
    }
    async resetDevice(deviceId) {
        const device = this.storage.getDevice(deviceId);
        if (!device) {
            throw new Error("Device not found");
        }
        if (!this.haClient) {
            throw new Error("Home Assistant is not linked");
        }
        await (0, c4004Profile_1.writeC4004Entity)(this.haClient, device.prefix, "reset");
        return this.getDeviceDetail(deviceId);
    }
    handleTrajectorySnapshot(_deviceId, _snapshot) {
        // Trajectory snapshots stay in MqttBridge memory only.
    }
}
exports.MmwaveService = MmwaveService;
