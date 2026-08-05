import type { Logger } from "pino";
import type { StoredMmwaveDevice } from "../config/storage";
import type { StoredRegionConfig } from "../types/mmwave";
import type { MqttBridge } from "./mqttBridge";

export const ADDON_DETECTION_RANGE_TOPIC_SUFFIX = "state/addon_detection_range";

export interface AddonDetectionRangePayload {
  schema: 1;
  type: "addon_detection_range";
  device_topic_prefix: string;
  mqtt_key: string;
  updated_at: string;
  mode: string;
  applied_mode: string;
  range_box: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
  };
  rect_cm: {
    x_min: number;
    x_max: number;
    y_min: number;
    y_max: number;
  };
  learned_points_cm: Array<{ x: number; y: number }>;
  custom_points_cm: Array<{ x: number; y: number }>;
}

export const buildAddonDetectionRangePayload = (
  device: StoredMmwaveDevice,
  regionConfig: StoredRegionConfig,
): AddonDetectionRangePayload => {
  const detection = regionConfig.detection;
  const rangeBox = regionConfig.rangeBox;
  const rectCm = detection.rectCm ?? {
    xMin: Math.round(rangeBox.xMin * 100),
    xMax: Math.round(rangeBox.xMax * 100),
    yMin: Math.round(rangeBox.yMin * 100),
    yMax: Math.round(rangeBox.yMax * 100),
  };
  const appliedMode = detection.appliedMode ?? detection.mode ?? "rect";

  return {
    schema: 1,
    type: "addon_detection_range",
    device_topic_prefix: device.mqttTopicPrefix,
    mqtt_key: device.mqttKey,
    updated_at: new Date().toISOString(),
    mode: detection.mode ?? "rect",
    applied_mode: appliedMode,
    range_box: {
      x_min: rangeBox.xMin,
      x_max: rangeBox.xMax,
      y_min: rangeBox.yMin,
      y_max: rangeBox.yMax,
    },
    rect_cm: {
      x_min: rectCm.xMin,
      x_max: rectCm.xMax,
      y_min: rectCm.yMin,
      y_max: rectCm.yMax,
    },
    learned_points_cm: (detection.learnedPointsCm ?? []).map((point) => ({
      x: point.x,
      y: point.y,
    })),
    custom_points_cm: (detection.customPointsCm ?? []).map((point) => ({
      x: point.x,
      y: point.y,
    })),
  };
};

export const publishDeviceAddonDetectionRange = (params: {
  device: StoredMmwaveDevice;
  regionConfig: StoredRegionConfig;
  mqttBridge: MqttBridge;
  logger: Logger;
}): boolean => {
  const { device, regionConfig, mqttBridge, logger } = params;
  const payload = buildAddonDetectionRangePayload(device, regionConfig);
  logger.warn(
    {
      deviceId: device.id,
      mqttTopicPrefix: device.mqttTopicPrefix,
      applied_mode: payload.applied_mode,
      rect_cm: payload.rect_cm,
      range_box: payload.range_box,
      learnedPoints: payload.learned_points_cm.length,
      customPoints: payload.custom_points_cm.length,
      mqttConfigured: mqttBridge.isConfigured(),
      mqttConnected: mqttBridge.isConnected(),
    },
    "addon_detection_range: prepare publish",
  );

  const ok = mqttBridge.publishAddonDetectionRange(device, payload);
  logger.warn(
    {
      deviceId: device.id,
      published: ok,
      applied_mode: payload.applied_mode,
      rect_cm: payload.rect_cm,
    },
    ok ? "addon_detection_range: publish OK" : "addon_detection_range: publish FAILED",
  );
  return ok;
};
