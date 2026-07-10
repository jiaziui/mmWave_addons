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

  regionConfig: {
    coordinate: RangeBox;
    rangeBox: RangeBox;
    regions: Array<{
      id: string;
      label: string;
      x: number;
      y: number;
      enabled: boolean;
    }>;
  };

  lastZoneSnapshot: {
    updatedAt: string;
    presenceStates: Array<{ id: string; active: boolean }>;
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
        "coordinate": { "xMin": -5, "xMax": 5, "yMin": 0, "yMax": 9 },
        "rangeBox": { "xMin": -5, "xMax": 5, "yMin": 0, "yMax": 9 },
        "regions": []
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
    firmwareVersion?: string;
    trajectoryAvailable: boolean;
    mqttConnected: boolean;
    lastUpdated: string;
    rangeBox: RangeBox;
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
- 如果 Home Assistant 未连接，则返回本地 `config.json` 中已有配置。

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
      "coordinate": { "xMin": -5, "xMax": 5, "yMin": 0, "yMax": 9 },
      "rangeBox": { "xMin": -5, "xMax": 5, "yMin": 0, "yMax": 9 },
      "regions": []
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
| `502` | HA 查询失败或其他后端错误 |

### 5.6 更新设备配置

```http
PUT /api/mmwave/devices/:deviceId/config
```

请求体：

```json
{
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
```

也支持局部更新：

```json
{
  "deviceSettings": {
    "trajectoryLed": true,
    "motionLed": true
  }
}
```

行为：

- 后端先写 Home Assistant 实体。
- HA 写入成功后，再保存到 `<deviceId>/config.json`。
- 如果某个字段未传，则不修改该字段。

成功响应：

```json
{
  "ok": true,
  "config": {
    "id": "c4004-xxx-c4004_0",
    "deviceSettings": {
      "trajectoryLed": true,
      "motionLed": true
    }
  }
}
```

失败状态码：

| 状态码 | 说明 |
| --- | --- |
| `400` | 请求体没有有效配置字段，或 profile 不支持配置 |
| `404` | 设备不存在 |
| `424` | Home Assistant 未连接 |
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

## 6. 前端推荐调用流程

### 6.1 页面启动

```text
GET /api/meta/config
GET /api/mmwave/devices
GET /api/mmwave/overview
```

### 6.2 添加或绑定设备

```text
GET /api/mmwave/devices/discover
POST /api/mmwave/devices/:deviceId/actions/initialize
GET /api/mmwave/overview
```

### 6.3 设备详情页

```text
GET /api/mmwave/devices/:deviceId/detail
GET /api/mmwave/devices/:deviceId/config
```

### 6.4 用户点击刷新

```text
POST /api/mmwave/devices/:deviceId/actions/refresh
```

### 6.5 用户解绑

```text
POST /api/mmwave/devices/:deviceId/actions/unbind
GET /api/mmwave/devices
```

## 7. 当前数据来源说明

### 7.1 本地文件

后端当前使用：

```text
/homeassistant/dfrobot_mmwave/devices.json
/homeassistant/dfrobot_mmwave/<deviceId>/config.json
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
  regionConfig: {
    coordinate: RangeBox;
    rangeBox: RangeBox;
    regions: Array<{
      id: string;
      label: string;
      x: number;
      y: number;
      enabled: boolean;
    }>;
  };
}
```

当前不再使用 `<deviceId>/data.json` 存运行态。

### 7.2 内存缓存

这些数据来自 HA 或 MQTT，后端重启后需要重新刷新：

- 在线状态
- presence / people count / target count
- zone 状态和 zone 计数
- rangeBox 当前值
- 轨迹点 targets
- MQTT 轨迹 hex

## 8. 当前限制

- 当前只实现 C4004 后端能力。
- C4001/C4002/C4003 当前没有启用 profile 配置。
- 区域配置修改接口尚未开放。
- MQTT `multi_tag_config`、`learned_trajectory_range`、`config_file_range` 的 command/result 闭环尚未实现。
- MQTT `multi_tag_config`、`learned_trajectory_range`、`config_file_range` 还没有落盘到 config。
- 详情接口里的 `basics[].label` 当前来自后端代码，部分构建环境可能显示为乱码；前端建议优先使用 `key` 做展示映射。
