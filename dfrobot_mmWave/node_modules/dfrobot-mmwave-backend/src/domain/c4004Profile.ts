import type {
  HaDeviceRegistryEntry,
  HaEntityRegistryEntry,
  HaEntityState,
} from "../ha/types";
import type { HaClient } from "../ha/client";

export type EntityDomain =
  | "binary_sensor"
  | "sensor"
  | "text_sensor"
  | "text"
  | "switch"
  | "select"
  | "number"
  | "button";

export interface C4004EntityDefinition {
  key: string;
  domain: EntityDomain;
  slug: string;
  access: "read" | "readwrite" | "action";
}

export interface C4004DiscoveryCandidate {
  prefix: string;
  score: number;
  status: "online" | "offline";
  deviceId?: string;
  deviceName?: string;
  deploymentName?: string;
  manufacturer?: string;
  deviceModel?: string;
  firmwareVersion?: string;
  macAddress?: string;
  entityCount: number;
}

const entityDefinitions: C4004EntityDefinition[] = [
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

const normalizeStateValue = (value?: string | null) => (typeof value === "string" ? value.toLowerCase() : "");

const isOnlineStateValue = (value?: string | null) => {
  const normalized = normalizeStateValue(value);
  return normalized === "on" || normalized === "online" || normalized === "true";
};

const isAvailableStateValue = (value?: string | null) => {
  const normalized = normalizeStateValue(value);
  return normalized !== "" && normalized !== "unknown" && normalized !== "unavailable";
};

const normalizeMacAddress = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const compact = value.trim().replace(/[^a-fA-F0-9]/g, "");
  if (compact.length !== 12) {
    return undefined;
  }
  return compact.match(/.{1,2}/g)?.join(":").toUpperCase();
};

const extractMacFromDevice = (device?: HaDeviceRegistryEntry): string | undefined => {
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

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const getDeviceDisplayName = (device: HaDeviceRegistryEntry): string | undefined =>
  normalizeOptionalString(device.name_by_user) ?? normalizeOptionalString(device.name);

const toDevicePrefix = (value: string): string | undefined => {
  const prefix = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return prefix.includes("c4004") ? prefix : undefined;
};

const getDevicePrefix = (device: HaDeviceRegistryEntry): string | undefined => {
  const rawPrefix = normalizeOptionalString(device.name) ?? normalizeOptionalString(device.name_by_user);
  return rawPrefix ? toDevicePrefix(rawPrefix) : undefined;
};

const getAreaDisplayName = (
  areaId: string | null | undefined,
  areaRegistry: Map<string, string | undefined>,
): string | undefined => {
  if (!areaId) {
    return undefined;
  }
  return areaRegistry.get(areaId);
};

const isC4004RegistryDevice = (device: HaDeviceRegistryEntry): boolean => {
  const combined = [device.name_by_user, device.name, device.manufacturer, device.model]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return combined.includes("c4004") || (combined.includes("dfrobot") && combined.includes("c4004"));
};

const objectIdFromEntityId = (entityId: string) => entityId.split(".", 2)[1] ?? "";

export const toEntityId = (prefix: string, definition: C4004EntityDefinition): string =>
  `${definition.domain}.${prefix}_${definition.slug}`;

export const getDefinition = (key: string): C4004EntityDefinition | undefined =>
  entityDefinitions.find((definition) => definition.key === key);

const sortedDefinitions = [...entityDefinitions].sort((left, right) => right.slug.length - left.slug.length);

const matchState = (state: HaEntityState) => {
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

const selectDeviceIdForPrefix = (
  prefix: string,
  entityRegistry: Map<string, HaEntityRegistryEntry>,
  states: HaEntityState[],
): string | undefined => {
  const counts = new Map<string, number>();
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

const resolveRelatedStates = (
  prefix: string,
  deviceId: string | undefined,
  entityRegistry: Map<string, HaEntityRegistryEntry>,
  states: HaEntityState[],
): HaEntityState[] =>
  states.filter((state) => {
    const objectId = objectIdFromEntityId(state.entity_id);
    return objectId.startsWith(`${prefix}_`) || (deviceId && entityRegistry.get(state.entity_id)?.device_id === deviceId);
  });

const resolveDeviceStatus = (prefix: string, relatedStates: HaEntityState[]): "online" | "offline" => {
  const onlineState = relatedStates.find((state) => state.entity_id === toEntityId(prefix, entityDefinitions[0]));
  if (onlineState) {
    return isOnlineStateValue(onlineState.state) ? "online" : "offline";
  }
  return relatedStates.some((state) => isAvailableStateValue(state.state)) ? "online" : "offline";
};

export const discoverC4004Devices = async (
  client: HaClient,
): Promise<C4004DiscoveryCandidate[]> => {
  const [states, entityRegistryEntries, deviceRegistryEntries, areaRegistryEntries] = await Promise.all([
    client.getAllStates(),
    client.getEntityRegistry(),
    client.getDeviceRegistry(),
    client.getAreaRegistry(),
  ]);

  const matched = states.map(matchState).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const counts = new Map<string, number>();
  for (const entry of matched) {
    counts.set(entry.prefix, (counts.get(entry.prefix) ?? 0) + 1);
  }

  const entityRegistry = new Map(entityRegistryEntries.map((entry) => [entry.entity_id, entry]));
  const deviceRegistry = new Map(deviceRegistryEntries.map((entry) => [entry.id, entry]));
  const areaRegistry = new Map(
    areaRegistryEntries.map((entry) => [entry.id, normalizeOptionalString(entry.name)]),
  );

  const candidates: C4004DiscoveryCandidate[] = [];
  const candidatePrefixes = new Set<string>();
  const pushCandidate = (prefix: string, score: number, deviceId?: string) => {
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

export const findWritableEntityId = (prefix: string, key: string): string | null => {
  const definition = getDefinition(key);
  if (!definition || definition.access === "read") {
    return null;
  }
  return toEntityId(prefix, definition);
};

export const writeC4004Entity = async (
  client: HaClient,
  prefix: string,
  key: string,
  value?: string | number | boolean,
): Promise<void> => {
  const definition = getDefinition(key);
  if (!definition) {
    throw new Error(`Unknown entity key: ${key}`);
  }

  const entityId = toEntityId(prefix, definition);
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
