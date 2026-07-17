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
const learnedRange_1 = require("./learnedRange");
const cloneRangeBox = (rangeBox) => ({ ...rangeBox });
const LEARNED_RANGE_PREPARATION_BOX = {
    xMin: -5,
    xMax: 5,
    yMin: 0,
    yMax: 8,
};
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
        learnedRange: {
            status: "idle",
            learningEnabled: false,
            singleTargetConfirmCount: 0,
            pointCount: device.regionConfig.detection.learnedPointsCm.length,
            pointsCm: device.regionConfig.detection.learnedPointsCm,
            updatedAt: new Date().toISOString(),
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
        this.pendingLearnedRangeSet = new Map();
        this.pendingLearnedRangeQuery = new Map();
    }
    setLiveNotifier(notifier) {
        this.liveNotifier = notifier;
    }
    notifyRuntime(deviceId) {
        this.liveNotifier?.(deviceId);
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
    waitForLearnedRangeResult(pendingMap, deviceId, requestId, timeoutMessage, timeoutMs = 4000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pendingMap.delete(requestId);
                reject(new Error(timeoutMessage));
            }, timeoutMs);
            pendingMap.set(requestId, {
                deviceId,
                resolve: (snapshot) => {
                    clearTimeout(timeout);
                    pendingMap.delete(requestId);
                    resolve(snapshot);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    pendingMap.delete(requestId);
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
            return {
                ...profile.buildDeviceDetail(detailDevice, deviceStatesById, {
                    trajectory,
                    tagRegions,
                    mqttConnected: this.mqttBridge.isConnected(),
                }),
                learnedRange: this.runtimeCache.getLearnedRange(detailDevice.id) ?? {
                    status: "idle",
                    learningEnabled: false,
                    singleTargetConfirmCount: 0,
                    pointCount: detailDevice.regionConfig.detection.learnedPointsCm.length,
                    pointsCm: detailDevice.regionConfig.detection.learnedPointsCm,
                    updatedAt: new Date().toISOString(),
                },
            };
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
    async factoryResetDevice(deviceId) {
        let device = this.storage.getDevice(deviceId);
        if (!device) {
            throw new Error("Device not found");
        }
        if (!this.haClient) {
            throw new Error("Home Assistant is not linked");
        }
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        if (!profile?.factoryResetDevice) {
            throw new Error("当前设备不支持恢复出厂设置");
        }
        await profile.factoryResetDevice(this.haClient, device);
        // 设备侧区域会随出厂自动清空；0.5s 后只同步本地方探测范围/参数，并清空后端本地 regions（不推送区域到设备）。
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
            const [states, entityRegistryEntries] = await Promise.all([
                this.haClient.getAllStates(),
                this.haClient.getEntityRegistry(),
            ]);
            const statesById = new Map(states.map((s) => [s.entity_id, s]));
            const deviceStatesById = this.mapDeviceStates(device, statesById, entityRegistryEntries);
            const runtimeState = profile.buildRuntimeState?.(device, deviceStatesById);
            const rangeBox = runtimeState?.regionConfig?.rangeBox ?? device.regionConfig.rangeBox;
            const clearedRegionConfig = {
                ...device.regionConfig,
                rangeBox,
                detection: {
                    mode: "rect",
                    appliedMode: "rect",
                    rectCm: {
                        xMin: Math.round(rangeBox.xMin * 100),
                        xMax: Math.round(rangeBox.xMax * 100),
                        yMin: Math.round(rangeBox.yMin * 100),
                        yMax: Math.round(rangeBox.yMax * 100),
                    },
                    learnedPointsCm: [],
                    customPointsCm: [],
                    customConfirmed: false,
                },
                // 仅清本地标签区域；整体区域由 UI + zone1McuIo 表达，不在 regions[]。底图保留。
                regions: [],
                syncState: {
                    ...device.regionConfig.syncState,
                    fourSidedRange: "synced",
                    customRange: "synced",
                    learnedRange: "synced",
                    regionMcuIo: "synced",
                    tagConfig: "synced",
                    updatedAt: new Date().toISOString(),
                },
            };
            device = this.storage.updateRegionConfig(deviceId, clearedRegionConfig);
            this.runtimeCache.updateNative(device, { regionConfig: clearedRegionConfig });
            if (profile.readDeviceSettings) {
                const syncedSettings = profile.readDeviceSettings(device, deviceStatesById);
                device = this.storage.updateDeviceSettings(deviceId, syncedSettings);
            }
        }
        catch (error) {
            this.logger.warn({ deviceId, error }, "Failed to sync after factory reset, returning current config");
        }
        return buildDeviceConfig(this.runtimeCache.hydrateDevice(device));
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
        const learnedRuntime = this.runtimeCache.getLearnedRange(deviceId);
        if (learnedRuntime &&
            ["confirming_single_target", "starting", "learning", "stopping", "querying"].includes(learnedRuntime.status) &&
            (input.apply?.fourSidedRange || input.apply?.customRange)) {
            throw new Error("学习探测范围进行中，请先关闭学习后再切换探测范围。");
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
                    learnedRange: normalized.syncState.learnedRange,
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
                learnedRange: device.regionConfig.syncState.learnedRange,
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
    learnedRangeCommandAvailable(device) {
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        return Boolean(profile?.mqttTopics.learnedTrajectoryRangeSetCommandTopic &&
            profile.mqttTopics.learnedTrajectoryRangeSetResultTopic &&
            profile.mqttTopics.learnedTrajectoryRangeQueryCommandTopic &&
            profile.mqttTopics.learnedTrajectoryRangeQueryResultTopic);
    }
    async startLearningAfterConfirmation(deviceId) {
        const device = this.storage.getDevice(deviceId);
        const current = this.runtimeCache.getLearnedRange(deviceId);
        if (!device || !current || current.status !== "starting") {
            return;
        }
        const requestId = `${device.id}-learn-start-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        try {
            const resultPromise = this.waitForLearnedRangeResult(this.pendingLearnedRangeSet, deviceId, requestId, "Timed out waiting for learned range start result");
            if (!this.mqttBridge.publishLearnedTrajectoryRangeSetCommand(device, {
                request_id: requestId,
                learning_enabled: true,
            })) {
                this.pendingLearnedRangeSet.get(requestId)?.reject(new Error("Failed to publish learned range start command"));
            }
            const result = await resultPromise;
            if (!result.ok) {
                throw new Error(result.error || "Device rejected learned range start");
            }
            this.runtimeCache.updateLearnedRange(deviceId, {
                status: "learning",
                learningEnabled: true,
                error: undefined,
                message: "学习进行中，请沿探测范围边界行走。",
            });
            this.notifyRuntime(deviceId);
        }
        catch (error) {
            this.runtimeCache.updateLearnedRange(deviceId, {
                status: "error",
                learningEnabled: false,
                error: error instanceof Error ? error.message : String(error),
                message: "学习探测范围启动失败，请重试。",
            });
            this.notifyRuntime(deviceId);
        }
    }
    async queryLearnedRange(deviceId) {
        const device = this.storage.getDevice(deviceId);
        if (!device) {
            throw new Error("Device not found");
        }
        this.runtimeCache.updateLearnedRange(deviceId, {
            status: "querying",
            error: undefined,
            message: "正在读取学习结果。",
        });
        this.notifyRuntime(deviceId);
        const requestId = `${device.id}-learn-query-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        try {
            const resultPromise = this.waitForLearnedRangeResult(this.pendingLearnedRangeQuery, deviceId, requestId, "Timed out waiting for learned range query result");
            if (!this.mqttBridge.publishLearnedTrajectoryRangeQueryCommand(device, { request_id: requestId })) {
                this.pendingLearnedRangeQuery.get(requestId)?.reject(new Error("Failed to publish learned range query command"));
            }
            const result = await resultPromise;
            if (!result.ok || !result.hex) {
                throw new Error(result.error || "Learned range query returned no points");
            }
            const pointsCm = (0, learnedRange_1.parseLearnedRangeHex)(result.hex);
            const currentDevice = this.storage.getDevice(deviceId);
            if (!currentDevice) {
                throw new Error("Device not found");
            }
            const regionConfig = (0, storage_1.normalizeRegionConfig)({
                ...currentDevice.regionConfig,
                detection: {
                    ...currentDevice.regionConfig.detection,
                    mode: "learned",
                    appliedMode: "learned",
                    learnedPointsCm: pointsCm,
                },
                syncState: {
                    ...currentDevice.regionConfig.syncState,
                    learnedRange: "synced",
                    updatedAt: new Date().toISOString(),
                },
            });
            this.storage.updateRegionConfig(deviceId, regionConfig);
            const runtime = this.runtimeCache.updateLearnedRange(deviceId, {
                status: "ready",
                learningEnabled: false,
                singleTargetConfirmCount: 0,
                pointCount: pointsCm.length,
                pointsCm,
                error: undefined,
                message: "学习范围已更新。",
            });
            this.notifyRuntime(deviceId);
            return runtime ?? {
                status: "ready",
                learningEnabled: false,
                singleTargetConfirmCount: 0,
                pointCount: pointsCm.length,
                pointsCm,
                updatedAt: new Date().toISOString(),
            };
        }
        catch (error) {
            this.runtimeCache.updateLearnedRange(deviceId, {
                status: "error",
                learningEnabled: false,
                error: error instanceof Error ? error.message : String(error),
                message: "学习已停止，但最终范围读取失败。",
            });
            this.notifyRuntime(deviceId);
            throw error;
        }
    }
    async learnedRangeAction(deviceId, action) {
        const storedDevice = this.storage.getDevice(deviceId);
        if (!storedDevice) {
            throw new Error("Device not found");
        }
        this.runtimeCache.ensureDevice(storedDevice);
        // Device files intentionally do not persist runtime discovery data. Refresh
        // HA first, then use this device's runtime entry so a config read cannot
        // turn an online device into the default offline state.
        let device = this.runtimeCache.hydrateDevice(storedDevice);
        if (this.haClient) {
            try {
                const refreshedDevices = await this.refreshDeviceStatuses();
                device = refreshedDevices.find((entry) => entry.id === deviceId) ?? device;
                this.mqttBridge.setDevices(this.getManagedMqttDevices(refreshedDevices));
            }
            catch (error) {
                this.logger.warn({ deviceId, error }, "Using cached device status for learned range action");
            }
        }
        const current = this.runtimeCache.getLearnedRange(deviceId);
        if (!current) {
            throw new Error("Learned range runtime unavailable");
        }
        if (device.discovery.status !== "online") {
            throw new Error("当前设备离线，无法执行学习探测范围操作。");
        }
        if (!this.mqttBridge.isConfigured() || !this.mqttBridge.isConnected()) {
            throw new Error("MQTT 未连接，无法执行学习探测范围操作。");
        }
        if (!this.learnedRangeCommandAvailable(device)) {
            throw new Error("当前设备 Profile 未配置学习探测范围 MQTT 接口。");
        }
        if (action === "start") {
            if (["confirming_single_target", "starting", "learning", "stopping", "querying"].includes(current.status)) {
                return current;
            }
            const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
            if (!this.haClient || !profile?.applyFourSidedRange) {
                throw new Error("当前设备无法设置学习前的四方探测范围。");
            }
            try {
                await profile.applyFourSidedRange(this.haClient, device, LEARNED_RANGE_PREPARATION_BOX);
            }
            catch (error) {
                this.logger.warn({ deviceId, error }, "Failed to prepare four-sided range before learning");
                throw new Error("学习前的大范围四方探测范围设置失败，未开始学习。");
            }
            const clearedRegionConfig = (0, storage_1.normalizeRegionConfig)({
                ...device.regionConfig,
                detection: {
                    ...device.regionConfig.detection,
                    mode: "learned",
                    learnedPointsCm: [],
                },
                syncState: {
                    ...device.regionConfig.syncState,
                    learnedRange: "local_only",
                    updatedAt: new Date().toISOString(),
                },
            });
            const clearedDevice = this.storage.updateRegionConfig(deviceId, clearedRegionConfig);
            this.runtimeCache.updateNative(clearedDevice, { regionConfig: clearedRegionConfig });
            const runtime = this.runtimeCache.updateLearnedRange(deviceId, {
                status: "confirming_single_target",
                learningEnabled: false,
                singleTargetConfirmCount: 0,
                pointCount: 0,
                pointsCm: [],
                error: undefined,
                message: "正在确认单目标条件，等待 3 帧目标数为 1 的轨迹数据。",
            });
            this.notifyRuntime(deviceId);
            return runtime ?? current;
        }
        if (action === "stop") {
            if (current.status === "confirming_single_target") {
                const runtime = this.runtimeCache.updateLearnedRange(deviceId, {
                    status: "idle",
                    singleTargetConfirmCount: 0,
                    message: "学习确认已取消。",
                });
                this.notifyRuntime(deviceId);
                return runtime ?? current;
            }
            if (!["learning", "starting"].includes(current.status)) {
                return current;
            }
            this.runtimeCache.updateLearnedRange(deviceId, { status: "stopping", message: "正在停止学习。" });
            this.notifyRuntime(deviceId);
            const requestId = `${device.id}-learn-stop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            try {
                const resultPromise = this.waitForLearnedRangeResult(this.pendingLearnedRangeSet, deviceId, requestId, "Timed out waiting for learned range stop result");
                if (!this.mqttBridge.publishLearnedTrajectoryRangeSetCommand(device, {
                    request_id: requestId,
                    learning_enabled: false,
                })) {
                    this.pendingLearnedRangeSet.get(requestId)?.reject(new Error("Failed to publish learned range stop command"));
                }
                const result = await resultPromise;
                if (!result.ok) {
                    throw new Error(result.error || "Device rejected learned range stop");
                }
                await new Promise((resolve) => setTimeout(resolve, 30));
                return await this.queryLearnedRange(deviceId);
            }
            catch (error) {
                this.runtimeCache.updateLearnedRange(deviceId, {
                    status: "error",
                    learningEnabled: false,
                    error: error instanceof Error ? error.message : String(error),
                    message: "学习已停止，但最终范围读取失败。",
                });
                this.notifyRuntime(deviceId);
                throw error;
            }
        }
        if (["confirming_single_target", "starting", "learning", "stopping"].includes(current.status)) {
            throw new Error("学习探测范围进行中，请先关闭学习后再查询结果。");
        }
        return this.queryLearnedRange(deviceId);
    }
    handleTrajectorySnapshot(deviceId, snapshot) {
        const device = this.storage.getDevice(deviceId);
        if (device) {
            this.runtimeCache.ensureDevice(device);
        }
        const learned = this.runtimeCache.getLearnedRange(deviceId);
        if (learned?.status === "confirming_single_target") {
            if (snapshot.targetCount === 1) {
                const count = learned.singleTargetConfirmCount + 1;
                if (count >= 3) {
                    this.runtimeCache.updateLearnedRange(deviceId, {
                        status: "starting",
                        singleTargetConfirmCount: count,
                        message: "单目标条件已确认，正在启动学习。",
                    });
                    this.notifyRuntime(deviceId);
                    void this.startLearningAfterConfirmation(deviceId);
                }
                else {
                    this.runtimeCache.updateLearnedRange(deviceId, {
                        singleTargetConfirmCount: count,
                        message: `正在确认单目标条件，已确认 ${count}/3。`,
                    });
                    this.notifyRuntime(deviceId);
                }
            }
            else {
                this.runtimeCache.updateLearnedRange(deviceId, {
                    singleTargetConfirmCount: 0,
                    message: "开始学习前请确保探测范围内只有一个轨迹目标。",
                });
                this.notifyRuntime(deviceId);
            }
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
    handleLearnedTrajectoryRangeState(deviceId, snapshot) {
        const device = this.storage.getDevice(deviceId);
        if (!device) {
            return;
        }
        this.runtimeCache.ensureDevice(device);
        const current = this.runtimeCache.getLearnedRange(deviceId);
        this.runtimeCache.updateLearnedRange(deviceId, {
            learningEnabled: snapshot.learningEnabled,
            pointCount: snapshot.learningEnabled ? 0 : snapshot.pointCount,
            status: snapshot.learningEnabled ? "learning" : (current?.status === "querying" ? "querying" : current?.status ?? "idle"),
        });
        this.notifyRuntime(deviceId);
    }
    handleLearnedTrajectoryRangeSetResult(deviceId, snapshot) {
        if (!snapshot.requestId) {
            return;
        }
        const pending = this.pendingLearnedRangeSet.get(snapshot.requestId);
        if (!pending || pending.deviceId !== deviceId) {
            return;
        }
        if (snapshot.ok) {
            pending.resolve(snapshot);
        }
        else {
            pending.reject(new Error(snapshot.error || "Learned range command rejected by device"));
        }
    }
    handleLearnedTrajectoryRangeQueryResult(deviceId, snapshot) {
        if (!snapshot.requestId) {
            return;
        }
        const pending = this.pendingLearnedRangeQuery.get(snapshot.requestId);
        if (!pending || pending.deviceId !== deviceId) {
            return;
        }
        if (snapshot.ok) {
            pending.resolve(snapshot);
        }
        else {
            pending.reject(new Error(snapshot.error || "Learned range query rejected by device"));
        }
    }
}
exports.MmwaveService = MmwaveService;
