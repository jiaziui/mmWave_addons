import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import {
  clearLiveCount,
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
import { LanguageSwitch } from "./i18n/LanguageSwitch";
import { useLocale } from "./i18n/LocaleContext";
import {
  clearDashboardReturnPath,
  navigateHomeAssistantBack,
  navigateHomeAssistantPath,
  readDashboardReturnPath,
} from "./utils/dashboardReturn";
import welcomeLogo from "../resource/ui_logo.svg";
import {
  downloadBlob,
  formatRecordingClock,
  startPanelVideoRecorder,
} from "./utils/panelVideoRecorder";

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

const navItems: Array<{ id: Exclude<View, "detail">; labelKey: string; short: string }> = [
  { id: "overview", labelKey: "nav.overview", short: "OV" },
  { id: "device-management", labelKey: "nav.deviceManagement", short: "DM" },
  { id: "region-management", labelKey: "nav.regionManagement", short: "RM" },
];

const detectionModeMeta: Record<DetectionMode, { titleKey: string; descriptionKey: string; frames: number; unoccupiedTime: number }> = {
  1: {
    titleKey: "devices.wizard.mode.highSensitivity.title",
    descriptionKey: "devices.wizard.mode.highSensitivity.desc",
    frames: 2,
    unoccupiedTime: 5,
  },
  2: {
    titleKey: "devices.wizard.mode.staticStable.title",
    descriptionKey: "devices.wizard.mode.staticStable.desc",
    frames: 7,
    unoccupiedTime: 30,
  },
};

const BASIC_LABEL_KEYS: Record<string, string> = {
  installMode: "detail.basics.installMode",
  installAngle: "detail.basics.installAngle",
  installHeight: "detail.basics.installHeight",
  detectionRangeMode: "detail.basics.detectionRange",
  realTimeReportInterval: "detail.basics.realTimeReportInterval",
  trajectoryGenerationDistance: "detail.basics.trajectoryGenerationDistance",
  trajectoryLifetime: "detail.basics.trajectoryLifetime",
  frameGenerateCount: "detail.basics.frameGenerateCount",
  unoccupiedTime: "detail.basics.unoccupiedTime",
  profileId: "detail.basics.profileId",
  profileStatus: "detail.basics.profileStatus",
  profileSource: "detail.basics.profileSource",
  manufacturer: "detail.basics.manufacturer",
  firmwareVersion: "detail.basics.firmwareVersion",
  runtimeSupport: "detail.basics.runtimeSupport",
};

const BASIC_LABEL_BY_TEXT: Record<string, string> = {
  安装方式: "detail.basics.installMode",
  "Install Mode": "detail.basics.installMode",
  安装角度: "detail.basics.installAngle",
  "Install Angle": "detail.basics.installAngle",
  安装高度: "detail.basics.installHeight",
  "Install Height": "detail.basics.installHeight",
  探测范围: "detail.basics.detectionRange",
  "Detection Range": "detail.basics.detectionRange",
  实时上报间隔: "detail.basics.realTimeReportInterval",
  "Real-time Report Interval": "detail.basics.realTimeReportInterval",
  轨迹生成距离: "detail.basics.trajectoryGenerationDistance",
  "Trajectory Generation Distance": "detail.basics.trajectoryGenerationDistance",
  轨迹存活时间: "detail.basics.trajectoryLifetime",
  "Trajectory Lifetime": "detail.basics.trajectoryLifetime",
  帧生成计数: "detail.basics.frameGenerateCount",
  "Frame Generation Count": "detail.basics.frameGenerateCount",
  无人占用时间: "detail.basics.unoccupiedTime",
  "Unoccupied Time": "detail.basics.unoccupiedTime",
  设备类型: "detail.basics.profileId",
  "Device Type": "detail.basics.profileId",
  适配状态: "detail.basics.profileStatus",
  "Profile Status": "detail.basics.profileStatus",
  识别来源: "detail.basics.profileSource",
  "Profile Source": "detail.basics.profileSource",
  厂商: "detail.basics.manufacturer",
  Manufacturer: "detail.basics.manufacturer",
  固件版本: "detail.basics.firmwareVersion",
  "Firmware Version": "detail.basics.firmwareVersion",
  运行时支持: "detail.basics.runtimeSupport",
  "Runtime Support": "detail.basics.runtimeSupport",
};

const localizeBasicLabel = (item: { key: string; label: string }, t: (key: string) => string): string => {
  const byKey = BASIC_LABEL_KEYS[item.key];
  if (byKey) return t(byKey);
  const byText = BASIC_LABEL_BY_TEXT[item.label.trim()];
  if (byText) return t(byText);
  return item.label;
};

const localizeBasicValue = (key: string, value: string, t: (key: string) => string): string => {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (key === "installMode" || !key) {
    if (normalized === "side" || trimmed === "侧装" || normalized === "side mount") {
      return t("detail.basics.installMode.side");
    }
  }
  if (key === "detectionRangeMode" || !key) {
    if (
      normalized === "four-sided range"
      || normalized === "four sided range"
      || trimmed === "四方探测范围"
    ) {
      return t("detail.basics.detectionRange.rect");
    }
    if (
      normalized === "trajectory"
      || normalized === "trajectory range"
      || normalized === "learned trajectory range"
      || trimmed === "轨迹探测范围"
      || trimmed === "学习探测范围"
    ) {
      return t("detail.basics.detectionRange.learned");
    }
    if (
      normalized === "config file"
      || normalized === "custom range"
      || trimmed === "自定义探测范围"
      || trimmed === "自定义范围"
    ) {
      return t("detail.basics.detectionRange.custom");
    }
  }
  if (key === "runtimeSupport") {
    if (normalized === "supported" || trimmed === "已支持") return t("detail.basics.runtimeSupport.supported");
    if (normalized === "pending" || trimmed === "待适配") return t("detail.basics.runtimeSupport.pending");
  }
  if (trimmed === "侧装") return t("detail.basics.installMode.side");
  if (trimmed === "四方探测范围") return t("detail.basics.detectionRange.rect");
  if (trimmed === "轨迹探测范围" || trimmed === "学习探测范围") {
    return t("detail.basics.detectionRange.learned");
  }
  if (trimmed === "自定义探测范围" || trimmed === "自定义范围") {
    return t("detail.basics.detectionRange.custom");
  }
  return value;
};

function App() {
  const { t } = useLocale();
  const [entered, setEntered] = useState(() => hasEnteredConsole());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [devices, setDevices] = useState<StoredMmwaveDevice[]>([]);
  const [metrics, setMetrics] = useState<MmwaveOverviewMetrics>({
    deviceCount: 0,
    liveCount: 0,
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
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const detailMenuWrapRef = useRef<HTMLDivElement>(null);
  const [recording, setRecording] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const recorderStopRef = useRef<(() => Promise<Blob>) | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const detailRadarPanelRef = useRef<HTMLElement | null>(null);

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
      setError(nextError instanceof Error ? nextError.message : t("devices.error.initFailed"));
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
    if (!detailMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!(target && detailMenuWrapRef.current?.contains(target))) {
        setDetailMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [detailMenuOpen]);

  useEffect(() => {
    if (view !== "detail") {
      setDetailMenuOpen(false);
    }
  }, [view]);

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
      setError(nextError instanceof Error ? nextError.message : t("devices.error.detailLoadFailed"));
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
      setMessage(t("devices.toast.scanned", { count: response.devices.length }));
      if (!selectedDeviceId && response.devices[0]) {
        setSelectedDeviceId(response.devices[0].id);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("devices.error.scanFailed"));
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
      setMessage(t("devices.toast.refreshedStatus"));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("devices.error.refreshStatusFailed"));
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
      setMessage(t("devices.toast.refreshedData"));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("devices.error.refreshFailed"));
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
      setMessage(t("devices.toast.restartSent"));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("devices.error.restartFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleClearLiveCount = async () => {
    if (!selectedDeviceId) {
      return;
    }
    if (detail && !detail.online) {
      setError(t("region.err.offlineClearLiveCount"));
      return;
    }
    try {
      setBusy(true);
      setError("");
      const response = await clearLiveCount(selectedDeviceId);
      setDetail(response.detail);
      await Promise.all([loadDevices(), loadOverview()]);
      setMessage(t("region.msg.liveCountCleared"));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("region.err.clearLiveCountFailed"));
    } finally {
      setBusy(false);
    }
  };

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const stopRadarRecording = async (options?: { download?: boolean; silent?: boolean }) => {
    const stop = recorderStopRef.current;
    recorderStopRef.current = null;
    clearRecordingTimer();
    setRecording(false);
    setRecordingElapsedMs(0);
    if (!stop) {
      return;
    }
    try {
      const blob = await stop();
      if (options?.download !== false && blob.size > 0) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const devicePart = (selectedDevice?.deviceNo ?? selectedDeviceId ?? "device").toString();
        downloadBlob(blob, `mmwave-${devicePart}-${stamp}.webm`);
        if (!options?.silent) {
          setMessage(t("detail.recording.saved"));
        }
      }
    } catch (nextError) {
      if (!options?.silent) {
        setError(nextError instanceof Error ? nextError.message : t("detail.recording.failed"));
      }
    }
  };

  const startRadarRecording = async () => {
    if (recording) {
      return;
    }
    const svg = detailRadarPanelRef.current?.querySelector("svg.radar-canvas-large") as SVGSVGElement | null;
    if (!svg) {
      setError(t("detail.recording.noPanel"));
      return;
    }
    try {
      setError("");
      const handles = await startPanelVideoRecorder(svg);
      recorderStopRef.current = handles.stop;
      setRecording(true);
      setRecordingElapsedMs(0);
      clearRecordingTimer();
      const startedAt = Date.now();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingElapsedMs(Date.now() - startedAt);
      }, 250);
      setMessage(t("detail.recording.started"));
    } catch (nextError) {
      recorderStopRef.current = null;
      setRecording(false);
      setError(nextError instanceof Error ? nextError.message : t("detail.recording.failed"));
    }
  };

  useEffect(() => {
    if (view === "detail") {
      return;
    }
    void stopRadarRecording({ download: false, silent: true });
  }, [view]);

  useEffect(() => () => {
    clearRecordingTimer();
    const stop = recorderStopRef.current;
    recorderStopRef.current = null;
    if (stop) {
      void stop().catch(() => undefined);
    }
  }, []);

  const navigateTo = (next: View) => {
    if (recording && next !== "detail") {
      setError(t("detail.recording.leaveBlocked"));
      return;
    }
    setView(next);
  };

  const handleBackToDashboard = () => {
    const returnPath = readDashboardReturnPath();

    try {
      if (returnPath) {
        // 同页 SPA：回到进入 Addon 前记录的仪表盘路由
        navigateHomeAssistantPath(returnPath);
        clearDashboardReturnPath();
        return;
      }
      // 无显式记录时，同页历史回退（dashboard → addon 的上一条）
      if (navigateHomeAssistantBack()) {
        return;
      }
    } catch {
      window.alert(t("overview.backToDashboard.failed"));
      navigateTo("overview");
      return;
    }

    window.alert(t("overview.backToDashboard.noReturn"));
    navigateTo("overview");
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

  const getDeviceDeploymentLabel = (device: StoredMmwaveDevice): string => device.deploymentName?.trim() || t("devices.deployment.unset");

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
      setError(t("devices.error.offlineCannotBind"));
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
      t("devices.confirm.unbind", { name: device.name }),
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
      setMessage(t("devices.toast.unbound", { name: device.name }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("devices.error.unbindFailed"));
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
      setError(t("devices.error.enterDeviceNo"));
      return;
    }
    if (isDuplicateDeviceNo(deviceNo, initializeWizard.deviceId)) {
      setError(t("devices.error.deviceNoExists"));
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
      setError(t("devices.error.offlineCannotFinishBind"));
      updateInitializeWizard({ submitting: false });
      return;
    }

    try {
      updateInitializeWizard({ submitting: true });
      setError("");
      const deviceNoMode = initializeWizard.deviceNoMode;
      const deviceNo = getWizardDeviceNo(initializeWizard);
      if (!deviceNo) {
        throw new Error(deviceNoMode === "custom" ? t("devices.error.enterCustomDeviceNo") : t("devices.error.autoDeviceNoInvalid"));
      }
      if (isDuplicateDeviceNo(deviceNo, initializeWizard.deviceId)) {
        throw new Error(t("devices.error.deviceNoExists"));
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
          t("devices.error.bindMismatch", {
            mode: deviceNoMode === "custom" ? t("devices.error.bindMode.custom") : t("devices.error.bindMode.auto"),
            expected: deviceNo,
            actual: boundDeviceNo || t("devices.error.bindEmpty"),
          }),
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
      setMessage(t("devices.toast.bound", { name: response.device.name }));
    } catch (nextError) {
      updateInitializeWizard({ submitting: false });
      setError(nextError instanceof Error ? nextError.message : t("devices.error.bindFailed"));
    }
  };

  const renderWelcome = () => (
    <div className="welcome-shell welcome-home">
      <div className="welcome-home-logo">
        <img src={welcomeLogo} alt="DFRobot" className="welcome-home-logo-image" />
      </div>
      <div className="welcome-home-center">
        <h1 className="welcome-home-title">mmWave Studio</h1>
        <button
          type="button"
          className="welcome-home-arrow"
          aria-label={t("welcome.enter")}
          title={t("welcome.enter")}
          onClick={() => {
            markConsoleEntered();
            setEntered(true);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );

  const renderSidebar = () => (
    <aside className="sidebar" aria-hidden={sidebarCollapsed}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <button
            type="button"
            className="sidebar-logo-button"
            aria-label={t("nav.home")}
            title={t("nav.home")}
            onClick={() => {
              if (recording) {
                setError(t("detail.recording.leaveBlocked"));
                return;
              }
              setEntered(false);
            }}
          >
            <img src="./ui_logo.svg" alt="DFRobot mmWave" className="brand-logo-image" />
          </button>
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeNav === item.id ? "nav-item nav-item-active" : "nav-item"}
            onClick={() => navigateTo(item.id)}
            disabled={recording}
            title={recording ? t("detail.recording.leaveBlocked") : undefined}
          >
            <span className="nav-badge">{item.short}</span>
            <span className="nav-label">{t(item.labelKey)}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <LanguageSwitch variant="sidebar" />
      </div>
    </aside>
  );

  const renderSidebarToggle = () => (
    <button
      type="button"
      className="sidebar-toggle"
      aria-label={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
      aria-expanded={!sidebarCollapsed}
      title={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
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
    ? t("nav.title.overview")
    : view === "device-management"
      ? t("nav.title.deviceManagement")
      : view === "region-management"
        ? t("nav.title.regionManagement")
        : (detail?.name ?? t("nav.title.deviceDetail"));

  const renderContentTopbar = () => (
    <div className="content-topbar">
      {renderSidebarToggle()}
      <div className="content-topbar-title">
        <h1>{pageTitle}</h1>
        {view === "detail" && selectedDevice ? (
          <span className="content-topbar-sub">{t("nav.deviceNo", { deviceNo: selectedDevice.deviceNo ?? "-" })}</span>
        ) : null}
      </div>
      <div className="content-topbar-actions page-actions">
        <button type="button" className="ghost-button" onClick={handleBackToDashboard} disabled={busy || recording}>
          {t("overview.backToDashboard")}
        </button>
        {view === "overview" ? (
          <>
            {overviewStale ? <span className="data-stale-badge">{t("overview.dataStale")}</span> : null}
            <button type="button" className="ghost-button" onClick={() => void bootstrap()} disabled={busy}>
              {t("overview.refresh")}
            </button>
            <button type="button" className="primary-button" onClick={() => navigateTo("device-management")}>
              {t("overview.addDevice")}
            </button>
          </>
        ) : null}
        {view === "device-management" ? (
          <>
            <button type="button" className="ghost-button" onClick={() => void handleRefreshDevices()} disabled={busy}>
              {t("devices.refresh")}
            </button>
            <button type="button" className="primary-button" onClick={() => void handleDiscover()} disabled={busy}>
              {t("devices.scan")}
            </button>
          </>
        ) : null}
        {view === "detail" ? (
          <>
            {recording ? (
              <button
                type="button"
                className="recording-stop-button"
                onClick={() => void stopRadarRecording({ download: true })}
              >
                <span className="recording-stop-dot" aria-hidden="true" />
                {t("detail.recording.stop", { time: formatRecordingClock(recordingElapsedMs) })}
              </button>
            ) : null}
            <button
              type="button"
              className="ghost-button"
              onClick={() => navigateTo("overview")}
              disabled={recording}
              title={recording ? t("detail.recording.leaveBlocked") : undefined}
            >
              {t("detail.backToOverview")}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => navigateTo("region-management")}
              disabled={recording}
              title={recording ? t("detail.recording.leaveBlocked") : undefined}
            >
              {t("detail.regionConfig")}
            </button>
            <div className="region-menu-wrap" ref={detailMenuWrapRef}>
              <button
                type="button"
                className="region-menu-btn"
                aria-label={t("detail.menu.more")}
                aria-expanded={detailMenuOpen}
                onClick={() => setDetailMenuOpen((value) => !value)}
              >
                ⋯
              </button>
              {detailMenuOpen ? (
                <div className="region-dropdown" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy || (detail != null && !detail.online)}
                    onClick={() => {
                      setDetailMenuOpen(false);
                      void handleClearLiveCount();
                    }}
                  >
                    {t("detail.menu.clearLiveCount")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={recording}
                    onClick={() => {
                      setDetailMenuOpen(false);
                      void startRadarRecording();
                    }}
                  >
                    {t("detail.menu.record")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy || !detail?.actions.canRefresh}
                    onClick={() => {
                      setDetailMenuOpen(false);
                      void handleRefreshDevice();
                    }}
                  >
                    {t("detail.menu.refresh")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy || !detail?.actions.canReset}
                    onClick={() => {
                      setDetailMenuOpen(false);
                      void handleResetDevice();
                    }}
                  >
                    {t("detail.menu.resetDevice")}
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  const renderDetail = () => (
    <section className="page detail-page">
      {detail ? (
        <div className="detail-layout">
          <section
            className={recording ? "panel detail-radar-panel is-recording" : "panel detail-radar-panel"}
            ref={(node) => {
              detailRadarPanelRef.current = node;
            }}
          >
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
            {recording ? (
              <div className="radar-recording-badge" aria-hidden="true">
                REC {formatRecordingClock(recordingElapsedMs)}
              </div>
            ) : null}
            {!detail.trajectoryAvailable ? <div className="degraded-banner">{t("detail.degradedBanner")}</div> : null}
          </section>
          <div className="detail-side">
            <section className="panel compact-panel detail-stat-panel">
              <div className="two-stat-row">
                <article>
                  <span>{t("detail.targetCount")}</span>
                  <strong>{detail.targetCount}</strong>
                </article>
                <article>
                  <span>{t("detail.liveCount")}</span>
                  <strong>{detail.liveCount}</strong>
                </article>
                <article>
                  <span>{t("detail.movingCount")}</span>
                  <strong>{detail.movingCount}</strong>
                </article>
                <article>
                  <span>{t("detail.staticCount")}</span>
                  <strong>{detail.staticCount}</strong>
                </article>
              </div>
            </section>

            <section className="panel compact-panel detail-io-panel">
              <div className="section-title">{t("detail.ioStatus")}</div>
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
              <div className="detail-panel-tabs" role="tablist" aria-label={t("detail.tabs.aria")}>
                <button type="button" role="tab" aria-selected={detailPanelTab === "basics"} className={detailPanelTab === "basics" ? "active" : ""} onClick={() => setDetailPanelTab("basics")}>{t("detail.tabs.basics")}</button>
                <button type="button" role="tab" aria-selected={detailPanelTab === "logs"} className={detailPanelTab === "logs" ? "active" : ""} onClick={() => setDetailPanelTab("logs")}>{t("detail.tabs.logs")}</button>
              </div>
              <div className="detail-info-body">
                {detailPanelTab === "basics" ? <div className="basic-list">
                  {detail.basics.map((item) => (
                      <div key={item.key} className="basic-item">
                        <span>{localizeBasicLabel(item, t)}</span>
                        <strong>{localizeBasicValue(item.key, item.value, t)}</strong>
                      </div>
                    ))}
                </div> : <DeviceLogPanel
                  deviceId={detail.id}
                  online={detail.online}
                  refreshToken={deviceLogRefreshToken}
                  memoryEntries={memoryLogEntries}
                  deploymentName={detail.deploymentName}
                  onError={setError}
                />}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <strong>{t("detail.empty.title")}</strong>
          <span>{t("detail.empty.hint")}</span>
        </div>
      )}
    </section>
  );

  const renderDeviceManagement = () => (
    <section className="page">
      <div className="stats-grid device-management-stats">
        <article className="stat-card">
          <span>{t("devices.stat.scanResult")}</span>
          <strong>
            {deviceManagementStats.scanResultCount}
            <small>{t("devices.stat.unit")}</small>
          </strong>
        </article>
        <article className="stat-card">
          <span>{t("devices.stat.online")}</span>
          <strong>
            {deviceManagementStats.onlineCount}
            <small>{t("devices.stat.unit")}</small>
          </strong>
        </article>
        <article className="stat-card">
          <span>{t("devices.stat.uninitialized")}</span>
          <strong>
            {deviceManagementStats.uninitializedCount}
            <small>{t("devices.stat.unit")}</small>
          </strong>
        </article>
      </div>
      <section className="panel">
        <div className="device-table-wrap">
          {deviceManagementDevices.length ? (
            <table className="device-table">
              <thead>
                <tr>
                  <th>{t("devices.table.name")}</th>
                  <th>{t("devices.table.deployment")}</th>
                  <th>{t("devices.table.deviceNo")}</th>
                  <th>{t("devices.table.type")}</th>
                  <th>{t("devices.table.status")}</th>
                  <th>{t("devices.table.actions")}</th>
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
                              title={canInitialize ? undefined : t("devices.action.initializeOfflineTitle")}
                            >
                              {t("devices.action.initialize")}
                            </button>
                          ) : null}
                          {canViewDetail ? (
                            <button type="button" className="table-action-button" onClick={() => handleOpenDevice(device.id)}>
                              {t("devices.action.viewDetail")}
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button type="button" className="table-action-button danger" onClick={() => void handleDeleteDevice(device)} disabled={busy}>
                              {t("devices.action.unbind")}
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
            <div className="empty-inline">{t("devices.empty")}</div>
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
            onDevicesChanged={async () => {
              await Promise.all([
                loadDevices(),
                loadOverview(),
                selectedDeviceId ? loadDetail(selectedDeviceId) : Promise.resolve(),
              ]);
            }}
            onBackToOverview={() => {
              const deviceId = selectedDevice?.id ?? selectedDeviceId;
              if (deviceId) {
                handleOpenDevice(deviceId);
                return;
              }
              navigateTo("overview");
            }}
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
                <h3 id="initialize-device-title">{t("devices.wizard.title")}</h3>
              </div>
              <button type="button" className="modal-close" onClick={closeInitializeWizard}>
                {t("devices.wizard.close")}
              </button>
            </div>
            <div className="wizard-steps">
              <span className={initializeWizard.step >= 1 ? "wizard-step wizard-step-active" : "wizard-step"}>{t("devices.wizard.step.bind")}</span>
              <span className={initializeWizard.step >= 2 ? "wizard-step wizard-step-active" : "wizard-step"}>{t("devices.wizard.step.install")}</span>
              <span className={initializeWizard.step >= 3 ? "wizard-step wizard-step-active" : "wizard-step"}>{t("devices.wizard.step.detection")}</span>
            </div>
            {initializeWizard.step === 1 ? (
              <div className="modal-body">
                <div className="wizard-summary">
                  <div>
                    <span>{t("devices.table.name")}</span>
                    <strong>{initializeWizard.name || t("devices.wizard.unset")}</strong>
                  </div>
                  <div>
                    <span>{t("devices.wizard.deployment")}</span>
                    <strong>{initializeWizard.deploymentName || t("devices.wizard.unset")}</strong>
                  </div>
                </div>
                <div className="segmented-control" role="group" aria-label={t("devices.wizard.deviceNoMode.aria")}>
                  <button
                    type="button"
                    className={initializeWizard.deviceNoMode === "auto" ? "segment-button segment-button-active" : "segment-button"}
                    onClick={() => updateInitializeWizard({
                      deviceNoMode: "auto",
                      // 只刷新自动号，不改动已输入的自定义号
                      autoDeviceNo: initializeWizard.autoDeviceNo || getSuggestedDeviceNo(),
                    })}
                  >
                    {t("devices.wizard.deviceNoMode.auto")}
                  </button>
                  <button
                    type="button"
                    className={initializeWizard.deviceNoMode === "custom" ? "segment-button segment-button-active" : "segment-button"}
                    onClick={() => updateInitializeWizard({
                      deviceNoMode: "custom",
                      // 不把自动号填进自定义输入框，两套完全分开
                    })}
                  >
                    {t("devices.wizard.deviceNoMode.custom")}
                  </button>
                </div>
                {initializeWizard.deviceNoMode === "custom" ? (
                  <label className="modal-field">
                    <span>{t("devices.wizard.customDeviceNo")}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={initializeWizard.customDeviceNo}
                      onChange={(event) => {
                        updateInitializeWizard({
                          customDeviceNo: normalizeDeviceNoInput(event.target.value),
                        });
                      }}
                      placeholder={t("devices.wizard.customPlaceholder")}
                    />
                  </label>
                ) : (
                  <div className="readonly-field">
                    <span>{t("devices.wizard.autoDeviceNo")}</span>
                    <strong>{initializeWizard.autoDeviceNo || getSuggestedDeviceNo()}</strong>
                  </div>
                )}
              </div>
            ) : null}
            {initializeWizard.step === 2 ? (
              <div className="modal-body">
                <div className="wizard-summary">
                  <div>
                    <span>{t("devices.wizard.installMethod")}</span>
                    <strong>{t("devices.wizard.installMethod.side")}</strong>
                  </div>
                  <div>
                    <span>{t("devices.wizard.installAngle")}</span>
                    <strong>0°</strong>
                  </div>
                </div>
                <label className="modal-field range-field">
                  <span>{t("devices.wizard.installHeight")}</span>
                  <strong>{initializeWizard.installHeightM.toFixed(2)} m</strong>
                  <input
                    type="range"
                    min="1.6"
                    max="2"
                    step="0.01"
                    value={initializeWizard.installHeightM}
                    onChange={(event) => updateInitializeWizard({ installHeightM: Number(event.target.value) })}
                  />
                  <small>{t("devices.wizard.installHeightRange")}</small>
                </label>
              </div>
            ) : null}
            {initializeWizard.step === 3 ? (
              <div className="modal-body">
                <div className="mode-options">
                  {([1, 2] as const).map((mode) => {
                    const modeMeta = detectionModeMeta[mode];
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={initializeWizard.detectionMode === mode ? "mode-option mode-option-active" : "mode-option"}
                        onClick={() => updateInitializeWizard({ detectionMode: mode })}
                      >
                        <strong>{t(modeMeta.titleKey)}</strong>
                        <span>{t(modeMeta.descriptionKey)}</span>
                        <small>
                          {t("devices.wizard.mode.meta", { frames: modeMeta.frames, unoccupiedTime: modeMeta.unoccupiedTime })}
                        </small>
                      </button>
                    );
                  })}
                </div>
                <div className="wizard-success">
                  <strong>{initializeWizard.completed ? t("devices.wizard.completedTitle") : t("devices.wizard.confirmTitle")}</strong>
                  <span>
                    {initializeWizard.deviceNoMode === "custom" ? t("devices.wizard.summary.customDeviceNo") : t("devices.wizard.summary.autoDeviceNo")}：
                    {getWizardDeviceNo(initializeWizard)}
                  </span>
                  <span>{t("devices.wizard.summary.installHeight", { height: initializeWizard.installHeightM.toFixed(2) })}</span>
                </div>
              </div>
            ) : null}
            <div className="modal-actions">
              {initializeWizard.step === 1 ? (
                <>
                  <button type="button" className="table-action-button" onClick={closeInitializeWizard}>
                    {t("devices.wizard.cancel")}
                  </button>
                  <button
                    type="button"
                    className="table-action-button primary"
                    onClick={handleInitializeStepOneNext}
                    disabled={initializeWizard.deviceNoMode === "custom" && !initializeWizard.customDeviceNo.trim()}
                  >
                    {t("devices.wizard.next")}
                  </button>
                </>
              ) : null}
              {initializeWizard.step === 2 ? (
                <>
                  <button type="button" className="table-action-button" onClick={() => updateInitializeWizard({ step: 1 })} disabled={initializeWizard.submitting}>
                    {t("devices.wizard.prev")}
                  </button>
                  <button type="button" className="table-action-button primary" onClick={() => updateInitializeWizard({ step: 3 })} disabled={initializeWizard.submitting}>
                    {t("devices.wizard.next")}
                  </button>
                </>
              ) : null}
              {initializeWizard.step === 3 ? (
                initializeWizard.completed ? (
                  <button type="button" className="table-action-button primary" onClick={closeInitializeWizard}>
                    {t("devices.wizard.done")}
                  </button>
                ) : (
                  <>
                    <button type="button" className="table-action-button" onClick={() => updateInitializeWizard({ step: 2 })} disabled={initializeWizard.submitting}>
                      {t("devices.wizard.prev")}
                    </button>
                    <button type="button" className="table-action-button primary" onClick={() => void handleSubmitInitializeWizard()} disabled={initializeWizard.submitting}>
                      {initializeWizard.submitting ? t("devices.wizard.submitting") : t("devices.wizard.submit")}
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
