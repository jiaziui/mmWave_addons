# 数据存储分配与管理说明（维护手册）

> 面向后续技术人员维护。描述「存在哪里、存什么、谁读写、对应哪些接口」。  
> 若与代码冲突，以代码为准。核心实现：`backend/src/config.ts`、`storage.ts`、`deviceLogStorage.ts`、`baseMapStorage.ts`、`domain/runtimeCache.ts`。

---

## 1. 存储分层总览

系统数据分 **四层**，切勿混用：

| 层级 | 位置 | 生命周期 | 典型内容 |
| --- | --- | --- | --- |
| A. 插件型号配置 | 插件包内 `config/device/*.json` | 随镜像/源码发布 | 型号识别签名、能力、MQTT 主题后缀 |
| B. 业务持久化 | `DATA_DIR`（默认见下） | 插件卸载前长期保留 | 绑定索引、设备配置、区域、日志、用户底图 |
| C. 运行时内存 | `RuntimeCacheStore` / MQTT / WS | 进程重启即丢失 | 在线状态、轨迹点、标签事件、学习状态 |
| D. 浏览器本地 | `localStorage` / `sessionStorage` | 按浏览器清除策略 | 欢迎页是否进入过、Mock 模式标记 |

**原则：**

- 低频、可恢复、需备份 → 落盘（B）
- 高频、实时 → 只进内存（C）
- 型号怎么扫 → 配置文件（A），不进 dataDir

---

## 2. 根路径与环境变量

### 2.1 业务数据根目录 `DATA_DIR`

代码默认（`backend/src/config.ts`）：

```text
/config/dfrobot_mmwave
```

解析优先级：

1. 环境变量 `DATA_DIR`
2. 否则使用上述默认值

在 Home Assistant OS / Supervisor 场景下，容器内 `/config` 通常映射到 HA 配置目录，因此宿主机侧常见等价路径为：

```text
/homeassistant/dfrobot_mmwave
```

（以实际挂载为准；维护时以容器内 `DATA_DIR` 日志为准。）

本地开发可自行设置：

```bash
set DATA_DIR=D:\temp\dfrobot_mmwave
```

### 2.2 型号配置目录

默认（相对插件根 `dfrobot_mmWave/`）：

```text
config/device/
```

解析逻辑（`loadDeviceProfileDefinitions.ts`）：

1. 环境变量 `DEVICE_PROFILE_DIR`（绝对路径）
2. 否则：从 `backend/src|dist/domain/profiles` 上溯到插件根下的 `config/device`

Docker 构建会 `COPY config/device` 到镜像 `/app/config/device`。

**本层只读**（运行时不写）。新增型号 = 新增 `config/device/<id>.json` + 可选 runtime adapter。

### 2.3 前端静态资源

- 构建产物：`frontend/dist`（由 `FRONTEND_DIST` 或默认相对路径指向）
- 官方底图素材：打进前端静态包，**不**经过 `DATA_DIR`

---

## 3. `DATA_DIR` 目录树（落盘全貌）

```text
<DATA_DIR>/
├── devices.json                          # 绑定索引（全局）
├── <deviceId>/                           # 每台已绑定设备一个目录
│   ├── config.json                       # 设备配置（区域/参数/探测范围等）
│   └── log/
│       └── <YYYY>/
│           └── <MM>/
│               └── <DD>.jsonl            # 按北京时间日期的区域事件日志
└── base_maps/
    └── user/
        ├── assets.json                   # 用户底图清单
        └── <assetId>.png|jpg|webp        # 用户上传图片文件
```

说明：

- `<deviceId>` 为稳定业务 ID（由 profile + HA deviceId/MAC + prefix 等生成），目录名与 `devices.json` 中 `id` 一致。
- **解绑**会 `rm -rf <DATA_DIR>/<deviceId>/`，并同时从 `devices.json` 移除绑定项。
- 已废弃、不再使用：`<deviceId>/data.json`、旧单文件存储。维护时若见到可视为历史残留，勿再依赖。

---

## 4. 各文件存什么（详细）

### 4.1 `devices.json` — 绑定注册表

**路径：** `<DATA_DIR>/devices.json`  
**写入方：** `DeviceStorage`（初始化绑定、解绑、发现时更新稳定字段）  
**类型：** JSON 对象

```ts
interface DeviceBindingRegistryFile {
  version: number;          // 当前 schema 版本
  nextSequence: number;     // 自动设备号序列
  devices: StoredDeviceBinding[];
}

interface StoredDeviceBinding {
  deviceNo: string;         // 业务设备号（界面展示）
  id: string;               // 稳定 deviceId（目录名）
  haDeviceId?: string;      // HA device registry id
  macAddress?: string;
  prefix?: string;          // 实体前缀
  mqttTopicPrefix?: string;
  deploymentName?: string;
  boundAt: string;          // ISO 时间
  updatedAt: string;
}
```

