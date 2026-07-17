import { describe, expect, it } from "vitest";
import type { HaClient } from "../src/ha/client";
import type {
  HaDeviceRegistryEntry,
  HaEntityRegistryEntry,
  HaEntityState,
} from "../src/ha/types";
import { resolveDiscoveredProfiles } from "../src/domain/profiles/registry";

const signatureEntities = [
  ["binary_sensor", "online"],
  ["binary_sensor", "presence"],
  ["sensor", "people_count"],
  ["sensor", "target_count"],
] as const;

const createClient = (
  states: HaEntityState[],
  entityRegistry: HaEntityRegistryEntry[],
  devices: HaDeviceRegistryEntry[],
): HaClient => ({
  getAllStates: async () => states,
  getEntityRegistry: async () => entityRegistry,
  getDeviceRegistry: async () => devices,
  getAreaRegistry: async () => [],
}) as unknown as HaClient;

describe("profile discovery", () => {
  it("keeps same-prefix entities isolated by HA device id", async () => {
    const states: HaEntityState[] = [];
    const entityRegistry: HaEntityRegistryEntry[] = [];

    for (const [deviceIndex, deviceId] of ["ha-device-a", "ha-device-b"].entries()) {
      for (const [domain, slug] of signatureEntities) {
        const duplicateSuffix = deviceIndex === 0 ? "" : "_2";
        const entityId = `${domain}.radar_${slug}${duplicateSuffix}`;
        states.push({ entity_id: entityId, state: domain === "binary_sensor" ? "on" : "0", attributes: {} });
        entityRegistry.push({ entity_id: entityId, device_id: deviceId });
      }
    }

    const candidates = await resolveDiscoveredProfiles(createClient(states, entityRegistry, [
      { id: "ha-device-a", name: "c4004_0" },
      { id: "ha-device-b", name: "c4004_2" },
    ]));

    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map((candidate) => candidate.deviceId))).toEqual(
      new Set(["ha-device-a", "ha-device-b"]),
    );
  });

  it("uses disabled registry entities when they are absent from HA states", async () => {
    const entityRegistry = signatureEntities.map(([domain, slug]) => ({
      entity_id: `${domain}.c4004_0_${slug}`,
      device_id: "ha-device-disabled",
      disabled_by: "integration",
    }));

    const candidates = await resolveDiscoveredProfiles(createClient([], entityRegistry, [
      { id: "ha-device-disabled", name: "c4004_0" },
    ]));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      deviceId: "ha-device-disabled",
      prefix: "c4004_0",
      status: "offline",
    });
  });
});
