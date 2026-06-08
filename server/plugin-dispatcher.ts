// CloudTAK lints copied plugin routes with its OWN house-style rules, which differ across
// versions: @stylistic/brace-style flips between 13.2 (Stroustrup) and 13.3 (1TBS), and
// isn't even defined on 12.82 (naming it in a disable errors there). A plugin can't satisfy
// every CloudTAK version, so opt this route file out of CloudTAK's lint — the plugin repo
// owns its correctness (vue-tsc/eslint in dev).
/* eslint-disable */
import type Schema from '@openaddresses/batch-schema';
import type Config from '../lib/config.js';

// OBSOLETE — the Dispatcher plugin is now route-free. Events and Incidents are stored
// on CloudTAK's native DataSync missions (Event = mission keywords, Incident = mission-log
// record) entirely from the web bundle. See docs/ROUTE-FREE-STANDALONE.md.
//
// This file is retained ONLY so an older infra-TAK installer that still copies server/*.ts
// into api/routes/ won't break: it registers no endpoints. The whole `server/` directory is
// safe to delete (`git rm -r server/`), after which the plugin needs nothing in api/routes/.
export default async function router(_schema: Schema, _config: Config): Promise<void> {
    void _schema;
    void _config;
}
