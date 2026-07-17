# DFRobot mmWave Add-on

[![GitHub Stars][stars-shield]][repository] [![Latest Release][release-shield]][releases] [![DFRobot][dfrobot-shield]][dfrobot]

---

DFRobot mmWave is a Home Assistant add-on that provides a visual interface for discovering, configuring, and monitoring DFRobot millimeter-wave radar devices. Manage multiple sensors, configure detection areas and regions, and view real-time targets from your browser.

![DFRobot mmWave device overview][screenshot]

## Key Features

| Feature | Description |
| :-- | :-- |
| **Device Management** | Discover, initialize, configure, refresh, restart, and unbind supported mmWave devices |
| **Multi-device Overview** | View device count, occupancy statistics, configured regions, and target locations from one dashboard |
| **Real-time Radar** | Display moving and stationary targets in a live radar coordinate view |
| **Detection Range Editor** | Configure four-sided ranges or draw custom polygon detection boundaries |
| **Region Management** | Create and manage up to 32 rectangular or circular detection regions per device |
| **Region Events** | Monitor occupancy, boundary entry/exit, and approach/away events |
| **Import and Export** | Import or export detection ranges and region definitions using `.ini` files |
| **Event History** | Browse per-device region events by date with configurable retention policies |
| **Base Maps** | Add built-in or uploaded images to create an independent visual layout for each device |
| **Offline Access** | View the latest saved device configuration and event history while a device is offline |

## Supported Devices

| Device | Support |
| :-- | :-- |
| [**DFRobot C4004**][c4004] | Device discovery, multi-target tracking, parameter configuration, detection ranges, regions, IO linkage, event history, and base maps |

> [!NOTE]
> The current release focuses on the DFRobot C4004. The add-on uses a device-profile architecture so support for additional DFRobot mmWave devices can be added in future releases.

## Requirements

- Home Assistant OS with Supervisor and add-on support
- A supported DFRobot mmWave device configured and available in Home Assistant
- Network connectivity between Home Assistant and the device
- MQTT broker details when real-time trajectory data is required

MQTT is optional. Without MQTT, device discovery, saved configuration, region management, Home Assistant entity data, and event history remain available; live trajectory points are not displayed.

## What's New in Version 1.0.0

Version 1.0.0 introduces the first complete DFRobot mmWave management experience for Home Assistant:

- Multi-device discovery, initialization, and management
- Live occupancy dashboard and radar target visualization
- Device detail view with IO states and installation parameters
- Four-sided and custom polygon detection ranges
- Rectangular and circular region editing with device synchronization
- Region configuration import and export
- Per-device event logs with retention settings
- Built-in and user-uploaded base map assets
- Independent configuration and runtime state for each device

See the [changelog][changelog] for the complete release notes.

## Documentation

- [Installation, configuration, and usage][docs]
- [Add-on repository and installation instructions][repository-readme]
- [Release history][changelog]
- [Report an issue][issues]

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
