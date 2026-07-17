# DFRobot mmWave Backend API

本文档描述当前后端已经对前端开放的接口。前端后续开发请以本文档为准；如果代码实现发生变化，需要同步更新本文档。

## 1. 基础约定

- API base path: `/api`
- 请求体格式: `application/json`
- 成功响应通常包含 `ok: true`
- 失败响应通常包含 `ok: false` 和 `error`
- 当前已挂载路由只有：
  - `/api/health`
  - `/api/meta/*`
  - `/api/mmwave/*`
- `src/routes/rooms.ts`、`src/routes/live.ts` 当前没有挂到 server，不作为前端可用接口。

## 2. 公共数据结构

### 2.1 RangeBox

```ts
interface RangeBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}
```

### 2.2 RegionOverlay

```ts
interface RegionOverlay {
  id: string;
  label: string;
  active: boolean;
  x: number;
  y: number;
  regionType?: RegionType;
  geometry?:
    | { shape: "rect"; centerX: number; centerY: number; width: number; height: number }
    | { shape: "circle"; centerX: number; centerY: number; radius: number };
  movingCount?: number;
  staticCount?: number;
  boundaryState?: string;
  approachAwayState?: string;
}
```

### 2.3 TrajectoryPoint

```ts
interface TrajectoryPoint {
  id: number;
  x: number;
  y: number;
  feature: "static" | "moving" | "unknown";
  speed?: number;
}
```

### 2.4 StoredMmwaveDevice

`/devices`、`/devices/discover`、初始化接口会返回该结构。它是后端当前的设备对象，既包含本地配置，也包含运行态缓存合成后的状态。

```ts
interface StoredMmwaveDevice {
  id: string;
  deviceNo?: string;
  initialized: boolean;

  profileId: "c4004";
  profileSource?: "metadata" | "marker" | "override" | "signature";
  profileStatus: "resolved" | "unresolved" | "unsupported";
  profileOverride?: "c4004";

  haDeviceId?: string;
  name: string;
  deploymentName?: string;
  model: string;
  manufacturer?: string;
  firmwareVersion?: string;

  prefix: string;
  mqttTopicPrefix: string;
  mqttKey: string;
  macAddress: string;

  binding: {
    entityCount: number;
  };

  installInfo?: {
    installMode: "side";
    installAngleDeg: 0;
    installHeightM: number;
  };

  detectionMode?: 1 | 2;

  deviceSettings?: C4004DeviceSettings;

  discovery: {
    status: "online" | "offline";
    signal: number;
    lastSeen: string;
    discoveredAt: string;
    lastUpdated: string;
  };

  regionConfig: RegionConfigV2;

  lastZoneSnapshot: {
    updatedAt: string;
    presenceStates: Array<{ id: string; active: boolean }>;
    zones: Array<{
      index: number;
      active: boolean;
      movingCount?: number;
      staticCount?: number;
      boundaryState?: string;
      approachAwayState?: string;
    }>;
    counts: {
      peopleCount: number;
      targetCount: number;
      movingCount: number;
      staticCount: number;
    };
  };
}
```

### 2.5 C4004DeviceSettings

这组字段对应 C4004 的 HA 可写配置实体，会保存到 `<deviceId>/config.json` 的 `deviceSettings` 中。

```ts
interface C4004DeviceSettings {
  presenceEnable?: boolean;
  trajectoryTrackEnable?: boolean;
  trajectoryLed?: boolean;
  motionLed?: boolean;
  installZAngle?: number;
  realTimePeopleTime?: number;
  trackMeters?: number;
  trackExistsTime?: number;
  checkToActiveFrames?: number;
  unmannedTime?: number;
  zone1McuIo?: number;
  zone2McuIo?: number;
  zone3McuIo?: number;
  zone4McuIo?: number;
  zone5McuIo?: number;
  zone6McuIo?: number;
}
```

字段和 HA 实体映射：

| 前端字段 | HA 实体 |
| --- | --- |
| `presenceEnable` | `switch.<prefix>_presence_enable` |
| `trajectoryTrackEnable` | `switch.<prefix>_trajectory_track_enable` |
| `trajectoryLed` | `switch.<prefix>_trajectory_led` |
| `motionLed` | `switch.<prefix>_motion_led` |
| `installZAngle` | `number.<prefix>_install_z_angle` |
| `realTimePeopleTime` | `number.<prefix>_real_time_people_time` |
| `trackMeters` | `number.<prefix>_track_meters` |
| `trackExistsTime` | `number.<prefix>_track_exists_time` |
| `checkToActiveFrames` | `number.<prefix>_check_to_active_frames` |
| `unmannedTime` | `number.<prefix>_unmanned_time` |
| `zone1McuIo` | `number.<prefix>_zone_1_mcu_io` |
| `zone2McuIo` | `number.<prefix>_zone_2_mcu_io` |
| `zone3McuIo` | `number.<prefix>_zone_3_mcu_io` |
| `zone4McuIo` | `number.<prefix>_zone_4_mcu_io` |
| `zone5McuIo` | `number.<prefix>_zone_5_mcu_io` |
| `zone6McuIo` | `number.<prefix>_zone_6_mcu_io` |

### 2.6 detectionMode

初始化时使用数字模式：

| 值 | 含义 | 写入 HA 参数 |
| --- | --- | --- |
| `1` | high_sensitivity | `check_to_active_frames = 2`, `unmanned_time = 5` |
| `2` | static_stable | `check_to_active_frames = 7`, `unmanned_time = 30` |

当前路由兼容旧字符串 `"high_sensitivity"` / `"static_stable"`，但前端新代码建议只传 `1` 或 `2`。

