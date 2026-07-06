import { useEffect, useMemo, useState } from "react";
import {
  createLiveWsUrl,
  discoverDevices,
  fetchDeviceDetail,
  fetchDevices,
  fetchMeta,
  fetchOverview,
  refreshDevice,
  resetDevice,
  type MetaConfig,
  type MmwaveDeviceDetail,
  type MmwaveOverviewDeviceCard,
  type MmwaveOverviewMetrics,
  type RangeBox,
  type RegionOverlay,
  type StoredMmwaveDevice,
  type TrajectoryPoint,
} from "./api/client";

type View = "overview" | "detail" | "device-management" | "region-management";

const navItems: Array<{ id: Exclude<View, "detail">; label: string; short: string }> = [
  { id: "overview", label: "设备总览", short: "OV" },
  { id: "device-management", label: "设备管理", short: "DM" },
  { id: "region-management", label: "区域管理", short: "RM" },
];

const statsMeta = [
  { key: "deviceCount", label: "总设备数", suffix: "台" },
  { key: "peopleCount", label: "当前总人数", suffix: "人" },
  { key: "targetCount", label: "当前运动总人数", suffix: "人" },
  { key: "staticCount", label: "当前静止总人数", suffix: "人" },
] as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const mapX = (box: RangeBox, value: number) => ((value - box.xMin) / (box.xMax - box.xMin)) * 100;
const mapY = (box: RangeBox, value: number) => 100 - ((value - box.yMin) / (box.yMax - box.yMin)) * 100;

const RadarCanvas = ({
  coordinate,
  rangeBox,
  regions,
  targets,
  large = false,
}: {
  coordinate: RangeBox;
  rangeBox: RangeBox;
  regions: RegionOverlay[];
  targets: TrajectoryPoint[];
  large?: boolean;
}) => {
  const rangeX = clamp(mapX(coordinate, rangeBox.xMin), 0, 100);
  const rangeY = clamp(mapY(coordinate, rangeBox.yMax), 0, 100);
  const rangeWidth = clamp(mapX(coordinate, rangeBox.xMax), 0, 100) - rangeX;
  const rangeHeight = clamp(mapY(coordinate, rangeBox.yMin), 0, 100) - rangeY;

  return (
    <svg className={large ? "radar-canvas radar-canvas-large" : "radar-canvas"} viewBox="0 0 100 100" preserveAspectRatio="none">
      {Array.from({ length: 11 }, (_, index) => (
        <line key={`vx-${index}`} className="grid-line" x1={index * 10} x2={index * 10} y1="0" y2="100" />
      ))}
      {Array.from({ length: 10 }, (_, index) => (
        <line key={`hy-${index}`} className="grid-line" x1="0" x2="100" y1={index * 10} y2={index * 10} />
      ))}
      <rect className="range-box" x={rangeX} y={rangeY} width={Math.max(rangeWidth, 4)} height={Math.max(rangeHeight, 4)} />
      {regions.map((region) => {
        const x = clamp(mapX(coordinate, region.x), 4, 96);
        const y = clamp(mapY(coordinate, region.y), 6, 94);
        return (
          <g className={region.active ? "region-tag region-tag-active" : "region-tag"} key={region.id}>
            <rect x={x - 6} y={y - 4} width="12" height="6" rx="2" />
            <text x={x} y={y}>
              {region.label.replace("区域 ", "Z")}
            </text>
          </g>
        );
      })}

      {targets.map((target) => {
        const x = clamp(mapX(coordinate, target.x), 3, 97);
        const y = clamp(mapY(coordinate, target.y), 3, 97);
        return (
          <g className={`target-point target-point-${target.feature}`} key={`${target.id}-${target.x}-${target.y}`}>
            <circle cx={x} cy={y} r={large ? 1.7 : 1.3} />
            <circle className="target-halo" cx={x} cy={y} r={large ? 3.2 : 2.4} />
          </g>
        );
      })}

      <g className="sensor-icon" transform="translate(50 88)">
        <circle cx="0" cy="0" r={large ? 2.5 : 2.1} />
        <path d="M -9 -1.5 A 9 9 0 0 1 9 -1.5" />
        <path d="M -6 -3.5 A 6 6 0 0 1 6 -3.5" />
        <path d="M -3 -5.3 A 3 3 0 0 1 3 -5.3" />
      </g>
      <text className="axis-label" x="2" y="98">
        X:-5~5m
      </text>
      <text className="axis-label" x="78" y="6">
        Y:0~9m
      </text>
    </svg>
  );
};

