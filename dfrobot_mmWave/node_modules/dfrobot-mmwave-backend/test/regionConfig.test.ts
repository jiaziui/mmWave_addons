import { describe, expect, it } from "vitest";
import { createDefaultRegionConfig, normalizeRegionConfig } from "../src/config/storage";

describe("RegionConfig V2", () => {
  it("resets legacy region structures without migrating old regions", () => {
    expect(normalizeRegionConfig({ regions: [{ id: "legacy" }] })).toEqual(createDefaultRegionConfig());
  });

  it("derives rangeBox and meter centers from centimeter geometry", () => {
    const config = normalizeRegionConfig({
      ...createDefaultRegionConfig(),
      detection: {
        mode: "rect",
        appliedMode: "rect",
        rectCm: { xMin: -250, xMax: 350, yMin: 50, yMax: 800 },
        learnedPointsCm: [],
        customPointsCm: [],
        customConfirmed: false,
      },
      regions: [{
        id: "zone-1",
        index: 0,
        label: "厨房",
        regionType: "status_detection",
        geometry: { shape: "rect", centerXCm: 125, centerYCm: 350, widthCm: 200, heightCm: 180 },
        ioIndex: 2,
        mcuIo: 8,
        enabled: true,
        visible: true,
      }],
    });

    expect(config.rangeBox).toEqual({ xMin: -2.5, xMax: 3.5, yMin: 0.5, yMax: 8 });
    expect(config.regions[0]).toMatchObject({ x: 1.25, y: 3.5, ioIndex: 2, mcuIo: 8 });
  });

  it("forces IO fields off for non-status regions", () => {
    const config = normalizeRegionConfig({
      ...createDefaultRegionConfig(),
      regions: [{
        id: "noise-1",
        index: 0,
        label: "Noise",
        regionType: "noise",
        geometry: { shape: "circle", centerXCm: 0, centerYCm: 100, radiusCm: 50 },
        ioIndex: 6,
        mcuIo: 12,
        enabled: true,
        visible: true,
      }],
    });

    expect(config.regions[0]).toMatchObject({ ioIndex: 0, mcuIo: -1 });
  });

  it("rejects duplicate indexes and more than 32 regions", () => {
    const baseRegion = {
      label: "区域",
      regionType: "noise",
      geometry: { shape: "circle", centerXCm: 0, centerYCm: 0, radiusCm: 50 },
      ioIndex: 0,
      mcuIo: -1,
      enabled: true,
      visible: true,
    };
    expect(() => normalizeRegionConfig({
      ...createDefaultRegionConfig(),
      regions: [{ ...baseRegion, id: "a", index: 0 }, { ...baseRegion, id: "b", index: 0 }],
    })).toThrow(/unique/);
    expect(() => normalizeRegionConfig({
      ...createDefaultRegionConfig(),
      regions: Array.from({ length: 33 }, (_, index) => ({ ...baseRegion, id: `r-${index}`, index })),
    })).toThrow(/at most 32/);
  });

  it("rejects inverted coordinates and out-of-range MCU IO", () => {
    expect(() => normalizeRegionConfig({
      ...createDefaultRegionConfig(),
      coordinate: { xMin: 5, xMax: -5, yMin: -1, yMax: 9 },
    })).toThrow(/coordinate bounds/);
    expect(() => normalizeRegionConfig({
      ...createDefaultRegionConfig(),
      regions: [{
        id: "zone-1",
        index: 0,
        label: "区域",
        regionType: "status_detection",
        geometry: { shape: "rect", centerXCm: 0, centerYCm: 100, widthCm: 100, heightCm: 100 },
        ioIndex: 0,
        mcuIo: 256,
        enabled: true,
        visible: true,
      }],
    })).toThrow(/MCU IO/);
  });
});
