import type { RegionDefinition, RegionGeometry } from "../api/client";

export interface ViewTransform {
  coordinateWidthCm: number;
  coordinateHeightCm: number;
  zoom: number;
  centerXCm: number;
  centerYCm: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
}

export const findAvailableRegionIndex = (regions: RegionDefinition[]): number | null => {
  const used = new Set(regions.map((region) => region.index));
  return Array.from({ length: 32 }, (_, index) => index).find((index) => !used.has(index)) ?? null;
};

export const updateGeometryCenter = (geometry: RegionGeometry, centerXCm: number, centerYCm: number): RegionGeometry => ({
  ...geometry,
  centerXCm: Math.round(centerXCm),
  centerYCm: Math.round(centerYCm),
});

export const normalizeRegionDefinition = (region: RegionDefinition): RegionDefinition => ({
  ...region,
  label: region.label.trim(),
  x: region.geometry.centerXCm / 100,
  y: region.geometry.centerYCm / 100,
  ioIndex: region.regionType === "status_detection" ? region.ioIndex : 0,
  mcuIo: region.regionType === "status_detection" && region.index < 6 ? region.mcuIo : -1,
});

export const validateRegionDefinition = (
  region: RegionDefinition,
  existingRegions: RegionDefinition[],
): string | null => {
  if (!region.label.trim()) return "请输入区域名称";
  if (!Number.isInteger(region.index) || region.index < 0 || region.index > 31) return "区域索引必须为 0 到 31";
  if (existingRegions.some((entry) => entry.id !== region.id && entry.index === region.index)) return "区域索引已存在";
  if (region.geometry.shape === "rect" && (region.geometry.widthCm < 10 || region.geometry.heightCm < 10)) return "矩形宽高不能小于 10cm";
  if (region.geometry.shape === "circle" && region.geometry.radiusCm < 10) return "圆形半径不能小于 10cm";
  if (region.mcuIo < -1 || region.mcuIo > 255) return "MCU IO 必须在 -1 到 255 之间";
  return null;
};

export const viewportPointToWorld = (
  clientX: number,
  clientY: number,
  viewportLeft: number,
  viewportTop: number,
  transform: ViewTransform,
): { x: number; y: number } => {
  const viewWidth = transform.coordinateWidthCm / transform.zoom;
  const viewHeight = transform.coordinateHeightCm / transform.zoom;
  const x = transform.centerXCm - viewWidth / 2 + ((clientX - viewportLeft) / transform.viewportWidthPx) * viewWidth;
  const svgY = -transform.centerYCm - viewHeight / 2 + ((clientY - viewportTop) / transform.viewportHeightPx) * viewHeight;
  return { x, y: -svgY };
};

export const canConfirmCustomRange = (points: Array<{ x: number; y: number }>): boolean => points.length >= 3;
