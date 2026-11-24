# Browser mode (Chrome extension)

ESQueryStudio keeps one Vue console and switches only the lowest transport:

```text
ui/ (Vue 3, 53 pages)
  ├─ server mode  → /internal/es/index → Spring Boot console
  └─ browser mode → browserApi.ts       → Elasticsearch REST directly
```

The Chrome extension is the same `ui/` source built with `--mode browser`.
`npm run build:extension` emits `extensions/chrome/app/`; the toolbar opens the
full native Vue console, not a second hand-written UI.

## What runs locally

| Capability | Browser-mode implementation |
|---|---|
| Connection directory | Multiple local profiles in extension storage; top-bar switcher selects the data-plane target |
| Authentication | Elasticsearch-native Basic auth or API Key; credentials stay on this device |
| Query workbench | Direct ES REST for DSL, Lucene, ES-SQL, PIT, explain/profile, bulk and reindex |
| Monitoring | IndexedDB samples; an open console tab samples the current target, the service worker samples every saved profile (cluster + per-node + top-index rows). Only cluster health is a hard dependency: restricted accounts without `_nodes` / `_cat` / `_stats` permissions keep the real health row and degrade optional detail to empty |
| Operation audit | Local IndexedDB request ring, capped at 20k rows, shown in Security |
| Managed rebuild | Client-side `_reindex` + `_tasks` polling + atomic write-index alias swap (the old index stays in the alias, read-only); INCREMENTAL catch-up rounds mirror the server (overwriting range reindex, max 3 rounds, converge under 50 affected docs = created+updated, then one async final catch-up task with `op_type=create` after the switch); the pre-switch confirmation gate applies to direct-index jobs too — with `deleteOldIndex` the confirm step probes the target index (`_count`) before the old index may be deleted, and the gate carries a 30-minute deadline (`gateDeadlineMs`, same as the server default) that auto-releases the write block and fails the job without switching; confirm and gate-timeout race for the same job are adjudicated on the persisted record: confirm re-reads the job after the probe and refuses with a clear error if the timeout already closed the gate, and the switched fact (gate outcome CONFIRMED, stage past AWAIT_CONFIRM) is persisted right after the alias swap — before the final catch-up submission — so a late timeout can no longer re-mark a switched job as "switch not executed"; a failed final-catchup submission still finishes as switched with an honest "final catch-up failed, manual check needed" report; when the old index is kept (alias mode, `deleteOldIndex=false`, non-MANUAL) the browser sets `blocks.write=true` on the kept old index like the server FINALIZE, and a failed write-protection attempt is reported honestly instead of pretending success; retry of FAILED/ABORTED jobs reuses the jobId (incremental resumes the range catch-up when the target survives, otherwise a full `_reindex` is resubmitted with `conflicts=proceed`) and accepts optional `requestsPerSecond`/`slices`/`batchSize` overrides on retry (`-1` for `requestsPerSecond` = explicitly unthrottled, matching the server semantics), rejects while another RUNNING job holds the same logical name and guards against double-click resubmission; reindex-phase throttling calls `_rethrottle` on the live task and rejects `requestsPerSecond=0` like the server (pass `-1` to unthrottle); job-record delete/cleanup is local (no server ledger) and cleanup requires a positive `olderThanDays` (0/negative is rejected like the server, so it can never silently clear all terminal records); abort keeps the target index for diagnosis; MANUAL reports a backfill range DSL; jobs persist locally; no cross-instance lock. Direct-index jobs never auto-create an old-name alias on switch — deleting the old index means business queries must move to the new index name, and the strategy step states this boundary |
| Cross-cluster migration | Client sliced `scroll` + `_bulk`: the `slices` request field is honored with a browser-side cap of 4 parallel slices (higher values clamp to 4 — a tab cannot hold a server-sized connection pool); bulk actions use `create`, so reruns skip already-written docs as 409 conflicts (conflict ids land in a capped sample ring, cap 1000); the job ledger throttles localStorage writes to one per 500 ms (terminal states flush immediately); every job keeps a derived event ring (`{ts,stage,message,level}`, cap 200: start/slice/409/terminal/resume/interrupted) served by `jobs/{id}/events`; preflight checks both sides — `destExists` plus source `_cat/indices` health/docs/shards/store size through the form connection, and dest shards/health when the dest exists — with server-aligned field names (`srcDocCount`, `srcShards`, `destShards`) plus browser-computable extras (`sourceBytes` from `_stats`, `sourceAliases`, `fieldTypeCounts` from the mapping, a `recommended` next step); `estSeconds` stays `null` because `tuneMode` is still ignored (no rate model in the browser); resume keeps prior `migrated`/`conflicts`/`errors` as a baseline and accumulates the re-scan on top; written data survives a closed tab, the job is marked `INTERRUPTED` for an explicit resume; job-record delete/cleanup is local ledger bookkeeping (a job with an in-flight finishing pass refuses deletion until aborted/terminal, batch cleanup requires a positive `olderThanDays` like the server); the job-detail reconcile (`jobs/{id}/reconcile`) counts both sides via `_count` — source credentials come from the job's stored profile — and conflicts (`jobs/{id}/conflicts`) reads the local sample ring and returns `{samples: string[], total, truncated}` — plain id strings with no cursor paging, unlike the server REST shape `{samples: [{_id, ts}], nextCursor, total, truncated}` (the UI renders both shapes; the source profile is required for reconcile, legacy hand-typed jobs fail honestly); adaptive structure sync (`sync-structure`) runs fully in the browser with the two-layer v2 report — `planned` prunes by the compat matrix (`apack-private`, `ttl-legacy`, `routing-attrs`, `plugin-analysis` with vendor/plugin evidence from a `probe_capabilities`-style probe of both sides, `ilm-missing` after a 404 policy precheck) plus `advice` for shards/auto-replicas/store, `reactive` keeps the per-round removal/downgrade lists from target rejections, `aliases` reports the skipped/synced alias carry-over (`syncAliases=true`), and mappings top-level keys (`dynamic_templates`/`_meta`/`_source`/`dynamic`) pass through instead of being dropped; `dryRun=true` returns the plan without a single PUT; the v3 plan adds `body` (the adapted create body), `planDigest` (deterministic digest of the adapted `{settings, mappings, aliases}`; SHA-256 where `crypto.subtle` is available — https or localhost — and a stable FNV-1a fallback otherwise, same-origin dryRun→execute drift gate either way) and `destConnId` echo — passing `expectPlanDigest` on execute is rejected with HTTP 409 `PLAN_DRIFT` before any PUT when the source structure drifted (same verdict as the server); the compat matrix also applies the `vendor-private` strip rule (aliyun/tencent/aws prefix tables — a key owned by a vendor other than the known target vendor is stripped; unknown target vendor strips nothing and warns, regardless of the source vendor); alias carry-over preserves alias metadata (`filter`/routing keys) like the server; live throttle (`throttle` / `jobs/{id}/throttle`) is browser-batch-granular — each finished bulk batch sleeps to honor the current per-second window read live from the job (so a mid-run change takes effect on the next batch), `-1` restores unlimited, `0` is refused, and a `THROTTLE` event lands in the ledger; `compare_capabilities` probes both sides in the browser and returns the same diff matrix (versionGap / vendorChanged / plugin sets / node scale / graded risks) as the server; `diff_structure` diffs both sides' settings/mappings locally with `expectedRemovals` exempt from `unexpected` (both the flat `index.analysis.{kind}.{name}.*` key form and the nested single-key `index.analysis` form, where a planned component strip shows up as a whole-key value change and is exempted by component-level set difference); `verify_equivalence` runs the same read-only data check in the browser (both-side `_count`, `_doc`-order id sample with mget + canonical SHA-256/FNV digest per id, optional terms aggregation; the `jobId` form reads the local ledger for the source profile, `destConnId` defaults to the active connection and any other id is rejected — same rule as `sync-structure`); `smart_sync` (one-shot intelligent structure sync) runs fully in the browser — describe the intent (source index on the prod profile, `destConnId` required, target is always the active profile or `host`), it probes the target's version/vendor/plugins/data-node count, applies the compat matrix with the two additional rules (`version-floor` for settings below the target's version, `store-type-vendor` for vendor-specific store values like `hybridfs`), optionally auto-tunes shard count to `min(source, target data nodes)` when the probe is reliable, and returns the full traceable plan (`planned` entries carry `rule`/`reason`, `autoTuned` lists the adjustments, `planDigest` uses the same SHA-256/FNV digest as `sync-structure`); `apply=false` (default) is read-only, `apply=true` executes behind the `expectPlanDigest` drift gate rejected as 409 `PLAN_DRIFT` before any PUT — same channel as the server; saved sync plans persist browser-side: a smart_sync preview with `savePlan=true` writes the plan snapshot to the local ledger `xm-plans-v1` (cap 50, evicting the oldest by saved time — applying a plan does not refresh its savedAtMs — credentials never stored; degraded storage keeps the plan in page memory with a warning); `plan_apply` re-derives the plan from the current source structure and enforces the saved digest as the drift gate (a drifted source rejects with 409 `PLAN_DRIFT` before any PUT, same as the server), `plan_list` reads the local ledger, and hand-typed connections without a profile id cannot save plans (the UI disables the switch, the MCP call is rejected honestly); the MCP bridge exposes the same `probe_capabilities`/`compare_capabilities`/`diff_structure`/`verify_equivalence`/`throttle`/`smart_sync`/`plan_list`/`plan_apply`/`events` actions through `/internal/es/xmigrate/*` |
| Config validator | Client L1 lint + temp-index dry-run |
| Config drift | Local baseline captured on first check, compared with live mapping/settings |
| Settings impact / guarded apply | Local ES 7.10 DYNAMIC/STATIC/ILLEGAL classification + L1 gate + rebuild estimate; in-page confirmToken; real `PUT /{index}/_settings`; local `GUARDED_ACTION` receipt |
| Task progress | `_tasks/<taskId>` mapped to the server `ReindexProgress` shape |
| MCP bridge | `window.ESQueryStudioMCP` handles MCP JSON-RPC in-page with the same tool, read-only resource and guided prompt family as server mode; resources read only the active local profile, read tools use the current local profile, write tools are opt-in in the MCP panel; server-mode panel can also trial tools against `/mcp` with a one-time in-memory key. Long calls run through the in-page task ledger: every call has a 3-minute budget that auto-cancels (`cancelReason=DEADLINE`), `tasks/cancel` and `notifications/cancelled` abort the in-page fetch through an `AbortController` (the tab stops waiting immediately; a request Elasticsearch already accepted may keep running server-side — the same boundary the local stdio bridge states), Tasks-extension clients get a `working` task first and resume with `tasks/get` / `tasks/list` / `esquerystudio://tasks/active` / `esquerystudio://task/{id}`. The ledger persists to localStorage (`esquerystudio.mcp.tasks.v1`, cap 100, 1h TTL, oversized results marked `resultDropped`): after a reload, completed/failed tasks stay readable by id, while a task that was still `working` restores as `cancelled` / `cancelReason=RELOAD` with an explicit note that the connection is gone and Elasticsearch may have executed the write — never as if it were still running |

