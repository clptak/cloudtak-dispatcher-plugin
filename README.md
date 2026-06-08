# CloudTAK Dispatcher Plugin

A dispatcher plugin for [CloudTAK](https://github.com/dfpc-coe/CloudTAK) — create and manage
incidents on the map, organize them under named **Events**, assign responders, and notify them
via mission chat and direct GeoChat.

It runs **route-free**: a pure web bundle with **no files added to CloudTAK's `api/routes/`**
and no API image rebuild. All shared state lives on CloudTAK's native DataSync (mission) APIs.
See [docs/ROUTE-FREE-STANDALONE.md](docs/ROUTE-FREE-STANDALONE.md) for the design.

## How it works

An **Event** (e.g. `2025-FESTIVAL`) is a DataSync **mission/feed**; its dispatcher metadata
(display name, incident-number prefix, active/archived) lives in the mission's `keywords`.
Each **Incident** is a structured record stored as a mission-**log** entry (`DISP|<uid>|<json>`)
plus a sanitized CoT marker on the feed. Because Events and Incidents ride the shared mission,
the board is live across every dispatcher subscribed to that feed. Incidents persist through
close (and can be reopened) and age out with the feed's mission-log retention (30 days).

Address autocomplete/reverse-geocode uses **OpenRouteService** through CloudTAK's built-in
**Plugin Proxy** (no `api/routes` and no CSP/nginx change). An admin enables it under
**Admin → Config → "Plugin Proxy"** and whitelists `https://api.openrouteservice.org`; set
your ORS key in `plugin/lib/takcad-client.ts` (`ORS_API_KEY`). Without a key or whitelist
entry, geocoding simply returns nothing and operators place incidents with **pick on map**
and a free-text address. (The key ships in the web bundle — use a rate-limited ORS key.)

## Layout

- `plugin/` — the CloudTAK web plugin (Vue 3 / TypeScript), discovered and bundled by CloudTAK's
  Vite build into `web/plugins/`. This is the entire deliverable.
- `server/` — **obsolete, retained as no-op stubs.** Both files now register zero endpoints and
  the directory is safe to delete (`git rm -r server/`). Kept only so an older installer that
  still copies `server/*.ts` into `api/routes/` won't break.

## Install

Route-free build: only the **`plugin/`** web half needs to land in your CloudTAK tree
(`api/web/plugins/`). The `server/` files are obsolete no-op stubs — copying them into
`api/routes/` is harmless (they register nothing) and the directory is safe to delete. CloudTAK's
built-in `WEB_PLUGINS` env var still **cannot** install this cleanly (it nests the repo one level
too deep for Vite), so use one of the two paths below.

### Option 1 — infra-TAK console (no terminal needed)

If your CloudTAK was deployed by [infra-TAK](https://github.com/takwerx/infra-TAK), install/update/
remove this plugin from the **CloudTAK Plugins marketplace** in the console. It clones this repo,
copies the plugin into place, and rebuilds the CloudTAK API image for you.

### Option 2 — standalone CloudTAK (`install.sh`)

For CloudTAK deployments **not** managed by infra-TAK. `install.sh` copies `plugin/` →
`api/web/plugins/tak-dispatcher/` (and the harmless `server/*.ts` stubs → `api/routes/`), then
rebuilds and restarts the CloudTAK API image.

```bash
# clone this repo somewhere on the CloudTAK host
git clone https://github.com/takwerx/cloudtak-dispatcher-plugin
cd cloudtak-dispatcher-plugin

# install into your CloudTAK checkout (defaults to ~/CloudTAK)
./install.sh /path/to/CloudTAK
```

The rebuild takes 5–15 minutes. When it finishes, in CloudTAK go to **Settings → Refresh App** to
activate the new service worker (a normal hard-refresh does **not** work — the service worker
intercepts requests), or close all CloudTAK tabs and reopen. The plugin appears at the bottom of
the right-side menu.

**Updating** (pull the latest version and rebuild):

```bash
./install.sh --pull /path/to/CloudTAK
```

**Removing:**

```bash
./install.sh --remove /path/to/CloudTAK
```

Run `./install.sh --help` for all options (`--no-build` copies files without rebuilding).
Requires `bash`, `docker` + `docker compose` (and `git` for `--pull`).

> **Geocoding setup (optional):** address lookup uses OpenRouteService via CloudTAK's native
> Plugin Proxy. Set `ORS_API_KEY` in `plugin/lib/takcad-client.ts`, then in CloudTAK go to
> **Admin → Config → "Plugin Proxy"**, enable it, and whitelist `https://api.openrouteservice.org`.
> Without this, operators place incidents with **pick on map** + a free-text address.

## Requirements

- CloudTAK 13.2+

## License

Proprietary © takwerx. All rights reserved.
