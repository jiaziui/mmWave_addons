# DFRobot mmWave Add-on

DFRobot mmWave is a Home Assistant add-on that provides a web console for mmWave sensor devices.

Current implementation focuses on:

- welcome page
- device overview
- device detail
- Home Assistant device discovery
- optional MQTT trajectory subscription

## Features

- Multi-device overview dashboard
- Device detail panel with coordinate view
- Region and target visualization
- Device refresh and reset actions
- Local low-frequency device persistence
- MQTT-enabled live trajectory mode

## Configuration

This add-on currently supports the following options:

- `port`
  - Web service port
  - Default: `42069`

- `mqtt_host`
  - MQTT broker host
  - Leave empty to disable MQTT live trajectory mode

- `mqtt_port`
  - MQTT broker port
  - Default: `1883`

- `mqtt_username`
  - Optional MQTT username

- `mqtt_password`
  - Optional MQTT password

- `mqtt_client_id`
  - MQTT client ID used by the add-on
  - Default: `dfrobot-mmwave-addon`

## Behavior

When MQTT is configured:

- the backend subscribes to device trajectory topics
- live target points are available in the overview and detail pages

When MQTT is not configured:

- the add-on still works
- Home Assistant entity data is still available
- live target points are hidden and the UI enters degraded mode

## Storage

Default backend storage root:

```text
/homeassistant/dfrobot_mmwave
```

Per-device files:

```text
/homeassistant/dfrobot_mmwave/<deviceId>/device.json
/homeassistant/dfrobot_mmwave/<deviceId>/data.json
```

Storage rules:

- `device.json` stores low-frequency device identity and region config
- `data.json` stores discovery state and last zone summary
- live trajectory data is memory-only and not persisted

## Notes

- Current primary supported profile is `C4004`
- Device management and region management pages are still placeholder pages in this revision
- High-frequency MQTT trajectory data is not restored after backend restart
