"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseMapStorage = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const MANIFEST_FILE = "assets.json";
const MANIFEST_VERSION = 1;
const SAFE_ASSET_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const extensionByMime = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
};
const hasExpectedSignature = (mimeType, buffer) => {
    if (mimeType === "image/png") {
        return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    if (mimeType === "image/jpeg") {
        return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
};
const isSupportedMime = (value) => value === "image/png" || value === "image/jpeg" || value === "image/webp";
const extensionsByMime = {
    "image/png": new Set([".png"]),
    "image/jpeg": new Set([".jpg", ".jpeg"]),
    "image/webp": new Set([".webp"]),
};
class BaseMapStorage {
    constructor(dataDir) {
        this.userDir = node_path_1.default.join(dataDir, "base_maps", "user");
    }
    listAssets() {
        return this.readManifest().assets.filter((asset) => node_fs_1.default.existsSync(node_path_1.default.join(this.userDir, asset.fileName)));
    }
    saveAsset(assetId, file) {
        if (!SAFE_ASSET_ID.test(assetId)) {
            throw new Error("Invalid base map asset id");
        }
        if (!isSupportedMime(file.mimeType)) {
            throw new Error("Unsupported or invalid image file");
        }
        const originalExtension = node_path_1.default.extname(file.originalName).toLowerCase();
        if (!extensionsByMime[file.mimeType].has(originalExtension) || !hasExpectedSignature(file.mimeType, file.buffer)) {
            throw new Error("Image MIME type, extension, and file header must match");
        }
        this.ensureUserDir();
        const manifest = this.readManifest();
        const existing = manifest.assets.find((asset) => asset.id === assetId);
        const extension = extensionByMime[file.mimeType];
        const fileName = `${assetId}${extension}`;
        const targetPath = node_path_1.default.join(this.userDir, fileName);
        const tempPath = `${targetPath}.tmp`;
        node_fs_1.default.writeFileSync(tempPath, file.buffer);
        node_fs_1.default.renameSync(tempPath, targetPath);
        if (existing && existing.fileName !== fileName) {
            node_fs_1.default.rmSync(node_path_1.default.join(this.userDir, existing.fileName), { force: true });
        }
        const asset = {
            id: assetId,
            originalName: node_path_1.default.basename(file.originalName || fileName),
            fileName,
            mimeType: file.mimeType,
            size: file.buffer.length,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
        };
        this.writeManifest({
            version: MANIFEST_VERSION,
            assets: [...manifest.assets.filter((entry) => entry.id !== assetId), asset].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
        });
        return asset;
    }
    getAsset(assetId) {
        if (!SAFE_ASSET_ID.test(assetId)) {
            return null;
        }
        const asset = this.readManifest().assets.find((entry) => entry.id === assetId);
        if (!asset) {
            return null;
        }
        const filePath = node_path_1.default.join(this.userDir, asset.fileName);
        return node_fs_1.default.existsSync(filePath) ? { asset, filePath } : null;
    }
    readManifest() {
        this.ensureUserDir();
        const manifestPath = node_path_1.default.join(this.userDir, MANIFEST_FILE);
        if (!node_fs_1.default.existsSync(manifestPath)) {
            return { version: MANIFEST_VERSION, assets: [] };
        }
        try {
            const parsed = JSON.parse(node_fs_1.default.readFileSync(manifestPath, "utf8"));
            return {
                version: MANIFEST_VERSION,
                assets: Array.isArray(parsed.assets)
                    ? parsed.assets.filter((asset) => Boolean(asset && typeof asset.id === "string" && typeof asset.fileName === "string" && isSupportedMime(asset.mimeType)))
                    : [],
            };
        }
        catch {
            return { version: MANIFEST_VERSION, assets: [] };
        }
    }
    writeManifest(manifest) {
        this.ensureUserDir();
        const manifestPath = node_path_1.default.join(this.userDir, MANIFEST_FILE);
        const tempPath = `${manifestPath}.tmp`;
        node_fs_1.default.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        node_fs_1.default.renameSync(tempPath, manifestPath);
    }
    ensureUserDir() {
        node_fs_1.default.mkdirSync(this.userDir, { recursive: true });
    }
}
exports.BaseMapStorage = BaseMapStorage;
