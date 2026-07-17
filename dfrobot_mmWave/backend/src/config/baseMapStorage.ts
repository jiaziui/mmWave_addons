import fs from "node:fs";
import path from "node:path";

const MANIFEST_FILE = "assets.json";
const MANIFEST_VERSION = 1;
const SAFE_ASSET_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export interface UserBaseMapAsset {
  id: string;
  originalName: string;
  fileName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  size: number;
  createdAt: string;
}

interface BaseMapManifest {
  version: number;
  assets: UserBaseMapAsset[];
}

const extensionByMime: Record<UserBaseMapAsset["mimeType"], string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const hasExpectedSignature = (mimeType: UserBaseMapAsset["mimeType"], buffer: Buffer): boolean => {
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
};

const isSupportedMime = (value: string): value is UserBaseMapAsset["mimeType"] =>
  value === "image/png" || value === "image/jpeg" || value === "image/webp";

const extensionsByMime: Record<UserBaseMapAsset["mimeType"], Set<string>> = {
  "image/png": new Set([".png"]),
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/webp": new Set([".webp"]),
};

export class BaseMapStorage {
  private readonly userDir: string;

  constructor(dataDir: string) {
    this.userDir = path.join(dataDir, "base_maps", "user");
  }

  listAssets(): UserBaseMapAsset[] {
    return this.readManifest().assets.filter((asset) => fs.existsSync(path.join(this.userDir, asset.fileName)));
  }

  saveAsset(
    assetId: string,
    file: { originalName: string; mimeType: string; buffer: Buffer },
  ): UserBaseMapAsset {
    if (!SAFE_ASSET_ID.test(assetId)) {
      throw new Error("Invalid base map asset id");
    }
    if (!isSupportedMime(file.mimeType)) {
      throw new Error("Unsupported or invalid image file");
    }
    const originalExtension = path.extname(file.originalName).toLowerCase();
    if (!extensionsByMime[file.mimeType].has(originalExtension) || !hasExpectedSignature(file.mimeType, file.buffer)) {
      throw new Error("Image MIME type, extension, and file header must match");
    }

    this.ensureUserDir();
    const manifest = this.readManifest();
    const existing = manifest.assets.find((asset) => asset.id === assetId);
    const extension = extensionByMime[file.mimeType];
    const fileName = `${assetId}${extension}`;
    const targetPath = path.join(this.userDir, fileName);
    const tempPath = `${targetPath}.tmp`;
    fs.writeFileSync(tempPath, file.buffer);
    fs.renameSync(tempPath, targetPath);
    if (existing && existing.fileName !== fileName) {
      fs.rmSync(path.join(this.userDir, existing.fileName), { force: true });
    }

    const asset: UserBaseMapAsset = {
      id: assetId,
      originalName: path.basename(file.originalName || fileName),
      fileName,
      mimeType: file.mimeType,
      size: file.buffer.length,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    this.writeManifest({
      version: MANIFEST_VERSION,
      assets: [...manifest.assets.filter((entry) => entry.id !== assetId), asset].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      ),
    });
    return asset;
  }

  getAsset(assetId: string): { asset: UserBaseMapAsset; filePath: string } | null {
    if (!SAFE_ASSET_ID.test(assetId)) {
      return null;
    }
    const asset = this.readManifest().assets.find((entry) => entry.id === assetId);
    if (!asset) {
      return null;
    }
    const filePath = path.join(this.userDir, asset.fileName);
    return fs.existsSync(filePath) ? { asset, filePath } : null;
  }

  deleteAsset(assetId: string): boolean {
    if (!SAFE_ASSET_ID.test(assetId)) {
      return false;
    }
    const manifest = this.readManifest();
    const asset = manifest.assets.find((entry) => entry.id === assetId);
    if (!asset) {
      return false;
    }
    fs.rmSync(path.join(this.userDir, asset.fileName), { force: true });
    this.writeManifest({
      version: MANIFEST_VERSION,
      assets: manifest.assets.filter((entry) => entry.id !== assetId),
    });
    return true;
  }

  private readManifest(): BaseMapManifest {
    this.ensureUserDir();
    const manifestPath = path.join(this.userDir, MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) {
      return { version: MANIFEST_VERSION, assets: [] };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Partial<BaseMapManifest>;
      return {
        version: MANIFEST_VERSION,
        assets: Array.isArray(parsed.assets)
          ? parsed.assets.filter((asset): asset is UserBaseMapAsset => Boolean(
              asset && typeof asset.id === "string" && typeof asset.fileName === "string" && isSupportedMime(asset.mimeType),
            ))
          : [],
      };
    } catch {
      return { version: MANIFEST_VERSION, assets: [] };
    }
  }

  private writeManifest(manifest: BaseMapManifest): void {
    this.ensureUserDir();
    const manifestPath = path.join(this.userDir, MANIFEST_FILE);
    const tempPath = `${manifestPath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, manifestPath);
  }

  private ensureUserDir(): void {
    fs.mkdirSync(this.userDir, { recursive: true });
  }
}
