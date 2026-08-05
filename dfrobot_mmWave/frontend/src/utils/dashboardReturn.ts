/**
 * Same Home Assistant browser tab SPA navigation helpers.
 * Dashboard ↔ Addon are route changes via history.pushState + location-changed
 * (same pattern as mmwave-map-card), not a new window/tab.
 */

/** sessionStorage key shared with mmwave_map card (same HA origin / tab). */
export const DASHBOARD_RETURN_STORAGE_KEY = "dfrobot_mmwave_return_path";

const ADDON_PATH_HINTS = [
  "local_mmwave_addons",
  "hassio/ingress",
  "mmwave_addons",
  "api/hassio_ingress",
];

/** HA frontend shell: parent when Addon is in ingress iframe, else current window. */
export const haShellWindow = (): Window => {
  try {
    if (window.parent && window.parent !== window) {
      return window.parent;
    }
  } catch {
    // ignore
  }
  return window;
};

export const isValidHaFrontendPath = (path: string): boolean => {
  const value = path.trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return false;
  }
  const lower = value.toLowerCase();
  return !ADDON_PATH_HINTS.some((hint) => lower.includes(hint));
};

export const saveDashboardReturnPath = (path: string): void => {
  const normalized = path.trim();
  if (!isValidHaFrontendPath(normalized)) {
    return;
  }
  try {
    sessionStorage.setItem(DASHBOARD_RETURN_STORAGE_KEY, normalized);
  } catch {
    // private mode / quota
  }
};

export const readDashboardReturnPath = (): string | null => {
  const candidates: string[] = [];

  const collectReturnParam = (search: string) => {
    try {
      const value = new URLSearchParams(search).get("return");
      if (value) {
        candidates.push(value);
      }
    } catch {
      // ignore
    }
  };

  collectReturnParam(window.location.search);
  try {
    collectReturnParam(haShellWindow().location.search);
  } catch {
    // ignore
  }

  try {
    const stored = sessionStorage.getItem(DASHBOARD_RETURN_STORAGE_KEY);
    if (stored) {
      candidates.push(stored);
    }
  } catch {
    // ignore
  }

  for (const candidate of candidates) {
    let decoded = candidate;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      decoded = candidate;
    }
    if (isValidHaFrontendPath(decoded)) {
      return decoded;
    }
  }
  return null;
};

export const clearDashboardReturnPath = (): void => {
  try {
    sessionStorage.removeItem(DASHBOARD_RETURN_STORAGE_KEY);
  } catch {
    // ignore
  }
};

/** Same-tab HA SPA navigate (identical to Lovelace button navigate / mmwave-map-card). */
export const navigateHomeAssistantPath = (path: string): void => {
  if (!isValidHaFrontendPath(path)) {
    throw new Error("Invalid dashboard path");
  }
  const shell = haShellWindow();
  shell.history.pushState({}, "", path);
  shell.dispatchEvent(
    new CustomEvent("location-changed", {
      detail: { replace: false },
      bubbles: true,
      composed: true,
    }),
  );
};

/** Same-tab history back when no explicit return path was recorded. */
export const navigateHomeAssistantBack = (): boolean => {
  const shell = haShellWindow();
  if (shell.history.length <= 1) {
    return false;
  }
  shell.history.back();
  return true;
};
