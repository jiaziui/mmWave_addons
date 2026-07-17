import { useEffect, useRef, useState } from "react";
import {
  fetchDeviceConfig,
  fetchDeviceLogCalendar,
  fetchDeviceLogs,
  updateDeviceConfig,
  type DeviceLogCalendar,
  type DeviceLogEntry,
  type DeviceLogPage,
  type DeviceLogRetention,
} from "../api/client";

interface DeviceLogPanelProps {
  deviceId: string;
  online: boolean;
  refreshToken: number;
  memoryEntries?: DeviceLogEntry[];
  onError: (message: string) => void;
}

const shanghaiDate = (): string => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const dateParts = (value: string): { year: number; month: number; day: number } => {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
};

const latest = (values: number[], fallback: number): number => values.length ? values[values.length - 1] : fallback;
const pad = (value: number): string => String(value).padStart(2, "0");
const dateValue = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`;

const regionTypeLabel = (entry: DeviceLogEntry): string => {
  if (entry.regionType === "status_detection") return "状态检测";
  if (entry.regionType === "approach_depart") return "靠近远离";
  if (entry.regionType === "boundary") return "边界检测";
  return "区域事件";
};

const timeLabel = (value: string): string => new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(new Date(value));

const defaultRetention: DeviceLogRetention = { mode: "forever", updatedAt: new Date(0).toISOString() };

export function DeviceLogPanel({ deviceId, online, refreshToken, memoryEntries = [], onError }: DeviceLogPanelProps) {
  const today = shanghaiDate();
  const current = dateParts(today);
  const [calendar, setCalendar] = useState<DeviceLogCalendar | null>(null);
  const [selectedYear, setSelectedYear] = useState(current.year);
  const [selectedMonth, setSelectedMonth] = useState(current.month);
  const [selectedDay, setSelectedDay] = useState(current.day);
  const [logPage, setLogPage] = useState<DeviceLogPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");
  const [retention, setRetention] = useState<DeviceLogRetention>(defaultRetention);
  const [retentionMode, setRetentionMode] = useState<DeviceLogRetention["mode"]>("forever");
  const [retentionValue, setRetentionValue] = useState(7);
  const [retentionUnit, setRetentionUnit] = useState<NonNullable<DeviceLogRetention["unit"]>>("day");
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const requestIdRef = useRef(0);
  const initializedDeviceRef = useRef<string | null>(null);
  const selectedDate = dateValue(selectedYear, selectedMonth, selectedDay);

  const reportError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : fallback;
    setLocalError(message);
    onError(message);
  };

  const loadCalendar = async (year: number, month: number): Promise<DeviceLogCalendar> => {
    const response = await fetchDeviceLogCalendar(deviceId, year, month);
    setCalendar(response);
    return response;
  };

  const loadLogs = async (targetPage: number, showLoading = true) => {
    const requestId = ++requestIdRef.current;
    if (showLoading) setLoading(true);
    try {
      const response = await fetchDeviceLogs(deviceId, selectedDate, targetPage, 50);
      if (requestId === requestIdRef.current) {
        setLogPage(response);
        setPage(targetPage);
        setLocalError("");
      }
    } catch (error) {
      if (requestId === requestIdRef.current) reportError(error, "设备日志加载失败");
    } finally {
      if (showLoading && requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    initializedDeviceRef.current = null;
    setLogPage(null);
    setLocalError("");
    setRetention(defaultRetention);
    setRetentionMode("forever");

    const initialize = async () => {
      setLoading(true);
      try {
        let response = await fetchDeviceLogCalendar(deviceId, current.year, current.month);
        const year = latest(response.years, current.year);
        if (year !== response.year) response = await fetchDeviceLogCalendar(deviceId, year, current.month);
        const month = latest(response.months, year === current.year ? current.month : 12);
        if (month !== response.month) response = await fetchDeviceLogCalendar(deviceId, year, month);
        const day = latest(response.days, year === current.year && month === current.month ? current.day : 1);
        if (cancelled) return;
        setCalendar(response);
        setSelectedYear(year);
        setSelectedMonth(month);
        setSelectedDay(day);
        setPage(1);
        initializedDeviceRef.current = deviceId;
      } catch (error) {
        if (!cancelled) reportError(error, "设备日志日期加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialize();
    void fetchDeviceConfig(deviceId).then(({ config }) => {
      if (cancelled) return;
      setRetention(config.logRetention);
      setRetentionMode(config.logRetention.mode);
      setRetentionValue(config.logRetention.value ?? 7);
      setRetentionUnit(config.logRetention.unit ?? "day");
    }).catch((error) => {
      if (!cancelled) reportError(error, "日志保留配置加载失败");
    });
    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [deviceId]);

  useEffect(() => {
    if (initializedDeviceRef.current !== deviceId) return;
    void loadLogs(1);
  }, [deviceId, selectedDate]);

  useEffect(() => {
    if (!refreshToken || initializedDeviceRef.current !== deviceId || selectedDate !== today) return;
    void loadLogs(1, false);
  }, [refreshToken]);

  const changeYear = async (year: number) => {
    setLoading(true);
    try {
      let response = await loadCalendar(year, selectedMonth);
      const month = latest(response.months, selectedMonth);
      if (month !== response.month) response = await loadCalendar(year, month);
      setSelectedYear(year);
      setSelectedMonth(month);
      setSelectedDay(latest(response.days, 1));
      setPage(1);
    } catch (error) {
      reportError(error, "日志年份切换失败");
    } finally {
      setLoading(false);
    }
  };

  const changeMonth = async (month: number) => {
    setLoading(true);
    try {
      const response = await loadCalendar(selectedYear, month);
      setSelectedMonth(month);
      setSelectedDay(latest(response.days, 1));
      setPage(1);
    } catch (error) {
      reportError(error, "日志月份切换失败");
    } finally {
      setLoading(false);
    }
  };

  const saveRetention = async () => {
    if (retentionMode === "limited" && (!Number.isInteger(retentionValue) || retentionValue < 1)) {
      setLocalError("日志保留期限必须是大于 0 的整数");
      return;
    }
    setRetentionSaving(true);
    try {
      const response = await updateDeviceConfig(deviceId, {
        logRetention: retentionMode === "limited"
          ? { mode: "limited", value: retentionValue, unit: retentionUnit }
          : { mode: retentionMode },
      });
      setRetention(response.config.logRetention);
      setRetentionOpen(false);
      setLocalError("");
    } catch (error) {
      reportError(error, "日志保留配置保存失败");
    } finally {
      setRetentionSaving(false);
    }
  };

  const years = calendar?.years.length ? calendar.years : [selectedYear];
  const months = calendar?.months.length ? calendar.months : [selectedMonth];
  const days = calendar?.days.length ? calendar.days : [selectedDay];
  const memoryLogs = retention.mode === "none"
    ? memoryEntries.filter((entry) => entry.localDate === selectedDate)
    : [];
  const visibleLogs = memoryLogs.length ? memoryLogs : logPage?.logs ?? [];
  const memoryOnly = retention.mode === "none";

  return <div className="device-log-panel">
    <div className="device-log-toolbar">
      <div className="device-log-filters">
        <label>年<select value={selectedYear} disabled={loading} onChange={(event) => void changeYear(Number(event.target.value))}>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select></label>
        <label>月<select value={selectedMonth} disabled={loading} onChange={(event) => void changeMonth(Number(event.target.value))}>
          {months.map((month) => <option key={month} value={month}>{month}</option>)}
        </select></label>
        <label>日<select value={selectedDay} disabled={loading} onChange={(event) => { setSelectedDay(Number(event.target.value)); setPage(1); }}>
          {days.map((day) => <option key={day} value={day}>{day}</option>)}
        </select></label>
        <button type="button" className="device-log-refresh" disabled={loading} onClick={() => void loadLogs(1)}>{loading ? "读取中" : "刷新"}</button>
      </div>
      <button type="button" className="device-log-retention-button" onClick={() => setRetentionOpen(true)}>日志保留</button>
    </div>

    {!online ? <div className="device-log-offline">设备当前离线，暂无新的区域事件，历史日志仍可查看。</div> : null}
    {localError ? <div className="device-log-error">{localError}</div> : null}
    {memoryOnly ? <div className="device-log-memory-note">当前设备未启用日志保存，实时页面仅保留最近 10 条事件</div> : null}

    <div className="device-log-list">
      {visibleLogs.length ? visibleLogs.map((entry) => <article className={`device-log-entry device-log-${entry.eventType}`} key={`${entry.occurredAt}-${entry.regionIndex}-${entry.eventType}`}>
        <div className="device-log-entry-head">
          <time>{timeLabel(entry.occurredAt)}</time>
          <span>{regionTypeLabel(entry)}</span>
        </div>
        <strong>{entry.message}</strong>
      </article>) : <div className="device-log-empty">{loading ? "正在读取设备日志..." : memoryOnly ? "暂无内存区域事件" : "该日期暂无区域事件日志"}</div>}
    </div>

    <div className="device-log-pagination">
      <button type="button" disabled={loading || page <= 1 || memoryOnly} onClick={() => void loadLogs(page - 1)}>上一页</button>
      <span>第 {page} 页 · 共 {memoryOnly ? visibleLogs.length : logPage?.total ?? 0} 条</span>
      <button type="button" disabled={loading || memoryOnly || !logPage?.hasMore} onClick={() => void loadLogs(page + 1)}>下一页</button>
    </div>

    {retentionOpen ? <div className="device-log-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRetentionOpen(false); }}>
      <section className="device-log-retention-modal" role="dialog" aria-modal="true" aria-labelledby="device-log-retention-title">
        <div className="device-log-retention-head">
          <h3 id="device-log-retention-title">日志保留</h3>
          <button type="button" onClick={() => setRetentionOpen(false)} aria-label="关闭">×</button>
        </div>
        <label>保留策略<select value={retentionMode} onChange={(event) => setRetentionMode(event.target.value as DeviceLogRetention["mode"])}>
          <option value="forever">永久保留</option>
          <option value="limited">按期限保留</option>
          <option value="none">不保留</option>
        </select></label>
        {retentionMode === "limited" ? <div className="device-log-retention-period">
          <label>期限<input type="number" min="1" step="1" value={retentionValue} onChange={(event) => setRetentionValue(Number(event.target.value))} /></label>
          <label>单位<select value={retentionUnit} onChange={(event) => setRetentionUnit(event.target.value as NonNullable<DeviceLogRetention["unit"]>)}>
            <option value="day">天</option><option value="week">周</option><option value="month">月</option><option value="year">年</option>
          </select></label>
        </div> : null}
        <p className="device-log-retention-hint">
          {retentionMode === "forever" ? "日志不会自动清理。" : retentionMode === "none" ? "停止写入日志，已有日志将在下一个凌晨 00:00 清理。" : "配置保存后，将在下一个凌晨 00:00 执行清理。"}
        </p>
        <div className="device-log-retention-actions">
          <button type="button" onClick={() => setRetentionOpen(false)}>取消</button>
          <button type="button" className="primary-button" disabled={retentionSaving} onClick={() => void saveRetention()}>{retentionSaving ? "保存中..." : "保存配置"}</button>
        </div>
      </section>
    </div> : null}
  </div>;
}
