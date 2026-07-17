"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLearnedRangeHex = void 0;
const MAX_POINTS = 150;
const readUInt16 = (bytes, offset) => (bytes[offset] << 8) | bytes[offset + 1];
const readSignBitInt16 = (bytes, offset) => {
    const raw = readUInt16(bytes, offset);
    return raw & 0x8000 ? -(raw & 0x7fff) : raw;
};
const parseLearnedRangeHex = (value) => {
    const normalized = value.trim().replace(/^0x/i, "");
    if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) {
        throw new Error("Invalid learned trajectory range hex");
    }
    const bytes = Array.from({ length: normalized.length / 2 }, (_, index) => Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16));
    if (bytes[0] !== 0x05 || bytes.length < 3) {
        throw new Error("Invalid learned trajectory range payload");
    }
    const officialCount = readUInt16(bytes, 1);
    if (officialCount <= MAX_POINTS && bytes.length === 3 + officialCount * 4) {
        if (officialCount < 3) {
            throw new Error("Learned trajectory range returned too few points");
        }
        return Array.from({ length: officialCount }, (_, index) => ({
            x: -readSignBitInt16(bytes, 3 + index * 4),
            y: readSignBitInt16(bytes, 5 + index * 4),
        }));
    }
    if (bytes.length < 4 || bytes[1] !== 0) {
        throw new Error("Learned trajectory range payload is still learning");
    }
    const count = readUInt16(bytes, 2);
    if (count < 3 || count > MAX_POINTS || bytes.length !== 4 + count * 4) {
        throw new Error("Invalid learned trajectory range point count");
    }
    return Array.from({ length: count }, (_, index) => ({
        x: -readSignBitInt16(bytes, 4 + index * 4),
        y: readSignBitInt16(bytes, 6 + index * 4),
    }));
};
exports.parseLearnedRangeHex = parseLearnedRangeHex;
