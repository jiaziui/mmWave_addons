import type { DeviceLogEntry } from "../api/client";
import type { MessageParams } from "../i18n/types";

type Translate = (key: string, params?: MessageParams) => string;

/** Build locale-aware log body from structured fields; fall back to stored message. */
export const formatDeviceLogMessage = (entry: DeviceLogEntry, t: Translate): string => {
  const index = entry.regionIndex + 1;
  const label = entry.regionLabel;

  if (entry.eventType === "status_changed") {
    const moving = entry.movingCount;
    const staticCount = entry.staticCount;
    const total = entry.totalCount ?? (
      Number.isFinite(moving) && Number.isFinite(staticCount)
        ? Number(moving) + Number(staticCount)
        : undefined
    );
    if (Number.isFinite(moving) && Number.isFinite(staticCount) && Number.isFinite(total)) {
      return t("logs.message.status_changed", {
        index,
        label,
        moving: Number(moving),
        static: Number(staticCount),
        total: Number(total),
      });
    }
  }

  if (
    entry.eventType === "approach"
    || entry.eventType === "away"
    || entry.eventType === "enter"
    || entry.eventType === "exit"
  ) {
    return t(`logs.message.${entry.eventType}`, { index, label });
  }

  return entry.message;
};
