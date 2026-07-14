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
  mcuIo: number; // -1...255；仅 status_detection 且 index < 6 可同步设备
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
- 学习范围 UI 保留但设备接口尚未接入；自定义范围仅本地保存。

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
- `regionConfig` 先原子写入本地，再按 `apply` 尝试同步设备。
- `apply.fourSidedRange = true` 时，依次写四个 `range_*` number 实体，再按 `set_four_sided_range_mode` 按钮。
- `apply.regionMcuIo = true` 时，区域索引 `0...5` 映射到 `zone_1...zone_6_mcu_io`；更大索引不写设备。
- 区域设备同步失败不会回滚本地配置，响应 warning 且 `syncState` 保持 `pending`，前端可让用户手动重试。
- 不传 `apply` 时，区域、自定义范围和底图实例只保存本地。

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
    "warnings": []
  }
}
```

`applyResult.fourSidedRange` 和 `applyResult.regionMcuIo` 的值为 `applied | failed | skipped`。

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
- 当前前端不使用 WebSocket。

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
- 学习探测范围尚未接入设备；自定义探测范围当前仅本地保存。
- 探测范围配置和标签区域配置的导入/导出入口当前只显示“功能开发中”。
- MQTT `multi_tag_config`、`learned_trajectory_range`、`config_file_range` 的 command/result 闭环尚未实现。
- MQTT `multi_tag_config`、`learned_trajectory_range`、`config_file_range` 还没有落盘到 config。