**存：** 谁已绑定、设备号、与 HA/MQTT 对齐的稳定路由字段。  
**不存：** 在线状态、轨迹、区域几何、日志正文、名称/固件等易变展示信息。

---

### 4.2 `<deviceId>/config.json` — 设备配置档案

**路径：** `<DATA_DIR>/<deviceId>/config.json`  
**写入方：** 初始化、更新配置、出厂后同步、区域/参数落盘等  
**类型：** JSON（`StoredDeviceMetaFile`）

主要字段：

| 字段 | 数据类型 | 含义 |
| --- | --- | --- |
| `id` | string | 设备 ID |
| `profileId` | string | 型号 id（如 `c4004`） |
| `profileOverride` | string? | 本地强制型号 |
| `haDeviceId` | string? | HA 设备 ID |
| `macAddress` | string? | MAC |
| `deploymentName` | string? | 部署位置名 |
| `prefix` | string | HA 实体前缀 |
| `mqttTopicPrefix` / `mqttKey` | string | MQTT 路由 |
| `installInfo` | object? | 安装方式/角度/高度 |
| `detectionMode` | `1 \| 2`? | 探测模式枚举 |
| `deviceSettings` | object? | 设备参数（指示灯、上报时间、MCU IO 等） |
| `logRetention` | object? | 日志保留策略 |
| `regionConfig` | object | **区域与探测范围核心配置（见下）** |

`regionConfig`（`StoredRegionConfig`，version 2）：

| 字段 | 存什么 |
| --- | --- |
| `coordinate` | 画布坐标系范围（米） |
| `rangeBox` | 当前四方探测范围（米） |
| `detection` | 探测模式、`rectCm`、学习点、自定义点、确认状态 |
| `regions[]` | 标签区域列表（几何、类型、IO、启用/可见） |
| `backgroundInstances[]` | 该设备画布上的底图实例（引用素材 id + 位置尺寸） |
| `viewPreferences` | 网格/底图可见性 |
| `syncState` | 与设备同步状态：四方/MCU IO/标签/自定义/学习 |

**注意：**

- 「整体区域」不在 `regions[]` 中，由 UI + `deviceSettings.zone1McuIo` 表达。
- 出厂复位：清空 `regions`，更新 `rangeBox`/`detection`/`deviceSettings`，**保留** `backgroundInstances`。
- 运行态人数、轨迹点 **不写** 此文件。

---

### 4.3 `<deviceId>/log/YYYY/MM/DD.jsonl` — 区域事件日志

**路径：** `<DATA_DIR>/<deviceId>/log/<年>/<月>/<日>.jsonl`  
**时区：** 文件按 **Asia/Shanghai** 日历日切分  
**格式：** 每行一条 JSON（JSONL）  
**写入方：** MQTT `tag_event` 状态变化时（去重，重复状态不重复落盘）

单条日志字段（维护关注）：

```json
{
  "occurredAt": "ISO-UTC",
  "localDate": "YYYY-MM-DD",
  "deviceName": "...",
  "deploymentName": "...",
  "regionIndex": 0,
  "regionLabel": "...",
  "regionType": "status_detection|boundary|approach_depart|...",
  "eventType": "status_changed|approach|away|enter|exit",
  "movingCount": 1,
  "staticCount": 2,
  "totalCount": 3,
  "message": "可读文案"
}
```

**保留策略**存在同一设备的 `config.json` → `logRetention`：

| mode | 行为 |
| --- | --- |
| `forever` | 不自动删 |
| `limited` | `value` + `unit`(day/week/month/year)，北京时间零点清理过期日文件 |
| `none` | 停止写 JSONL；已有文件下一零点清理 |

解绑设备时整目录删除，日志一并消失。

---

### 4.4 `base_maps/user/` — 用户底图库（全局）

**路径：**

```text
<DATA_DIR>/base_maps/user/assets.json
<DATA_DIR>/base_maps/user/<assetId>.<ext>
```

**类型：**

- `assets.json`：素材清单（id、原名、文件名、MIME、大小、创建时间）
- 图片文件：PNG / JPEG / WebP（校验扩展名 + 文件头）

**与设备关系：**

- 图库是**全局**的；设备 `regionConfig.backgroundInstances` 只存引用（`sourceType/sourceId` + 坐标）。
- 删除素材接口只删图库文件；不会自动清各设备实例引用（前端/运维需注意孤儿引用）。

官方（system）底图不在此目录，在前端静态资源中。

---

### 4.5 `config/device/<profileId>.json` — 型号声明（只读）

**路径示例：**

```text
dfrobot_mmWave/config/device/c4004.json
```

**存什么：**

