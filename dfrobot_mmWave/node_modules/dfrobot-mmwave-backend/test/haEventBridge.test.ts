import { describe, expect, it } from "vitest";
import { buildHaWebSocketUrl } from "../src/ha/eventBridge";

describe("Home Assistant event websocket URL", () => {
  it("uses the Supervisor core websocket proxy", () => {
    expect(buildHaWebSocketUrl({
      mode: "supervisor",
      baseUrl: "http://supervisor/core/api",
      token: "token",
    })).toBe("ws://supervisor/core/websocket");
  });

  it("uses the native Home Assistant websocket endpoint", () => {
    expect(buildHaWebSocketUrl({
      mode: "standalone",
      baseUrl: "https://ha.example.com/api",
      token: "token",
    })).toBe("wss://ha.example.com/api/websocket");
  });
});
