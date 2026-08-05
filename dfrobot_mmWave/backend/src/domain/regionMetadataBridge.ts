import type { StoredMmwaveDevice } from "../config/storage";
import type { StoredRegionConfig } from "../types/mmwave";
import type { MqttBridge } from "./mqttBridge";

export const REGION_METADATA_TOPIC_SUFFIX = "state/region_metadata";

export interface RegionMetadataPayload {
  schema: 1;
  type: "region_metadata";
  device_topic_prefix: string;
  mqtt_key: string;
  updated_at: string;
  regions: Array<{
    id: string;
    index: number;
    label: string;
  }>;
}

export const buildRegionMetadataPayload = (
  device: StoredMmwaveDevice,
  regionConfig: StoredRegionConfig,
): RegionMetadataPayload => ({
  schema: 1,
  type: "region_metadata",
  device_topic_prefix: device.mqttTopicPrefix,
  mqtt_key: device.mqttKey,
  updated_at: new Date().toISOString(),
  regions: regionConfig.regions.map((region) => ({
    id: region.id,
    index: region.index,
    label: region.label,
  })),
});

export const publishDeviceRegionMetadata = (
  device: StoredMmwaveDevice,
  regionConfig: StoredRegionConfig,
  mqttBridge: MqttBridge,
): boolean => mqttBridge.publishRegionMetadata(
  device,
  buildRegionMetadataPayload(device, regionConfig),
);
