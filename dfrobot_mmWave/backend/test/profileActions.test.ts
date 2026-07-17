import { describe, expect, it, vi } from "vitest";
import type { StoredMmwaveDevice } from "../src/config/storage";
import { c4004ProfileAdapter } from "../src/domain/profiles/builtinProfiles";
import { buildDeviceStateMap } from "../src/domain/profiles/profileRuntime";
import type { HaClient } from "../src/ha/client";

describe("profile range and MCU IO actions", () => {
  it("resolves writable entities by HA device id when prefixes differ", async () => {
    const callService = vi.fn(async () => undefined);
    const getEntityRegistry = vi.fn(async () => [
      { entity_id: "switch.legacy_radar_trajectory_led", device_id: "ha-device-1" },
      { entity_id: "number.legacy_radar_unmanned_time", device_id: "ha-device-1" },
      { entity_id: "switch.c4004_2_trajectory_led", device_id: "ha-device-3" },
      { entity_id: "number.c4004_2_unmanned_time", device_id: "ha-device-3" },
    ]);
    const client = { callService, getEntityRegistry } as unknown as HaClient;
    const device = { prefix: "c4004_0", haDeviceId: "ha-device-1" } as StoredMmwaveDevice;

    await c4004ProfileAdapter.writeDeviceSettings?.(client, device, {
      trajectoryLed: false,
      unmannedTime: 30,
    });

    expect(callService.mock.calls).toEqual([
      ["switch", "turn_off", { entity_id: "switch.legacy_radar_trajectory_led" }],
      ["number", "set_value", { entity_id: "number.legacy_radar_unmanned_time", value: 30 }],
    ]);
  });

  it("writes all four bounds before pressing the four-sided range button", async () => {
    const callService = vi.fn(async () => undefined);
    const client = { callService } as unknown as HaClient;
    const device = { prefix: "radar_a" } as StoredMmwaveDevice;

    await c4004ProfileAdapter.applyFourSidedRange?.(client, device, {
      xMin: -2.5,
      xMax: 3.5,
      yMin: 0,
      yMax: 8,
    });

    expect(callService.mock.calls).toEqual([
      ["number", "set_value", { entity_id: "number.radar_a_range_x_min", value: -250 }],
      ["number", "set_value", { entity_id: "number.radar_a_range_x_max", value: 350 }],
      ["number", "set_value", { entity_id: "number.radar_a_range_y_min", value: 0 }],
      ["number", "set_value", { entity_id: "number.radar_a_range_y_max", value: 800 }],
      ["button", "press", { entity_id: "button.radar_a_set_four_sided_range_mode" }],
    ]);
  });

  it("maps zone settings to the six native number entities", async () => {
    const callService = vi.fn(async () => undefined);
    const client = { callService } as unknown as HaClient;
    const device = { prefix: "radar_b" } as StoredMmwaveDevice;

    await c4004ProfileAdapter.writeDeviceSettings?.(client, device, {
      zone1McuIo: 10,
      zone6McuIo: 60,
    });

    expect(callService.mock.calls).toEqual([
      ["number", "set_value", { entity_id: "number.radar_b_zone_1_mcu_io", value: 10 }],
      ["number", "set_value", { entity_id: "number.radar_b_zone_6_mcu_io", value: 60 }],
    ]);
  });

  it("reads ESPHome display-name entity ids through stable aliases", () => {
    const device = { prefix: "c4004_2", haDeviceId: "ha-device-2" } as StoredMmwaveDevice;
    const states = new Map([
      ["binary_sensor.c4004_2_overall_zone_presence", {
        entity_id: "binary_sensor.c4004_2_overall_zone_presence",
        state: "on",
        attributes: {},
      }],
      ["binary_sensor.c4004_2_zone_presence_2", {
        entity_id: "binary_sensor.c4004_2_zone_presence_2",
        state: "off",
        attributes: {},
      }],
    ]);
    const registry = [
      { entity_id: "binary_sensor.c4004_2_overall_zone_presence", device_id: "ha-device-2" },
      { entity_id: "binary_sensor.c4004_2_zone_presence_2", device_id: "ha-device-2" },
    ];

    const mapped = buildDeviceStateMap(device, states, registry);

    expect(mapped.get("binary_sensor.c4004_2_zone_1_presence")?.state).toBe("on");
    expect(mapped.get("binary_sensor.c4004_2_zone_2_presence")?.state).toBe("off");
  });

  it("writes deleted-region IO resets through ESPHome display-name entity ids", async () => {
    const callService = vi.fn(async () => undefined);
    const getEntityRegistry = vi.fn(async () => [
      { entity_id: "number.c4004_2_overall_presence_state", device_id: "ha-device-2" },
      { entity_id: "number.c4004_2_zone_mcu_io2", device_id: "ha-device-2" },
      { entity_id: "number.c4004_2_zone_mcu_io3", device_id: "ha-device-2" },
      { entity_id: "number.c4004_2_zone_mcu_io4", device_id: "ha-device-2" },
      { entity_id: "number.c4004_2_zone_mcu_io5", device_id: "ha-device-2" },
      { entity_id: "number.c4004_2_zone_mcu_io6", device_id: "ha-device-2" },
    ]);
    const client = { callService, getEntityRegistry } as unknown as HaClient;
    const device = { prefix: "c4004_2", haDeviceId: "ha-device-2" } as StoredMmwaveDevice;

    await c4004ProfileAdapter.writeDeviceSettings?.(client, device, {
      zone2McuIo: -1,
      zone3McuIo: -1,
      zone4McuIo: -1,
      zone5McuIo: -1,
      zone6McuIo: -1,
    });

    expect(callService.mock.calls).toEqual([
      ["number", "set_value", { entity_id: "number.c4004_2_zone_mcu_io2", value: -1 }],
      ["number", "set_value", { entity_id: "number.c4004_2_zone_mcu_io3", value: -1 }],
      ["number", "set_value", { entity_id: "number.c4004_2_zone_mcu_io4", value: -1 }],
      ["number", "set_value", { entity_id: "number.c4004_2_zone_mcu_io5", value: -1 }],
      ["number", "set_value", { entity_id: "number.c4004_2_zone_mcu_io6", value: -1 }],
    ]);
  });

  it("keeps detail basics from stored config when HA entities are unavailable", () => {
    const now = "2026-07-15T00:00:00.000Z";
    const device = {
      id: "c4004-fallback",
      name: "c4004_0",
      model: "c4004",
      prefix: "c4004_0",
      mqttTopicPrefix: "c4004_0",
      mqttKey: "main",
      macAddress: "00:00:00:00:00:01",
      initialized: true,
      profileId: "c4004",
      profileSource: "signature",
      profileStatus: "resolved",
      binding: { entityCount: 10 },
      installInfo: { installMode: "side", installAngleDeg: 0, installHeightM: 2 },
      detectionMode: 2,
      deviceSettings: {
        realTimePeopleTime: 5,
        trackMeters: 50,
        trackExistsTime: 10,
        checkToActiveFrames: 7,
        unmannedTime: 30,
      },
      discovery: { status: "offline", signal: 70, lastSeen: now, discoveredAt: now, lastUpdated: now },
      regionConfig: {
        version: 2,
        coordinate: { xMin: -5, xMax: 5, yMin: 0, yMax: 9 },
        rangeBox: { xMin: -2, xMax: 2, yMin: 0, yMax: 7 },
        detection: {
          mode: "rect",
          appliedMode: "rect",
          rectCm: { xMin: -200, xMax: 200, yMin: 0, yMax: 700 },
          learnedPointsCm: [],
          customPointsCm: [],
          customConfirmed: false,
        },
        regions: [],
        backgroundInstances: [],
        syncState: {
          fourSidedRange: "synced",
          regionMcuIo: "synced",
          tagConfig: "synced",
          customRange: "synced",
          updatedAt: now,
        },
      },
      lastZoneSnapshot: {
        updatedAt: now,
        presenceStates: [{ id: "zone-1", active: true }],
        zones: [
          { index: 0, active: true },
          { index: 1, active: false },
          { index: 2, active: false },
          { index: 3, active: false },
          { index: 4, active: false },
          { index: 5, active: false },
        ],
        counts: { peopleCount: 2, targetCount: 1, movingCount: 1, staticCount: 1 },
      },
    } as StoredMmwaveDevice;

    const detail = c4004ProfileAdapter.buildDeviceDetail?.(device, new Map(), {
      trajectory: null,
      tagRegions: new Map(),
      mqttConnected: false,
    });

    const basics = new Map(detail?.basics.map((item) => [item.key, item.value]));
    expect(detail?.peopleCount).toBe(2);
    expect(detail?.targetCount).toBe(1);
    expect(detail?.ioStates.find((io) => io.id === "io1")?.active).toBe(true);
    expect(basics.get("installMode")).toBe("Side");
    expect(basics.get("realTimePeopleTime")).toBe("5 s");
    expect(basics.get("installHeight")).toBe("200 cm");
    expect(basics.get("trackMeters")).toBe("50 m");
    expect(basics.get("trackExistsTime")).toBe("10 s");
    expect(basics.get("checkToActiveFrames")).toBe("7");
    expect(basics.get("unmannedTime")).toBe("30 s");
  });
});
