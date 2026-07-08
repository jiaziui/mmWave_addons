export type HaMode = "supervisor" | "standalone";

export interface HaConfig {
  mode: HaMode;
  baseUrl: string;
  token: string;
}

export interface HaEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export interface HaEntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  disabled_by?: string | null;
}

export interface HaAreaRegistryEntry {
  id: string;
  name: string | null;
}

export interface HaDeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  sw_version?: string | null;
  hw_version?: string | null;
  area_id?: string | null;
  connections?: Array<[string, string]>;
  identifiers?: Array<[string, string]>;
}
