"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMetaRouter = void 0;
const express_1 = require("express");
const createMetaRouter = (config, service) => {
    const router = (0, express_1.Router)();
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
exports.createMetaRouter = createMetaRouter;
