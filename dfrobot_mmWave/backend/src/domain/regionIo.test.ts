import { describe, expect, it } from "vitest";
import { createDefaultRegionConfig } from "../config/storage";
import type { StoredRegionConfigRegion } from "../types/mmwave";
import { assertUniqueRegionIoBindings, buildRegionMcuSettings } from "./regionIo";

const region = (id: string, ioIndex: StoredRegionConfigRegion["ioIndex"], mcuIo: number): StoredRegionConfigRegion => ({
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

describe("region IO mapping", () => {
  it("maps MCU pins by sensor IO index and clears unused channels", () => {
    const config = createDefaultRegionConfig();
    config.regions = [region("region-1", 3, 12)];

    expect(buildRegionMcuSettings(config)).toEqual({
      zone2McuIo: -1,
      zone3McuIo: 12,
      zone4McuIo: -1,
      zone5McuIo: -1,
      zone6McuIo: -1,
    });
  });

  it("rejects duplicate active IO bindings", () => {
    const config = createDefaultRegionConfig();
    config.regions = [region("region-1", 2, 4), region("region-2", 2, 5)];

    expect(() => assertUniqueRegionIoBindings(config)).toThrow("IO2 is already assigned");
  });

  it("ignores disabled and unbound regions", () => {
    const config = createDefaultRegionConfig();
    const disabled = region("region-1", 4, 13);
    disabled.enabled = false;
    config.regions = [disabled, region("region-2", 0, -1)];

    expect(buildRegionMcuSettings(config).zone4McuIo).toBe(-1);
  });

  it("clears the MCU pin after its bound region is deleted", () => {
    const config = createDefaultRegionConfig();
    config.regions = [region("region-1", 5, 14)];
    expect(buildRegionMcuSettings(config).zone5McuIo).toBe(14);

    config.regions = [];
    expect(buildRegionMcuSettings(config).zone5McuIo).toBe(-1);
  });
});
