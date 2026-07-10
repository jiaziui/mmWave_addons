# 新增设备型号后端接入说明

本文档说明如何在 `dfrobot_mmWave/backend` 中新增一个 mmWave 设备型号。

目标是让新增型号不要再改核心服务骨架，而是优先通过配置文件接入；只有当该型号需要详情页、初始化、reset、MQTT 轨迹等运行时能力时，才补对应的 runtime adapter。

## 1. 当前后端识别方式

后端现在用 `profile` 表示设备型号。

已支持的 profile id 定义在：

```text
src/types/profiles.ts
```

当前允许的型号：

```ts
c4004
```

设备识别入口在：

```text
src/domain/profiles/registry.ts
```

型号配置文件在：

```text
src/domain/profiles/deviceProfileCatalog.json
```

核心原则：

- 不靠设备名称判断型号。
- 不靠 friendly name 判断型号。
- 不要求 entity prefix 必须包含具体型号名，例如 `c4004`。
- 通过 HA metadata、profile marker、本地 override、实体签名来判断型号。

当前识别优先级：

```text
metadata > marker > override > signature
```

其中 `signature` 就是“对比配置文件里的实体清单”。

## 2. 新增型号分两种接入级别

### 2.1 只让后端识别该型号

适用于：

- 新型号实体清单已经知道。
- 暂时不做详情页业务字段。
- 暂时不做初始化/reset/MQTT 轨迹。
- 先让后端能发现设备，并标记为 `unsupported`。

需要改：

```text
src/types/profiles.ts
src/domain/profiles/deviceProfileCatalog.json
```

### 2.2 让新型号完整可用

适用于：

- 要在概览/详情页展示该型号的业务数据。
- 要支持 initialize/reset。
- 要支持 MQTT 轨迹。
- 要从 HA 实体读取型号特有字段。

除上面两个文件外，还需要改：

```text
src/domain/profiles/builtinProfiles.ts
src/domain/profiles/registry.ts
```

如果型号逻辑很大，可以新增 runtime 文件，但命名尽量按能力或业务维度命名，不要无必要地把所有文件都命名为具体型号。

例如：

```text
src/domain/profiles/presenceRuntime.ts
src/domain/profiles/trajectoryRuntime.ts
src/domain/profiles/regionRuntime.ts
```

只有当逻辑确实完全属于某一个型号时，才考虑使用型号名。

## 3. 第一步：新增 profile id

打开：

```text
src/types/profiles.ts
```

修改：

```ts
export const MMWAVE_PROFILE_IDS = ["c4004"] as const;
```

如果新增 `c4005`，改成：

```ts
export const MMWAVE_PROFILE_IDS = ["c4004", "c4005"] as const;
```

注意：

- `profileId` 必须小写。
- 配置文件里的 `id` 必须和这里一致。
- 存储、接口、registry 都会使用这个 union type。

## 4. 第二步：在配置文件里添加型号

打开：

```text
src/domain/profiles/deviceProfileCatalog.json
```

新增一个 profile 配置。

示例：

```json
{
  "id": "c4005",
  "displayName": "DFRobot C4005",
  "metadataHints": ["c4005", "dfrobot c4005", "dfrobot_c4005"],
  "markerValues": ["c4005"],
  "runtimeSupported": false,
  "capabilities": {
    "supportsTrajectory": false,
    "supportsRegions": false,
    "supportsInitializeWorkflow": false,
    "supportsReset": false,
    "supportsMqttBridge": false
  },
  "mqttTopics": {
    "component": "dfrobot_c4005"
  },
  "entitySignature": {
    "minScore": 3,
    "entities": [
      { "domain": "binary_sensor", "slug": "online" },
      { "domain": "binary_sensor", "slug": "presence" },
      { "domain": "sensor", "slug": "target_count" }
    ]
  }
}
```

### 字段说明

`id`

设备型号 id，必须在 `src/types/profiles.ts` 中声明。

`displayName`

展示名称。当前后端会用于默认 model 文案。

`metadataHints`

用于匹配 HA device registry 中的 `manufacturer/model/hw_version/sw_version`。

