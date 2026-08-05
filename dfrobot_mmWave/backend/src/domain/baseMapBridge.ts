import type { Logger } from "pino";
import type { BaseMapStorage } from "../config/baseMapStorage";
import type { StoredMmwaveDevice } from "../config/storage";
import type { BaseMapInstance, StoredRegionConfig } from "../types/mmwave";
import type { MqttBridge } from "./mqttBridge";

export const BASE_MAP_LAYOUT_TOPIC_SUFFIX = "state/base_map_layout";

/**
 * HTTP URL served by mmWave Map integration from the same folder Addon writes:
 * `{HA config}/dfrobot_mmwave/base_maps/user/` (host: `/homeassistant/dfrobot_mmwave/base_maps/user/`).
 */
export const USER_BASE_MAP_HTTP_PREFIX = "/dfrobot_mmwave/base_maps/user";

/** Legacy Chinese system ids → English filename stems (match frontend baseMapAssets). */
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

export interface BaseMapLayoutPayload {
  schema: 1;
  type: "base_map_layout";
  device_topic_prefix: string;
  mqtt_key: string;
  updated_at: string;
  /** Grid / Map / Fill toggles from Addon region tool bar */
  grid_visible: boolean;
  background_visible: boolean;
  fill_visible: boolean;
  instances: Array<{
    id: string;
    source_type: "system" | "user";
    source_id: string;
    image_url: string;
    x_cm: number;
    y_cm: number;
    width_cm: number;
    height_cm: number;
    rotation_deg: number;
    visible: boolean;
    z_index: number;
  }>;
}

const canonicalizeSystemId = (sourceId: string): string =>
  LEGACY_SYSTEM_ID_ALIASES[sourceId] ?? sourceId;

/**
 * Resolve HTTP URLs for user base maps already stored under USER_BASE_MAP_DIR.
 * No copy to `www` — mmWave Map serves that folder directly.
 */
export const resolveUserBaseMapImageUrls = (
  device: StoredMmwaveDevice,
  instances: BaseMapInstance[],
  baseMapStorage: BaseMapStorage | null | undefined,
  logger: Logger,
): Map<string, string> => {
  const urls = new Map<string, string>();
  const userInstances = instances.filter((instance) => instance.sourceType === "user");
  if (userInstances.length === 0) {
    logger.warn(
      { deviceId: device.id },
      "base_map resolve: no user instances (system maps use HA /local/mmwave_map/base_map/system)",
    );
    return urls;
  }

  if (!baseMapStorage) {
    logger.warn(
      { deviceId: device.id, userCount: userInstances.length },
      "base_map resolve: BaseMapStorage missing; user image_url will be empty",
    );
    return urls;
  }

  for (const instance of userInstances) {
    const resolved = baseMapStorage.getAsset(instance.sourceId);
    if (!resolved) {
      logger.warn(
        { deviceId: device.id, sourceId: instance.sourceId },
        "base_map resolve: user asset file not found in shared store",
      );
      urls.set(instance.sourceId, "");
      continue;
    }

    const imageUrl = `${USER_BASE_MAP_HTTP_PREFIX}/${encodeURIComponent(resolved.asset.fileName)}`;
    urls.set(instance.sourceId, imageUrl);
    logger.warn(
      {
        deviceId: device.id,
        sourceId: instance.sourceId,
        filePath: resolved.filePath,
        imageUrl,
        bytes: resolved.asset.size,
      },
      "base_map resolve: shared user asset → HA HTTP path",
    );
  }

  return urls;
};

/** @deprecated Use resolveUserBaseMapImageUrls */
export const exportUserBaseMapsForHa = resolveUserBaseMapImageUrls;

