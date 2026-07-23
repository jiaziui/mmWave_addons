# DFRobot mmWave Add-on

[![GitHub Stars][stars-shield]][repository] [![Latest Release][release-shield]][releases] [![DFRobot][dfrobot-shield]][dfrobot]

---

DFRobot mmWave is a Home Assistant add-on that provides a visual interface for discovering, configuring, and monitoring DFRobot millimeter-wave radar devices. Manage multiple sensors, configure detection areas and regions, and view real-time targets from your browser.

![DFRobot mmWave device overview][screenshot]

## Key Features

| Feature | Description |
| :-- | :-- |
| **Device Management** | Discover, initialize, configure, refresh, soft-reset, factory-reset, and unbind supported mmWave devices |
| **Multi-device Overview** | View device count, occupancy statistics, configured regions, and target locations from one dashboard |
| **Real-time Radar** | Display moving and stationary targets in a live radar coordinate view |
| **Detection Range Editor** | Configure four-sided ranges, draw custom polygons, or use learned trajectory ranges |
| **Region Management** | Create and manage up to 32 rectangular or circular detection regions per device, plus the Overall Region |
| **Region Events** | Monitor occupancy, boundary entry/exit, and approach/away events over MQTT |
| **Import and Export** | Import or export custom detection ranges and tag region definitions using `.ini` files |
| **Event History** | Browse per-device region events by date with configurable retention policies |
| **Base Maps** | Add built-in or uploaded images to create an independent visual layout for each device |
| **Factory Reset Sync** | After factory reset, pull range/settings from the device, clear local tag regions, and keep base maps |
| **Offline Access** | View the latest saved device configuration and event history while a device is offline |
| **Extensible Profiles** | Add discovery signatures via `config/device/<profileId>.json` without changing the core service skeleton |

## Supported Devices

| Device | Support |
| :-- | :-- |
| [**DFRobot C4004**][c4004] | Device discovery, multi-target tracking, parameter configuration, detection ranges, learned ranges, regions, IO linkage, event history, factory reset, and base maps |

> [!NOTE]
> The current release focuses on the DFRobot C4004. Device profiles live under `config/device/*.json` (for example `c4004.json`) so additional DFRobot mmWave devices can be added by configuration plus an optional runtime adapter.

## Requirements

- Home Assistant OS with Supervisor and add-on support
- A supported DFRobot mmWave device configured and available in Home Assistant
- Network connectivity between Home Assistant and the device
- MQTT broker details when real-time trajectory / tag-event data is required

MQTT is optional. Without MQTT, device discovery, saved configuration, region management, Home Assistant entity data, and event history remain available; live trajectory points and MQTT-driven region events are not displayed.

## What's New

Recent updates include:

- Collapsible sidebar and consolidated page headers
- Top-center toast notifications
- Factory reset action with post-reset local sync (range/settings pull, tag regions cleared, base maps kept)
- Device profile configs moved to `config/device/<profileId>.json`
- Soft reset (`reset`) kept separate from factory reset (`factory-reset`)

See the [changelog][changelog] for the complete release notes.

## Documentation

- [Installation, configuration, and usage][docs]
- [Add-on repository and installation instructions][repository-readme]
- [Backend API reference][backend-api]
- [How to add a device profile][add-device-profile]
- [Storage maintenance handbook][storage-doc]
- [Backend architecture notes][backend-readme]
- [Release history][changelog]
- [Report an issue][issues]

## Local Development

From `dfrobot_mmWave/`:

```bash
npm install
npm run dev
```

- Frontend: `http://127.0.0.1:5173`
- Frontend mock mode: `http://127.0.0.1:5173/?mock=1`
- Backend default port: `42069`

<!-- Link definitions -->

[repository]: https://github.com/jiaziui/mmWave_addons
[repository-readme]: ../README.md
[releases]: https://github.com/jiaziui/mmWave_addons/releases
[issues]: https://github.com/jiaziui/mmWave_addons/issues
[stars-shield]: https://img.shields.io/github/stars/jiaziui/mmWave_addons
[release-shield]: https://img.shields.io/github/v/release/jiaziui/mmWave_addons
[dfrobot-shield]: https://img.shields.io/badge/DFRobot-mmWave-ED1C24
[dfrobot]: https://www.dfrobot.com/
[c4004]: https://www.dfrobot.com/
[screenshot]: ../resource/设备总览界面.png
[docs]: DOCS.md
[changelog]: CHANGELOG.md
[backend-api]: backend/README_API.md
[add-device-profile]: backend/README_ADD_DEVICE_PROFILE.md
[storage-doc]: backend/README_STORAGE.md
[backend-readme]: backend/README.md
