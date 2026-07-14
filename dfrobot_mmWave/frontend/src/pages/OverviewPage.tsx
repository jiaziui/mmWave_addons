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
  busy,
  stale,
  onRefresh,
  onAddDevice,
  onOpenDevice,
}: {
  metrics: MmwaveOverviewMetrics;
  devices: MmwaveOverviewDeviceCard[];
  busy: boolean;
  stale: boolean;
  onRefresh: () => void;
  onAddDevice: () => void;
  onOpenDevice: (deviceId: string) => void;
}) {
  return (
    <section className="page overview-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>设备总览</h2>
        </div>
        <div className="page-actions">
          {stale ? <span className="data-stale-badge">数据可能已过期</span> : null}
          <button type="button" className="ghost-button" onClick={onRefresh} disabled={busy}>刷新总览</button>
          <button type="button" className="primary-button" onClick={onAddDevice}>添加设备</button>
        </div>
      </header>

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
                  <div><strong>{device.name}</strong></div>
                  <small>{device.online ? "ONLINE" : "OFFLINE"}</small>
                </div>
                <RadarCanvas
                  coordinate={device.coordinate}
                  rangeBox={device.rangeBox}
                  detection={device.detection}
                  regions={device.regions}
                  targets={device.targets}
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
