# DFRobot mmWave Backend

Maintainer reference for `dfrobot_mmWave/backend`: architecture, storage, HTTP/WebSocket API, and how to add a device model.

If this document conflicts with the code, the code wins. Start from:

- `src/index.ts`
- `src/config.ts`
- `src/config/storage.ts`
- `src/domain/mmwaveService.ts`
- `src/domain/mqttBridge.ts`
- `src/routes/devices.ts`
- `frontend/src/api/client.ts` (frontend contract)

Device MQTT / Native entity details outside this add-on: [设备通信接口.md](../设备通信接口.md).

---

## Table of contents

1. [Role and stack](#1-role-and-stack)
2. [Folder layout](#2-folder-layout)
3. [Configuration](#3-configuration)
4. [Data boundaries](#4-data-boundaries)
5. [Storage](#5-storage)
6. [Runtime memory](#6-runtime-memory)
7. [HTTP and WebSocket API](#7-http-and-websocket-api)
8. [MQTT appendix (C4004)](#8-mqtt-appendix-c4004)
9. [Add a device profile](#9-add-a-device-profile)
10. [Debugging and backup](#10-debugging-and-backup)

---

## 1. Role and stack

The backend is the Home Assistant add-on service layer. The first fully implemented profile is **C4004**.

It does five main things:

1. Discover mmWave devices from Home Assistant using per-model JSON profiles.
2. Read formal business state from Home Assistant native entities.
3. Subscribe to MQTT trajectory / tag-event / range topics and keep runtime state in memory.
4. Persist low-frequency device config, regions, and event logs locally.
5. Expose REST and WebSocket data for overview, detail, and region pages.

Boundary in one line:

- Low-frequency identity and config → local JSON
- Formal runtime state → Home Assistant entities
- High-frequency trajectory / tag events → memory only (logs persist on region state changes)

**Stack:** Node.js, TypeScript, Express, `ws`, `mqtt`, `pino`, Home Assistant REST API.

**Communication:** REST for page data and actions; WebSocket for refresh signals (2s polling fallback); MQTT for trajectory and tag events.

---

## 2. Folder layout

| Path | Role |
|------|------|
| `src/index.ts` | Startup; wires HA, storage, MQTT, service, HTTP/WS |
| `src/config.ts` | Add-on options, env, default storage directories |
| `src/config/storage.ts` | Binding index + per-device `config.json` |
| `src/config/deviceLogStorage.ts` | Event logs (JSONL) |
| `src/config/baseMapStorage.ts` | User base-map library |
| `../config/device/*.json` | One file per model (not under `backend/src`) |
| `src/domain/profiles/loadDeviceProfileDefinitions.ts` | Loads profile JSON |
| `src/domain/profiles/registry.ts` | Merges JSON + runtime adapters |
| `src/domain/profiles/builtinProfiles.ts` | C4004 runtime adapter |
| `src/domain/mmwaveService.ts` | Overview, detail, reset, factory-reset, config |
| `src/domain/mqttBridge.ts` | MQTT + in-memory trajectory / tag / range cache |
| `src/domain/runtimeCache.ts` | Runtime memory store |
| `src/domain/trajectory.ts` | Trajectory parsing |
| `src/routes/*.ts` | HTTP routes |

---

## 3. Configuration

Loaded from `src/config.ts`.

### Base

| Variable / option | Notes |
|-------------------|--------|
| `PORT` | HTTP port |
| `DEVICE_DATA_DIR` | Device/business persistence root (default `/data/dfrobot_mmwave`) |
| `USER_BASE_MAP_DIR` | User uploaded base-map directory (default `/config/dfrobot_mmwave/base_maps/user`) |
| `LEGACY_DATA_DIR` | Old `/config` device-data location used only for one-time migration/cleanup |
| `FRONTEND_DIST` | Built frontend path |
| `DEVICE_PROFILE_DIR` | Optional absolute override for `config/device` |

Default profile directory: plugin root `config/device` (copied into the image as `/app/config/device`).

### Home Assistant

Modes: `supervisor` (`http://supervisor/core/api`) or `standalone` (`HA_BASE_URL` / option `ha_base_url`).

Token priority: `HA_LONG_LIVED_TOKEN` → option `ha_long_lived_token` → `SUPERVISOR_TOKEN` → container token files.

### MQTT (add-on options)

`mqtt_host`, `mqtt_port`, `mqtt_username`, `mqtt_password`, `mqtt_client_id`.

If `mqtt_host` is empty, MQTT is disabled; the UI should degrade without live trajectory.

---

## 4. Data boundaries

### Home Assistant native entities (formal runtime)

Online status, presence, zone presence, people/target counts, zone moving/static counts, install parameters, track-related numbers, four-sided range (`range_x_*` / `range_y_*`).

### MQTT

`state/target_trajectory`, `state/tag_event`, retained Add-on map state (`state/base_map_layout`, `state/addon_detection_range`, `state/region_metadata`), and multi-tag / config-file-range / learned-trajectory-range command & result topics (see profile JSON and [§8](#8-mqtt-appendix-c4004)).

### Local JSON (low-frequency only)

Binding index, local config, MQTT routing, region config, event logs, log retention.

**Do not persist:** discovery status, zone snapshots, trajectory hex/points, MQTT/WS connection state, high-frequency zone toggles.

---

## 5. Storage

Four layers — do not mix them:

| Layer | Location | Lifetime | Contents |
|-------|----------|----------|----------|
| A. Model config | `config/device/*.json` | Shipped with add-on | Signatures, capabilities, MQTT suffixes |
| B. Device business data | `DEVICE_DATA_DIR` | Until add-on uninstall + clear data | Bindings, config, regions, logs, pending retained MQTT cleanup |
| B2. User base-map files | `USER_BASE_MAP_DIR` | HA config lifetime | Uploaded user photos/base maps |
| C. Runtime memory | `RuntimeCacheStore` / MQTT / WS | Lost on restart | Online, trajectory, tag overlays, learn status |
| D. Browser | `localStorage` / `sessionStorage` | Browser policy | Welcome-page flag, mock flag |

### Paths

Default device data directory: `/data/dfrobot_mmwave`. This is Supervisor-managed add-on data, so uninstalling the add-on and choosing **clear all data** removes device bindings, settings, regions, logs, and pending retained-topic cleanup state.

Default user base-map directory: `/config/dfrobot_mmwave/base_maps/user` (host path commonly `/homeassistant/dfrobot_mmwave/base_maps/user`). This keeps uploaded photos available to Home Assistant and the Lovelace mmWave Map card. Base-map image files are intentionally not part of the uninstall-required device-data cleanup.

Old device data under `/config/dfrobot_mmwave` is treated as legacy input only. On startup, known device files are migrated to `/data/dfrobot_mmwave` and removed from the legacy location; `base_maps/user` is preserved.

```text
<DEVICE_DATA_DIR>/
├── devices.json
├── pending-retained-topic-clears.json
└── <deviceId>/
    ├── config.json
    └── log/<YYYY>/<MM>/<DD>.jsonl

<USER_BASE_MAP_DIR>/
├── assets.json
└── <assetId>.png|jpg|webp
```

- Directory name = stable `device.id` (same as `devices.json`).
- Unbind removes the binding entry and `rm -rf <deviceId>/`.
- Legacy single-file storage is unused; ignore leftover `data.json`.

Model declarations (read-only at runtime):

```text
dfrobot_mmWave/config/device/<profileId>.json
```

### `devices.json`

Binding registry: `version`, `nextSequence`, and per device `id`, `deviceNo`, `haDeviceId`, `macAddress`, `prefix`, `mqttTopicPrefix`, `deploymentName`, `boundAt`, `updatedAt`.

Does **not** store online status, trajectory, region geometry, logs, or volatile display name/firmware.

### `<deviceId>/config.json`

Local operating config: `id`, `profileId`, `profileOverride`, HA/MQTT routing, `installInfo`, `detectionMode` (`1` = high sensitivity, `2` = static stable), `deviceSettings`, `logRetention`, `regionConfig`.

`regionConfig` (V2): coordinate / rangeBox, detection modes (`rect` / `learned` / `custom`), tag `regions[]`, `backgroundInstances`, `viewPreferences`, `syncState`.

Notes:

- Overall region is **not** in `regions[]` (UI + `zone1McuIo`).
- Factory reset clears `regions`, refreshes range/settings, **keeps** `backgroundInstances`.
- Counts and trajectory never go here.

### Event logs

Path: `<deviceId>/log/YYYY/MM/DD.jsonl` (calendar day in **Asia/Shanghai**).  
Appended on MQTT tag-event state changes (deduped). Retention via `logRetention` (`forever` / `limited` / `none`).

### User base maps

Global library under `USER_BASE_MAP_DIR`. Devices only store references in `backgroundInstances`. Deleting an asset does not auto-clean device instances. System maps are frontend static assets, not under `DEVICE_DATA_DIR`.

### Who writes disk

| Action | Writes |
|--------|--------|
| Discover (bound devices) | May update `devices.json` stable fields; memory refresh |
| Initialize | `devices.json` + create `config.json` |
| `PUT .../config` | Main write: settings / regions / retention; optional HA/MQTT apply |
| Factory reset | Update `config.json` + runtime cache |
| Tag event | Append JSONL (if retention allows) |
| User map upload/delete | `USER_BASE_MAP_DIR` |
| Unbind | Drop binding + delete `<deviceId>/` |

Config JSON uses temp-file then replace for safer writes.

`pending-retained-topic-clears.json` stores exact MQTT topics that must be cleared after an offline device unbind. The queue is flushed before current retained map states are republished on reconnect.

No custom clear-data button or manual purge API is exposed. Device-data cleanup relies on Home Assistant Supervisor removing `DEVICE_DATA_DIR` during add-on uninstall when **clear all data** is selected.

---

## 6. Runtime memory

Kept in memory only:

- HA discovery identity and online status
- Native zone / range snapshots
- Trajectory snapshot and points
- Tag-event overlays
- MQTT / WebSocket subscription state
- Learned-range runtime status

After restart: `devices.json` + `config.json` restore bindings/config; live points return only after new MQTT messages.

Factory reset must also refresh `RuntimeCacheStore.native.regionConfig` so APIs do not return stale regions.

Browser keys (unrelated to `DEVICE_DATA_DIR`): `dfrobot-mmwave-console-entered` (localStorage), `dfrobot_mmwave_local_mock` (sessionStorage).

---

## 7. HTTP and WebSocket API

- Base path: `/api`
- JSON bodies unless noted; base-map upload is `multipart/form-data`
- Success usually `{ ok: true }`; failure `{ ok: false, error }`
- Under HA Ingress, frontend uses `ingressAware()` for the prefix
- Mounted: `GET /api/health`, `/api/meta/*`, `/api/mmwave/*`, `WS /api/live/ws`
- Not mounted: `routes/rooms.ts`, `routes/live.ts` (stubs)

### Shared types (summary)

```ts
interface RangeBox { xMin: number; xMax: number; yMin: number; yMax: number; }

interface TrajectoryPoint {
  id: number; x: number; y: number;
  feature: "static" | "moving" | "unknown";
  speed?: number;
}

type RegionType =
  | "status_detection" | "noise" | "approach_depart" | "boundary" | "empty_tag";

// RegionOverlay: canvas runtime (meters). RegionConfigV2: persisted (cm for geometry).
// Full shapes: see frontend/src/api/client.ts and types/mmwave.ts
```

`detectionMode`: `1` → high sensitivity (`frame_generate_count=2`, `unoccupied_time=5`); `2` → static stable (`7` / `30`). Routes still accept legacy strings; prefer `1` / `2`.

Max 32 regions with unique `index`. Legacy configs without `version: 2` do not migrate regions (empty V2).

### Meta and health

```http
GET /api/meta/config
GET /api/health
```

`meta/config` includes `appVersion`, `port`, `mode`, `linked`, `mqttConfigured`, `mqttConnected`, `dataDir` (deprecated alias of `deviceDataDir`), `deviceDataDir`, `userBaseMapDir`, and `legacyDataDir`.

### WebSocket

```text
WS /api/live/ws
```

Client → server:

```json
{ "type": "subscribe", "scope": "overview" }
{ "type": "subscribe", "scope": "device", "deviceId": "<id>" }
```

Server → client: `subscribed`, `refresh` (re-fetch REST), `log_event`, `error`.  
Triggers: MQTT trajectory / tag / learned-range, HA `state_changed` for related entities. WS signals refresh only; full payloads stay on GET. Frontend reconnect ~2s.

### Devices

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/mmwave/devices/discover` | HA + profiles; refresh runtime; update binding fields. `502` if HA down |
| `GET` | `/api/mmwave/devices` | Known devices (incl. uninitialized) |
| `GET` | `/api/mmwave/overview` | Initialized only; metrics + cards |
| `GET` | `/api/mmwave/devices/:deviceId/detail` | Overlay, counts, `ioStates`, basics, actions, `learnedRange` |
| `GET` | `/api/mmwave/devices/:deviceId/config` | HA settings preferred + local region / retention |
| `PUT` | `/api/mmwave/devices/:deviceId/config` | See below |
| `GET` | `/api/mmwave/devices/:deviceId/logs/calendar` | `?year=&month=` |
| `GET` | `/api/mmwave/devices/:deviceId/logs` | `?date=&page=&pageSize=` |

**Detail `ioStates` (C4004):** IO1–IO6 map to `number.<prefix>_zone_N_mcu_io` and `binary_sensor.<prefix>_zone_N_presence`. Radar-wide `binary_sensor.<prefix>_presence` is not physical IO1.

**`PUT .../config`** optional fields (at least one): `deviceSettings` (alias `settings`), `regionConfig`, `logRetention`, `apply`.

```json
{
  "regionConfig": { "version": 2 },
  "deviceSettings": { "trkLed": true },
  "logRetention": { "mode": "limited", "value": 30, "unit": "day" },
  "apply": {
    "fourSidedRange": true,
    "regionMcuIo": false,
    "tagConfig": false,
    "customRange": false
  }
}
```

Behaviour:

- `deviceSettings`: write HA first, then `config.json`.
- `regionConfig`: usually local first then `apply`; **custom range** only persists after device ACK.
- `apply.fourSidedRange` / `regionMcuIo` / `tagConfig` / `customRange`: push to HA or MQTT as appropriate.
- Failed device sync does not roll back local write; `syncState` may be `pending`.
- Learning in progress blocks four-sided / custom sync (`409`).

Success: `{ ok, config, applyResult }` (`applied` | `failed` | `skipped`, optional `warnings`).  
Codes: `400`, `404`, `409`, `424` (HA unlinked), `502`.

### Actions

| Method | Path | Effect |
|--------|------|--------|
| `POST` | `.../actions/refresh` | Re-discover + detail → `{ ok, detail }` |
| `POST` | `.../actions/reset` | Soft reset; **keeps** local tag regions → `{ ok, detail }` |
| `POST` | `.../actions/clear-live-count` | HA clear button (C4004) → `{ ok, detail }` |
| `POST` | `.../actions/factory-reset` | Factory reset; pull range/settings; clear local `regions`; keep maps → `{ ok, config }` |
| `POST` | `.../actions/unbind` | Remove binding + device directory → `{ ok, devices }` |
| `POST` | `.../actions/initialize` | Bind (see body below) → `{ ok, device }` |
| `POST` | `.../actions/learned-range` | `{ "action": "start"|"stop"|"query" }` → `{ ok, learnedRange }` |

Initialize body:

```json
{
  "deviceNoMode": "auto" | "custom",
  "customDeviceNo": "2",
  "installHeightM": 1.8,
  "detectionMode": 1
}
```

Install height roughly `1.8…2.0`. Codes: `400`, `404`, `409` (duplicate device no), `424`, `502`.

Learned range: `start` needs three consecutive MQTT frames with `targetCount === 1`; mid-learn points are not stored; `query` success saves `learned` mode and points (`xUi = -xDevice`); failed query does not overwrite last good range.

### User base maps

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/mmwave/base-maps/user` | Asset list |
| `GET` | `/api/mmwave/base-maps/user/:assetId` | Image bytes |
| `PUT` | `/api/mmwave/base-maps/user/:assetId` | multipart `file` (+ optional `originalName`); PNG/JPEG/WebP ≤ 10MB |
| `DELETE` | `/api/mmwave/base-maps/user/:assetId` | Library only; does not clear device instances |

### Frontend call map

| Scenario | Calls |
|----------|--------|
| Startup | `fetchMeta` → discover / overview → WS `overview` |
| Bind | discover → initialize → refresh list |
| Detail | `fetchDeviceDetail` (+ config) → WS `device` |
| Save params / regions / map layout | `updateDeviceConfig` |
| Learn range / clear people / factory / unbind | matching action helpers |
| Map library | list / upload / delete; display via `userBaseMapUrl` |
| Logs | calendar → page; optional `log_event` |

---

## 8. MQTT appendix (C4004)

Full topic = `{mqttTopicPrefix}/dfrobot_c4004/{mqttKey}/{suffix}` (example prefix `c4004_0`, key `main`).  
Backend commands publish with QoS 1 and retain false. Add-on-owned Map state publishes with QoS 1 and retain true. Device `state/*` retain follows firmware.

| Suffix | Direction | Notes |
|--------|-----------|--------|
| `state/multi_tag_config` | D→B | Multi-tag state |
| `command/multi_tag_config/set` | B→D | From `apply.tagConfig` |
| `result/multi_tag_config/set` | D→B | Write result |
| `state/config_file_range` | D→B | Custom range state |
| `command/config_file_range/set` | B→D | From `apply.customRange` |
| `result/config_file_range/set` | D→B | Write result |
| `state/learned_trajectory_range` | D→B | Learned range state |
| `command/learned_trajectory_range/set` | B→D | Learn start/stop |
| `result/learned_trajectory_range/set` | D→B | Start/stop result |
| `command/learned_trajectory_range/query` | B→D | Query points |
| `result/learned_trajectory_range/query` | D→B | Query result |
| `state/target_trajectory` | D→B | Live trajectory (memory) |
| `state/tag_event` | D→B | Tag events + logs |
| `state/base_map_layout` | B→bus | Layout metadata (no image bytes), retained |
| `state/addon_detection_range` | B→bus | Add-on detection-range state, retained |
| `state/region_metadata` | B→bus | Add-on-owned region `id/index/label`, retained |

Without MQTT: HA basics still work; live trajectory and command/result flows degrade or are unavailable.

Subscription shape (any profile): `<mqttTopicPrefix>/<component>/<mqttKey>/<suffix>` from profile JSON. Match back via `topicPrefix + mqttKey` → cache under `device.id`.

---

## 9. Add a device profile

Prefer config-only discovery first. Add a runtime adapter only when the model needs detail, initialize, reset, factory-reset, or MQTT trajectory.

### Recognition

Profiles live in `config/device/<profileId>.json` (one model per file; filename should match `id`). Loaded at startup; override directory with `DEVICE_PROFILE_DIR`.

Priority: `metadata` > `marker` > `override` > `signature`. Do not rely on friendly names or requiring the model string inside the entity prefix.

`MmwaveProfileId` is a free `string` (not `unknown`). `MMWAVE_PROFILE_IDS` lists built-in runtimes only (`c4004`); discovery-only models do not need that array.

### Level A — discover only

Create `config/device/<id>.json` with `runtimeSupported: false` and matching `entitySignature` / hints / capabilities off. Device is found as `profileStatus: unsupported`; actions stay unsupported.

Example skeleton:

```json
{
  "id": "c4005",
  "displayName": "DFRobot C4005",
  "metadataHints": ["c4005", "dfrobot c4005"],
  "markerValues": ["c4005"],
  "runtimeSupported": false,
  "capabilities": {
    "supportsTrajectory": false,
    "supportsRegions": false,
    "supportsInitializeWorkflow": false,
    "supportsReset": false,
    "supportsFactoryReset": false,
    "supportsMqttBridge": false
  },
  "mqttTopics": { "component": "dfrobot_c4005" },
  "entitySignature": {
    "minScore": 3,
    "entities": [
      { "domain": "binary_sensor", "slug": "online" },
      { "domain": "binary_sensor", "slug": "presence" },
      { "domain": "sensor", "slug": "target_count" }
    ]
  }
}
```

Full capability example: `config/device/c4004.json`.

**Signature match:** entities look like `<domain>.<prefix>_<slug>`. Prefer `minScore` ≥ 2–3 (never 1). Recommended firmware marker: `text_sensor.<prefix>_device_profile` with state = profile id.

### Level B — full support

Also implement adapter methods in `contracts.ts` as needed (`resolveDeviceOnline`, `buildOverviewCard`, `buildDeviceDetail`, settings R/W, ranges, `initializeDevice`, `resetDevice`, `factoryResetDevice`, MQTT topic helpers), register in `registry.ts` `RUNTIME_ADAPTER_BY_ID`, then set `runtimeSupported: true`.

JSON capabilities merge with the adapter; implementing methods is still required for real behaviour. Soft reset ≠ factory reset (HA `button.<prefix>_factory_reset`; service waits briefly, then pulls range/settings, clears local tag regions, keeps maps).

MQTT topics must come from `mqttTopics` — do not hardcode new models in `mqttBridge.ts`.

Persisted profile fields per device: `profileId`, `profileSource`, `profileStatus`, `profileOverride`. Model JSON and `DEVICE_DATA_DIR` are separate paths.

### Checklist

Discover-only: new JSON, real slugs, sensible `minScore`, `runtimeSupported: false`, restart, lint/build.

Full: adapter + registry entry, capabilities aligned, MQTT from profile, Dockerfile still `COPY config/device`, lint/build.

Recommended order: export HA entities → JSON with `runtimeSupported: false` → confirm discovery → adapter + register → enable capabilities.

JSON changes load only on process/image restart. Old `deviceProfileCatalog.json` is gone — one file per model under `config/device/`.

---

## 10. Debugging and backup

### Backup

```text
<DEVICE_DATA_DIR>/devices.json
<DEVICE_DATA_DIR>/*/config.json
<DEVICE_DATA_DIR>/*/log/          # if audit history is needed
<USER_BASE_MAP_DIR>/              # uploaded user photos/base maps, optional
```

Model JSON ships with the add-on package.

### Symptoms

| Issue | Check |
|-------|--------|
| Empty device list | HA link; `config/device`; discover logs |
| Bound but no config | `<id>/config.json` vs `devices.json` id |
| Regions after factory still show old data | `regions` in file; stale process/cache |
| Missing logs | Shanghai date path; `logRetention`; unbound (directory deleted) |
| Missing maps | `base_maps/user` files vs `backgroundInstances` ids |
| Missing trajectory | MQTT host/connection; topic vs `mqttTopicPrefix`/`mqttKey`; expect memory, not JSON recovery |
| Profiles missing | `config/device` in package; `DEVICE_PROFILE_DIR`; restart |

### Dangerous manual edits

Deleting `<deviceId>/` without updating `devices.json` (or the reverse) leaves orphans. Renaming a device directory breaks binding and MQTT routing. Prefer `unbind` + `initialize`.

### Constraints for further work

- HA entities = formal business state; MQTT = trajectory / tag / range results
- Trajectory stays memory-only
- Soft reset ≠ factory reset
- Frontend should consume backend DTOs, not rebuild raw entity graphs
