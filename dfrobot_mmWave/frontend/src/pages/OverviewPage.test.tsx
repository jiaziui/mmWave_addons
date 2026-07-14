import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MmwaveOverviewDeviceCard } from "../api/client";
import { OverviewPage } from "./OverviewPage";

const device: MmwaveOverviewDeviceCard = {
  id: "device-1",
  name: "厨房雷达",
  model: "C4004",
  online: true,
  status: "Online",
  signal: -50,
  peopleCount: 2,
  targetCount: 1,
  staticCount: 1,
  trajectoryAvailable: false,
  mqttConnected: false,
  coordinate: { xMin: -5, xMax: 5, yMin: -1, yMax: 9 },
  rangeBox: { xMin: -3, xMax: 3, yMin: 0, yMax: 6 },
  detection: {
    mode: "rect",
    rectCm: { xMin: -300, xMax: 300, yMin: 0, yMax: 600 },
    learnedPointsCm: [],
    customPointsCm: [],
    customConfirmed: false,
  },
  regions: [],
  targets: [],
};

describe("OverviewPage", () => {
  it("renders aggregate metrics and keeps HA data when MQTT is unavailable", () => {
    const { container } = render(<OverviewPage
      metrics={{ deviceCount: 1, peopleCount: 2, targetCount: 1, staticCount: 1 }}
      devices={[device]}
      busy={false}
      stale
      onRefresh={vi.fn()}
      onAddDevice={vi.fn()}
      onOpenDevice={vi.fn()}
    />);

    expect(screen.getByText("厨房雷达")).toBeInTheDocument();
    expect(container.querySelectorAll(".target-point")).toHaveLength(0);
    expect(screen.getByText("总人数 2")).toBeInTheDocument();
    expect(screen.getByText("数据可能已过期")).toBeInTheDocument();
    expect(screen.getByText("当前总人数").parentElement).toHaveTextContent("2人");
  });
});
