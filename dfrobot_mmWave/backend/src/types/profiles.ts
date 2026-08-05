/** Known built-in runtime adapters. Discovery also accepts any id from config/device/*.json. */
export const MMWAVE_PROFILE_IDS = ["c4004"] as const;

export type MmwaveProfileId = string;
export type StoredMmwaveProfileId = MmwaveProfileId | "unknown";
export type ProfileSource = "metadata" | "marker" | "override" | "signature";
export type ProfileStatus = "resolved" | "unresolved" | "unsupported";

export interface ProfileCapabilities {
  supportsTrajectory: boolean;
  supportsRegions: boolean;
  supportsInitializeWorkflow: boolean;
  supportsReset: boolean;
  supportsFactoryReset?: boolean;
  supportsMqttBridge: boolean;
}

export interface ProfileMqttTopics {
  component: string;
  trajectoryStateTopic?: string;
  tagEventStateTopic?: string;
  multiTagConfigStateTopic?: string;
  multiTagConfigCommandTopic?: string;
  multiTagConfigResultTopic?: string;
  configFileRangeStateTopic?: string;
  configFileRangeCommandTopic?: string;
  configFileRangeResultTopic?: string;
  learnedTrajectoryRangeStateTopic?: string;
  learnedTrajectoryRangeSetCommandTopic?: string;
  learnedTrajectoryRangeSetResultTopic?: string;
  learnedTrajectoryRangeQueryCommandTopic?: string;
  learnedTrajectoryRangeQueryResultTopic?: string;
}

export const isMmwaveProfileId = (value: unknown): value is MmwaveProfileId =>
  typeof value === "string" && value.trim().length > 0 && value !== "unknown";

export const isStoredMmwaveProfileId = (value: unknown): value is StoredMmwaveProfileId =>
  value === "unknown" || isMmwaveProfileId(value);

export const isProfileSource = (value: unknown): value is ProfileSource =>
  value === "metadata" || value === "marker" || value === "override" || value === "signature";

export const isProfileStatus = (value: unknown): value is ProfileStatus =>
  value === "resolved" || value === "unresolved" || value === "unsupported";
