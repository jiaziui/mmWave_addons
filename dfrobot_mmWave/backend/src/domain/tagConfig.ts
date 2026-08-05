import type { RegionType, StoredRegionConfig, StoredRegionConfigRegion } from "../types/mmwave";

export interface MultiTagConfigPayload {
  tagCount: number;
  hex: string;
}

const TAG_CONFIG_LIMIT = 32;
const TAG_CONFIG_RECORD_LEN = 12;

const tagTypeByRegionType: Record<RegionType, number> = {
  status_detection: 3,
  boundary: 1,
  approach_depart: 2,
  noise: 4,
  empty_tag: 0,
};

const toHexByte = (value: number): string => value.toString(16).padStart(2, "0").toUpperCase();

const writeUint16 = (value: number): string => {
  const clamped = Math.max(0, Math.min(0xffff, Math.round(value)));
  return `${toHexByte((clamped >> 8) & 0xff)}${toHexByte(clamped & 0xff)}`;
};

const writeSignBitInt16 = (value: number): string => {
  let magnitude = Math.round(value);
  let raw = 0;
  if (magnitude < 0) {
    magnitude = Math.abs(magnitude);
    raw = 0x8000;
  }
  raw |= Math.min(0x7fff, magnitude);
  return writeUint16(raw);
};

const normalizeRegion = (region: StoredRegionConfigRegion): StoredRegionConfigRegion | null => {
  if (!region.enabled) {
    return null;
  }
  if (region.index < 0 || region.index >= TAG_CONFIG_LIMIT) {
    return null;
  }
  return region;
};

const encodeRegionRecord = (region: StoredRegionConfigRegion): string => {
  const geometry = region.geometry;
  const scopeType = geometry.shape === "circle" ? 0 : 1;
  // Protocol layer uses circle width as radius, and height is ignored for circles.
  const width = geometry.shape === "circle" ? geometry.radiusCm : geometry.widthCm;
  const height = geometry.shape === "circle" ? 0 : geometry.heightCm;
  // UI keeps the canonical X axis; firmware expects the opposite direction.
  const centerXCm = -geometry.centerXCm;
  return [
    toHexByte(region.index),
    toHexByte(tagTypeByRegionType[region.regionType]),
    toHexByte(scopeType),
    toHexByte(region.ioIndex),
    writeSignBitInt16(centerXCm),
    writeSignBitInt16(geometry.centerYCm),
    writeUint16(width),
    writeUint16(height),
  ].join("");
};

export const buildMultiTagConfigHex = (regionConfig: StoredRegionConfig): MultiTagConfigPayload => {
  const regions = regionConfig.regions
    .map(normalizeRegion)
    .filter((region): region is StoredRegionConfigRegion => Boolean(region))
    .sort((left, right) => left.index - right.index)
    .slice(0, TAG_CONFIG_LIMIT);

  const hex = [
    writeUint16(regions.length),
    ...regions.map(encodeRegionRecord),
  ].join("");

  return {
    tagCount: regions.length,
    hex,
  };
};
