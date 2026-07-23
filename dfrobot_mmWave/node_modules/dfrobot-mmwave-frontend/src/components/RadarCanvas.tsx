import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BaseMapInstance,
  DetectionRangeConfig,
  RangeBox,
  RegionOverlay,
  RegionViewPreferences,
  TrajectoryPoint,
} from "../api/client";
import deviceIcon from "../../resource/device_c4004.svg";
import { resolveBaseMapSourceUrl } from "../utils/baseMapAssets";

const BASE_X_MIN = -5;
const BASE_X_MAX = 5;
const BASE_X_SPAN = BASE_X_MAX - BASE_X_MIN;
/** Positive Y : negative Y display share around origin. */
const Y_POS_RATIO = 9;
const Y_NEG_RATIO = 1;
const Y_RATIO_SUM = Y_POS_RATIO + Y_NEG_RATIO;
/** Fallback aspect (h/w) before first measure. */
const DEFAULT_ASPECT = 8.45 / 10;
const ZOOM_STORAGE_KEY = "dfrobot-mmwave-radar-zoom-by-device";
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_DEFAULT = 1;

const REGION_COLORS = {
  status_detection: "#FFA94D",
  noise: "#69DB7C",
  approach_depart: "#4DABF7",
  boundary: "#FF6B6B",
  empty_tag: "#9AA5B8",
} as const;

const liveLabel = (region: RegionOverlay): string => {
  if (region.regionType === "noise" || region.regionType === "empty_tag") {
    return "";
  }
  if (region.tagDataAvailable === false) {
    return "等待标签事件";
  }
  if (region.regionType === "status_detection") {
    return `运动 ${region.movingCount ?? 0}  静止 ${region.staticCount ?? 0}`;
  }
  if (region.regionType === "boundary") {
    return region.boundaryState ?? "";
  }
  if (region.regionType === "approach_depart") {
    return region.approachAwayState ?? "";
  }
  return "";
};

const estimateRadarLabelWidth = (text: string, charUnits: number, padding: number) => {
  let units = 0;
  for (const char of text) {
    units += /[\u3400-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/.test(char) ? 1 : 0.55;
  }
  return units * charUnits + padding;
};

const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

const readZoomMap = (): Record<string, number> => {
  try {
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const zoom = Number(value);
      if (Number.isFinite(zoom)) result[key] = clampZoom(zoom);
    }
    return result;
  } catch {
    return {};
  }
};

const readStoredZoom = (deviceId?: string) => {
  if (!deviceId || typeof window === "undefined") return ZOOM_DEFAULT;
  return readZoomMap()[deviceId] ?? ZOOM_DEFAULT;
};

