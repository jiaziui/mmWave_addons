import { describe, expect, it } from "vitest";
import {
  convertLegacyRegion,
  formatRegionLiveInfo,
  getDetectionHint,
  parseImportedDetection,
  parseImportedRegions,
} from "./regionManagement";

describe("regionManagement", () => {
  it("formats live info for status and boundary regions", () => {
    expect(formatRegionLiveInfo("status_detection", { movingCount: 2, staticCount: 1 })).toBe("运动 2  静止 1");
    expect(formatRegionLiveInfo("boundary", { boundaryState: "in" })).toBe("进");
    expect(formatRegionLiveInfo("approach_depart", { approachAwayState: "away" })).toBe("远离");
  });

  it("builds detection hints by mode", () => {
    expect(getDetectionHint({ mode: "rect", rectCm: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, learnedPointsCm: [], customPointsCm: [], customConfirmed: false })).toContain("四方范围");
    expect(getDetectionHint({ mode: "custom", rectCm: { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, learnedPointsCm: [], customPointsCm: [{ x: 1, y: 2 }], customConfirmed: false })).toContain("已选 1 点");
  });

  it("imports legacy region records", () => {
    const regions = parseImportedRegions([
      { id: 1, label: "入口", index: 0, regionType: "boundary", tagWidth: 200, tagHeight: 100, posX: 50, posY: 30 },
    ]);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ label: "入口", regionType: "boundary", geometry: { shape: "rect", widthCm: 200, heightCm: 100 } });
  });

  it("converts meter points when importing detection", () => {
    const detection = parseImportedDetection(
      { mode: "learned", learnedPoints: [{ x: 1.2, y: -0.5 }] },
      { mode: "rect", rectCm: { xMin: 0, xMax: 100, yMin: 0, yMax: 100 }, learnedPointsCm: [], customPointsCm: [], customConfirmed: false },
    );
    expect(detection.learnedPointsCm).toEqual([{ x: 120, y: -50 }]);
  });

  it("normalizes circle legacy regions", () => {
    const region = convertLegacyRegion({ type: "circle", tagWidth: 80, posX: 10, posY: 20 }, 3);
    expect(region.geometry).toMatchObject({ shape: "circle", centerXCm: 10, centerYCm: 20, radiusCm: 80 });
  });
});
