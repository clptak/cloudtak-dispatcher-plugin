# CloudTAK Dispatcher Plugin

A dispatcher plugin for [CloudTAK](https://github.com/dfpc-coe/CloudTAK) — create and manage
incidents on the map, organize them under named **Events**, assign responders, and notify them
via mission chat and direct GeoChat.

## Modes

The plugin auto-detects its environment on load:

- **Standalone** (no external dependency) — Events and Incidents are stored server-side in
  CloudTAK's own database and shared live across every dispatcher on that CloudTAK. An **Event**
  (e.g. `2025-FESTIVAL`) is tied 1:1 to a DataSync feed and holds many Incidents. Incidents
  persist through close (and can be reopened); they are removed only when the Event is nuked.
- **TAK-CAD** — if the TAK-CAD TAK Server plugin is detected, the full CAD UI (Vehicles,
  Personnel, incident types/roles) lights up on top of the standalone capabilities.

## Layout

- `plugin/` — the CloudTAK web plugin (Vue 3 / TypeScript), discovered and bundled by CloudTAK's
  Vite build into `web/plugins/`.
- `server/` — CloudTAK API route files copied into CloudTAK's `api/routes/`:
  - `plugin-dispatcher.ts` — the standalone Events/Incidents store (CloudTAK Postgres) + CRUD
    endpoints under `/api/dispatcher/…`.
  - `plugin-takcad.ts` — a server-side proxy to the TAK-CAD TAK Server plugin (and a keyless
    Nominatim geocode helper), used only in TAK-CAD mode.

## Install

Installed via the **infra-TAK** console's CloudTAK Plugins marketplace, which clones this repo,
copies `plugin/` into CloudTAK's `web/plugins/` and `server/` into `api/routes/`, then rebuilds
the CloudTAK API image so the plugin is baked into the Vite bundle and the routes are loaded.

## Requirements

- CloudTAK 13.2+

## License

Proprietary © takwerx. All rights reserved.
