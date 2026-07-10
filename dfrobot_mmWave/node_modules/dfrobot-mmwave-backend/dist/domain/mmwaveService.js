"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MmwaveService = void 0;
const registry_1 = require("./profiles/registry");
const runtimeCache_1 = require("./runtimeCache");
const cloneRangeBox = (rangeBox) => ({ ...rangeBox });
const buildGenericRegions = (device) => {
    const presenceById = new Map(device.lastZoneSnapshot.presenceStates.map((state) => [state.id, state.active]));
    return device.regionConfig.regions
        .filter((region) => region.enabled)
        .map((region) => ({
        id: region.id,
        label: region.label,
        active: presenceById.get(region.id) ?? false,
        x: region.x,
        y: region.y,
    }));
};
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
    regions: buildGenericRegions(device),
    targets: trajectory?.points ?? [],
});
const buildGenericDeviceDetail = (device, mqttBridge, trajectory) => {
    const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
    return {
        id: device.id,
        name: device.name,
        model: device.model,
        deviceId: device.haDeviceId ?? device.prefix,
        online: device.discovery.status === "online",
        firmwareVersion: device.firmwareVersion,
        trajectoryAvailable: Boolean(trajectory),
        mqttConnected: mqttBridge.isConnected(),
        lastUpdated: device.discovery.lastUpdated,
        coordinate: cloneRangeBox(device.regionConfig.coordinate),
        rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
        regions: buildGenericRegions(device),
        targets: trajectory?.points ?? [],
        movingCount: device.lastZoneSnapshot.counts.movingCount,
        staticCount: device.lastZoneSnapshot.counts.staticCount,
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
});
class MmwaveService {
    constructor(haClient, storage, mqttBridge, logger) {
        this.haClient = haClient;
        this.storage = storage;
        this.mqttBridge = mqttBridge;
        this.logger = logger;
        this.runtimeCache = new runtimeCache_1.RuntimeCacheStore();
    }
    getManagedMqttDevices(devices) {
        return devices.filter((device) => {
            if (!device.initialized || device.profileStatus !== "resolved") {
                return false;
            }
            const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
            return Boolean(profile?.capabilities.supportsMqttBridge && profile.getTrajectoryTopic?.(device));
        });
    }
    hydrateDevices(devices) {
        return devices.map((device) => this.runtimeCache.hydrateDevice(device));
    }
    async discoverDevices() {
        if (!this.haClient) {
            return this.storage.listDevices();
        }
        const existingDevices = this.storage.listDevices();
        const candidates = await (0, registry_1.resolveDiscoveredProfiles)(this.haClient, existingDevices);
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
        const states = await this.haClient.getAllStates();
        const statesById = new Map(states.map((state) => [state.entity_id, state]));
        for (const device of devices) {
            const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
            if (!profile?.resolveDeviceOnline) {
                continue;
            }
            const status = profile.resolveDeviceOnline(device, statesById, states) ? "online" : "offline";
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
        const states = await this.haClient.getAllStates();
        const statesById = new Map(states.map((state) => [state.entity_id, state]));
        const cards = devices.map((device) => {
            const syncedDevice = this.syncDeviceState(device, statesById);
            const trajectory = this.runtimeCache.getTrajectory(syncedDevice.id);
            const profile = (0, registry_1.getMmwaveProfile)(syncedDevice.profileId);
            if (profile?.buildOverviewCard) {
                return profile.buildOverviewCard(syncedDevice, statesById, {
                    trajectory,
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
        const states = await this.haClient.getAllStates();
        const statesById = new Map(states.map((state) => [state.entity_id, state]));
        const syncedDevice = this.syncDeviceState(device, statesById, options);
        const trajectory = this.runtimeCache.getTrajectory(syncedDevice.id);
        const profile = (0, registry_1.getMmwaveProfile)(syncedDevice.profileId);
        if (profile?.buildDeviceDetail) {
            return profile.buildDeviceDetail(syncedDevice, statesById, {
                trajectory,
                mqttConnected: this.mqttBridge.isConnected(),
            });
        }
        return buildGenericDeviceDetail(syncedDevice, this.mqttBridge, trajectory);
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
        const states = await this.haClient.getAllStates();
        const statesById = new Map(states.map((state) => [state.entity_id, state]));
        const syncedSettings = profile.readDeviceSettings(device, statesById);
        const syncedDevice = this.storage.updateDeviceSettings(deviceId, syncedSettings);
        return buildDeviceConfig(syncedDevice);
    }
    async updateDeviceConfig(deviceId, settings) {
        const device = this.storage.getDevice(deviceId);
        if (!device) {
            throw new Error("Device not found");
        }
        if (!this.haClient) {
            throw new Error("Home Assistant is not linked");
        }
        const profile = (0, registry_1.getMmwaveProfile)(device.profileId);
        if (!profile?.writeDeviceSettings) {
            throw new Error("Device profile does not support config yet");
        }
        await profile.writeDeviceSettings(this.haClient, device, settings);
        const updatedDevice = this.storage.updateDeviceSettings(deviceId, settings);
        return buildDeviceConfig(updatedDevice);
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
        const devices = this.haClient ? await this.discoverDevices() : this.storage.listDevices();
        this.mqttBridge.setDevices(this.getManagedMqttDevices(devices));
        return this.hydrateDevices(devices);
    }
    handleTrajectorySnapshot(deviceId, snapshot) {
        const device = this.storage.getDevice(deviceId);
        if (device) {
            this.runtimeCache.ensureDevice(device);
        }
        this.runtimeCache.updateTrajectory(deviceId, snapshot);
    }
}
exports.MmwaveService = MmwaveService;
