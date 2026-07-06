# DFRobot mmWave Backend

This document is a backend-oriented reference for `dfrobot_mmWave/backend`.
Its purpose is to keep the business boundaries, storage rules, and API behavior clear so later frontend/API work can reuse a stable description instead of repeatedly reading the whole codebase.

If this document conflicts with the code, the code wins. Read these files first:

- `src/index.ts`
- `src/config.ts`
- `src/config/storage.ts`
- `src/domain/mmwaveService.ts`
- `src/domain/mqttBridge.ts`
- `src/routes/devices.ts`

## 1. Backend Role

The backend is the service layer of the Home Assistant add-on.
The first implemented device profile is `C4004`.

The backend currently does four main things:

1. Discover mmWave devices from Home Assistant.
2. Read formal business state from Home Assistant native entities.
3. Subscribe to MQTT trajectory messages and keep them in memory.
4. Provide REST and WebSocket data for the frontend overview and detail pages.

One-line boundary:

- Low-frequency identity and config go to local JSON.
- Formal runtime state comes from Home Assistant entities.
- High-frequency trajectory data stays in memory only.

## 2. Technology Stack

- Node.js
- TypeScript
- Express
- `ws`
- `mqtt`
- `pino`
- Home Assistant REST API

Communication model:

- REST for initial page data and actions
- WebSocket for periodic live refresh
- MQTT for high-frequency trajectory payloads

## 3. Folder Responsibilities

- `src/index.ts`
  - startup entry
  - assembles `HaClient`, `DeviceStorage`, `MqttBridge`, `MmwaveService`
  - starts HTTP and WebSocket

- `src/config.ts`
  - reads add-on options and env vars
  - resolves HA and MQTT config
  - defines the default storage root

- `src/config/storage.ts`
  - local device persistence
  - per-device directory and JSON read/write
  - low-frequency snapshot throttling

- `src/domain/c4004Profile.ts`
  - C4004 entity mapping and discovery adaptation

- `src/domain/mmwaveService.ts`
  - core aggregation layer
  - overview, detail, refresh, reset logic

- `src/domain/mqttBridge.ts`
  - MQTT connection management
  - topic subscription
  - in-memory trajectory cache

- `src/domain/trajectory.ts`
  - trajectory payload parsing

- `src/routes/*.ts`
  - HTTP API routes

## 4. Configuration

Configuration is loaded from `src/config.ts`.

### 4.1 Base Config

- `PORT`
- `DATA_DIR`
- `FRONTEND_DIST`

Default behavior:

- Default persistence root is `/homeassistant/dfrobot_mmwave`
- If the directory does not exist, backend creates it automatically
- If `DATA_DIR` is explicitly set, it overrides the default

### 4.2 Home Assistant Config

Two modes are supported:

- `supervisor`
  - uses `http://supervisor/core/api`
- `standalone`
  - uses `HA_BASE_URL` or add-on option `ha_base_url`

Token priority:

1. `HA_LONG_LIVED_TOKEN`
2. add-on option `ha_long_lived_token`
3. `SUPERVISOR_TOKEN`
4. container environment token files

### 4.3 MQTT Config

Supported add-on options:

- `mqtt_host`
- `mqtt_port`
- `mqtt_username`
- `mqtt_password`
- `mqtt_client_id`

If `mqtt_host` is not configured, MQTT is treated as disabled and the frontend should enter degraded mode without live trajectory points.

## 5. Data Boundaries

### 5.1 Home Assistant Native Entities

The following data should be treated as formal runtime state from HA native entities:

- online status
- presence
- zone presence
- `people_count`
- `target_count`
- all zone moving/static counts
- install mode and installation parameters
- track-related numeric parameters

### 5.2 MQTT

MQTT is currently used for:

- `.../state/target_trajectory`

Its role:

- receive the latest trajectory payload
- parse it into target points
- expose live point data to overview/detail rendering

### 5.3 Local JSON

Local JSON stores only low-frequency recoverable data:

- device identity
- binding info
- MQTT routing info
- region config
- last low-frequency zone summary

Local JSON does not store:

- trajectory hex
- parsed target points
- MQTT connection state
- WebSocket push state
- high-frequency zone toggles

## 6. Current Storage Layout

Storage now uses one directory per device.

Root directory:

```text
/homeassistant/dfrobot_mmwave
```

Per-device directory:

```text
/homeassistant/dfrobot_mmwave/<deviceId>/
```

