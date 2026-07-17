"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertRawCustomRangePointCount = exports.buildConfigFileRangeHex = void 0;
const CONFIG_FILE_RANGE_MODE = 0x06;
const MIN_POINTS = 3;
const MAX_POINTS = 150;
const MAX_COORDINATE_MAGNITUDE = 0x7fff;
const toHexByte = (value) => value.toString(16).padStart(2, "0").toUpperCase();
const writeUint16 = (value) => `${toHexByte((value >> 8) & 0xff)}${toHexByte(value & 0xff)}`;
const writeSignBitInt16 = (value) => {
    const rounded = Math.round(value);
    const magnitude = Math.abs(rounded);
    if (!Number.isFinite(value) || magnitude > MAX_COORDINATE_MAGNITUDE) {
        throw new Error("Invalid custom range: coordinates must be within -32767..32767 cm");
    }
    return writeUint16((rounded < 0 ? 0x8000 : 0) | magnitude);
};
const buildConfigFileRangeHex = (regionConfig) => {
    const detection = regionConfig.detection;
    if (detection.mode !== "custom" || !detection.customConfirmed) {
        throw new Error("Invalid custom range: range must be confirmed before synchronization");
    }
    const points = detection.customPointsCm;
    if (points.length < MIN_POINTS || points.length > MAX_POINTS) {
        throw new Error(`Invalid custom range: point count must be ${MIN_POINTS}..${MAX_POINTS}`);
    }
    const pointHex = points.map((point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            throw new Error("Invalid custom range: coordinates must be finite numbers");
        }
        // The UI X axis is mirrored relative to the C4004 protocol coordinate system.
        return `${writeSignBitInt16(-point.x)}${writeSignBitInt16(point.y)}`;
    });
    return {
        pointCount: points.length,
        hex: `${toHexByte(CONFIG_FILE_RANGE_MODE)}${writeUint16(points.length)}${pointHex.join("")}`,
    };
};
exports.buildConfigFileRangeHex = buildConfigFileRangeHex;
const assertRawCustomRangePointCount = (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("Invalid custom range: region config is required");
    }
    const detection = value.detection;
    if (typeof detection !== "object" || detection === null || Array.isArray(detection)) {
        throw new Error("Invalid custom range: detection config is required");
    }
    const points = detection.customPointsCm;
    if (!Array.isArray(points) || points.length < MIN_POINTS || points.length > MAX_POINTS) {
        throw new Error(`Invalid custom range: point count must be ${MIN_POINTS}..${MAX_POINTS}`);
    }
    for (const point of points) {
        if (typeof point !== "object" || point === null || Array.isArray(point)) {
            throw new Error("Invalid custom range: every point must contain numeric x and y coordinates");
        }
        const { x, y } = point;
        if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
            throw new Error("Invalid custom range: every point must contain numeric x and y coordinates");
        }
        if (Math.abs(Math.round(x)) > MAX_COORDINATE_MAGNITUDE || Math.abs(Math.round(y)) > MAX_COORDINATE_MAGNITUDE) {
            throw new Error("Invalid custom range: coordinates must be within -32767..32767 cm");
        }
    }
};
exports.assertRawCustomRangePointCount = assertRawCustomRangePointCount;
