"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeC4004Entity = exports.findWritableEntityId = exports.discoverC4004Devices = exports.getDefinition = exports.toEntityId = void 0;
const entityDefinitions = [
    { key: "online", domain: "binary_sensor", slug: "online", access: "read" },
    { key: "presence", domain: "binary_sensor", slug: "presence", access: "read" },
    { key: "peopleCount", domain: "sensor", slug: "people_count", access: "read" },
    { key: "targetCount", domain: "sensor", slug: "target_count", access: "read" },
    { key: "motionState", domain: "sensor", slug: "motion_state", access: "read" },
    { key: "zone1Presence", domain: "binary_sensor", slug: "zone_1_presence", access: "read" },
    { key: "zone2Presence", domain: "binary_sensor", slug: "zone_2_presence", access: "read" },
    { key: "zone3Presence", domain: "binary_sensor", slug: "zone_3_presence", access: "read" },
    { key: "zone4Presence", domain: "binary_sensor", slug: "zone_4_presence", access: "read" },
    { key: "zone5Presence", domain: "binary_sensor", slug: "zone_5_presence", access: "read" },
    { key: "zone6Presence", domain: "binary_sensor", slug: "zone_6_presence", access: "read" },
    { key: "zone1MovingCount", domain: "sensor", slug: "zone_1_moving_count", access: "read" },
    { key: "zone2MovingCount", domain: "sensor", slug: "zone_2_moving_count", access: "read" },
    { key: "zone3MovingCount", domain: "sensor", slug: "zone_3_moving_count", access: "read" },
    { key: "zone4MovingCount", domain: "sensor", slug: "zone_4_moving_count", access: "read" },
    { key: "zone5MovingCount", domain: "sensor", slug: "zone_5_moving_count", access: "read" },
    { key: "zone1StaticCount", domain: "sensor", slug: "zone_1_static_count", access: "read" },
    { key: "zone2StaticCount", domain: "sensor", slug: "zone_2_static_count", access: "read" },
    { key: "zone3StaticCount", domain: "sensor", slug: "zone_3_static_count", access: "read" },
    { key: "zone4StaticCount", domain: "sensor", slug: "zone_4_static_count", access: "read" },
    { key: "zone5StaticCount", domain: "sensor", slug: "zone_5_static_count", access: "read" },
    { key: "detectionRangeMode", domain: "text_sensor", slug: "detection_range_mode", access: "read" },
    { key: "status", domain: "text_sensor", slug: "status", access: "read" },
    { key: "installMode", domain: "select", slug: "install_mode", access: "readwrite" },
    { key: "installHeight", domain: "number", slug: "install_height", access: "readwrite" },
    { key: "rangeXMin", domain: "number", slug: "range_x_min", access: "readwrite" },
    { key: "rangeXMax", domain: "number", slug: "range_x_max", access: "readwrite" },
    { key: "rangeYMin", domain: "number", slug: "range_y_min", access: "readwrite" },
    { key: "rangeYMax", domain: "number", slug: "range_y_max", access: "readwrite" },
    { key: "realTimePeopleTime", domain: "number", slug: "real_time_people_time", access: "readwrite" },
    { key: "trackMeters", domain: "number", slug: "track_meters", access: "readwrite" },
    { key: "trackExistsTime", domain: "number", slug: "track_exists_time", access: "readwrite" },
    { key: "checkToActiveFrames", domain: "number", slug: "check_to_active_frames", access: "readwrite" },
    { key: "unmannedTime", domain: "number", slug: "unmanned_time", access: "readwrite" },
    { key: "reset", domain: "button", slug: "reset", access: "action" },
];
const normalizeStateValue = (value) => (typeof value === "string" ? value.toLowerCase() : "");
const isOnlineStateValue = (value) => {
    const normalized = normalizeStateValue(value);
    return normalized === "on" || normalized === "online" || normalized === "true";
};
const isAvailableStateValue = (value) => {
    const normalized = normalizeStateValue(value);
    return normalized !== "" && normalized !== "unknown" && normalized !== "unavailable";
};
const normalizeMacAddress = (value) => {
    if (typeof value !== "string") {
        return undefined;
    }
    const compact = value.trim().replace(/[^a-fA-F0-9]/g, "");
    if (compact.length !== 12) {
        return undefined;
    }
    return compact.match(/.{1,2}/g)?.join(":").toUpperCase();
};
const extractMacFromDevice = (device) => {
    if (!device) {
        return undefined;
    }
    const pairs = [...(device.connections ?? []), ...(device.identifiers ?? [])];
    for (const [, value] of pairs) {
        const mac = normalizeMacAddress(value);
        if (mac) {
            return mac;
        }
    }
    return undefined;
};
const normalizeOptionalString = (value) => {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
};
const getDeviceDisplayName = (device) => normalizeOptionalString(device.name_by_user) ?? normalizeOptionalString(device.name);
const toDevicePrefix = (value) => {
    const prefix = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return prefix.includes("c4004") ? prefix : undefined;
};
const getDevicePrefix = (device) => {
    const rawPrefix = normalizeOptionalString(device.name) ?? normalizeOptionalString(device.name_by_user);
    return rawPrefix ? toDevicePrefix(rawPrefix) : undefined;
};
const getAreaDisplayName = (areaId, areaRegistry) => {
    if (!areaId) {
        return undefined;
    }
    return areaRegistry.get(areaId);
};
const isC4004RegistryDevice = (device) => {
    const combined = [device.name_by_user, device.name, device.manufacturer, device.model]
        .filter((value) => typeof value === "string")
        .join(" ")
        .toLowerCase();
    return combined.includes("c4004") || (combined.includes("dfrobot") && combined.includes("c4004"));
};
const objectIdFromEntityId = (entityId) => entityId.split(".", 2)[1] ?? "";
const toEntityId = (prefix, definition) => `${definition.domain}.${prefix}_${definition.slug}`;
exports.toEntityId = toEntityId;
const getDefinition = (key) => entityDefinitions.find((definition) => definition.key === key);
exports.getDefinition = getDefinition;
const sortedDefinitions = [...entityDefinitions].sort((left, right) => right.slug.length - left.slug.length);
const matchState = (state) => {
    const [domain, objectId] = state.entity_id.split(".");
    if (!domain || !objectId) {
        return undefined;
    }
    for (const definition of sortedDefinitions) {
        if (definition.domain !== domain) {
            continue;
        }
        if (objectId.endsWith(`_${definition.slug}`)) {
            return {
                definition,
                prefix: objectId.slice(0, objectId.length - definition.slug.length - 1),
                state,
            };
        }
    }
    return undefined;
};
const selectDeviceIdForPrefix = (prefix, entityRegistry, states) => {
    const counts = new Map();
    for (const state of states) {
        const objectId = objectIdFromEntityId(state.entity_id);
        if (!objectId.startsWith(`${prefix}_`)) {
            continue;
        }
        const deviceId = entityRegistry.get(state.entity_id)?.device_id;
        if (deviceId) {
            counts.set(deviceId, (counts.get(deviceId) ?? 0) + 1);
        }
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
};
const resolveRelatedStates = (prefix, deviceId, entityRegistry, states) => states.filter((state) => {
    const objectId = objectIdFromEntityId(state.entity_id);
    return objectId.startsWith(`${prefix}_`) || (deviceId && entityRegistry.get(state.entity_id)?.device_id === deviceId);
});
const resolveDeviceStatus = (prefix, relatedStates) => {
    const onlineState = relatedStates.find((state) => state.entity_id === (0, exports.toEntityId)(prefix, entityDefinitions[0]));
    if (onlineState) {
        return isOnlineStateValue(onlineState.state) ? "online" : "offline";
    }
    return relatedStates.some((state) => isAvailableStateValue(state.state)) ? "online" : "offline";
};
const discoverC4004Devices = async (client) => {
    const [states, entityRegistryEntries, deviceRegistryEntries, areaRegistryEntries] = await Promise.all([
        client.getAllStates(),
        client.getEntityRegistry(),
        client.getDeviceRegistry(),
        client.getAreaRegistry(),
    ]);
    const matched = states.map(matchState).filter((entry) => Boolean(entry));
    const counts = new Map();
    for (const entry of matched) {
        counts.set(entry.prefix, (counts.get(entry.prefix) ?? 0) + 1);
    }
    const entityRegistry = new Map(entityRegistryEntries.map((entry) => [entry.entity_id, entry]));
    const deviceRegistry = new Map(deviceRegistryEntries.map((entry) => [entry.id, entry]));
    const areaRegistry = new Map(areaRegistryEntries.map((entry) => [entry.id, normalizeOptionalString(entry.name)]));
    const candidates = [];
    const candidatePrefixes = new Set();
    const pushCandidate = (prefix, score, deviceId) => {
        if (candidatePrefixes.has(prefix)) {
            return;
        }
        candidatePrefixes.add(prefix);
        if (!prefix.includes("c4004") && score < 4) {
            return;
        }
        const resolvedDeviceId = deviceId ?? selectDeviceIdForPrefix(prefix, entityRegistry, states);
        const relatedStates = resolveRelatedStates(prefix, resolvedDeviceId, entityRegistry, states);
        const device = resolvedDeviceId ? deviceRegistry.get(resolvedDeviceId) : undefined;
        const name = device ? getDeviceDisplayName(device) : undefined;
        const manufacturer = device ? normalizeOptionalString(device.manufacturer) : undefined;
        const model = device ? normalizeOptionalString(device.model) : undefined;
        const firmwareVersion = device ? normalizeOptionalString(device.sw_version) : undefined;
        const deploymentName = device ? getAreaDisplayName(device.area_id, areaRegistry) : undefined;
        if (!device && !prefix.toLowerCase().includes("c4004")) {
            return;
        }
        if (device && !isC4004RegistryDevice(device) && score < 4) {
            return;
        }
        candidates.push({
            prefix,
            score,
            status: resolveDeviceStatus(prefix, relatedStates),
            deviceId: resolvedDeviceId,
            deviceName: name ?? prefix,
            deploymentName,
            manufacturer,
            deviceModel: model ?? "DFRobot C4004",
            firmwareVersion,
            macAddress: extractMacFromDevice(device),
            entityCount: relatedStates.length,
        });
    };
    for (const [prefix, score] of [...counts.entries()]) {
        pushCandidate(prefix, score);
    }
    for (const device of deviceRegistryEntries) {
        if (!isC4004RegistryDevice(device)) {
            continue;
        }
        const prefix = getDevicePrefix(device);
        if (!prefix) {
            continue;
        }
        const score = counts.get(prefix) ?? 0;
        pushCandidate(prefix, score, device.id);
    }
    return candidates.sort((left, right) => right.score - left.score || left.prefix.localeCompare(right.prefix));
};
exports.discoverC4004Devices = discoverC4004Devices;
const findWritableEntityId = (prefix, key) => {
    const definition = (0, exports.getDefinition)(key);
    if (!definition || definition.access === "read") {
        return null;
    }
    return (0, exports.toEntityId)(prefix, definition);
};
exports.findWritableEntityId = findWritableEntityId;
const writeC4004Entity = async (client, prefix, key, value) => {
    const definition = (0, exports.getDefinition)(key);
    if (!definition) {
        throw new Error(`Unknown entity key: ${key}`);
    }
    const entityId = (0, exports.toEntityId)(prefix, definition);
    if (definition.domain === "button") {
        await client.callService("button", "press", { entity_id: entityId });
        return;
    }
    if (definition.domain === "number") {
        await client.callService("number", "set_value", { entity_id: entityId, value: Number(value) });
        return;
    }
    if (definition.domain === "select") {
        await client.callService("select", "select_option", { entity_id: entityId, option: String(value) });
        return;
    }
    if (definition.domain === "switch") {
        const service = value === true || value === "on" ? "turn_on" : "turn_off";
        await client.callService("switch", service, { entity_id: entityId });
        return;
    }
    throw new Error(`Unsupported writable domain: ${definition.domain}`);
};
exports.writeC4004Entity = writeC4004Entity;
