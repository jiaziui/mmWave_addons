# DFRobot mmWave Add-on

Home Assistant add-on for the DFRobot mmWave control platform.

This add-on provides a web console for mmWave devices, with a current focus on C4004-based device discovery, overview, detail display, and optional MQTT trajectory access.

## Included Modules

- `frontend`: React + Vite web UI
- `backend`: Express + WebSocket service
- `rootfs`: add-on runtime scripts
- `config.yaml`: Home Assistant add-on manifest
- `Dockerfile`: add-on image build definition

## Current Capabilities

- Welcome page and 3-item sidebar navigation
- Device overview page with aggregated metrics
- Device detail page with radar canvas, IO state, and parameter panel
- Home Assistant entity discovery and device persistence
- Optional MQTT trajectory subscription with graceful degradation when MQTT is not configured

## Documentation

- Add-on usage and configuration: `DOCS.md`
- Backend business and storage notes: `backend/README.md`
- Project-level overview: `../README.md`

## Local Development

```bash
npm install
npm run build
```

Backend uses Home Assistant credentials from the add-on runtime or environment variables.
