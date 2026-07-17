import type {
  DetectionRangeConfig,
  RegionDefinition,
  RegionGeometry,
  RegionOverlay,
  RegionType,
  StoredRegionConfig,
} from "../api/client";
import { createClientId } from "./clientId";
import { normalizeRegionDefinition, validateRegionDefinition } from "./regionGeometry";

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

export const downloadText = (filename: string, content: string, options?: { includeUtf8Bom?: boolean }) => {
  const prefix = options?.includeUtf8Bom ? "\uFEFF" : "";
  const blob = new Blob([prefix, content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export type CustomRangePoint = { x: number; y: number };

const CUSTOM_RANGE_MIN_POINTS = 3;
const CUSTOM_RANGE_MAX_POINTS = 150;
const CUSTOM_RANGE_MAX_COORDINATE = 0x7fff;

const assertCustomRangePoint = (point: CustomRangePoint, context: string) => {
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) {
    throw new Error(`${context}坐标必须为整数`);
  }
  if (
    Math.abs(point.x) > CUSTOM_RANGE_MAX_COORDINATE ||
    Math.abs(point.y) > CUSTOM_RANGE_MAX_COORDINATE
  ) {
    throw new Error(`${context}坐标必须在 -32767 到 32767 之间`);
  }
};

export const canExportCustomRange = (points: CustomRangePoint[]): boolean =>
  points.length >= CUSTOM_RANGE_MIN_POINTS &&
  points.length <= CUSTOM_RANGE_MAX_POINTS &&
  points.every((point) =>
    Number.isInteger(point.x) &&
    Number.isInteger(point.y) &&
    Math.abs(point.x) <= CUSTOM_RANGE_MAX_COORDINATE &&
    Math.abs(point.y) <= CUSTOM_RANGE_MAX_COORDINATE,
  );

const parseCustomRangeInteger = (value: string, fieldName: string, lineNumber: number): number => {
  if (!/^-?\d+$/.test(value)) throw new Error(`第 ${lineNumber} 行${fieldName}必须为整数`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`第 ${lineNumber} 行${fieldName}超出有效范围`);
  return parsed;
};

export const parseCustomRangeIni = (content: string): CustomRangePoint[] => {
  const points: CustomRangePoint[] = [];
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);

  lines.forEach((rawLine, offset) => {
    const lineNumber = offset + 1;
    const line = rawLine.trim();
    if (!line) return;
    if (!line.startsWith("(") || !line.endsWith(")")) {
      throw new Error(`第 ${lineNumber} 行必须使用 (x,y) 格式`);
    }
    const fields = line.slice(1, -1).split(",").map((field) => field.trim());
    if (fields.length !== 2) throw new Error(`第 ${lineNumber} 行必须包含 x 和 y 两个坐标`);
    const deviceX = parseCustomRangeInteger(fields[0], "X坐标", lineNumber);
    const deviceY = parseCustomRangeInteger(fields[1], "Y坐标", lineNumber);
    assertCustomRangePoint({ x: deviceX, y: deviceY }, `第 ${lineNumber} 行`);
    if (points.length >= CUSTOM_RANGE_MAX_POINTS) {
      throw new Error(`自定义探测范围最多支持 ${CUSTOM_RANGE_MAX_POINTS} 个点`);
    }
    // The file uses device coordinates; the editor mirrors the X axis.
    points.push({ x: -deviceX, y: deviceY });
  });

  if (points.length < CUSTOM_RANGE_MIN_POINTS) {
    throw new Error(`自定义探测范围至少需要 ${CUSTOM_RANGE_MIN_POINTS} 个点`);
  }
  return points;
};

export const serializeCustomRangeIni = (points: CustomRangePoint[]): string => {
  if (!canExportCustomRange(points)) {
    throw new Error(`自定义探测范围点数必须为 ${CUSTOM_RANGE_MIN_POINTS} 到 ${CUSTOM_RANGE_MAX_POINTS}，且坐标合法`);
  }
  return points.map((point, index) => {
    assertCustomRangePoint(point, `第 ${index + 1} 个`);
    return `(${-point.x},${point.y})`;
  }).join("\r\n");
};

export const formatRegionLiveInfo = (regionType: RegionType, live?: Pick<RegionOverlay, "movingCount" | "staticCount" | "boundaryState" | "approachAwayState" | "tagDataAvailable" | "tagTypeMismatch">) => {
  if (regionType === "noise" || regionType === "empty_tag") return "";
  if (!live) return "";
  if (live.tagTypeMismatch) return "标签类型不匹配";
  if (live.tagDataAvailable === false) return "等待标签事件";
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
    return "";
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

const REGION_TYPE_BY_TAG_CODE: Record<number, RegionType> = {
  0: "empty_tag",
  1: "boundary",
  2: "approach_depart",
  3: "status_detection",
  4: "noise",
};

const TAG_CODE_BY_REGION_TYPE: Record<RegionType, number> = {
  empty_tag: 0,
  boundary: 1,
  approach_depart: 2,
  status_detection: 3,
  noise: 4,
};

const parseCsvFields = (source: string, lineNumber: number): string[] => {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  let quoteClosed = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      if (current.trim() || quoteClosed) throw new Error(`第 ${lineNumber} 行引号格式无效`);
      current = "";
      quoted = true;
      continue;
    }
    if (char === ",") {
      fields.push(current.trim());
      current = "";
      quoteClosed = false;
      continue;
    }
    if (quoteClosed && !/\s/.test(char)) throw new Error(`第 ${lineNumber} 行引号后存在无效字符`);
    current += char;
  }

  if (quoted) throw new Error(`第 ${lineNumber} 行引号未闭合`);
  fields.push(current.trim());
  return fields;
};