export const buildBaseMapLayoutPayload = (
  device: StoredMmwaveDevice,
  regionConfig: StoredRegionConfig,
  userImageUrls: Map<string, string>,
): BaseMapLayoutPayload => {
  const instances = (regionConfig.backgroundInstances ?? []).map((instance) => {
    const sourceId =
      instance.sourceType === "system"
        ? canonicalizeSystemId(instance.sourceId)
        : instance.sourceId;
    let imageUrl = "";
    if (instance.sourceType === "user") {
      imageUrl = userImageUrls.get(instance.sourceId) ?? "";
    } else {
      // System PNGs are copied by HA integration into config/www (not SVG)
      imageUrl = `/local/mmwave_map/base_map/system/${encodeURIComponent(sourceId)}.png`;
    }
    return {
      id: instance.id,
      source_type: instance.sourceType,
      source_id: sourceId,
      image_url: imageUrl,
      x_cm: instance.xCm,
      y_cm: instance.yCm,
      width_cm: instance.widthCm,
      height_cm: instance.heightCm,
      rotation_deg: instance.rotationDeg ?? 0,
      visible: Boolean(instance.visible),
      z_index: instance.zIndex ?? 0,
    };
  });

  const hasVisible = instances.some((entry) => entry.visible);
  const prefs = regionConfig.viewPreferences;
  const gridVisible = prefs?.gridVisible ?? true;
  const backgroundVisible = prefs?.backgroundVisible ?? hasVisible;
  const fillVisible = prefs?.fillVisible ?? true;

  return {
    schema: 1,
    type: "base_map_layout",
    device_topic_prefix: device.mqttTopicPrefix,
    mqtt_key: device.mqttKey,
    updated_at: new Date().toISOString(),
    grid_visible: Boolean(gridVisible),
    background_visible: Boolean(backgroundVisible),
    fill_visible: Boolean(fillVisible),
    instances,
  };
};

export const publishDeviceBaseMapLayout = (params: {
  device: StoredMmwaveDevice;
  regionConfig: StoredRegionConfig;
  mqttBridge: MqttBridge;
  baseMapStorage?: BaseMapStorage | null;
  logger: Logger;
}): boolean => {
  const { device, regionConfig, mqttBridge, baseMapStorage, logger } = params;
  const rawInstances = regionConfig.backgroundInstances ?? [];
  logger.warn(
    {
      deviceId: device.id,
      mqttTopicPrefix: device.mqttTopicPrefix,
      mqttKey: device.mqttKey,
      profileId: device.profileId,
      rawInstanceCount: rawInstances.length,
      backgroundVisiblePref: regionConfig.viewPreferences?.backgroundVisible,
      gridVisiblePref: regionConfig.viewPreferences?.gridVisible,
      fillVisiblePref: regionConfig.viewPreferences?.fillVisible,
      rawSample: rawInstances.slice(0, 3).map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        visible: item.visible,
        xCm: item.xCm,
        yCm: item.yCm,
        widthCm: item.widthCm,
        heightCm: item.heightCm,
        rotationDeg: item.rotationDeg,
      })),
      mqttConfigured: mqttBridge.isConfigured(),
      mqttConnected: mqttBridge.isConnected(),
      hasBaseMapStorage: Boolean(baseMapStorage),
    },
    "base_map_layout: prepare publish",
  );

  const userUrls = resolveUserBaseMapImageUrls(device, rawInstances, baseMapStorage, logger);
  const payload = buildBaseMapLayoutPayload(device, regionConfig, userUrls);
  const imageUrls = payload.instances.map((item) => item.image_url || "(empty)");
  logger.warn(
    {
      deviceId: device.id,
      grid_visible: payload.grid_visible,
      background_visible: payload.background_visible,
      fill_visible: payload.fill_visible,
      instanceCount: payload.instances.length,
      imageUrls,
      instances: payload.instances.map((item) => ({
        id: item.id,
        source_type: item.source_type,
        source_id: item.source_id,
        image_url: item.image_url,
        visible: item.visible,
        x_cm: item.x_cm,
        y_cm: item.y_cm,
        width_cm: item.width_cm,
        height_cm: item.height_cm,
        rotation_deg: item.rotation_deg,
        z_index: item.z_index,
      })),
    },
    "base_map_layout: payload ready (含 image_url)",
  );

  const ok = mqttBridge.publishBaseMapLayout(device, payload);
  logger.warn(
    {
      deviceId: device.id,
      topicPrefix: device.mqttTopicPrefix,
      mqttKey: device.mqttKey,
      published: ok,
      instanceCount: payload.instances.length,
      backgroundVisible: payload.background_visible,
      imageUrls,
    },
    "base_map_layout: publish result",
  );
  return ok;
};
