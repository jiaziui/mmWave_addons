# DFRobot mmWave Add-on

DFRobot mmWave 是面向 Home Assistant 的毫米波传感器 Web 控制台插件。

当前实现以 **DFRobot C4004** 为主，覆盖设备发现、总览、详情、区域管理、探测范围、事件日志与底图。

## 功能概览

- 欢迎页（首次进入后记住，刷新直接进入控制台）
- 设备总览 / 设备管理 / 区域管理
- Home Assistant 设备发现与初始化绑定
- 软复位（重启设备）与恢复出厂设置
- 四方 / 自定义 / 学习探测范围
- 标签区域编辑、导入导出、IO 联动
- 区域事件日志与保留策略
- 官方底图 + 用户上传底图
- 可选 MQTT：实时轨迹与标签事件

## 配置项

本插件当前支持以下选项：

- `port`
  - Web 服务端口
  - 默认：`42069`

- `mqtt_host`
  - MQTT broker 地址
  - 留空则关闭 MQTT 实时轨迹 / 标签事件模式

- `mqtt_port`
  - MQTT 端口
  - 默认：`1883`

- `mqtt_username`
  - 可选 MQTT 用户名

- `mqtt_password`
  - 可选 MQTT 密码

- `mqtt_client_id`
  - 插件使用的 MQTT client ID
  - 默认：`dfrobot-mmwave-addon`

## 行为说明

当已配置 MQTT：

- 后端订阅设备轨迹与标签事件等主题
- 总览 / 详情 / 区域管理可显示实时目标点与区域事件

当未配置 MQTT：

- 插件仍可用
- Home Assistant 实体数据仍可读取
- 实时轨迹点隐藏，界面进入降级模式
- 本地已保存的区域配置、参数与历史日志仍可查看

### 复位说明

| 入口 | API | 含义 |
| --- | --- | --- |
| 详情页「重启设备」 | `POST .../actions/reset` | 软复位，不清理本地标签区域 |
| 区域管理「恢复出厂设置」 | `POST .../actions/factory-reset` | 出厂后等待 0.5s，拉探测范围与参数，清空本地标签区域，保留底图 |

## 存储

默认后端存储根目录：

```text
/homeassistant/dfrobot_mmwave
```

布局：

```text
/homeassistant/dfrobot_mmwave/devices.json
/homeassistant/dfrobot_mmwave/<deviceId>/config.json
/homeassistant/dfrobot_mmwave/<deviceId>/log/YYYY/MM/DD.jsonl
/homeassistant/dfrobot_mmwave/base_maps/user/...
```

规则：

- `devices.json`：绑定索引与稳定路由字段
- `config.json`：设备配置、区域、参数、日志保留策略
- 实时轨迹等高频数据仅存内存，不落盘
- 区域状态变化会写入事件日志 JSONL

设备型号声明（插件源码，不在 dataDir）：

```text
config/device/<profileId>.json
```

例如：`config/device/c4004.json`。扩展新型号时优先新增该文件，详见 [新增设备型号接入说明](backend/README_ADD_DEVICE_PROFILE.md)。

## 本地开发

在 `dfrobot_mmWave/`：

```bash
npm install
npm run dev
```

- 前端：`http://127.0.0.1:5173`
- Mock：`http://127.0.0.1:5173/?mock=1`
- 后端默认端口：`42069`

## 相关文档

- [仓库总说明](../README.md)
- [插件商店说明](README.md)
- [后端架构](backend/README.md)
- [后端 API](backend/README_API.md)
- [新增设备型号](backend/README_ADD_DEVICE_PROFILE.md)
- [数据存储维护手册](backend/README_STORAGE.md)
- [更新日志](CHANGELOG.md)

## 备注

- 当前完整运行时适配器已实现 `C4004`
- 其它型号可通过 `config/device/*.json` 参与扫描；完整控制仍需对应 runtime adapter
- 后端重启后，实时轨迹需等待新的 MQTT 消息恢复