Fixed files inside each device directory:

```text
device.json
data.json
```

Notes:

- Legacy storage data is not migrated
- Old single-file storage is not used anymore
- Directory name uses the current stable `device.id`

### 6.1 `device.json`

Purpose: low-frequency device metadata and configuration.

Fields:

- `id`
- `profileId`
- `haDeviceId`
- `name`
- `model`
- `manufacturer`
- `firmwareVersion`
- `prefix`
- `mqttTopicPrefix`
- `mqttKey`
- `macAddress`
- `binding`
- `regionConfig`

### 6.2 `data.json`

Purpose: low-frequency recoverable runtime summary.

Fields:

- `discovery`
- `lastZoneSnapshot`

### 6.3 Combined Runtime Object

The service layer still works with full `StoredMmwaveDevice`, but it is now composed from two files instead of mapping directly to one JSON file.

Internal persistence split types:

- `StoredDeviceMetaFile`
- `StoredDeviceDataFile`

## 7. Write Strategy

### 7.1 Discovery Write

`replaceFromDiscovery()` will:

- generate stable `device.id`
- rewrite `device.json`
- initialize or repair `data.json`
- remove stale device directories that were not rediscovered

### 7.2 Runtime Summary Write

`updateRuntimeState()` only persists low-frequency changes:

- `regionConfig` into `device.json`
- `discovery` and `lastZoneSnapshot` into `data.json`

### 7.3 Throttling

`lastZoneSnapshot` uses throttled writes:

- minimum interval: 5 minutes
- identical summary: no rewrite
- trajectory changes never trigger file writes

## 8. Runtime Memory Model

High-frequency runtime state stays in memory:

- latest `TrajectorySnapshot`
- parsed target point list
- MQTT connection state
- WebSocket subscription state

Trajectory source of truth:

- `MqttBridge.snapshots`

After backend restart:

- region config and last zone summary can be restored from JSON
- old trajectory points are not restored
- live points appear only after new MQTT messages arrive

## 9. REST API

Base routes:

- `GET /api/health`
- `GET /api/meta/config`
- `GET /api/mmwave/devices/discover`
- `GET /api/mmwave/devices`
- `GET /api/mmwave/overview`
- `GET /api/mmwave/devices/:deviceId/detail`
- `POST /api/mmwave/devices/:deviceId/actions/reset`
- `POST /api/mmwave/devices/:deviceId/actions/refresh`

Behavior notes:

- overview/detail DTOs are already frontend-oriented
- frontend should not rebuild raw HA entities on its own
- reset/refresh stay in service layer, not in frontend logic

## 10. WebSocket

WebSocket endpoint:

```text
/api/live/ws
```

Current subscription model:

- overview scope
- single-device detail scope

Publish interval:

- every 2 seconds after subscription

Current WebSocket is a periodic push model, not a pure event-stream model.

## 11. Current MQTT Subscription Rule

The MQTT bridge subscribes per device using:

```text
<mqttTopicPrefix>/dfrobot_c4004/<mqttKey>/state/target_trajectory
```

Matching logic:

- topic is parsed first
- backend matches `topicPrefix + mqttKey` back to stored device info
- matched snapshot is cached in memory under `device.id`

## 12. Recommended Frontend Assumptions

When writing frontend code, assume:

- overview statistics come from backend aggregated DTOs
- detail page receives ready-to-render chart layers and counts
- trajectory can be absent even when device data exists
- absence of MQTT must degrade gracefully, not fail the page

## 13. Debugging Tips

If stored files are not appearing where expected, check in this order:

1. `src/config.ts` resolved `dataDir`
2. runtime log line on backend startup
3. whether `DATA_DIR` env overrides the default
4. whether device discovery actually completed

If live trajectory is missing, check:

1. MQTT host is configured
2. backend connected to broker
3. topic matches stored `mqttTopicPrefix` and `mqttKey`
4. device detail page is reading live memory snapshot rather than expecting JSON recovery

## 14. Guidance For Later AI Code Generation

When using AI to continue backend or frontend work, keep these constraints explicit:

- Home Assistant native entities are the formal source of business state
- MQTT is only for trajectory-style live payloads
- high-frequency trajectory must stay memory-only
- storage root is `/homeassistant/dfrobot_mmwave`
- each device uses `<deviceId>/device.json` and `<deviceId>/data.json`
- frontend should consume backend DTOs directly instead of rebuilding entity graphs
