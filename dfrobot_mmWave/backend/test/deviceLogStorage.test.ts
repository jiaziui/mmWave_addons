import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DeviceLogStorage } from "../src/config/deviceLogStorage";
import type { StoredMmwaveDevice } from "../src/config/storage";
import type { TagEventSnapshot } from "../src/domain/tagEvent";

const tempDirs: string[] = [];

const createStore = () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mmwave-device-log-"));
  tempDirs.push(dataDir);
  return { dataDir, store: new DeviceLogStorage(dataDir) };
};

const device = (id: string): StoredMmwaveDevice => ({
  id,
  name: `${id}-name`,
  prefix: `${id}-prefix`,
  deploymentName: `${id}-deployment`,
  regionConfig: {
    regions: [
      { id: "status", index: 0, label: "办公区", regionType: "status_detection", enabled: true },
      { id: "approach", index: 1, label: "卧室", regionType: "approach_depart", enabled: true },
      { id: "boundary", index: 2, label: "卧室门", regionType: "boundary", enabled: true },
    ],
  },
} as StoredMmwaveDevice);

const event = (updates: Partial<TagEventSnapshot>): TagEventSnapshot => ({
  topic: "c4004_0/dfrobot_c4004/main/state/tag_event",
  topicPrefix: "c4004_0",
  mqttKey: "main",
  tagIndex: 0,
  tagType: "people_counting",
  tagTypeCode: 3,
  ioIndex: 0,
  centerXCm: 0,
  centerYCm: 300,
  movingCount: 1,
  staticCount: 2,
  receivedAt: "2026-07-16T03:23:00.000Z",
  ...updates,
});

afterEach(() => {
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("DeviceLogStorage", () => {
  it("writes status changes once and stores Beijing calendar paths", async () => {
    const { dataDir, store } = createStore();
    const current = device("device-a");

    expect(await store.recordTagEvent(current, event({}))).not.toBeNull();
    expect(await store.recordTagEvent(current, event({ receivedAt: "2026-07-16T03:23:01.000Z" }))).toBeNull();
    expect(await store.recordTagEvent(current, event({ movingCount: 0, staticCount: 0, receivedAt: "2026-07-16T03:24:00.000Z" }))).not.toBeNull();

    const filePath = path.join(dataDir, "device-a", "log", "2026", "07", "16.jsonl");
    expect(fs.existsSync(filePath)).toBe(true);
    const page = store.getLogs("device-a", "2026-07-16", 1, 50);
    expect(page.total).toBe(2);
    expect(page.logs[0]).toMatchObject({
      deviceName: "device-a-name",
      deploymentName: "device-a-deployment",
      movingCount: 0,
      staticCount: 0,
      totalCount: 0,
    });
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/)[0]) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty("schema");
    expect(persisted).not.toHaveProperty("id");
    expect(persisted).not.toHaveProperty("deviceId");
    expect(persisted).toMatchObject({ deviceName: "device-a-name", deploymentName: "device-a-deployment" });
    expect(store.getCalendar("device-a", 2026, 7)).toEqual({ year: 2026, month: 7, years: [2026], months: [7], days: [16] });
  });

  it("partitions events by the Asia/Shanghai date across a UTC day boundary", async () => {
    const { dataDir, store } = createStore();
    await store.recordTagEvent(
      device("device-a"),
      event({ receivedAt: "2026-07-15T16:30:00.000Z" }),
    );

    expect(fs.existsSync(path.join(dataDir, "device-a", "log", "2026", "07", "16.jsonl"))).toBe(true);
    expect(store.getLogs("device-a", "2026-07-16", 1, 50).total).toBe(1);
  });

  it("uses none to reset directional deduplication without writing a log", async () => {
    const { store } = createStore();
    const current = device("device-a");
    const approach = event({ tagIndex: 1, tagType: "approach_away", tagTypeCode: 2, movingCount: undefined, staticCount: undefined, approachAwayState: "approach" });

    expect(await store.recordTagEvent(current, approach)).not.toBeNull();
    expect(await store.recordTagEvent(current, { ...approach, receivedAt: "2026-07-16T03:23:01.000Z" })).toBeNull();
    expect(await store.recordTagEvent(current, { ...approach, approachAwayState: "none", receivedAt: "2026-07-16T03:23:02.000Z" })).toBeNull();
    expect(await store.recordTagEvent(current, { ...approach, receivedAt: "2026-07-16T03:23:03.000Z" })).not.toBeNull();
    expect(store.getLogs("device-a", "2026-07-16", 1, 50).total).toBe(2);
  });

  it("isolates devices and skips malformed JSONL lines", async () => {
    const { dataDir, store } = createStore();
    await store.recordTagEvent(device("device-a"), event({}));
    await store.recordTagEvent(device("device-b"), event({}));
    fs.appendFileSync(path.join(dataDir, "device-a", "log", "2026", "07", "16.jsonl"), "not-json\n", "utf8");

    expect(store.getLogs("device-a", "2026-07-16", 1, 50).total).toBe(1);
    expect(store.getLogs("device-b", "2026-07-16", 1, 50).logs[0].deviceName).toBe("device-b-name");
    expect(() => store.getLogs("device-a", "2026-02-30", 1, 50)).toThrow("Invalid log date");
    expect(() => store.getLogs("../device-a", "2026-07-16", 1, 50)).toThrow("Invalid device id");
  });

  it("keeps none-mode events in memory without creating a file", async () => {
    const { dataDir, store } = createStore();
    const current = { ...device("device-a"), logRetention: { mode: "none" as const, updatedAt: new Date().toISOString() } };

    expect(await store.recordTagEvent(current, event({}))).not.toBeNull();
    expect(fs.existsSync(path.join(dataDir, "device-a", "log"))).toBe(false);
    expect(store.getRecentEntries("device-a")).toHaveLength(1);
  });

  it("cleans files older than the configured calendar retention", async () => {
    const { dataDir, store } = createStore();
    for (const date of ["2026-07-13", "2026-07-14", "2026-07-15"]) {
      const [year, month, day] = date.split("-");
      const directory = path.join(dataDir, "device-a", "log", year, month);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, `${day}.jsonl`), "{}\n", "utf8");
    }

    const removed = await store.cleanupDevice("device-a", { mode: "limited", value: 3, unit: "day", updatedAt: new Date().toISOString() }, new Date("2026-07-16T00:00:00.000Z"));
    expect(removed).toBe(1);
    expect(fs.existsSync(path.join(dataDir, "device-a", "log", "2026", "07", "13.jsonl"))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, "device-a", "log", "2026", "07", "14.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "device-a", "log", "2026", "07", "15.jsonl"))).toBe(true);
  });
});
