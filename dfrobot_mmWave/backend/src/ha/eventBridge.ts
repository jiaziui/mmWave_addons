import type { Logger } from "pino";
import { WebSocket } from "ws";
import type { StoredMmwaveDevice } from "../config/storage";
import { getDefinition, matchesDefinition, resolveEntityId } from "../domain/profiles/profileRuntime";
import type { HaClient } from "./client";
import type { HaConfig, HaEntityRegistryEntry } from "./types";

const RECONNECT_DELAY_MS = 5000;
const ROUTE_REFRESH_MS = 60000;
const SUBSCRIPTION_ID = 1;
const IO_STATE_KEYS = [
  "zone1Presence",
  "zone2Presence",
  "zone3Presence",
  "zone4Presence",
  "zone5Presence",
  "zone6Presence",
] as const;

interface HaEventBridgeCallbacks {
  getDevices: () => StoredMmwaveDevice[];
  onDeviceStateChanged: (deviceId: string, entityId: string) => void;
}

interface HaWebSocketMessage {
  type?: string;
  success?: boolean;
  event?: {
    event_type?: string;
    data?: {
      entity_id?: string;
    };
  };
}

export const buildHaWebSocketUrl = (config: HaConfig): string => {
  const url = new URL(config.baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const path = url.pathname.replace(/\/+$/, "");
  if (config.mode === "supervisor") {
    url.pathname = path.replace(/\/api$/, "/websocket");
  } else if (path.endsWith("/api")) {
    url.pathname = `${path}/websocket`;
  } else {
    url.pathname = `${path}/api/websocket`;
  }
  url.search = "";
  url.hash = "";
  return url.toString();
};

const isIoStateEntity = (entityId: string): boolean =>
  IO_STATE_KEYS.some((key) => {
    const definition = getDefinition(key);
    return definition ? matchesDefinition(entityId, definition) : false;
  });

export class HaEventBridge {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private routeRefreshTimer: NodeJS.Timeout | null = null;
  private stopped = true;
  private readonly entityRoutes = new Map<string, string>();

  constructor(
    private readonly config: HaConfig,
    private readonly client: HaClient,
    private readonly logger: Logger,
    private readonly callbacks: HaEventBridgeCallbacks,
  ) {}

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.connect();
    this.routeRefreshTimer = setInterval(() => void this.refreshEntityRoutes(), ROUTE_REFRESH_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.routeRefreshTimer) {
      clearInterval(this.routeRefreshTimer);
      this.routeRefreshTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }
    const socket = new WebSocket(buildHaWebSocketUrl(this.config));
    this.socket = socket;
    socket.on("message", (raw) => this.handleMessage(raw.toString("utf8")));
    socket.on("error", (error) => {
      this.logger.warn({ error }, "Home Assistant event websocket error");
    });
    socket.on("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.scheduleReconnect();
    });
  }

  private handleMessage(raw: string): void {
    let message: HaWebSocketMessage;
    try {
      message = JSON.parse(raw) as HaWebSocketMessage;
    } catch {
      return;
    }

    if (message.type === "auth_required") {
      this.send({ type: "auth", access_token: this.config.token });
      return;
    }
    if (message.type === "auth_ok") {
      this.send({ id: SUBSCRIPTION_ID, type: "subscribe_events", event_type: "state_changed" });
      void this.refreshEntityRoutes();
      return;
    }
    if (message.type === "auth_invalid") {
      this.logger.error("Home Assistant event websocket authentication failed");
      this.socket?.close();
      return;
    }
    if (message.type === "result" && message.success === true) {
      this.logger.info("Home Assistant state_changed event subscription active");
      return;
    }
    if (message.type !== "event" || message.event?.event_type !== "state_changed") {
      return;
    }

    const entityId = message.event.data?.entity_id;
    if (!entityId || !isIoStateEntity(entityId)) {
      return;
    }
    const deviceId = this.entityRoutes.get(entityId);
    if (deviceId) {
      this.callbacks.onDeviceStateChanged(deviceId, entityId);
      return;
    }

    // A device may have been discovered or an entity renamed after startup.
    void this.refreshEntityRoutes().then(() => {
      const refreshedDeviceId = this.entityRoutes.get(entityId);
      if (refreshedDeviceId) {
        this.callbacks.onDeviceStateChanged(refreshedDeviceId, entityId);
      }
    });
  }

  private async refreshEntityRoutes(): Promise<void> {
    let entries: HaEntityRegistryEntry[];
    try {
      entries = await this.client.getEntityRegistry();
    } catch (error) {
      this.logger.warn({ error }, "Failed to refresh Home Assistant IO entity routes");
      return;
    }

    const nextRoutes = new Map<string, string>();
    for (const device of this.callbacks.getDevices()) {
      for (const key of IO_STATE_KEYS) {
        const definition = getDefinition(key);
        if (!definition) {
          continue;
        }
        const entityId = resolveEntityId(device, definition, entries);
        if (entries.some((entry) => entry.entity_id === entityId)) {
          nextRoutes.set(entityId, device.id);
        }
      }
    }
    this.entityRoutes.clear();
    for (const [entityId, deviceId] of nextRoutes) {
      this.entityRoutes.set(entityId, deviceId);
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }
}
