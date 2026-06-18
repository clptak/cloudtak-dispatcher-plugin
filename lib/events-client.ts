import { std } from '@/std.ts';
import { dispatcherStore } from './dispatcher-store.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Route-free Standalone store.
//
// NO custom CloudTAK api/route is required. Everything below rides CloudTAK's
// built-in /api/marti mission endpoints, so the plugin is purely a web bundle:
//
//   • An Event is a DataSync mission (feed). Its dispatcher metadata (display
//     name, incident-number prefix, active/archived) lives in the mission's
//     `keywords` array, namespaced `disp:*`. Listing events = listing missions
//     that carry the `disp:event` keyword.
//
//   • An Incident is a structured record stored as a mission *log* entry, one
//     line per state, content = `DISP|<uid>|<json>`. The mission log is the same
//     channel getMissionLog()/postMissionCallLog() already use, so it round-trips
//     reliably through TAK Server (unlike arbitrary CoT properties). The visible
//     map marker is still written separately via map-marker.ts (worker DB) and is
//     intentionally left sanitized.
//
// Concurrency note: there is no atomic counter. Incident numbers are derived from
// the current count (+1) and updates are last-write-wins. This is acceptable per
// the project decision (gap-free numbering not required). Records age out with the
// feed's 30-day mission-log retention.
// ─────────────────────────────────────────────────────────────────────────────

export interface DispatcherEvent {
    id: string;
    name: string;
    prefix: string;
    feed_guid: string;
    feed_name: string;
    status: 'active' | 'archived';
    seq: number;
    created_at: string;
    created_by: string | null;
}

export interface AssignedContact {
    uid: string;
    callsign: string;
}

export interface IncidentNote {
    text: string;
    time: string;
}

export interface DispatcherIncident {
    id: string;
    event_id: string;
    number: string;
    type: string | null;
    address: string | null;
    lat: number | null;
    lon: number | null;
    dispatcher: string | null;
    details: string | null;
    status: 'active' | 'closed';
    assigned: AssignedContact[];
    notes: IncidentNote[];
    created_at: string;
    closed_at: string | null;
}

export interface CreateEventBody {
    name: string;
    prefix: string;
    feed_guid: string;
    feed_name: string;
}

export interface CreateIncidentBody {
    type?: string;
    address?: string;
    lat: number;
    lon: number;
    dispatcher?: string;
    details?: string;
}

export type IncidentPatch = Partial<Pick<DispatcherIncident,
    'type' | 'address' | 'lat' | 'lon' | 'dispatcher' | 'details' | 'status' | 'assigned' | 'notes'>>;

// ── Keyword helpers (Event metadata lives in mission.keywords) ────────────────

const KW_EVENT = 'disp:event';
const KW_NAME = 'disp:name=';
const KW_PREFIX = 'disp:prefix=';
const KW_STATUS = 'disp:status=';

interface MissionLike {
    guid?: string;
    name: string;
    keywords?: string[];
    createTime?: string;
    creatorUid?: string;
}

function kwGet(keywords: string[], key: string): string | null {
    const hit = keywords.find(k => k.startsWith(key));
    return hit ? hit.slice(key.length) : null;
}

function sanitizePrefix(raw: string): string {
    return (raw || 'INC').replace(/[^A-Z0-9-]/gi, '').toUpperCase().slice(0, 12) || 'INC';
}

// Turn a keyword-tagged mission into a DispatcherEvent. seq is informational only;
// incident numbering is count-derived.
function missionToEvent(m: MissionLike): DispatcherEvent {
    const kws = m.keywords ?? [];
    return {
        id: m.guid || m.name,
        name: kwGet(kws, KW_NAME) || m.name,
        prefix: kwGet(kws, KW_PREFIX) || sanitizePrefix(m.name),
        feed_guid: m.guid || m.name,
        feed_name: m.name,
        status: kwGet(kws, KW_STATUS) === 'archived' ? 'archived' : 'active',
        seq: 0,
        created_at: m.createTime || new Date().toISOString(),
        created_by: m.creatorUid || null,
    };
}

// GET a single mission by name (TAK Server mission routes key by name) so we can
// read-modify-write its keyword array.
async function getMission(name: string): Promise<MissionLike | null> {
    try {
        return await std(`/api/marti/missions/${encodeURIComponent(name)}`, { method: 'GET' }) as MissionLike;
    } catch {
        return null;
    }
}

