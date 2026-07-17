import { Router } from "express";
import multer from "multer";
import type { BaseMapStorage } from "../config/baseMapStorage";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

export const createBaseMapRouter = (storage: BaseMapStorage): Router => {
  const router = Router();

  router.get("/base-maps/user", (_req, res) => {
    res.json({ ok: true, assets: storage.listAssets() });
  });

  router.get("/base-maps/user/:assetId", (req, res) => {
    const result = storage.getAsset(req.params.assetId);
    if (!result) {
      res.status(404).json({ ok: false, error: "Base map asset not found" });
      return;
    }
    res.type(result.asset.mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.sendFile(result.filePath);
  });

  router.put("/base-maps/user/:assetId", (req, res) => {
    upload.single("file")(req, res, (uploadError) => {
      if (uploadError) {
        res.status(400).json({
          ok: false,
          error: uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE"
            ? "Image file exceeds the 10MB limit"
            : "Invalid image upload",
        });
        return;
      }
      try {
        if (!req.file) {
          res.status(400).json({ ok: false, error: "Image file is required" });
          return;
        }
        const asset = storage.saveAsset(req.params.assetId, {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          buffer: req.file.buffer,
        });
        res.json({ ok: true, asset });
      } catch (error) {
        res.status(400).json({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to save base map asset",
        });
      }
    });
  });

  router.delete("/base-maps/user/:assetId", (req, res) => {
    const deleted = storage.deleteAsset(req.params.assetId);
    if (!deleted) {
      res.status(404).json({ ok: false, error: "Base map asset not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
};
