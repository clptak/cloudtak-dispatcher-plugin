<template>
    <!-- Footer config card: enter the OpenRouteService key used for address geocoding.
         Stored per-device in Capacitor Preferences (read by lib/takcad-client.ts).
         "Hide" dismisses it; a small link brings it back. -->
    <div
        v-if='expanded'
        class='border-top flex-shrink-0 px-3 py-2'
        style='background:var(--bs-body-bg,#1e2228)'
    >
        <div class='d-flex align-items-center gap-2 mb-1 small'>
            <IconMapPin :size='14' class='text-warning' />
            <span class='fw-semibold'>Geocoding key (OpenRouteService)</span>
            <button
                class='btn btn-link btn-sm p-0 text-muted text-decoration-none ms-auto'
                @click='hide'
            >
                Hide
            </button>
        </div>

        <div class='d-flex gap-2'>
            <input
                v-model='draft'
                type='password'
                class='form-control form-control-sm'
                placeholder='openrouteservice.org API key'
                autocomplete='off'
                spellcheck='false'
                @keyup.enter='save'
            >
            <button
                class='btn btn-sm btn-primary flex-shrink-0'
                :disabled='busy'
                @click='save'
            >
                {{ justSaved ? 'Saved' : 'Save' }}
            </button>
            <button
                v-if='hasKey'
                class='btn btn-sm btn-outline-danger flex-shrink-0'
                :disabled='busy'
                title='Remove the stored key'
                @click='clear'
            >
                Clear
            </button>
        </div>

        <div class='text-muted mt-1' style='font-size:11px'>
            Also enable <strong>Admin → Config → Plugin Proxy</strong> and whitelist
            <code>https://api.openrouteservice.org</code>. Without a key, place incidents with
            “pick on map”.
        </div>
    </div>

    <!-- Collapsed affordance to reopen the card after hiding -->
    <button
        v-else
        class='btn btn-link btn-sm text-muted text-decoration-none align-self-end px-3 py-1 flex-shrink-0'
        style='font-size:11px'
        @click='show'
    >
        <IconMapPin :size='12' class='me-1' />Geocoding key
    </button>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Preferences } from '@capacitor/preferences';
import { IconMapPin } from '@tabler/icons-vue';
import { ORS_KEY_PREF } from '../lib/takcad-client.ts';

const HIDDEN_PREF = 'dispatcher-ors-card-hidden';

const expanded = ref(true);
const draft = ref('');
const hasKey = ref(false);
const busy = ref(false);
const justSaved = ref(false);

onMounted(async () => {
    try {
        const [{ value: key }, { value: hidden }] = await Promise.all([
            Preferences.get({ key: ORS_KEY_PREF }),
            Preferences.get({ key: HIDDEN_PREF }),
        ]);
        draft.value = key || '';
        hasKey.value = !!key;
        // Show by default until the user has both saved a key and chosen to hide it.
        expanded.value = hidden !== 'true';
    } catch { /* defaults are fine */ }
});

async function save() {
    busy.value = true;
    try {
        const v = draft.value.trim();
        if (v) await Preferences.set({ key: ORS_KEY_PREF, value: v });
        else await Preferences.remove({ key: ORS_KEY_PREF });
        hasKey.value = !!v;
        justSaved.value = true;
        setTimeout(() => { justSaved.value = false; }, 1500);
    } finally {
        busy.value = false;
    }
}

async function clear() {
    busy.value = true;
    try {
        await Preferences.remove({ key: ORS_KEY_PREF });
        draft.value = '';
        hasKey.value = false;
    } finally {
        busy.value = false;
    }
}

async function hide() {
    expanded.value = false;
    try { await Preferences.set({ key: HIDDEN_PREF, value: 'true' }); } catch { /* ignore */ }
}

async function show() {
    expanded.value = true;
    try { await Preferences.remove({ key: HIDDEN_PREF }); } catch { /* ignore */ }
}
</script>
