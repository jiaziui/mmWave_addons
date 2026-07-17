import type { HaClient } from "../../ha/client";
import type { HaEntityRegistryEntry, HaEntityState } from "../../ha/types";

export interface ProfileEntityOwner {
  prefix: string;
  haDeviceId?: string;
}

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
  aliases?: readonly string[];
  access: "read" | "readwrite" | "action";
}

const entityDefinitions: C4004EntityDefinition[] = [
  { key: "online", domain: "binary_sensor", slug: "online", access: "read" },
  { key: "presence", domain: "binary_sensor", slug: "presence", access: "read" },
  { key: "peopleCount", domain: "sensor", slug: "people_count", access: "read" },
  { key: "targetCount", domain: "sensor", slug: "target_count", access: "read" },
  { key: "motionState", domain: "sensor", slug: "motion_state", access: "read" },
  { key: "zone1Presence", domain: "binary_sensor", slug: "zone_1_presence", aliases: ["overall_zone_presence"], access: "read" },
  { key: "zone2Presence", domain: "binary_sensor", slug: "zone_2_presence", aliases: ["zone_presence_2"], access: "read" },
  { key: "zone3Presence", domain: "binary_sensor", slug: "zone_3_presence", aliases: ["zone_presence_3"], access: "read" },
  { key: "zone4Presence", domain: "binary_sensor", slug: "zone_4_presence", aliases: ["zone_presence_4"], access: "read" },
  { key: "zone5Presence", domain: "binary_sensor", slug: "zone_5_presence", aliases: ["zone_presence_5"], access: "read" },
  { key: "zone6Presence", domain: "binary_sensor", slug: "zone_6_presence", aliases: ["zone_presence_6"], access: "read" },
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
  { key: "presenceEnable", domain: "switch", slug: "presence_enable", access: "readwrite" },
  { key: "trajectoryTrackEnable", domain: "switch", slug: "trajectory_track_enable", access: "readwrite" },
  { key: "trajectoryLed", domain: "switch", slug: "trajectory_led", access: "readwrite" },
  { key: "motionLed", domain: "switch", slug: "motion_led", access: "readwrite" },
  { key: "installMode", domain: "select", slug: "install_mode", access: "readwrite" },
  { key: "installHeight", domain: "number", slug: "install_height", access: "readwrite" },
  { key: "installZAngle", domain: "number", slug: "install_z_angle", access: "readwrite" },
  { key: "rangeXMin", domain: "number", slug: "range_x_min", access: "readwrite" },
  { key: "rangeXMax", domain: "number", slug: "range_x_max", access: "readwrite" },
  { key: "rangeYMin", domain: "number", slug: "range_y_min", access: "readwrite" },
  { key: "rangeYMax", domain: "number", slug: "range_y_max", access: "readwrite" },
  { key: "realTimePeopleTime", domain: "number", slug: "real_time_people_time", access: "readwrite" },
  { key: "trackMeters", domain: "number", slug: "track_meters", access: "readwrite" },
  { key: "trackExistsTime", domain: "number", slug: "track_exists_time", access: "readwrite" },
  { key: "checkToActiveFrames", domain: "number", slug: "check_to_active_frames", access: "readwrite" },
  { key: "unmannedTime", domain: "number", slug: "unmanned_time", access: "readwrite" },
  { key: "zone1McuIo", domain: "number", slug: "zone_1_mcu_io", aliases: ["overall_presence_state"], access: "readwrite" },
  { key: "zone2McuIo", domain: "number", slug: "zone_2_mcu_io", aliases: ["zone_mcu_io2", "zone_mcu_io_2"], access: "readwrite" },
  { key: "zone3McuIo", domain: "number", slug: "zone_3_mcu_io", aliases: ["zone_mcu_io3", "zone_mcu_io_3"], access: "readwrite" },
  { key: "zone4McuIo", domain: "number", slug: "zone_4_mcu_io", aliases: ["zone_mcu_io4", "zone_mcu_io_4"], access: "readwrite" },
  { key: "zone5McuIo", domain: "number", slug: "zone_5_mcu_io", aliases: ["zone_mcu_io5", "zone_mcu_io_5"], access: "readwrite" },
  { key: "zone6McuIo", domain: "number", slug: "zone_6_mcu_io", aliases: ["zone_mcu_io6", "zone_mcu_io_6"], access: "readwrite" },
  { key: "setFourSidedRangeMode", domain: "button", slug: "set_four_sided_range_mode", access: "action" },
  { key: "reset", domain: "button", slug: "reset", access: "action" },
  { key: "factoryReset", domain: "button", slug: "factory_reset", access: "action" },
];

