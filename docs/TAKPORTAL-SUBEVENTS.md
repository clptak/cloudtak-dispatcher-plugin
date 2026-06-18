# Dispatcher × TAK Portal Sub-Events — Integration Options

How the CloudTAK **Dispatcher** plugin relates to **TAK Portal**'s mutual-aid
**master / sub-event** feature, and what it would take to create events from inside
the plugin instead of bouncing between the two UIs.

Grounded in the local source as of June 2026:
- Dispatcher: `lib/events-client.ts`, `components/EventsView.vue` (route-free web bundle).
- Portal: `services/mutualAid.service.js`, `routes/mutualAid.routes.js`,
  `services/portalAuth.middleware.js`, `services/groups.service.js`.

---

## 1. What each system owns

**TAK Portal owns identity + access.** A Mutual Aid record of type `EVENT` (or
`INCIDENT`) runs `mutualAid.service.create()`, which:
1. creates an Authentik group `MA - TITLE` that becomes a TAK **channel** (`tak_…`
   via the LDAP/CN plumbing in `groups.service.js`),
2. creates one login `ma-{slug}` (password + QR), and
3. adds that login to the group.

The **sub-event** capability is already implemented as `createLinkedUser()` (types
`SUB-EVENT` / `SUB-INCIDENT`): it provisions an *additional* login
`ma-{master}-{child}` with `groupMode: "existing"` pointed at the **same** group as
the master. Every sub therefore feeds the identical channel, each sub can carry its
own `expireAt`, and deleting the anchor tears down all subs + the shared group.
This is exactly the "master group for the whole event, day/agency/op-period subs
that expire" pattern.

**Dispatcher owns the operational board.** A dispatcher *Event* is a CloudTAK
DataSync **mission/feed** the operator picks from a dropdown; its metadata lives in
the mission's `disp:*` keywords and incidents are mission-log entries. The plugin
has **no group/channel concept of its own** — it operates on whatever missions the
logged-in user can already see, and mission visibility is gated by TAK channels.

**The bridge is the TAK channel.** Portal decides *who logs in and onto which
channel*; the dispatcher Event is *a mission on a channel*. Pair one MA-master
channel with one dispatcher Event and the whole master-plus-subs cohort sees the
same board, sliced at the identity/expiration layer.

---

## 2. Composition options (no plugin-initiated creation)

### Option 1 — Convention only (works today, zero code)
Create the master EVENT in Portal → channel `tak_<title>`. In CloudTAK, create a
DataSync mission scoped to that channel and select it as the dispatcher Event. Every
sub login inherits the channel and sees the board. Access is sliced by identity and
sub expiration; the board is shared. Matches the goal precisely.

### Option 2 — Auto-pair via naming (+ optional Portal auto-provision)
Make the MA title map deterministically to the dispatcher prefix
(`2025-FESTIVAL` → channel `tak_2025-FESTIVAL` → Event prefix `2025-FESTIVAL`).
Optionally have Portal create the CloudTAK mission via `PUT /api/marti/missions/:name`
when the master EVENT is created, so the dispatcher feed exists the instant the
channel does. Small add in Portal only; dispatcher untouched.

### Option 3 — Sub-events that segment the board (dispatcher code)
Options 1–2 give subs scoped *access* but a shared incident view. To make a sub see
only its own incidents, add a `disp:subscope=<id>` keyword and filter, or give each
sub its own mission on the same channel. Only worth it if "better access control"
means visual scoping, not just login lifecycle.

**Lifecycle note:** Portal sub-expiration deletes the *login* (revokes access) while
dispatcher incident data persists with the mission's 30-day log retention — the
desired "revoke the day-pass, keep the event record" behavior. Portal doesn't touch
missions or `disp:*` keywords, so there's no contention.

---

## 3. Creating events from the plugin, submitted through Portal

The endpoints exist: `POST /api/mutual-aid` (master) and
`POST /api/mutual-aid/:id/additional-user` (sub), both returning the full record
incl. username/password/QR. The obstacles are auth and CORS, not the API.

`portalAuth.middleware.js` trusts exactly one credential: the `X-Authentik-Username`
header injected by Portal's reverse proxy (Caddy + Authentik forward-auth), gated by
the `page.mutual_aid` permission. There is **no bearer token, API key, or
service-account auth** in the Portal today, and `/api/mutual-aid` has **no CORS**
(only the public `/locate` endpoints set CORS). The dispatcher is a route-free
browser bundle. So a direct plugin→Portal call hits four gaps: cross-origin (no CORS
allow-list), authentication (browser can't forge the proxy header), authorization
(operator must hold `page.mutual_aid`), and the channel-vs-mission gap (Portal makes
a channel, not a CloudTAK mission — the Event still needs a mission to bind to).

### Option A — Browser→Portal with shared SSO (stays route-free)
Plugin POSTs to a configurable Portal URL with `credentials:'include'`, riding the
operator's existing Authentik session cookie; the proxy converts it to the trusted
header.
- **Needs:** Portal-side CORS for the explicit CloudTAK origin with
  `Access-Control-Allow-Credentials: true`; CloudTAK and Portal on the same Authentik
  realm/domain; operator holds `page.mutual_aid`.
- **Pros:** no CloudTAK server route; matches the route-free ethos.
- **Cons:** couples the two apps' SSO; only works for portal-admin operators; the
  returned password/QR is handled in the browser.

### Option B — Service token + one CloudTAK proxy route (production-correct)
Add a scoped bearer-token auth path to the Portal (new code), store it server-side in
CloudTAK, and add one small CloudTAK API route that proxies plugin→Portal.
- **Pros:** dispatcher operators don't need Portal admin; secret never touches the
  browser; clean trust boundary.
- **Cons:** re-introduces a CloudTAK server route (the thing route-free removed);
  requires new Portal auth code.

### Option C — Reverse the direction (least new surface)
Keep creation in the Portal UI, but have Portal also create the CloudTAK mission on
the new channel when a master EVENT is created. The dispatcher Event feed then
already exists and the operator just selects it. Doesn't *initiate* from the plugin,
but removes nearly all the back-and-forth.

### Option D — One-button hybrid
Plugin button does: (1) Portal create-MA (via A or B), (2) CloudTAK
`PUT /api/marti/missions/:name` on the returned channel, (3) tag it as a dispatcher
Event with `disp:*` keywords. True one-click; most work.

---

## 4. Recommendation

Validate the workflow with **Option 1**, then adopt **Option 2**'s naming convention
(and optional Portal-side mission auto-creation). For plugin-initiated creation:
because provisioning identities/channels is a privileged admin action, choose by who
your dispatchers are — if they're already Portal admins on the same SSO, **Option A**
is the lightest; if not, **Option B** is the right trust model. **Option C** is the
lowest-risk way to kill the back-and-forth without any plugin-initiated path at all.
