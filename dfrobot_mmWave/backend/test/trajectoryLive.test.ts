import { describe, expect, it } from "vitest";
import { RuntimeCacheStore } from "../src/domain/runtimeCache";
import { parseTrajectorySnapshot } from "../src/domain/trajectory";
import type { StoredMmwaveDevice } from "../src/config/storage";

const device = { id: "device-1" } as StoredMmwaveDevice;

describe("trajectory live updates", () => {
  it("uses decoded points when target_count is omitted", () => {
    const snapshot = parseTrajectorySnapshot(
      "home/trajectory",
      JSON.stringify({
        type: "target_trajectory",
        device_topic_prefix: "radar_a",
        mqtt_key: "main",
        hex: "01020001006400320000000A",
      }),
    );

    expect(snapshot?.targetCount).toBe(1);
    expect(snapshot?.points).toHaveLength(1);
  });

  it("emits the first zero frame once and suppresses repeated zero frames", () => {
    const store = new RuntimeCacheStore();
    store.ensureDevice(device);

    const zeroSnapshot = {
      topic: "home/trajectory",
      topicPrefix: "radar_a",
      mqttKey: "main",
      targetCount: 0,
      points: [],
      hex: "00",
      updatedAt: "2026-07-14T00:00:00.000Z",
    };

    expect(store.updateTrajectory(device.id, zeroSnapshot)).toBe(true);
    expect(store.updateTrajectory(device.id, zeroSnapshot)).toBe(false);

    const movingSnapshot = {
      ...zeroSnapshot,
      targetCount: 2,
      points: [{ id: 1, x: 1, y: 2, feature: "moving" as const }],
      updatedAt: "2026-07-14T00:00:01.000Z",
    };

    expect(store.updateTrajectory(device.id, movingSnapshot)).toBe(true);
  });
});
