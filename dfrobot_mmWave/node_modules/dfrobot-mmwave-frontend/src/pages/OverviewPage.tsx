import type { MmwaveOverviewDeviceCard, MmwaveOverviewMetrics } from "../api/client";
import { RadarCanvas } from "../components/RadarCanvas";

const stats = [
  { key: "deviceCount", label: "总设备数", suffix: "台" },
  { key: "peopleCount", label: "当前总人数", suffix: "人" },
  { key: "targetCount", label: "当前运动总人数", suffix: "人" },
  { key: "staticCount", label: "当前静止总人数", suffix: "人" },
] as const;

export function OverviewPage({
  metrics,
  devices,
  onOpenDevice,
}: {
  metrics: MmwaveOverviewMetrics;
  devices: MmwaveOverviewDeviceCard[];
  onOpenDevice: (deviceId: string) => void;
}) {
  return (
    <section className="page overview-page">
      <div className="stats-grid">
        {stats.map((item) => (
          <article className="stat-card" key={item.key}>
            <span>{item.label}</span>
            <strong>{metrics[item.key]}<small>{item.suffix}</small></strong>
          </article>
        ))}
      </div>

      <section className="panel overview-monitor-panel">
        <div className="panel-header">
          <div>
            <h3>实时监控矩阵</h3>
          </div>
        </div>
        {devices.length ? (
          <div className="device-grid">
            {devices.map((device) => (
              <button className="device-card" type="button" key={device.id} onClick={() => onOpenDevice(device.id)}>
                <div className="device-card-head">
                  <div>
                    <strong>{device.name}</strong>
                    <span className="device-card-deployment">
                      {device.deploymentName?.trim() || "未设置部署位置"}
                    </span>
                  </div>
                  <small>{device.online ? "ONLINE" : "OFFLINE"}</small>
                </div>
                <RadarCanvas
                  deviceId={device.id}
                  coordinate={device.coordinate}
                  rangeBox={device.rangeBox}
                  detection={device.detection}
                  regions={device.regions}
                  targets={device.targets}
                  backgroundInstances={device.backgroundInstances}
                  viewPreferences={device.viewPreferences}
                />
                <div className="device-card-foot">
                  <span>总人数 {device.peopleCount}</span>
                  <span>运动 {device.targetCount}</span>
                  <span>静止 {device.staticCount}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-inline">还没有已绑定设备，请先进入设备管理完成扫描与初始化。</div>
        )}
      </section>
    </section>
  );
}
