"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeCacheStore = void 0;
const createDefaultDiscovery = (timestamp) => ({
    status: "offline",
    signal: 0,
    lastSeen: timestamp,
    discoveredAt: timestamp,
    lastUpdated: timestamp,
});
class RuntimeCacheStore {
    constructor() {
        this.devices = new Map();
    }
    ensureDevice(device) {
        const existing = this.devices.get(device.id);
        if (existing) {
            return existing;
        }
        const now = new Date().toISOString();
        const cache = {
            profileId: "c4004",
            state: {
                deviceId: device.id,
                profileId: "c4004",
                identity: {},
                discovery: createDefaultDiscovery(now),
                native: {},
                mqtt: {},
                updatedAt: now,
            },
        };
        this.devices.set(device.id, cache);
        return cache;
    }
    upsertIdentity(device, identity) {
        const cache = this.ensureDevice(device).state;
        cache.identity = {
            ...cache.identity,
            ...identity,
        };
        cache.updatedAt = new Date().toISOString();
        return cache;
    }
    updateDiscovery(device, discovery) {
        const cache = this.ensureDevice(device).state;
        const now = new Date().toISOString();
        cache.discovery = {
            ...cache.discovery,
            ...discovery,
            lastUpdated: discovery.lastUpdated ?? now,
        };
        cache.updatedAt = now;
        return cache;
    }
    updateNative(device, native) {
        const cache = this.ensureDevice(device).state;
        const now = new Date().toISOString();
        cache.native = {
            ...cache.native,
            ...native,
            updatedAt: native.updatedAt ?? now,
        };
        cache.updatedAt = now;
        return cache;
    }
    updateTrajectory(deviceId, trajectory) {
        const current = this.devices.get(deviceId);
        if (!current) {
            return;
        }
        current.state.mqtt = {
            ...current.state.mqtt,
            trajectory,
            updatedAt: trajectory.updatedAt,
        };
        current.state.updatedAt = new Date().toISOString();
    }
    getTrajectory(deviceId) {
        return this.devices.get(deviceId)?.state.mqtt.trajectory ?? null;
    }
    hydrateDevice(device) {
        const cache = this.devices.get(device.id)?.state;
        if (!cache) {
            return device;
        }
        return {
            ...device,
            name: cache.identity.name ?? device.name,
            deploymentName: cache.identity.deploymentName ?? device.deploymentName,
            model: cache.identity.model ?? device.model,
            manufacturer: cache.identity.manufacturer ?? device.manufacturer,
            firmwareVersion: cache.identity.firmwareVersion ?? device.firmwareVersion,
            macAddress: cache.identity.macAddress ?? device.macAddress,
            profileSource: cache.identity.profileSource ?? device.profileSource,
            profileStatus: cache.identity.profileStatus ?? device.profileStatus,
            binding: {
                entityCount: cache.identity.entityCount ?? device.binding.entityCount,
            },
            discovery: cache.discovery,
            regionConfig: cache.native.regionConfig ?? device.regionConfig,
            lastZoneSnapshot: cache.native.lastZoneSnapshot ?? device.lastZoneSnapshot,
        };
    }
    deleteDevice(deviceId) {
        this.devices.delete(deviceId);
    }
}
exports.RuntimeCacheStore = RuntimeCacheStore;
