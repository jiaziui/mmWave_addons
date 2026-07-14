import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BaseMapStorage } from "../src/config/baseMapStorage";

const tempDirs: string[] = [];
const createStorage = () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mmwave-map-"));
  tempDirs.push(dataDir);
  return new BaseMapStorage(dataDir);
};

afterEach(() => {
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("BaseMapStorage", () => {
  it("stores a validated PNG and lists its metadata", () => {
    const storage = createStorage();
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const asset = storage.saveAsset("asset_1", { originalName: "room.png", mimeType: "image/png", buffer: png });

    expect(asset).toMatchObject({ id: "asset_1", fileName: "asset_1.png", size: png.length });
    expect(storage.listAssets()).toHaveLength(1);
    expect(storage.getAsset("asset_1")?.filePath).toMatch(/asset_1\.png$/);
  });

  it("rejects traversal ids and mismatched MIME, extension, or signatures", () => {
    const storage = createStorage();
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(() => storage.saveAsset("../escape", { originalName: "room.png", mimeType: "image/png", buffer: png })).toThrow(/id/);
    expect(() => storage.saveAsset("asset", { originalName: "room.jpg", mimeType: "image/png", buffer: png })).toThrow(/match/);
    expect(() => storage.saveAsset("asset", { originalName: "room.png", mimeType: "image/png", buffer: Buffer.from("fake") })).toThrow(/match/);
  });
});
