"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMmwaveRouter = void 0;
const express_1 = require("express");
const parseDetectionMode = (value) => {
    if (value === "high_sensitivity") {
        return 1;
    }
    if (value === "static_stable") {
        return 2;
    }
    const parsed = typeof value === "number" ? value : Number(value);
    return parsed === 1 || parsed === 2 ? parsed : null;
};
const toInstallHeightM = (value) => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
        return 1.8;
    }
    return Math.round(Math.max(1.8, Math.min(2, parsed)) * 100) / 100;
};
const toInitializeStatus = (message) => {
    if (message === "Device not found") {
        return 404;
    }
    if (message === "Device number already exists") {
        return 409;
    }
    if (message === "Home Assistant is not linked") {
        return 424;
    }
    if (message === "Invalid detection mode") {
        return 400;
    }
    return 502;
};
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const toConfigStatus = (message) => {
    if (message === "Device not found") {
        return 404;
    }
    if (message === "Home Assistant is not linked") {
        return 424;
    }
    if (message === "Device profile does not support config yet") {
        return 400;
    }
    if (message.startsWith("Invalid region config") || message.startsWith("Invalid log retention") || message === "No valid config update provided") {
        return 400;
    }
    if (message.includes("学习探测范围进行中")) {
        return 409;
    }
    return 502;
};
const parseOptionalBoolean = (value) => {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "on" || normalized === "true" || normalized === "1") {
        return true;
    }
    if (normalized === "off" || normalized === "false" || normalized === "0") {
        return false;
    }
    return undefined;
};
const parseOptionalNumber = (value) => {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const parseInteger = (value, fallback) => {
    if (value === undefined && fallback !== undefined) {
        return fallback;
    }
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(parsed)) {
        throw new Error("Invalid log query parameter");
    }
    return parsed;
};
const toLogStatus = (message) => {
    if (message === "Device not found") {
        return 404;
    }
    if (message.startsWith("Invalid ")) {
        return 400;
    }
    return 502;
};
const parseDeviceSettings = (value) => {
    if (!isRecord(value)) {
        return null;
    }
    const settings = {};
    const booleanKeys = ["presenceEnable", "trajectoryTrackEnable", "trajectoryLed", "motionLed"];
    const numberKeys = [
        "installZAngle",
        "realTimePeopleTime",
        "trackMeters",
        "trackExistsTime",
        "checkToActiveFrames",
        "unmannedTime",
        "zone1McuIo",
        "zone2McuIo",
        "zone3McuIo",
        "zone4McuIo",
        "zone5McuIo",
        "zone6McuIo",
    ];
    for (const key of booleanKeys) {
        const parsed = parseOptionalBoolean(value[key]);
        if (parsed !== undefined) {
            settings[key] = parsed;
        }
    }
    for (const key of numberKeys) {
        const parsed = parseOptionalNumber(value[key]);
        if (parsed !== undefined) {
            settings[key] = parsed;
        }
    }
    return Object.keys(settings).length ? settings : null;
};
const createMmwaveRouter = (service) => {
    const router = (0, express_1.Router)();
    router.get("/devices/discover", async (_req, res) => {
        try {
            const devices = await service.discoverDevices();
            res.json({ ok: true, devices });
        }
        catch (error) {
            res.status(502).json({
                ok: false,
                error: error instanceof Error ? error.message : "Failed to discover devices",
            });
        }
    });
    router.get("/devices", async (_req, res) => {
        try {
            res.json({ ok: true, devices: await service.listDevices() });
        }
        catch (error) {
            res.status(502).json({
                ok: false,
                error: error instanceof Error ? error.message : "Failed to list devices",
            });
        }
    });
    router.get("/overview", async (_req, res) => {
        try {
            res.json(await service.getOverview());
        }
        catch (error) {
            res.status(502).json({
                ok: false,
                error: error instanceof Error ? error.message : "Failed to load overview",
            });
        }
    });
    router.get("/devices/:deviceId/detail", async (req, res) => {
        try {
            res.json({ ok: true, detail: await service.getDeviceDetail(req.params.deviceId) });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to load device detail";
            res.status(message === "Device not found" ? 404 : 502).json({ ok: false, error: message });
        }
    });
    router.get("/devices/:deviceId/config", async (req, res) => {
        try {
            res.json({ ok: true, config: await service.getDeviceConfig(req.params.deviceId) });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to load device config";
            res.status(toConfigStatus(message)).json({ ok: false, error: message });
        }
    });
    router.get("/devices/:deviceId/logs/calendar", (req, res) => {
        try {
            const year = parseInteger(req.query.year);
            const month = parseInteger(req.query.month);
            res.json({ ok: true, ...service.getDeviceLogCalendar(req.params.deviceId, year, month) });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to load device log calendar";
            res.status(toLogStatus(message)).json({ ok: false, error: message });
        }
    });
    router.get("/devices/:deviceId/logs", (req, res) => {
        try {
            const date = typeof req.query.date === "string" ? req.query.date : "";
            const page = parseInteger(req.query.page, 1);
            const pageSize = parseInteger(req.query.pageSize, 50);
            res.json({ ok: true, ...service.getDeviceLogs(req.params.deviceId, date, page, pageSize) });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to load device logs";
            res.status(toLogStatus(message)).json({ ok: false, error: message });
        }
    });
    router.put("/devices/:deviceId/config", async (req, res) => {
        try {
            const hasStructuredBody = isRecord(req.body) && ("deviceSettings" in req.body || "settings" in req.body || "regionConfig" in req.body || "logRetention" in req.body || "apply" in req.body);
            const rawSettings = hasStructuredBody ? req.body.deviceSettings ?? req.body.settings : req.body;
            const settings = parseDeviceSettings(rawSettings);
            const regionConfig = hasStructuredBody ? req.body.regionConfig : undefined;
            const logRetention = hasStructuredBody && isRecord(req.body.logRetention)
                ? req.body.logRetention
                : undefined;
            const apply = isRecord(req.body?.apply)
                ? {
                    fourSidedRange: req.body.apply.fourSidedRange === true,
                    regionMcuIo: req.body.apply.regionMcuIo === true,
                    tagConfig: req.body.apply.tagConfig === true,
                    customRange: req.body.apply.customRange === true,
                }
                : undefined;
            if (!settings && !logRetention && regionConfig === undefined && !apply?.tagConfig && !apply?.customRange) {
                res.status(400).json({ ok: false, error: "No valid config update provided" });
                return;
            }
            const result = await service.updateDeviceConfig(req.params.deviceId, {
                deviceSettings: settings ?? undefined,
                logRetention: logRetention,
                regionConfig,
                apply,
            });
            res.json({ ok: true, ...result });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to update device config";
            res.status(toConfigStatus(message)).json({ ok: false, error: message });
        }
    });
    router.post("/devices/:deviceId/actions/refresh", async (req, res) => {
        try {
            res.json({ ok: true, detail: await service.refreshDevice(req.params.deviceId) });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to refresh device";
            res.status(message === "Device not found" ? 404 : 502).json({ ok: false, error: message });
        }
    });
    router.post("/devices/:deviceId/actions/learned-range", async (req, res) => {
        try {
            const action = req.body?.action;
            if (action !== "start" && action !== "stop" && action !== "query") {
                res.status(400).json({ ok: false, error: "Invalid learned range action" });
                return;
            }
            res.json({
                ok: true,
                learnedRange: await service.learnedRangeAction(req.params.deviceId, action),
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to operate learned range";
            const status = message === "Device not found" ? 404 : message.includes("离线") || message.includes("MQTT") ? 409 : 502;
            res.status(status).json({ ok: false, error: message });
        }
    });
    router.post("/devices/:deviceId/actions/reset", async (req, res) => {
        try {
            res.json({ ok: true, detail: await service.resetDevice(req.params.deviceId) });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to reset device";
            res.status(message === "Device not found" ? 404 : 502).json({ ok: false, error: message });
        }
    });
    router.post("/devices/:deviceId/actions/factory-reset", async (req, res) => {
        try {
            res.json({ ok: true, config: await service.factoryResetDevice(req.params.deviceId) });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to factory reset device";
            res.status(message === "Device not found" ? 404 : 502).json({ ok: false, error: message });
        }
    });
    router.post("/devices/:deviceId/actions/unbind", async (req, res) => {
        try {
            res.json({ ok: true, devices: await service.unbindDevice(req.params.deviceId) });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to unbind device";
            res.status(message === "Device not found" ? 404 : 502).json({ ok: false, error: message });
        }
    });
    router.post("/devices/:deviceId/actions/initialize", async (req, res) => {
        try {
            const detectionMode = parseDetectionMode(req.body?.detectionMode);
            if (!detectionMode) {
                throw new Error("Invalid detection mode");
            }
            res.json({
                ok: true,
                device: await service.initializeDevice(req.params.deviceId, {
                    deviceNoMode: req.body?.deviceNoMode === "custom" ? "custom" : "auto",
                    customDeviceNo: typeof req.body?.customDeviceNo === "string" ? req.body.customDeviceNo : undefined,
                    installHeightM: toInstallHeightM(req.body?.installHeightM),
                    detectionMode,
                }),
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Failed to initialize device";
            res.status(toInitializeStatus(message)).json({ ok: false, error: message });
        }
    });
    return router;
};
exports.createMmwaveRouter = createMmwaveRouter;