// Rewrite the mission's keywords, preserving any non-dispatcher keywords.
async function setMissionKeywords(name: string, dispKeywords: string[]): Promise<void> {
    const m = await getMission(name);
    const kept = (m?.keywords ?? []).filter(k => !k.startsWith('disp:'));
    await std(`/api/marti/missions/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        body: { keywords: [...kept, ...dispKeywords] },
    });
}

// Resolve a feed name from an event id (mission guid). Falls back to the open event.
function feedNameFor(eventId: string): string | null {
    const ev = dispatcherStore.events.find(e => e.id === eventId)
        ?? (dispatcherStore.activeEvent?.id === eventId ? dispatcherStore.activeEvent : null);
    return ev?.feed_name ?? null;
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function listEvents(): Promise<DispatcherEvent[]> {
    const r = await std('/api/marti/mission', { method: 'GET' }) as { items?: MissionLike[] };
    const items = Array.isArray(r?.items) ? r.items : [];
    return items
        .filter(m => (m.keywords ?? []).includes(KW_EVENT))
        .map(missionToEvent)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function createEvent(body: CreateEventBody): Promise<DispatcherEvent> {
    const prefix = sanitizePrefix(body.prefix);
    await setMissionKeywords(body.feed_name, [
        KW_EVENT,
        `${KW_NAME}${body.name}`,
        `${KW_PREFIX}${prefix}`,
        `${KW_STATUS}active`,
    ]);
    return {
        id: body.feed_guid,
        name: body.name,
        prefix,
        feed_guid: body.feed_guid,
        feed_name: body.feed_name,
        status: 'active',
        seq: 0,
        created_at: new Date().toISOString(),
        created_by: null,
    };
}

export async function setEventStatus(id: string, status: 'active' | 'archived'): Promise<DispatcherEvent> {
    const ev = dispatcherStore.events.find(e => e.id === id) ?? dispatcherStore.activeEvent;
    const name = ev?.feed_name ?? feedNameFor(id);
    if (!name || !ev) throw new Error('Event not found');
    await setMissionKeywords(name, [
        KW_EVENT,
        `${KW_NAME}${ev.name}`,
        `${KW_PREFIX}${ev.prefix}`,
        `${KW_STATUS}${status}`,
    ]);
    return { ...ev, status };
}

// "Nuke" strips the dispatcher keywords so the event leaves the list. The incident
// log records are left to age out with the feed's mission-log retention; the caller
// clears the live markers separately (EventsView.clearEventMarkers).
export async function deleteEvent(id: string): Promise<void> {
    const name = feedNameFor(id);
    if (!name) return;
    await setMissionKeywords(name, []);
}

// ── Incidents (stored as `DISP|<uid>|<json>` mission-log entries) ─────────────

const REC_PREFIX = 'DISP|';

function encodeRecord(inc: DispatcherIncident): string {
    return `${REC_PREFIX}${inc.id}|${JSON.stringify(inc)}`;
}

// Parse one log line; returns the incident if it is a dispatcher record. uid never
// contains '|', so we split only the first separator and treat the rest as JSON.
function decodeRecord(content: string): DispatcherIncident | null {
    if (!content || !content.startsWith(REC_PREFIX)) return null;
    const rest = content.slice(REC_PREFIX.length);
    const sep = rest.indexOf('|');
    if (sep < 0) return null;
    const json = rest.slice(sep + 1);
    try {
        const inc = JSON.parse(json) as DispatcherIncident;
        inc.assigned = Array.isArray(inc.assigned) ? inc.assigned : [];
        inc.notes = Array.isArray(inc.notes) ? inc.notes : [];
        return inc;
    } catch {
        return null;
    }
}

interface LogEntry { content: string; created?: string }

async function readLog(missionName: string): Promise<LogEntry[]> {
    const r = await std(`/api/marti/missions/${encodeURIComponent(missionName)}/log`, {
        method: 'GET',
    }) as { items?: LogEntry[] };
    return Array.isArray(r?.items) ? r.items : [];
}

async function appendRecord(missionName: string, inc: DispatcherIncident): Promise<void> {
    await std(`/api/marti/missions/${encodeURIComponent(missionName)}/log`, {
        method: 'POST',
        body: { content: encodeRecord(inc), entryUid: inc.id },
    });
}

// Reduce the append-only log to the latest record per incident id.
function reduceIncidents(entries: LogEntry[], eventId: string): DispatcherIncident[] {
    const latest = new Map<string, DispatcherIncident>();
    for (const e of entries) {
        const inc = decodeRecord(e.content);
        if (inc) { inc.event_id = eventId; latest.set(inc.id, inc); }
    }
    return [...latest.values()]
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

export async function listIncidents(eventId: string): Promise<DispatcherIncident[]> {
    const name = feedNameFor(eventId);
    if (!name) return [];
    return reduceIncidents(await readLog(name), eventId);
}

// Build + persist a new incident. Pass the open event (we need its feed name and
// prefix). The number is derived from the current incident count (+1).
export async function createIncident(event: DispatcherEvent, body: CreateIncidentBody): Promise<DispatcherIncident> {
    const existing = await listIncidents(event.id);
    const number = `${event.prefix}-${String(existing.length + 1).padStart(3, '0')}`;
    const inc: DispatcherIncident = {
        id: crypto.randomUUID(),
        event_id: event.id,
        number,
        type: body.type ?? null,
        address: body.address ?? null,
        lat: body.lat,
        lon: body.lon,
        dispatcher: body.dispatcher ?? null,
        details: body.details ?? null,
        status: 'active',
        assigned: [],
        notes: [],
        created_at: new Date().toISOString(),
        closed_at: null,
    };
    await appendRecord(event.feed_name, inc);
    return inc;
}

// Merge a patch over the current record (from the store) and append the new state.
export async function patchIncident(id: string, patch: IncidentPatch): Promise<DispatcherIncident> {
    const cur = dispatcherStore.incidents.find(i => i.id === id);
    if (!cur) throw new Error('Incident not found');
    const next: DispatcherIncident = {
        ...cur,
        ...patch,
        assigned: patch.assigned ?? cur.assigned ?? [],
        notes: patch.notes ?? cur.notes ?? [],
    };
    next.closed_at = next.status === 'closed'
        ? (cur.closed_at ?? new Date().toISOString())
        : null;

    const name = feedNameFor(cur.event_id) ?? dispatcherStore.activeEvent?.feed_name;
    if (!name) throw new Error('Event feed not found');
    await appendRecord(name, next);
    return next;
}
