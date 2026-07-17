import type { StoredMmwaveDevice } from "../../config/storage";
import type { HaClient } from "../../ha/client";
import type { HaDeviceRegistryEntry, HaEntityState } from "../../ha/types";
import type { Logger } from "pino";
import { isMmwaveProfileId, type MmwaveProfileId, type ProfileSource } from "../../types/profiles";
import { c4004ProfileAdapter } from "./builtinProfiles";
import type { MmwaveProfileAdapter, ProfileDiscoveryCandidate, ProfileDiscoveryContext } from "./contracts";
import deviceProfileCatalog from "./deviceProfileCatalog.json";

interface ProfileSignatureEntityDefinition {
  domain: string;
  slug: string;
}

interface ProfileCatalogDefinition {
  id: MmwaveProfileId;
  displayName: string;
  metadataHints: string[];
  markerValues: string[];
  runtimeSupported: boolean;
  capabilities: MmwaveProfileAdapter["capabilities"];
  mqttTopics: MmwaveProfileAdapter["mqttTopics"];
  entitySignature: {
    minScore: number;
    entities: ProfileSignatureEntityDefinition[];
  };
}

interface ProfileCatalogFile {
  profiles: ProfileCatalogDefinition[];
}

const PROFILE_DEFINITIONS = (deviceProfileCatalog as ProfileCatalogFile).profiles;
const RUNTIME_ADAPTER_BY_ID = new Map<MmwaveProfileId, MmwaveProfileAdapter>([
  [c4004ProfileAdapter.id, c4004ProfileAdapter],
]);

const PROFILES: MmwaveProfileAdapter[] = PROFILE_DEFINITIONS.map((definition) => {
  const runtimeAdapter = RUNTIME_ADAPTER_BY_ID.get(definition.id);
  const getTrajectoryTopic = definition.mqttTopics.trajectoryStateTopic
    ? (device: StoredMmwaveDevice): string =>
        `${device.mqttTopicPrefix}/${definition.mqttTopics.component}/${device.mqttKey}/${definition.mqttTopics.trajectoryStateTopic}`
    : runtimeAdapter?.getTrajectoryTopic;

  return {
    ...runtimeAdapter,
    id: definition.id,
    displayName: definition.displayName,
    metadataHints: definition.metadataHints,
    markerValues: definition.markerValues,
    capabilities: definition.capabilities,
    mqttTopics: definition.mqttTopics,
    runtimeSupported: definition.runtimeSupported && Boolean(runtimeAdapter?.runtimeSupported),
    ...(getTrajectoryTopic ? { getTrajectoryTopic } : {}),
  };
});

const PROFILE_BY_ID = new Map(PROFILES.map((profile) => [profile.id, profile]));

const PROFILE_SOURCE_PRIORITY = {
  signature: 1,
  override: 2,
  marker: 3,
  metadata: 4,
} as const;

const DEVICE_PROFILE_SUFFIX = "_device_profile";

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const normalizeMacAddress = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const compact = value.trim().replace(/[^a-fA-F0-9]/g, "");
  if (compact.length !== 12) {
    return undefined;
  }
  return compact.match(/.{1,2}/g)?.join(":").toUpperCase();
};

const extractMacFromDevice = (device?: HaDeviceRegistryEntry): string | undefined => {
  if (!device) {
    return undefined;
  }
  const pairs = [...(device.connections ?? []), ...(device.identifiers ?? [])];
  for (const [, value] of pairs) {
    const mac = normalizeMacAddress(value);
    if (mac) {
      return mac;
    }
  }
  return undefined;
};

const objectIdFromEntityId = (entityId: string) => entityId.split(".", 2)[1] ?? "";

const resolveStatusFromStates = (relatedStates: HaEntityState[]): "online" | "offline" =>
  relatedStates.some((state) => {
    const normalized = state.state.toLowerCase();
    return normalized !== "unknown" && normalized !== "unavailable" && normalized !== "";
  })
    ? "online"
    : "offline";

const resolveStatusForPrefix = (
  prefix: string,
  relatedStates: HaEntityState[],
): "online" | "offline" => {
  const expectedObjectId = `${prefix}_online`;
  const onlineState = relatedStates.find((state) => {
    const objectId = objectIdFromEntityId(state.entity_id);
    return state.entity_id.startsWith("binary_sensor.") && objectId.replace(/_\d+$/, "") === expectedObjectId;
  });
  if (onlineState) {
    const normalized = onlineState.state.toLowerCase();
    return normalized === "on" || normalized === "online" || normalized === "true" ? "online" : "offline";
  }
  return resolveStatusFromStates(relatedStates);
};