- `id` / `displayName`
- `metadataHints` / `markerValues`（识别）
- `runtimeSupported` / `capabilities`（含 reset / factoryReset 等）
- `mqttTopics`（component + 各 state/command/result 后缀）
- `entitySignature`（实体签名与 `minScore`）

**不存：** 某台现场设备的区域、日志、绑定号。

---

### 4.6 运行时内存（不落盘）

`RuntimeCacheStore` 等内存结构大致包括：

| 数据 | 来源 | 说明 |
| --- | --- | --- |
| 在线/信号/名称等 | HA 发现 | 重启后需重新 discover |
| zone / range 快照 | HA 实体 | 可覆盖本地展示用 range |
| 轨迹点 | MQTT `target_trajectory` | 高频，仅内存 |
| 标签事件 overlay | MQTT `tag_event` | 驱动区域状态与日志写入 |
| 学习范围状态机 | MQTT + 服务编排 | status / points 等 |
| WS 订阅关系 | 前端连接 | 刷新通知用 |

出厂复位后必须同步更新 cache 中的 `native.regionConfig`，否则接口可能短暂返回旧区域。

---

### 4.7 浏览器本地（前端）

| Key | 存储 | 用途 |
| --- | --- | --- |
| `dfrobot-mmwave-console-entered` | `localStorage` | 是否已进入过控制台（跳过欢迎页） |
| `dfrobot_mmwave_local_mock` | `sessionStorage` | Mock 模式跨刷新保持 |

与后端 `DATA_DIR` 无关；清浏览器缓存会影响欢迎页/Mock，不影响设备配置。

---

## 5. 谁在什么时机写盘

| 操作 | 写哪些路径 |
| --- | --- |
| 扫描发现（已绑定设备） | 可能更新 `devices.json` 稳定字段；刷新内存；一般不重写整份区域 |
| 初始化绑定 | `devices.json` + 新建 `<deviceId>/config.json`（+ 日志目录按需创建） |
| 更新设备配置 / 区域 / 参数 | `<deviceId>/config.json` |
| 出厂复位后同步 | 更新 `config.json`（清 regions、刷 range/settings）+ runtime cache |
| 标签事件变化 | append `log/.../DD.jsonl`（受保留策略约束） |
| 日志保留策略变更 | `config.json` 的 `logRetention`；清理在上海零点任务 |
| 上传/覆盖用户底图 | `base_maps/user/assets.json` + 图片文件 |
| 删除用户底图 | 删图片 + 更新 `assets.json` |
| 解绑 | 删 `devices.json` 条目 + `rm` 整个 `<deviceId>/` |

原子写：配置类 JSON 普遍先写 `.tmp` 再替换，降低半截文件风险。

---

## 6. 接口清单（与存储关系）

Base path：`/api`。以下「读写」指相对 `DATA_DIR` / 型号配置 / 内存。

### 6.1 元数据与健康

| 方法 | 路径 | 持久化影响 |
| --- | --- | --- |
| `GET` | `/api/health` | 无 |
| `GET` | `/api/meta/config` | 无（返回 HA/MQTT 是否配置等） |

### 6.2 设备发现与列表

| 方法 | 路径 | 读 | 写 |
| --- | --- | --- | --- |
| `GET` | `/api/mmwave/devices/discover` | HA + `config/device/*.json` + `devices.json` | 可能更新绑定稳定字段 / 设备目录；刷新内存 |
| `GET` | `/api/mmwave/devices` | `devices.json` + 各 `config.json` + 内存合成 | 无（或仅读） |
| `GET` | `/api/mmwave/overview` | 同上 + 轨迹内存 | 无 |

### 6.3 详情与配置

| 方法 | 路径 | 读 | 写 |
| --- | --- | --- | --- |
| `GET` | `/api/mmwave/devices/:deviceId/detail` | `config.json` + HA + MQTT 内存 | 可能回写 settings 到 `config.json`（视实现刷新路径） |
| `GET` | `/api/mmwave/devices/:deviceId/config` | `config.json`；有 HA 时优先读实体再落盘 settings | 可能更新 `config.json` 中 settings |
| `PUT` | `/api/mmwave/devices/:deviceId/config` | — | **主写口**：`deviceSettings` / `regionConfig` / `logRetention`；可选 `apply.*` 推 HA/MQTT |

`PUT .../config` 的 `apply` 标志（不落额外文件，触发设备侧同步）：

- `fourSidedRange` / `regionMcuIo` / `tagConfig` / `customRange`

### 6.4 动作类