const parseIntegerField = (value: string, fieldName: string, lineNumber: number): number => {
  if (!/^-?\d+$/.test(value)) throw new Error(`第 ${lineNumber} 行${fieldName}必须为整数`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`第 ${lineNumber} 行${fieldName}超出有效范围`);
  return parsed;
};

const assertProtocolCoordinate = (value: number, fieldName: string, lineNumber: number) => {
  if (value < -0x7fff || value > 0x7fff) {
    throw new Error(`第 ${lineNumber} 行${fieldName}必须在 -32767 到 32767 之间`);
  }
};

export const parseRegionIni = (content: string): RegionDefinition[] => {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const regions: RegionDefinition[] = [];
  const indexes = new Set<number>();

  lines.forEach((rawLine, offset) => {
    const lineNumber = offset + 1;
    const line = rawLine.trim();
    if (!line) return;
    if (!line.startsWith("(") || !line.endsWith(")")) {
      throw new Error(`第 ${lineNumber} 行必须使用括号包围`);
    }
    const fields = parseCsvFields(line.slice(1, -1), lineNumber);
    if (fields.length !== 9) throw new Error(`第 ${lineNumber} 行必须包含 9 个字段`);

    const [label, indexText, tagTypeText, scopeTypeText, ioIndexText, xText, yText, widthText, heightText] = fields;
    if (!label.trim()) throw new Error(`第 ${lineNumber} 行区域名称不能为空`);
    if (/\r|\n/.test(label)) throw new Error(`第 ${lineNumber} 行区域名称不能包含换行`);

    const regionIndex = parseIntegerField(indexText, "索引", lineNumber);
    const tagTypeCode = parseIntegerField(tagTypeText, "标签类型", lineNumber);
    const scopeType = parseIntegerField(scopeTypeText, "区域类型", lineNumber);
    const ioIndex = parseIntegerField(ioIndexText, "IO索引", lineNumber);
    const deviceX = parseIntegerField(xText, "X坐标", lineNumber);
    const deviceY = parseIntegerField(yText, "Y坐标", lineNumber);
    const width = parseIntegerField(widthText, "宽度", lineNumber);
    const height = parseIntegerField(heightText, "高度", lineNumber);

    if (regionIndex < 0 || regionIndex > 31) throw new Error(`第 ${lineNumber} 行索引必须在 0 到 31 之间`);
    if (indexes.has(regionIndex)) throw new Error(`第 ${lineNumber} 行索引 ${regionIndex} 重复`);
    indexes.add(regionIndex);

    const regionType = REGION_TYPE_BY_TAG_CODE[tagTypeCode];
    if (!regionType) throw new Error(`第 ${lineNumber} 行标签类型必须在 0 到 4 之间`);
    if (scopeType !== 0 && scopeType !== 1) throw new Error(`第 ${lineNumber} 行区域类型只能为 0 或 1`);
    if (![0, 2, 3, 4, 5, 6].includes(ioIndex)) throw new Error(`第 ${lineNumber} 行IO索引只能为 0 或 2 到 6`);
    if (regionType !== "status_detection" && ioIndex !== 0) {
      throw new Error(`第 ${lineNumber} 行只有状态检测标签可以绑定IO索引`);
    }
    assertProtocolCoordinate(deviceX, "X坐标", lineNumber);
    assertProtocolCoordinate(deviceY, "Y坐标", lineNumber);
    if (width < 10 || width > 0xffff) throw new Error(`第 ${lineNumber} 行宽度必须在 10 到 65535 之间`);
    if (scopeType === 0 && height !== 0) throw new Error(`第 ${lineNumber} 行圆形区域高度必须为 0`);
    if (scopeType === 1 && (height < 10 || height > 0xffff)) {
      throw new Error(`第 ${lineNumber} 行矩形高度必须在 10 到 65535 之间`);
    }

    const centerXCm = -deviceX;
    const centerYCm = deviceY;
    const geometry: RegionGeometry = scopeType === 0
      ? { shape: "circle", centerXCm, centerYCm, radiusCm: width }
      : { shape: "rect", centerXCm, centerYCm, widthCm: width, heightCm: height };
    regions.push({
      id: createClientId(),
      index: regionIndex,
      label,
      regionType,
      geometry,
      ioIndex: ioIndex as RegionDefinition["ioIndex"],
      mcuIo: -1,
      x: centerXCm / 100,
      y: centerYCm / 100,
      enabled: true,
      visible: true,
    });
  });

  if (!regions.length) throw new Error("标签区域配置文件为空");
  return regions;
};

