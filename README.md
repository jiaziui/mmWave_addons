# DFRobot mmWave Add-ons

[![GitHub Stars][stars-shield]][repository] [![Latest Release][release-shield]][releases] [![Home Assistant][ha-shield]][ha-website]

## 关于本仓库

本仓库提供面向 DFRobot 毫米波传感器的 Home Assistant 插件，帮助用户在 Home Assistant 中完成设备发现、状态查看、参数配置、区域管理和实时目标可视化。

当前插件主要支持 DFRobot C4004，并通过 `config/device/*.json` 设备配置框架为后续扩展更多 mmWave 型号预留统一接入方式。

## 安装插件仓库

此安装方式适用于支持插件（Add-ons）的 [Home Assistant OS][ha-installation]。如果使用 Home Assistant Container 等不支持插件的安装方式，则不能通过下面的方法安装。

### 一键添加

点击下面的按钮，在 Home Assistant 中添加本仓库：

[![打开 Home Assistant 并添加插件仓库][ha-repository-badge]][ha-repository-url]

### 手动添加

如果一键添加按钮无法使用：

1. 打开 Home Assistant，进入 **设置 → 插件 → 插件商店**。
2. 点击右上角的三点菜单，选择 **仓库**。
3. 输入以下仓库地址：

   ```text
   https://github.com/jiaziui/mmWave_addons
   ```

4. 点击 **添加**，然后关闭仓库窗口。
5. 在插件商店中找到 **DFRobot mmWave Add-ons**。
6. 选择 **DFRobot mmWave**，点击 **安装**。

## 本仓库提供的插件

### DFRobot mmWave

DFRobot mmWave 是一款面向毫米波传感器的可视化管理工具，可在 Home Assistant 中集中管理多台设备。

主要功能：

- 发现并管理 Home Assistant 中的 C4004 设备
- 查看设备在线状态、部署位置和安装参数
- 查看设备总数、人数、运动人数和静止人数
- 通过雷达坐标视图实时显示目标位置和运动轨迹
- 配置四方探测范围、自定义多边形探测范围，以及学习探测范围
- 创建并管理状态、边界、趋近/远离等检测区域（含整体区域）
- 导入和导出自定义探测范围及标签区域配置
- 查看区域事件日志和历史记录，并支持保留策略
- 为不同设备配置独立的底图、区域和参数
- 支持软复位与恢复出厂设置（出厂后同步探测范围/参数，清空本地标签区域，保留底图）
- 通过 MQTT 获取实时轨迹与标签事件；未配置 MQTT 时仍可使用基础功能

有关安装、参数和使用方法，请参阅：

- [插件使用文档][addon-docs]
- [插件说明][addon-readme]
- [版本更新记录][changelog]
- [后端 API 说明][backend-api]
- [新增设备型号接入说明][add-device-profile]
- [数据存储维护手册][storage-doc]

## 目录结构

```text
mmWave_addons/
├── README.md                          # 本仓库说明
├── resource/                          # 界面预览与素材
└── dfrobot_mmWave/                    # Home Assistant Add-on
    ├── README.md                      # 插件商店说明
    ├── DOCS.md                        # 安装、配置与使用
    ├── CHANGELOG.md                   # 版本更新记录
    ├── config/device/                 # 设备型号配置（如 c4004.json）
    ├── backend/                       # 后端服务
    │   ├── README.md
    │   ├── README_API.md
    │   └── README_ADD_DEVICE_PROFILE.md
    └── frontend/                      # 前端控制台
```

## 界面预览

### 设备总览

![DFRobot mmWave 设备总览](resource/image.png)

### 设备管理

![DFRobot mmWave 设备管理](resource/image2.png)

### 区域管理

![DFRobot mmWave 区域管理](resource/image3.png)

## 兼容性

- Home Assistant OS
- CPU 架构：`amd64`、`aarch64`、`armv7`
- 当前主要设备型号：DFRobot C4004
- MQTT：可选，用于实时轨迹与标签事件数据

## 数据存储

插件按设备独立保存配置、检测区域、底图布局和事件日志。实时轨迹等高频数据仅保存在内存中，不写入持久化文件。

默认数据目录：

```text
/homeassistant/dfrobot_mmwave
```

设备型号声明（扫描签名与能力）位于插件源码目录，不在 dataDir：

```text
dfrobot_mmWave/config/device/<profileId>.json
```

卸载插件或清理 Home Assistant 配置前，建议先备份需要保留的设备配置和日志。

## 本地开发（可选）

在 `dfrobot_mmWave/` 目录：

```bash
npm install
npm run dev
```

- 前端默认：`http://127.0.0.1:5173`
- 本地 Mock：`http://127.0.0.1:5173/?mock=1`
- 后端默认端口：`42069`

## 问题反馈

如果遇到安装、设备发现或功能异常，请在提交问题前准备以下信息：

- Home Assistant 和插件版本
- 运行设备的 CPU 架构
- C4004 固件及接入方式
- 插件日志中的相关错误信息
- 可复现问题的操作步骤

可通过 [GitHub Issues][issues] 提交反馈。

## 相关链接

- [DFRobot 官方网站][dfrobot]
- [Home Assistant 安装说明][ha-installation]
- [Home Assistant 插件说明][ha-addons]

<!-- Link definitions -->

[repository]: https://github.com/jiaziui/mmWave_addons
[releases]: https://github.com/jiaziui/mmWave_addons/releases
[issues]: https://github.com/jiaziui/mmWave_addons/issues
[stars-shield]: https://img.shields.io/github/stars/jiaziui/mmWave_addons
[release-shield]: https://img.shields.io/github/v/release/jiaziui/mmWave_addons
[ha-shield]: https://img.shields.io/badge/Home%20Assistant-Add--on-41BDF5?logo=homeassistant&logoColor=white
[ha-website]: https://www.home-assistant.io/
[ha-installation]: https://www.home-assistant.io/installation/
[ha-addons]: https://www.home-assistant.io/addons/
[ha-repository-badge]: https://my.home-assistant.io/badges/supervisor_store.svg
[ha-repository-url]: https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https://github.com/jiaziui/mmWave_addons
[addon-docs]: dfrobot_mmWave/DOCS.md
[addon-readme]: dfrobot_mmWave/README.md
[changelog]: dfrobot_mmWave/CHANGELOG.md
[backend-api]: dfrobot_mmWave/backend/README_API.md
[add-device-profile]: dfrobot_mmWave/backend/README_ADD_DEVICE_PROFILE.md
[storage-doc]: dfrobot_mmWave/backend/README_STORAGE.md
[dfrobot]: https://www.dfrobot.com/
