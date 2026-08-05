import type {
  TagApproachAwayState,
  TagBoundaryState,
  TagEventType,
} from "../types/mmwave";

export interface TagEventSnapshot {
  topic: string;
  topicPrefix: string;
  mqttKey: string;
  tagIndex: number;
  tagType: TagEventType;
  tagTypeCode: number;
  ioIndex: number;
  centerXCm: number;
  centerYCm: number;
  movingCount?: number;
  staticCount?: number;
  boundaryState?: TagBoundaryState;
  approachAwayState?: TagApproachAwayState;
  receivedAt: string;
}

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeRouteString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const routeFromTopic = (topic: string): { topicPrefix: string; mqttKey: string } | null => {
  const marker = "/dfrobot_c4004/";
  const markerIndex = topic.indexOf(marker);
  if (markerIndex <= 0) {
    return null;
  }
  const topicPrefix = topic.slice(0, markerIndex);
  const remainder = topic.slice(markerIndex + marker.length);
  const [mqttKey] = remainder.split("/");
  return topicPrefix && mqttKey ? { topicPrefix, mqttKey } : null;
};

const normalizeNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const tagTypeByCode = (value: number): TagEventType | null => {
  switch (value) {
    case 0:
      return "none";
    case 1:
      return "boundary";
    case 2:
      return "approach_away";
    case 3:
      return "people_counting";
    case 4:
      return "noise";
    default:
      return null;
  }
};

const tagTypeCodeByName = (value: string): number | null => {
  switch (value) {
    case "none":
      return 0;
    case "boundary":
      return 1;
    case "approach_away":
      return 2;
    case "people_counting":
      return 3;
    case "noise":
      return 4;
    default:
      return null;
  }
};

const normalizeBoundaryState = (value: unknown): TagBoundaryState | null => {
  const normalized = normalizeString(value);
  if (normalized === "enter" || normalized === "in" || normalized === "0") {
    return "enter";
  }
  if (normalized === "exit" || normalized === "out" || normalized === "1") {
    return "exit";
  }
  if (normalized === "none" || normalized === "2" || normalized === "") {
    return "none";
  }
  return null;
};

const normalizeApproachAwayState = (value: unknown): TagApproachAwayState | null => {
  const normalized = normalizeString(value);
  if (normalized === "approach" || normalized === "near" || normalized === "0") {
    return "approach";
  }
  if (normalized === "away" || normalized === "far" || normalized === "1") {
    return "away";
  }
  if (normalized === "none" || normalized === "2" || normalized === "") {
    return "none";
  }
  return null;
};

export const parseTagEventSnapshot = (topic: string, payload: string): TagEventSnapshot | null => {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed.schema !== 1 || parsed.type !== "tag_event") {
      return null;
    }

    const topicRoute = routeFromTopic(topic);

    const tagIndex = normalizeNumber(parsed.tag_index);
    const tagTypeName = normalizeString(parsed.tag_type);
    const tagTypeCode = normalizeNumber(parsed.tag_type_code);
    const ioIndex = normalizeNumber(parsed.io_index);
    const centerXCm = normalizeNumber(parsed.center_x_cm);
    const centerYCm = normalizeNumber(parsed.center_y_cm);
    if (
      tagIndex === null ||
      tagIndex < 0 ||
      tagIndex > 31 ||
      ioIndex === null ||
      centerXCm === null ||
      centerYCm === null
    ) {
      return null;
    }

    const normalizedTypeFromName = tagTypeName ? tagTypeCodeByName(tagTypeName) : null;
    const normalizedTypeFromCode = tagTypeCode === null ? null : tagTypeByCode(tagTypeCode);
    const resolvedTagTypeCode = normalizedTypeFromName ?? tagTypeCode;
    const tagType = normalizedTypeFromCode ?? (resolvedTagTypeCode === null ? null : tagTypeByCode(resolvedTagTypeCode));
    if (!tagType) {
      return null;
    }
    if (
      normalizedTypeFromName !== null &&
      normalizedTypeFromCode !== null &&
      tagTypeByCode(normalizedTypeFromName) !== normalizedTypeFromCode
    ) {
      return null;
    }

    const movingCount = normalizeNumber(parsed.moving_count);
    const staticCount = normalizeNumber(parsed.static_count);
    const boundaryState = normalizeBoundaryState(parsed.boundary_state);
    const approachAwayState = normalizeApproachAwayState(parsed.approach_away_state);

    return {
      topic,
      topicPrefix: topicRoute?.topicPrefix ?? normalizeRouteString(parsed.device_topic_prefix),
      mqttKey: topicRoute?.mqttKey ?? (normalizeRouteString(parsed.mqtt_key) || "main"),
      tagIndex,
      tagType,
      tagTypeCode: resolvedTagTypeCode ?? 0,
      ioIndex,
      centerXCm,
      centerYCm,
      movingCount: movingCount === null ? undefined : movingCount,
      staticCount: staticCount === null ? undefined : staticCount,
      boundaryState: boundaryState ?? undefined,
      approachAwayState: approachAwayState ?? undefined,
      receivedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const tagTypeCodeToName = (value: number): TagEventType | null => tagTypeByCode(value);