const writeStoredZoom = (deviceId: string | undefined, value: number) => {
  if (!deviceId || typeof window === "undefined") return;
  try {
    const next = { ...readZoomMap(), [deviceId]: clampZoom(value) };
    window.localStorage.setItem(ZOOM_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
};

const buildIntegerTicks = (min: number, max: number) => {
  const start = Math.ceil(min);
  const end = Math.floor(max);
  if (end < start) return [] as number[];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

/** Zoom around origin (0,0); keep X symmetric and Y split 9:1. */
const buildWorld = (aspect: number, zoom: number) => {
  const safeAspect = Number.isFinite(aspect) && aspect > 0.2 ? aspect : DEFAULT_ASPECT;
  const safeZoom = clampZoom(zoom);
  const xSpan = BASE_X_SPAN / safeZoom;
  const xMin = -xSpan / 2;
  const xMax = xSpan / 2;
  const ySpan = xSpan * safeAspect;
  const yMax = ySpan * (Y_POS_RATIO / Y_RATIO_SUM);
  const yMin = -ySpan * (Y_NEG_RATIO / Y_RATIO_SUM);
  const unit = 100 / xSpan;
  const viewW = xSpan * unit;
  const viewH = ySpan * unit;
  const originX = -xMin * unit;
  const originY = yMax * unit;
  return {
    unit,
    xMin,
    xMax,
    yMin,
    yMax,
    viewW,
    viewH,
    originX,
    originY,
    xTicks: buildIntegerTicks(xMin, xMax),
    yTicks: buildIntegerTicks(yMin, yMax),
  };
};

export function RadarCanvas({
  deviceId,
  rangeBox,
  detection,
  regions,
  targets,
  backgroundInstances = [],
  viewPreferences,
  large = false,
}: {
  deviceId?: string;
  coordinate: RangeBox;
  rangeBox: RangeBox;
  detection?: DetectionRangeConfig;
  regions: RegionOverlay[];
  targets: TrajectoryPoint[];
  backgroundInstances?: BaseMapInstance[];
  viewPreferences?: RegionViewPreferences;
  large?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [zoom, setZoom] = useState(() => readStoredZoom(deviceId));
  // 总览与详情共用按设备记忆的缩放；总览只读展示，详情可滚轮调整
  const world = useMemo(() => buildWorld(aspect, zoom), [aspect, zoom]);
  const { unit, viewW, viewH, originX, originY, xTicks, yTicks } = world;

  useEffect(() => {
    setZoom(readStoredZoom(deviceId));
  }, [deviceId]);

  // 从详情返回总览时重新读取该设备缩放（同页多卡片也保持与 localStorage 一致）
  useEffect(() => {
    if (large) return;
    const syncZoom = () => setZoom(readStoredZoom(deviceId));
    syncZoom();
    window.addEventListener("focus", syncZoom);
    window.addEventListener("storage", syncZoom);
    return () => {
      window.removeEventListener("focus", syncZoom);
      window.removeEventListener("storage", syncZoom);
    };
  }, [deviceId, large]);

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;

    const update = (width: number, height: number) => {
      if (width < 2 || height < 2) return;
      const next = height / width;
      setAspect((prev) => (Math.abs(prev - next) < 0.002 ? prev : next));
    };

    update(node.clientWidth, node.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      update(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // 设备总览（非 large）不允许滚轮缩放，避免卡片内误触改视图
    if (!large) return;
    const node = svgRef.current;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const factor = Math.exp(direction * 0.12);
      setZoom((prev) => {
        const next = clampZoom(prev * factor);
        writeStoredZoom(deviceId, next);
        return next;
      });
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [deviceId, large]);

  const tx = (x: number) => originX + x * unit;
  const ty = (y: number) => originY - y * unit;
  const rect = detection?.rectCm
    ? {
        xMin: Math.min(detection.rectCm.xMin, detection.rectCm.xMax) / 100,
        xMax: Math.max(detection.rectCm.xMin, detection.rectCm.xMax) / 100,
        yMin: Math.min(detection.rectCm.yMin, detection.rectCm.yMax) / 100,
        yMax: Math.max(detection.rectCm.yMin, detection.rectCm.yMax) / 100,
      }
    : rangeBox;
  const appliedMode = detection?.appliedMode ?? detection?.mode ?? "rect";
  const polygonSource = appliedMode === "custom"
    ? detection?.customPointsCm
    : appliedMode === "learned"
      ? detection?.learnedPointsCm
      : undefined;
  const polygonPoints = polygonSource && polygonSource.length >= 3
    ? polygonSource.map((point) => `${tx(point.x / 100)},${ty(point.y / 100)}`).join(" ")
    : "";
  const deviceSize = (large ? 1.1 : 0.9) * unit;
  const targetRadius = (large ? 0.15 : 0.12) * unit;
  const detectionPointRadius = (large ? 0.08 : 0.065) * unit;
  const hasVisibleBackground = backgroundInstances.some((instance) => instance.visible);
  const gridVisible = viewPreferences?.gridVisible ?? true;
  const backgroundVisible = viewPreferences?.backgroundVisible ?? hasVisibleBackground;
  const visibleBackgrounds = backgroundVisible
    ? [...backgroundInstances]
        .filter((instance) => instance.visible)
        .sort((left, right) => left.zIndex - right.zIndex)
    : [];

  return (
    <svg
      ref={svgRef}
      className={large ? "radar-canvas radar-canvas-large" : "radar-canvas"}
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="none"
    >
      {gridVisible ? (
        <>
          {xTicks.map((x) => (
            <line key={`grid-x-${x}`} className="radar-grid-line" x1={tx(x)} x2={tx(x)} y1="0" y2={viewH} />
          ))}
          {yTicks.map((y) => (
            <line key={`grid-y-${y}`} className="radar-grid-line" x1="0" x2={viewW} y1={ty(y)} y2={ty(y)} />
          ))}
        </>
      ) : null}

      {visibleBackgrounds.map((instance) => {
        const href = resolveBaseMapSourceUrl(instance.sourceType, instance.sourceId);
        if (!href) return null;
        const imgX = tx(instance.xCm / 100);
        const imgY = ty((instance.yCm + instance.heightCm) / 100);
        const imgW = (instance.widthCm / 100) * unit;
        const imgH = (instance.heightCm / 100) * unit;
        const centerX = imgX + imgW / 2;
        const centerY = imgY + imgH / 2;
        const rotationDeg = instance.rotationDeg ?? 0;
        return (
          <g key={instance.id} transform={`rotate(${rotationDeg} ${centerX} ${centerY})`}>
            <image
              className="radar-base-map"
              href={href}
              x={imgX}
              y={imgY}
              width={imgW}
              height={imgH}
              opacity={0.45}
              preserveAspectRatio="none"
            />
          </g>
        );
      })}

      {gridVisible ? (
        <>
          <line className="radar-axis-line" x1="0" x2={viewW} y1={originY} y2={originY} />
          <line className="radar-axis-line" x1={originX} x2={originX} y1="0" y2={viewH} />
          {xTicks
            .filter((x) => x !== 0)
            .map((x) => (
              <text
                key={`tick-x-${x}`}
                className="radar-tick-label"
                x={tx(x)}
                y={Math.min(viewH - 1.2, originY + 2.2)}
                textAnchor="middle"
              >
                {x}
              </text>
            ))}
          {yTicks
            .filter((y) => y !== 0)
            .map((y) => (
              <text
                key={`tick-y-${y}`}
                className="radar-tick-label"
                x={Math.max(1.6, originX - 1.6)}
                y={ty(y) + 0.7}
                textAnchor="end"
              >
                {y}
              </text>
            ))}
          <text className="radar-tick-label" x={originX + 1.8} y={originY + 2.2}>0</text>
          <text className="radar-tick-label" x={viewW - 2.5} y={originY - 1.2} textAnchor="end">m</text>
          <text className="radar-tick-label" x={originX + 1.6} y="2.8">m</text>
        </>
      ) : null}

      {polygonPoints ? (
        <>
          <polygon className="radar-detection-shape" points={polygonPoints} />
          {polygonSource?.map((point, index) => (
            <circle
              key={`detection-point-${index}`}
              className="radar-detection-point"
              cx={tx(point.x / 100)}
              cy={ty(point.y / 100)}
              r={detectionPointRadius}
            />
          ))}
        </>
      ) : (
        <rect
          className="radar-detection-shape"
          x={tx(rect.xMin)}
          y={ty(rect.yMax)}
          width={(rect.xMax - rect.xMin) * unit}
          height={(rect.yMax - rect.yMin) * unit}
        />
      )}

      {regions.map((region) => {
        const color = REGION_COLORS[region.regionType ?? "empty_tag"];
        const opacity = region.active ? 1 : 0.55;
        const info = liveLabel(region);
        const geometry = region.geometry;
        if (!geometry) return null;

        const isCircle = geometry.shape === "circle";
        const shapeX = isCircle ? tx(geometry.centerX) : tx(geometry.centerX - geometry.width / 2);
        const shapeY = isCircle ? ty(geometry.centerY) : ty(geometry.centerY + geometry.height / 2);
        const radius = isCircle ? geometry.radius * unit : 0;
        const labelPad = 0.08 * unit;
        const nameFont = 0.22 * unit;
        const liveFont = 0.2 * unit;
        const nameHeight = 0.34 * unit;
        const infoHeight = 0.32 * unit;
        const labelX = isCircle ? shapeX - radius + labelPad : shapeX + labelPad;
        const labelY = isCircle ? shapeY - radius + labelPad : shapeY + labelPad;
        const nameWidth = Math.max(1.2 * unit, estimateRadarLabelWidth(region.label, nameFont, 0.24 * unit));
        const infoWidth = info
          ? Math.max(1.0 * unit, estimateRadarLabelWidth(info, liveFont, 0.24 * unit))
          : 0;
        const nameClipId = `radar-label-clip-${region.id}-name`;
        const infoClipId = `radar-label-clip-${region.id}-info`;

        return (
          <g key={region.id} opacity={opacity}>
            {isCircle ? (
              <circle className="radar-region-shape" cx={shapeX} cy={shapeY} r={radius} fill={color} stroke={color} />
            ) : (
              <rect
                className="radar-region-shape"
                x={shapeX}
                y={shapeY}
                width={geometry.width * unit}
                height={geometry.height * unit}
                fill={color}
                stroke={color}
              />
            )}
            <defs>
              <clipPath id={nameClipId}>
                <rect x={labelX} y={labelY} width={nameWidth} height={nameHeight} rx={0.08 * unit} />
              </clipPath>
              {info ? (
                <clipPath id={infoClipId}>
                  <rect x={labelX} y={labelY + 0.41 * unit} width={infoWidth} height={infoHeight} rx={0.08 * unit} />
                </clipPath>
              ) : null}
            </defs>
            <g className="radar-region-name-group" clipPath={`url(#${nameClipId})`}>
              <rect className="radar-region-name-bg" x={labelX} y={labelY} width={nameWidth} height={nameHeight} fill={color} rx={0.08 * unit} />
              <text
                className="radar-region-name"
                x={labelX + 0.12 * unit}
                y={labelY + nameHeight * 0.72}
                fontSize={nameFont}
              >
                {region.label}
              </text>
            </g>
            {info ? (
              <g className="radar-region-live-group" clipPath={`url(#${infoClipId})`}>
                <rect
                  className="radar-region-name-bg"
                  x={labelX}
                  y={labelY + 0.41 * unit}
                  width={infoWidth}
                  height={infoHeight}
                  fill={color}
                  rx={0.08 * unit}
                  opacity="0.88"
                />
                <text
                  className="radar-region-live"
                  x={labelX + 0.12 * unit}
                  y={labelY + 0.41 * unit + infoHeight * 0.72}
                  fontSize={liveFont}
                >
                  {info}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}

      {targets.map((target) => {
        return (
          <g className={`target-point target-point-${target.feature}`} key={`${target.id}-${target.x}-${target.y}`}>
            <circle cx={tx(target.x)} cy={ty(target.y)} r={targetRadius} />
            <circle className="target-halo" cx={tx(target.x)} cy={ty(target.y)} r={targetRadius * 2} />
          </g>
        );
      })}
      <image href={deviceIcon} x={originX - deviceSize / 2} y={originY - deviceSize / 2} width={deviceSize} height={deviceSize} />
    </svg>
  );
}
