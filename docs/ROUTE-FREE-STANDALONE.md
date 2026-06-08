# Route-free Standalone Dispatcher

Goal: run the **standalone** Dispatcher (Events + Incidents, shared across every dispatcher on
this CloudTAK) **without copying any file into `~/CloudTAK/api/routes/`** — i.e. delete
`server/plugin-dispatcher.ts` and stop requiring an API image rebuild. TAK‑CAD mode is out of
scope and dropped entirely.

## Why this is even possible

Almost all of the field-facing behaviour already runs on CloudTAK's built-in APIs, with **no
custom route** (see `plugin/lib/map-marker.ts`):

- Incident markers are written into a specific DataSync feed via the worker DB
  (`db.add(..., origin:{mode:'Mission', mode_id: feedGuid})`).
- The call-for-service line goes to the mission log via `POST /api/marti/missions/:name/log`.
- The announcement goes to feed chat via CloudTAK's `SubscriptionChat`.

The **only** thing that forces `plugin-dispatcher.ts` into `api/routes/` is the dispatcher's
own **structured board** — the Events list and the Incident records (number, type, address,
dispatcher, status, `assigned[]`, `notes[]`, `closed_at`, plus the `seq` counter). Today that
lives in two custom Postgres tables. The rewrite moves that state onto the DataSync **mission**
each Event is already bound to.

## Core model change

| Concept today (SQL) | Route-free model |
|---|---|
| `dispatcher_events` row | The **DataSync mission itself** (Event = mission). Today an Event only *references* a pre-existing feed; here the plugin creates/owns the mission. |
| Event `name` / `feed_*` | Mission `name` / `guid`. |
| Event `prefix`, `seq` | Mission `keywords` (e.g. `prefix:FESTIVAL`, `seq:14`) via `PATCH /marti/missions/:name`. |
| `dispatcher_incidents` row | One **CoT feature** in that mission. Full record packed into `feature.properties` under a namespaced key (e.g. `properties.dispatcher = {...}`). |
| Incident `status/assigned/notes/closed_at` | Fields inside that `properties.dispatcher` blob (closing = property update, not delete). |

## Endpoint mapping — all native, already mounted in CloudTAK

| `/api/dispatcher/*` (delete these) | Native replacement (client-side, bearer token) |
|---|---|
| `GET /dispatcher/events` | `GET /api/marti/mission` (list missions; filter by a marker keyword like `dispatcher-event`). |
| `POST /dispatcher/events` | `POST /api/marti/mission` (create), then `PATCH /api/marti/missions/:name` to set `keywords` = prefix + `seq:0`. |
| `PATCH /dispatcher/events/:id` (archive/reactivate) | `PATCH /api/marti/missions/:name` — toggle an `archived` keyword. |
| `DELETE /dispatcher/events/:id` (nuke) | `DELETE /api/marti/missions/:name`. |
| `GET /dispatcher/events/:id/incidents` | `GET /api/marti/missions/:guid/cot` → read `features`, reconstruct each incident from `properties.dispatcher`. |
| `POST /dispatcher/events/:id/incidents` | Compute next number (see seq caveat), then `db.add` the CoT with the record in `properties.dispatcher` (already how markers are written). |
| `PATCH /dispatcher/incidents/:id` (assign/note/close/reopen) | Re-`db.add` the same UID with updated `properties.dispatcher`; or `DELETE /api/marti/missions/:guid/cot/:uid` to remove. Notes can also append to the mission log. |

Net result: `events-client.ts` is rewritten to call `/api/marti/...`; `server/` is deleted; the
install step no longer touches `api/routes/` or rebuilds the API image — the web plugin alone is
bundled by Vite.

## Trade-offs — read before committing

These are the real regressions vs. the SQL store; none is a blocker for typical dispatcher
scale, but they change behaviour:

1. **Incident numbering loses atomicity.** Postgres did `UPDATE events SET seq = seq+1
   RETURNING` — race-free. A mission has no atomic counter. Either derive the next number from
   the current feature count or store `seq` in mission keywords; with two dispatchers creating
   at once you can get a duplicate/skipped number (last-write-wins). If gap-free, collision-free
   numbering is a hard requirement, this is the one thing route-free can't fully match.

2. **Confidentiality of dispatcher-only fields.** The SQL row kept `dispatcher`, `assigned[]`,
   and `notes[]` server-side and *out of* the broadcast CoT (the field marker is deliberately
   sanitized to callsign + remarks). Packing them into mission CoT properties / logs pushes them
   to TAK Server and **every subscriber of that feed**. This is fine **iff** the Event's feed is
   a dispatcher-only mission/channel. If responders share the feed, keep the marker sanitized and
   decide consciously what board detail is acceptable to expose. There is no
   private-to-dispatchers server store without a custom table.

3. **Closed-incident retention.** SQL kept closed rows until the Event was nuked. In the mission
   model you must keep the CoT alive and flip a `closed` property rather than deleting it;
   confirm your TAK Server's mission CoT retention/TTL doesn't prune stale features, or the
   "reopen a closed incident" flow can lose history. **Verify on your server before relying on
   it.**

4. **No server-side querying.** Filtering/sorting moves to the client (read all mission features,
   filter in memory). Negligible at dispatcher volumes.

5. **Event = mission identity.** Today an Event points at a feed; here the Event *is* the
   mission, so creating an Event creates a mission (and deleting nukes it). Make sure that
   ownership model matches how your operation provisions feeds.

## Phased build

1. **Spike (read path).** Add a temporary "use mission as store" flag; implement
   `listEvents`/`listIncidents` against `/api/marti/mission` + `/api/marti/missions/:guid/cot`
   and render the existing board read-only. Confirms round-trip of `properties.dispatcher` and
   that closed CoTs survive.
2. **Write path.** Port create/patch/close/reopen + the `seq` strategy; keep the marker write
   exactly as `map-marker.ts` does it.
3. **Cutover.** Rewrite `events-client.ts` to native calls, delete `server/plugin-dispatcher.ts`
   and `server/plugin-takcad.ts`, drop the install step's `api/routes/` copy + image rebuild.
4. **Verify.** Two-browser concurrency test (numbering + close/reopen), and a subscriber check
   confirming no unintended dispatcher-only data leaks onto the feed.

## Open items to confirm (one at a time)

- Is each Event's feed **dispatcher-only**, or shared with responders? (Decides trade-off #2.)
- Is strictly gap-free incident numbering a requirement? (Decides whether #1 is acceptable.)
- What is your TAK Server's mission CoT retention policy? (Decides #3.)
