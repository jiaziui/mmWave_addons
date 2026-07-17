import type { Logger } from "pino";
import { WebSocket } from "ws";
import type { DeviceLogEntry } from "../types/mmwave";

export type LiveSubscription = { scope: "overview" } | { scope: "device"; deviceId: string };

type SubscribedMessage = { type: "subscribed"; scope: LiveSubscription["scope"] };
type RefreshOverviewMessage = { type: "refresh"; scope: "overview" };
type RefreshDeviceMessage = { type: "refresh"; scope: "device"; deviceId: string };
type LogEventMessage = { type: "log_event"; scope: "device"; deviceId: string; persisted: boolean; entry: DeviceLogEntry };
type ErrorMessage = { type: "error"; error: string };
type LiveMessage = SubscribedMessage | RefreshOverviewMessage | RefreshDeviceMessage | LogEventMessage | ErrorMessage;

export class LiveHub {
  private readonly subscriptions = new Map<WebSocket, LiveSubscription>();

  constructor(private readonly logger: Logger) {}

  attach(ws: WebSocket): void {
    ws.on("message", (raw) => {
      this.handleMessage(ws, raw.toString("utf8"));
    });
    ws.on("close", () => {
      this.subscriptions.delete(ws);
    });
    ws.on("error", () => {
      this.subscriptions.delete(ws);
    });
  }

  notifyOverview(): void {
    this.broadcast({ type: "refresh", scope: "overview" });
  }

  notifyDevice(deviceId: string): void {
    this.broadcast({ type: "refresh", scope: "device", deviceId });
  }

  notifyDeviceLog(deviceId: string, entry: DeviceLogEntry, persisted: boolean): void {
    this.broadcast({ type: "log_event", scope: "device", deviceId, entry, persisted });
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    try {
      const message = JSON.parse(raw) as {
        type?: string;
        scope?: LiveSubscription["scope"];
        deviceId?: string;
      };

      if (message.type !== "subscribe") {
        this.send(ws, { type: "error", error: "Invalid message type" });
        return;
      }

      const subscription =
        message.scope === "overview"
          ? { scope: "overview" as const }
          : message.deviceId
            ? { scope: "device" as const, deviceId: message.deviceId }
            : null;

      if (!subscription) {
        this.send(ws, { type: "error", error: "Missing subscription target" });
        return;
      }

      this.subscriptions.set(ws, subscription);
      this.send(ws, { type: "subscribed", scope: subscription.scope });
    } catch {
      this.send(ws, { type: "error", error: "Invalid message" });
    }
  }

  private broadcast(message: LiveMessage): void {
    for (const [ws, subscription] of this.subscriptions) {
      if (message.type === "refresh" || message.type === "log_event") {
        if (message.scope === "overview" && subscription.scope !== "overview") {
          continue;
        }
        if (message.scope === "device" && (subscription.scope !== "device" || subscription.deviceId !== message.deviceId)) {
          continue;
        }
      }
      this.send(ws, message);
    }
  }

  private send(ws: WebSocket, message: LiveMessage): void {
    if (ws.readyState !== WebSocket.OPEN) {
      this.subscriptions.delete(ws);
      return;
    }
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      this.subscriptions.delete(ws);
      this.logger.warn({ error }, "Failed to send live websocket message");
    }
  }
}
