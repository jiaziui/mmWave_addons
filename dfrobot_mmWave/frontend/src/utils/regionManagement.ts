import type {
  DetectionRangeConfig,
  RegionDefinition,
  RegionGeometry,
  RegionOverlay,
  RegionType,
  StoredRegionConfig,
} from "../api/client";
import { createClientId } from "./clientId";
import { normalizeRegionDefinition } from "./regionGeometry";

export interface ImportedBackgroundSource {
  id: string;
  name: string;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
}

type LegacyRegionRecord = {
  id?: number | string;
  name?: string;
  label?: string;
  index?: number;
  regionType?: RegionType;
  rangeType?: "rect" | "circle";
  type?: "rect" | "circle";
  ioIndex?: string | number;
  mcuIo?: number;
  tagWidth?: number;
  tagHeight?: number;
  posX?: number;
  posY?: number;
  visible?: boolean;
  enabled?: boolean;
};

export const MCU_IO_OPTIONS = Array.from({ length: 257 }, (_, value) => value - 1);

const isMeterPoint = (point: { x: number; y: number }) =>
  Math.abs(point.x) <= 20 && Math.abs(point.y) <= 20;

const toCmPoint = (point: { x: number; y: number }) =>
  isMeterPoint(point) ? { x: Math.round(point.x * 100), y: Math.round(point.y * 100) } : { x: Math.round(point.x), y: Math.round(point.y) };

export const downloadJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const formatRegionLiveInfo = (regionType: RegionType, live?: Pick<RegionOverlay, "movingCount" | "staticCount" | "boundaryState" | "approachAwayState">) => {
  if (!live) return "";
  if (regionType === "status_detection") {
    return `运动 ${live.movingCount ?? 0}  静止 ${live.staticCount ?? 0}`;
  }
  if (regionType === "approach_depart") {
    const state = (live.approachAwayState ?? "").toLowerCase();
    if (state.includes("away") || state.includes("远离") || state === "depart") return "远离";
    if (state.includes("none") || state.includes("无")) return "无";
    return state.includes("approach") || state.includes("靠近") ? "靠近" : live.approachAwayState ?? "";
  }
  if (regionType === "boundary") {
    const state = (live.boundaryState ?? "").toLowerCase();
    if (state.includes("out") || state.includes("出")) return "出";
    if (state.includes("none") || state === "2") return "无";
    return state.includes("in") || state.includes("进") ? "进" : live.boundaryState ?? "";
  }
  return "";
};

export const getDetectionHint = (detection: DetectionRangeConfig) => {
  if (detection.mode === "rect") {
    return "在右侧坐标轴拖拽矩形边角调整四方范围，完成后点击设置。";
  }
  if (detection.mode === "learned") {
    return "右侧显示已学习范围，点击设置启用。";
  }
  if (detection.customConfirmed) {
    return `已确认 ${detection.customPointsCm.length} 点，点击设置启用。`;
  }
  if (detection.customPointsCm.length >= 3) {
    return `已选 ${detection.customPointsCm.length} 点，可继续加点或点击设置。`;
  }
  if (detection.customPointsCm.length > 0) {
    return `已选 ${detection.customPointsCm.length} 点，请在右侧继续点击。`;
  }
  return "在右侧坐标轴点击设置自定义范围起点。";
};

const legacyShape = (record: LegacyRegionRecord): "rect" | "circle" =>
  record.rangeType === "circle" || record.type === "circle" ? "circle" : "rect";

const legacyIoIndex = (value: LegacyRegionRecord["ioIndex"]): RegionDefinition["ioIndex"] => {
  if (value === "none" || value === 0 || value === "0" || value == null) return 0;
  const parsed = Number(value);
  return parsed >= 2 && parsed <= 6 ? (parsed as RegionDefinition["ioIndex"]) : 0;
};

const legacyGeometry = (record: LegacyRegionRecord): RegionGeometry => {
  const shape = legacyShape(record);
  const tagWidth = Math.max(10, Math.round(Number(record.tagWidth ?? 200)));
  const tagHeight = Math.max(10, Math.round(Number(record.tagHeight ?? 150)));
  const posX = Math.round(Number(record.posX ?? 0));
  const posY = Math.round(Number(record.posY ?? 0));
  if (shape === "circle") {
    const radiusCm = Math.max(10, Math.round(tagWidth));
    return { shape: "circle", centerXCm: posX, centerYCm: posY, radiusCm };
  }
  return {
    shape: "rect",
    centerXCm: posX + tagWidth / 2,
    centerYCm: posY + tagHeight / 2,
    widthCm: tagWidth,
    heightCm: tagHeight,
  };
};

export const convertLegacyRegion = (record: LegacyRegionRecord, fallbackIndex: number): RegionDefinition => {
  const geometry = legacyGeometry(record);
  const region: RegionDefinition = {
    id: String(record.id ?? createClientId()),
    index: Number.isInteger(record.index) ? Number(record.index) : fallbackIndex,
    label: String(record.label ?? record.name ?? `区域-${fallbackIndex + 1}`),
    regionType: record.regionType ?? "status_detection",
    geometry,
    ioIndex: legacyIoIndex(record.ioIndex),
    mcuIo: Number.isFinite(record.mcuIo) ? Number(record.mcuIo) : -1,
    x: geometry.centerXCm / 100,
    y: geometry.centerYCm / 100,
    enabled: record.enabled ?? true,
    visible: record.visible ?? true,
  };
  return normalizeRegionDefinition(region);
};

export const parseImportedRegions = (payload: unknown): RegionDefinition[] => {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { regions?: unknown }).regions)
      ? (payload as { regions: LegacyRegionRecord[] }).regions
      : null;
  if (!records) {
    throw new Error("标签区域配置格式无效");
  }
  return records.map((record, index) => convertLegacyRegion(record, index));
};

export const parseImportedDetection = (payload: unknown, current: DetectionRangeConfig): DetectionRangeConfig => {
  const source = ((payload as { detection?: unknown }).detection ?? payload) as Partial<DetectionRangeConfig> & {
    rect?: { xMin: number; xMax: number; yMin: number; yMax: number };
    learnedPoints?: Array<{ x: number; y: number }>;
    customPoints?: Array<{ x: number; y: number }>;
    rangeMode?: DetectionRangeConfig["mode"];
    appliedMode?: DetectionRangeConfig["appliedMode"];
    customConfirmed?: boolean;
  };

  const mode = source.mode ?? source.rangeMode ?? current.mode;
  const rectSource = source.rectCm ?? source.rect ?? current.rectCm;
  const learnedSource = source.learnedPointsCm ?? source.learnedPoints ?? current.learnedPointsCm;
  const customSource = source.customPointsCm ?? source.customPoints ?? current.customPointsCm;

  return {
    mode,
    appliedMode: source.appliedMode ?? mode,
    rectCm: {
      xMin: Math.round(Number(rectSource.xMin)),
      xMax: Math.round(Number(rectSource.xMax)),
      yMin: Math.round(Number(rectSource.yMin)),
      yMax: Math.round(Number(rectSource.yMax)),
    },
    learnedPointsCm: learnedSource.map(toCmPoint),
    customPointsCm: customSource.map(toCmPoint),
    customConfirmed: Boolean(source.customConfirmed),
  };
};

export const buildRegionExportPayload = (deviceNo: string | undefined, regionConfig: StoredRegionConfig) => ({
  deviceNo,
  version: regionConfig.version,
  regions: regionConfig.regions,
});

export const buildDetectionExportPayload = (deviceNo: string | undefined, detection: DetectionRangeConfig) => ({
  deviceNo,
  detection,
});