例如 HA metadata 里包含 `DFRobot C4005`，就可以通过这里识别。

`markerValues`

用于匹配固件暴露的 profile marker。

推荐固件或 ESPHome 增加一个只读实体：

```text
text_sensor.<prefix>_device_profile
```

状态值固定为：

```text
c4004 / ...
```

`runtimeSupported`

表示该型号是否已经有完整后端运行时 adapter。

- `false`：可以被识别，但动作和详情能力先标记为暂不支持。
- `true`：该型号已经能被后端完整处理。

`capabilities`

声明能力开关。

```text
supportsTrajectory           是否有轨迹
supportsRegions              是否有区域
supportsInitializeWorkflow   是否支持初始化流程
supportsReset                是否支持 reset
supportsMqttBridge           是否需要 MQTT bridge
```

`mqttTopics`

声明 MQTT 主题结构。

```json
{
  "component": "dfrobot_c4005",
  "trajectoryStateTopic": "state/target_trajectory"
}
```

如果该型号不走 MQTT，可以只保留 `component`，不写 `trajectoryStateTopic`。

`entitySignature`

实体签名匹配规则。

后端会扫描 HA 所有 entity state，并按下面格式匹配：

```text
<domain>.<prefix>_<slug>
```

例如配置：

```json
{ "domain": "sensor", "slug": "target_count" }
```

可以匹配：

```text
sensor.living_room_radar_target_count
sensor.mmwave_01_target_count
sensor.any_prefix_target_count
```

匹配后提取出的 prefix 分别是：

```text
living_room_radar
mmwave_01
any_prefix
```

`minScore`

最少命中多少个实体签名才认为是该型号。

建议：

- 实体少的型号：`minScore` 设为 `2` 或 `3`。
- 实体多的型号：`minScore` 设为 `4` 到 `6`。
- 不要设置为 `1`，否则容易误判。

## 5. 第三步：确认发现结果状态

如果只新增配置，没有 runtime adapter：

```json
"runtimeSupported": false
```

后端发现设备后会保存：

```text
profileId: 新型号
profileSource: signature / marker / metadata / override
profileStatus: unsupported
```

这代表：

- 后端知道它是什么型号。
- 但暂时不会执行初始化、reset、MQTT 订阅等动作。
- 前端老接口 shape 不会被破坏。

如果需要完整可用，再继续下面步骤。

## 6. 第四步：补 runtime adapter

runtime adapter 的接口定义在：

```text
src/domain/profiles/contracts.ts
```

主要可实现的方法：

```ts
resolveDeviceOnline?()
buildRuntimeState?()
buildOverviewCard?()
buildDeviceDetail?()
initializeDevice?()
resetDevice?()
getTrajectoryTopic?()
```

一般新增型号时按需实现，不需要一次全部实现。

最低建议：

- 如果只要展示在线状态，实现 `resolveDeviceOnline()`。
- 如果要概览卡片展示业务数据，实现 `buildOverviewCard()`。
- 如果要详情页展示业务数据，实现 `buildDeviceDetail()`。
- 如果要初始化设备，实现 `initializeDevice()`。
- 如果要 reset，实现 `resetDevice()`。
- 如果要 MQTT 轨迹，实现 `supportsMqttBridge`、`trajectoryStateTopic`，必要时实现解析逻辑。

当前 C4004 的 runtime adapter 在：

```text
src/domain/profiles/builtinProfiles.ts
```

可以参考它的结构，但不要直接复用 C4004 的实体 slug，除非新型号实体确实完全一致。

## 7. 第五步：注册 runtime adapter

打开：

```text
src/domain/profiles/registry.ts
```

找到：

```ts
const RUNTIME_ADAPTER_BY_ID = new Map<MmwaveProfileId, MmwaveProfileAdapter>([
  [c4004ProfileAdapter.id, c4004ProfileAdapter],
]);
```

新增型号 adapter 后，把它注册进去：

