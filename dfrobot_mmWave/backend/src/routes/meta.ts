import { Router } from "express";
import type { AppConfig } from "../config";
import type { MmwaveService } from "../domain/mmwaveService";

export const createMetaRouter = (config: AppConfig, service: MmwaveService): Router => {
  const router = Router();

  router.get("/config", (_req, res) => {
    res.json({
      appVersion: "0.1.0",
      port: config.port,
      mode: config.ha?.mode ?? "unlinked",
      linked: Boolean(config.ha),
      mqttConfigured: Boolean(config.mqtt),
      mqttConnected: service.isMqttConnected(),
      dataDir: config.dataDir,
    });
  });

  return router;
};