## Parity gate

Browser mode is not a second UI: every endpoint exposed by `ui/src/api.ts` must have a
browser implementation in `ui/src/platform/browserApi.ts`, or an explicit reasoned entry in
`BROWSER_SERVER_ONLY_ENDPOINTS`. CI runs:

```bash
node scripts/check-browser-parity.mjs
node scripts/check-mcp-parity.mjs
```

The gate scans the API layer, backend controller mappings and the page contract's
`apiPrefixes`. A new server-only page or endpoint fails the build. Genuine server-only capabilities stay exceptional, must
state why, and must surface that boundary in the UI instead of returning a silent 501.

Cross-cluster migration parallelism is verified in
`ui/src/__tests__/browserXmigrate.spec.ts` against mocked source/dest transports:
the slice fan-out asserts each parallel path's initial search body carries
`slice:{id,max}` and the per-slice `hits.total` values sum into the job total;
counters are asserted as aggregates across slices, one failing path must land the
job in `FAILED` with the original error, preflight asserts the two-sided
`_cat`-backed fields, and resume asserts the baseline accumulation after 409
skips. Run it with `cd ui && npx vitest run src/__tests__/browserXmigrate.spec.ts`.
The same spec also drives the v2 structure sync: the compat matrix pre-prunes the
vendor-private setting and the ik tokenizer (target has no `analysis-ik` plugin)
into `planned` — with the field's analyzer reference downgraded and the field kept —
before a single PUT, `dynamic_templates` is asserted present in the PUT body, and an
unrecognized rejection returns `created=false` with `lastError` (field name aligned
with the server contract). The 2026-11-21 compat-plan specs cover the rest:
`browserCompatMatrix1121.spec.ts` drives all eight COMPAT_MATRIX rules (positive and
negative) plus vendor inference, `browserSyncStructureDryRun1121.spec.ts` asserts the
dryRun preview sends no PUT and returns the full v2 report shape, alias carry-over on
`syncAliases=true`, and the honest skip when the target plugin list is unreadable,
`browserXmigrateEvents1121.spec.ts` verifies the job event ring
(`{ts,stage,message,level}`, cap 200) and the 409 conflict sample ring, and
`browserReconcile1121.spec.ts` verifies the two-sided `_count` reconcile, the
`{samples,total,truncated}` conflicts read and the preflight extras
(`sourceBytes`/`sourceAliases`/`fieldTypeCounts`/`recommended`).

