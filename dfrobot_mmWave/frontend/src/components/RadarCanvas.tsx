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

const X_MIN = -5;
const X_MAX = 5;
const Y_MIN = -0.5;
const Y_MAX = 8.5;
const UNIT_X = 100 / (X_MAX - X_MIN);
const UNIT_Y = 100 / (Y_MAX - Y_MIN);
const ORIGIN_X = -X_MIN * UNIT_X;
const ORIGIN_Y = Y_MAX * UNIT_Y;

const X_TICKS = Array.from({ length: X_MAX - X_MIN + 1 }, (_, index) => X_MIN + index);
/** Integer Y ticks only; world range stays -0.5..8.5 but endpoint labels are hidden. */
const Y_TICKS = Array.from(
  { length: Math.floor(Y_MAX) - Math.ceil(Y_MIN) + 1 },
  (_, index) => Math.ceil(Y_MIN) + index,
);

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

export function RadarCanvas({
  rangeBox,
  detection,
  regions,
  targets,
  backgroundInstances = [],
  viewPreferences,
  large = false,
}: {
  coordinate: RangeBox;
  rangeBox: RangeBox;
  detection?: DetectionRangeConfig;
  regions: RegionOverlay[];
  targets: TrajectoryPoint[];
  backgroundInstances?: BaseMapInstance[];
  viewPreferences?: RegionViewPreferences;
  large?: boolean;
}) {
  const tx = (x: number) => ORIGIN_X + x * UNIT_X;
  const ty = (y: number) => ORIGIN_Y - y * UNIT_Y;
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
  const deviceSize = large ? 11 : 9;
  const hasVisibleBackground = backgroundInstances.some((instance) => instance.visible);
  const gridVisible = viewPreferences?.gridVisible ?? true;
  const backgroundVisible = viewPreferences?.backgroundVisible ?? hasVisibleBackground;
  const visibleBackgrounds = backgroundVisible
    ? [...backgroundInstances]
        .filter((instance) => instance.visible)
        .sort((left, right) => left.zIndex - right.zIndex)
    : [];

  return (
    <svg className={large ? "radar-canvas radar-canvas-large" : "radar-canvas"} viewBox="0 0 100 100" preserveAspectRatio="none">
      {gridVisible ? (
        <>
          {X_TICKS.map((x) => (
            <line key={`grid-x-${x}`} className="radar-grid-line" x1={tx(x)} x2={tx(x)} y1="0" y2="100" />
          ))}
          {Y_TICKS.map((y) => (
            <line key={`grid-y-${y}`} className="radar-grid-line" x1="0" x2="100" y1={ty(y)} y2={ty(y)} />
          ))}
        </>
      ) : null}

      {visibleBackgrounds.map((instance) => {
        const href = resolveBaseMapSourceUrl(instance.sourceType, instance.sourceId);
        if (!href) return null;
        return (
          <image
            key={instance.id}
            className="radar-base-map"
            href={href}
            x={tx(instance.xCm / 100)}
            y={ty((instance.yCm + instance.heightCm) / 100)}
            width={(instance.widthCm / 100) * UNIT_X}
            height={(instance.heightCm / 100) * UNIT_Y}
            opacity={0.45}
            preserveAspectRatio="none"
          />
        );
      })}

      {gridVisible ? (
        <>
          <line className="radar-axis-line" x1="0" x2="100" y1={ORIGIN_Y} y2={ORIGIN_Y} />
          <line className="radar-axis-line" x1={ORIGIN_X} x2={ORIGIN_X} y1="0" y2="100" />
          {X_TICKS
            .filter((x) => x !== 0)
            .map((x) => <text key={`tick-x-${x}`} className="radar-tick-label" x={tx(x)} y={Math.min(98.8, ORIGIN_Y + 2.2)} textAnchor="middle">{x}</text>)}
          {Y_TICKS
            .filter((y) => y !== 0)
            .map((y) => <text key={`tick-y-${y}`} className="radar-tick-label" x={Math.max(1.6, ORIGIN_X - 1.6)} y={ty(y) + 0.7} textAnchor="end">{y}</text>)}
          <text className="radar-tick-label" x={ORIGIN_X + 1.8} y={ORIGIN_Y + 2.2}>0</text>
          <text className="radar-tick-label" x="97.5" y={ORIGIN_Y - 1.2} textAnchor="end">m</text>
          <text className="radar-tick-label" x={ORIGIN_X + 1.6} y="2.8">m</text>
        </>
      ) : null}

      {polygonPoints ? (
        <>
          <polygon className="radar-detection-shape" points={polygonPoints} />
          {polygonSource?.map((point, index) => (
            <circle key={`detection-point-${index}`} className="radar-detection-point" cx={tx(point.x / 100)} cy={ty(point.y / 100)} r={large ? 0.8 : 0.65} />
          ))}
        </>
      ) : (
        <rect
          className="radar-detection-shape"
          x={tx(rect.xMin)}
          y={ty(rect.yMax)}
          width={(rect.xMax - rect.xMin) * UNIT_X}
          height={(rect.yMax - rect.yMin) * UNIT_Y}
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
        const radius = isCircle ? geometry.radius * UNIT_X : 0;
        const labelX = isCircle ? shapeX - radius + 0.8 : shapeX + 0.8;
        const labelY = isCircle ? shapeY - radius + 0.8 : shapeY + 0.8;
        const nameWidth = Math.max(12, estimateRadarLabelWidth(region.label, 2.5, 2.8));
        const infoWidth = Math.max(10, estimateRadarLabelWidth(info, 2.35, 2.8));

        return (
          <g key={region.id} opacity={opacity}>
            {isCircle ? (
              <circle className="radar-region-shape" cx={shapeX} cy={shapeY} r={radius} fill={color} stroke={color} />
            ) : (
              <rect className="radar-region-shape" x={shapeX} y={shapeY} width={geometry.width * UNIT_X} height={geometry.height * UNIT_Y} fill={color} stroke={color} />
            )}
            <g className="radar-region-name-group">
              <rect className="radar-region-name-bg" x={labelX} y={labelY} width={nameWidth} height="3.4" fill={color} rx="0.8" />
              <text className="radar-region-name" x={labelX + 1.2} y={labelY + 2.4}>{region.label}</text>
            </g>
            {info ? (
              <g className="radar-region-live-group">
                <rect className="radar-region-name-bg" x={labelX} y={labelY + 4.1} width={infoWidth} height="3.2" fill={color} rx="0.8" opacity="0.88" />
                <text className="radar-region-live" x={labelX + 1.2} y={labelY + 6.3}>{info}</text>
              </g>
            ) : null}
          </g>
        );
      })}

      {targets.map((target) => {
        const radius = large ? 1.5 : 1.2;
        return (
          <g className={`target-point target-point-${target.feature}`} key={`${target.id}-${target.x}-${target.y}`}>
            <circle cx={tx(target.x)} cy={ty(target.y)} r={radius} />
            <circle className="target-halo" cx={tx(target.x)} cy={ty(target.y)} r={radius * 2} />
          </g>
        );
      })}
      <image href={deviceIcon} x={ORIGIN_X - deviceSize / 2} y={ORIGIN_Y - deviceSize / 2} width={deviceSize} height={deviceSize} />
    </svg>
  );
}
