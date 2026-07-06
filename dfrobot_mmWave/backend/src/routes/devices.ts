import { Router } from "express";
import type { MmwaveService } from "../domain/mmwaveService";

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

  router.get("/devices", (_req, res) => {
    res.json({ ok: true, devices: service.listDevices() });
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

  return router;
};
