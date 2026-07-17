import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeviceLogPanel } from "./DeviceLogPanel";

const { fetchCalendar, fetchLogs } = vi.hoisted(() => ({
  fetchCalendar: vi.fn(async (_deviceId: string, year: number, month: number) => ({ ok: true, year, month, years: [2026], months: [7], days: [14] })),
  fetchLogs: vi.fn(async (_deviceId: string, date: string, page: number, pageSize: number) => ({
  ok: true,
  date,
  page,
  pageSize,
  total: 1,
  hasMore: false,
  logs: [{ occurredAt: "2026-07-14T03:23:00.000Z", localDate: "2026-07-14", deviceName: "c4004_0", deploymentName: "厨房", regionIndex: 0, regionLabel: "办公区", regionType: "status_detection" as const, eventType: "status_changed" as const, movingCount: 1, staticCount: 2, totalCount: 3, message: "1号办公区当前运动人数为1人，静止人数为2人，总人数为3人" }],
  })),
}));

vi.mock("../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client")>()),
  fetchDeviceLogCalendar: fetchCalendar,
  fetchDeviceLogs: fetchLogs,
}));

describe("DeviceLogPanel", () => {
  it("loads the latest date and keeps history visible while offline", async () => {
    render(<DeviceLogPanel deviceId="device-a" online={false} refreshToken={0} onError={vi.fn()} />);
    expect(screen.getByText("设备当前离线，暂无新的区域事件，历史日志仍可查看。")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1号办公区当前运动人数为1人，静止人数为2人，总人数为3人")).toBeInTheDocument());
    expect(fetchLogs).toHaveBeenCalledWith("device-a", "2026-07-14", 1, 50);
    expect(screen.getByText("第 1 页 · 共 1 条")).toBeInTheDocument();
  });
});
