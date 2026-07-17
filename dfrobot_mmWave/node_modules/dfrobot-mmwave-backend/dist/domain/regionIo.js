"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRegionMcuSettings = exports.assertUniqueRegionIoBindings = void 0;
const REGION_IO_SETTING_KEYS = {
    2: "zone2McuIo",
    3: "zone3McuIo",
    4: "zone4McuIo",
    5: "zone5McuIo",
    6: "zone6McuIo",
};
const isRegionIoIndex = (value) => value >= 2 && value <= 6;
const assertUniqueRegionIoBindings = (regionConfig) => {
    const used = new Set();
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
exports.assertUniqueRegionIoBindings = assertUniqueRegionIoBindings;
const buildRegionMcuSettings = (regionConfig) => {
    (0, exports.assertUniqueRegionIoBindings)(regionConfig);
    const settings = {
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
exports.buildRegionMcuSettings = buildRegionMcuSettings;