export const toEntityId = (prefix: string, definition: C4004EntityDefinition): string =>
  `${definition.domain}.${prefix}_${definition.slug}`;

export const getDefinition = (key: string): C4004EntityDefinition | undefined =>
  entityDefinitions.find((definition) => definition.key === key);

const objectIdFromEntityId = (entityId: string): string => entityId.split(".", 2)[1] ?? "";

const definitionSlugs = (definition: C4004EntityDefinition): readonly string[] =>
  [definition.slug, ...(definition.aliases ?? [])];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const matchesDefinition = (entityId: string, definition: C4004EntityDefinition): boolean => {
  const [domain, objectId] = entityId.split(".", 2);
  if (domain !== definition.domain || !objectId) {
    return false;
  }
  return definitionSlugs(definition).some((slug) => {
    const suffix = `_${slug}`;
    return objectId.endsWith(suffix) || new RegExp(`${escapeRegExp(suffix)}_\\d+$`).test(objectId);
  });
};

export const resolveEntityId = (
  owner: ProfileEntityOwner,
  definition: C4004EntityDefinition,
  entityRegistryEntries: readonly HaEntityRegistryEntry[] = [],
): string => {
  const canonicalEntityId = toEntityId(owner.prefix, definition);
  const deviceEntries = owner.haDeviceId
    ? entityRegistryEntries.filter((entry) => entry.device_id === owner.haDeviceId)
    : entityRegistryEntries;
  const candidates = deviceEntries.filter((entry) => matchesDefinition(entry.entity_id, definition));

  const exact = candidates.find((entry) => entry.entity_id === canonicalEntityId);
  if (exact) {
    return exact.entity_id;
  }

  const expectedObjectIds = definitionSlugs(definition).map((slug) => `${owner.prefix}_${slug}`);
  const prefixedCandidates = candidates.filter(
    (entry) => {
      const objectId = objectIdFromEntityId(entry.entity_id);
      return expectedObjectIds.some(
        (expectedObjectId) =>
          objectId === expectedObjectId || new RegExp(`^${escapeRegExp(expectedObjectId)}_\\d+$`).test(objectId),
      );
    },
  );
  if (prefixedCandidates.length === 1) {
    return prefixedCandidates[0].entity_id;
  }

  if (candidates.length === 1) {
    return candidates[0].entity_id;
  }
  if (candidates.length > 1) {
    throw new Error(`Ambiguous entity mapping for ${definition.key} on HA device ${owner.haDeviceId ?? owner.prefix}`);
  }
  return canonicalEntityId;
};

export const loadEntityRegistry = async (client: HaClient): Promise<HaEntityRegistryEntry[]> => {
  try {
    return await client.getEntityRegistry();
  } catch {
    return [];
  }
};

export const buildDeviceStateMap = (
  owner: ProfileEntityOwner,
  statesById: Map<string, HaEntityState>,
  entityRegistryEntries: readonly HaEntityRegistryEntry[],
): Map<string, HaEntityState> => {
  const mappedStates = new Map(statesById);
  for (const definition of entityDefinitions) {
    const canonicalEntityId = toEntityId(owner.prefix, definition);
    if (mappedStates.has(canonicalEntityId)) {
      continue;
    }
    let actualEntityId: string;
    try {
      actualEntityId = resolveEntityId(owner, definition, entityRegistryEntries);
    } catch {
      continue;
    }
    const state = statesById.get(actualEntityId);
    if (state) {
      mappedStates.set(canonicalEntityId, state);
    }
  }
  return mappedStates;
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
  owner: ProfileEntityOwner,
  key: string,
  value?: string | number | boolean,
  entityRegistryEntries?: readonly HaEntityRegistryEntry[],
): Promise<void> => {
  const definition = getDefinition(key);
  if (!definition) {
    throw new Error(`Unknown entity key: ${key}`);
  }

  const registryEntries = entityRegistryEntries ?? await loadEntityRegistry(client);
  const entityId = resolveEntityId(owner, definition, registryEntries);
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