const escapeIniLabel = (label: string): string => {
  if (/\r|\n/.test(label)) throw new Error("区域名称不能包含换行");
  return /[\",()]/.test(label) ? `"${label.replace(/"/g, '""')}"` : label;
};

export const serializeRegionIni = (regions: RegionDefinition[]): string => regions
  .slice()
  .sort((left, right) => left.index - right.index)
  .map((region) => {
    const geometry = region.geometry;
    const scopeType = geometry.shape === "circle" ? 0 : 1;
    const width = geometry.shape === "circle" ? geometry.radiusCm : geometry.widthCm;
    const height = geometry.shape === "circle" ? 0 : geometry.heightCm;
    const ioIndex = region.regionType === "status_detection" ? region.ioIndex : 0;
    return `(${escapeIniLabel(region.label)},${region.index},${TAG_CODE_BY_REGION_TYPE[region.regionType]},${scopeType},${ioIndex},${-Math.round(geometry.centerXCm)},${Math.round(geometry.centerYCm)},${Math.round(width)},${Math.round(height)})`;
  })
  .join("\r\n");

export const mergeImportedRegions = (
  currentRegions: RegionDefinition[],
  importedRegions: RegionDefinition[],
): RegionDefinition[] => {
  const currentByIndex = new Map(currentRegions.map((region) => [region.index, region]));
  const importedByIndex = new Map<number, RegionDefinition>();
  importedRegions.forEach((region) => {
    if (importedByIndex.has(region.index)) throw new Error(`区域索引 ${region.index} 重复`);
    importedByIndex.set(region.index, region);
  });

  const mergedByIndex = new Map(currentByIndex);
  importedByIndex.forEach((region, index) => {
    const current = currentByIndex.get(index);
    mergedByIndex.set(index, normalizeRegionDefinition({
      ...region,
      id: current?.id ?? region.id,
      mcuIo: -1,
    }));
  });

  const merged = Array.from(mergedByIndex.values())
    .map((region) => normalizeRegionDefinition({ ...region, mcuIo: -1 }))
    .sort((left, right) => left.index - right.index);
  if (merged.length > 32) throw new Error("标签区域不能超过 32 个");
  for (const region of merged) {
    const validationError = validateRegionDefinition(region, merged);
    if (validationError) throw new Error(`${region.label}：${validationError}`);
  }
  return merged;
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
