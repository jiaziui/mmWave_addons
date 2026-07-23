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

Related docs:

- `README_API.md` — frontend-facing REST API contract
- `README_ADD_DEVICE_PROFILE.md` — how to add a new device model
- `README_STORAGE.md` — data directories, file schemas, and API↔storage mapping for maintainers

## 1. Backend Role

The backend is the service layer of the Home Assistant add-on.
The first fully implemented device profile is `C4004`.

The backend currently does five main things:

1. Discover mmWave devices from Home Assistant using per-model JSON profiles.
2. Read formal business state from Home Assistant native entities.
3. Subscribe to MQTT trajectory / tag-event / range topics and keep runtime state in memory.
4. Persist low-frequency device config, regions, and event logs locally.
5. Provide REST and WebSocket data for the frontend overview, detail, and region pages.

One-line boundary:

- Low-frequency identity and config go to local JSON.
- Formal runtime state comes from Home Assistant entities.
- High-frequency trajectory / tag events stay in memory only (logs are persisted when state changes).

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
- WebSocket for event-triggered live refresh, with polling as fallback
- MQTT for high-frequency trajectory and tag-event payloads

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

- `../config/device/*.json` (plugin root, not under `backend/src`)
  - one file per device model, e.g. `c4004.json`
  - metadata hints, marker values, entity signatures, capabilities, MQTT topic rules
  - loaded by `src/domain/profiles/loadDeviceProfileDefinitions.ts`

- `src/domain/profiles/registry.ts`
  - merges JSON definitions with runtime adapters
  - metadata / marker / override / entity signature matching

- `src/domain/profiles/builtinProfiles.ts`
  - currently implemented runtime profile adapters (`c4004`)

- `src/domain/mmwaveService.ts`
  - core aggregation layer
  - overview, detail, refresh, soft reset, factory reset, config update

- `src/domain/mqttBridge.ts`
  - MQTT connection management
  - topic subscription
  - in-memory trajectory / tag-event / range result cache

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
- `DEVICE_PROFILE_DIR` (optional override for `config/device`)

Default behavior:

- Default persistence root is `/homeassistant/dfrobot_mmwave`
- If the directory does not exist, backend creates it automatically
- If `DATA_DIR` is explicitly set, it overrides the default
- Device profile JSON defaults to plugin `config/device`

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
- four-sided range numbers (`range_x_*` / `range_y_*`)

### 5.2 MQTT

MQTT is currently used for:

- `.../state/target_trajectory`
- `.../state/tag_event`
- multi-tag config / config-file-range / learned-trajectory-range command & result topics (see profile JSON)

### 5.3 Local JSON

Local JSON stores only low-frequency recoverable data:

- device id and binding index
- local configuration
- MQTT routing info
- region config
- event logs (`log/YYYY/MM/DD.jsonl`)
- log retention policy

Local JSON does not store:

