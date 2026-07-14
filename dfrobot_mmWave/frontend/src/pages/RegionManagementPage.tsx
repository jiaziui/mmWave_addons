import { useEffect, useRef, useState } from "react";
import {
  fetchDeviceConfig,
  fetchDeviceDetail,
  fetchUserBaseMaps,
  updateDeviceConfig,
  userBaseMapUrl,
  type BaseMapInstance,
  type C4004DeviceSettings,
  type MmwaveDeviceConfig,
  type MmwaveDeviceDetail,
  type RegionDefinition,
  type RegionGeometry,
  type RegionType,
  type StoredMmwaveDevice,
  type StoredRegionConfig,
  type UserBaseMapAsset,
} from "../api/client";
import deviceIcon from "../../resource/device_c4004.svg";
import {
  canConfirmCustomRange,
  findAvailableRegionIndex,
  normalizeRegionDefinition,
  updateGeometryCenter,
  validateRegionDefinition,
} from "../utils/regionGeometry";
import { createClientId } from "../utils/clientId";
import {
  buildDetectionExportPayload,
  buildRegionExportPayload,
  downloadJson,
  formatRegionLiveInfo,
  getDetectionHint,
  MCU_IO_OPTIONS,
  parseImportedDetection,
  parseImportedRegions,
  type ImportedBackgroundSource,
} from "../utils/regionManagement";

