import type { HaClient } from "../../ha/client";

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
  { key: "zone1McuIo", domain: "number", slug: "zone_1_mcu_io", access: "readwrite" },
  { key: "zone2McuIo", domain: "number", slug: "zone_2_mcu_io", access: "readwrite" },
  { key: "zone3McuIo", domain: "number", slug: "zone_3_mcu_io", access: "readwrite" },
  { key: "zone4McuIo", domain: "number", slug: "zone_4_mcu_io", access: "readwrite" },
  { key: "zone5McuIo", domain: "number", slug: "zone_5_mcu_io", access: "readwrite" },
  { key: "zone6McuIo", domain: "number", slug: "zone_6_mcu_io", access: "readwrite" },
  { key: "setFourSidedRangeMode", domain: "button", slug: "set_four_sided_range_mode", access: "action" },
  { key: "reset", domain: "button", slug: "reset", access: "action" },
];

export const toEntityId = (prefix: string, definition: C4004EntityDefinition): string =>
  `${definition.domain}.${prefix}_${definition.slug}`;

export const getDefinition = (key: string): C4004EntityDefinition | undefined =>
  entityDefinitions.find((definition) => definition.key === key);

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
