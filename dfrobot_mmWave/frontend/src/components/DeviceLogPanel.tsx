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
import { useLocale } from "../i18n/LocaleContext";
import { formatDeviceLogMessage } from "../utils/formatDeviceLogMessage";

interface DeviceLogPanelProps {
  deviceId: string;
  online: boolean;
  refreshToken: number;
  memoryEntries?: DeviceLogEntry[];
  deploymentName?: string;
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

const defaultRetention: DeviceLogRetention = { mode: "forever", updatedAt: new Date(0).toISOString() };

export function DeviceLogPanel({ deviceId, online, refreshToken, memoryEntries = [], deploymentName, onError }: DeviceLogPanelProps) {
  const { t, locale } = useLocale();
  const regionTypeLabel = (entry: DeviceLogEntry): string => {
    if (entry.regionType === "status_detection") return t("logs.regionType.status_detection");
    if (entry.regionType === "noise") return t("logs.regionType.noise");
    if (entry.regionType === "approach_depart") return t("logs.regionType.approach_depart");
    if (entry.regionType === "boundary") return t("logs.regionType.boundary");
    return t("logs.regionType.fallback");
  };
  const resolveDeploymentName = (entry: DeviceLogEntry): string =>
    entry.deploymentName?.trim() || deploymentName?.trim() || t("devices.deployment.unset");
  const timeLabel = (value: string): string => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
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
      if (requestId === requestIdRef.current) reportError(error, t("logs.err.loadFailed"));
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
        if (!cancelled) reportError(error, t("logs.err.calendarFailed"));
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
      if (!cancelled) reportError(error, t("logs.err.retentionLoadFailed"));
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
      reportError(error, t("logs.err.yearSwitchFailed"));
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
      reportError(error, t("logs.err.monthSwitchFailed"));
    } finally {
      setLoading(false);
    }
  };

  const saveRetention = async () => {
    if (retentionMode === "limited" && (!Number.isInteger(retentionValue) || retentionValue < 1)) {
      setLocalError(t("logs.err.retentionInvalid"));
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
      reportError(error, t("logs.err.retentionSaveFailed"));
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
        <label>{t("logs.filter.year")}<select value={selectedYear} disabled={loading} onChange={(event) => void changeYear(Number(event.target.value))}>
          {years.map((year) => <option key={year} value={year}>{year}</option>)}
        </select></label>
        <label>{t("logs.filter.month")}<select value={selectedMonth} disabled={loading} onChange={(event) => void changeMonth(Number(event.target.value))}>
          {months.map((month) => <option key={month} value={month}>{month}</option>)}
        </select></label>
        <label>{t("logs.filter.day")}<select value={selectedDay} disabled={loading} onChange={(event) => { setSelectedDay(Number(event.target.value)); setPage(1); }}>
          {days.map((day) => <option key={day} value={day}>{day}</option>)}
        </select></label>
        <button type="button" className="device-log-refresh" disabled={loading} onClick={() => void loadLogs(1)}>{loading ? t("logs.reading") : t("logs.refresh")}</button>
      </div>
      <button type="button" className="device-log-retention-button" onClick={() => setRetentionOpen(true)}>{t("logs.retention")}</button>
    </div>

    {!online ? <div className="device-log-offline">{t("logs.offlineBanner")}</div> : null}
    {localError ? <div className="device-log-error">{localError}</div> : null}
    {memoryOnly ? <div className="device-log-memory-note">{t("logs.memoryNote")}</div> : null}

    <div className="device-log-list">
      {visibleLogs.length ? visibleLogs.map((entry) => <article className={`device-log-entry device-log-${entry.eventType}`} key={`${entry.occurredAt}-${entry.regionIndex}-${entry.eventType}`}>
        <div className="device-log-entry-head">
          <time>{timeLabel(entry.occurredAt)}</time>
          <span className="device-log-deployment">{resolveDeploymentName(entry)}</span>
          <span className="device-log-region-type">{regionTypeLabel(entry)}</span>
        </div>
        <strong className="device-log-message">{formatDeviceLogMessage(entry, t)}</strong>
      </article>) : <div className="device-log-empty">{loading ? t("logs.empty.loading") : memoryOnly ? t("logs.empty.memory") : t("logs.empty.date")}</div>}
    </div>

    <div className="device-log-pagination">
      <button type="button" disabled={loading || page <= 1 || memoryOnly} onClick={() => void loadLogs(page - 1)}>{t("logs.pagination.prev")}</button>
      <span>{t("logs.pagination.summary", { page, total: memoryOnly ? visibleLogs.length : logPage?.total ?? 0 })}</span>
      <button type="button" disabled={loading || memoryOnly || !logPage?.hasMore} onClick={() => void loadLogs(page + 1)}>{t("logs.pagination.next")}</button>
    </div>

    {retentionOpen ? <div className="device-log-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRetentionOpen(false); }}>
      <section className="device-log-retention-modal" role="dialog" aria-modal="true" aria-labelledby="device-log-retention-title">
        <div className="device-log-retention-head">
          <h3 id="device-log-retention-title">{t("logs.retention.title")}</h3>
          <button type="button" onClick={() => setRetentionOpen(false)} aria-label={t("common.close")}>×</button>
        </div>
        <label>{t("logs.retention.policy")}<select value={retentionMode} onChange={(event) => setRetentionMode(event.target.value as DeviceLogRetention["mode"])}>
          <option value="forever">{t("logs.retention.mode.forever")}</option>
          <option value="limited">{t("logs.retention.mode.limited")}</option>
          <option value="none">{t("logs.retention.mode.none")}</option>
        </select></label>
        {retentionMode === "limited" ? <div className="device-log-retention-period">
          <label>{t("logs.retention.period")}<input type="number" min="1" step="1" value={retentionValue} onChange={(event) => setRetentionValue(Number(event.target.value))} /></label>
          <label>{t("logs.retention.unit")}<select value={retentionUnit} onChange={(event) => setRetentionUnit(event.target.value as NonNullable<DeviceLogRetention["unit"]>)}>
            <option value="day">{t("logs.retention.unit.day")}</option><option value="week">{t("logs.retention.unit.week")}</option><option value="month">{t("logs.retention.unit.month")}</option><option value="year">{t("logs.retention.unit.year")}</option>
          </select></label>
        </div> : null}
        <p className="device-log-retention-hint">
          {retentionMode === "forever" ? t("logs.retention.hint.forever") : retentionMode === "none" ? t("logs.retention.hint.none") : t("logs.retention.hint.limited")}
        </p>
        <div className="device-log-retention-actions">
          <button type="button" onClick={() => setRetentionOpen(false)}>{t("logs.retention.cancel")}</button>
          <button type="button" className="primary-button" disabled={retentionSaving} onClick={() => void saveRetention()}>{retentionSaving ? t("logs.retention.saving") : t("logs.retention.save")}</button>
        </div>
      </section>
    </div> : null}
  </div>;
}