### 2.7 RegionConfig V2

区域、探测范围和当前设备的底图实例持久化到 `<deviceId>/config.json`。所有几何字段显式使用厘米，只有兼容总览的 `x/y` 使用米。

```ts
type RegionType =
  | "status_detection"
  | "noise"
  | "approach_depart"
  | "boundary"
  | "empty_tag";

interface RegionConfigV2 {
  version: 2;
  coordinate: RangeBox;
  rangeBox: RangeBox;
  regions: RegionDefinition[];
  detection: {
    mode: "rect" | "learned" | "custom";
    appliedMode?: "rect" | "learned" | "custom";
    rectCm: { xMin: number; xMax: number; yMin: number; yMax: number };
    learnedPointsCm: Array<{ x: number; y: number }>;
    customPointsCm: Array<{ x: number; y: number }>;
    customConfirmed: boolean;
  };
  backgroundInstances: BaseMapInstance[];
  syncState: {
    fourSidedRange: "synced" | "pending" | "local_only";
    regionMcuIo: "synced" | "pending" | "local_only";
    tagConfig: "synced" | "pending" | "local_only";
    customRange: "synced" | "pending" | "local_only";
    learnedRange: "synced" | "pending" | "local_only";
    updatedAt?: string;
  };
}

interface RegionDefinition {
  id: string;
  index: number; // 0...31，设备内唯一
  label: string;
  regionType: RegionType;
  geometry:
    | { shape: "rect"; centerXCm: number; centerYCm: number; widthCm: number; heightCm: number }
    | { shape: "circle"; centerXCm: number; centerYCm: number; radiusCm: number };
  ioIndex: 0 | 2 | 3 | 4 | 5 | 6;
  mcuIo: number; // -1...255；仅 status_detection 且 ioIndex 为 2...6 时可同步设备
  x: number;
  y: number;
  enabled: boolean;
  visible: boolean;
}

interface BaseMapInstance {
  id: string;
  sourceType: "system" | "user";
  sourceId: string;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  visible: boolean;
  zIndex: number;
}
```

- 最多保存 32 个区域，`index` 必须唯一。
- 无 `version: 2` 的旧区域结构不会迁移区域内容，而是生成空 V2 配置。
- 学习范围通过独立的 MQTT 开启、关闭和查询命令同步到设备；学习过程中不返回中途坐标，停止后才查询最终点集。
- 自定义范围通过 MQTT `config_file_range` 同步到设备。

## 3. Meta 接口

### 3.1 获取后端配置状态

```http
GET /api/meta/config
```

响应：

