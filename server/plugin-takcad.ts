// CloudTAK lints copied plugin routes with its OWN house-style rules, which differ across
// versions: @stylistic/brace-style flips between 13.2 (Stroustrup) and 13.3 (1TBS), and
// isn't even defined on 12.82 (naming it in a disable errors there). A plugin can't satisfy
// every CloudTAK version, so opt this route file out of CloudTAK's lint — the plugin repo
// owns its correctness (vue-tsc/eslint in dev).
/* eslint-disable */
import type Schema from '@openaddresses/batch-schema';
import type Config from '../lib/config.js';

// OBSOLETE — TAK-CAD mode and the server-side geocode proxy have been removed. The plugin
// is route-free and runs standalone on CloudTAK's native /api/marti endpoints. Geocoding now
// goes through CloudTAK's built-in Plugin Proxy (/api/proxy). See docs/ROUTE-FREE-STANDALONE.md.
//
// Retained only so an older installer that copies server/*.ts into api/routes/ won't break:
// it registers no endpoints. Safe to delete the entire `server/` directory.
export default async function router(_schema: Schema, _config: Config): Promise<void> {
    void _schema;
    void _config;
}
