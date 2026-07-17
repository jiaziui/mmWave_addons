import { describe, expect, it } from "vitest";
import { createDefaultRegionConfig } from "../src/config/storage";
import {
  assertRawCustomRangePointCount,
  buildConfigFileRangeHex,
} from "../src/domain/configFileRange";

const customConfig = (points: Array<{ x: number; y: number }>) => {
  const config = createDefaultRegionConfig();
  config.detection = {
    ...config.detection,
    mode: "custom",
    appliedMode: "custom",
    customPointsCm: points,
    customConfirmed: true,
  };
  return config;
};

describe("config file range encoding", () => {
  it("encodes mode, point count and mirrored UI X coordinates", () => {
    const payload = buildConfigFileRangeHex(customConfig([
      { x: -200, y: 0 },
      { x: -200, y: 400 },
      { x: 200, y: 400 },
      { x: 200, y: 0 },
    ]));

    expect(payload).toEqual({
      pointCount: 4,
      hex: "06000400C8000000C8019080C8019080C80000",
    });
  });

  it("uses sign-bit encoding instead of two's complement", () => {
    const payload = buildConfigFileRangeHex(customConfig([
      { x: 1, y: -2 },
      { x: 0, y: 3 },
      { x: -4, y: 5 },
    ]));

    expect(payload.hex).toBe("060003800180020000000300040005");
  });

  it("rejects unconfirmed, undersized and out-of-range custom ranges", () => {
    const unconfirmed = customConfig([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }]);
    unconfirmed.detection.customConfirmed = false;
    expect(() => buildConfigFileRangeHex(unconfirmed)).toThrow(/confirmed/);
    expect(() => buildConfigFileRangeHex(customConfig([{ x: 0, y: 0 }, { x: 1, y: 1 }]))).toThrow(/3\.\.150/);
    expect(() => buildConfigFileRangeHex(customConfig([
      { x: 32768, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ]))).toThrow(/-32767\.\.32767/);
  });

  it("rejects invalid raw points before region normalization can coerce them", () => {
    expect(() => assertRawCustomRangePointCount({
      detection: {
        customPointsCm: [{ x: "1", y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }],
      },
    })).toThrow(/numeric x and y/);
    expect(() => assertRawCustomRangePointCount({
      detection: {
        customPointsCm: Array.from({ length: 151 }, () => ({ x: 0, y: 0 })),
      },
    })).toThrow(/3\.\.150/);
  });
});
