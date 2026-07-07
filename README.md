# DFRobot mmWave Add-ons

`mmWave_addons` 是 DFRobot 毫米波传感器在 Home Assistant 场景下的 add-on 工程目录。
这个目录用于承载通用 mmWave 平台的前后端、配置资源和后续多设备扩展能力，不再只面向单一 `C4004` 工程。

## 项目目标

- 构建 Home Assistant add-on 形式的毫米波传感器控制平台
- 统一承载设备总览、设备管理、区域管理等页面能力
- 打通 Home Assistant 实体、MQTT 实时轨迹、后端聚合接口、前端可视化页面
- 为后续接入更多 mmWave 设备型号预留统一架构

## 当前工程

当前正式工程位于：

- `05_Software/home_assistant/mmWave_addons/dfrobot_mmWave`

当前已落地的核心方向包括：

- Home Assistant add-on 基础工程结构
- 后端设备发现、设备持久化、总览/详情接口
- MQTT 轨迹订阅与内存态缓存
- 每设备独立目录的数据存储方案
- 面向前端页面的 mmWave 统一数据模型

## 目录说明

- `dfrobot_mmWave/`
  - 当前主工程目录
  - 包含 frontend、backend、add-on 配置及容器相关文件

- `resource/`
  - 页面原型图、图标、界面参考资源

- `prompt.md`
  - 当前 add-on 重构开发需求与实现约束记录

## 存储说明

当前后端默认持久化根目录为：

```text
/homeassistant/dfrobot_mmwave
```

每台设备单独使用一个目录：

```text
/homeassistant/dfrobot_mmwave/<deviceId>/device.json
/homeassistant/dfrobot_mmwave/<deviceId>/data.json
```

其中：

- `device.json` 保存设备身份、绑定信息、区域配置等低频配置
- `data.json` 保存发现状态、最后一次区域摘要等低频恢复数据
- 实时轨迹、MQTT 连接态、高频运行数据仅保存在内存中，不写入 JSON

## 参考资料

- 设备与 MQTT 接口参考：
  - `05_Software/home_assistant/Home_Assistant_C4004/Home_Assistant_C4004/README_ENTITY_API.md`

- C4004 组件源码参考：
  - `05_Software/home_assistant/Home_Assistant_C4004/Home_Assistant_C4004/dfrobot_c4004`

- UI / add-on 结构参考：
  - `01_Reference/everything-presence-addons`

## 当前状态

本目录已从早期参考工程逐步重构为 DFRobot 自有的 mmWave add-on 工程。
后续开发重点将放在前端页面完善、后端接口稳定、设备管理与区域管理能力补全，以及多型号毫米波设备的统一接入。
