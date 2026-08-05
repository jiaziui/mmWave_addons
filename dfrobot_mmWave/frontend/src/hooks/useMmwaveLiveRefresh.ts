import { useEffect, useRef } from "react";
import { ingressAware, isLocalMockMode } from "../api/client";
import type { DeviceLogEntry } from "../api/client";

type LiveScope = { scope: "overview" } | { scope: "device"; deviceId: string } | null;

export function useMmwaveLiveRefresh(
  scope: LiveScope,
  onRefresh: (scope: Exclude<LiveScope, null>) => void,
  onError?: (message: string) => void,
  onLogEvent?: (deviceId: string, entry: DeviceLogEntry, persisted: boolean) => void,
): void {
  const onRefreshRef = useRef(onRefresh);
  const onErrorRef = useRef(onError);
  const onLogEventRef = useRef(onLogEvent);
  const activeScopeRef = useRef(scope);

  onRefreshRef.current = onRefresh;
  onErrorRef.current = onError;
  onLogEventRef.current = onLogEvent;
  activeScopeRef.current = scope;

  useEffect(() => {
    if (!scope || isLocalMockMode()) {
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) {
        return;
      }

      const url = new URL(ingressAware("api/live/ws"), window.location.href).toString();
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "subscribe", ...scope }));
        }
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as {
            type?: string;
            scope?: "overview" | "device";
            deviceId?: string;
            error?: string;
            persisted?: boolean;
            entry?: DeviceLogEntry;
          };
          const activeScope = activeScopeRef.current;
          if (!activeScope) {
            return;
          }

          if (message.type === "refresh") {
            if (message.scope !== activeScope.scope) {
              return;
            }
            if (activeScope.scope === "device" && message.deviceId !== activeScope.deviceId) {
              return;
            }
            onRefreshRef.current(activeScope);
            return;
          }

          if (message.type === "log_event") {
            if (activeScope.scope !== "device" || message.scope !== "device" || message.deviceId !== activeScope.deviceId || !message.entry) {
              return;
            }
            onLogEventRef.current?.(message.deviceId, message.entry, message.persisted === true);
            return;
          }

          if (message.type === "error") {
            onErrorRef.current?.(message.error ?? "实时更新失败");
          }
        } catch {
          onErrorRef.current?.("实时更新失败");
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (cancelled) {
          return;
        }
        reconnectTimer = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [scope?.scope, scope?.scope === "device" ? scope.deviceId : undefined]);
}
