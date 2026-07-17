import fs from "node:fs";
import path from "node:path";
import type { MmwaveProfileId } from "../../types/profiles";
import type { MmwaveProfileAdapter } from "./contracts";

export interface ProfileSignatureEntityDefinition {
  domain: string;
  slug: string;
}

export interface ProfileCatalogDefinition {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resolveDeviceProfileDir = (): string => {
  if (process.env.DEVICE_PROFILE_DIR?.trim()) {
    return path.resolve(process.env.DEVICE_PROFILE_DIR.trim());
  }
  // backend/src|dist/domain/profiles -> addon root/config/device
  return path.resolve(__dirname, "../../../../config/device");
};

const normalizeDefinition = (value: unknown, fallbackId: string): ProfileCatalogDefinition | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : fallbackId;
  if (!id || id === "unknown") {
    return null;
  }
  if (!isRecord(value.capabilities) || !isRecord(value.mqttTopics) || !isRecord(value.entitySignature)) {
    return null;
  }
  const entities = Array.isArray(value.entitySignature.entities) ? value.entitySignature.entities : [];
  return {
    id,
    displayName: typeof value.displayName === "string" && value.displayName.trim() ? value.displayName.trim() : id,
    metadataHints: Array.isArray(value.metadataHints)
      ? value.metadataHints.filter((item): item is string => typeof item === "string")
      : [],
    markerValues: Array.isArray(value.markerValues)
      ? value.markerValues.filter((item): item is string => typeof item === "string")
      : [],
    runtimeSupported: value.runtimeSupported !== false,
    capabilities: value.capabilities as unknown as ProfileCatalogDefinition["capabilities"],
    mqttTopics: value.mqttTopics as unknown as ProfileCatalogDefinition["mqttTopics"],
    entitySignature: {
      minScore: typeof value.entitySignature.minScore === "number" ? value.entitySignature.minScore : 1,
      entities: entities
        .filter(isRecord)
        .map((entity) => ({
          domain: typeof entity.domain === "string" ? entity.domain : "",
          slug: typeof entity.slug === "string" ? entity.slug : "",
        }))
        .filter((entity) => entity.domain && entity.slug),
    },
  };
};

const definitionsFromFile = (filePath: string, fallbackId: string): ProfileCatalogDefinition[] => {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (isRecord(raw) && Array.isArray(raw.profiles)) {
    return raw.profiles
      .map((item) => normalizeDefinition(item, fallbackId))
      .filter((item): item is ProfileCatalogDefinition => item !== null);
  }
  const single = normalizeDefinition(raw, fallbackId);
  return single ? [single] : [];
};

/** Load every `*.json` under addon `config/device/` (one device profile per file). */
export const loadDeviceProfileDefinitions = (): ProfileCatalogDefinition[] => {
  const dir = resolveDeviceProfileDir();
  if (!fs.existsSync(dir)) {
    throw new Error(`Device profile directory not found: ${dir}`);
  }

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const definitions: ProfileCatalogDefinition[] = [];
  const seen = new Set<string>();

  for (const fileName of files) {
    const filePath = path.join(dir, fileName);
    const fallbackId = path.basename(fileName, path.extname(fileName));
    for (const definition of definitionsFromFile(filePath, fallbackId)) {
      if (seen.has(definition.id)) {
        throw new Error(`Duplicate device profile id "${definition.id}" in ${filePath}`);
      }
      seen.add(definition.id);
      definitions.push(definition);
    }
  }

  if (definitions.length === 0) {
    throw new Error(`No device profile JSON found in ${dir}`);
  }

  return definitions;
};
