# DFRobot mmWave Add-ons

[![GitHub Stars][stars-shield]][repository] [![Latest Release][release-shield]][releases] [![Home Assistant][ha-shield]][ha-website]

**English** | [中文](README_CN.md)

Home Assistant **Add-on repository** for DFRobot mmWave sensors. The primary add-on is a web console for discovering devices, viewing live status, configuring detection ranges and tag zones, managing base maps, and inspecting event logs. It currently supports **DFRobot C4004**.

---

## Requirements

- [Home Assistant OS][ha-installation] (or another Supervisor setup that supports Add-ons). Home Assistant Container **without** Supervisor cannot install this repository as an add-on.
- C4004 devices flashed with the ESPHome `dfrobot_c4004` component and added via the **ESPHome** integration (Native API entities).
- **MQTT** (optional but recommended): real-time trajectories and tag events. Without MQTT, the console still works in a degraded mode using HA entities and locally stored config.

Related firmware / map card docs: [Home_Assistant_C4004](https://github.com/cdjq/Home_Assistant_C4004) ([English README](https://github.com/cdjq/Home_Assistant_C4004/blob/main/README.md) / [Chinese README](https://github.com/cdjq/Home_Assistant_C4004/blob/main/README_CN.md)).

---

## Install the add-on repository

### One-click

[![Open your Home Assistant instance and show the add add-on repository dialog][ha-repository-badge]][ha-repository-url]

### Manual

1. Open Home Assistant → **Settings → Add-ons → Add-on store**.
2. Open the three-dot menu → **Repositories**.
3. Add:

   ```text
   https://github.com/jiaziui/mmWave_addons
   ```

4. Close the dialog, find **DFRobot mmWave**, then **Install**.
5. Configure options if needed (see below), **Start** the add-on, and open the UI via the sidebar panel or Ingress.

---

## Add-on: DFRobot mmWave

Multi-device mmWave management console for Home Assistant.

### Features

- Discover and bind C4004 devices from Home Assistant
- Overview metrics: device count, live count, tracked target / static counts
- Device detail: install info, parameters, soft reset
- Radar canvas: live targets (MQTT), detection range, tag zones
- Detection ranges: four-sided (rect), custom polygon, learned trajectory
- Tag zones: status / boundary / approach-depart
- Import / export custom range and region configs
- Per-device base maps (system + user uploads); layout sync to **mmWave Map** via MQTT
- Region event logs with retention policy
- Soft reset and factory reset (factory reset refreshes settings, clears local tag regions, keeps base maps)
- Works without MQTT for entity-backed basics; MQTT enables live trajectory and tag events

### Add-on options

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `42069` | Web service port (Ingress preferred) |
| `mqtt_host` | _(empty)_ | Broker host; empty disables MQTT live mode |
| `mqtt_port` | `1883` | Broker port |
| `mqtt_username` | _(empty)_ | Optional |
| `mqtt_password` | _(empty)_ | Optional |
| `mqtt_client_id` | `dfrobot-mmwave-addon` | MQTT client ID |

With MQTT configured, the backend subscribes to device bridge topics (trajectory, tag events, etc.). Without MQTT, HA entity reads and saved local config still work; live target points are hidden.

`mqtt_bridge.topic_prefix` on each device must match how the firmware was flashed (see C4004 ESPHome README).

### Documentation inside the add-on

| Doc | Content |
|-----|---------|
| [dfrobot_mmWave/DOCS.md](dfrobot_mmWave/DOCS.md) | Install, options, behaviour |
| [dfrobot_mmWave/README.md](dfrobot_mmWave/README.md) | Store listing blurb |
| [dfrobot_mmWave/CHANGELOG.md](dfrobot_mmWave/CHANGELOG.md) | Releases |
| [backend/README.md](dfrobot_mmWave/backend/README.md) | Backend architecture, storage, API, device profiles |

---

## Screenshots

### Overview

![DFRobot mmWave overview](resource/image.png)

### Device management

![DFRobot mmWave device management](resource/image2.png)

### Region management

![DFRobot mmWave region management](resource/image3.png)

---

## Compatibility

- Home Assistant OS (Supervisor)
- Architectures: `amd64`, `aarch64`, `armv7`
- Primary device: DFRobot C4004
- MQTT: optional for live trajectory / tag config / tag events

---

## Feedback

When opening an issue, include:

- Home Assistant and add-on versions
- CPU architecture
- C4004 firmware / ESPHome setup
- Relevant add-on log lines
- Steps to reproduce

Use [GitHub Issues][issues].

---

## Links

- [DFRobot][dfrobot]
- [Home Assistant installation][ha-installation]
- [Home Assistant add-ons][ha-addons]
- [C4004 ESPHome + mmWave Map](https://github.com/cdjq/Home_Assistant_C4004/blob/main/README.md)

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
[dfrobot]: https://www.dfrobot.com/
