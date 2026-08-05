# Changelog

## Unreleased - Breaking C4004 naming cutover

- Replaced the public people-count contract with `live_count` / `liveCount` and `clear_live_count` / `clearLiveCount`.
- Renamed LED and timing/distance settings to `trkLed`, `occLed`, `realTimeReportInterval`, `trajectoryGenerationDistance`, `trajectoryLifetime`, `unoccupiedTime`, and `frameGenerateCount`.
- Replaced the clear action with `POST /api/mmwave/devices/:deviceId/actions/clear-live-count`; the old route is no longer available.
- Updated entity discovery, storage, snapshots, mocks, REST types, and bilingual UI terminology. Existing stored legacy settings are not migrated.
- Firmware, Add-on, and mmWave Map must be upgraded in the same maintenance window. Existing firmware MQTT topics and region storage values are unchanged.
- Added retained QoS 1 `state/region_metadata` so mmWave Map restores Add-on region names on first load and updates them without a page refresh; offline unbind cleanup is retried after reconnect.
- Moved device/business persistence from legacy `/config/dfrobot_mmwave` to Supervisor-managed `/data/dfrobot_mmwave` so uninstall + clear-data removes device bindings, settings, regions, logs, and retained-topic cleanup queues. Uploaded user base-map images remain in `/config/dfrobot_mmwave/base_maps/user`. No custom clear-data button or manual purge API is exposed.

## 1.0.0

### Initial Release

DFRobot mmWave is a Home Assistant add-on for managing and monitoring DFRobot millimeter-wave radar devices. This initial release focuses on the DFRobot C4004 and provides a complete interface for device setup, real-time monitoring, detection range configuration, region management, and event history.

### Features

#### Device Management

- Discover C4004 devices available in Home Assistant.
- Manage multiple C4004 devices from one add-on.
- Initialize devices with automatic or custom device numbers.
- Configure device names, deployment locations, installation methods, and installation parameters.
- View device type and online or offline status.
- Refresh device status, soft-reset (restart) devices, view device details, and unbind devices.
- Factory-reset a device from region management: refresh detection range and parameters from the device, clear local tag regions, and keep base maps.

#### Device Overview

- View all managed devices on one page.
- View total device count, total people count, moving people count, and static people count.
- View the detection area, configured regions, people count, and target locations for each device.
- Open a device directly from the overview for more detailed information.

#### Real-time Radar Monitoring

- Display target positions and movement in a radar coordinate system.
- Update target trajectories in real time while people are detected (MQTT).
- Clear displayed targets when the detection area becomes empty.
- Continue displaying available device and region information when trajectory data is temporarily unavailable.

#### Device Details

- View moving and static people counts for the selected device.
- View IO1 through IO6 linkage states.
- View installation mode, installation height, reporting interval, trajectory distance, trajectory retention time, confirmation frames, and unmanned time.
- View the currently active detection range type.
- Configure trajectory indicators, motion indicators, and supported device parameters.
- Soft-reset (restart) the selected device or open its region configuration page.

#### Detection Range Configuration

- Configure and apply a four-sided detection range.
- Draw and apply a custom polygon detection range.
- Learn a detection range from trajectory.
- Add, undo, clear, and confirm custom range points.
- Import and export custom detection ranges using `.ini` files.
- Display the active detection range on the overview, details, and region management pages.

#### Region Management

- Display a fixed Overall Region representing the complete device detection range.
- Create and manage up to 32 tag regions for each device.
- Support status detection, boundary detection, approach/away, noise, and empty tag regions.
- Support rectangular and circular regions.
- Move, resize, show, hide, edit, and delete regions on the coordinate canvas.
- Configure IO2 through IO6 for status detection regions.
- Configure the MCU-side IO for the Overall Region and supported status regions.
- Prevent multiple regions from using the same IO channel.
- Synchronize all configured regions to the selected device.
- Factory-reset the device from this page when supported.

#### Region Import and Export

- Export tag region configurations as `.ini` files.
- Import `.ini` files to add or update multiple regions at once.
- Preserve region names, indexes, types, shapes, IO indexes, coordinates, and dimensions.
- Validate imported configurations before applying them.

#### Region Status and Events

- Display moving, static, and total people counts for status detection regions.
- Display enter and exit events for boundary regions.
- Display approach and away events for approach/away regions.
- Update the corresponding region immediately when its state changes.
- Keep data from different devices separated when multiple devices are online.

#### Device Event Logs

- Record region state changes for each device.
- View historical events by year, month, and day.
- View event time, device name, deployment location, region name, region type, and event details.
- Browse logs with pagination.
- View saved logs even while a device is offline.
- Choose permanent retention, limited retention by day/week/month/year, or no retention.
- Automatically clean up logs that exceed the selected retention period.

#### Base Map Management

- Use built-in furniture and room images as coordinate canvas references.
- Upload PNG, JPEG, and WebP images to the user asset library.
- Add images to the selected device canvas.
- Move, resize, show, hide, and remove images from the canvas.
- Save independent base map layouts for different devices.
- Delete uploaded user images that are no longer required.
- Sync base map layout geometry (not image binaries) for use with the Lovelace mmWave Map card when MQTT is configured.

#### Console UI

- Show the welcome page only on first visit; later refreshes open the console directly.
- Collapsible sidebar; adjusted page title bars and region management header.
- Centered top toast notifications that dismiss after a short delay.

#### Offline and Multi-device Support

- Keep each device's settings, regions, detection range, base maps, and logs independent.
- Switch between devices without mixing their configurations or real-time information.
- View the latest saved configuration and historical logs while a device is offline.
- Remove one device without affecting the configuration or history of other devices.
- Works without MQTT for entity-backed basics; MQTT enables live trajectory and tag events.