```json
{
  "appVersion": "0.1.0",
  "port": 8099,
  "mode": "supervisor",
  "linked": true,
  "mqttConfigured": true,
  "mqttConnected": true,
  "dataDir": "/homeassistant/dfrobot_mmwave"
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `appVersion` | string | 后端版本 |
| `port` | number | 后端监听端口 |
| `mode` | string | HA 连接模式；未连接时为 `unlinked` |
| `linked` | boolean | 是否已配置 Home Assistant 连接 |
| `mqttConfigured` | boolean | 是否配置 MQTT |
| `mqttConnected` | boolean | MQTT 当前是否连接 |
| `dataDir` | string | 后端本地数据目录 |

## 4. Health 接口

### 4.1 健康检查

```http
GET /api/health
```

响应：

```json
{
  "status": "ok"
}
```

## 5. mmWave 设备接口

### 5.1 发现设备

```http
GET /api/mmwave/devices/discover
```

行为：

- 如果 Home Assistant 已连接，从 HA 拉取实体并进行 profile 识别。
- 当前只支持 `c4004` profile。
- 会刷新内存运行态缓存。
- 对已绑定设备，会更新 `devices.json` 里的稳定路由字段。

成功响应：

```json
{
  "ok": true,
  "devices": [
    {
      "id": "c4004-xxx-c4004_0",
      "deviceNo": "1",
      "initialized": true,
      "profileId": "c4004",
      "profileSource": "signature",
      "profileStatus": "resolved",
      "haDeviceId": "51d49f75bd817da0be7fa9c30a835c03",
      "name": "c4004_0",
      "deploymentName": "厨房",
      "model": "DFRobot C4004",
      "manufacturer": "DFRobot",
      "firmwareVersion": "1.0.0",
      "prefix": "c4004_0",
      "mqttTopicPrefix": "c4004_0",
      "mqttKey": "main",
      "macAddress": "30:C9:22:B0:D4:2C",
      "binding": { "entityCount": 42 },
      "installInfo": {
        "installMode": "side",
        "installAngleDeg": 0,
        "installHeightM": 1.8
      },
      "detectionMode": 1,
      "discovery": {
        "status": "online",
        "signal": 88,
        "lastSeen": "2026-07-10T06:52:33.602Z",
        "discoveredAt": "2026-07-10T06:52:33.602Z",
        "lastUpdated": "2026-07-10T06:52:33.602Z"
      },
      "regionConfig": {
        "version": 2,
        "coordinate": { "xMin": -5, "xMax": 5, "yMin": 0, "yMax": 9 },
        "rangeBox": { "xMin": -5, "xMax": 5, "yMin": 0, "yMax": 9 },
        "regions": [],
        "detection": {
          "mode": "rect",
          "appliedMode": "rect",
          "rectCm": { "xMin": -500, "xMax": 500, "yMin": 0, "yMax": 900 },
          "learnedPointsCm": [],
          "customPointsCm": [],
          "customConfirmed": false
        },
        "backgroundInstances": [],
        "syncState": { "fourSidedRange": "local_only", "regionMcuIo": "local_only" }
      },
      "lastZoneSnapshot": {
        "updatedAt": "2026-07-10T06:52:33.602Z",
        "presenceStates": [],
        "counts": {
          "peopleCount": 0,
          "targetCount": 0,
          "movingCount": 0,
          "staticCount": 0
        }
      }
    }
  ]
}
```

失败响应：

```json
{
  "ok": false,
  "error": "Failed to discover devices"
}
```

状态码：

| 状态码 | 说明 |
| --- | --- |
| `200` | 成功 |
| `502` | HA 查询或发现过程失败 |

### 5.2 获取设备列表

```http
GET /api/mmwave/devices
```

行为：

- 返回后端已知设备。
- 会刷新在线状态。
- 不要求设备必须 initialized。

成功响应：

```json
{
  "ok": true,
  "devices": []
}
```

`devices` 元素结构同 `StoredMmwaveDevice`。

失败响应：

```json
{
  "ok": false,
  "error": "Failed to list devices"
}
```

### 5.3 获取总览

```http
GET /api/mmwave/overview
```

行为：

- 只返回 `initialized = true` 的设备。
- 需要 Home Assistant 已连接；否则返回空总览。
- 轨迹点来自 MQTT 内存缓存，没有 MQTT 数据时 `targets` 为空。

成功响应：

```ts
interface MmwaveOverviewResponse {
  ok: true;
  metrics: {
    deviceCount: number;
    peopleCount: number;
    targetCount: number;
    staticCount: number;
  };
  devices: Array<{
    id: string;
    name: string;
    model: string;
    online: boolean;
    status: string;
    signal: number;
    peopleCount: number;
    targetCount: number;
    staticCount: number;
    trajectoryAvailable: boolean;
    mqttConnected: boolean;
    rangeBox: RangeBox;
    detection: RegionConfigV2["detection"];
    coordinate: RangeBox;
    regions: RegionOverlay[];
    targets: TrajectoryPoint[];
  }>;
}
```

示例：

```json
{
  "ok": true,
  "metrics": {
    "deviceCount": 1,
    "peopleCount": 1,
    "targetCount": 1,
    "staticCount": 0
  },
  "devices": [
    {
      "id": "c4004-xxx-c4004_0",
      "name": "c4004_0",
      "model": "DFRobot C4004",
      "online": true,
      "status": "Online",
      "signal": 88,
      "peopleCount": 1,
      "targetCount": 1,
      "staticCount": 0,
      "trajectoryAvailable": true,
      "mqttConnected": true,
      "rangeBox": { "xMin": -5, "xMax": 5, "yMin": 0, "yMax": 9 },
      "detection": {
        "mode": "rect",
        "appliedMode": "rect",
        "rectCm": { "xMin": -500, "xMax": 500, "yMin": 0, "yMax": 900 },
        "learnedPointsCm": [],
        "customPointsCm": [],
        "customConfirmed": false
      },
      "coordinate": { "xMin": -5, "xMax": 5, "yMin": 0, "yMax": 9 },
      "regions": [
        { "id": "zone-1", "label": "Zone 1", "active": false, "x": -3.6, "y": 6.8 }
      ],
      "targets": [
        { "id": 1, "x": 1.2, "y": 3.4, "feature": "moving", "speed": 0.5 }
      ]
    }
  ]
}
```

失败响应：

```json
{
  "ok": false,
  "error": "Failed to load overview"
}
```

### 5.4 获取设备详情

```http
GET /api/mmwave/devices/:deviceId/detail
```

成功响应：

```ts
interface DeviceDetailResponse {
  ok: true;
  detail: {
    id: string;
    name: string;
    model: string;
    deviceId: string;
    online: boolean;
    status: string;
    signal: number;
    peopleCount: number;
    targetCount: number;
    firmwareVersion?: string;
    trajectoryAvailable: boolean;
    mqttConnected: boolean;
    lastUpdated: string;
    rangeBox: RangeBox;
    detection: RegionConfigV2["detection"];
    coordinate: RangeBox;
    regions: RegionOverlay[];
    targets: TrajectoryPoint[];
    movingCount: number;
    staticCount: number;
    ioStates: Array<{ id: string; label: string; active: boolean }>;
    basics: Array<{ key: string; label: string; value: string }>;
    actions: {
      canReset: boolean;
      canRefresh: boolean;
      canManageRegions: boolean;
    };
    learnedRange: LearnedRangeRuntime;
  };
}
```

C4004 当前 `basics` 常见 key：

| key | 说明 |
| --- | --- |
| `installMode` | 安装方式，来自 `select.<prefix>_install_mode` |
| `realTimePeopleTime` | 实时人数上报时间 |
| `installHeight` | 安装高度 |
| `trackMeters` | 轨迹产生米数 |
| `detectionRangeMode` | 探测范围模式 |
| `trackExistsTime` | 轨迹存在时间 |
| `checkToActiveFrames` | 确认帧数 |
| `unmannedTime` | 无人时间 |

失败响应：

```json
{
  "ok": false,
  "error": "Device not found"
}
```

状态码：

| 状态码 | 说明 |
| --- | --- |
| `200` | 成功 |
| `404` | 设备不存在 |
| `502` | HA 查询失败或其他后端错误 |

### 5.5 获取设备配置

```http
GET /api/mmwave/devices/:deviceId/config
```

行为：

- 如果 Home Assistant 已连接，会优先读取当前 HA 实体值。
- 读取成功后会把 `deviceSettings` 写入 `<deviceId>/config.json`。
- 如果 Home Assistant 未连接或状态刷新失败，则返回本地 `config.json` 中已有配置，保证离线设备仍可只读查看区域配置。

成功响应：

```json
{
  "ok": true,
  "config": {
    "id": "c4004-xxx-c4004_0",
    "deviceNo": "1",
    "initialized": true,
    "profileId": "c4004",
    "prefix": "c4004_0",
    "mqttTopicPrefix": "c4004_0",
    "mqttKey": "main",
    "installInfo": {
      "installMode": "side",
      "installAngleDeg": 0,
      "installHeightM": 1.8
    },
    "detectionMode": 1,
    "regionConfig": {
      "version": 2,
      "coordinate": { "xMin": -5, "xMax": 5, "yMin": 0, "yMax": 9 },
      "rangeBox": { "xMin": -5, "xMax": 5, "yMin": 0, "yMax": 9 },
      "regions": [],
      "detection": {
        "mode": "rect",
        "appliedMode": "rect",
        "rectCm": { "xMin": -500, "xMax": 500, "yMin": 0, "yMax": 900 },
        "learnedPointsCm": [],
        "customPointsCm": [],
        "customConfirmed": false
      },
      "backgroundInstances": [],
      "syncState": { "fourSidedRange": "local_only", "regionMcuIo": "local_only" }
    },
    "deviceSettings": {
      "presenceEnable": true,
      "trajectoryTrackEnable": true,
      "trajectoryLed": false,
      "motionLed": false,
      "installZAngle": 0,
      "realTimePeopleTime": 5,
      "trackMeters": 3,
      "trackExistsTime": 30,
      "checkToActiveFrames": 2,
      "unmannedTime": 5,
      "zone1McuIo": 2,
      "zone2McuIo": 3,
      "zone3McuIo": 4,
      "zone4McuIo": 5,
      "zone5McuIo": 6,
      "zone6McuIo": 0
    }
  }
}
```

失败状态码：

| 状态码 | 说明 |
| --- | --- |
| `404` | 设备不存在 |
| `502` | 其他后端错误 |

### 5.6 更新设备配置

```http
PUT /api/mmwave/devices/:deviceId/config
```

请求体支持 `deviceSettings`、`regionConfig` 和 `apply` 三个可选字段，至少需要提供一项配置：

```json
{
  "regionConfig": {
    "version": 2,
    "coordinate": { "xMin": -5, "xMax": 5, "yMin": -1, "yMax": 9 },
    "rangeBox": { "xMin": -3, "xMax": 3, "yMin": 0, "yMax": 7 },
    "regions": [],
    "detection": {
      "mode": "rect",
      "appliedMode": "rect",
      "rectCm": { "xMin": -300, "xMax": 300, "yMin": 0, "yMax": 700 },
      "learnedPointsCm": [],
      "customPointsCm": [],
      "customConfirmed": false
    },
    "backgroundInstances": [],
    "syncState": { "fourSidedRange": "local_only", "regionMcuIo": "local_only" }
  },
  "apply": {
    "fourSidedRange": true,
    "regionMcuIo": false
  }
}
```

设备参数也支持局部更新：

```json
{
  "deviceSettings": {
    "trajectoryLed": true,
    "motionLed": true
  }
}
```

行为：

- `deviceSettings` 使用严格策略：先写 HA，全部成功后才保存 `config.json`。
- `regionConfig` 默认先原子写入本地，再按 `apply` 尝试同步设备；自定义范围是例外，必须收到设备成功回执后才写入本地。
- `apply.fourSidedRange = true` 时，依次写四个 `range_*` number 实体，再按 `set_four_sided_range_mode` 按钮。
- `apply.regionMcuIo = true` 时，整体区域单独写入 `deviceSettings.zone1McuIo`，对应 `number.<prefix>_zone_1_mcu_io`。
- 普通状态检测区域按 `ioIndex` 映射到 `zone_2...zone_6_mcu_io`，不再按区域 `index` 映射；每个设备内 IO2~IO6 只能绑定一个状态检测区域。
- 每次同步都会根据完整区域配置重算 IO2~IO6，未使用的通道写回 `-1`，避免删除或改绑区域后遗留旧 GPIO 配置。
- 状态区域选择 `ioIndex = 0`，以及边界、靠近远离、噪点、空标签区域，固定使用 `mcuIo = -1`，不写入区域 MCU IO。
- 区域设备同步失败不会回滚本地配置，响应 warning 且 `syncState` 保持 `pending`，前端可让用户手动重试。
- `apply.customRange = true` 时，后端把 `customPointsCm` 编码为模式 `06` 的配置文件范围 Hex，通过 MQTT 下发并等待 `result/config_file_range/set`；失败时不覆盖原有配置，前端保留当前草稿。
- 不传 `apply` 时，区域和底图实例只保存本地；自定义范围只有明确传入 `customRange = true` 才会尝试设备同步。

成功响应：

```json
{
  "ok": true,
  "config": {
    "id": "c4004-xxx-c4004_0",
    "regionConfig": {}
  },
  "applyResult": {
    "fourSidedRange": "applied",
    "regionMcuIo": "skipped",
    "tagConfig": "skipped",
    "customRange": "skipped",
    "warnings": []
  }
}
```

`applyResult.fourSidedRange`、`applyResult.regionMcuIo`、`applyResult.tagConfig` 和 `applyResult.customRange` 的值为 `applied | failed | skipped`。

整体区域的 MCU IO 使用设备配置字段单独更新，不会生成或下发标签区域记录：

```json
{
  "deviceSettings": {
    "zone1McuIo": 4
  }
}
```

保存成功后，后端写入 `number.<prefix>_zone_1_mcu_io`，并保存到 `config.json.deviceSettings.zone1McuIo`。

### 5.6.1 区域 IO 与设备 IO 状态

`detail.ioStates` 的六个项目固定按传感器 IO 编号返回，不使用整体存在实体作为 IO1：

| 页面项目 | MCU 配置实体 | 触发状态实体 |
| --- | --- | --- |
| IO1（整体区域） | `number.<prefix>_zone_1_mcu_io` | `binary_sensor.<prefix>_zone_1_presence` |
| IO2 | `number.<prefix>_zone_2_mcu_io` | `binary_sensor.<prefix>_zone_2_presence` |
| IO3 | `number.<prefix>_zone_3_mcu_io` | `binary_sensor.<prefix>_zone_3_presence` |
| IO4 | `number.<prefix>_zone_4_mcu_io` | `binary_sensor.<prefix>_zone_4_presence` |
| IO5 | `number.<prefix>_zone_5_mcu_io` | `binary_sensor.<prefix>_zone_5_presence` |
| IO6 | `number.<prefix>_zone_6_mcu_io` | `binary_sensor.<prefix>_zone_6_presence` |

`binary_sensor.<prefix>_presence` 仍表示雷达整体存在状态，不代表物理 IO1 的触发状态。

失败状态码：

| 状态码 | 说明 |
| --- | --- |
| `400` | 请求体没有有效配置字段，或 profile 不支持配置 |
| `404` | 设备不存在 |
| `424` | `deviceSettings` 写入时 Home Assistant 未连接 |
| `502` | HA 写入失败或其他后端错误 |

### 5.7 刷新设备

```http
POST /api/mmwave/devices/:deviceId/actions/refresh
```

行为：

- 先重新发现设备。
- 再强制读取详情。
- 返回结构与详情接口相同。

成功响应：

```json
{
  "ok": true,
  "detail": {}
}
```

失败状态码：

| 状态码 | 说明 |
| --- | --- |
| `404` | 设备不存在 |
| `502` | 刷新失败 |

### 5.8 重置设备

```http
POST /api/mmwave/devices/:deviceId/actions/reset
```

行为：

- C4004 会调用 `button.<prefix>_reset`。
- 成功后返回最新详情。

成功响应：

```json
{
  "ok": true,
  "detail": {}
}
```

失败状态码：

| 状态码 | 说明 |
| --- | --- |
| `404` | 设备不存在 |
| `502` | HA 未连接、profile 不支持 reset、或 HA 调用失败 |

### 5.9 解绑设备

```http
POST /api/mmwave/devices/:deviceId/actions/unbind
```

行为：

- 删除 `devices.json` 中的绑定项。
- 删除 `<deviceId>/config.json` 所在设备目录。
- 删除该设备内存运行态缓存。
- 如果 HA 已连接，会重新发现设备。

成功响应：

```json
{
  "ok": true,
  "devices": []
}
```

失败状态码：

| 状态码 | 说明 |
| --- | --- |
| `404` | 设备不存在 |
| `502` | 解绑失败 |

### 5.10 初始化设备

```http
POST /api/mmwave/devices/:deviceId/actions/initialize
```

请求体：

```ts
interface InitializeDeviceRequest {
  deviceNoMode: "auto" | "custom";
  customDeviceNo?: string;
  installHeightM: number;
  detectionMode: 1 | 2;
}
```

示例：

```json
{
  "deviceNoMode": "auto",
  "installHeightM": 1.8,
  "detectionMode": 1
}
```

自定义设备编号：

```json
{
  "deviceNoMode": "custom",
  "customDeviceNo": "A01",
  "installHeightM": 1.9,
  "detectionMode": 2
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `deviceNoMode` | `"auto"` \| `"custom"` | 自动编号或自定义编号 |
| `customDeviceNo` | string | 自定义编号，仅 `deviceNoMode = custom` 时使用 |
| `installHeightM` | number | 安装高度，后端会限制在 `1.8` 到 `2.0` 米 |
| `detectionMode` | `1` \| `2` | 检测模式数字枚举 |

初始化成功时，后端会写入 HA：

| detectionMode | check_to_active_frames | unmanned_time |
| --- | --- | --- |
| `1` | `2` | `5` |
| `2` | `7` | `30` |

成功响应：

```json
{
  "ok": true,
  "device": {}
}
```

`device` 结构同 `StoredMmwaveDevice`。

失败响应：

```json
{
  "ok": false,
  "error": "Invalid detection mode"
}
```

状态码：

| 状态码 | 说明 |
| --- | --- |
| `400` | `detectionMode` 非法 |
| `404` | 设备不存在 |
| `409` | 设备编号重复 |
| `424` | Home Assistant 未连接 |
| `502` | HA 写入失败或其他初始化失败 |

### 5.11 学习探测范围状态机

```http
POST /api/mmwave/devices/:deviceId/actions/learned-range
```

请求体只有以下三种：

```json
{ "action": "start" }
{ "action": "stop" }
{ "action": "query" }
```

学习范围使用独立的运行状态，不以已保存点数推断开关状态：

```ts
type LearnedRangeStatus =
  | "idle"
  | "confirming_single_target"
  | "starting"
  | "learning"
  | "stopping"
  | "querying"
  | "ready"
  | "error";

interface LearnedRangeRuntime {
  status: LearnedRangeStatus;
  learningEnabled: boolean;
  singleTargetConfirmCount: number;
  pointCount: number;
  pointsCm: Array<{ x: number; y: number }>;
  error?: string;
  message?: string;
  updatedAt: string;
}
```

处理规则：

- `start` 不立即启动设备学习，先等待 MQTT 轨迹帧连续 3 次 `targetCount = 1`；任一帧不是 1，计数清零并提示用户确保范围内只有一个目标。
- 三次确认成功后才发布学习开启命令。学习期间不读取、不保存、不更新中途坐标。
- `stop` 发布关闭命令，收到成功回执后等待 30ms，再主动发送查询命令。
- 查询成功后才保存 `mode/appliedMode = "learned"` 和最终 `learnedPointsCm`；设备坐标转换为前端坐标时使用 `xUi = -xDevice`，Y 坐标和点顺序不变。
- 查询失败不覆盖上一次成功范围，返回错误状态并允许再次使用 `action = "query"` 重试。
- 学习确认、学习中、停止和查询阶段禁止四方或自定义范围同步；其他设备的状态和确认计数互不影响。

成功响应：

```json
{
  "ok": true,
  "learnedRange": {
    "status": "confirming_single_target",
    "learningEnabled": false,
    "singleTargetConfirmCount": 2,
    "pointCount": 0,
    "pointsCm": [],
    "updatedAt": "2026-07-17T06:00:00.000Z"
  }
}
```

失败状态码：

| 状态码 | 说明 |
| --- | --- |
| `400` | action 非 `start`、`stop` 或 `query` |
| `404` | 设备不存在 |
| `409` | 设备离线或 MQTT 未连接 |
| `502` | 设备命令失败、回执失败或查询超时 |

对应 MQTT topic：

```text
state/learned_trajectory_range
command/learned_trajectory_range/set
result/learned_trajectory_range/set
command/learned_trajectory_range/query
result/learned_trajectory_range/query
```

学习状态消息在学习期间固定发送 `learning_enabled: true`、`point_count: 0`，不携带旧坐标 Hex；只有查询成功的结果消息才携带最终 `hex`。

## 6. 用户底图接口

用户底图保存在 `<dataDir>/base_maps/user`。官方 system 素材由前端静态打包，不使用这些接口。

### 6.1 获取用户底图库

```http
GET /api/mmwave/base-maps/user
```

```json
{
  "ok": true,
  "assets": [{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "originalName": "room.png",
    "fileName": "550e8400-e29b-41d4-a716-446655440000.png",
    "mimeType": "image/png",
    "size": 123456,
    "createdAt": "2026-07-13T08:00:00.000Z"
  }]
}
```

### 6.2 读取用户底图内容

```http
GET /api/mmwave/base-maps/user/:assetId
```

- 成功时直接返回图片二进制，并设置正确的 `Content-Type`。
- 素材不存在或 `assetId` 非法时返回 `404`。

### 6.3 上传或覆盖用户底图

```http
PUT /api/mmwave/base-maps/user/:assetId
Content-Type: multipart/form-data
```

- 表单文件字段固定为 `file`，`assetId` 建议由前端 `crypto.randomUUID()` 生成。
- 仅接受 PNG、JPEG、WebP，单文件最大 10MB。
- 后端同时核对 MIME、扩展名和文件头；SVG、伪造类型和路径穿越均拒绝。
- 上传成功只加入全局图库，不会自动创建任何设备的 `backgroundInstances`。
- 当前不提供全局素材删除接口；从画布移除只更新设备自己的 `regionConfig`。

## 7. 前端推荐调用流程

### 7.1 页面启动

```text
GET /api/meta/config
GET /api/mmwave/devices
GET /api/mmwave/overview
```

### 7.2 添加或绑定设备

```text
GET /api/mmwave/devices/discover
POST /api/mmwave/devices/:deviceId/actions/initialize
GET /api/mmwave/overview
```

### 7.3 设备详情页

```text
GET /api/mmwave/devices/:deviceId/detail
GET /api/mmwave/devices/:deviceId/config
```

### 7.4 用户点击刷新

```text
POST /api/mmwave/devices/:deviceId/actions/refresh
```

### 7.5 用户解绑

```text
POST /api/mmwave/devices/:deviceId/actions/unbind
GET /api/mmwave/devices
```

### 7.6 总览和详情实时刷新

```text
页面可见时：每 2 秒 GET /api/mmwave/overview
详情可见时：每 2 秒 GET /api/mmwave/devices/:deviceId/detail
页面隐藏或离开后：停止轮询
```

- 前端必须避免请求重叠；上一轮未完成时跳过下一轮。
- 请求失败保留最后一次成功数据并显示过期提示，不清空页面。
- MQTT 无轨迹时 `targets = []`，HA 人数和区域状态仍正常展示。
- 后端同时订阅 Home Assistant WebSocket 的 `state_changed` 事件。
- `zone_1_presence` 到 `zone_6_presence` 任一实体发生变化时，后端立即通过 `/api/live/ws` 向对应设备和总览发送刷新通知，前端随后立即 GET 最新详情。
- 2 秒轮询仅作为 WebSocket 断线或事件遗漏时的兜底，不是 IO 状态的主要更新机制。

## 8. 当前数据来源说明

### 8.1 本地文件

后端当前使用：

```text
/homeassistant/dfrobot_mmwave/devices.json
/homeassistant/dfrobot_mmwave/<deviceId>/config.json
/homeassistant/dfrobot_mmwave/base_maps/user/assets.json
/homeassistant/dfrobot_mmwave/base_maps/user/<assetId>.<ext>
```

`devices.json` 保存绑定索引和稳定路由字段：

```ts
interface StoredDeviceBinding {
  deviceNo: string;
  id: string;
  haDeviceId?: string;
  macAddress?: string;
  prefix?: string;
  mqttTopicPrefix?: string;
  deploymentName?: string;
  boundAt: string;
  updatedAt: string;
}
```

`config.json` 保存设备配置：

```ts
interface StoredDeviceConfig {
  id: string;
  profileId: "c4004";
  profileOverride?: "c4004";
  haDeviceId?: string;
  macAddress?: string;
  deploymentName?: string;
  prefix: string;
  mqttTopicPrefix: string;
  mqttKey: string;
  installInfo?: {
    installMode: "side";
    installAngleDeg: 0;
    installHeightM: number;
  };
  detectionMode?: 1 | 2;
  deviceSettings?: C4004DeviceSettings;
  regionConfig: RegionConfigV2;
}
```

当前不再使用 `<deviceId>/data.json` 存运行态。

### 8.2 内存缓存

这些数据来自 HA 或 MQTT，后端重启后需要重新刷新：

- 在线状态
- presence / people count / target count
- zone 状态和 zone 计数
- rangeBox 当前值
- 轨迹点 targets
- MQTT 轨迹 hex

## 9. 当前限制

- 当前只实现 C4004 后端能力。
- C4001/C4002/C4003 当前没有启用 profile 配置。
- 学习探测范围已接入 C4004 `learned_trajectory_range` MQTT command/result 闭环，停止学习后才查询最终点集。
- 自定义探测范围支持 `.ini` 导入/导出；标签区域支持 `.ini` 导入/导出，学习探测范围仍未接入设备。
- 学习范围确认计数、学习状态和查询结果通过设备级 WebSocket 刷新前端。
- `config_file_range` 只有设备确认成功后才落盘到 `config.json`。

## 10. 标签区域 MQTT 事件与配置闭环

本节为当前新增链路。区域实时信息不再从 HA zone 实体读取，改为从 C4004 MQTT `state/tag_event` 事件进入后端内存缓存。

### 10.1 标签事件上行

Topic:

```text
<mqttTopicPrefix>/dfrobot_c4004/<mqttKey>/state/tag_event
```

Payload:

```json
{
  "schema": 1,
  "type": "tag_event",
  "device_topic_prefix": "c4004_0",
  "mqtt_key": "main",
  "tag_index": 0,
  "tag_type": "people_counting",
  "tag_type_code": 3,
  "io_index": 0,
  "center_x_cm": 120,
  "center_y_cm": 350,
  "moving_count": 1,
  "static_count": 0
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `tag_index` | 标签区域索引，范围 `0...31` |
| `tag_type_code` | 固件枚举：`0 none / 1 boundary / 2 approach_away / 3 people_counting / 4 noise` |
| `tag_type` | 字符串类型：`none / boundary / approach_away / people_counting / noise` |
| `io_index` | 固件标签 IO 索引 |
| `center_x_cm` / `center_y_cm` | 标签中心坐标，单位 cm |
| `moving_count` / `static_count` | `people_counting` 类型专用 |
| `boundary_state` | `boundary` 类型专用：`enter / exit / none` |
| `approach_away_state` | `approach_away` 类型专用：`approach / away / none` |

后端路由规则：

- 使用 `device_topic_prefix + mqtt_key` 精确匹配设备。
- 匹配成功后写入 `RuntimeCacheStore` 的 `deviceId -> tagIndex` 缓存。
- 收到事件后通过 `/api/live/ws` 通知前端刷新 `overview/detail`。
- 事件不落盘；后端重启后等待下一条事件恢复显示。
- 如果某个区域尚未收到事件，`RegionOverlay.tagDataAvailable = false`，前端应显示等待态，不伪造 0。

### 10.2 RegionOverlay 新增字段

```ts
interface RegionOverlay {
  tagIndex?: number;
  tagType?: "none" | "boundary" | "approach_away" | "people_counting" | "noise";
  tagTypeCode?: number;
  tagDataAvailable?: boolean;
  tagUpdatedAt?: string;
  tagTypeMismatch?: boolean;
  movingCount?: number;
  staticCount?: number;
  boundaryState?: "enter" | "exit" | "none";
  approachAwayState?: "approach" | "away" | "none";
}
```

### 10.3 标签配置下发

保存、删除、导入标签区域，或拖拽/缩放结束后，前端可以通过 `PUT /api/mmwave/devices/:deviceId/config` 触发标签配置下发：

```json
{
  "regionConfig": {},
  "apply": {
    "tagConfig": true
  }
}
```

后端行为：

- 先保存 `regionConfig` 到 `<deviceId>/config.json`。
- 将 `regions` 编码为固件 `multi_tag_config.hex`。
- 发布到：

```text
<mqttTopicPrefix>/dfrobot_c4004/<mqttKey>/command/multi_tag_config/set
```

命令 payload:

```json
{
  "schema": 1,
  "type": "multi_tag_config",
  "device_topic_prefix": "c4004_0",
  "mqtt_key": "main",
  "request_id": "c4004-xxx-lz8n2a-ab12cd",
  "hex": "0001..."
}
```

设备回执 topic:

```text
<mqttTopicPrefix>/dfrobot_c4004/<mqttKey>/result/multi_tag_config/set
```

回执 payload:

```json
{
  "request_id": "c4004-xxx-lz8n2a-ab12cd",
  "ok": true,
  "tag_count": 1,
  "hex": "0001..."
}
```

失败回执示例：

```json
{
  "request_id": "c4004-xxx-lz8n2a-ab12cd",
  "ok": false,
  "error": "Multi tag config has invalid tag type or scope type"
}
```

响应中的 `applyResult` 现在包含：

```ts
interface ConfigApplyResult {
  fourSidedRange: "applied" | "failed" | "skipped";
  regionMcuIo: "applied" | "failed" | "skipped";
  tagConfig: "applied" | "failed" | "skipped";
  customRange: "applied" | "failed" | "skipped";
  warnings: string[];
}
```

`regionConfig.syncState` 现在包含：

```ts
interface RegionSyncState {
  fourSidedRange: "synced" | "pending" | "local_only";
  regionMcuIo: "synced" | "pending" | "local_only";
  tagConfig: "synced" | "pending" | "local_only";
  customRange: "synced" | "pending" | "local_only";
  updatedAt?: string;
}
```

### 10.5 自定义探测范围同步

自定义范围使用 C4004 的配置文件范围模式 `0x06`，不是 `multi_tag_config`。前端确认后请求：

```json
{
  "regionConfig": {
    "detection": {
      "mode": "custom",
      "appliedMode": "custom",
      "customConfirmed": true,
      "customPointsCm": [
        { "x": -200, "y": 0 },
        { "x": -200, "y": 400 },
        { "x": 200, "y": 400 },
        { "x": 200, "y": 0 }
      ]
    }
  },
  "apply": { "customRange": true }
}
```

后端将点集编码为 `[06][point_count][x/y...]`，通过以下 topic 下发：

```text
<mqttTopicPrefix>/dfrobot_c4004/<mqttKey>/command/config_file_range/set
```

设备回执 topic：

```text
<mqttTopicPrefix>/dfrobot_c4004/<mqttKey>/result/config_file_range/set
```

坐标单位为厘米，协议使用符号位编码；下发设备时 X 坐标使用 `xDevice = -xUi`，Y 坐标不变。点数必须为 `3...150`。只有收到 `ok: true` 回执后才写入 `config.json`；同步失败时保留原配置，并在 `applyResult.warnings` 返回原因，前端保留当前草稿供重试。

#### 自定义范围 `.ini` 文件

区域管理菜单的自定义范围导出文件使用 UTF-8 `.ini` 格式，每行一个设备坐标点：

```ini
(200,0)
(200,400)
(-200,400)
(-200,0)
```

- 文件坐标单位为厘米，导出使用 `xFile = -xUi`、`yFile = yUi`；导入执行相反转换。
- 点顺序保持原样，不自动闭合，不重复追加首点。
- 空行会被忽略，点数限制为 `3...150`，坐标限制为 `-32767...32767`。
- 只有当前模式为自定义探测范围且至少有 3 个有效点时才能导出。
- 从 `.ini` 导入后，模式自动设置为 `custom`，并通过 `apply.customRange = true` 同步到设备。
- 设备同步成功后才保存新范围；失败时保留前端导入草稿，不覆盖上一次设备成功配置。

## 11. 设备区域事件日志

区域日志直接来自 MQTT `state/tag_event`。后端只在状态发生变化时写入日志，连续重复事件不会重复落盘。日志按设备和北京时间日期保存：

```text
<dataDir>/<deviceId>/log/YYYY/MM/DD.jsonl
```

查询可用日期：

```http
GET /api/mmwave/devices/:deviceId/logs/calendar?year=2026&month=7
```

按日期分页查询，每页默认 50 条、最大 200 条：

```http
GET /api/mmwave/devices/:deviceId/logs?date=2026-07-16&page=1&pageSize=50
```

返回字段包括 `date/page/pageSize/total/hasMore/logs`。日志按时间倒序返回；设备离线时仍可读取历史日志。状态检测记录运动、静止和总人数，靠近远离记录 `approach/away`，边界检测记录 `enter/exit`。`none` 不写入文件，但会重置方向事件的去重状态。设备解绑时整个设备目录及日志一并删除。

每条新日志保存事件发生时的设备名称和部署名称，但不重复保存可由目录确定的设备 ID，也不保存无业务用途的 schema 和随机 ID：

```json
{
  "occurredAt": "2026-07-16T03:23:00.000Z",
  "localDate": "2026-07-16",
  "deviceName": "c4004_0",
  "deploymentName": "厨房",
  "regionIndex": 0,
  "regionLabel": "办公区",
  "regionType": "status_detection",
  "eventType": "status_changed",
  "movingCount": 1,
  "staticCount": 2,
  "totalCount": 3,
  "message": "1号办公区当前运动人数为1人，静止人数为2人，总人数为3人"
}
```

旧版包含 `schema/id/deviceId` 的 JSONL 记录仍可读取，接口会忽略这些旧字段，并使用当前设备信息补齐旧记录缺少的设备名称和部署名称。

### 日志保留策略

日志保留策略保存在对应设备的 `config.json`，继续使用设备配置接口：

```http
GET /api/mmwave/devices/:deviceId/config
PUT /api/mmwave/devices/:deviceId/config
```

配置字段如下：

```json
{
  "logRetention": {
    "mode": "limited",
    "value": 30,
    "unit": "day",
    "updatedAt": "2026-07-16T08:00:00.000Z"
  }
}
```

`mode` 支持 `forever`、`limited`、`none`。`limited` 的 `value` 必须为正整数，`unit` 支持 `day`、`week`、`month`、`year`。旧设备缺少该字段时按 `forever` 处理。

保存策略不会立即删除日志。后端使用 `Asia/Shanghai` 计算下一个本地零点，每天零点检查所有已绑定设备并删除过期的日期文件；服务重启后不补执行错过的零点任务，只等待下一个零点。清理只处理合法的 `YYYY/MM/DD.jsonl` 路径，清理后会删除空的年月目录。

- `forever`：不自动删除日志。
- `limited`：保留当前日期起的配置期限，超出期限的日期文件在零点删除。
- `none`：停止写入 JSONL；已有日志在下一个零点清理。实时事件仍通过 WebSocket 推送，前端当前页面最多保留最近 10 条内存事件，刷新页面后清空。

设备解绑时，设备目录、日志文件和日志保留配置一起删除。
