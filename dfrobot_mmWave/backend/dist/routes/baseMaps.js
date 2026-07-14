"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBaseMapRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});
const createBaseMapRouter = (storage) => {
    const router = (0, express_1.Router)();
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
                    error: uploadError instanceof multer_1.default.MulterError && uploadError.code === "LIMIT_FILE_SIZE"
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
            }
            catch (error) {
                res.status(400).json({
                    ok: false,
                    error: error instanceof Error ? error.message : "Failed to save base map asset",
                });
            }
        });
    });
    return router;
};
exports.createBaseMapRouter = createBaseMapRouter;