function App() {
  const [entered, setEntered] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [meta, setMeta] = useState<MetaConfig | null>(null);
  const [devices, setDevices] = useState<StoredMmwaveDevice[]>([]);
  const [metrics, setMetrics] = useState<MmwaveOverviewMetrics>({
    deviceCount: 0,
    peopleCount: 0,
    targetCount: 0,
    staticCount: 0,
  });
  const [overviewCards, setOverviewCards] = useState<MmwaveOverviewDeviceCard[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MmwaveDeviceDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  const loadMeta = async () => {
    setMeta(await fetchMeta());
  };

  const loadDevices = async () => {
    const response = await fetchDevices();
    setDevices(response.devices);
  };

  const loadOverview = async () => {
    const response = await fetchOverview();
    setMetrics(response.metrics);
    setOverviewCards(response.devices);
  };

  const loadDetail = async (deviceId: string) => {
    const response = await fetchDeviceDetail(deviceId);
    setDetail(response.detail);
  };

  const bootstrap = async () => {
    try {
      setBusy(true);
      setError("");
      await Promise.all([loadMeta(), loadDevices(), loadOverview()]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "初始化失败");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!entered || view !== "overview") {
      return;
    }

    const ws = new WebSocket(createLiveWsUrl());
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", scope: "overview" }));
    };
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; payload?: { metrics: MmwaveOverviewMetrics; devices: MmwaveOverviewDeviceCard[] } };
        if (payload.type === "overview" && payload.payload) {
          setMetrics(payload.payload.metrics);
          setOverviewCards(payload.payload.devices);
        }
      } catch {
        // Ignore malformed message.
      }
    };

    const timer = window.setInterval(() => {
      void loadOverview().catch(() => undefined);
    }, 5000);

    return () => {
      window.clearInterval(timer);
      ws.close();
    };
  }, [entered, view]);

  useEffect(() => {
    if (!entered || view !== "detail" || !selectedDeviceId) {
      return;
    }

    const ws = new WebSocket(createLiveWsUrl());
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", deviceId: selectedDeviceId }));
    };
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; payload?: MmwaveDeviceDetail };
        if (payload.type === "detail" && payload.payload) {
          setDetail(payload.payload);
        }
      } catch {
        // Ignore malformed message.
      }
    };

    const timer = window.setInterval(() => {
      void loadDetail(selectedDeviceId).catch(() => undefined);
    }, 5000);

    return () => {
      window.clearInterval(timer);
      ws.close();
    };
  }, [entered, view, selectedDeviceId]);

  useEffect(() => {
    if (!selectedDeviceId || view !== "detail") {
      return;
    }
    void loadDetail(selectedDeviceId).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "设备详情加载失败");
    });
  }, [selectedDeviceId, view]);

  const handleDiscover = async () => {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      const response = await discoverDevices();
      setDevices(response.devices);
      await loadOverview();
      setMessage(`已扫描 ${response.devices.length} 台设备`);
      if (!selectedDeviceId && response.devices[0]) {
        setSelectedDeviceId(response.devices[0].id);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "扫描设备失败");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setView("detail");
    setError("");
  };

  const handleRefreshDevice = async () => {
    if (!selectedDeviceId) {
      return;
    }
    try {
      setBusy(true);
      setError("");
      const response = await refreshDevice(selectedDeviceId);
      setDetail(response.detail);
      await Promise.all([loadDevices(), loadOverview()]);
      setMessage("设备数据已刷新");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "刷新设备失败");
    } finally {
      setBusy(false);
    }
  };

  const handleResetDevice = async () => {
    if (!selectedDeviceId) {
      return;
    }
    try {
      setBusy(true);
      setError("");
      const response = await resetDevice(selectedDeviceId);
      setDetail(response.detail);
      setMessage("已发送设备重启命令");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "重启设备失败");
    } finally {
      setBusy(false);
    }
  };

  const activeNav = view === "detail" ? "overview" : view;

  const getDeviceUiStatus = (device: StoredMmwaveDevice): "ONLINE" | "OFFLINE" | "UNINITIALIZED" => {
    const initialized = Boolean(device.haDeviceId && device.binding.entityCount > 0);
    if (!initialized) {
      return "UNINITIALIZED";
    }
    return device.discovery.status === "online" ? "ONLINE" : "OFFLINE";
  };

  const getDeviceTypeLabel = (device: StoredMmwaveDevice): string => {
    if (device.profileId === "c4004") {
      return "dfrobot_c4004";
    }
    return device.model.trim().toLowerCase().replace(/\s+/g, "_");
  };

  const getDeviceDeploymentLabel = (device: StoredMmwaveDevice): string => device.id;

  const handleInitializeDevice = (device: StoredMmwaveDevice) => {
    setError("");
    setMessage(`设备 ${device.name} 的初始化接口暂未接入`);
  };

  const handleDeleteDevice = (device: StoredMmwaveDevice) => {
    setError("");
    setMessage(`设备 ${device.name} 的删除接口暂未接入`);
  };

  const deviceManagementStats = {
    scanResultCount: devices.length,
    onlineCount: devices.filter((device) => getDeviceUiStatus(device) === "ONLINE").length,
    uninitializedCount: devices.filter((device) => getDeviceUiStatus(device) === "UNINITIALIZED").length,
  };

  const renderWelcome = () => (
    <div className="welcome-shell">
      <div className="welcome-panel">
        <div className="brand-mark">DF</div>
        <div className="brand-copy">
          <p className="eyebrow">DFRobot mmWave Platform</p>
          <h1>毫米波传感器控制平台</h1>
          <p>毫米波多区域存在传感器控制台，面向 Home Assistant 的多设备部署与状态可视化。</p>
        </div>
        <div className="feature-grid">
          <article>
            <strong>多设备总览</strong>
            <span>同时查看设备数、人数统计和实时坐标面板。</span>
          </article>
          <article>
            <strong>区域标签感知</strong>
            <span>在统一坐标系内展示探测范围、区域状态与标签层。</span>
          </article>
          <article>
            <strong>HA 原生联动</strong>
            <span>基于 Home Assistant 接口发现设备并提供刷新、重启入口。</span>
          </article>
        </div>
        <button className="hero-button" type="button" onClick={() => setEntered(true)}>
          进入控制台
        </button>
      </div>
    </div>
  );

  const renderSidebar = () => (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">DF</div>
        <div>
          <strong>DFRobot mmWave</strong>
          <span>毫米波控制台</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeNav === item.id ? "nav-item nav-item-active" : "nav-item"}
            onClick={() => setView(item.id)}
          >
            <span className="nav-badge">{item.short}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <span>HA: {meta?.linked ? "Linked" : "Unlinked"}</span>
        <span>MQTT: {meta?.mqttConnected ? "Live" : meta?.mqttConfigured ? "Configured" : "Disabled"}</span>
      </div>
    </aside>
  );

  const renderOverview = () => (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>设备总览</h2>
        </div>
        <div className="page-actions">
          <button type="button" className="ghost-button" onClick={() => void bootstrap()} disabled={busy}>
            刷新总览
          </button>
          <button type="button" className="primary-button" onClick={() => setView("device-management")}>
            添加设备
          </button>
        </div>
      </header>

      <div className="stats-grid">
        {statsMeta.map((stat) => (
          <article key={stat.key} className="stat-card">
            <span>{stat.label}</span>
            <strong>
              {metrics[stat.key]}
              <small>{stat.suffix}</small>
            </strong>
          </article>
        ))}
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>实时监控矩阵</h3>
            <span>固定坐标系 X(-5~5m) / Y(0~9m)</span>
          </div>
          <span className="status-pill">
            {meta?.mqttConnected ? "MQTT 轨迹已连接" : meta?.mqttConfigured ? "MQTT 已配置，等待连接" : "未配置 MQTT，显示降级"}
          </span>
        </div>

        {overviewCards.length ? (
          <div className="device-grid">
            {overviewCards.map((card) => (
              <button key={card.id} type="button" className="device-card" onClick={() => handleOpenDevice(card.id)}>
                <div className="device-card-head">
                  <div>
                    <strong>{card.name}</strong>
                    <span>{card.online ? "Online" : "Offline"}</span>
                  </div>
                  <small>{card.status}</small>
                </div>
                <RadarCanvas
                  coordinate={card.coordinate}
                  rangeBox={card.rangeBox}
                  regions={card.regions}
                  targets={card.targets}
                />
                <div className="device-card-foot">
                  <span>总人数 {card.peopleCount}</span>
                  <span>运动 {card.targetCount}</span>
                  <span>静止 {card.staticCount}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>当前还没有设备数据</strong>
            <span>先去设备管理页扫描 C4004 设备，扫描后这里会自动出现设备矩阵。</span>
          </div>
        )}
      </section>
    </section>
  );

  const renderDetail = () => (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Device Detail</p>
          <h2>{detail?.name ?? "设备详情"}</h2>
          {detail ? (
            <span className="detail-meta">
              {detail.deviceId} / {detail.online ? "在线" : "离线"} / {detail.firmwareVersion ?? "固件未知"}
            </span>
          ) : null}
        </div>
        <div className="page-actions">
          <button type="button" className="ghost-button" onClick={() => setView("region-management")}>
            区域配置
          </button>
          <button type="button" className="ghost-button" onClick={() => void handleRefreshDevice()} disabled={busy || !detail?.actions.canRefresh}>
            刷新
          </button>
          <button type="button" className="primary-button" onClick={() => void handleResetDevice()} disabled={busy || !detail?.actions.canReset}>
            重启设备
          </button>
        </div>
      </header>

      {detail ? (
        <div className="detail-layout">
          <section className="panel detail-radar-panel">
            <RadarCanvas
              coordinate={detail.coordinate}
              rangeBox={detail.rangeBox}
              regions={detail.regions}
              targets={detail.targets}
              large
            />
            {!detail.trajectoryAvailable ? (
              <div className="degraded-banner">未接收到 MQTT 轨迹点，当前只显示范围框与区域标签。</div>
            ) : null}
          </section>
          <div className="detail-side">
            <section className="panel compact-panel">
              <div className="two-stat-row">
                <article>
                  <span>运动人数</span>
                  <strong>{detail.movingCount}</strong>
                </article>
                <article>
                  <span>静止人数</span>
                  <strong>{detail.staticCount}</strong>
                </article>
              </div>
            </section>

            <section className="panel compact-panel">
              <div className="section-title">IO 联动状态</div>
              <div className="io-grid">
                {detail.ioStates.map((io) => (
                  <div key={io.id} className="io-card">
                    <span>{io.label}</span>
                    <i className={io.active ? "io-indicator io-indicator-on" : "io-indicator"} />
                  </div>
                ))}
              </div>
            </section>

            <section className="panel compact-panel">
              <div className="section-title">核心参数</div>
              <div className="basic-list">
                {detail.basics.map((item) => (
                  <div key={item.key} className="basic-item">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <strong>还没有选中设备</strong>
          <span>回到设备总览页点击一张设备卡，即可进入详情显示界面。</span>
        </div>
      )}
    </section>
  );

  const renderDeviceManagement = () => (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Device Management</p>
          <h2>设备管理</h2>
        </div>
        <div className="page-actions">
          <button type="button" className="primary-button" onClick={() => void handleDiscover()} disabled={busy}>
            扫描设备
          </button>
        </div>
      </header>
      <div className="stats-grid device-management-stats">
        <article className="stat-card">
          <span>扫描结果</span>
          <strong>
            {deviceManagementStats.scanResultCount}
            <small>台</small>
          </strong>
        </article>
        <article className="stat-card">
          <span>在线设备</span>
          <strong>
            {deviceManagementStats.onlineCount}
            <small>台</small>
          </strong>
        </article>
        <article className="stat-card">
          <span>未初始化</span>
          <strong>
            {deviceManagementStats.uninitializedCount}
            <small>台</small>
          </strong>
        </article>
      </div>
      <section className="panel">
        <div className="placeholder-copy">
          <strong>扫描设备后，以表格形式展示设备信息与操作入口。</strong>
          <span>当前按设备名称、部署、设备ID、设备类型、设备状态和操作六列展示。</span>
        </div>
        <div className="device-table-wrap">
          {devices.length ? (
            <table className="device-table">
              <thead>
                <tr>
                  <th>设备名称</th>
                  <th>部署</th>
                  <th>设备ID</th>
                  <th>设备类型</th>
                  <th>设备状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => {
                  const status = getDeviceUiStatus(device);
                  const canViewDetail = status === "ONLINE";
                  const canDelete = status === "ONLINE" || status === "OFFLINE";
                  const canInitialize = status === "UNINITIALIZED";

                  return (
                    <tr key={device.id}>
                      <td>{device.name}</td>
                      <td>{getDeviceDeploymentLabel(device)}</td>
                      <td>{device.haDeviceId ?? device.prefix}</td>
                      <td>{getDeviceTypeLabel(device)}</td>
                      <td>
                        <span className={`device-status-badge device-status-${status.toLowerCase()}`}>{status}</span>
                      </td>
                      <td>
                        <div className="device-row-actions">
                          {canInitialize ? (
                            <button type="button" className="table-action-button primary" onClick={() => handleInitializeDevice(device)}>
                              初始化
                            </button>
                          ) : null}
                          {canViewDetail ? (
                            <button type="button" className="table-action-button" onClick={() => handleOpenDevice(device.id)}>
                              查看详情
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button type="button" className="table-action-button danger" onClick={() => handleDeleteDevice(device)}>
                              删除
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty-inline">还没有扫描到设备，点击右上角“扫描设备”开始发现。</div>
          )}
        </div>
      </section>
    </section>
  );

  const renderRegionManagement = () => (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Region Management</p>
          <h2>区域管理</h2>
        </div>
      </header>
      <section className="panel">
        <div className="placeholder-copy">
          <strong>区域管理页本期先保留为正式占位页。</strong>
          <span>
            {selectedDevice
              ? `当前上下文设备：${selectedDevice.name}。后续这里将扩展真实区域编辑和标签配置。`
              : "从设备详情页点击“区域配置”进入时，这里会保留当前设备上下文。"}
          </span>
        </div>
      </section>
    </section>
  );

  if (!entered) {
    return renderWelcome();
  }

  return (
    <div className="app-shell">
      {renderSidebar()}
      <main className="content-shell">
        <div className="top-strip">
          <span>{meta?.linked ? "Home Assistant 已连接" : "Home Assistant 未连接"}</span>
          <span>{busy ? "处理中..." : new Date().toLocaleString()}</span>
        </div>
        {message ? <div className="notice notice-info">{message}</div> : null}
        {error ? <div className="notice notice-error">{error}</div> : null}
        {view === "overview" ? renderOverview() : null}
        {view === "detail" ? renderDetail() : null}
        {view === "device-management" ? renderDeviceManagement() : null}
        {view === "region-management" ? renderRegionManagement() : null}
      </main>
    </div>
  );
}

export default App;
