import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import {
  discoverDevices,
  fetchDeviceDetail,
  fetchDevices,
  fetchOverview,
  initializeDevice as submitInitializeDevice,
  refreshDevice,
  resetDevice,
  unbindDevice,
  type DetectionMode,
  type MmwaveDeviceDetail,
  type MmwaveOverviewDeviceCard,
  type MmwaveOverviewMetrics,
  type StoredMmwaveDevice,
  type DeviceLogEntry,
} from "./api/client";
import { RadarCanvas } from "./components/RadarCanvas";
import { DeviceLogPanel } from "./components/DeviceLogPanel";
import { OverviewPage } from "./pages/OverviewPage";
import { RegionManagementPage } from "./pages/RegionManagementPage";
import { useMmwaveLiveRefresh } from "./hooks/useMmwaveLiveRefresh";

type View = "overview" | "detail" | "device-management" | "region-management";
type DeviceNoMode = "auto" | "custom";
type DetailPanelTab = "basics" | "logs";

type InitializeWizardState = {
  deviceId: string;
  name: string;
  deploymentName: string;
  deviceNoMode: DeviceNoMode;
  /** 仅自动模式使用，与自定义互不影响 */
  autoDeviceNo: string;
  /** 仅自定义模式使用，与自动互不影响 */
  customDeviceNo: string;
  /** 绑定成功后的实际设备号，仅用于完成页展示 */
  boundDeviceNo: string;
  installHeightM: number;
  detectionMode: DetectionMode;
  step: 1 | 2 | 3;
  submitting: boolean;
  completed: boolean;
};

const CONSOLE_ENTERED_STORAGE_KEY = "dfrobot-mmwave-console-entered";

