import { describe, expect, it } from "vitest";
import type { RegionDefinition } from "../api/client";
import {
  canConfirmCustomRange,
  findAvailableRegionIndex,
  normalizeRegionDefinition,
  validateRegionDefinition,
  viewportPointToWorld,
} from "./regionGeometry";

const region = (index: number, id = `region-${index}`): RegionDefinition => ({
  id,
  index,
  label: `区域 ${index}`,
  regionType: "status_detection",
  geometry: { shape: "rect", centerXCm: 100, centerYCm: 200, widthCm: 100, heightCm: 100 },
  ioIndex: 0,
  mcuIo: -1,
  x: 1,
  y: 2,
  enabled: true,
  visible: true,
});

describe("region geometry", () => {
  it("allocates the smallest available index", () => {
    expect(findAvailableRegionIndex([region(0), region(2)])).toBe(1);
  });

  it("normalizes meters and disables IO for non-status regions", () => {
    const normalized = normalizeRegionDefinition({
      ...region(4),
      label: "  边界  ",
      regionType: "boundary",
      ioIndex: 4,
      mcuIo: 12,
    });
    expect(normalized).toMatchObject({ label: "边界", x: 1, y: 2, ioIndex: 0, mcuIo: -1 });
  });

  it("rejects duplicate indexes and invalid dimensions", () => {
    expect(validateRegionDefinition(region(0, "new"), [region(0)])).toBe("区域索引已存在");
    expect(validateRegionDefinition({ ...region(1), geometry: { shape: "circle", centerXCm: 0, centerYCm: 0, radiusCm: 5 } }, [])).toContain("半径");
  });

  it("binds MCU IO by sensor IO and rejects duplicate IO bindings", () => {
    const bound = { ...region(0), ioIndex: 3 as const, mcuIo: 12 };
    const normalized = normalizeRegionDefinition({ ...region(7), ioIndex: 0, mcuIo: 15 });

    expect(normalized.mcuIo).toBe(-1);
    expect(validateRegionDefinition({ ...region(1), ioIndex: 3, mcuIo: 13 }, [bound])).toBe(
      "IO3 已被其他状态检测区域使用",
    );
  });

  it("converts viewport center into the configured world center", () => {
    expect(viewportPointToWorld(500, 300, 0, 0, {
      coordinateWidthCm: 1000,
      coordinateHeightCm: 1000,
      zoom: 1,
      centerXCm: 0,
      centerYCm: 400,
      viewportWidthPx: 1000,
      viewportHeightPx: 600,
    })).toEqual({ x: 0, y: 400 });
  });

  it("requires at least three custom points", () => {
    expect(canConfirmCustomRange([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    expect(canConfirmCustomRange([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }])).toBe(true);
  });
});
