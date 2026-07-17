import { describe, expect, it } from "vitest";
import {
  canExportCustomRange,
  convertLegacyRegion,
  formatRegionLiveInfo,
  getDetectionHint,
  mergeImportedRegions,
  parseImportedDetection,
  parseImportedRegions,
  parseCustomRangeIni,
  parseRegionIni,
  serializeCustomRangeIni,
  serializeRegionIni,
} from "./regionManagement";
import type { RegionDefinition } from "../api/client";

const region = (overrides: Partial<RegionDefinition> = {}): RegionDefinition => ({
  id: "region-0",
  index: 0,
  label: "睡觉区",
  regionType: "status_detection",
  geometry: { shape: "rect", centerXCm: 50, centerYCm: 300, widthCm: 300, heightCm: 250 },
  ioIndex: 2,
  mcuIo: 12,
  x: 0.5,
  y: 3,
  enabled: true,
  visible: true,
  ...overrides,
});

describe("regionManagement", () => {
  it("formats live info for status and boundary regions", () => {
    expect(formatRegionLiveInfo("status_detection", { movingCount: 2, staticCount: 1 })).toBe("运动 2  静止 1");
    expect(formatRegionLiveInfo("boundary", { boundaryState: "in" })).toBe("进");
    expect(formatRegionLiveInfo("approach_depart", { approachAwayState: "away" })).toBe("远离");
    expect(formatRegionLiveInfo("noise", { tagDataAvailable: false })).toBe("");
    expect(formatRegionLiveInfo("empty_tag", { tagDataAvailable: false, tagTypeMismatch: true })).toBe("");
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

  it("parses device-coordinate ini records and tag types", () => {
    const regions = parseRegionIni([
      "\uFEFF(睡觉区,0,3,1,0,-50,300,300,250)",
      "(卧室,1,3,1,0,0,350,400,700)",
      "(卧室门,2,2,1,0,100,700,80,40)",
    ].join("\r\n"));

    expect(regions).toHaveLength(3);
    expect(regions[0]).toMatchObject({
      label: "睡觉区",
      index: 0,
      regionType: "status_detection",
      geometry: { shape: "rect", centerXCm: 50, centerYCm: 300, widthCm: 300, heightCm: 250 },
      ioIndex: 0,
      mcuIo: -1,
    });
    expect(regions[2]).toMatchObject({
      regionType: "approach_depart",
      geometry: { shape: "rect", centerXCm: -100, centerYCm: 700, widthCm: 80, heightCm: 40 },
    });
  });

  it("round-trips rectangles, circles and quoted labels", () => {
    const source = [
      region({ label: "卧室,北侧", ioIndex: 2 }),
      region({
        id: "region-1",
        index: 1,
        label: "门口\"圆区",
        regionType: "boundary",
        geometry: { shape: "circle", centerXCm: -100, centerYCm: 700, radiusCm: 80 },
        ioIndex: 0,
        mcuIo: -1,
      }),
    ];

    const encoded = serializeRegionIni(source);
    expect(encoded).toContain('(\"卧室,北侧\",0,3,1,2,-50,300,300,250)');
    expect(encoded).toContain('(\"门口\"\"圆区\",1,1,0,0,100,700,80,0)');
    const decoded = parseRegionIni(encoded);
    expect(decoded[0]).toMatchObject({ label: "卧室,北侧", ioIndex: 2, geometry: source[0].geometry });
    expect(decoded[1]).toMatchObject({ label: "门口\"圆区", ioIndex: 0, geometry: source[1].geometry });
  });

  it("merges by index, keeps ids and resets all MCU values", () => {
    const current = [
      region({ id: "keep-id", index: 0, label: "原区域", ioIndex: 2, mcuIo: 12 }),
      region({ id: "untouched-id", index: 4, label: "保留区域", ioIndex: 4, mcuIo: 14 }),
    ];
    const imported = parseRegionIni([
      "(替换区域,0,3,1,2,-50,300,300,250)",
      "(新增区域,1,3,1,3,100,400,200,100)",
    ].join("\n"));

    const merged = mergeImportedRegions(current, imported);
    expect(merged.map((entry) => entry.index)).toEqual([0, 1, 4]);
    expect(merged[0]).toMatchObject({ id: "keep-id", label: "替换区域", mcuIo: -1 });
    expect(merged[1]).toMatchObject({ label: "新增区域", mcuIo: -1 });
    expect(merged[2]).toMatchObject({ id: "untouched-id", label: "保留区域", mcuIo: -1 });
  });

  it("rejects malformed ini atomically", () => {
    expect(() => parseRegionIni("(区域,0,3,0,0,0,100,80,10)")).toThrow("圆形区域高度必须为 0");
    expect(() => parseRegionIni("(区域,0,2,1,2,0,100,80,40)")).toThrow("只有状态检测标签可以绑定IO索引");
    expect(() => parseRegionIni("(区域,0,3,1,0,0,100,80,40)\n(区域2,0,3,1,0,0,100,80,40)")).toThrow("索引 0 重复");
  });

  it("rejects IO conflicts after index merge", () => {
    const current = [region({ id: "existing", index: 4, ioIndex: 2 })];
    const imported = parseRegionIni("(冲突区域,0,3,1,2,0,100,80,40)");
    expect(() => mergeImportedRegions(current, imported)).toThrow("IO2 已被其他状态检测区域使用");
  });

  it("imports and exports custom range points in order", () => {
    const points = parseCustomRangeIni("\uFEFF(200,0)\r\n(200,400)\r\n(-200,400)\r\n(-200,0)");
    expect(points).toEqual([
      { x: -200, y: 0 },
      { x: -200, y: 400 },
      { x: 200, y: 400 },
      { x: 200, y: 0 },
    ]);
    expect(serializeCustomRangeIni(points)).toBe("(200,0)\r\n(200,400)\r\n(-200,400)\r\n(-200,0)");
    expect(canExportCustomRange(points)).toBe(true);
  });

  it("accepts custom range point limits and rejects invalid files", () => {
    const points = Array.from({ length: 150 }, (_, index) => `(${index},${index + 1})`).join("\n");
    expect(parseCustomRangeIni(points)).toHaveLength(150);
    expect(() => parseCustomRangeIni("(0,0)\n(1,1)")).toThrow("至少需要 3 个点");
    expect(() => parseCustomRangeIni(`${points}\n(151,151)`)).toThrow("最多支持 150 个点");
    expect(() => parseCustomRangeIni("(32768,0)\n(0,1)\n(1,1)")).toThrow("-32767 到 32767");
    expect(() => parseCustomRangeIni("(1,0,2)\n(0,1)\n(1,1)")).toThrow("x 和 y 两个坐标");
    expect(canExportCustomRange([{ x: 1, y: 2 }, { x: 2, y: 3 }])).toBe(false);
  });
});
