import type { MmwaveOverviewDeviceCard, MmwaveOverviewMetrics } from "../api/client";
import { RadarCanvas } from "../components/RadarCanvas";
import { useLocale } from "../i18n/LocaleContext";

export function OverviewPage({
  metrics,
  devices,
  onOpenDevice,
}: {
  metrics: MmwaveOverviewMetrics;
  devices: MmwaveOverviewDeviceCard[];
  onOpenDevice: (deviceId: string) => void;
}) {
  const { t } = useLocale();
  const stats = [
    { key: "deviceCount" as const, labelKey: "overview.stat.deviceCount", suffixKey: "overview.stat.unit.device" },
    { key: "liveCount" as const, labelKey: "overview.stat.liveCount", suffixKey: "overview.stat.unit.people" },
    { key: "targetCount" as const, labelKey: "overview.stat.targetCount", suffixKey: "overview.stat.unit.people" },
    { key: "staticCount" as const, labelKey: "overview.stat.staticCount", suffixKey: "overview.stat.unit.people" },
  ];

  return (
    <section className="page overview-page">
      <div className="stats-grid">
        {stats.map((item) => (
          <article className="stat-card" key={item.key}>
            <span>{t(item.labelKey)}</span>
            <strong>
              {metrics[item.key]}
              <small>{t(item.suffixKey)}</small>
            </strong>
          </article>
        ))}
      </div>

      <section className="panel overview-monitor-panel">
        <div className="panel-header">
          <div>
            <h3>{t("overview.monitorTitle")}</h3>
          </div>
        </div>
        {devices.length ? (
          <div className="device-grid">
            {devices.map((device) => (
              <button className="device-card" type="button" key={device.id} onClick={() => onOpenDevice(device.id)}>
                <div className="device-card-head">
                  <div className="device-card-title">
                    <strong>{device.name}</strong>
                    <span className="device-card-deployment">
                      {device.deploymentName?.trim() || t("overview.deploymentUnset")}
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
                  <span>{t("overview.liveCount", { count: device.liveCount })}</span>
                  <span>{t("overview.moving", { count: device.targetCount })}</span>
                  <span>{t("overview.static", { count: device.staticCount })}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-inline">{t("overview.empty")}</div>
        )}
      </section>
    </section>
  );
}
