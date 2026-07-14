import { describe, expect, it, vi } from "vitest";
import type { StoredMmwaveDevice } from "../src/config/storage";
import { c4004ProfileAdapter } from "../src/domain/profiles/builtinProfiles";
import type { HaClient } from "../src/ha/client";

describe("profile range and MCU IO actions", () => {
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
});
