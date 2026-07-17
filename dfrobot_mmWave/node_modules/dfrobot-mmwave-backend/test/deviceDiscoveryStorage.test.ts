import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DeviceStorage,
  type DiscoveredMmwaveDeviceInput,
} from "../src/config/storage";

const tempDirs: string[] = [];

const createStorage = (): DeviceStorage => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mmwave-discovery-"));
  tempDirs.push(dataDir);
  return new DeviceStorage(dataDir);
};

const createCandidate = (
  prefix: string,
  haDeviceId: string,
  status: "online" | "offline",
): DiscoveredMmwaveDeviceInput => ({
  profileId: "c4004",
  profileSource: "signature",
  profileStatus: "resolved",
  haDeviceId,
  name: prefix,
  model: "DFRobot C4004",
  prefix,
  mqttTopicPrefix: prefix,
  mqttKey: "main",
  status,
  signal: status === "online" ? 88 : 0,
  entityCount: 20,
});

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("DeviceStorage discovery", () => {
  it("keeps multiple same-profile devices even when one is currently offline", async () => {
    const storage = createStorage();

    const discovered = await storage.replaceFromDiscovery([
      createCandidate("c4004_0", "ha-device-0", "offline"),
      createCandidate("c4004_2", "ha-device-2", "online"),
    ]);

    expect(discovered).toHaveLength(2);
    expect(discovered.map((device) => device.prefix).sort()).toEqual(["c4004_0", "c4004_2"]);
    expect(new Set(discovered.map((device) => device.id)).size).toBe(2);

    const persisted = storage.listDevices();
    expect(persisted).toHaveLength(2);
    expect(persisted.map((device) => device.prefix).sort()).toEqual(["c4004_0", "c4004_2"]);
  });
});
