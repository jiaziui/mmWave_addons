"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceLogStorage = exports.nextShanghaiMidnight = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const SAFE_DEVICE_ID = /^[A-Za-z0-9._-]+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_PATTERN = /^\d{4}$/;
const MONTH_PATTERN = /^(0[1-9]|1[0-2])$/;
const DAY_PATTERN = /^(0[1-9]|[12]\d|3[01])$/;
const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});
const SHANGHAI_MIDNIGHT_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});
const validDate = (value) => {
    const match = DATE_PATTERN.exec(value);
    if (!match) {
        return false;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const localDateFor = (value) => {
    const date = new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const parts = new Map(SHANGHAI_DATE_FORMATTER.formatToParts(safeDate).map((part) => [part.type, part.value]));
    const year = parts.get("year");
    const month = parts.get("month");
    const day = parts.get("day");
    if (!year || !month || !day) {
        throw new Error("Failed to resolve Asia/Shanghai log date");
    }
    return `${year}-${month}-${day}`;
};
const dateKeyFor = (value) => localDateFor(value.toISOString());
const dateKeyToUtc = (value) => {
    if (!validDate(value)) {
        throw new Error("Invalid log date");
    }
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
};
const previousDateKey = (value, days) => {
    const date = dateKeyToUtc(value);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
};
const retentionCutoff = (retention, today) => {
    if (retention.mode === "forever") {
        return null;
    }
    if (retention.mode === "none") {
        return "0000-00-00";
    }
    const value = retention.value ?? 1;
    if (retention.unit === "day") {
        return previousDateKey(today, value - 1);
    }
    if (retention.unit === "week") {
        return previousDateKey(today, value * 7 - 1);
    }
    const date = dateKeyToUtc(today);
    if (retention.unit === "month") {
        date.setUTCMonth(date.getUTCMonth() - (value - 1));
    }
    else {
        date.setUTCFullYear(date.getUTCFullYear() - (value - 1));
    }
    return date.toISOString().slice(0, 10);
};
const nextShanghaiMidnightDelay = () => {
    const now = new Date();
    const current = new Map(SHANGHAI_MIDNIGHT_FORMATTER.formatToParts(now).map((part) => [part.type, Number(part.value)]));
    const localDate = `${current.get("year")}-${String(current.get("month")).padStart(2, "0")}-${String(current.get("day")).padStart(2, "0")}`;
    const targetDate = previousDateKey(localDate, -1);
    const [year, month, day] = targetDate.split("-").map(Number);
    let nextUtc = Date.UTC(year, month - 1, day);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const actual = new Map(SHANGHAI_MIDNIGHT_FORMATTER.formatToParts(new Date(nextUtc)).map((part) => [part.type, Number(part.value)]));
        const actualAsUtc = Date.UTC(actual.get("year") ?? year, (actual.get("month") ?? month) - 1, actual.get("day") ?? day, actual.get("hour") ?? 0, actual.get("minute") ?? 0, actual.get("second") ?? 0);
        const desiredAsUtc = Date.UTC(year, month - 1, day);
        nextUtc += desiredAsUtc - actualAsUtc;
    }
    return Math.max(1000, nextUtc - now.getTime());
};
const nextShanghaiMidnight = () => new Date(Date.now() + nextShanghaiMidnightDelay()).toISOString();
exports.nextShanghaiMidnight = nextShanghaiMidnight;
const integerCount = (value) => Number.isFinite(value) && Number(value) >= 0 ? Math.floor(Number(value)) : null;
const isLoggableRegionType = (value) => value === "status_detection" || value === "approach_depart" || value === "boundary";
const readNumberDirectories = (directory, pattern) => {
    if (!node_fs_1.default.existsSync(directory)) {
        return [];
    }
    return node_fs_1.default.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
        .map((entry) => Number(entry.name))
        .filter(Number.isInteger)
        .sort((a, b) => a - b);
};
const normalizeLogEntry = (value, identity) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const entry = value;
    if (typeof entry.occurredAt !== "string" ||
        typeof entry.localDate !== "string" ||
        !Number.isInteger(entry.regionIndex) ||
        typeof entry.regionLabel !== "string" ||
        typeof entry.regionType !== "string" ||
        typeof entry.eventType !== "string" ||
        typeof entry.message !== "string") {
        return null;
    }
    return {
        occurredAt: entry.occurredAt,
        localDate: entry.localDate,
        deviceName: typeof entry.deviceName === "string" ? entry.deviceName : identity?.deviceName ?? "",
        deploymentName: typeof entry.deploymentName === "string" ? entry.deploymentName : identity?.deploymentName ?? "",
        regionIndex: entry.regionIndex,
        regionLabel: entry.regionLabel,
        regionType: entry.regionType,
        eventType: entry.eventType,
        movingCount: entry.movingCount,
        staticCount: entry.staticCount,
        totalCount: entry.totalCount,
        message: entry.message,
    };
};
class DeviceLogStorage {
    constructor(dataDir) {
        this.dataDir = dataDir;
        this.lastStates = new Map();
        this.writeQueues = new Map();
        this.recentEntries = new Map();
        this.retentionTimer = null;
    }
    async recordTagEvent(device, event) {
        const region = device.regionConfig.regions.find((candidate) => candidate.index === event.tagIndex && candidate.enabled);
        if (!region || !isLoggableRegionType(region.regionType)) {
            return null;
        }
        const stateKey = `${device.id}:${event.tagIndex}`;
        const built = this.buildEntry(device, region.index, region.label, region.regionType, event);
        if (!built) {
            return null;
        }
        const previousState = this.lastStates.get(stateKey);
        this.lastStates.set(stateKey, built.state);
        if (!built.entry || previousState === built.state) {
            return null;
        }
        if (device.logRetention?.mode !== "none") {
            await this.appendEntry(device.id, built.entry);
        }
        else {
            const entries = this.recentEntries.get(device.id) ?? [];
            this.recentEntries.set(device.id, [built.entry, ...entries].slice(0, 10));
        }
        return built.entry;
    }
    getRecentEntries(deviceId) {
        return [...(this.recentEntries.get(deviceId) ?? [])];
    }
    async cleanupDevice(deviceId, retention, now = new Date()) {
        this.assertDeviceId(deviceId);
        const cutoff = retentionCutoff(retention ?? { mode: "forever", updatedAt: new Date(0).toISOString() }, dateKeyFor(now));
        if (!cutoff) {
            return 0;
        }
        return this.enqueueDeviceWork(deviceId, async () => {
            const logRoot = this.getLogRoot(deviceId);
            if (!node_fs_1.default.existsSync(logRoot)) {
                return 0;
            }
            let removed = 0;
            for (const yearEntry of node_fs_1.default.readdirSync(logRoot, { withFileTypes: true })) {
                if (!yearEntry.isDirectory() || !YEAR_PATTERN.test(yearEntry.name))
                    continue;
                const yearDir = node_path_1.default.join(logRoot, yearEntry.name);
                for (const monthEntry of node_fs_1.default.readdirSync(yearDir, { withFileTypes: true })) {
                    if (!monthEntry.isDirectory() || !MONTH_PATTERN.test(monthEntry.name))
                        continue;
                    const monthDir = node_path_1.default.join(yearDir, monthEntry.name);
                    for (const fileEntry of node_fs_1.default.readdirSync(monthDir, { withFileTypes: true })) {
                        if (!fileEntry.isFile() || !DAY_PATTERN.test(fileEntry.name.slice(0, -6)) || !fileEntry.name.endsWith(".jsonl"))
                            continue;
                        const date = `${yearEntry.name}-${monthEntry.name}-${fileEntry.name.slice(0, -6)}`;
                        if (retention?.mode === "none" || date < cutoff) {
                            node_fs_1.default.rmSync(node_path_1.default.join(monthDir, fileEntry.name), { force: true });
                            removed += 1;
                        }
                    }
                    if (node_fs_1.default.readdirSync(monthDir).length === 0)
                        node_fs_1.default.rmSync(monthDir, { recursive: true, force: true });
                }
                if (node_fs_1.default.readdirSync(yearDir).length === 0)
                    node_fs_1.default.rmSync(yearDir, { recursive: true, force: true });
            }
            return removed;
        });
    }
    startRetentionScheduler(getDevices, onError) {
        this.stopRetentionScheduler();
        const schedule = () => {
            this.retentionTimer = setTimeout(async () => {
                try {
                    for (const device of getDevices()) {
                        await this.cleanupDevice(device.id, device.logRetention);
                    }
                }
                catch (error) {
                    onError(error);
                }
                finally {
                    schedule();
                }
            }, nextShanghaiMidnightDelay());
        };
        schedule();
    }
    stopRetentionScheduler() {
        if (this.retentionTimer)
            clearTimeout(this.retentionTimer);
        this.retentionTimer = null;
    }
    getCalendar(deviceId, year, month) {
        this.assertDeviceId(deviceId);
        if (!Number.isInteger(year) || year < 2000 || year > 9999) {
            throw new Error("Invalid log year");
        }
        if (!Number.isInteger(month) || month < 1 || month > 12) {
            throw new Error("Invalid log month");
        }
        const logRoot = this.getLogRoot(deviceId);
        const yearDirectory = node_path_1.default.join(logRoot, String(year).padStart(4, "0"));
        const monthDirectory = node_path_1.default.join(yearDirectory, String(month).padStart(2, "0"));
        const days = node_fs_1.default.existsSync(monthDirectory)
            ? node_fs_1.default.readdirSync(monthDirectory, { withFileTypes: true })
                .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl") && DAY_PATTERN.test(entry.name.slice(0, -6)))
                .map((entry) => Number(entry.name.slice(0, -6)))
                .sort((a, b) => a - b)
            : [];
        return {
            year,
            month,
            years: readNumberDirectories(logRoot, YEAR_PATTERN),
            months: readNumberDirectories(yearDirectory, MONTH_PATTERN),
            days,
        };
    }
    getLogs(deviceId, date, page = 1, pageSize = 50, identity) {
        this.assertDeviceId(deviceId);
        if (!validDate(date)) {
            throw new Error("Invalid log date");
        }
        if (!Number.isInteger(page) || page < 1) {
            throw new Error("Invalid log page");
        }
        if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
            throw new Error("Invalid log page size");
        }
        const filePath = this.getDateFile(deviceId, date);
        const logs = node_fs_1.default.existsSync(filePath)
            ? node_fs_1.default.readFileSync(filePath, "utf8")
                .split(/\r?\n/)
                .filter(Boolean)
                .map((line) => {
                try {
                    return normalizeLogEntry(JSON.parse(line), identity);
                }
                catch {
                    return null;
                }
            })
                .filter((entry) => entry !== null)
                .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            : [];
        const offset = (page - 1) * pageSize;
        return {
            date,
            page,
            pageSize,
            total: logs.length,
            hasMore: offset + pageSize < logs.length,
            logs: logs.slice(offset, offset + pageSize),
        };
    }
    forgetDevice(deviceId) {
        for (const key of this.lastStates.keys()) {
            if (key.startsWith(`${deviceId}:`)) {
                this.lastStates.delete(key);
            }
        }
        this.recentEntries.delete(deviceId);
    }
    buildEntry(device, regionIndex, regionLabel, regionType, event) {
        const occurredAt = Number.isNaN(new Date(event.receivedAt).getTime()) ? new Date().toISOString() : event.receivedAt;
        const base = {
            occurredAt,
            localDate: localDateFor(occurredAt),
            deviceName: device.name || device.prefix,
            deploymentName: device.deploymentName || "",
            regionIndex,
            regionLabel,
            regionType,
        };
        const displayIndex = regionIndex + 1;
        if (regionType === "status_detection" && event.tagType === "people_counting") {
            const movingCount = integerCount(event.movingCount);
            const staticCount = integerCount(event.staticCount);
            if (movingCount === null || staticCount === null) {
                return null;
            }
            const totalCount = movingCount + staticCount;
            return {
                state: `status:${movingCount}:${staticCount}`,
                entry: {
                    ...base,
                    eventType: "status_changed",
                    movingCount,
                    staticCount,
                    totalCount,
                    message: `${displayIndex}号${regionLabel}当前运动人数为${movingCount}人，静止人数为${staticCount}人，总人数为${totalCount}人`,
                },
            };
        }
        if (regionType === "approach_depart" && event.tagType === "approach_away") {
            const state = event.approachAwayState ?? "none";
            const eventType = state === "approach" || state === "away" ? state : null;
            return {
                state: `approach:${state}`,
                entry: eventType
                    ? { ...base, eventType, message: `${displayIndex}号${regionLabel}区域有人${eventType === "approach" ? "靠近" : "远离"}` }
                    : null,
            };
        }
        if (regionType === "boundary" && event.tagType === "boundary") {
            const state = event.boundaryState ?? "none";
            const eventType = state === "enter" || state === "exit" ? state : null;
            return {
                state: `boundary:${state}`,
                entry: eventType
                    ? { ...base, eventType, message: `${displayIndex}号${regionLabel}区域有人${eventType === "enter" ? "进入" : "离开"}` }
                    : null,
            };
        }
        return null;
    }
    async appendEntry(deviceId, entry) {
        const filePath = this.getDateFile(deviceId, entry.localDate);
        await this.enqueueDeviceWork(deviceId, async () => {
            await node_fs_1.default.promises.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
            await node_fs_1.default.promises.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
        });
    }
    async enqueueDeviceWork(deviceId, work) {
        const previous = this.writeQueues.get(deviceId) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(work);
        const queued = next.then(() => undefined, () => undefined);
        this.writeQueues.set(deviceId, queued);
        try {
            return await next;
        }
        finally {
            if (this.writeQueues.get(deviceId) === queued) {
                this.writeQueues.delete(deviceId);
            }
        }
    }
    assertDeviceId(deviceId) {
        if (!SAFE_DEVICE_ID.test(deviceId)) {
            throw new Error("Invalid device id");
        }
    }
    getLogRoot(deviceId) {
        return node_path_1.default.join(this.dataDir, deviceId, "log");
    }
    getDateFile(deviceId, date) {
        const [year, month, day] = date.split("-");
        return node_path_1.default.join(this.getLogRoot(deviceId), year, month, `${day}.jsonl`);
    }
}
exports.DeviceLogStorage = DeviceLogStorage;
