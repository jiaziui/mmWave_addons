"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTrajectorySnapshot = exports.parseTargetTrajectoryHex = exports.toDisplayTrajectoryPoints = void 0;
const normalizeHex = (value) => value.replace(/\s+/g, "").toUpperCase();
const parseSignedBitInt16 = (high, low) => {
    const raw = (high << 8) | low;
    const negative = (raw & 0x8000) !== 0;
    const magnitude = raw & 0x7fff;
    return negative ? -magnitude : magnitude;
};
const toDisplayTrajectoryPoints = (points) => points.map((point) => ({
    ...point,
    x: -point.x,
}));
exports.toDisplayTrajectoryPoints = toDisplayTrajectoryPoints;
const parseTargetTrajectoryHex = (hex) => {
    const normalized = normalizeHex(hex);
    if (normalized.length < 2 || normalized.length % 2 !== 0) {
        return [];
    }
    const bytes = normalized.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? [];
    const targetCount = bytes[0] ?? 0;
    const points = [];
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
exports.parseTargetTrajectoryHex = parseTargetTrajectoryHex;
const parseTrajectorySnapshot = (topic, payload) => {
    try {
        const parsed = JSON.parse(payload);
        if (parsed.type !== "target_trajectory" || typeof parsed.hex !== "string") {
            return null;
        }
        const hex = normalizeHex(parsed.hex);
        const points = (0, exports.parseTargetTrajectoryHex)(hex);
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
    }
    catch {
        return null;
    }
};
exports.parseTrajectorySnapshot = parseTrajectorySnapshot;