## Honest limits

These are deliberate lossy equivalents, not silent fake successes:

- **Cross-instance locks** — the System page shows jobs running in this browser;
  two browsers do not coordinate a cluster-wide lock.
- **Code-provider mapping reconcile** — the startup reconcile needs server-side
  `@Mapping` sources; browser mode offers the local config-drift baseline instead.
- **Closed-tab sampling** — the service worker writes cluster, per-node and top-index
  rows for every saved profile each minute and evaluates the same alert thresholds, with the
  same record shape as the page sampler; an open console tab still adds the high-frequency live detail.
- **Client migration** — sliced `scroll` + `_bulk` stops when the tab closes; written
  documents remain and the job must be resumed explicitly. Resume is an honest
  baseline re-scan, not a persisted scroll cursor (scroll contexts expire and
  cannot be stored): existing counters are kept as a baseline, the re-scan skips
  already-written docs via `create` conflicts, and `migrated` accumulates from
  the baseline. Parallel slices are capped at 4 in the browser (the server
  honors higher `slices`), and `tuneMode` / `estSeconds` are still not emulated
  (no tune-rate model).
- **Audit scope** — the local audit ring is per browser profile and capped at
  20k rows; it is not a compliance-grade cross-instance ledger.
- **Managed-rebuild gates and records** — the confirmation gate deadline, retry
  and throttling orchestrate only this browser's jobs; job-record delete/cleanup
  clears local records only (server-mode records live in host memory). The
  direct-index switch never auto-creates an old-name alias in browser mode;
  the strategy step and the finish report state this boundary instead of
  pretending an alias swap happened.
