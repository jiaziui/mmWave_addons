import type { Logger } from "pino";
import { DeviceStorage, type StoredMmwaveDevice } from "../config/storage";
import { discoverC4004Devices, findWritableEntityId, toEntityId, writeC4004Entity } from "./c4004Profile";
import type { HaClient } from "../ha/client";
import type { HaEntityState } from "../ha/types";
import type { MqttBridge } from "./mqttBridge";
import type {
  MmwaveDeviceDetail,
  MmwaveOverviewDeviceCard,
  MmwaveOverviewMetrics,
  MmwaveOverviewResponse,
  RangeBox,
  RegionOverlay,
  StoredRegionConfig,
  StoredZoneSnapshot,
  TrajectorySnapshot,
} from "../types/mmwave";

const DEFAULT_COORDINATE: RangeBox = { xMin: -5, xMax: 5, yMin: 0, yMax: 9 };

const REGION_POSITIONS = [
  { x: -3.6, y: 6.8 },
  { x: -1.4, y: 6.2 },
  { x: 1.1, y: 6.5 },
  { x: -2.5, y: 3.4 },
  { x: 2.6, y: 3.6 },
  { x: 0, y: 1.8 },
];

const normalizeState = (value: string | null | undefined): string => (value ? value.toLowerCase() : "");

const isTruthyState = (value: string | null | undefined): boolean => {
  const normalized = normalizeState(value);
  return normalized === "on" || normalized === "true" || normalized === "online";
};

const isUnavailable = (value: string | null | undefined): boolean => {
  const normalized = normalizeState(value);
  return normalized === "unknown" || normalized === "unavailable" || normalized === "";
};

