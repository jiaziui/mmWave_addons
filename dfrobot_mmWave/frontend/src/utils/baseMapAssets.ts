import { userBaseMapUrl } from "../api/client";
import type { Locale } from "../i18n/types";

const systemModules = import.meta.glob("../../resource/base_map/system/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Chinese display labels keyed by English filename stem. */
const SYSTEM_BASE_MAP_LABELS_ZH: Record<string, string> = {
  refrigerator: "冰箱",
  "round-table": "圆桌",
  bed: "床",
  room: "房间",
  "square-table": "方桌",
  chair: "椅子",
  sofa: "沙发",
  plant: "盆栽",
};

/** Legacy Chinese ids (pre-rename) → English filename stems. */
const LEGACY_SYSTEM_ID_ALIASES: Record<string, string> = {
  冰箱: "refrigerator",
  圆桌: "round-table",
  床: "bed",
  房间: "room",
  方桌: "square-table",
  椅子: "chair",
  沙发: "sofa",
  盆栽: "plant",
};

const systemUrlById = new Map(
  Object.entries(systemModules).map(([filePath, url]) => {
    const fileName = filePath.split("/").pop() ?? filePath;
    const id = fileName.replace(/\.[^.]+$/, "");
    return [id, url] as const;
  }),
);

export const canonicalizeSystemBaseMapId = (sourceId: string): string =>
  LEGACY_SYSTEM_ID_ALIASES[sourceId] ?? sourceId;

export const getSystemBaseMapDisplayName = (sourceId: string, locale: Locale): string => {
  const id = canonicalizeSystemBaseMapId(sourceId);
  if (locale === "zh") {
    return SYSTEM_BASE_MAP_LABELS_ZH[id] ?? id;
  }
  return id;
};

export const listSystemBaseMapAssets = (): Array<{ id: string; name: string; url: string }> =>
  [...systemUrlById.entries()]
    .map(([id, url]) => ({
      id,
      name: id,
      url,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

export const resolveBaseMapSourceUrl = (sourceType: "system" | "user", sourceId: string): string => {
  if (sourceType === "user") {
    return userBaseMapUrl(sourceId);
  }
  return systemUrlById.get(canonicalizeSystemBaseMapId(sourceId)) ?? "";
};
