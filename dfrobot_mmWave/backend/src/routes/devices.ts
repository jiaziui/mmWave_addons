import { Router } from "express";
import type { MmwaveService } from "../domain/mmwaveService";

const isDetectionMode = (value: unknown): value is "high_sensitivity" | "static_stable" =>
  value === "high_sensitivity" || value === "static_stable";

const toInstallHeightM = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 1.8;
  }
  return Math.round(Math.max(1.8, Math.min(2, parsed)) * 100) / 100;
};

const toInitializeStatus = (message: string): number => {
  if (message === "Device not found") {
    return 404;
  }
  if (message === "Device number already exists") {
    return 409;
  }
  if (message === "Home Assistant is not linked") {
    return 424;
  }
  return 502;
};

export const createMmwaveRouter = (service: MmwaveService): Router => {
  const router = Router();

  router.get("/devices/discover", async (_req, res) => {
    try {
      const devices = await service.discoverDevices();
      res.json({ ok: true, devices });
    } catch (error) {
      res.status(502).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to discover devices",
      });
    }
  });

  router.get("/devices", async (_req, res) => {
    try {
      res.json({ ok: true, devices: await service.listDevices() });
    } catch (error) {
      res.status(502).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to list devices",
      });
    }
  });

  router.get("/overview", async (_req, res) => {
    try {
      res.json(await service.getOverview());
    } catch (error) {
      res.status(502).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load overview",
      });
    }
  });

  router.get("/devices/:deviceId/detail", async (req, res) => {
    try {
      res.json({ ok: true, detail: await service.getDeviceDetail(req.params.deviceId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load device detail";
      res.status(message === "Device not found" ? 404 : 502).json({ ok: false, error: message });
    }
  });

  router.post("/devices/:deviceId/actions/refresh", async (req, res) => {
    try {
      res.json({ ok: true, detail: await service.refreshDevice(req.params.deviceId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh device";
      res.status(message === "Device not found" ? 404 : 502).json({ ok: false, error: message });
    }
  });

  router.post("/devices/:deviceId/actions/reset", async (req, res) => {
    try {
      res.json({ ok: true, detail: await service.resetDevice(req.params.deviceId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset device";
      res.status(message === "Device not found" ? 404 : 502).json({ ok: false, error: message });
    }
  });

  router.post("/devices/:deviceId/actions/unbind", async (req, res) => {
    try {
      res.json({ ok: true, devices: await service.unbindDevice(req.params.deviceId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unbind device";
      res.status(message === "Device not found" ? 404 : 502).json({ ok: false, error: message });
    }
  });

  router.post("/devices/:deviceId/actions/initialize", async (req, res) => {
    try {
      res.json({
        ok: true,
        device: await service.initializeDevice(req.params.deviceId, {
          deviceNoMode: req.body?.deviceNoMode === "custom" ? "custom" : "auto",
          customDeviceNo: typeof req.body?.customDeviceNo === "string" ? req.body.customDeviceNo : undefined,
          installHeightM: toInstallHeightM(req.body?.installHeightM),
          detectionMode: isDetectionMode(req.body?.detectionMode) ? req.body.detectionMode : "high_sensitivity",
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to initialize device";
      res.status(toInitializeStatus(message)).json({ ok: false, error: message });
    }
  });

  return router;
};
