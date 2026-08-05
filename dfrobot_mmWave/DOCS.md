# DFRobot mmWave

Web console add-on for **DFRobot C4004** mmWave sensors in Home Assistant: device discovery and binding, overview and detail pages, detection ranges, tag zones, base maps, and event logs.

## Installation

1. Add the [mmWave_addons](https://github.com/jiaziui/mmWave_addons) repository in **Settings → Add-ons → Add-on store → Repositories** (if you have not already).
2. Install **DFRobot mmWave**, then open its **Configuration** tab.
3. Set MQTT options if you need live trajectories and tag events (see below).
4. **Start** the add-on.
5. Open the UI from the sidebar (**DFRobot mmWave**) or via Ingress on the add-on page.

### Prerequisites

- Home Assistant OS with Supervisor
- C4004 flashed with ESPHome `dfrobot_c4004` and added through the **ESPHome** integration
- Optional MQTT broker for live trajectory / tag events

Firmware and Lovelace **mmWave Map** card: [Home_Assistant_C4004](https://github.com/cdjq/Home_Assistant_C4004).

## Configuration options

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `42069` | Web service port. Prefer Ingress; direct port mapping is optional. |
| `mqtt_host` | _(empty)_ | MQTT broker host. Leave empty to disable MQTT live mode. |
| `mqtt_port` | `1883` | MQTT broker port. |
| `mqtt_username` | _(empty)_ | Optional username. |
| `mqtt_password` | _(empty)_ | Optional password. |
| `mqtt_client_id` | `dfrobot-mmwave-addon` | Client ID used by the add-on. |

Match each device’s firmware `mqtt_bridge.topic_prefix` to the value used when flashing.

After changing options, restart the add-on.

## Data storage

- Device business data is stored in `/data/dfrobot_mmwave`, including bindings, saved device settings, regions, logs, and pending retained MQTT cleanup state. If the add-on is uninstalled and Home Assistant Supervisor is told to clear all data, this device data is removed.
- Uploaded user photos/base maps are stored in `/config/dfrobot_mmwave/base_maps/user` so Home Assistant and the mmWave Map card can still serve image files.
- On startup, legacy device data under `/config/dfrobot_mmwave` is migrated into `/data/dfrobot_mmwave`; uploaded images under `base_maps/user` are kept.
- There is no UI button or manual purge API for clearing all device data; uninstall cleanup relies on Supervisor-managed `/data`.

## MQTT behaviour

**With MQTT configured**

- The add-on subscribes to device bridge topics (trajectory, tag events, and related traffic).
- Overview, detail, and region pages can show live targets and live zone events.

**Without MQTT**

- The add-on still runs.
- Home Assistant entity data can be read.
- Saved regions, parameters, and event history remain available.
- Live target points are hidden (degraded mode).

## Soft reset vs factory reset

| UI entry | Effect |
|----------|--------|
| Device detail → **Restart device** | Soft reset. Does not clear local tag regions in the add-on. |
| Region management → **Factory reset** | Factory-resets the device, then refreshes settings in the console, clears local tag regions, and keeps base maps. |

## Typical usage

1. Open the console and go to **Devices** to scan / bind a C4004 already present in Home Assistant.
2. Complete initialization (install mode, height, detection mode) if prompted.
3. Use **Overview** for multi-device status, or open a device for parameters and radar view.
4. Use **Regions** to edit detection range, tag zones, and base maps.
5. Optionally open the Lovelace **mmWave Map** card; keep MQTT prefix and entity prefix aligned with the ESPHome config.

## Support

- [Add-on README](README.md)
- [Repository README](../README.md)
- [Changelog](CHANGELOG.md)
- [Backend reference](backend/README.md)
- [GitHub Issues](https://github.com/jiaziui/mmWave_addons/issues)
