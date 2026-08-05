import fs from "node:fs";
import path from "node:path";
import type { Logger } from "pino";

const DEVICE_REGISTRY_FILE = "devices.json";
const DEVICE_META_FILE = "config.json";
const DEVICE_LOG_DIR = "log";
const PENDING_RETAINED_FILE = "pending-retained-topic-clears.json";
const BASE_MAPS_DIR = "base_maps";
const MIGRATION_MARKER_FILE = ".device-data-migration.json";

export interface DeviceDataMigrationResult {
  legacyExists: boolean;
  migrated: string[];
  removed: string[];
  skipped: string[];
  errors: string[];
}

const emptyMigrationResult = (legacyExists: boolean): DeviceDataMigrationResult => ({
  legacyExists,
  migrated: [],
  removed: [],
  skipped: [],
  errors: [],
});

export const assertSafeManagedDirectory = (directory: string, label: string): string => {
  if (typeof directory !== "string" || !directory.trim()) {
    throw new Error(`${label} is empty`);
  }
  const resolved = path.resolve(directory);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    throw new Error(`${label} must not be a filesystem root`);
  }
  const baseName = path.basename(resolved).toLowerCase();
  if (["config", "data", "homeassistant", "homeassistant_config"].includes(baseName)) {
    throw new Error(`${label} is too broad: ${resolved}`);
  }
  return resolved;
};

const assertSafeChild = (root: string, child: string, label: string): string => {
  const resolvedRoot = path.resolve(root);
  const resolvedChild = path.resolve(child);
  if (resolvedChild === resolvedRoot || !resolvedChild.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} is outside the managed root`);
  }
  return resolvedChild;
};

const removeFile = (
  filePath: string,
  result: { removed: string[]; skipped?: string[]; errors: string[] },
  root: string,
): void => {
  try {
    const target = assertSafeChild(root, filePath, "file removal target");
    if (!fs.existsSync(target)) {
      result.skipped?.push(`${filePath} (missing)`);
      return;
    }
    fs.rmSync(target, { force: true });
    result.removed.push(target);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : `Failed to remove ${filePath}`);
  }
};

const removeEmptyDirectory = (
  directory: string,
  result: { removed: string[]; errors: string[] },
  root: string,
): void => {
  try {
    const target = assertSafeChild(root, directory, "directory removal target");
    if (fs.existsSync(target) && fs.readdirSync(target).length === 0) {
      fs.rmdirSync(target);
      result.removed.push(directory);
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : `Failed to remove ${directory}`);
  }
};

const copyFileThenRemove = (
  source: string,
  target: string,
  result: DeviceDataMigrationResult,
  legacyRoot: string,
): void => {
  if (!fs.existsSync(source)) {
    return;
  }
  if (fs.existsSync(target)) {
    result.skipped.push(`${source} -> ${target} (target exists)`);
    return;
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    result.migrated.push(`${source} -> ${target}`);
    removeFile(source, result, legacyRoot);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : `Failed to migrate ${source}`);
  }
};

const copyDirectoryThenRemove = (
  source: string,
  target: string,
  result: DeviceDataMigrationResult,
  legacyRoot: string,
): void => {
  if (!fs.existsSync(source)) {
    return;
  }
  if (fs.existsSync(target)) {
    result.skipped.push(`${source} -> ${target} (target exists)`);
    return;
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
    result.migrated.push(`${source} -> ${target}`);
    fs.rmSync(assertSafeChild(legacyRoot, source, "directory removal target"), { recursive: true, force: true });
    result.removed.push(source);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : `Failed to migrate ${source}`);
  }
};

const writeMigrationMarker = (deviceDataDir: string, result: DeviceDataMigrationResult): void => {
  if (!result.migrated.length || result.errors.length) {
    return;
  }
  const markerPath = path.join(deviceDataDir, MIGRATION_MARKER_FILE);
  fs.mkdirSync(deviceDataDir, { recursive: true });
  fs.writeFileSync(
    markerPath,
    `${JSON.stringify({ migratedAt: new Date().toISOString(), migrated: result.migrated }, null, 2)}\n`,
    "utf8",
  );
};

const cleanupEmptyLegacyRoot = (legacyRoot: string, result: { removed: string[]; errors: string[] }): void => {
  try {
    if (fs.existsSync(legacyRoot) && fs.readdirSync(legacyRoot).length === 0) {
      fs.rmdirSync(legacyRoot);
      result.removed.push(legacyRoot);
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : `Failed to remove ${legacyRoot}`);
  }
};

export const migrateLegacyDeviceData = (params: {
  legacyDataDir: string;
  deviceDataDir: string;
  logger?: Logger;
}): DeviceDataMigrationResult => {
  const legacyRoot = assertSafeManagedDirectory(params.legacyDataDir, "legacyDataDir");
  const deviceRoot = assertSafeManagedDirectory(params.deviceDataDir, "deviceDataDir");
  const result = emptyMigrationResult(fs.existsSync(legacyRoot));
  if (!result.legacyExists) {
    return result;
  }

  copyFileThenRemove(
    path.join(legacyRoot, DEVICE_REGISTRY_FILE),
    path.join(deviceRoot, DEVICE_REGISTRY_FILE),
    result,
    legacyRoot,
  );
  copyFileThenRemove(
    path.join(legacyRoot, PENDING_RETAINED_FILE),
    path.join(deviceRoot, PENDING_RETAINED_FILE),
    result,
    legacyRoot,
  );

  for (const entry of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === BASE_MAPS_DIR) {
      continue;
    }
    const sourceDeviceDir = path.join(legacyRoot, entry.name);
    const targetDeviceDir = path.join(deviceRoot, entry.name);
    const sourceConfig = path.join(sourceDeviceDir, DEVICE_META_FILE);
    const sourceLogDir = path.join(sourceDeviceDir, DEVICE_LOG_DIR);
    if (!fs.existsSync(sourceConfig) && !fs.existsSync(sourceLogDir)) {
      result.skipped.push(`${sourceDeviceDir} (not a device data directory)`);
      continue;
    }
    copyFileThenRemove(sourceConfig, path.join(targetDeviceDir, DEVICE_META_FILE), result, legacyRoot);
    copyDirectoryThenRemove(sourceLogDir, path.join(targetDeviceDir, DEVICE_LOG_DIR), result, legacyRoot);
    removeEmptyDirectory(sourceDeviceDir, result, legacyRoot);
  }

  writeMigrationMarker(deviceRoot, result);
  cleanupEmptyLegacyRoot(legacyRoot, result);
  params.logger?.info(
    {
      legacyDataDir: legacyRoot,
      deviceDataDir: deviceRoot,
      migrated: result.migrated.length,
      removed: result.removed.length,
      skipped: result.skipped.length,
      errors: result.errors,
    },
    "Legacy mmWave device data migration completed",
  );
  return result;
};