| 方法 | 路径 | 存储影响 |
| --- | --- | --- |
| `POST` | `/api/mmwave/devices/:deviceId/actions/refresh` | 重新 discover + 刷详情；内存为主 |
| `POST` | `/api/mmwave/devices/:deviceId/actions/reset` | 软复位；**不清**本地 regions |
| `POST` | `/api/mmwave/devices/:deviceId/actions/factory-reset` | 出厂后 0.5s：更新 `config.json`（拉范围/参数、`regions=[]`、保留底图）+ 更新 runtime cache；返回 `config` |
| `POST` | `/api/mmwave/devices/:deviceId/actions/initialize` | 写 `devices.json` + 创建/更新 `config.json`；向 HA 写初始参数 |
| `POST` | `/api/mmwave/devices/:deviceId/actions/unbind` | 删绑定 + **删除整个** `<deviceId>/` |
| `POST` | `/api/mmwave/devices/:deviceId/actions/learned-range` | 学习状态在内存；成功后可能更新 `config.json` 中 detection/learned 相关字段 |

### 6.5 日志

| 方法 | 路径 | 读 | 写 |
| --- | --- | --- | --- |
| `GET` | `/api/mmwave/devices/:deviceId/logs/calendar?year=&month=` | `log/` 目录结构 | 无 |
| `GET` | `/api/mmwave/devices/:deviceId/logs?date=&page=&pageSize=` | 指定日 `DD.jsonl` | 无 |

日志写入由 MQTT 事件路径触发，无单独「写日志」HTTP 接口。  
保留策略经 `PUT .../config` 的 `logRetention` 修改。

### 6.6 用户底图

| 方法 | 路径 | 读 | 写 |
| --- | --- | --- | --- |
| `GET` | `/api/mmwave/base-maps/user` | `assets.json` | 无 |
| `GET` | `/api/mmwave/base-maps/user/:assetId` | 图片二进制 | 无 |
| `PUT` | `/api/mmwave/base-maps/user/:assetId` | — | `assets.json` + 图片文件 |
| `DELETE` | `/api/mmwave/base-maps/user/:assetId` | — | 删文件 + 更新清单 |

设备画布是否引用某底图：在 `PUT .../config` 的 `regionConfig.backgroundInstances`。

### 6.7 WebSocket

| 路径 | 作用 | 存储 |
| --- | --- | --- |
| `/api/live/ws` | 推送刷新通知（overview / device scope） | 不落盘；订阅关系在内存 |

---

## 7. 维护操作速查

### 7.1 备份建议

至少备份：

```text
<DATA_DIR>/devices.json
<DATA_DIR>/*/config.json
<DATA_DIR>/*/log/          # 若需要历史审计
<DATA_DIR>/base_maps/user/
```

型号配置在插件包内，随版本管理即可。

### 7.2 手动排障

| 现象 | 检查 |
| --- | --- |
| 设备管理列表空 | HA 是否连接；`config/device` 是否存在；discover 日志 |
| 绑定了但无配置 | 是否存在 `<DATA_DIR>/<id>/config.json`；`devices.json` 是否有对应 `id` |
| 区域出厂后 UI 仍显示 | 查 `config.json` 的 `regions`；是否旧进程/旧 cache；接口是否返回 hydrate 旧数据 |
| 日志查不到 | 路径是否按上海日期；`logRetention.mode` 是否为 `none`；设备是否已解绑删目录 |
| 底图丢失 | `base_maps/user` 文件是否在；设备 `backgroundInstances` 引用 id 是否仍存在 |

### 7.3 危险操作

- 直接删 `<deviceId>/` 而不改 `devices.json` → 绑定索引残留  
- 只改 `devices.json` 不删目录 → 孤儿配置目录  
- 手动改 `deviceId` 目录名 → 与绑定/MQTT 路由全部断裂  

推荐通过 `unbind` + 重新 `initialize` 完成重建。

---

## 8. 相关代码索引

| 模块 | 路径 |
| --- | --- |
| DATA_DIR 解析 | `backend/src/config.ts` |
| 绑定与 config.json | `backend/src/config/storage.ts` |
| 事件日志 | `backend/src/config/deviceLogStorage.ts` |
| 用户底图 | `backend/src/config/baseMapStorage.ts` |
| 型号 JSON 加载 | `backend/src/domain/profiles/loadDeviceProfileDefinitions.ts` |
| 运行时缓存 | `backend/src/domain/runtimeCache.ts` |
| 业务编排 | `backend/src/domain/mmwaveService.ts` |
| HTTP 路由 | `backend/src/routes/devices.ts`、`baseMaps.ts`、`meta.ts` |
| API 合同 | `backend/README_API.md` |
| 新型号接入 | `backend/README_ADD_DEVICE_PROFILE.md` |

---

## 9. 一句话给维护同事

**型号怎么认 → `config/device/*.json`；谁被管、管成什么样、历史事件与用户图 → `DATA_DIR`；实时轨迹与瞬时状态 → 内存。**  
HTTP 接口里真正长期改盘的主要是：`initialize` / `PUT config` / `factory-reset` / 底图增删 / 日志策略 + 事件自动 append / `unbind` 全清。