const toNumber = (value: string | null | undefined): number | null => {
  if (!value || isUnavailable(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const numberLabel = (value: number | null, suffix = ""): string => {
  if (value === null) {
    return "-";
  }
  return `${value}${suffix}`;
};

const getEntityState = (statesById: Map<string, HaEntityState>, entityId: string): HaEntityState | undefined =>
  statesById.get(entityId);

const readString = (statesById: Map<string, HaEntityState>, entityId: string): string | null =>
  getEntityState(statesById, entityId)?.state ?? null;

const readNumber = (statesById: Map<string, HaEntityState>, entityId: string): number | null =>
  toNumber(readString(statesById, entityId));

const cloneRangeBox = (rangeBox: RangeBox): RangeBox => ({ ...rangeBox });

const buildRangeBox = (statesById: Map<string, HaEntityState>, prefix: string): RangeBox => {
  const xMin = readNumber(statesById, toEntityId(prefix, { key: "rangeXMin", domain: "number", slug: "range_x_min", access: "readwrite" }));
  const xMax = readNumber(statesById, toEntityId(prefix, { key: "rangeXMax", domain: "number", slug: "range_x_max", access: "readwrite" }));
  const yMin = readNumber(statesById, toEntityId(prefix, { key: "rangeYMin", domain: "number", slug: "range_y_min", access: "readwrite" }));
  const yMax = readNumber(statesById, toEntityId(prefix, { key: "rangeYMax", domain: "number", slug: "range_y_max", access: "readwrite" }));

  return {
    xMin: xMin !== null ? xMin / 100 : DEFAULT_COORDINATE.xMin,
    xMax: xMax !== null ? xMax / 100 : DEFAULT_COORDINATE.xMax,
    yMin: yMin !== null ? yMin / 100 : DEFAULT_COORDINATE.yMin,
    yMax: yMax !== null ? yMax / 100 : DEFAULT_COORDINATE.yMax,
  };
};

const sumZoneCounts = (
  statesById: Map<string, HaEntityState>,
  prefix: string,
  kind: "moving" | "static",
): number => {
  let total = 0;
  for (let index = 1; index <= 5; index += 1) {
    const slug = `zone_${index}_${kind}_count`;
    const value = readNumber(statesById, `sensor.${prefix}_${slug}`);
    if (value !== null) {
      total += value;
    }
  }
  return total;
};

const resolveStoredRegions = (storedConfig?: StoredRegionConfig): StoredRegionConfig["regions"] =>
  Array.from({ length: 6 }, (_, index) => {
    const id = `zone-${index + 1}`;
    const storedRegion = storedConfig?.regions.find((region) => region.id === id);

    return {
      id,
      label: storedRegion?.label ?? `Zone ${index + 1}`,
      x: storedRegion?.x ?? REGION_POSITIONS[index]?.x ?? 0,
      y: storedRegion?.y ?? REGION_POSITIONS[index]?.y ?? 0,
      enabled: storedRegion?.enabled ?? true,
    };
  });

const buildRegionConfig = (
  statesById: Map<string, HaEntityState>,
  prefix: string,
  storedConfig?: StoredRegionConfig,
): StoredRegionConfig => ({
  coordinate: cloneRangeBox(storedConfig?.coordinate ?? DEFAULT_COORDINATE),
  rangeBox: buildRangeBox(statesById, prefix),
  regions: resolveStoredRegions(storedConfig),
});

const buildRegions = (
  statesById: Map<string, HaEntityState>,
  prefix: string,
  storedConfig?: StoredRegionConfig,
): RegionOverlay[] =>
  resolveStoredRegions(storedConfig).map((region, index) => {
    const entityId = toEntityId(prefix, {
      key: `zone${index + 1}Presence`,
      domain: "binary_sensor",
      slug: `zone_${index + 1}_presence`,
      access: "read",
    });

    return {
      id: region.id,
      label: region.label,
      active: isTruthyState(readString(statesById, entityId)),
      x: region.x,
      y: region.y,
    };
  });

const buildZoneSnapshot = (statesById: Map<string, HaEntityState>, prefix: string): StoredZoneSnapshot => ({
  updatedAt: new Date().toISOString(),
  presenceStates: Array.from({ length: 6 }, (_, index) => {
    const entityId = toEntityId(prefix, {
      key: `zone${index + 1}Presence`,
      domain: "binary_sensor",
      slug: `zone_${index + 1}_presence`,
      access: "read",
    });

    return {
      id: `zone-${index + 1}`,
      active: isTruthyState(readString(statesById, entityId)),
    };
  }),
  counts: {
    peopleCount: readNumber(statesById, `sensor.${prefix}_people_count`) ?? 0,
    targetCount: readNumber(statesById, `sensor.${prefix}_target_count`) ?? 0,
    movingCount: sumZoneCounts(statesById, prefix, "moving"),
    staticCount: sumZoneCounts(statesById, prefix, "static"),
  },
});

const resolveTrajectory = (deviceId: string, mqttBridge: MqttBridge): TrajectorySnapshot | null =>
  mqttBridge.getSnapshot(deviceId) ?? null;

const buildDeviceCard = (
  device: StoredMmwaveDevice,
  statesById: Map<string, HaEntityState>,
  mqttBridge: MqttBridge,
): MmwaveOverviewDeviceCard => {
  const peopleCount = readNumber(statesById, `sensor.${device.prefix}_people_count`) ?? 0;
  const targetCount = readNumber(statesById, `sensor.${device.prefix}_target_count`) ?? 0;
  const staticCount = sumZoneCounts(statesById, device.prefix, "static");
  const trajectory = resolveTrajectory(device.id, mqttBridge);
  const online = isTruthyState(readString(statesById, `binary_sensor.${device.prefix}_online`));
  const status = readString(statesById, `text_sensor.${device.prefix}_status`) ?? (online ? "Online" : "Offline");

  return {
    id: device.id,
    name: device.name,
    model: device.model,
    online,
    status,
    signal: device.discovery.signal,
    peopleCount,
    targetCount,
    staticCount,
    trajectoryAvailable: Boolean(trajectory),
    mqttConnected: mqttBridge.isConnected(),
    coordinate: cloneRangeBox(device.regionConfig.coordinate),
    rangeBox: cloneRangeBox(device.regionConfig.rangeBox),
    regions: buildRegions(statesById, device.prefix, device.regionConfig),
    targets: trajectory?.points ?? [],
  };
};

const buildMetrics = (devices: MmwaveOverviewDeviceCard[]): MmwaveOverviewMetrics => ({
  deviceCount: devices.length,
  peopleCount: devices.reduce((sum, device) => sum + device.peopleCount, 0),
  targetCount: devices.reduce((sum, device) => sum + device.targetCount, 0),
  staticCount: devices.reduce((sum, device) => sum + device.staticCount, 0),
});

export class MmwaveService {
  constructor(
    private readonly haClient: HaClient | null,
    private readonly storage: DeviceStorage,
    private readonly mqttBridge: MqttBridge,
    private readonly logger: Logger,
  ) {}

  async discoverDevices(): Promise<StoredMmwaveDevice[]> {
    if (!this.haClient) {
      return this.storage.listDevices();
    }

    const candidates = await discoverC4004Devices(this.haClient);
    const devices = await this.storage.replaceFromDiscovery(
      candidates.map((candidate) => ({
        haDeviceId: candidate.deviceId,
        name: candidate.deviceName ?? candidate.prefix,
        model: candidate.deviceModel ?? "DFRobot C4004",
        manufacturer: candidate.manufacturer,
        firmwareVersion: candidate.firmwareVersion,
        prefix: candidate.prefix,
        mqttTopicPrefix: candidate.prefix,
        mqttKey: "main",
        status: candidate.status,
        signal: Math.min(98, 64 + candidate.score * 4),
        entityCount: candidate.entityCount,
        macAddress: candidate.macAddress,
      })),
    );
    this.mqttBridge.setDevices(devices);
    return devices;
  }

  listDevices(): StoredMmwaveDevice[] {
    const devices = this.storage.listDevices();
    this.mqttBridge.setDevices(devices);
    return devices;
  }

  isMqttConnected(): boolean {
    return this.mqttBridge.isConnected();
  }

  private syncDeviceState(
    device: StoredMmwaveDevice,
    statesById: Map<string, HaEntityState>,
    options?: { forceSnapshot?: boolean },
  ): StoredMmwaveDevice {
    return this.storage.updateRuntimeState(
      device,
      {
        regionConfig: buildRegionConfig(statesById, device.prefix, device.regionConfig),
        lastZoneSnapshot: buildZoneSnapshot(statesById, device.prefix),
      },
      options,
    );
  }

  async getOverview(): Promise<MmwaveOverviewResponse> {
    const devices = this.listDevices();
    if (!this.haClient || !devices.length) {
      return { ok: true, metrics: buildMetrics([]), devices: [] };
    }

    const states = await this.haClient.getAllStates();
    const statesById = new Map(states.map((state) => [state.entity_id, state]));
    const cards = devices.map((device) => {
      const syncedDevice = this.syncDeviceState(device, statesById);
      return buildDeviceCard(syncedDevice, statesById, this.mqttBridge);
    });

    return {
      ok: true,
      metrics: buildMetrics(cards),
      devices: cards,
    };
  }

  async getDeviceDetail(deviceId: string, options?: { forceSnapshot?: boolean }): Promise<MmwaveDeviceDetail> {
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
    const trajectory = resolveTrajectory(syncedDevice.id, this.mqttBridge);
    const online = isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_online`));
    const movingCount = sumZoneCounts(statesById, syncedDevice.prefix, "moving");
    const staticCount = sumZoneCounts(statesById, syncedDevice.prefix, "static");

    return {
      id: syncedDevice.id,
      name: syncedDevice.name,
      model: syncedDevice.model,
      deviceId: syncedDevice.haDeviceId ?? syncedDevice.prefix,
      online,
      firmwareVersion: syncedDevice.firmwareVersion,
      trajectoryAvailable: Boolean(trajectory),
      mqttConnected: this.mqttBridge.isConnected(),
      lastUpdated: new Date().toISOString(),
      coordinate: cloneRangeBox(syncedDevice.regionConfig.coordinate),
      rangeBox: cloneRangeBox(syncedDevice.regionConfig.rangeBox),
      regions: buildRegions(statesById, syncedDevice.prefix, syncedDevice.regionConfig),
      targets: trajectory?.points ?? [],
      movingCount,
      staticCount,
      ioStates: [
        { id: "io1", label: "IO1", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_presence`)) },
        { id: "io2", label: "IO2", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_zone_1_presence`)) },
        { id: "io3", label: "IO3", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_zone_2_presence`)) },
        { id: "io4", label: "IO4", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_zone_3_presence`)) },
        { id: "io5", label: "IO5", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_zone_4_presence`)) },
        { id: "io6", label: "IO6", active: isTruthyState(readString(statesById, `binary_sensor.${syncedDevice.prefix}_zone_5_presence`)) },
      ],
      basics: [
        {
          key: "installMode",
          label: "安装方式",
          value: readString(statesById, `select.${syncedDevice.prefix}_install_mode`) ?? "-",
        },
        {
          key: "realTimePeopleTime",
          label: "实时人数上报时间",
          value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_real_time_people_time`), " s"),
        },
        {
          key: "installHeight",
          label: "安装高度",
          value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_install_height`), " cm"),
        },
        {
          key: "trackMeters",
          label: "轨迹产生米数",
          value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_track_meters`), " m"),
        },
        {
          key: "detectionRangeMode",
          label: "探测模式",
          value: readString(statesById, `text_sensor.${syncedDevice.prefix}_detection_range_mode`) ?? "-",
        },
        {
          key: "trackExistsTime",
          label: "轨迹存在时间",
          value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_track_exists_time`), " s"),
        },
        {
          key: "checkToActiveFrames",
          label: "确认帧数",
          value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_check_to_active_frames`)),
        },
        {
          key: "unmannedTime",
          label: "无人时间",
          value: numberLabel(readNumber(statesById, `number.${syncedDevice.prefix}_unmanned_time`), " s"),
        },
      ],
      actions: {
        canReset: Boolean(findWritableEntityId(syncedDevice.prefix, "reset")),
        canRefresh: true,
        canManageRegions: true,
      },
    };
  }

  async refreshDevice(deviceId: string): Promise<MmwaveDeviceDetail> {
    const devices = await this.discoverDevices();
    const exists = devices.some((device) => device.id === deviceId);
    if (!exists) {
      this.logger.warn({ deviceId }, "Refresh requested for missing device after discovery");
    }
    return this.getDeviceDetail(deviceId, { forceSnapshot: true });
  }

  async resetDevice(deviceId: string): Promise<MmwaveDeviceDetail> {
    const device = this.storage.getDevice(deviceId);
    if (!device) {
      throw new Error("Device not found");
    }
    if (!this.haClient) {
      throw new Error("Home Assistant is not linked");
    }

    await writeC4004Entity(this.haClient, device.prefix, "reset");
    return this.getDeviceDetail(deviceId);
  }

  handleTrajectorySnapshot(_deviceId: string, _snapshot: TrajectorySnapshot): void {
    // Trajectory snapshots stay in MqttBridge memory only.
  }
}
