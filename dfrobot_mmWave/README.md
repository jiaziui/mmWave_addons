# DFRobot mmWave

[![GitHub Stars][stars-shield]][repository] [![Latest Release][release-shield]][releases] [![DFRobot][dfrobot-shield]][dfrobot]

Home Assistant add-on: a web console for **DFRobot C4004** mmWave radar — discover and bind devices, configure detection ranges and tag zones, manage base maps, and view live status from the browser.

![DFRobot mmWave overview][screenshot]

## Features

- Discover and bind C4004 devices from Home Assistant
- Multi-device overview: device count, live count, tracked target / static counts
- Device detail: install info, parameters, soft reset
- Radar canvas: live targets (MQTT), detection range, tag zones
- Detection ranges: four-sided (rect), custom polygon, learned trajectory
- Tag zones: status / boundary / approach-depart
- Import / export custom ranges and region configs
- Per-device base maps and region names; retained MQTT sync to **mmWave Map**
- Region event logs with retention policy
- Soft reset and factory reset (factory reset refreshes settings, clears local tag regions, keeps base maps)
- Works without MQTT for entity-backed basics; MQTT enables live trajectory and tag events

## Breaking C4004 naming cutover

This release accepts only the new HA entity suffixes and Add-on fields. Upgrade the ESPHome firmware, Add-on, and mmWave Map together; then update external clients, automations, and dashboards.

| HA suffix | Add-on field |
| --- | --- |
| `live_count` | `liveCount` |
| `clear_live_count` | `clearLiveCount` (`POST .../actions/clear-live-count`) |
| `trk_led` / `occ_led` | `trkLed` / `occLed` |
| `real_time_report_interval` | `realTimeReportInterval` |
| `trajectory_generation_distance` | `trajectoryGenerationDistance` |
| `trajectory_lifetime` | `trajectoryLifetime` |
| `unoccupied_time` | `unoccupiedTime` |
| `frame_generate_count` | `frameGenerateCount` |

Old fields and routes are not migrated. Existing firmware MQTT topics and region storage values remain unchanged; the Add-on adds retained `state/region_metadata` for Map display names.

## Data storage and uninstall cleanup

- Device business data is stored in `/data/dfrobot_mmwave`: bindings, device configuration, regions, logs, and pending retained MQTT cleanup state. Home Assistant Supervisor removes this directory when the Add-on is uninstalled and **clear all data** is selected.
- Uploaded user photos/base maps stay in `/config/dfrobot_mmwave/base_maps/user` so the Lovelace mmWave Map card can keep loading images through Home Assistant.
- Legacy device data found in `/config/dfrobot_mmwave` is migrated to `/data/dfrobot_mmwave` on startup; `base_maps/user` is preserved.
- No custom clear-data button or manual purge API is exposed; uninstall cleanup relies on Supervisor-managed `/data`.

## Requirements

- Home Assistant OS with Supervisor (add-on support)
- C4004 flashed with ESPHome `dfrobot_c4004` and added via the **ESPHome** integration
- Network access between Home Assistant and the device
- MQTT broker details when live trajectory / tag events are needed (optional)

Without MQTT, discovery, saved configuration, regions, HA entity data, and event history still work; live target points are hidden.

Firmware and Lovelace map card: [Home_Assistant_C4004](https://github.com/cdjq/Home_Assistant_C4004).

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `42069` | Web service port (Ingress preferred) |
| `mqtt_host` | _(empty)_ | Broker host; leave empty to disable MQTT live mode |
| `mqtt_port` | `1883` | Broker port |
| `mqtt_username` | _(empty)_ | Optional |
| `mqtt_password` | _(empty)_ | Optional |
| `mqtt_client_id` | `dfrobot-mmwave-addon` | MQTT client ID |

Each device’s firmware `mqtt_bridge.topic_prefix` must match how it was flashed.

Region names are published after each successful Add-on save to `{topic_prefix}/dfrobot_c4004/{mqtt_key}/state/region_metadata` with QoS 1 and retain enabled. This lets a newly added mmWave Map card recover saved names without first opening the Add-on UI. The name metadata does not create region geometry; mmWave Map draws regions only from the firmware `state/multi_tag_config` snapshot. If the Add-on has no regions, the firmware region config / retained `multi_tag_config` must also be empty for the card to show no region overlays.

During the first successful device binding, the Add-on publishes an empty `command/multi_tag_config/set` payload (`hex: "0000"`) when MQTT is available. Firmware treats a zero-region payload as an internal clear-all-tags command, clearing old tag regions left from a previous use of the same ESP32 before the user starts configuring regions in the Add-on.

## Documentation

- [Installation, options, and behaviour][docs]
- [Add-on repository README][repository-readme]
- [Backend reference][backend-readme]
- [Changelog][changelog]
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
[docs]: DOCS.md
[changelog]: CHANGELOG.md
[backend-readme]: backend/README.md