- **MCP transport** — a browser tab cannot listen on TCP. `window.ESQueryStudioMCP`
  serves in-page agents only; external MCP clients need server mode or the stdio bridge.
  Server-mode API keys, per-key rate limits and usage accounting are intentionally not
  emulated in browser mode; the MCP panel states this boundary instead of issuing fake keys.

## Install and build

```bash
# build the same Vue source in browser mode (Chrome extension)
cd ui
npm ci
npm run build:extension

# OR: plain static directory (no extension, no Spring Boot)
npm run build:static   # -> dist/esquerystudio-static/
```

Load `extensions/chrome` (the folder containing `manifest.json`) in
`chrome://extensions` with Developer mode enabled. A packaged zip is attached to
each GitHub Release; extract it before loading.

### Plain static directory deployment

`npm run build:static` emits `dist/esquerystudio-static/` with relative asset
paths and a hash router, so it can be served from any subpath:

```nginx
location /esquerystudio/ {
    alias /srv/esquerystudio-static/;
    try_files $uri $uri/ /esquerystudio/index.html;
}
```

The page talks directly to Elasticsearch from the browser. Elasticsearch must
allow the console origin (do not use `*` in production):

```yaml
http.cors.enabled: true
http.cors.allow-origin: "https://console.example.com"
http.cors.allow-headers: X-Requested-With,Content-Type,Content-Length,Authorization
```

The first-run connect dialog probes `GET /` and shows the cluster name and
version before entering. Version < 7 gets a visible “老版本 ES 兼容模式” badge;
7.x-only pages stay gated by `minVer`. Static mode has no server-side MCP key
store: use `window.ESQueryStudioMCP` for in-page agents, or server mode for
external MCP clients.

First run shows only the browser connection dialog. It probes the endpoint and
credentials before saving; a wrong address or key stays in the dialog with the
real error. The server-mode `LoginOverlay`/`SetupWizard` are intentionally not
mounted in browser mode.

## Data and security

- Credentials are stored in this extension's `localStorage`, with a
  `chrome.storage.local` mirror used by the service worker; they are sent only to
  the Elasticsearch endpoint you configured.
- Monitoring, audit and job records stay in the extension origin's
  IndexedDB/localStorage. No third-party telemetry and no remote code.
- REST console and direct-ES actions run with the Elasticsearch credentials you
  grant. Use a least-privilege ES account and network controls appropriate to
  your threat model.

See [extensions/chrome/README.md](../extensions/chrome/README.md) for the
complete capability table, security notes and verification command.
For the in-page MCP bridge and the external server/Node alternatives, see
[MCP guide](mcp.md).
