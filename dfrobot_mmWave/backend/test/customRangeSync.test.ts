import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Logger } from "pino";
import {
  DeviceStorage,
  createDefaultRegionConfig,
  type DiscoveredMmwaveDeviceInput,
} from "../src/config/storage";
import type {
  ConfigFileRangeResultSnapshot,
  MqttBridge,
} from "../src/domain/mqttBridge";
import { MmwaveService } from "../src/domain/mmwaveService";

const tempDirs: string[] = [];

const createStorageWithDevice = async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mmwave-custom-range-"));
  tempDirs.push(dataDir);
  const storage = new DeviceStorage(dataDir);
  const candidate: DiscoveredMmwaveDeviceInput = {
    profileId: "c4004",
    profileSource: "signature",
    profileStatus: "resolved",
    haDeviceId: "ha-device-0",
    name: "c4004_0",
    model: "DFRobot C4004",
    prefix: "c4004_0",
    mqttTopicPrefix: "c4004_0",
    mqttKey: "main",
    status: "online",
    signal: 100,
    entityCount: 20,
  };
  const [discovered] = await storage.replaceFromDiscovery([candidate]);
  const device = storage.initializeDevice(discovered.id, {
    deviceNoMode: "auto",
    installHeightM: 1.8,
    detectionMode: 1,
  });
  return { storage, device };
};

const customRegionConfig = () => {
  const config = createDefaultRegionConfig();
  config.detection = {
    ...config.detection,
    mode: "custom",
    appliedMode: "custom",
    customConfirmed: true,
    customPointsCm: [
      { x: -200, y: 0 },
      { x: -200, y: 400 },
      { x: 200, y: 400 },
      { x: 200, y: 0 },
    ],
  };
  return config;
};

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("custom range synchronization", () => {
  it("does not persist the draft when MQTT publish fails", async () => {
    const { storage, device } = await createStorageWithDevice();
    const mqttBridge = {
      isConfigured: () => true,
      publishConfigFileRangeCommand: () => false,
    } as unknown as MqttBridge;
    const service = new MmwaveService(null, storage, mqttBridge, {} as Logger);

    const result = await service.updateDeviceConfig(device.id, {
      regionConfig: customRegionConfig(),
      apply: { customRange: true },
    });

    expect(result.applyResult.customRange).toBe("failed");
    expect(result.config.regionConfig.detection.mode).toBe("rect");
    expect(storage.getDevice(device.id)?.regionConfig.detection.customPointsCm).toEqual([]);
  });

  it("persists only after a matching device result succeeds", async () => {
    const { storage, device } = await createStorageWithDevice();
    let service: MmwaveService;
    const mqttBridge = {
      isConfigured: () => true,
      publishConfigFileRangeCommand: (_device: unknown, payload: { request_id: string; hex: string }) => {
        queueMicrotask(() => {
          const snapshot: ConfigFileRangeResultSnapshot = {
            topic: "c4004_0/dfrobot_c4004/main/result/config_file_range/set",
            topicPrefix: "c4004_0",
            mqttKey: "main",
            requestId: payload.request_id,
            ok: true,
            pointCount: 4,
            hex: payload.hex,
            receivedAt: new Date().toISOString(),
          };
          service.handleConfigFileRangeResult("another-device", snapshot);
          service.handleConfigFileRangeResult(device.id, snapshot);
        });
        return true;
      },
    } as unknown as MqttBridge;
    service = new MmwaveService(null, storage, mqttBridge, {} as Logger);

    const result = await service.updateDeviceConfig(device.id, {
      regionConfig: customRegionConfig(),
      apply: { customRange: true },
    });

    expect(result.applyResult.customRange).toBe("applied");
    expect(result.config.regionConfig.syncState.customRange).toBe("synced");
    expect(storage.getDevice(device.id)?.regionConfig.detection).toMatchObject({
      mode: "custom",
      appliedMode: "custom",
      customConfirmed: true,
    });
  });
});