const systemModules = import.meta.glob("../../resource/base_map/system/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

type Panel = "regions" | "detection" | "parameters" | "background" | "edit" | null;
type LibraryAsset = { id: string; sourceType: "system" | "user"; name: string; url: string };
type PointerMoveSample = { pointerId: number; clientX: number; clientY: number; currentTarget: SVGSVGElement };
type DragState =
  | { kind: "pan"; pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number }
  | { kind: "region"; pointerId: number; regionId: string; startWorldX: number; startWorldY: number; geometry: RegionGeometry }
  | { kind: "region-resize"; pointerId: number; regionId: string; handle: string; geometry: RegionGeometry }
  | { kind: "detection-resize"; pointerId: number; handle: "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw"; rect: { xMin: number; xMax: number; yMin: number; yMax: number } }
  | { kind: "background"; pointerId: number; instanceId: string; startWorldX: number; startWorldY: number; instance: BaseMapInstance }
  | { kind: "background-resize"; pointerId: number; instanceId: string; instance: BaseMapInstance }
  | null;

const REGION_COLORS: Record<RegionType, string> = {
  status_detection: "#FFA94D",
  noise: "#69DB7C",
  approach_depart: "#4DABF7",
  boundary: "#FF6B6B",
  empty_tag: "#9AA5B8",
};

const BASE_CELL = 40;
const MIN_CELL = 16;
const MAX_CELL = 160;
const ZOOM_FACTOR = 1.1;

const REGION_LABELS: Record<RegionType, string> = {
  status_detection: "状态检测",
  noise: "噪点",
  approach_depart: "靠近远离",
  boundary: "边界检测",
  empty_tag: "空标签",
};

const PARAM_DEFAULTS: C4004DeviceSettings = {
  trajectoryLed: true,
  motionLed: true,
  realTimePeopleTime: 2,
  trackMeters: 50,
  trackExistsTime: 10,
  unmannedTime: 5,
  checkToActiveFrames: 3,
};

const parameterFields = [
  { key: "realTimePeopleTime", label: "实时人数上报时间 (/s)", min: 1, max: 120 },
  { key: "trackMeters", label: "轨迹产生米数 (/cm)", min: 1, max: 1000 },
  { key: "trackExistsTime", label: "轨迹存在时间 (/s)", min: 1, max: 3600 },
  { key: "unmannedTime", label: "无人时间 (/s)", min: 0, max: 3600 },
  { key: "checkToActiveFrames", label: "连续确认帧数", min: 1, max: 64 },
] as const;

const cloneConfig = (config: StoredRegionConfig): StoredRegionConfig => structuredClone(config);
const centerOf = (geometry: RegionGeometry) => ({ x: geometry.centerXCm, y: geometry.centerYCm });
/** Stable place width so every asset lands at the same physical size (aspect from image). */
const BACKGROUND_PLACE_WIDTH_CM = 200;
const BACKGROUND_WHEEL_STEP_PX = 48;
const readImageNaturalSize = (url: string): Promise<{ width: number; height: number }> => new Promise((resolve) => {
  const image = new Image();
  image.onload = () => resolve({
    width: image.naturalWidth > 0 ? image.naturalWidth : 400,
    height: image.naturalHeight > 0 ? image.naturalHeight : 250,
  });
  image.onerror = () => resolve({ width: 400, height: 250 });
  image.src = url;
});
const backgroundSizeFromNatural = (naturalWidth: number, naturalHeight: number) => {
  const ratio = Math.max(0.1, (naturalWidth || 400) / Math.max(1, naturalHeight || 250));
  const widthCm = BACKGROUND_PLACE_WIDTH_CM;
  const heightCm = Math.max(40, Math.round(widthCm / ratio));
  return { widthCm, heightCm };
};

type BackgroundCatalogItem = {
  key: string;
  name: string;
  url: string;
  kind: "imported" | "asset";
  id: string;
  sourceType?: "system" | "user";
  naturalWidth?: number;
  naturalHeight?: number;
};

const systemAssets: LibraryAsset[] = Object.entries(systemModules).map(([filePath, url]) => ({
  id: filePath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? filePath,
  sourceType: "system",
  name: decodeURIComponent(filePath.split("/").pop() ?? "官方底图"),
  url,
}));

export function RegionManagementPage({
  devices,
  selectedDeviceId,
  onSelectDevice,
  onMessage,
  onError,
}: {
  devices: StoredMmwaveDevice[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const boundDevices = devices.filter((device) => device.initialized && device.deviceNo);
  const selectedDevice = boundDevices.find((device) => device.id === selectedDeviceId) ?? boundDevices[0] ?? null;
  const [deviceConfig, setDeviceConfig] = useState<MmwaveDeviceConfig | null>(null);
  const [detail, setDetail] = useState<MmwaveDeviceDetail | null>(null);
  const [userAssets, setUserAssets] = useState<UserBaseMapAsset[]>([]);
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [regionDraft, setRegionDraft] = useState<RegionDefinition | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [backgroundVisible, setBackgroundVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [importedBackgroundSources, setImportedBackgroundSources] = useState<ImportedBackgroundSource[]>([]);
  const [selectedImportedSourceId, setSelectedImportedSourceId] = useState<string | null>(null);
  const [backgroundMessage, setBackgroundMessage] = useState("可导入图片并添加到坐标系");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [cellSize, setCellSize] = useState(BASE_CELL);
  const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [dragState, setDragState] = useState<DragState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const configImportRef = useRef<HTMLInputElement>(null);
  const pendingConfigImportType = useRef<"detection" | "regions" | null>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const baseMapLibraryRef = useRef<HTMLDivElement>(null);
  const sideColumnRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<MmwaveDeviceConfig | null>(null);
  const detailLoadingRef = useRef(false);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; cellSize: number; worldX: number; worldY: number } | null>(null);
  const viewportCenteredRef = useRef(false);
  const pointerMoveFrameRef = useRef<number | null>(null);
  const pendingPointerMoveRef = useRef<PointerMoveSample | null>(null);

  const setCurrentConfig = (next: MmwaveDeviceConfig | null) => {
    configRef.current = next;
    setDeviceConfig(next);
  };

  useEffect(() => {
    if (boundDevices[0] && !boundDevices.some((device) => device.id === selectedDeviceId)) {
      onSelectDevice(boundDevices[0].id);
    }
  }, [selectedDeviceId, boundDevices.length]);

  useEffect(() => {
    if (!selectedDevice) {
      setCurrentConfig(null);
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSelectedRegionId(null);
    setSelectedBackgroundId(null);
    setActivePanel(null);
    setDevicePickerOpen(false);
    viewportCenteredRef.current = false;
    Promise.allSettled([fetchDeviceConfig(selectedDevice.id), fetchDeviceDetail(selectedDevice.id), fetchUserBaseMaps()])
      .then(([configResult, detailResult, mapsResult]) => {
        if (cancelled) return;
        if (configResult.status === "rejected") throw configResult.reason;
        setCurrentConfig(configResult.value.config);
        setDetail(detailResult.status === "fulfilled" ? detailResult.value.detail : null);
        setUserAssets(mapsResult.status === "fulfilled" ? mapsResult.value.assets : []);
        setDirty(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) onError(error instanceof Error ? error.message : "区域配置加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedDevice?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setCanvasSize({ width: rect.width, height: rect.height });
      if (!viewportCenteredRef.current) {
        setCellSize(BASE_CELL);
        setViewportOffset({ x: rect.width / 2, y: rect.height / 2 });
        viewportCenteredRef.current = true;
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [selectedDevice?.id, loading]);

  useEffect(() => () => {
    if (pointerMoveFrameRef.current !== null) window.cancelAnimationFrame(pointerMoveFrameRef.current);
  }, []);

  useEffect(() => {
    if (!selectedDevice) return;
    const refresh = async () => {
      if (detailLoadingRef.current || document.hidden) return;
      detailLoadingRef.current = true;
      try {
        const response = await fetchDeviceDetail(selectedDevice.id);
        setDetail(response.detail);
      } catch {
        // Keep the last successful runtime state visible.
      } finally {
        detailLoadingRef.current = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [selectedDevice?.id]);

  const readOnly = !detail?.online;
  const regionConfig = deviceConfig?.regionConfig ?? null;
  const libraryAssets: LibraryAsset[] = [
    ...systemAssets,
    ...userAssets.map((asset) => ({
      id: asset.id,
      sourceType: "user" as const,
      name: asset.originalName,
      url: userBaseMapUrl(asset.id),
    })),
  ];
  const sourceUrl = (sourceType: "system" | "user", sourceId: string) => {
    const imported = importedBackgroundSources.find((entry) => entry.id === sourceId);
    if (imported) return imported.url;
    return libraryAssets.find((asset) => asset.sourceType === sourceType && asset.id === sourceId)?.url ?? "";
  };

  const importBackgroundFile = (file: File) => {
    if (readOnly) return;
    if (!file.type.startsWith("image/")) {
      setBackgroundMessage("请选择图片文件");
      return;
    }
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      const source: ImportedBackgroundSource = {
        id: createClientId(),
        name: file.name,
        url,
        naturalWidth: probe.naturalWidth,
        naturalHeight: probe.naturalHeight,
      };
      setImportedBackgroundSources((current) => [...current, source]);
      setSelectedImportedSourceId(source.id);
      setActivePanel("background");
      setBackgroundVisible(true);
      setBackgroundMessage("图片已导入，请选中后点击添加");
      onMessage("图片已导入到底图库");
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setBackgroundMessage("图片加载失败");
      onError("图片加载失败");
    };
    probe.src = url;
  };

  const persistRegionConfig = async (
    nextRegionConfig: StoredRegionConfig,
    apply?: { fourSidedRange?: boolean; regionMcuIo?: boolean },
  ) => {
    if (!selectedDevice || !deviceConfig || readOnly) return false;
    const optimistic = { ...deviceConfig, regionConfig: nextRegionConfig };
    setCurrentConfig(optimistic);
    setSaving(true);
    try {
      const response = await updateDeviceConfig(selectedDevice.id, { regionConfig: nextRegionConfig, apply });
      setCurrentConfig(response.config);
      try {
        const detailResponse = await fetchDeviceDetail(selectedDevice.id);
        setDetail(detailResponse.detail);
      } catch {
        // The saved configuration remains authoritative if runtime refresh is unavailable.
      }
      setDirty(false);
      if (response.applyResult.warnings.length) {
        onError(response.applyResult.warnings.join("；"));
      } else {
        onMessage("区域配置已保存");
      }
      return true;
    } catch (error) {
      setDirty(true);
      onError(error instanceof Error ? error.message : "区域配置保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateSettings = async (updates: C4004DeviceSettings) => {
    if (!selectedDevice || !deviceConfig || readOnly) return;
    setSaving(true);
    try {
      const response = await updateDeviceConfig(selectedDevice.id, { deviceSettings: updates });
      setCurrentConfig(response.config);
      onMessage("设备参数已同步");
    } catch (error) {
      onError(error instanceof Error ? error.message : "设备参数同步失败");
    } finally {
      setSaving(false);
    }
  };

  const togglePanel = (panel: Exclude<Panel, "edit">) => {
    setActivePanel((current) => current === panel ? null : panel);
    setRegionDraft(null);
    setSelectedRegionId(null);
    if (panel === "background") {
      setBackgroundVisible(true);
    }
    if (panel !== "background") setSelectedBackgroundId(null);
  };

  const selectRegion = (region: RegionDefinition) => {
    setSelectedRegionId(region.id);
    setRegionDraft(structuredClone(region));
    setActivePanel("edit");
  };

  const updateRegionDraft = (next: RegionDefinition) => {
    setRegionDraft(next);
    setDirty(true);
  };

  const addRegion = () => {
    if (!regionConfig || readOnly || regionConfig.regions.length >= 32) return;
    const index = findAvailableRegionIndex(regionConfig.regions);
    if (index === null) return;
    const scale = cellSize / 50;
    const centerX = Math.round((canvasSize.width / 2 - viewportOffset.x) / scale);
    const centerY = Math.round((viewportOffset.y - canvasSize.height / 2) / scale);
    const region: RegionDefinition = {
      id: createClientId(),
      index,
      label: `新建区域-${index + 1}`,
      regionType: "status_detection",
      geometry: { shape: "rect", centerXCm: centerX, centerYCm: centerY, widthCm: 200, heightCm: 150 },
      ioIndex: 0,
      mcuIo: -1,
      x: centerX / 100,
      y: centerY / 100,
      enabled: true,
      visible: true,
    };
    const next = cloneConfig(regionConfig);
    next.regions.push(region);
    setCurrentConfig({ ...deviceConfig!, regionConfig: next });
    setDirty(true);
    selectRegion(region);
  };

  const saveRegionDraft = async () => {
    if (!regionConfig || !regionDraft) return;
    const validationError = validateRegionDefinition(regionDraft, regionConfig.regions);
    if (validationError) {
      onError(validationError);
      return;
    }
    const next = cloneConfig(regionConfig);
    const normalizedDraft = normalizeRegionDefinition(regionDraft);
    const targetIndex = next.regions.findIndex((region) => region.id === normalizedDraft.id);
    if (targetIndex >= 0) next.regions[targetIndex] = normalizedDraft;
    else next.regions.push(normalizedDraft);
    const saved = await persistRegionConfig(next, { regionMcuIo: normalizedDraft.regionType === "status_detection" && normalizedDraft.index < 6 });
    if (saved) {
      setSelectedRegionId(normalizedDraft.id);
      setRegionDraft(null);
      setActivePanel("regions");
    }
  };

  const requestDeleteRegion = (regionId: string, label: string) => {
    if (readOnly) return;
    setDeleteTarget({ id: regionId, label });
  };

  const confirmDeleteRegion = async () => {
    if (!regionConfig || !deleteTarget) return;
    const next = cloneConfig(regionConfig);
    next.regions = next.regions.filter((region) => region.id !== deleteTarget.id);
    await persistRegionConfig(next);
    setSelectedRegionId(null);
    setRegionDraft(null);
    setActivePanel("regions");
    setDeleteTarget(null);
  };

  const handleConfigImport = async (file: File) => {
    if (!deviceConfig || !regionConfig || readOnly) return;
    const importType = pendingConfigImportType.current;
    pendingConfigImportType.current = null;
    if (!importType) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      if (importType === "detection") {
        const next = cloneConfig(regionConfig);
        next.detection = parseImportedDetection(payload, regionConfig.detection);
        next.rangeBox = {
          xMin: next.detection.rectCm.xMin / 100,
          xMax: next.detection.rectCm.xMax / 100,
          yMin: next.detection.rectCm.yMin / 100,
          yMax: next.detection.rectCm.yMax / 100,
        };
        await persistRegionConfig(next, { fourSidedRange: next.detection.appliedMode === "rect" });
        onMessage("探测范围配置已导入");
        return;
      }
      const regions = parseImportedRegions(payload);
      const next = cloneConfig(regionConfig);
      next.regions = regions;
      await persistRegionConfig(next);
      setSelectedRegionId(null);
      setRegionDraft(null);
      setActivePanel("regions");
      onMessage("标签区域配置已导入");
    } catch (error) {
      onError(error instanceof Error ? error.message : "配置导入失败");
    }
  };

  const handleMenuAction = (action: "import-image" | "import-detection" | "export-detection" | "import-regions" | "export-regions") => {
    setMenuOpen(false);
    if (!selectedDevice || !regionConfig) return;
    if (action === "import-image") {
      fileInputRef.current?.click();
      return;
    }
    if (action === "export-detection") {
      downloadJson(
        `device-${selectedDevice.deviceNo ?? selectedDevice.id}-detection-range.json`,
        buildDetectionExportPayload(selectedDevice.deviceNo, regionConfig.detection),
      );
      return;
    }
    if (action === "export-regions") {
      downloadJson(
        `device-${selectedDevice.deviceNo ?? selectedDevice.id}-tag-regions.json`,
        buildRegionExportPayload(selectedDevice.deviceNo, regionConfig),
      );
      return;
    }
    pendingConfigImportType.current = action === "import-detection" ? "detection" : "regions";
    configImportRef.current?.click();
  };

  const backgroundCatalog: BackgroundCatalogItem[] = [
    ...importedBackgroundSources.map((source) => ({
      key: `imported:${source.id}`,
      name: source.name,
      url: source.url,
      kind: "imported" as const,
      id: source.id,
      naturalWidth: source.naturalWidth,
      naturalHeight: source.naturalHeight,
    })),
    ...libraryAssets.map((asset) => ({
      key: `asset:${asset.id}`,
      name: asset.name,
      url: asset.url,
      kind: "asset" as const,
      id: asset.id,
      sourceType: asset.sourceType,
    })),
  ];

  const currentCatalogIndex = (() => {
    const key = selectedImportedSourceId
      ? `imported:${selectedImportedSourceId}`
      : selectedAssetId
        ? `asset:${selectedAssetId}`
        : null;
    if (!key) return backgroundCatalog.length ? 0 : -1;
    const index = backgroundCatalog.findIndex((item) => item.key === key);
    return index >= 0 ? index : backgroundCatalog.length ? 0 : -1;
  })();

  const currentCatalogItem = currentCatalogIndex >= 0 ? backgroundCatalog[currentCatalogIndex] : null;

  const selectBackgroundSourceByKey = (key: string) => {
    if (key.startsWith("imported:")) {
      setSelectedImportedSourceId(key.slice("imported:".length));
      setSelectedAssetId(null);
    } else {
      setSelectedAssetId(key.slice("asset:".length));
      setSelectedImportedSourceId(null);
    }
    setBackgroundMessage("左右翻页浏览素材，点「添加」或双击放入画布（统一约 2m 宽）");
  };

  const stepBackgroundCatalog = (delta: number) => {
    if (!backgroundCatalog.length) return;
    const base = currentCatalogIndex >= 0 ? currentCatalogIndex : 0;
    const nextIndex = (base + delta + backgroundCatalog.length) % backgroundCatalog.length;
    selectBackgroundSourceByKey(backgroundCatalog[nextIndex].key);
  };

  const placeBackgroundItem = async (item: BackgroundCatalogItem) => {
    if (!regionConfig || readOnly) return;
    const natural = item.kind === "imported" && item.naturalWidth && item.naturalHeight
      ? { width: item.naturalWidth, height: item.naturalHeight }
      : await readImageNaturalSize(item.url);
    const { widthCm, heightCm } = backgroundSizeFromNatural(natural.width, natural.height);
    const instanceId = createClientId();
    const scale = cellSize / 50;
    const viewportCenterXCm = (canvasSize.width / 2 - viewportOffset.x) / scale;
    const viewportCenterYCm = (viewportOffset.y - canvasSize.height / 2) / scale;
    const next = cloneConfig(regionConfig);
    next.backgroundInstances.push({
      id: instanceId,
      sourceType: item.kind === "imported" ? "user" : (item.sourceType ?? "system"),
      sourceId: item.id,
      xCm: Math.round(viewportCenterXCm - widthCm / 2),
      yCm: Math.round(viewportCenterYCm - heightCm / 2),
      widthCm,
      heightCm,
      visible: true,
      zIndex: next.backgroundInstances.length,
    });
    const saved = await persistRegionConfig(next);
    if (saved) {
      setSelectedBackgroundId(instanceId);
      setBackgroundVisible(true);
      setBackgroundMessage("已添加（统一宽约 2m）。拖动/缩放手柄调位置与大小，Delete 删除");
      onMessage("底图已添加到当前设备画布");
    }
  };

  const addSelectedBackground = async () => {
    if (!currentCatalogItem) {
      setBackgroundMessage("暂无素材可添加");
      return;
    }
    await placeBackgroundItem(currentCatalogItem);
  };

  const toggleRegionVisibility = async (regionId: string) => {
    if (!regionConfig || readOnly) return;
    const next = cloneConfig(regionConfig);
    const region = next.regions.find((entry) => entry.id === regionId);
    if (!region) return;
    region.visible = !region.visible;
    await persistRegionConfig(next);
  };

  useEffect(() => {
    if (activePanel !== "background" || !backgroundCatalog.length) return;
    if (!selectedImportedSourceId && !selectedAssetId) {
      selectBackgroundSourceByKey(backgroundCatalog[0].key);
    }
  }, [activePanel, backgroundCatalog.length]);

  useEffect(() => {
    const column = sideColumnRef.current;
    if (!column) return;
    const stopWheelBubble = (event: WheelEvent) => {
      event.stopPropagation();
    };
    column.addEventListener("wheel", stopWheelBubble, { passive: true, capture: true });
    return () => column.removeEventListener("wheel", stopWheelBubble, true);
  }, []);

  useEffect(() => {
    const stage = baseMapLibraryRef.current;
    if (!stage || activePanel !== "background") return;
    let wheelAccum = 0;
    const onWheel = (event: WheelEvent) => {
      if (!backgroundCatalog.length) return;
      event.preventDefault();
      event.stopPropagation();
      wheelAccum += event.deltaY;
      if (Math.abs(wheelAccum) < BACKGROUND_WHEEL_STEP_PX) return;
      const direction = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      stepBackgroundCatalog(direction);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [activePanel, currentCatalogIndex, backgroundCatalog.length]);

  useEffect(() => {
    if (activePanel !== "background") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepBackgroundCatalog(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepBackgroundCatalog(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel, currentCatalogIndex, backgroundCatalog.length]);

  useEffect(() => {
    if (activePanel !== "background" || currentCatalogIndex < 0) return;
    const activeThumb = baseMapLibraryRef.current?.querySelector<HTMLElement>(".bg-film-thumb.active");
    activeThumb?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activePanel, currentCatalogIndex]);

  const removeBackgroundInstance = async (instanceId: string) => {
    if (!regionConfig || readOnly) return;
    const next = cloneConfig(regionConfig);
    next.backgroundInstances = next.backgroundInstances.filter((instance) => instance.id !== instanceId);
    await persistRegionConfig(next);
    setSelectedBackgroundId(null);
  };

  useEffect(() => {
    const handleBackgroundDelete = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (activePanel !== "background" || !selectedBackgroundId || readOnly) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      event.preventDefault();
      void removeBackgroundInstance(selectedBackgroundId);
    };
    window.addEventListener("keydown", handleBackgroundDelete);
    return () => window.removeEventListener("keydown", handleBackgroundDelete);
  }, [activePanel, readOnly, selectedBackgroundId, regionConfig]);

  const toWorld = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas || !regionConfig) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scale = cellSize / 50;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return {
      x: (x - viewportOffset.x) / scale,
      y: (viewportOffset.y - y) / scale,
    };
  };

  const updateRegionGeometry = (regionId: string, geometry: RegionGeometry) => {
    const current = configRef.current;
    if (!current) return;
    const next = cloneConfig(current.regionConfig);
    const region = next.regions.find((entry) => entry.id === regionId);
    if (!region) return;
    region.geometry = geometry;
    region.x = geometry.centerXCm / 100;
    region.y = geometry.centerYCm / 100;
    setCurrentConfig({ ...current, regionConfig: next });
    setRegionDraft((draft) => draft?.id === regionId ? { ...draft, geometry, x: region.x, y: region.y } : draft);
    setDirty(true);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!regionConfig) return;
    touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touchPointsRef.current.size === 2) {
      const points = [...touchPointsRef.current.values()];
      const canvasRect = event.currentTarget.getBoundingClientRect();
      const midpointX = (points[0].x + points[1].x) / 2 - canvasRect.left;
      const midpointY = (points[0].y + points[1].y) / 2 - canvasRect.top;
      const scale = cellSize / 50;
      pinchRef.current = {
        distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        cellSize,
        worldX: (midpointX - viewportOffset.x) / scale,
        worldY: (viewportOffset.y - midpointY) / scale,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const target = event.target as Element;
    const world = toWorld(event);
    const resizeTarget = target.closest<SVGElement>("[data-region-resize]");
    const detectionResize = target.closest<SVGElement>("[data-detection-handle]");
    const regionTarget = target.closest<SVGElement>("[data-region-id]");
    const backgroundResize = target.closest<SVGElement>("[data-bg-resize]");
    const backgroundTarget = target.closest<SVGElement>("[data-bg-id]");
    if (!readOnly && activePanel === "detection" && detectionResize && regionConfig.detection.mode === "rect") {
      setDragState({
        kind: "detection-resize",
        pointerId: event.pointerId,
        handle: detectionResize.dataset.detectionHandle as "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw",
        rect: structuredClone(regionConfig.detection.rectCm),
      });
    } else if (!readOnly && resizeTarget) {
      const region = regionConfig.regions.find((entry) => entry.id === resizeTarget.dataset.regionResize);
      if (region) {
        selectRegion(region);
        setDragState({ kind: "region-resize", pointerId: event.pointerId, regionId: region.id, handle: resizeTarget.dataset.handle ?? "se", geometry: structuredClone(region.geometry) });
      }
    } else if (!readOnly && regionTarget && activePanel !== "background" && activePanel !== "detection") {
      const region = regionConfig.regions.find((entry) => entry.id === regionTarget.dataset.regionId);
      if (region) {
        selectRegion(region);
        setDragState({ kind: "region", pointerId: event.pointerId, regionId: region.id, startWorldX: world.x, startWorldY: world.y, geometry: structuredClone(region.geometry) });
      }
    } else if (!readOnly && activePanel === "background" && backgroundResize) {
      const instance = regionConfig.backgroundInstances.find((entry) => entry.id === backgroundResize.dataset.bgResize);
      if (instance) setDragState({ kind: "background-resize", pointerId: event.pointerId, instanceId: instance.id, instance: structuredClone(instance) });
    } else if (!readOnly && activePanel === "background" && backgroundTarget) {
      const instance = regionConfig.backgroundInstances.find((entry) => entry.id === backgroundTarget.dataset.bgId);
      if (instance) {
        setSelectedBackgroundId(instance.id);
        setDragState({ kind: "background", pointerId: event.pointerId, instanceId: instance.id, startWorldX: world.x, startWorldY: world.y, instance: structuredClone(instance) });
      }
    } else if (!readOnly && activePanel === "detection" && regionConfig.detection.mode === "custom" && !regionConfig.detection.customConfirmed) {
      const next = cloneConfig(regionConfig);
      next.detection.customPointsCm.push({ x: Math.round(world.x), y: Math.round(world.y) });
      setCurrentConfig({ ...deviceConfig!, regionConfig: next });
      setDirty(true);
    } else {
      setDragState({ kind: "pan", pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: viewportOffset.x, offsetY: viewportOffset.y });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const processPointerMove = (event: PointerMoveSample) => {
    if (!regionConfig) return;
    if (touchPointsRef.current.has(event.pointerId)) {
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (touchPointsRef.current.size === 2 && pinchRef.current) {
      const points = [...touchPointsRef.current.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const nextCellSize = Math.max(MIN_CELL, Math.min(MAX_CELL, pinchRef.current.cellSize * (distance / Math.max(1, pinchRef.current.distance))));
      const rect = event.currentTarget.getBoundingClientRect();
      const midpointX = (points[0].x + points[1].x) / 2 - rect.left;
      const midpointY = (points[0].y + points[1].y) / 2 - rect.top;
      const nextScale = nextCellSize / 50;
      setCellSize(nextCellSize);
      setViewportOffset({
        x: midpointX - pinchRef.current.worldX * nextScale,
        y: midpointY + pinchRef.current.worldY * nextScale,
      });
      return;
    }
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const world = toWorld(event);
    if (dragState.kind === "pan") {
      setViewportOffset({
        x: dragState.offsetX + event.clientX - dragState.startX,
        y: dragState.offsetY + event.clientY - dragState.startY,
      });
      return;
    }
    if (dragState.kind === "region") {
      updateRegionGeometry(dragState.regionId, updateGeometryCenter(
        dragState.geometry,
        centerOf(dragState.geometry).x + world.x - dragState.startWorldX,
        centerOf(dragState.geometry).y + world.y - dragState.startWorldY,
      ));
      return;
    }
    if (dragState.kind === "region-resize") {
      if (dragState.geometry.shape === "circle") {
        const radiusCm = Math.max(10, Math.round(Math.hypot(world.x - dragState.geometry.centerXCm, world.y - dragState.geometry.centerYCm)));
        updateRegionGeometry(dragState.regionId, { ...dragState.geometry, radiusCm });
      } else {
        const left = dragState.geometry.centerXCm - dragState.geometry.widthCm / 2;
        const right = dragState.geometry.centerXCm + dragState.geometry.widthCm / 2;
        const bottom = dragState.geometry.centerYCm - dragState.geometry.heightCm / 2;
        const top = dragState.geometry.centerYCm + dragState.geometry.heightCm / 2;
        const nextLeft = dragState.handle.includes("w") ? Math.min(world.x, right - 10) : left;
        const nextRight = dragState.handle.includes("e") ? Math.max(world.x, left + 10) : right;
        const nextBottom = dragState.handle.includes("s") ? Math.min(world.y, top - 10) : bottom;
        const nextTop = dragState.handle.includes("n") ? Math.max(world.y, bottom + 10) : top;
        updateRegionGeometry(dragState.regionId, {
          shape: "rect",
          centerXCm: Math.round((nextLeft + nextRight) / 2),
          centerYCm: Math.round((nextBottom + nextTop) / 2),
          widthCm: Math.round(nextRight - nextLeft),
          heightCm: Math.round(nextTop - nextBottom),
        });
      }
      return;
    }
    if (dragState.kind === "detection-resize") {
      const current = configRef.current;
      if (!current) return;
      const next = cloneConfig(current.regionConfig);
      const rect = { ...dragState.rect };
      if (dragState.handle.includes("w")) rect.xMin = Math.min(Math.round(world.x), rect.xMax - 10);
      if (dragState.handle.includes("e")) rect.xMax = Math.max(Math.round(world.x), rect.xMin + 10);
      if (dragState.handle.includes("s")) rect.yMin = Math.min(Math.round(world.y), rect.yMax - 10);
      if (dragState.handle.includes("n")) rect.yMax = Math.max(Math.round(world.y), rect.yMin + 10);
      next.detection.rectCm = rect;
      next.rangeBox = { xMin: rect.xMin / 100, xMax: rect.xMax / 100, yMin: rect.yMin / 100, yMax: rect.yMax / 100 };
      setCurrentConfig({ ...current, regionConfig: next });
      setDirty(true);
      return;
    }
    const current = configRef.current;
    if (!current) return;
    const next = cloneConfig(current.regionConfig);
    const instance = next.backgroundInstances.find((entry) => entry.id === dragState.instanceId);
    if (!instance) return;
    if (dragState.kind === "background") {
      instance.xCm = Math.round(dragState.instance.xCm + world.x - dragState.startWorldX);
      instance.yCm = Math.round(dragState.instance.yCm + world.y - dragState.startWorldY);
    } else {
      const ratio = dragState.instance.widthCm / Math.max(1, dragState.instance.heightCm);
      instance.widthCm = Math.max(40, Math.round(world.x - dragState.instance.xCm));
      instance.heightCm = Math.max(40, Math.round(instance.widthCm / ratio));
    }
    setCurrentConfig({ ...current, regionConfig: next });
    setDirty(true);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    pendingPointerMoveRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      currentTarget: event.currentTarget,
    };
    if (pointerMoveFrameRef.current !== null) return;
    pointerMoveFrameRef.current = window.requestAnimationFrame(() => {
      pointerMoveFrameRef.current = null;
      const pending = pendingPointerMoveRef.current;
      pendingPointerMoveRef.current = null;
      if (pending) processPointerMove(pending);
    });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pointerMoveFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerMoveFrameRef.current);
      pointerMoveFrameRef.current = null;
    }
    const pending = pendingPointerMoveRef.current;
    pendingPointerMoveRef.current = null;
    if (pending) processPointerMove(pending);
    touchPointsRef.current.delete(event.pointerId);
    if (touchPointsRef.current.size < 2) pinchRef.current = null;
    if (dragState && dragState.kind !== "pan" && configRef.current && !readOnly) {
      void persistRegionConfig(configRef.current.regionConfig);
    }
    setDragState(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const renderRegionShape = (region: RegionDefinition) => {
    const displayRegion = regionDraft?.id === region.id ? regionDraft : region;
    const geometry = displayRegion.geometry;
    const selected = selectedRegionId === region.id;
    const live = detail?.regions.find((entry) => entry.id === region.id);
    const color = REGION_COLORS[displayRegion.regionType];
    const scale = cellSize / 50;
    const tx = (value: number) => viewportOffset.x + value * scale;
    const ty = (value: number) => viewportOffset.y - value * scale;
    const label = formatRegionLiveInfo(displayRegion.regionType, live);
    const handles = geometry.shape === "rect"
      ? [
          ["nw", tx(geometry.centerXCm - geometry.widthCm / 2), ty(geometry.centerYCm + geometry.heightCm / 2)],
          ["n", tx(geometry.centerXCm), ty(geometry.centerYCm + geometry.heightCm / 2)],
          ["ne", tx(geometry.centerXCm + geometry.widthCm / 2), ty(geometry.centerYCm + geometry.heightCm / 2)],
          ["e", tx(geometry.centerXCm + geometry.widthCm / 2), ty(geometry.centerYCm)],
          ["se", tx(geometry.centerXCm + geometry.widthCm / 2), ty(geometry.centerYCm - geometry.heightCm / 2)],
          ["s", tx(geometry.centerXCm), ty(geometry.centerYCm - geometry.heightCm / 2)],
          ["sw", tx(geometry.centerXCm - geometry.widthCm / 2), ty(geometry.centerYCm - geometry.heightCm / 2)],
          ["w", tx(geometry.centerXCm - geometry.widthCm / 2), ty(geometry.centerYCm)],
        ] as const
      : [
          ["n", tx(geometry.centerXCm), ty(geometry.centerYCm + geometry.radiusCm)],
          ["e", tx(geometry.centerXCm + geometry.radiusCm), ty(geometry.centerYCm)],
          ["s", tx(geometry.centerXCm), ty(geometry.centerYCm - geometry.radiusCm)],
          ["w", tx(geometry.centerXCm - geometry.radiusCm), ty(geometry.centerYCm)],
        ] as const;
    const resizeEnabled = selected && !readOnly && activePanel !== "background" && activePanel !== "detection";
    const rectEdgeHits = geometry.shape === "rect" ? [
      ["n", tx(geometry.centerXCm - geometry.widthCm / 2), ty(geometry.centerYCm + geometry.heightCm / 2), tx(geometry.centerXCm + geometry.widthCm / 2), ty(geometry.centerYCm + geometry.heightCm / 2)],
      ["e", tx(geometry.centerXCm + geometry.widthCm / 2), ty(geometry.centerYCm - geometry.heightCm / 2), tx(geometry.centerXCm + geometry.widthCm / 2), ty(geometry.centerYCm + geometry.heightCm / 2)],
      ["s", tx(geometry.centerXCm - geometry.widthCm / 2), ty(geometry.centerYCm - geometry.heightCm / 2), tx(geometry.centerXCm + geometry.widthCm / 2), ty(geometry.centerYCm - geometry.heightCm / 2)],
      ["w", tx(geometry.centerXCm - geometry.widthCm / 2), ty(geometry.centerYCm - geometry.heightCm / 2), tx(geometry.centerXCm - geometry.widthCm / 2), ty(geometry.centerYCm + geometry.heightCm / 2)],
    ] as const : [];
    const labelX = geometry.shape === "circle"
      ? tx(geometry.centerXCm - geometry.radiusCm) + 8
      : tx(geometry.centerXCm - geometry.widthCm / 2) + 8;
    const labelY = geometry.shape === "circle"
      ? ty(geometry.centerYCm + geometry.radiusCm) + 8
      : ty(geometry.centerYCm + geometry.heightCm / 2) + 8;
    const nameWidth = Math.max(region.label.length * 12 + 10, 40);
    const infoWidth = Math.max((label ?? "").length * 7.5 + 10, 36);
    return (
      <g key={region.id} data-region-id={region.id} className={selected ? "region-shape-group selected workspace-region" : "region-shape-group workspace-region"} opacity={displayRegion.visible ? 1 : 0.18}>
        {geometry.shape === "circle" ? (
          <circle
            className={selected ? "region-shape region-shape-selected" : "region-shape"}
            cx={tx(geometry.centerXCm)}
            cy={ty(geometry.centerYCm)}
            r={geometry.radiusCm * scale}
            fill={`${color}44`}
            stroke={color}
            strokeWidth="2"
          />
        ) : (
          <rect
            className={selected ? "region-shape region-shape-selected" : "region-shape"}
            x={tx(geometry.centerXCm - geometry.widthCm / 2)}
            y={ty(geometry.centerYCm + geometry.heightCm / 2)}
            width={geometry.widthCm * scale}
            height={geometry.heightCm * scale}
            fill={`${color}44`}
            stroke={color}
            strokeWidth="2"
          />
        )}
        <g className="workspace-label region-name-label">
          <rect x={labelX} y={labelY} width={nameWidth} height="20" rx="4" fill={color} />
          <text className="region-shape-label" x={labelX + 5} y={labelY + 14}>{displayRegion.label}</text>
          {label ? (
            <g className="region-live-label">
              <rect x={labelX} y={labelY + 24} width={infoWidth} height="18" rx="4" fill={color} opacity="0.88" />
              <text className="workspace-live-label region-live-label-text" x={labelX + 5} y={labelY + 37}>{label}</text>
            </g>
          ) : null}
        </g>
        {resizeEnabled && geometry.shape === "circle" ? <circle
          data-region-resize={region.id}
          data-handle="circle-radius"
          cx={tx(geometry.centerXCm)}
          cy={ty(geometry.centerYCm)}
          r={geometry.radiusCm * scale}
          className="workspace-resize-hit workspace-circle-resize-hit region-border-hit"
        /> : null}
        {resizeEnabled ? rectEdgeHits.map(([handle, x1, y1, x2, y2]) => (
          <line key={`edge-${handle}`} data-region-resize={region.id} data-handle={handle} x1={x1} y1={y1} x2={x2} y2={y2} className="workspace-resize-hit region-border-hit" />
        )) : null}
        {resizeEnabled ? <circle className="workspace-region-center region-center-point" cx={tx(geometry.centerXCm)} cy={ty(geometry.centerYCm)} r="4" /> : null}
        {resizeEnabled ? handles.map(([handle, x, y]) => (
          <rect key={handle} data-region-resize={region.id} data-handle={handle} x={x - 4} y={y - 4} width="8" height="8" rx="2" className="workspace-resize-handle region-resize-handle" />
        )) : null}
      </g>
    );
  };

  if (!selectedDevice) {
    return <section className="page"><div className="empty-state"><strong>暂无已绑定设备</strong><span>请先在设备管理中完成扫描和初始化。</span></div></section>;
  }
  if (!regionConfig || loading) {
    return <section className="page"><div className="empty-state"><strong>正在加载区域配置</strong><span>{selectedDevice.name}</span></div></section>;
  }

  const detection = regionConfig.detection;
  const selectedBackground = regionConfig.backgroundInstances.find((instance) => instance.id === selectedBackgroundId);
  const scale = cellSize / 50;
  const tx = (value: number) => viewportOffset.x + value * scale;
  const ty = (value: number) => viewportOffset.y - value * scale;
  const workspaceClass = [
    "region-workspace",
    readOnly ? "readonly" : "",
    dragState?.kind === "pan" ? "is-panning" : "",
    dragState?.kind === "region" || dragState?.kind === "region-resize" ? "is-dragging-region" : "",
    activePanel === "background" ? "is-bg-editing" : "",
    activePanel === "detection" ? "is-detection-editing" : "",
  ].filter(Boolean).join(" ");
  const learnedDisplayPoints =
    detection.appliedMode === "learned" || (activePanel === "detection" && detection.mode === "learned")
      ? detection.learnedPointsCm
      : [];
  const xTickMin = Math.floor((0 - viewportOffset.x) / (cellSize * 2));
  const xTickMax = Math.ceil((canvasSize.width - viewportOffset.x) / (cellSize * 2));
  const yTickMin = Math.floor((viewportOffset.y - canvasSize.height) / (cellSize * 2));
  const yTickMax = Math.ceil(viewportOffset.y / (cellSize * 2));
  const xTicks = Array.from({ length: Math.max(0, xTickMax - xTickMin + 1) }, (_, index) => xTickMin + index);
  const yTicks = Array.from({ length: Math.max(0, yTickMax - yTickMin + 1) }, (_, index) => yTickMin + index);

  return (
    <section className="page region-page">
      <header className="page-header region-page-header">
        <div className="region-page-title-row">
          <h2>区域管理</h2>
          <div className="region-device-picker">
            <span className="region-device-name">{selectedDevice.name}{readOnly ? "（离线）" : ""}</span>
            <div className="region-deviceno-wrap">
              <button type="button" className="region-deviceno-btn" aria-expanded={devicePickerOpen} onClick={() => setDevicePickerOpen((value) => !value)}>
                <span className="region-deviceno-btn-label">设备号 <strong>{selectedDevice.deviceNo}</strong></span>
                <svg className="region-deviceno-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {devicePickerOpen ? <div className="region-deviceno-dropdown" role="listbox">
                {boundDevices.map((device) => <button type="button" className={device.id === selectedDevice.id ? "active" : ""} key={device.id} onClick={() => {
                  if (dirty && !window.confirm("当前修改尚未保存，确认切换设备？")) return;
                  setDevicePickerOpen(false);
                  onSelectDevice(device.id);
                }}><span>设备号 {device.deviceNo}</span><small>{device.name}{device.discovery.status === "offline" ? " · 离线" : ""}</small></button>)}
              </div> : null}
            </div>
          </div>
        </div>
        <div className="page-actions">
          {saving ? <span className="save-state">保存中...</span> : dirty ? <span className="save-state pending">存在未保存修改</span> : null}
          <div className="region-menu-wrap">
            <button type="button" className="region-menu-btn" aria-label="更多操作" onClick={() => setMenuOpen((value) => !value)}>⋯</button>
            {menuOpen ? <div className="region-dropdown">
              <button type="button" disabled={readOnly} onClick={() => handleMenuAction("import-image")}>导入图片</button>
              <button type="button" disabled={readOnly} onClick={() => handleMenuAction("import-detection")}>导入探测范围配置</button>
              <button type="button" onClick={() => handleMenuAction("export-detection")}>导出探测范围配置</button>
              <button type="button" disabled={readOnly} onClick={() => handleMenuAction("import-regions")}>导入标签区域配置</button>
              <button type="button" onClick={() => handleMenuAction("export-regions")}>导出标签区域配置</button>
            </div> : null}
            <input ref={fileInputRef} className="region-bg-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/*" multiple onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              files.forEach((file) => importBackgroundFile(file));
              event.target.value = "";
            }} />
            <input ref={configImportRef} className="region-bg-file-input" type="file" accept="application/json,.json" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleConfigImport(file);
              event.target.value = "";
            }} />
          </div>
        </div>
      </header>

      <div className={workspaceClass}>
        {gridVisible ? <div className="region-canvas-grid" style={{ backgroundSize: `${cellSize}px ${cellSize}px`, backgroundPosition: `${viewportOffset.x}px ${viewportOffset.y}px` }} /> : null}
        <svg
          ref={canvasRef}
          className={activePanel === "background" ? "region-svg-canvas background-editing" : "region-svg-canvas"}
          viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
          preserveAspectRatio="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={(event) => {
            if ((event.target as Element | null)?.closest?.(".region-side-column, .region-toolbar, .region-float-panel")) {
              return;
            }
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            const oldScale = cellSize / 50;
            const worldX = (mouseX - viewportOffset.x) / oldScale;
            const worldY = (viewportOffset.y - mouseY) / oldScale;
            const nextCellSize = Math.max(MIN_CELL, Math.min(MAX_CELL, event.deltaY < 0 ? cellSize * ZOOM_FACTOR : cellSize / ZOOM_FACTOR));
            const nextScale = nextCellSize / 50;
            setCellSize(nextCellSize);
            setViewportOffset({ x: mouseX - worldX * nextScale, y: mouseY + worldY * nextScale });
          }}
        >
          {backgroundVisible ? [...regionConfig.backgroundInstances].sort((a, b) => a.zIndex - b.zIndex).map((instance) => {
            if (!instance.visible) return null;
            const selected = selectedBackgroundId === instance.id && activePanel === "background";
            return <g key={instance.id}>
              <image
                href={sourceUrl(instance.sourceType, instance.sourceId)}
                x={tx(instance.xCm)}
                y={ty(instance.yCm + instance.heightCm)}
                width={instance.widthCm * scale}
                height={instance.heightCm * scale}
                opacity={selected ? 0.78 : 0.48}
                data-bg-id={instance.id}
                preserveAspectRatio="none"
              />
              {selected ? <>
                <rect x={tx(instance.xCm)} y={ty(instance.yCm + instance.heightCm)} width={instance.widthCm * scale} height={instance.heightCm * scale} className="background-selection" />
                <circle data-bg-resize={instance.id} cx={tx(instance.xCm + instance.widthCm)} cy={ty(instance.yCm)} r="7" className="workspace-resize-handle region-detection-handle" />
              </> : null}
            </g>;
          }) : null}
          <g className="region-axis-layer">
            {gridVisible ? <>
              <line className="region-axis-line" x1="0" x2={canvasSize.width} y1={viewportOffset.y} y2={viewportOffset.y} />
              <line className="region-axis-line" x1={viewportOffset.x} x2={viewportOffset.x} y1="0" y2={canvasSize.height} />
              {xTicks.map((meter) => meter === 0 ? null : <text key={`axis-x-${meter}`} className="region-axis-label" x={tx(meter * 100)} y={viewportOffset.y + 14} textAnchor="middle">{meter}</text>)}
              {yTicks.map((meter) => meter === 0 ? null : <text key={`axis-y-${meter}`} className="region-axis-label" x={viewportOffset.x - 8} y={ty(meter * 100) + 4} textAnchor="end">{meter}</text>)}
              <text className="region-axis-label" x={viewportOffset.x + 8} y={viewportOffset.y + 14}>0</text>
              <text className="region-axis-label" x={canvasSize.width - 18} y={viewportOffset.y - 8}>m</text>
              <text className="region-axis-label" x={viewportOffset.x + 8} y="16">m</text>
            </> : null}
            <image href={deviceIcon} x={viewportOffset.x - cellSize * 1.5} y={viewportOffset.y - cellSize * 1.5} width={cellSize * 3} height={cellSize * 3} className="region-axis-device" />
          </g>
          {detection.appliedMode === "rect" || (activePanel === "detection" && detection.mode === "rect") ? (
            <g className="region-detection-range-layer">
              <rect
                className="range-detection-area workspace-detection-range"
                x={tx(detection.rectCm.xMin)}
                y={ty(detection.rectCm.yMax)}
                width={(detection.rectCm.xMax - detection.rectCm.xMin) * scale}
                height={(detection.rectCm.yMax - detection.rectCm.yMin) * scale}
              />
              {!readOnly && activePanel === "detection" && detection.mode === "rect" ? ([
                ["nw", tx(detection.rectCm.xMin), ty(detection.rectCm.yMax)],
                ["n", tx((detection.rectCm.xMin + detection.rectCm.xMax) / 2), ty(detection.rectCm.yMax)],
                ["ne", tx(detection.rectCm.xMax), ty(detection.rectCm.yMax)],
                ["e", tx(detection.rectCm.xMax), ty((detection.rectCm.yMin + detection.rectCm.yMax) / 2)],
                ["se", tx(detection.rectCm.xMax), ty(detection.rectCm.yMin)],
                ["s", tx((detection.rectCm.xMin + detection.rectCm.xMax) / 2), ty(detection.rectCm.yMin)],
                ["sw", tx(detection.rectCm.xMin), ty(detection.rectCm.yMin)],
                ["w", tx(detection.rectCm.xMin), ty((detection.rectCm.yMin + detection.rectCm.yMax) / 2)],
              ] as const).map(([handle, x, y]) => (
                <circle key={handle} data-detection-handle={handle} cx={x} cy={y} r="6" className="region-detection-handle" />
              )) : null}
            </g>
          ) : null}
          {(detection.appliedMode === "custom" || (activePanel === "detection" && detection.mode === "custom")) && detection.customPointsCm.length >= 2 ? (
            <g className="region-detection-range-layer">
              {detection.customPointsCm.length >= 3 ? (
                <polygon className="range-custom-polygon workspace-detection-range custom" points={detection.customPointsCm.map((point) => `${tx(point.x)},${ty(point.y)}`).join(" ")} />
              ) : null}
              <polyline className="range-custom-line" fill="none" points={detection.customPointsCm.map((point) => `${tx(point.x)},${ty(point.y)}`).join(" ")} />
              {detection.customPointsCm.map((point, index) => (
                <g className="range-custom-vertex" key={`custom-v-${index}`}>
                  <circle cx={tx(point.x)} cy={ty(point.y)} r="7" />
                  <text x={tx(point.x)} y={ty(point.y) + 4} textAnchor="middle">{index + 1}</text>
                </g>
              ))}
            </g>
          ) : null}
          {learnedDisplayPoints.length >= 3 ? (
            <g className="region-detection-range-layer">
              <polygon className="range-learned-polygon workspace-detection-range learned" points={learnedDisplayPoints.map((point) => `${tx(point.x)},${ty(point.y)}`).join(" ")} />
              {learnedDisplayPoints.map((point, index) => (
                <circle key={`learned-v-${index}`} className="range-learned-vertex-dot" cx={tx(point.x)} cy={ty(point.y)} r="5" />
              ))}
            </g>
          ) : null}
          {regionConfig.regions.map(renderRegionShape)}
        </svg>

        <div className="region-toolbar">
          <div className="region-toolbar-group">
            <button className={gridVisible ? "region-tool-btn active" : "region-tool-btn"} type="button" onClick={() => setGridVisible((value) => !value)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h16M4 16h16M8 4v16M16 4v16" /></svg><span>网格</span></button>
            <button className={backgroundVisible ? "region-tool-btn active" : "region-tool-btn"} type="button" onClick={() => setBackgroundVisible((value) => !value)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" /><path d="m5 17 4-4 3 3 4-5 3 4" /></svg><span>底图</span></button>
            <button className="region-tool-btn" type="button" onClick={() => { setCellSize(BASE_CELL); setViewportOffset({ x: canvasSize.width / 2, y: canvasSize.height / 2 }); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 8v4l3 2" /></svg><span>复位</span></button>
          </div>
          <div className="region-toolbar-group">
            <button className={activePanel === "regions" ? "region-panel-btn active" : "region-panel-btn"} type="button" onClick={() => togglePanel("regions")}>区域列表</button>
            <button className={activePanel === "detection" ? "region-panel-btn active" : "region-panel-btn"} type="button" onClick={() => togglePanel("detection")}>探测范围</button>
          </div>
          <div className="region-toolbar-group">
            <button className={activePanel === "parameters" ? "region-panel-btn active" : "region-panel-btn"} type="button" onClick={() => togglePanel("parameters")}>参数配置</button>
            <button className={activePanel === "background" ? "region-panel-btn active" : "region-panel-btn"} type="button" onClick={() => togglePanel("background")}>底图设置</button>
          </div>
        </div>

        <div
          className="region-side-column"
          ref={sideColumnRef}
          onWheel={(event) => event.stopPropagation()}
        >
        {activePanel ? <aside className={`region-float-panel region-${activePanel}-panel`}>
          {activePanel === "regions" ? <>
            <div className="region-panel-head"><h3>区域列表</h3><button type="button" className="region-add-btn" onClick={addRegion} disabled={readOnly || regionConfig.regions.length >= 32}>+ 新增</button></div>
            <div className="region-list-body">
              {regionConfig.regions.length ? [...regionConfig.regions].sort((a, b) => a.index - b.index).map((region) => {
                  const displayRegion = regionDraft?.id === region.id ? regionDraft : region;
                  return (
                    <div className={selectedRegionId === region.id ? "region-list-item active" : "region-list-item"} key={region.id} onClick={() => selectRegion(region)}>
                      <i className="region-color-dot" style={{ background: REGION_COLORS[displayRegion.regionType] }} />
                      <div className="region-list-meta">
                        <strong>{displayRegion.label}</strong>
                        <span>
                          <em>索引:{displayRegion.index}</em>
                          <em>{REGION_LABELS[displayRegion.regionType]}</em>
                        </span>
                      </div>
                      <div className="region-list-actions">
                        <button type="button" className="region-icon-btn" disabled={readOnly} aria-label="切换可见性" onClick={(event) => { event.stopPropagation(); void toggleRegionVisibility(region.id); }}>{region.visible ? "👁" : "🚫"}</button>
                        <button type="button" className="region-icon-btn" disabled={readOnly} aria-label="编辑" onClick={(event) => { event.stopPropagation(); selectRegion(region); }}>✎</button>
                        <button type="button" className="region-icon-btn danger" disabled={readOnly} aria-label="删除" onClick={(event) => { event.stopPropagation(); requestDeleteRegion(region.id, displayRegion.label); }}>🗑</button>
                      </div>
                    </div>
                  );
                }) : <div className="region-panel-empty">暂无区域，点击“新增”开始配置。</div>}
            </div>
            <div className="region-panel-foot"><span>总计: <strong>{regionConfig.regions.length}</strong> 个区域</span></div>
          </> : null}

          {activePanel === "edit" && regionDraft ? <>
            <div className="region-panel-head"><h3>区域配置</h3><button type="button" onClick={() => { setRegionDraft(null); setActivePanel("regions"); }}>关闭</button></div>
            <div className="region-form-grid">
              <label><span>区域名称</span><input disabled={readOnly} value={regionDraft.label} onChange={(event) => updateRegionDraft({ ...regionDraft, label: event.target.value })} /></label>
              <label><span>区域索引</span><input disabled={readOnly} type="number" min="0" max="31" value={regionDraft.index} onChange={(event) => {
                const index = Math.max(0, Math.min(31, Number(event.target.value)));
                updateRegionDraft({
                  ...regionDraft,
                  index,
                  mcuIo: regionDraft.regionType === "status_detection" && index < 6 ? regionDraft.mcuIo : -1,
                });
              }} /></label>
              <label><span>区域类型</span><select disabled={readOnly} value={regionDraft.regionType} onChange={(event) => {
                const regionType = event.target.value as RegionType;
                updateRegionDraft({
                  ...regionDraft,
                  regionType,
                  ioIndex: regionType === "status_detection" ? regionDraft.ioIndex : 0,
                  mcuIo: regionType === "status_detection" && regionDraft.index < 6 ? regionDraft.mcuIo : -1,
                });
              }}>{Object.entries(REGION_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span>范围类型</span><select disabled={readOnly} value={regionDraft.geometry.shape} onChange={(event) => {
                const center = centerOf(regionDraft.geometry);
                const geometry: RegionGeometry = event.target.value === "circle"
                  ? {
                      shape: "circle",
                      centerXCm: center.x,
                      centerYCm: center.y,
                      radiusCm: regionDraft.geometry.shape === "circle"
                        ? regionDraft.geometry.radiusCm
                        : Math.max(regionDraft.geometry.widthCm, regionDraft.geometry.heightCm) / 2,
                    }
                  : {
                      shape: "rect",
                      centerXCm: center.x,
                      centerYCm: center.y,
                      widthCm: regionDraft.geometry.shape === "circle" ? regionDraft.geometry.radiusCm * 2 : regionDraft.geometry.widthCm,
                      heightCm: regionDraft.geometry.shape === "circle" ? regionDraft.geometry.radiusCm * 2 : regionDraft.geometry.heightCm,
                    };
                updateRegionDraft({ ...regionDraft, geometry });
              }}><option value="rect">矩形</option><option value="circle">圆形</option></select></label>
              <label className={regionDraft.regionType === "status_detection" ? undefined : "disabled-field"}><span>IO 索引</span><select disabled={readOnly || regionDraft.regionType !== "status_detection"} value={regionDraft.ioIndex} onChange={(event) => updateRegionDraft({ ...regionDraft, ioIndex: Number(event.target.value) as RegionDefinition["ioIndex"] })}>{[0, 2, 3, 4, 5, 6].map((value) => <option value={value} key={value}>{value === 0 ? "无" : value}</option>)}</select></label>
              <label className={regionDraft.regionType === "status_detection" && regionDraft.index < 6 ? undefined : "disabled-field"}><span>MCU侧IO</span><select disabled={readOnly || regionDraft.regionType !== "status_detection" || regionDraft.index > 5} value={regionDraft.mcuIo} onChange={(event) => updateRegionDraft({ ...regionDraft, mcuIo: Number(event.target.value) })}>{MCU_IO_OPTIONS.map((value) => <option value={value} key={value}>{value < 0 ? "无" : value}</option>)}</select></label>
              <label><span>中心 X (cm)</span><input disabled={readOnly} type="number" value={regionDraft.geometry.centerXCm} onChange={(event) => updateRegionDraft({ ...regionDraft, geometry: updateGeometryCenter(regionDraft.geometry, Number(event.target.value), regionDraft.geometry.centerYCm) })} /></label>
              <label><span>中心 Y (cm)</span><input disabled={readOnly} type="number" value={regionDraft.geometry.centerYCm} onChange={(event) => updateRegionDraft({ ...regionDraft, geometry: updateGeometryCenter(regionDraft.geometry, regionDraft.geometry.centerXCm, Number(event.target.value)) })} /></label>
              {regionDraft.geometry.shape === "rect" ? <>
                <label><span>宽度 (cm)</span><input disabled={readOnly} type="number" min="10" value={regionDraft.geometry.widthCm} onChange={(event) => updateRegionDraft({ ...regionDraft, geometry: { ...regionDraft.geometry, widthCm: Math.max(10, Number(event.target.value)) } as RegionGeometry })} /></label>
                <label><span>高度 (cm)</span><input disabled={readOnly} type="number" min="10" value={regionDraft.geometry.heightCm} onChange={(event) => updateRegionDraft({ ...regionDraft, geometry: { ...regionDraft.geometry, heightCm: Math.max(10, Number(event.target.value)) } as RegionGeometry })} /></label>
              </> : <label><span>半径 (cm)</span><input disabled={readOnly} type="number" min="10" value={regionDraft.geometry.radiusCm} onChange={(event) => updateRegionDraft({ ...regionDraft, geometry: { ...regionDraft.geometry, radiusCm: Math.max(10, Number(event.target.value)) } as RegionGeometry })} /></label>}
            </div>
            <div className="region-panel-actions"><button type="button" className="primary-button" disabled={readOnly || saving} onClick={() => void saveRegionDraft()}>保存更改</button><button type="button" className="ghost-button" onClick={() => { setRegionDraft(null); setActivePanel("regions"); }}>取消</button></div>
          </> : null}

          {activePanel === "parameters" ? <>
            <div className="region-panel-head"><div><h3>参数配置</h3><span>{readOnly ? "离线缓存，只读" : "HA Native Entity"}</span></div></div>
            <section className="parameter-section">
              <h4>指示灯设置</h4>
              {([
                ["trajectoryLed", "轨迹指示灯", "开启后显示轨迹相关指示状态。"],
                ["motionLed", "运动状态指示灯", "开启后显示运动/静止状态指示。"],
              ] as const).map(([key, title, description]) => (
                <div className="region-range-switch-row" key={key}>
                  <div><strong>{title}</strong><span>{description}</span></div>
                  <button
                    type="button"
                    className={deviceConfig?.deviceSettings[key] ? "region-range-switch on" : "region-range-switch"}
                    disabled={readOnly || saving}
                    aria-pressed={deviceConfig?.deviceSettings[key] ? "true" : "false"}
                    onClick={() => void updateSettings({ [key]: !deviceConfig?.deviceSettings[key] })}
                  ><span /></button>
                </div>
              ))}
            </section>
            <section className="parameter-section"><h4>上报与轨迹参数</h4><div className="region-form-grid">{parameterFields.map((field) => <label key={field.key}><span>{field.label}</span><input disabled={readOnly || saving} type="number" min={field.min} max={field.max} defaultValue={deviceConfig?.deviceSettings[field.key] ?? PARAM_DEFAULTS[field.key]} onBlur={(event) => void updateSettings({ [field.key]: Math.max(field.min, Math.min(field.max, Number(event.target.value))) })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>)}</div></section>
            <button type="button" className="primary-button full-button" disabled={readOnly || saving} onClick={() => void updateSettings(PARAM_DEFAULTS)}>恢复默认参数设置</button>
          </> : null}

          {activePanel === "background" ? <>
            <div className="region-panel-head"><div><h3>底图设置</h3><span>官方素材与用户素材</span></div><button type="button" disabled={readOnly} onClick={() => fileInputRef.current?.click()}>上传</button></div>
            <section className="region-param-section background-library-section">
              <div className="region-param-section-title">
                <h4>素材预览</h4>
                <p>左右键 / 滚轮翻页；双击大图或点「添加」放入画布。</p>
              </div>
              {currentCatalogItem ? (
                <div className="bg-carousel" ref={baseMapLibraryRef} tabIndex={0}>
                  <div className="bg-carousel-stage">
                    <button type="button" className="bg-carousel-nav" aria-label="上一张" onClick={() => stepBackgroundCatalog(-1)}>‹</button>
                    <button
                      type="button"
                      className="bg-carousel-preview"
                      title="双击添加到画布"
                      disabled={readOnly || saving}
                      onDoubleClick={() => void placeBackgroundItem(currentCatalogItem)}
                    >
                      <img src={currentCatalogItem.url} alt={currentCatalogItem.name} draggable={false} />
                    </button>
                    <button type="button" className="bg-carousel-nav" aria-label="下一张" onClick={() => stepBackgroundCatalog(1)}>›</button>
                  </div>
                  <div className="bg-carousel-meta">
                    <strong>{currentCatalogIndex + 1} / {backgroundCatalog.length}</strong>
                    <span>{currentCatalogItem.kind === "imported" ? "已导入" : "官方素材"} · 放置宽约 2m</span>
                  </div>
                  <div className="bg-carousel-filmstrip">
                    {backgroundCatalog.map((item, index) => (
                      <button
                        type="button"
                        key={item.key}
                        className={index === currentCatalogIndex ? "bg-film-thumb active" : "bg-film-thumb"}
                        title={item.name}
                        aria-label={item.name}
                        onClick={() => selectBackgroundSourceByKey(item.key)}
                        onDoubleClick={() => void placeBackgroundItem(item)}
                      >
                        <img src={item.url} alt="" draggable={false} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="region-bg-empty">暂无素材，请先上传或等待官方库加载。</p>
              )}
            </section>
            <div className="region-bg-footer">
              <p className="region-param-message">{selectedBackground ? "画布底图已选中：拖动/缩放，Delete 删除" : backgroundMessage}</p>
              <button
                type="button"
                className="primary-button"
                disabled={readOnly || saving || !currentCatalogItem}
                onClick={() => void addSelectedBackground()}
              >
                {saving ? "添加中..." : "添加"}
              </button>
            </div>
          </> : null}

          {activePanel === "detection" ? <>
            <div className="region-panel-head"><div><h3>探测范围</h3><span>当前 {detection.appliedMode ?? "未设置"}</span></div></div>
            <p className="region-range-hint">{getDetectionHint(detection)}</p>
            <div className="detection-mode-tabs">{(["rect", "learned", "custom"] as const).map((mode) => <button type="button" key={mode} className={detection.mode === mode ? "active" : ""} disabled={readOnly && mode !== detection.mode} onClick={() => {
              const next = cloneConfig(regionConfig);
              next.detection.mode = mode;
              if (mode === "custom") { next.detection.customConfirmed = false; next.detection.customPointsCm = []; }
              setCurrentConfig({ ...deviceConfig!, regionConfig: next });
              setDirty(true);
            }}>{mode === "rect" ? "四方探测范围" : mode === "learned" ? "学习探测范围" : "自定义范围"}</button>)}</div>
            {detection.mode === "rect" ? <><div className="region-form-grid">{(["xMin", "xMax", "yMin", "yMax"] as const).map((key) => <label key={key}><span>{key} (cm)</span><input disabled={readOnly} type="number" value={detection.rectCm[key]} onChange={(event) => {
              const next = cloneConfig(regionConfig);
              next.detection.rectCm[key] = Number(event.target.value);
              next.rangeBox = { xMin: next.detection.rectCm.xMin / 100, xMax: next.detection.rectCm.xMax / 100, yMin: next.detection.rectCm.yMin / 100, yMax: next.detection.rectCm.yMax / 100 };
              setCurrentConfig({ ...deviceConfig!, regionConfig: next });
              setDirty(true);
            }} /></label>)}</div><button type="button" className="primary-button full-button" disabled={readOnly || saving} onClick={() => {
              const next = cloneConfig(regionConfig); next.detection.appliedMode = "rect"; void persistRegionConfig(next, { fourSidedRange: true });
            }}>设置并同步设备</button></> : null}
            {detection.mode === "learned" ? <>
              <div className="region-range-switch-row">
                <div><strong>学习探测范围</strong><span>设备学习接口接入后，可在此启用轨迹学习范围并同步到设备。</span></div>
                <button type="button" className={detection.learnedPointsCm.length ? "region-range-switch on" : "region-range-switch"} disabled={readOnly} aria-pressed={detection.learnedPointsCm.length ? "true" : "false"}><span /></button>
              </div>
              <p className="region-help">已学习 {detection.learnedPointsCm.length} 个点。学习接口暂未完全接入时，可先导入 JSON 配置预览范围。</p>
              <button type="button" className="primary-button full-button" disabled={readOnly || saving || detection.learnedPointsCm.length < 3} onClick={() => {
                const next = cloneConfig(regionConfig); next.detection.appliedMode = "learned"; void persistRegionConfig(next);
              }}>设置并本地应用</button>
            </> : null}
            {detection.mode === "custom" ? <><div className="custom-range-status">{getDetectionHint(detection)}</div><div className="region-panel-actions"><button type="button" disabled={readOnly || detection.customPointsCm.length === 0} onClick={() => { const next = cloneConfig(regionConfig); next.detection.customPointsCm.pop(); setCurrentConfig({ ...deviceConfig!, regionConfig: next }); setDirty(true); }}>撤销</button><button type="button" disabled={readOnly || detection.customPointsCm.length === 0} onClick={() => { const next = cloneConfig(regionConfig); next.detection.customPointsCm = []; next.detection.customConfirmed = false; setCurrentConfig({ ...deviceConfig!, regionConfig: next }); setDirty(true); }}>清除</button><button type="button" className="primary-button" disabled={readOnly || !canConfirmCustomRange(detection.customPointsCm)} onClick={() => { const next = cloneConfig(regionConfig); next.detection.customConfirmed = true; next.detection.appliedMode = "custom"; void persistRegionConfig(next); }}>确认并本地应用</button></div><p className="local-only-note">确认后点击“设置并本地应用”保存到设备配置。</p></> : null}
          </> : null}
        </aside> : null}
        </div>
        <div className="region-status-bar"><span className="muted">缩放 {Math.round(cellSize / BASE_CELL * 100)}%</span><span className="muted">|</span><span className="muted">1格 = 0.5m</span>{readOnly ? <span className="muted">| 设备离线，只读</span> : null}</div>
      </div>

      {deleteTarget ? <div className="modal-backdrop" role="presentation" onClick={() => setDeleteTarget(null)}>
        <section className="modal-dialog region-delete-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h3>确认删除？</h3>
              <span className="modal-hint">您确定要删除区域 <strong>{deleteTarget.label}</strong> 吗？此操作不可撤销。</span>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={() => setDeleteTarget(null)}>取消</button>
            <button type="button" className="table-action-button danger" onClick={() => void confirmDeleteRegion()}>确认删除</button>
          </div>
        </section>
      </div> : null}
    </section>
  );
}
