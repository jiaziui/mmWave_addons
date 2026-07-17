"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MmwaveService = void 0;
const storage_1 = require("../config/storage");
const deviceLogStorage_1 = require("../config/deviceLogStorage");
const configFileRange_1 = require("./configFileRange");
const registry_1 = require("./profiles/registry");
const runtimeCache_1 = require("./runtimeCache");
const regionIo_1 = require("./regionIo");
const tagConfig_1 = require("./tagConfig");
const trajectory_1 = require("./trajectory");
const cloneRangeBox = (rangeBox) => ({ ...rangeBox });
const buildGenericRegions = (device) => device.regionConfig.regions
    .filter((region) => region.enabled)
    .map((region) => ({
    id: region.id,
    label: region.label,
    active: false,
    x: region.x,
    y: region.y,
    tagIndex: region.index,
    tagDataAvailable: false,
}));
const buildGenericDeviceCard = (device, mqttBridge, trajectory) => ({
    id: device.id,
    name: device.name,
    model: device.model,
    online: device.discovery.status === "online",
    status: device.discovery.status === "online" ? "Online" : "Offline",
    signal: device.discovery.signal,
    peopleCount: device.lastZoneSnapshot.counts.peopleCount,
    targetCount: device.lastZoneSnapshot.counts.targetCount,
    staticCount: device.lastZoneSnapshot.counts.staticCount,
    trajectoryAvailable: Boolean(trajectory),
    mqttConnected: mqttBridge.isConnected(),
    coordinate: cloneRangeBox(device.regionConfig.coordinate),
    rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
    detection: device.regionConfig.detection,
    regions: buildGenericRegions(device),
    targets: (0, trajectory_1.toDisplayTrajectoryPoints)(trajectory?.points ?? []),
    backgroundInstances: device.regionConfig.backgroundInstances ?? [],
    viewPreferences: device.regionConfig.viewPreferences ?? {
        gridVisible: true,
        backgroundVisible: (device.regionConfig.backgroundInstances ?? []).some((instance) => instance.visible),
    },
    deploymentName: device.deploymentName,
});
const buildGenericDeviceDetail = (device, mqttBridge, trajectory) => {
    const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
    return {
        id: device.id,
        name: device.name,
        model: device.model,
        deviceId: device.haDeviceId ?? device.prefix,
        online: device.discovery.status === "online",
        status: device.discovery.status === "online" ? "Online" : "Offline",
        signal: device.discovery.signal,
        peopleCount: device.lastZoneSnapshot.counts.peopleCount,
        targetCount: device.lastZoneSnapshot.counts.targetCount,
        firmwareVersion: device.firmwareVersion,
        trajectoryAvailable: Boolean(trajectory),
        mqttConnected: mqttBridge.isConnected(),
        lastUpdated: device.discovery.lastUpdated,
        coordinate: cloneRangeBox(device.regionConfig.coordinate),
        rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
        detection: device.regionConfig.detection,
        regions: buildGenericRegions(device),
        targets: (0, trajectory_1.toDisplayTrajectoryPoints)(trajectory?.points ?? []),
        backgroundInstances: device.regionConfig.backgroundInstances ?? [],
        viewPreferences: device.regionConfig.viewPreferences ?? {
            gridVisible: true,
            backgroundVisible: (device.regionConfig.backgroundInstances ?? []).some((instance) => instance.visible),
        },
        movingCount: device.lastZoneSnapshot.counts.movingCount,
        staticCount: device.lastZoneSnapshot.counts.staticCount,
        deploymentName: device.deploymentName,
        ioStates: [],
        basics: [
            { key: "profileId", label: "设备类型", value: device.profileId },
            { key: "profileStatus", label: "适配状态", value: device.profileStatus },
            { key: "profileSource", label: "识别来源", value: device.profileSource ?? "-" },
            { key: "manufacturer", label: "厂商", value: device.manufacturer ?? "-" },
            { key: "firmwareVersion", label: "固件版本", value: device.firmwareVersion ?? "-" },
            { key: "runtimeSupport", label: "运行时支持", value: profile?.runtimeSupported ? "supported" : "pending" },
        ],
        actions: {
            canReset: Boolean(profile?.capabilities.supportsReset),
            canRefresh: true,
            canManageRegions: Boolean(profile?.capabilities.supportsRegions),
        },
    };
};
const buildMetrics = (devices) => ({
    deviceCount: devices.length,
    peopleCount: devices.reduce((sum, device) => sum + device.peopleCount, 0),
    targetCount: devices.reduce((sum, device) => sum + device.targetCount, 0),
    staticCount: devices.reduce((sum, device) => sum + device.staticCount, 0),
});
const buildDeviceConfig = (device) => ({
    id: device.id,
    deviceNo: device.deviceNo,
    initialized: device.initialized,
    profileId: device.profileId,
    prefix: device.prefix,
    mqttTopicPrefix: device.mqttTopicPrefix,
    mqttKey: device.mqttKey,
    installInfo: device.installInfo,
    detectionMode: device.detectionMode,
    regionConfig: device.regionConfig,
    deviceSettings: device.deviceSettings ?? {},
    logRetention: device.logRetention ?? { mode: "forever", updatedAt: new Date(0).toISOString() },
    nextCleanupAt: (0, deviceLogStorage_1.nextShanghaiMidnight)(),
});
const normalizeLogRetention = (value) => {
    if (!value || !["forever", "limited", "none"].includes(value.mode)) {
        throw new Error("Invalid log retention mode");
    }
    if (value.mode !== "limited") {
        return { mode: value.mode, updatedAt: new Date().toISOString() };
    }
    const periodValue = value.value;
    if (typeof periodValue !== "number" || !Number.isInteger(periodValue) || periodValue < 1 || !["day", "week", "month", "year"].includes(value.unit ?? "")) {
        throw new Error("Invalid log retention period");
    }
    return {
        mode: "limited",
        value: periodValue,
        unit: value.unit,
        updatedAt: new Date().toISOString(),
    };
};
class MmwaveService {
    constructor(haClient, storage, mqttBridge, logger, deviceLogStorage) {
        this.haClient = haClient;
        this.storage = storage;
        this.mqttBridge = mqttBridge;
        this.logger = logger;
        this.deviceLogStorage = deviceLogStorage;
        this.runtimeCache = new runtimeCache_1.RuntimeCacheStore();
        this.pendingMultiTagConfig = new Map();
        this.pendingConfigFileRange = new Map();
    }
    getManagedMqttDevices(devices) {
        return devices.filter((device) => {
            if (!device.initialized || device.profileStatus !== "resolved") {
                return false;
            }
            const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
            return Boolean(profile?.capabilities.supportsMqttBridge);
        });
    }
    hydrateDevices(devices) {
        return devices.map((device) => this.runtimeCache.hydrateDevice(device));
    }
    mapDeviceStates(device, statesById, entityRegistryEntries) {
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        return profile?.mapEntityStates?.(device, statesById, entityRegistryEntries) ?? statesById;
    }
    waitForMultiTagResult(deviceId, requestId, timeoutMs = 4000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingMultiTagConfig.delete(requestId);
                reject(new Error("Timed out waiting for multi tag config result"));
            }, timeoutMs);
            this.pendingMultiTagConfig.set(requestId, {
                deviceId,
                resolve: () => {
                    clearTimeout(timeout);
                    this.pendingMultiTagConfig.delete(requestId);
                    resolve();
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    this.pendingMultiTagConfig.delete(requestId);
                    reject(error);
                },
                timeout,
            });
        });
    }
    waitForConfigFileRangeResult(deviceId, requestId, timeoutMs = 4000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingConfigFileRange.delete(requestId);
                reject(new Error("Timed out waiting for config file range result"));
            }, timeoutMs);
            this.pendingConfigFileRange.set(requestId, {
                deviceId,
                resolve: () => {
                    clearTimeout(timeout);
                    this.pendingConfigFileRange.delete(requestId);
                    resolve();
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    this.pendingConfigFileRange.delete(requestId);
                    reject(error);
                },
                timeout,
            });
        });
    }
    async discoverDevices() {
        if (!this.haClient) {
            return this.storage.listDevices();
        }
        const existingDevices = this.storage.listDevices();
        const candidates = await (0, registry_1.resolveDiscoveredProfiles)(this.haClient, existingDevices, this.logger);
        const devices = await this.storage.replaceFromDiscovery(candidates.map((candidate) => ({
            profileId: candidate.profileId,
            profileSource: candidate.profileSource,
            profileStatus: candidate.profileStatus,
            haDeviceId: candidate.deviceId,
            name: candidate.deviceName ?? candidate.prefix,
            deploymentName: candidate.deploymentName,
            model: candidate.deviceModel ?? `DFRobot ${candidate.profileId.toUpperCase()}`,
            manufacturer: candidate.manufacturer,
            firmwareVersion: candidate.firmwareVersion,
            prefix: candidate.prefix,
            mqttTopicPrefix: candidate.prefix,
            mqttKey: "main",
            status: candidate.status,
            signal: Math.min(98, 64 + candidate.score * 4),
            entityCount: candidate.entityCount,
            macAddress: candidate.macAddress,
        })));
        for (const device of devices) {
            const candidate = candidates.find((entry) => entry.prefix === device.prefix);
            this.runtimeCache.ensureDevice(device);
            if (candidate) {
                const now = new Date().toISOString();
                this.runtimeCache.upsertIdentity(device, {
                    name: candidate.deviceName ?? candidate.prefix,
                    deploymentName: candidate.deploymentName,
                    model: candidate.deviceModel ?? `DFRobot ${candidate.profileId.toUpperCase()}`,
                    manufacturer: candidate.manufacturer,
                    firmwareVersion: candidate.firmwareVersion,
                    macAddress: candidate.macAddress,
                    profileSource: candidate.profileSource,
                    profileStatus: candidate.profileStatus,
                    entityCount: candidate.entityCount,
                });
                this.runtimeCache.updateDiscovery(device, {
                    status: candidate.status,
                    signal: Math.min(98, 64 + candidate.score * 4),
                    lastSeen: candidate.status === "online" ? now : device.discovery.lastSeen,
                    discoveredAt: device.discovery.discoveredAt,
                    lastUpdated: now,
                });
            }
        }
        const hydratedDevices = this.hydrateDevices(devices);
        this.mqttBridge.setDevices(this.getManagedMqttDevices(hydratedDevices));
        return hydratedDevices;
    }
    async listDevices() {
        const devices = await this.refreshDeviceStatuses();
        this.mqttBridge.setDevices(this.getManagedMqttDevices(devices));
        return devices;
    }
    async refreshDeviceStatuses() {
        const devices = this.storage.listDevices();
        if (!this.haClient || !devices.length) {
            return this.hydrateDevices(devices);
        }
        const [states, entityRegistryEntries] = await Promise.all([
            this.haClient.getAllStates(),
            this.haClient.getEntityRegistry(),
        ]);
        const statesById = new Map(states.map((state) => [state.entity_id, state]));
        for (const device of devices) {
            const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
            if (!profile?.resolveDeviceOnline) {
                continue;
            }
            const deviceStatesById = this.mapDeviceStates(device, statesById, entityRegistryEntries);
            const status = profile.resolveDeviceOnline(device, deviceStatesById, states) ? "online" : "offline";
            const cachedDevice = this.runtimeCache.hydrateDevice(device);
            const now = new Date().toISOString();
            this.runtimeCache.updateDiscovery(device, {
                status,
                lastSeen: status === "online" ? now : cachedDevice.discovery.lastSeen,
                lastUpdated: now,
            });
        }
        return this.hydrateDevices(devices);
    }
    isMqttConnected() {
        return this.mqttBridge.isConnected();
    }
    syncDeviceState(device, statesById, options) {
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        if (!profile?.buildRuntimeState) {
            return this.runtimeCache.hydrateDevice(device);
        }
        this.runtimeCache.updateNative(device, profile.buildRuntimeState(device, statesById, options));
        return this.runtimeCache.hydrateDevice(device);
    }
    async getOverview() {
        const devices = (await this.listDevices()).filter((device) => device.initialized);
        if (!this.haClient || !devices.length) {
            return { ok: true, metrics: buildMetrics([]), devices: [] };
        }
        const [states, entityRegistryEntries] = await Promise.all([
            this.haClient.getAllStates(),
            this.haClient.getEntityRegistry(),
        ]);
        const statesById = new Map(states.map((state) => [state.entity_id, state]));
        const cards = devices.map((device) => {
            const deviceStatesById = this.mapDeviceStates(device, statesById, entityRegistryEntries);
            const syncedDevice = this.syncDeviceState(device, deviceStatesById);
            const trajectory = this.runtimeCache.getTrajectory(syncedDevice.id);
            const tagRegions = this.runtimeCache.getTagRegions(syncedDevice.id);
            const profile = (0, registry_1.getMmwaveProfile)(syncedDevice.profileId);
            if (profile?.buildOverviewCard) {
                return profile.buildOverviewCard(syncedDevice, deviceStatesById, {
                    trajectory,
                    tagRegions,
                    mqttConnected: this.mqttBridge.isConnected(),
                });
            }
            return buildGenericDeviceCard(syncedDevice, this.mqttBridge, trajectory);
        });
        return {
            ok: true,
            metrics: buildMetrics(cards),
            devices: cards,
        };
    }
    async getDeviceDetail(deviceId, options) {
        const device = this.storage.getDevice(deviceId);
        if (!device) {
            throw new Error("Device not found");
        }
        if (!this.haClient) {
            throw new Error("Home Assistant is not linked");
        }
        const [states, entityRegistryEntries] = await Promise.all([
            this.haClient.getAllStates(),
            this.haClient.getEntityRegistry(),
        ]);
        const statesById = new Map(states.map((state) => [state.entity_id, state]));
        const deviceStatesById = this.mapDeviceStates(device, statesById, entityRegistryEntries);
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        const syncedDevice = this.syncDeviceState(device, deviceStatesById, options);
        let detailDevice = syncedDevice;
        if (profile?.readDeviceSettings) {
            const syncedSettings = profile.readDeviceSettings(syncedDevice, deviceStatesById);
            const currentSettings = syncedDevice.deviceSettings;
            const hasSettingsChanges = Object.entries(syncedSettings).some(([key, value]) => currentSettings?.[key] !== value);
            if (hasSettingsChanges) {
                detailDevice = this.runtimeCache.hydrateDevice(this.storage.updateDeviceSettings(deviceId, syncedSettings));
            }
        }
        const trajectory = this.runtimeCache.getTrajectory(detailDevice.id);
        const tagRegions = this.runtimeCache.getTagRegions(detailDevice.id);
        if (profile?.buildDeviceDetail) {
            return profile.buildDeviceDetail(detailDevice, deviceStatesById, {
                trajectory,
                tagRegions,
                mqttConnected: this.mqttBridge.isConnected(),
            });
        }
        return buildGenericDeviceDetail(detailDevice, this.mqttBridge, trajectory);
    }
    async refreshDevice(deviceId) {
        const devices = await this.discoverDevices();
        const exists = devices.some((device) => device.id === deviceId);
        if (!exists) {
            this.logger.warn({ deviceId }, "Refresh requested for missing device after discovery");
        }
        return this.getDeviceDetail(deviceId, { forceSnapshot: true });
    }
    async resetDevice(deviceId) {
        const device = this.storage.getDevice(deviceId);
        if (!device) {
            throw new Error("Device not found");
        }
        if (!this.haClient) {
            throw new Error("Home Assistant is not linked");
        }
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        if (!profile?.capabilities.supportsReset || !profile.resetDevice) {
            throw new Error("Device profile does not support reset yet");
        }
        await profile.resetDevice(this.haClient, device);
        return this.getDeviceDetail(deviceId);
    }
    async getDeviceConfig(deviceId) {
        const device = this.storage.getDevice(deviceId);
        if (!device) {
            throw new Error("Device not found");
        }
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        if (!this.haClient || !profile?.readDeviceSettings) {
            return buildDeviceConfig(device);
        }
        try {
            const [states, entityRegistryEntries] = await Promise.all([
                this.haClient.getAllStates(),
                this.haClient.getEntityRegistry(),
            ]);
            const statesById = new Map(states.map((state) => [state.entity_id, state]));
            const deviceStatesById = this.mapDeviceStates(device, statesById, entityRegistryEntries);
            this.syncDeviceState(device, deviceStatesById);
            const syncedSettings = profile.readDeviceSettings(device, deviceStatesById);
            const syncedDevice = this.storage.updateDeviceSettings(deviceId, syncedSettings);
            return buildDeviceConfig(this.runtimeCache.hydrateDevice(syncedDevice));
        }
        catch (error) {
            this.logger.warn({ deviceId, error }, "Returning local device config because HA refresh failed");
            return buildDeviceConfig(device);
        }
    }
    async updateDeviceConfig(deviceId, input) {
        let device = this.storage.getDevice(deviceId);
        if (!device) {
            throw new Error("Device not found");
        }
        if (input.apply?.customRange &&
            (input.apply.fourSidedRange || input.apply.regionMcuIo || input.apply.tagConfig)) {
            throw new Error("Invalid region config: custom range synchronization must be requested separately");
        }
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        if (input.logRetention) {
            device = this.storage.updateLogRetention(deviceId, normalizeLogRetention(input.logRetention));
        }
        if (input.deviceSettings) {
            if (!this.haClient) {
                throw new Error("Home Assistant is not linked");
            }
            if (!profile?.writeDeviceSettings) {
                throw new Error("Device profile does not support config yet");
            }
            await profile.writeDeviceSettings(this.haClient, device, input.deviceSettings);
            device = this.storage.updateDeviceSettings(deviceId, input.deviceSettings);
        }
        const applyResult = {
            fourSidedRange: "skipped",
            regionMcuIo: "skipped",
            tagConfig: "skipped",
            customRange: "skipped",
            warnings: [],
        };
        const regionConfigProvided = input.regionConfig !== undefined;
        let normalizedRegionConfig = regionConfigProvided ? (0, storage_1.normalizeRegionConfig)(input.regionConfig) : device.regionConfig;
        if (regionConfigProvided || input.apply?.regionMcuIo || input.apply?.tagConfig) {
            (0, regionIo_1.assertUniqueRegionIoBindings)(normalizedRegionConfig);
        }
        if (input.apply?.customRange) {
            try {
                if (regionConfigProvided) {
                    (0, configFileRange_1.assertRawCustomRangePointCount)(input.regionConfig);
                }
                const profileSupportsCustomRange = this.mqttBridge.isConfigured() &&
                    Boolean(profile?.capabilities.supportsMqttBridge) &&
                    Boolean(profile?.mqttTopics.configFileRangeCommandTopic) &&
                    Boolean(profile?.mqttTopics.configFileRangeResultTopic);
                if (!profileSupportsCustomRange) {
                    throw new Error("Custom range MQTT synchronization is unavailable");
                }
                const { hex } = (0, configFileRange_1.buildConfigFileRangeHex)(normalizedRegionConfig);
                const requestId = `${device.id}-range-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                const resultPromise = this.waitForConfigFileRangeResult(device.id, requestId);
                const published = this.mqttBridge.publishConfigFileRangeCommand(device, {
                    request_id: requestId,
                    hex,
                });
                if (!published) {
                    const error = new Error("Failed to publish config file range command");
                    this.pendingConfigFileRange.get(requestId)?.reject(error);
                    await resultPromise;
                }
                await resultPromise;
                normalizedRegionConfig = {
                    ...normalizedRegionConfig,
                    detection: {
                        ...normalizedRegionConfig.detection,
                        mode: "custom",
                        appliedMode: "custom",
                        customConfirmed: true,
                    },
                    syncState: {
                        ...normalizedRegionConfig.syncState,
                        customRange: "synced",
                        updatedAt: new Date().toISOString(),
                    },
                };
                device = this.storage.updateRegionConfig(deviceId, normalizedRegionConfig);
                applyResult.customRange = "applied";
            }
            catch (error) {
                applyResult.customRange = "failed";
                applyResult.warnings.push(`自定义探测范围未保存，设备同步失败：${error instanceof Error ? error.message : String(error)}`);
                return {
                    config: buildDeviceConfig(device),
                    applyResult,
                };
            }
        }
        if (regionConfigProvided || input.apply?.tagConfig) {
            const normalized = normalizedRegionConfig;
            const pendingConfig = {
                ...normalized,
                syncState: {
                    ...normalized.syncState,
                    fourSidedRange: input.apply?.fourSidedRange ? "pending" : normalized.syncState.fourSidedRange,
                    regionMcuIo: input.apply?.regionMcuIo ? "pending" : normalized.syncState.regionMcuIo,
                    tagConfig: input.apply?.tagConfig ? "pending" : normalized.syncState.tagConfig,
                    customRange: normalized.syncState.customRange,
                    updatedAt: new Date().toISOString(),
                },
            };
            device = this.storage.updateRegionConfig(deviceId, pendingConfig);
            if (input.apply?.fourSidedRange) {
                if (!this.haClient || !profile?.applyFourSidedRange) {
                    applyResult.fourSidedRange = "failed";
                    applyResult.warnings.push("四方探测范围已保存到本地，但设备同步不可用");
                }
                else {
                    try {
                        await profile.applyFourSidedRange(this.haClient, device, device.regionConfig.rangeBox);
                        applyResult.fourSidedRange = "applied";
                    }
                    catch (error) {
                        applyResult.fourSidedRange = "failed";
                        applyResult.warnings.push(`四方探测范围已保存到本地，但设备同步失败：${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            if (input.apply?.regionMcuIo) {
                const mcuSettings = (0, regionIo_1.buildRegionMcuSettings)(device.regionConfig);
                if (!this.haClient || !profile?.writeDeviceSettings) {
                    applyResult.regionMcuIo = "failed";
                    applyResult.warnings.push("区域 MCU IO 已保存到本地，但设备同步不可用");
                }
                else {
                    try {
                        await profile.writeDeviceSettings(this.haClient, device, mcuSettings);
                        device = this.storage.updateDeviceSettings(deviceId, mcuSettings);
                        applyResult.regionMcuIo = "applied";
                    }
                    catch (error) {
                        applyResult.regionMcuIo = "failed";
                        applyResult.warnings.push(`区域 MCU IO 已保存到本地，但设备同步失败：${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            if (input.apply?.tagConfig) {
                const canPublishTagConfig = this.mqttBridge.isConfigured() &&
                    Boolean(profile?.capabilities.supportsMqttBridge) &&
                    Boolean(profile?.mqttTopics.multiTagConfigCommandTopic) &&
                    Boolean(profile?.mqttTopics.multiTagConfigResultTopic);
                if (!canPublishTagConfig) {
                    applyResult.tagConfig = "failed";
                    applyResult.warnings.push("标签配置已保存到本地，但 MQTT 同步不可用");
                }
                else {
                    try {
                        const { hex } = (0, tagConfig_1.buildMultiTagConfigHex)(device.regionConfig);
                        const requestId = `${device.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                        const resultPromise = this.waitForMultiTagResult(device.id, requestId);
                        const published = this.mqttBridge.publishMultiTagConfigCommand(device, {
                            request_id: requestId,
                            hex,
                        });
                        if (!published) {
                            const error = new Error("Failed to publish multi tag config command");
                            this.pendingMultiTagConfig.get(requestId)?.reject(error);
                            await resultPromise;
                        }
                        await resultPromise;
                        applyResult.tagConfig = "applied";
                    }
                    catch (error) {
                        applyResult.tagConfig = "failed";
                        applyResult.warnings.push(`标签配置已保存到本地，但设备同步失败：${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            const nextSyncState = {
                ...device.regionConfig.syncState,
                fourSidedRange: applyResult.fourSidedRange === "applied"
                    ? "synced"
                    : applyResult.fourSidedRange === "failed"
                        ? "pending"
                        : device.regionConfig.syncState.fourSidedRange,
                regionMcuIo: applyResult.regionMcuIo === "applied"
                    ? "synced"
                    : applyResult.regionMcuIo === "failed"
                        ? "pending"
                        : device.regionConfig.syncState.regionMcuIo,
                tagConfig: applyResult.tagConfig === "applied"
                    ? "synced"
                    : applyResult.tagConfig === "failed"
                        ? "pending"
                        : device.regionConfig.syncState.tagConfig,
                customRange: applyResult.customRange === "applied"
                    ? "synced"
                    : device.regionConfig.syncState.customRange,
                updatedAt: new Date().toISOString(),
            };
            device = this.storage.updateRegionConfig(deviceId, {
                ...device.regionConfig,
                syncState: nextSyncState,
            });
        }
        if (!input.deviceSettings && !input.logRetention && !regionConfigProvided && !input.apply?.tagConfig && !input.apply?.customRange) {
            throw new Error("No valid config update provided");
        }
        return {
            config: buildDeviceConfig(device),
            applyResult,
        };
    }
    async initializeDevice(deviceId, payload) {
        const current = this.storage.validateInitializeDevice(deviceId, payload);
        if (!this.haClient) {
            throw new Error("Home Assistant is not linked");
        }
        const profile = (0, registry_1.getMmwaveProfile)(current.profileId);
        if (!profile?.capabilities.supportsInitializeWorkflow || !profile.initializeDevice) {
            throw new Error("Device profile does not support initialization yet");
        }
        await profile.initializeDevice(this.haClient, current, payload);
        const device = this.storage.initializeDevice(deviceId, payload);
        this.mqttBridge.setDevices(this.getManagedMqttDevices(this.storage.listDevices()));
        return this.runtimeCache.hydrateDevice(device);
    }
    async unbindDevice(deviceId) {
        this.storage.unbindDevice(deviceId);
        this.runtimeCache.deleteDevice(deviceId);
        this.deviceLogStorage?.forgetDevice(deviceId);
        const devices = this.haClient ? await this.discoverDevices() : this.storage.listDevices();
        this.mqttBridge.setDevices(this.getManagedMqttDevices(devices));
        return this.hydrateDevices(devices);
    }
    handleTrajectorySnapshot(deviceId, snapshot) {
        const device = this.storage.getDevice(deviceId);
        if (device) {
            this.runtimeCache.ensureDevice(device);
        }
        return this.runtimeCache.updateTrajectory(deviceId, snapshot);
    }
    async handleTagEventSnapshot(deviceId, snapshot) {
        const device = this.storage.getDevice(deviceId);
        if (device) {
            this.runtimeCache.ensureDevice(device);
        }
        const updated = this.runtimeCache.updateTagRegion(deviceId, snapshot);
        let entry;
        if (device && this.deviceLogStorage) {
            try {
                const region = device.regionConfig.regions.find((candidate) => candidate.index === snapshot.tagIndex);
                if (!region) {
                    this.logger.warn({
                        deviceId,
                        tagIndex: snapshot.tagIndex,
                        configuredIndexes: device.regionConfig.regions.map((candidate) => candidate.index),
                    }, "MQTT tag event has no configured region");
                }
                else if (!region.enabled) {
                    this.logger.warn({ deviceId, tagIndex: snapshot.tagIndex, regionId: region.id }, "MQTT tag event region is disabled");
                }
                else {
                    const compatible = (region.regionType === "status_detection" && snapshot.tagType === "people_counting") ||
                        (region.regionType === "approach_depart" && snapshot.tagType === "approach_away") ||
                        (region.regionType === "boundary" && snapshot.tagType === "boundary") ||
                        region.regionType === "noise" ||
                        region.regionType === "empty_tag";
                    if (!compatible) {
                        this.logger.warn({
                            deviceId,
                            tagIndex: snapshot.tagIndex,
                            configuredRegionType: region.regionType,
                            eventTagType: snapshot.tagType,
                        }, "MQTT tag event type does not match configured region");
                    }
                }
                const recordedEntry = await this.deviceLogStorage.recordTagEvent(device, snapshot);
                if (recordedEntry) {
                    entry = recordedEntry;
                    this.logger.info({ deviceId, tagIndex: snapshot.tagIndex, eventType: recordedEntry.eventType, persisted: device.logRetention?.mode !== "none" }, device.logRetention?.mode === "none" ? "Device region event kept in memory" : "Device region event persisted");
                }
            }
            catch (error) {
                this.logger.error({ deviceId, tagIndex: snapshot.tagIndex, err: error }, "Failed to persist device region event");
            }
        }
        return { updated, entry, persisted: entry ? device?.logRetention?.mode !== "none" : undefined };
    }
    getDeviceLogCalendar(deviceId, year, month) {
        if (!this.storage.getDevice(deviceId)) {
            throw new Error("Device not found");
        }
        if (!this.deviceLogStorage) {
            throw new Error("Device logs unavailable");
        }
        return this.deviceLogStorage.getCalendar(deviceId, year, month);
    }
    getDeviceLogs(deviceId, date, page, pageSize) {
        const device = this.storage.getDevice(deviceId);
        if (!device) {
            throw new Error("Device not found");
        }
        if (!this.deviceLogStorage) {
            throw new Error("Device logs unavailable");
        }
        return this.deviceLogStorage.getLogs(deviceId, date, page, pageSize, {
            deviceName: device.name || device.prefix,
            deploymentName: device.deploymentName || "",
        });
    }
    handleMultiTagConfigResult(deviceId, snapshot) {
        if (!snapshot.requestId) {
            return;
        }
        const pending = this.pendingMultiTagConfig.get(snapshot.requestId);
        if (!pending || pending.deviceId !== deviceId) {
            return;
        }
        if (snapshot.ok) {
            pending.resolve();
            return;
        }
        pending.reject(new Error(snapshot.error || "Multi tag config rejected by device"));
    }
    handleConfigFileRangeResult(deviceId, snapshot) {
        if (!snapshot.requestId) {
            return;
        }
        const pending = this.pendingConfigFileRange.get(snapshot.requestId);
        if (!pending || pending.deviceId !== deviceId) {
            return;
        }
        if (snapshot.ok) {
            pending.resolve();
            return;
        }
        pending.reject(new Error(snapshot.error || "Config file range rejected by device"));
    }
}
exports.MmwaveService = MmwaveService;
