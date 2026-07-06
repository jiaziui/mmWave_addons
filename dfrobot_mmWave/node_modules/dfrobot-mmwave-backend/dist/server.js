"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const pino_http_1 = __importDefault(require("pino-http"));
const logger_1 = require("./logger");
const meta_1 = require("./routes/meta");
const devices_1 = require("./routes/devices");
const createServer = (config, deps) => {
    const app = (0, express_1.default)();
    app.use((0, pino_http_1.default)({
        logger: logger_1.logger,
        redact: ["req.headers.authorization", "req.headers.cookie"],
    }));
    app.use(express_1.default.json());
    app.use("/api/meta", (0, meta_1.createMetaRouter)(config, deps.service));
    app.use("/api/mmwave", (0, devices_1.createMmwaveRouter)(deps.service));
    app.get("/api/health", (_req, res) => {
        res.json({ status: "ok" });
    });
    if (config.frontendDist && fs_1.default.existsSync(config.frontendDist)) {
        const indexHtml = path_1.default.join(config.frontendDist, "index.html");
        app.use(express_1.default.static(config.frontendDist));
        app.get("*", (req, res, next) => {
            if (req.path.startsWith("/api/")) {
                next();
                return;
            }
            res.sendFile(indexHtml);
        });
    }
    else {
        logger_1.logger.warn({ frontendDist: config.frontendDist }, "Frontend dist not found");
    }
    app.use((err, _req, res, _next) => {
        logger_1.logger.error({ err }, "Unhandled error");
        res.status(500).json({ message: "Internal server error" });
    });
    return app;
};
exports.createServer = createServer;
