import type { TrajectoryPoint, TrajectorySnapshot } from "../types/mmwave";

const normalizeHex = (value: string): string => value.replace(/\s+/g, "").toUpperCase();

const parseSignedBitInt16 = (high: number, low: number): number => {
  const raw = (high << 8) | low;
  const negative = (raw & 0x8000) !== 0;
  const magnitude = raw & 0x7fff;
  return negative ? -magnitude : magnitude;
};

export const toDisplayTrajectoryPoints = (points: readonly TrajectoryPoint[]): TrajectoryPoint[] =>
  points.map((point) => ({
    ...point,
    x: -point.x,
  }));

/**
 * Device-level moving/static counts from live trajectory targets.
 * Dedupes by target id so overlapping tag regions cannot double-count the same person.
 * Targets with feature "unknown" are ignored for both counts.
 */
export const countTrajectoryByFeature = (
  points: readonly Pick<TrajectoryPoint, "id" | "feature">[],
): { movingCount: number; staticCount: number } => {
  const byId = new Map<number, TrajectoryPoint["feature"]>();
  for (const point of points) {
    byId.set(point.id, point.feature);
  }

  let movingCount = 0;
  let staticCount = 0;
  for (const feature of byId.values()) {
    if (feature === "moving") {
      movingCount += 1;
    } else if (feature === "static") {
      staticCount += 1;
    }
  }
  return { movingCount, staticCount };
};

export const parseTargetTrajectoryHex = (hex: string): TrajectoryPoint[] => {
  const normalized = normalizeHex(hex);
  if (normalized.length < 2 || normalized.length % 2 !== 0) {
    return [];
  }

  const bytes = normalized.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
  const targetCount = bytes[0] ?? 0;
  const points: TrajectoryPoint[] = [];

  for (let index = 0; index < targetCount; index += 1) {
    const offset = 1 + index * 11;
    if (offset + 10 >= bytes.length) {
      break;
    }

    const featureRaw = bytes[offset + 2];
    const x = parseSignedBitInt16(bytes[offset + 3], bytes[offset + 4]) / 100;
    const y = parseSignedBitInt16(bytes[offset + 5], bytes[offset + 6]) / 100;
    const speed = parseSignedBitInt16(bytes[offset + 9], bytes[offset + 10]) / 100;

    points.push({
      id: bytes[offset],
      x,
      y,
      speed,
      feature: featureRaw === 0 ? "static" : featureRaw === 1 ? "moving" : "unknown",
    });
  }

  return points;
};

export const parseTrajectorySnapshot = (topic: string, payload: string): TrajectorySnapshot | null => {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed.type !== "target_trajectory" || typeof parsed.hex !== "string") {
      return null;
    }

    const hex = normalizeHex(parsed.hex);
    const points = parseTargetTrajectoryHex(hex);
    const parsedTargetCount = typeof parsed.target_count === "number" ? parsed.target_count : undefined;
    return {
      topic,
      topicPrefix: typeof parsed.device_topic_prefix === "string" ? parsed.device_topic_prefix : "",
      mqttKey: typeof parsed.mqtt_key === "string" ? parsed.mqtt_key : "main",
      targetCount: Math.max(parsedTargetCount ?? 0, points.length),
      points,
      hex,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
};
