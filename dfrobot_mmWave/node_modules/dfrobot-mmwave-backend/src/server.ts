import fs from "fs";
import path from "path";
import express, { NextFunction, Request, Response } from "express";
import pinoHttp from "pino-http";
import type { AppConfig } from "./config";
import { BaseMapStorage } from "./config/baseMapStorage";
import type { MmwaveService } from "./domain/mmwaveService";
import { logger } from "./logger";
import { createMetaRouter } from "./routes/meta";
import { createBaseMapRouter } from "./routes/baseMaps";
import { createMmwaveRouter } from "./routes/devices";

export interface ServerDependencies {
  service: MmwaveService;
}

const utf8StaticExtensions = new Set([".html", ".js", ".css", ".svg"]);

const withUtf8Charset = (contentType: string): string =>
  /;\s*charset=/i.test(contentType) ? contentType : `${contentType}; charset=utf-8`;

export const createServer = (config: AppConfig, deps: ServerDependencies): express.Express => {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      redact: ["req.headers.authorization", "req.headers.cookie"],
    }),
  );
  app.use(express.json());

  app.use("/api/meta", createMetaRouter(config, deps.service));
  app.use("/api/mmwave", createBaseMapRouter(new BaseMapStorage(config.dataDir)));
  app.use("/api/mmwave", createMmwaveRouter(deps.service));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  if (config.frontendDist && fs.existsSync(config.frontendDist)) {
    const indexHtml = path.join(config.frontendDist, "index.html");
    app.use(
      express.static(config.frontendDist, {
        setHeaders: (res, filePath) => {
          if (!utf8StaticExtensions.has(path.extname(filePath).toLowerCase())) {
            return;
          }
          const contentType = res.getHeader("Content-Type");
          if (typeof contentType === "string") {
            res.setHeader("Content-Type", withUtf8Charset(contentType));
          }
        },
      }),
    );
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(indexHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    });
  } else {
    logger.warn({ frontendDist: config.frontendDist }, "Frontend dist not found");
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ message: "Internal server error" });
  });

  return app;
};
