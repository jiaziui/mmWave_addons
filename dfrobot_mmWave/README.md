# DFRobot mmWave Add-on

Home Assistant add-on skeleton for the DFRobot mmWave control platform.

## Stack

- `frontend`: React + Vite
- `backend`: Express + WebSocket
- `rootfs` / `config.yaml` / `Dockerfile`: Home Assistant add-on packaging

## Features in this revision

- Welcome page and 3-item sidebar navigation
- Device overview with aggregated metrics
- Device detail page with radar canvas, IO status, and parameter panel
- Home Assistant device discovery and persisted device inventory
- Optional MQTT trajectory subscription with graceful degradation when MQTT is not configured

## Local Development

```bash
npm install
npm run build
```

Backend uses Home Assistant credentials from the add-on runtime or environment variables.
