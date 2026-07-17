import { userBaseMapUrl } from "../api/client";

const systemModules = import.meta.glob("../../resource/base_map/system/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const systemUrlById = new Map(
  Object.entries(systemModules).map(([filePath, url]) => {
    const id = filePath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? filePath;
    return [id, url] as const;
  }),
);

export const listSystemBaseMapAssets = (): Array<{ id: string; name: string; url: string }> =>
  [...systemUrlById.entries()].map(([id, url]) => ({
    id,
    name: id,
    url,
  }));

export const resolveBaseMapSourceUrl = (sourceType: "system" | "user", sourceId: string): string => {
  if (sourceType === "user") {
    return userBaseMapUrl(sourceId);
  }
  return systemUrlById.get(sourceId) ?? "";
};
