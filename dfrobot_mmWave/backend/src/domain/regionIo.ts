import type { C4004DeviceSettings, StoredRegionConfig } from "../types/mmwave";

const REGION_IO_SETTING_KEYS = {
  2: "zone2McuIo",
  3: "zone3McuIo",
  4: "zone4McuIo",
  5: "zone5McuIo",
  6: "zone6McuIo",
} as const;

type RegionIoIndex = keyof typeof REGION_IO_SETTING_KEYS;

const isRegionIoIndex = (value: number): value is RegionIoIndex =>
  value >= 2 && value <= 6;

export const assertUniqueRegionIoBindings = (regionConfig: StoredRegionConfig): void => {
  const used = new Set<number>();
  for (const region of regionConfig.regions) {
    if (!region.enabled || region.regionType !== "status_detection" || !isRegionIoIndex(region.ioIndex)) {
      continue;
    }
    if (used.has(region.ioIndex)) {
      throw new Error(`Invalid region config: IO${region.ioIndex} is already assigned to another status region`);
    }
    used.add(region.ioIndex);
  }
};

export const buildRegionMcuSettings = (regionConfig: StoredRegionConfig): C4004DeviceSettings => {
  assertUniqueRegionIoBindings(regionConfig);

  const settings: C4004DeviceSettings = {
    zone2McuIo: -1,
    zone3McuIo: -1,
    zone4McuIo: -1,
    zone5McuIo: -1,
    zone6McuIo: -1,
  };

  for (const region of regionConfig.regions) {
    if (!region.enabled || region.regionType !== "status_detection" || !isRegionIoIndex(region.ioIndex)) {
      continue;
    }
    settings[REGION_IO_SETTING_KEYS[region.ioIndex]] = region.mcuIo;
  }

  return settings;
};