const selectDeviceIdForPrefix = (
  prefix: string,
  context: ProfileDiscoveryContext,
): string | undefined => {
  const counts = new Map<string, number>();
  for (const state of context.states) {
    const objectId = objectIdFromEntityId(state.entity_id);
    if (!objectId.startsWith(`${prefix}_`)) {
      continue;
    }
    const deviceId = context.entityRegistry.get(state.entity_id)?.device_id;
    if (deviceId) {
      counts.set(deviceId, (counts.get(deviceId) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
};

const resolveRelatedStates = (
  prefix: string,
  deviceId: string | undefined,
  context: ProfileDiscoveryContext,
): HaEntityState[] =>
  context.states.filter((state) => {
    const objectId = objectIdFromEntityId(state.entity_id);
    if (!objectId.startsWith(`${prefix}_`)) {
      return false;
    }
    return !deviceId || context.entityRegistry.get(state.entity_id)?.device_id === deviceId;
  });

const matchesCandidate = (left: ProfileDiscoveryCandidate, right: ProfileDiscoveryCandidate): boolean => {
  if (left.deviceId || right.deviceId) {
    return left.deviceId === right.deviceId && left.prefix === right.prefix;
  }
  return left.prefix === right.prefix;
};

const candidatePriority = (candidate: ProfileDiscoveryCandidate): number => PROFILE_SOURCE_PRIORITY[candidate.profileSource];

const upsertCandidate = (
  candidates: ProfileDiscoveryCandidate[],
  nextCandidate: ProfileDiscoveryCandidate,
): void => {
  const index = candidates.findIndex((current) => matchesCandidate(current, nextCandidate));
  if (index === -1) {
    candidates.push(nextCandidate);
    return;
  }

  const current = candidates[index];
  if (candidatePriority(nextCandidate) >= candidatePriority(current)) {
    candidates[index] = {
      ...current,
      ...nextCandidate,
      score: Math.max(current.score, nextCandidate.score),
      entityCount: Math.max(current.entityCount, nextCandidate.entityCount),
    };
    return;
  }

  candidates[index] = {
    ...nextCandidate,
    ...current,
    score: Math.max(current.score, nextCandidate.score),
    entityCount: Math.max(current.entityCount, nextCandidate.entityCount),
  };
};

const buildCandidateFromPrefix = (
  context: ProfileDiscoveryContext,
  profileId: MmwaveProfileId,
  prefix: string,
  profileSource: ProfileSource,
  seed?: Partial<ProfileDiscoveryCandidate>,
): ProfileDiscoveryCandidate | null => {
  if (!prefix) {
    return null;
  }

  const profile = PROFILE_BY_ID.get(profileId);
  if (!profile) {
    return null;
  }

  const resolvedDeviceId = seed?.deviceId ?? selectDeviceIdForPrefix(prefix, context);
  const relatedStates = resolveRelatedStates(prefix, resolvedDeviceId, context);
  const device = resolvedDeviceId ? context.deviceRegistry.get(resolvedDeviceId) : undefined;
  const name = normalizeOptionalString(device?.name_by_user) ?? normalizeOptionalString(device?.name) ?? prefix;
  const model = normalizeOptionalString(device?.model) ?? profile.displayName;
  const manufacturer = normalizeOptionalString(device?.manufacturer);
  const firmwareVersion = normalizeOptionalString(device?.sw_version);
  const deploymentName = device?.area_id ? context.areaRegistry.get(device.area_id) : undefined;

  return {
    profileId,
    profileSource,
    profileStatus: profile.runtimeSupported ? "resolved" : "unsupported",
    prefix,
    score: seed?.score ?? Math.max(relatedStates.length, 1),
    status: seed?.status ?? resolveStatusFromStates(relatedStates),
    deviceId: resolvedDeviceId,
    deviceName: seed?.deviceName ?? name,
    deploymentName: seed?.deploymentName ?? deploymentName,
    manufacturer: seed?.manufacturer ?? manufacturer,
    deviceModel: seed?.deviceModel ?? model,
    firmwareVersion: seed?.firmwareVersion ?? firmwareVersion,
    macAddress: seed?.macAddress ?? extractMacFromDevice(device),
    entityCount: seed?.entityCount ?? relatedStates.length,
  };
};

const matchSignatureEntity = (
  entityId: string,
  signatures: ProfileSignatureEntityDefinition[],
): { prefix: string; signature: ProfileSignatureEntityDefinition } | null => {
  const [domain, objectId] = entityId.split(".", 2);
  if (!domain || !objectId) {
    return null;
  }

  for (const signature of signatures) {
    if (signature.domain !== domain) {
      continue;
    }

    const signatureSuffix = `_${signature.slug}`;
    let normalizedObjectId = objectId;
    if (!normalizedObjectId.endsWith(signatureSuffix)) {
      // Home Assistant appends _2, _3, ... when another integration already owns the entity id.
      normalizedObjectId = normalizedObjectId.replace(/_\d+$/, "");
      if (!normalizedObjectId.endsWith(signatureSuffix)) {
        continue;
      }
    }

    return {
      prefix: normalizedObjectId.slice(0, normalizedObjectId.length - signatureSuffix.length),
      signature,
    };
  }

  return null;
};

const discoverByConfiguredSignatures = (
  context: ProfileDiscoveryContext,
  logger?: Logger,
): ProfileDiscoveryCandidate[] => {
  const candidates: ProfileDiscoveryCandidate[] = [];
  const entityIds = new Set([
    ...context.states.map((state) => state.entity_id),
    ...context.entityRegistryEntries.map((entry) => entry.entity_id),
  ]);

  for (const definition of PROFILE_DEFINITIONS) {
    const signatures = [...definition.entitySignature.entities].sort((left, right) => right.slug.length - left.slug.length);
    if (!signatures.length) {
      continue;
    }

    const matchedGroups = new Map<
      string,
      { prefix: string; deviceId?: string; matches: Set<string>; entityIds: Set<string> }
    >();
    for (const entityId of entityIds) {
      const match = matchSignatureEntity(entityId, signatures);
      if (!match) {
        continue;
      }

      const deviceId = context.entityRegistry.get(entityId)?.device_id ?? undefined;
      const groupKey = deviceId ? `${deviceId}\u0000${match.prefix}` : `prefix\u0000${match.prefix}`;
      const key = `${match.signature.domain}.${match.signature.slug}`;
      const group = matchedGroups.get(groupKey) ?? {
        prefix: match.prefix,
        deviceId,
        matches: new Set<string>(),
        entityIds: new Set<string>(),
      };
      group.matches.add(key);
      group.entityIds.add(entityId);
      matchedGroups.set(groupKey, group);
    }

    for (const group of matchedGroups.values()) {
      const matchedSignatures = [...group.matches].sort();
      const accepted = group.matches.size >= definition.entitySignature.minScore;
      logger?.info({
        profileId: definition.id,
        deviceId: group.deviceId ?? null,
        prefix: group.prefix,
        matchedCount: group.matches.size,
        requiredCount: definition.entitySignature.minScore,
        matchedSignatures,
        matchedEntityCount: group.entityIds.size,
        accepted,
      }, "mmWave profile signature evaluated");

      if (!accepted) {
        continue;
      }

      const deviceId = group.deviceId ?? selectDeviceIdForPrefix(group.prefix, context);
      const relatedStates = resolveRelatedStates(group.prefix, deviceId, context);
      const candidate = buildCandidateFromPrefix(context, definition.id, group.prefix, "signature", {
        score: group.matches.size,
        status: resolveStatusForPrefix(group.prefix, relatedStates),
        deviceId,
        entityCount: group.entityIds.size,
      });
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
};

const resolveProfileFromMetadata = (device: HaDeviceRegistryEntry): MmwaveProfileId | null => {
  const haystack = [device.manufacturer, device.model, device.hw_version, device.sw_version]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (!haystack) {
    return null;
  }

  for (const profile of PROFILES) {
    if (profile.metadataHints.some((hint) => haystack.includes(hint.toLowerCase()))) {
      return profile.id;
    }
  }
  return null;
};

export const listMmwaveProfiles = (): readonly MmwaveProfileAdapter[] => PROFILES;

export const getMmwaveProfile = (profileId: string): MmwaveProfileAdapter | null =>
  isMmwaveProfileId(profileId) ? PROFILE_BY_ID.get(profileId) ?? null : null;

export const buildProfileDiscoveryContext = async (client: HaClient): Promise<ProfileDiscoveryContext> => {
  const [states, entityRegistryEntries, deviceRegistryEntries, areaRegistryEntries] = await Promise.all([
    client.getAllStates(),
    client.getEntityRegistry(),
    client.getDeviceRegistry(),
    client.getAreaRegistry(),
  ]);

  return {
    states,
    statesById: new Map(states.map((state) => [state.entity_id, state])),
    entityRegistryEntries,
    entityRegistry: new Map(entityRegistryEntries.map((entry) => [entry.entity_id, entry])),
    deviceRegistryEntries,
    deviceRegistry: new Map(deviceRegistryEntries.map((entry) => [entry.id, entry])),
    areaRegistryEntries,
    areaRegistry: new Map(areaRegistryEntries.map((entry) => [entry.id, normalizeOptionalString(entry.name)])),
  };
};

export const resolveDiscoveredProfiles = async (
  client: HaClient,
  existingDevices: StoredMmwaveDevice[] = [],
  logger?: Logger,
): Promise<ProfileDiscoveryCandidate[]> => {
  const context = await buildProfileDiscoveryContext(client);
  const candidates: ProfileDiscoveryCandidate[] = [];

  logger?.info({
    stateCount: context.states.length,
    entityRegistryCount: context.entityRegistryEntries.length,
    deviceRegistryCount: context.deviceRegistryEntries.length,
    existingDeviceCount: existingDevices.length,
  }, "mmWave discovery source data loaded");

  for (const candidate of discoverByConfiguredSignatures(context, logger)) {
    upsertCandidate(candidates, candidate);
  }

  for (const state of context.states) {
    const objectId = objectIdFromEntityId(state.entity_id);
    if (!objectId.endsWith(DEVICE_PROFILE_SUFFIX)) {
      continue;
    }

    const markerValue = typeof state.state === "string" ? state.state.trim().toLowerCase() : "";
    if (!isMmwaveProfileId(markerValue)) {
      continue;
    }

    const prefix = objectId.slice(0, objectId.length - DEVICE_PROFILE_SUFFIX.length);
    const markerCandidate = buildCandidateFromPrefix(context, markerValue, prefix, "marker", {
      deviceId: context.entityRegistry.get(state.entity_id)?.device_id ?? undefined,
    });
    if (markerCandidate) {
      upsertCandidate(candidates, markerCandidate);
    }
  }

  for (const device of context.deviceRegistryEntries) {
    const profileId = resolveProfileFromMetadata(device);
    if (!profileId) {
      continue;
    }

    const existingCandidate = candidates.find((candidate) => candidate.deviceId === device.id);
    if (!existingCandidate) {
      continue;
    }

    const metadataCandidate = buildCandidateFromPrefix(context, profileId, existingCandidate.prefix, "metadata", {
      ...existingCandidate,
      deviceId: device.id,
    });
    if (metadataCandidate) {
      upsertCandidate(candidates, metadataCandidate);
    }
  }

  for (const stored of existingDevices) {
    if (!stored.profileOverride || !isMmwaveProfileId(stored.profileOverride)) {
      continue;
    }

    const existingCandidate = candidates.find(
      (candidate) =>
        (stored.haDeviceId && candidate.deviceId === stored.haDeviceId) ||
        (stored.macAddress !== "Unknown" && candidate.macAddress === stored.macAddress) ||
        candidate.prefix === stored.prefix,
    );
    if (!existingCandidate) {
      continue;
    }

    const overrideCandidate = buildCandidateFromPrefix(context, stored.profileOverride, existingCandidate.prefix, "override", {
      ...existingCandidate,
      deviceId: existingCandidate.deviceId ?? stored.haDeviceId,
      macAddress: existingCandidate.macAddress ?? stored.macAddress,
    });
    if (overrideCandidate) {
      upsertCandidate(candidates, overrideCandidate);
    }
  }

  const sortedCandidates = candidates.sort((left, right) => right.score - left.score || left.prefix.localeCompare(right.prefix));
  logger?.info({
    candidateCount: sortedCandidates.length,
    candidates: sortedCandidates.map((candidate) => ({
      deviceId: candidate.deviceId ?? null,
      prefix: candidate.prefix,
      profileId: candidate.profileId,
      profileSource: candidate.profileSource,
      profileStatus: candidate.profileStatus,
      status: candidate.status,
      score: candidate.score,
      entityCount: candidate.entityCount,
      name: candidate.deviceName,
    })),
  }, "mmWave profile discovery completed");
  return sortedCandidates;
};