const hasEnteredConsole = (): boolean => {
  try {
    return window.localStorage.getItem(CONSOLE_ENTERED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const markConsoleEntered = (): void => {
  try {
    window.localStorage.setItem(CONSOLE_ENTERED_STORAGE_KEY, "1");
  } catch {
    // Ignore quota / private-mode failures; in-memory entered state still works for this session.
  }
};

const navItems: Array<{ id: Exclude<View, "detail">; label: string; short: string }> = [
  { id: "overview", label: "设备总览", short: "OV" },
  { id: "device-management", label: "设备管理", short: "DM" },
  { id: "region-management", label: "区域管理", short: "RM" },
];

const detectionModeLabels: Record<DetectionMode, { title: string; description: string; frames: number; unmannedTime: number }> = {
  1: {
    title: "高灵敏度模式",
    description: "快速响应，适合需要更快触发的场景。",
    frames: 2,
    unmannedTime: 5,
  },
  2: {
    title: "静态稳定模式",
    description: "持续存在，适合静止目标稳定检测。",
    frames: 7,
    unmannedTime: 30,
  },
};

function App() {
  const [entered, setEntered] = useState(() => hasEnteredConsole());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [devices, setDevices] = useState<StoredMmwaveDevice[]>([]);
  const [metrics, setMetrics] = useState<MmwaveOverviewMetrics>({
    deviceCount: 0,
    peopleCount: 0,
    targetCount: 0,
    staticCount: 0,
  });
  const [overviewCards, setOverviewCards] = useState<MmwaveOverviewDeviceCard[]>([]);
  const [overviewStale, setOverviewStale] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MmwaveDeviceDetail | null>(null);
  const [detailPanelTab, setDetailPanelTab] = useState<DetailPanelTab>("basics");
  const [deviceLogRefreshToken, setDeviceLogRefreshToken] = useState(0);
  const [memoryLogEntries, setMemoryLogEntries] = useState<DeviceLogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [initializeWizard, setInitializeWizard] = useState<InitializeWizardState | null>(null);
  const overviewLoadingRef = useRef(false);
  const detailLoadingRef = useRef(false);
  const overviewRefreshPendingRef = useRef(false);
  const detailRefreshPendingRef = useRef(false);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );

  const loadDevices = async () => {
    const response = await fetchDevices();
    setDevices(response.devices);
  };

  const loadOverview = async () => {
    const response = await fetchOverview();
    setMetrics(response.metrics);
    setOverviewCards(response.devices);
    setOverviewStale(false);
  };

  const loadDetail = async (deviceId: string) => {
    const response = await fetchDeviceDetail(deviceId);
    setDetail(response.detail);
  };

  const refreshOverview = async () => {
    if (document.hidden) {
      return;
    }
    if (overviewLoadingRef.current) {
      overviewRefreshPendingRef.current = true;
      return;
    }
    overviewLoadingRef.current = true;
    try {
      await loadOverview();
      setOverviewStale(false);
    } catch {
      setOverviewStale(true);
    } finally {
      overviewLoadingRef.current = false;
      if (overviewRefreshPendingRef.current) {
        overviewRefreshPendingRef.current = false;
        void refreshOverview();
      }
    }
  };

  const refreshDetail = async (deviceId: string) => {
    if (document.hidden) {
      return;
    }
    if (detailLoadingRef.current) {
      detailRefreshPendingRef.current = true;
      return;
    }
    detailLoadingRef.current = true;
    try {
      await loadDetail(deviceId);
    } catch {
      // Keep the last successful detail while the device is temporarily unavailable.
    } finally {
      detailLoadingRef.current = false;
      if (detailRefreshPendingRef.current) {
        detailRefreshPendingRef.current = false;
        void refreshDetail(deviceId);
      }
    }
  };

  const bootstrap = async () => {
    try {
      setBusy(true);
      setError("");
      await Promise.all([loadDevices(), loadOverview()]);
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
    if (!message && !error) {
      return;
    }
    const timer = window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  useEffect(() => {
    if (!entered || view !== "overview") {
      return;
    }
    void refreshOverview();
    const timer = window.setInterval(() => void refreshOverview(), 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [entered, view]);

  useEffect(() => {
    if (!entered || view !== "detail" || !selectedDeviceId) {
      return;
    }
    void refreshDetail(selectedDeviceId);
    const timer = window.setInterval(() => void refreshDetail(selectedDeviceId), 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [entered, view, selectedDeviceId]);

  useMmwaveLiveRefresh(
    view === "overview"
      ? { scope: "overview" }
      : view === "detail" && selectedDeviceId
        ? { scope: "device", deviceId: selectedDeviceId }
        : null,
    (subscription) => {
      if (subscription.scope === "overview") {
        void refreshOverview();
        return;
      }
      if (subscription.scope === "device") {
        void refreshDetail(subscription.deviceId);
        setDeviceLogRefreshToken((value) => value + 1);
      }
    },
    (nextError) => setError(nextError),
    (_deviceId, entry, persisted) => {
      if (!persisted) {
        setMemoryLogEntries((entries) => [entry, ...entries].slice(0, 10));
      }
      setDeviceLogRefreshToken((value) => value + 1);
    },
  );

  useEffect(() => {
    if (!selectedDeviceId || view !== "detail") {
      return;
    }
    void loadDetail(selectedDeviceId).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "设备详情加载失败");
    });
  }, [selectedDeviceId, view]);

  useEffect(() => {
    setMemoryLogEntries([]);
  }, [selectedDeviceId]);

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

  const handleRefreshDevices = async () => {
    try {
      setBusy(true);
      setError("");
      setMessage("");
      const response = await fetchDevices();
      setDevices(response.devices);
      setMessage("设备状态已刷新");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "刷新设备状态失败");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setDetailPanelTab("basics");
    setDeviceLogRefreshToken(0);
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

  const getDeviceUiStatus = (device: StoredMmwaveDevice): "ONLINE" | "OFFLINE" =>
    device.discovery.status === "online" ? "ONLINE" : "OFFLINE";

  const getDeviceTypeLabel = (device: StoredMmwaveDevice): string => {
    if (device.profileId === "c4004") {
      return "c4004";
    }
    return device.model.trim().toLowerCase().replace(/\s+/g, "_");
  };

  const getDeviceDeploymentLabel = (device: StoredMmwaveDevice): string => device.deploymentName?.trim() || "未设置";

  const normalizeDeviceNoInput = (value: string): string =>
    value.replace(/\D+/g, "").replace(/^0+(\d)/, "$1");

  const getSuggestedDeviceNo = (): string => {
    const maxSequence = devices.reduce((max, device) => {
      const parsed = Number(normalizeDeviceNoInput(device.deviceNo ?? ""));
      return Number.isSafeInteger(parsed) && parsed > 0 ? Math.max(max, parsed) : max;
    }, 0);
    return String(maxSequence + 1);
  };

  const getWizardDeviceNo = (wizard: InitializeWizardState): string => {
    if (wizard.completed && wizard.boundDeviceNo) {
      return wizard.boundDeviceNo;
    }
    // 严格按当前模式取值，自动/自定义互不串用
    if (wizard.deviceNoMode === "auto") {
      return wizard.autoDeviceNo || getSuggestedDeviceNo();
    }
    return normalizeDeviceNoInput(wizard.customDeviceNo);
  };

  const isDuplicateDeviceNo = (deviceNo: string, currentDeviceId: string): boolean =>
    devices.some((device) => device.id !== currentDeviceId && device.deviceNo === deviceNo);

  const handleInitializeDevice = (device: StoredMmwaveDevice) => {
    setError("");
    if (device.discovery.status !== "online") {
      setError("设备离线，无法进行初始化绑定");
      return;
    }
    setInitializeWizard({
      deviceId: device.id,
      name: device.name,
      deploymentName: device.deploymentName ?? "",
      deviceNoMode: "auto",
      autoDeviceNo: getSuggestedDeviceNo(),
      customDeviceNo: "",
      boundDeviceNo: "",
      installHeightM: device.installInfo?.installHeightM ?? 1.8,
      detectionMode: device.detectionMode ?? 1,
      step: 1,
      submitting: false,
      completed: false,
    });
  };

  const handleDeleteDevice = async (device: StoredMmwaveDevice) => {
    setError("");
    setMessage("");
    const confirmed = window.confirm(
      `确认取消绑定设备 ${device.name}？这会删除该设备的本地配置、区域配置、事件日志和快照缓存。`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setBusy(true);
      const response = await unbindDevice(device.id);
      setDevices(response.devices);
      if (selectedDeviceId === device.id) {
        setSelectedDeviceId(null);
        setDetail(null);
      }
      await loadOverview();
      setMessage("设备 " + device.name + " 已取消绑定");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "取消绑定失败");
    } finally {
      setBusy(false);
    }
  };

  const deviceManagementDevices = devices;

  const deviceManagementStats = {
    scanResultCount: deviceManagementDevices.length,
    onlineCount: deviceManagementDevices.filter((device) => getDeviceUiStatus(device) === "ONLINE").length,
    uninitializedCount: deviceManagementDevices.filter((device) => !device.initialized).length,
  };

  const closeInitializeWizard = () => {
    setInitializeWizard(null);
  };

  const updateInitializeWizard = (updates: Partial<InitializeWizardState>) => {
    setInitializeWizard((current) => (current ? { ...current, ...updates } : current));
  };

  const handleInitializeStepOneNext = () => {
    if (!initializeWizard) {
      return;
    }
    const deviceNo = getWizardDeviceNo(initializeWizard);
    if (!deviceNo) {
      setError("请输入设备号");
      return;
    }
    if (isDuplicateDeviceNo(deviceNo, initializeWizard.deviceId)) {
      setError("设备号已存在，请更换后再继续");
      return;
    }
    setError("");
    updateInitializeWizard({
      autoDeviceNo:
        initializeWizard.deviceNoMode === "auto" ? deviceNo : initializeWizard.autoDeviceNo,
      customDeviceNo:
        initializeWizard.deviceNoMode === "custom" ? deviceNo : initializeWizard.customDeviceNo,
      step: 2,
    });
  };

  const handleSubmitInitializeWizard = async () => {
    if (!initializeWizard) {
      return;
    }

    const currentDevice = devices.find((device) => device.id === initializeWizard.deviceId);
    if (!currentDevice || currentDevice.discovery.status !== "online") {
      setError("设备离线，无法完成初始化绑定");
      updateInitializeWizard({ submitting: false });
      return;
    }

    try {
      updateInitializeWizard({ submitting: true });
      setError("");
      const deviceNoMode = initializeWizard.deviceNoMode;
      const deviceNo = getWizardDeviceNo(initializeWizard);
      if (!deviceNo) {
        throw new Error(deviceNoMode === "custom" ? "请输入自定义设备号" : "自动设备号无效");
      }
      if (isDuplicateDeviceNo(deviceNo, initializeWizard.deviceId)) {
        throw new Error("设备号已存在，请更换后再继续");
      }
      // 自定义：只提交自定义号；自动：提交自动快照号（后端 auto 路径必须使用该号）
      const response = await submitInitializeDevice(initializeWizard.deviceId, {
        deviceNoMode,
        customDeviceNo: deviceNo,
        installHeightM: initializeWizard.installHeightM,
        detectionMode: initializeWizard.detectionMode,
      });
      const boundDeviceNo = response.device.deviceNo ?? "";
      if (!boundDeviceNo || boundDeviceNo !== deviceNo) {
        throw new Error(
          `设备号绑定结果不一致：当前为${deviceNoMode === "custom" ? "自定义" : "自动"} ${deviceNo}，实际 ${boundDeviceNo || "空"}`,
        );
      }
      const refreshed = await fetchDevices();
      setDevices(refreshed.devices);
      setInitializeWizard((current) =>
        current
          ? {
              ...current,
              step: 3,
              submitting: false,
              completed: true,
              name: response.device.name,
              deploymentName: response.device.deploymentName ?? current.deploymentName,
              boundDeviceNo,
            }
          : current,
      );
      setMessage("设备 " + response.device.name + " 已完成绑定");
    } catch (nextError) {
      updateInitializeWizard({ submitting: false });
      setError(nextError instanceof Error ? nextError.message : "绑定失败");
    }
  };

  const renderWelcome = () => (
    <div className="welcome-shell">
      <div className="welcome-panel">
        <div className="brand-mark">
          <img src="./ui_logo.svg" alt="DFRobot mmWave" className="brand-logo-image" />
        </div>
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
        <button
          className="hero-button"
          type="button"
          onClick={() => {
            markConsoleEntered();
            setEntered(true);
          }}
        >
          进入控制台
        </button>
      </div>
    </div>
  );

  const renderSidebar = () => (
    <aside className="sidebar" aria-hidden={sidebarCollapsed}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src="./ui_logo.svg" alt="DFRobot mmWave" className="brand-logo-image" />
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
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );

  const renderSidebarToggle = () => (
    <button
      type="button"
      className="sidebar-toggle"
      aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
      aria-expanded={!sidebarCollapsed}
      title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
      onClick={() => setSidebarCollapsed((value) => !value)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {sidebarCollapsed ? (
          <path d="M4 6h16M4 12h16M4 18h16" />
        ) : (
          <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </>
        )}
      </svg>
    </button>
  );

  const pageTitle = view === "overview"
    ? "设备总览"
    : view === "device-management"
      ? "设备管理"
      : view === "region-management"
        ? "区域管理"
        : (detail?.name ?? "设备详情");

  const renderContentTopbar = () => (
    <div className="content-topbar">
      {renderSidebarToggle()}
      <div className="content-topbar-title">
        <h1>{pageTitle}</h1>
        {view === "detail" && selectedDevice ? (
          <span className="content-topbar-sub">设备号 {selectedDevice.deviceNo}</span>
        ) : null}
      </div>
      <div className="content-topbar-actions page-actions">
        {view === "overview" ? (
          <>
            {overviewStale ? <span className="data-stale-badge">数据可能已过期</span> : null}
            <button type="button" className="ghost-button" onClick={() => void bootstrap()} disabled={busy}>
              刷新总览
            </button>
            <button type="button" className="primary-button" onClick={() => setView("device-management")}>
              添加设备
            </button>
          </>
        ) : null}
        {view === "device-management" ? (
          <>
            <button type="button" className="ghost-button" onClick={() => void handleRefreshDevices()} disabled={busy}>
              刷新设备
            </button>
            <button type="button" className="primary-button" onClick={() => void handleDiscover()} disabled={busy}>
              扫描设备
            </button>
          </>
        ) : null}
        {view === "detail" ? (
          <>
            <button type="button" className="ghost-button" onClick={() => setView("overview")}>
              返回总览
            </button>
            <button type="button" className="ghost-button" onClick={() => setView("region-management")}>
              区域配置
            </button>
            <button type="button" className="ghost-button" onClick={() => void handleRefreshDevice()} disabled={busy || !detail?.actions.canRefresh}>
              刷新
            </button>
            <button type="button" className="primary-button" onClick={() => void handleResetDevice()} disabled={busy || !detail?.actions.canReset}>
              重启设备
            </button>
          </>
        ) : null}
      </div>
    </div>
  );

  const renderDetail = () => (
    <section className="page detail-page">
      {detail ? (
        <div className="detail-layout">
          <section className="panel detail-radar-panel">
            <RadarCanvas
              deviceId={detail.id}
              coordinate={detail.coordinate}
              rangeBox={detail.rangeBox}
              detection={detail.detection}
              regions={detail.regions}
              targets={detail.targets}
              backgroundInstances={detail.backgroundInstances}
              viewPreferences={detail.viewPreferences}
              large
            />
            {!detail.trajectoryAvailable ? <div className="degraded-banner">未接收到 MQTT 轨迹点，当前只显示范围框与区域标签。</div> : null}
          </section>
          <div className="detail-side">
            <section className="panel compact-panel detail-stat-panel">
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

            <section className="panel compact-panel detail-io-panel">
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

            <section className="panel compact-panel detail-info-panel">
              <div className="detail-panel-tabs" role="tablist" aria-label="设备信息">
                <button type="button" role="tab" aria-selected={detailPanelTab === "basics"} className={detailPanelTab === "basics" ? "active" : ""} onClick={() => setDetailPanelTab("basics")}>核心参数</button>
                <button type="button" role="tab" aria-selected={detailPanelTab === "logs"} className={detailPanelTab === "logs" ? "active" : ""} onClick={() => setDetailPanelTab("logs")}>设备日志</button>
              </div>
              <div className="detail-info-body">
                {detailPanelTab === "basics" ? <div className="basic-list">
                  {detail.basics.map((item) => <div key={item.key} className="basic-item">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>)}
                </div> : <DeviceLogPanel
                  deviceId={detail.id}
                  online={detail.online}
                  refreshToken={deviceLogRefreshToken}
                  memoryEntries={memoryLogEntries}
                  onError={setError}
                />}
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
        <div className="device-table-wrap">
          {deviceManagementDevices.length ? (
            <table className="device-table">
              <thead>
                <tr>
                  <th>设备名称</th>
                  <th>部署</th>
                  <th>设备号</th>
                  <th>设备类型</th>
                  <th>设备状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {deviceManagementDevices.map((device) => {
                  const status = getDeviceUiStatus(device);
                  const canViewDetail = device.initialized;
                  const canDelete = device.initialized;
                  const isOnline = status === "ONLINE";
                  const canInitialize = !device.initialized && isOnline;

                  return (
                    <tr key={device.id}>
                      <td>{device.name}</td>
                      <td>{getDeviceDeploymentLabel(device)}</td>
                      <td>{device.deviceNo ?? "-"}</td>
                      <td>{getDeviceTypeLabel(device)}</td>
                      <td>
                        <span className={"device-status-badge device-status-" + status.toLowerCase()}>{status}</span>
                      </td>
                      <td>
                        <div className="device-row-actions">
                          {!device.initialized ? (
                            <button
                              type="button"
                              className="table-action-button primary"
                              onClick={() => handleInitializeDevice(device)}
                              disabled={!canInitialize || busy}
                              title={canInitialize ? undefined : "设备离线，无法初始化绑定"}
                            >
                              初始化
                            </button>
                          ) : null}
                          {canViewDetail ? (
                            <button type="button" className="table-action-button" onClick={() => handleOpenDevice(device.id)}>
                              查看详情
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button type="button" className="table-action-button danger" onClick={() => void handleDeleteDevice(device)} disabled={busy}>
                              取消绑定
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

  if (!entered) {
    return renderWelcome();
  }

  return (
    <div className={sidebarCollapsed ? "app-shell is-sidebar-collapsed" : "app-shell"}>
      {message || error ? (
        <div
          key={`${error ? "error" : "info"}:${error || message}`}
          className={error ? "app-toast app-toast-error" : "app-toast app-toast-info"}
          role="status"
          aria-live="polite"
        >
          {error || message}
        </div>
      ) : null}
      {renderSidebar()}
      <main className={view === "detail" ? "content-shell is-detail-view" : "content-shell"}>
        {view !== "region-management" ? renderContentTopbar() : null}
        {view === "overview" ? (
          <OverviewPage
            metrics={metrics}
            devices={overviewCards}
            onOpenDevice={handleOpenDevice}
          />
        ) : null}
        {view === "detail" ? renderDetail() : null}
        {view === "device-management" ? renderDeviceManagement() : null}
        {view === "region-management" ? (
          <RegionManagementPage
            devices={devices}
            selectedDeviceId={selectedDevice?.id ?? selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            onMessage={setMessage}
            onError={setError}
            sidebarToggle={renderSidebarToggle()}
          />
        ) : null}
      </main>
      {initializeWizard ? (
        <div className="modal-backdrop" role="presentation" onClick={closeInitializeWizard}>
          <section className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="initialize-device-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Device Binding</p>
                <h3 id="initialize-device-title">初始化设备</h3>
              </div>
              <button type="button" className="modal-close" onClick={closeInitializeWizard}>
                关闭
              </button>
            </div>
            <div className="wizard-steps">
              <span className={initializeWizard.step >= 1 ? "wizard-step wizard-step-active" : "wizard-step"}>1. 绑定设备</span>
              <span className={initializeWizard.step >= 2 ? "wizard-step wizard-step-active" : "wizard-step"}>2. 安装设备</span>
              <span className={initializeWizard.step >= 3 ? "wizard-step wizard-step-active" : "wizard-step"}>3. 探测模式</span>
            </div>
            {initializeWizard.step === 1 ? (
              <div className="modal-body">
                <div className="wizard-summary">
                  <div>
                    <span>设备名称</span>
                    <strong>{initializeWizard.name || "未设置"}</strong>
                  </div>
                  <div>
                    <span>部署位置</span>
                    <strong>{initializeWizard.deploymentName || "未设置"}</strong>
                  </div>
                </div>
                <div className="segmented-control" role="group" aria-label="设备号生成方式">
                  <button
                    type="button"
                    className={initializeWizard.deviceNoMode === "auto" ? "segment-button segment-button-active" : "segment-button"}
                    onClick={() => updateInitializeWizard({
                      deviceNoMode: "auto",
                      // 只刷新自动号，不改动已输入的自定义号
                      autoDeviceNo: initializeWizard.autoDeviceNo || getSuggestedDeviceNo(),
                    })}
                  >
                    自动生成
                  </button>
                  <button
                    type="button"
                    className={initializeWizard.deviceNoMode === "custom" ? "segment-button segment-button-active" : "segment-button"}
                    onClick={() => updateInitializeWizard({
                      deviceNoMode: "custom",
                      // 不把自动号填进自定义输入框，两套完全分开
                    })}
                  >
                    自定义
                  </button>
                </div>
                {initializeWizard.deviceNoMode === "custom" ? (
                  <label className="modal-field">
                    <span>自定义设备号</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={initializeWizard.customDeviceNo}
                      onChange={(event) => {
                        updateInitializeWizard({
                          customDeviceNo: normalizeDeviceNoInput(event.target.value),
                        });
                      }}
                      placeholder="例如：1"
                    />
                  </label>
                ) : (
                  <div className="readonly-field">
                    <span>自动分配设备号</span>
                    <strong>{initializeWizard.autoDeviceNo || getSuggestedDeviceNo()}</strong>
                  </div>
                )}
              </div>
            ) : null}
            {initializeWizard.step === 2 ? (
              <div className="modal-body">
                <div className="wizard-summary">
                  <div>
                    <span>安装方式</span>
                    <strong>侧装</strong>
                  </div>
                  <div>
                    <span>安装角度</span>
                    <strong>0°</strong>
                  </div>
                </div>
                <label className="modal-field range-field">
                  <span>安装高度</span>
                  <strong>{initializeWizard.installHeightM.toFixed(2)} m</strong>
                  <input
                    type="range"
                    min="1.8"
                    max="2"
                    step="0.01"
                    value={initializeWizard.installHeightM}
                    onChange={(event) => updateInitializeWizard({ installHeightM: Number(event.target.value) })}
                  />
                  <small>1.8m - 2.0m</small>
                </label>
              </div>
            ) : null}
            {initializeWizard.step === 3 ? (
              <div className="modal-body">
                <div className="mode-options">
                  {([1, 2] as const).map((mode) => {
                    const modeMeta = detectionModeLabels[mode];
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={initializeWizard.detectionMode === mode ? "mode-option mode-option-active" : "mode-option"}
                        onClick={() => updateInitializeWizard({ detectionMode: mode })}
                      >
                        <strong>{modeMeta.title}</strong>
                        <span>{modeMeta.description}</span>
                        <small>
                          确认帧数 {modeMeta.frames} / 无人时间 {modeMeta.unmannedTime}s
                        </small>
                      </button>
                    );
                  })}
                </div>
                <div className="wizard-success">
                  <strong>{initializeWizard.completed ? "绑定完成" : "绑定确认"}</strong>
                  <span>
                    {initializeWizard.deviceNoMode === "custom" ? "自定义设备号" : "自动分配设备号"}：
                    {getWizardDeviceNo(initializeWizard)}
                  </span>
                  <span>安装高度：{initializeWizard.installHeightM.toFixed(2)} m</span>
                </div>
              </div>
            ) : null}
            <div className="modal-actions">
              {initializeWizard.step === 1 ? (
                <>
                  <button type="button" className="table-action-button" onClick={closeInitializeWizard}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="table-action-button primary"
                    onClick={handleInitializeStepOneNext}
                    disabled={initializeWizard.deviceNoMode === "custom" && !initializeWizard.customDeviceNo.trim()}
                  >
                    下一步
                  </button>
                </>
              ) : null}
              {initializeWizard.step === 2 ? (
                <>
                  <button type="button" className="table-action-button" onClick={() => updateInitializeWizard({ step: 1 })} disabled={initializeWizard.submitting}>
                    上一步
                  </button>
                  <button type="button" className="table-action-button primary" onClick={() => updateInitializeWizard({ step: 3 })} disabled={initializeWizard.submitting}>
                    下一步
                  </button>
                </>
              ) : null}
              {initializeWizard.step === 3 ? (
                initializeWizard.completed ? (
                  <button type="button" className="table-action-button primary" onClick={closeInitializeWizard}>
                    完成
                  </button>
                ) : (
                  <>
                    <button type="button" className="table-action-button" onClick={() => updateInitializeWizard({ step: 2 })} disabled={initializeWizard.submitting}>
                      上一步
                    </button>
                    <button type="button" className="table-action-button primary" onClick={() => void handleSubmitInitializeWizard()} disabled={initializeWizard.submitting}>
                      {initializeWizard.submitting ? "绑定中..." : "确认绑定"}
                    </button>
                  </>
                )
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