- discovery status
- zone snapshots
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
config.json
log/YYYY/MM/DD.jsonl
```

Notes:

- Legacy storage data is not migrated
- Old single-file storage is not used anymore
- Directory name uses the current stable `device.id`
- `devices.json` is a binding index with stable device routing fields

Device model declarations (separate from dataDir):

```text
dfrobot_mmWave/config/device/<profileId>.json
```

### 6.1 `config.json`

Purpose: local device configuration and backend routing data required to operate the device.

Fields:

- `id`
- `profileId`
- `profileOverride`
- `haDeviceId`
- `macAddress`
- `deploymentName`
- `prefix`
- `mqttTopicPrefix`
- `mqttKey`
- `installInfo`
- `detectionMode`
- `deviceSettings`
- `regionConfig`
- `logRetention`

`detectionMode` is numeric:

```text
1 = high sensitivity
2 = static stable
```

### 6.2 Combined Runtime Object

The service layer still works with full `StoredMmwaveDevice`, but it is now composed from `config.json`, live HA discovery, runtime cache, and the lightweight binding index.

### 6.3 `devices.json`

Purpose: stable binding index and quick device list metadata.

Fields:

- `version`
- `nextSequence`
- `devices[].id`
- `devices[].deviceNo`
- `devices[].haDeviceId`
- `devices[].macAddress`
- `devices[].prefix`
- `devices[].mqttTopicPrefix`
- `devices[].deploymentName`
- `devices[].boundAt`
- `devices[].updatedAt`

It intentionally does not duplicate volatile HA-discovered display details such as name, model, manufacturer, or firmware.

## 7. Write Strategy

### 7.1 Discovery Write

`replaceFromDiscovery()` will:

- generate stable `device.id`
- rewrite `config.json`
- remove stale device directories that were not rediscovered

### 7.2 Runtime State

Runtime state is not written to JSON.

- HA discovery identity and status go to `RuntimeCacheStore`
- HA native zone/range snapshots go to `RuntimeCacheStore`
- MQTT trajectory / tag-event snapshots go to `RuntimeCacheStore`

Only explicit device configuration changes should rewrite `config.json`.

### 7.3 Factory Reset

`POST /api/mmwave/devices/:deviceId/actions/factory-reset`:

1. Press HA `button.<prefix>_factory_reset`
2. Wait 500ms
3. Pull range box and device settings from HA into local storage
4. Clear local `regionConfig.regions` (Overall Region remains UI + `zone1McuIo`)
5. Keep `backgroundInstances`
6. Do **not** push old tag/custom range config back to the device
7. Update `RuntimeCacheStore.native.regionConfig` so the returned config is not stale

Soft reset remains `actions/reset` and does not clear local tag regions.

## 8. Runtime Memory Model

Runtime state stays in memory:

- HA discovery identity and online status
- latest native zone snapshot
- latest `TrajectorySnapshot`
- parsed target point list
- tag-event overlays
- MQTT connection state
- WebSocket subscription state
- learned-range runtime status

After backend restart:

- `config.json` and `devices.json` restore device configuration and binding
- online status, zone snapshots, identity details, and trajectory are empty until HA/MQTT refresh
- live points appear only after new MQTT messages arrive

## 9. REST API

Base routes (see `README_API.md` for full contract):

- `GET /api/health`
- `GET /api/meta/config`
- `GET /api/mmwave/devices/discover`
- `GET /api/mmwave/devices`
- `GET /api/mmwave/overview`
- `GET /api/mmwave/devices/:deviceId/detail`
- `GET /api/mmwave/devices/:deviceId/config`
- `PUT /api/mmwave/devices/:deviceId/config`
- `GET /api/mmwave/devices/:deviceId/logs/calendar`
- `GET /api/mmwave/devices/:deviceId/logs`
- `POST /api/mmwave/devices/:deviceId/actions/refresh`
- `POST /api/mmwave/devices/:deviceId/actions/reset`
- `POST /api/mmwave/devices/:deviceId/actions/factory-reset`
- `POST /api/mmwave/devices/:deviceId/actions/unbind`
- `POST /api/mmwave/devices/:deviceId/actions/initialize`
- `POST /api/mmwave/devices/:deviceId/actions/learned-range`
- `GET|PUT|DELETE /api/mmwave/base-maps/user...`

Behavior notes:

- overview/detail DTOs are already frontend-oriented
- frontend should not rebuild raw HA entities on its own
- reset / factory-reset / refresh stay in service layer, not in frontend logic

## 10. WebSocket

WebSocket endpoint:

```text
/api/live/ws
```

Current subscription model:

- overview scope
- single-device detail scope

Push behavior:

- The backend subscribes to Home Assistant `state_changed` events.
- Changes to presence / zone entities are routed by HA device id.
- MQTT tag events and learned-range updates also notify subscribed scopes.
- Frontend polling remains at 2 seconds as a fallback for reconnects and missed events.

## 11. Current MQTT Subscription Rule

The MQTT bridge subscribes per device through the resolved profile.
Topic parts come from `config/device/<profileId>.json`:

```text
<mqttTopicPrefix>/<profile.mqttTopics.component>/<mqttKey>/<suffix>
```

For the current C4004 profile trajectory resolves to:

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
- factory-reset response `config` should replace local region/parameter state immediately

## 13. Debugging Tips

If stored files are not appearing where expected, check in this order:

1. `src/config.ts` resolved `dataDir`
2. runtime log line on backend startup
3. whether `DATA_DIR` env overrides the default
4. whether device discovery actually completed

If profiles are missing:

1. confirm `config/device/*.json` exists in the add-on package
2. check `DEVICE_PROFILE_DIR`
3. restart backend after editing JSON

If live trajectory is missing, check:

1. MQTT host is configured
2. backend connected to broker
3. topic matches stored `mqttTopicPrefix` and `mqttKey`
4. device detail page is reading live memory snapshot rather than expecting JSON recovery

## 14. Guidance For Later AI Code Generation

When using AI to continue backend or frontend work, keep these constraints explicit:

- Home Assistant native entities are the formal source of business state
- MQTT is for trajectory / tag-event / range command result payloads
- high-frequency trajectory must stay memory-only
- storage root is `/homeassistant/dfrobot_mmwave`
- each device uses `<deviceId>/config.json`
- device model declarations live in `config/device/*.json`
- runtime state uses `RuntimeCacheStore`, not JSON files
- frontend should consume backend DTOs directly instead of rebuilding entity graphs
- soft reset ≠ factory reset
