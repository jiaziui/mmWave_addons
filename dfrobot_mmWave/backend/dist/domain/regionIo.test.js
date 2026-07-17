"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const storage_1 = require("../config/storage");
const regionIo_1 = require("./regionIo");
const region = (id, ioIndex, mcuIo) => ({
    id,
    index: Number(id.replace(/\D/g, "")) || 0,
    label: id,
    regionType: "status_detection",
    geometry: { shape: "rect", centerXCm: 0, centerYCm: 100, widthCm: 100, heightCm: 100 },
    ioIndex,
    mcuIo,
    x: 0,
    y: 1,
    enabled: true,
    visible: true,
});
(0, vitest_1.describe)("region IO mapping", () => {
    (0, vitest_1.it)("maps MCU pins by sensor IO index and clears unused channels", () => {
        const config = (0, storage_1.createDefaultRegionConfig)();
        config.regions = [region("region-1", 3, 12)];
        (0, vitest_1.expect)((0, regionIo_1.buildRegionMcuSettings)(config)).toEqual({
            zone2McuIo: -1,
            zone3McuIo: 12,
            zone4McuIo: -1,
            zone5McuIo: -1,
            zone6McuIo: -1,
        });
    });
    (0, vitest_1.it)("rejects duplicate active IO bindings", () => {
        const config = (0, storage_1.createDefaultRegionConfig)();
        config.regions = [region("region-1", 2, 4), region("region-2", 2, 5)];
        (0, vitest_1.expect)(() => (0, regionIo_1.assertUniqueRegionIoBindings)(config)).toThrow("IO2 is already assigned");
    });
    (0, vitest_1.it)("ignores disabled and unbound regions", () => {
        const config = (0, storage_1.createDefaultRegionConfig)();
        const disabled = region("region-1", 4, 13);
        disabled.enabled = false;
        config.regions = [disabled, region("region-2", 0, -1)];
        (0, vitest_1.expect)((0, regionIo_1.buildRegionMcuSettings)(config).zone4McuIo).toBe(-1);
    });
    (0, vitest_1.it)("clears the MCU pin after its bound region is deleted", () => {
        const config = (0, storage_1.createDefaultRegionConfig)();
        config.regions = [region("region-1", 5, 14)];
        (0, vitest_1.expect)((0, regionIo_1.buildRegionMcuSettings)(config).zone5McuIo).toBe(14);
        config.regions = [];
        (0, vitest_1.expect)((0, regionIo_1.buildRegionMcuSettings)(config).zone5McuIo).toBe(-1);
    });
});