```ts
const RUNTIME_ADAPTER_BY_ID = new Map<MmwaveProfileId, MmwaveProfileAdapter>([
  [c4004ProfileAdapter.id, c4004ProfileAdapter],
  [c4005ProfileAdapter.id, c4005ProfileAdapter],
]);
```

然后把配置文件里的：

```json
"runtimeSupported": false
```

改成：

```json
"runtimeSupported": true
```

注意：

- 配置里 `runtimeSupported: true` 但没有注册 adapter，最终仍会被视为不完整。
- adapter 的 `id` 必须和配置文件里的 `id` 一致。

## 8. MQTT 型号接入规则

如果新型号需要 MQTT 轨迹，在配置文件中声明：

```json
"capabilities": {
  "supportsMqttBridge": true,
  "supportsTrajectory": true
},
"mqttTopics": {
  "component": "dfrobot_c4005",
  "trajectoryStateTopic": "state/target_trajectory"
}
```

后端最终订阅 topic：

```text
<mqttTopicPrefix>/<component>/<mqttKey>/<trajectoryStateTopic>
```

例如：

```text
living_room_radar/dfrobot_c4005/main/state/target_trajectory
```

不要在 `mqttBridge.ts` 中写死新型号 topic。

## 9. 存储字段

新增型号后，每个设备会持久化这些 profile 字段：

```text
profileId
profileSource
profileStatus
profileOverride
```

字段含义：

```text
profileId        当前识别出的型号
profileSource    识别来源：metadata / marker / override / signature
profileStatus    resolved / unresolved / unsupported
profileOverride  本地强制指定型号，可选
```

旧 C4004 存量数据会继续按兼容逻辑读取，不需要手动迁移。

## 10. 新增型号检查清单

只识别新型号时，检查：

- `src/types/profiles.ts` 增加了 profile id。
- `deviceProfileCatalog.json` 增加了对应配置。
- `entitySignature.entities` 使用的是真实 HA entity slug。
- `minScore` 不要太低，避免误判。
- `runtimeSupported` 先设为 `false`。
- `npm run lint` 通过。
- `npm run build` 通过。

完整支持新型号时，额外检查：

- runtime adapter 已实现需要的能力。
- `registry.ts` 已注册 adapter。
- 配置里的 `capabilities` 和 adapter 能力一致。
- reset/initialize 先检查实体 domain 和 service 是否正确。
- MQTT topic 只从 `mqttTopics` 生成，不在 bridge 中写死。
- `npm run lint` 通过。
- `npm run build` 通过。

## 11. 推荐开发顺序

建议按这个顺序做，风险最低：

1. 从固件或 HA 导出新型号实体列表。
2. 把稳定实体写进 `entitySignature.entities`。
3. 设置合理 `minScore`。
4. 先让 `runtimeSupported: false`，确认设备能被识别为正确型号。
5. 再补 runtime adapter。
6. 最后打开能力开关和 `runtimeSupported: true`。

这样即使 runtime 还没完成，也不会影响已有 C4004。

## 12. 常见问题

### 设备改名后还能识别吗？

可以。

只要实体 suffix 或 `device_profile` marker 仍然稳定，设备名称变化不会影响型号识别。

### prefix 里不包含型号可以吗？

可以。

例如：

```text
sensor.living_room_target_count
```

只要它的 suffix 命中配置文件里的 `target_count`，后端就能提取 prefix 并参与签名评分。

### 为什么不建议只靠 metadata？

因为当前不同固件/ESPHome 组件不一定稳定写入 HA device registry 的型号字段。

所以推荐同时提供：

```text
text_sensor.<prefix>_device_profile
```

再用实体签名兜底。

### 新型号能不能直接复用 C4004 的实体表？

不建议。

如果新型号和 C4004 的实体结构不同，应维护独立的 `entitySignature` 和 runtime 逻辑。

### 新型号没有 MQTT 怎么办？

把能力关掉：

```json
"supportsMqttBridge": false,
"supportsTrajectory": false
```

并且不要写 `trajectoryStateTopic`。

### 新型号暂时没有详情页怎么办？

保持：

```json
"runtimeSupported": false
```

设备可以被发现，但动作会返回“该 profile 暂不支持”。
