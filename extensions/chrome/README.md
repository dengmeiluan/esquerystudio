# ESQueryStudio Chrome Extension

**The native ESQueryStudio Vue console, with a browser transport.** Load it unpacked in
Chrome/Edge; the toolbar opens the full 52-page Vue console (the same `ui/` source as the
server), and the browser transport talks directly to Elasticsearch. A small direct tool page
is kept for debugging via the extension context menu.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode** (top-right).
2. Choose **Load unpacked** and select the **folder that contains `manifest.json`** —
   in this repo that is `extensions/chrome`; if you downloaded the release zip, **extract
   it first** and select the extracted `esquerystudio-chrome-1.0.0` folder. Do **not**
   select the `.zip` file itself; Chrome cannot load a zip as an unpacked extension.
3. Pin **ESQueryStudio** and click the icon — the native Vue console opens in a tab.
4. In the browser connection layer, enter the ES URL/auth and connect. Chrome asks for
   host access to that exact origin when you press **连接**; the grant persists for the saved
   profile, and the extension sends requests only to that URL. Declining the prompt cancels
   the connection without sending anything.

### If install fails

| Symptom | Fix |
|---|---|
| `Manifest file is missing or unreadable` | You selected the parent folder or the zip. Select the folder that directly contains `manifest.json`. |
| `Cannot load extension with file or directory name _metadata` | Remove `__MACOSX` / `_metadata` from the extracted folder, then retry. |
| `This extension is not allowed` / policy block | Use a non-managed Chrome profile, or install in Chrome/Edge with Developer mode enabled; managed profiles can forbid unpacked extensions. |
| Button is greyed out | Enable **Developer mode** first. |
| Extension loads but icon is missing | Pin it from the puzzle menu; open `chrome://extensions` and check for load errors. |

Build the bundled Vue app from the same source:

```bash
cd ui
npm run build:extension
```

A packaged zip is attached to each GitHub Release.

## One Vue source, two transports

- **Native Vue console (browser build)** — `app/` is the same `ui/` Vue source built with
  `--mode browser`; `api.ts` swaps only its lowest transport to direct Elasticsearch. The
  toolbar opens the complete 52-page console with identical routes/components/styles. First
  open shows the native connection layer; credentials stay local.
- **Server mode** — the same `ui/` source is still served by the Spring Boot server through
  `/internal/es/index`. No second UI is maintained.
- **Direct tool page** — right-click the extension icon for the lightweight single-page
  debugging tools; it is intentionally not presented as the full console.

## Direct tool page surfaces

| Surface | Direct ES call |
|---|---|
| DSL query | `POST /{index}/_search` |
| Lucene query | `query_string` via `_search` |
| ES-SQL | `POST /_sql?format=json` |
| PIT deep pagination | open PIT → `_search` + `search_after` → close PIT |
| Explain | `POST /{index}/_explain/{id}` |
| Profile | `profile: true` on the DSL request |
| REST console | Any `http(s)` ES API, including tasks, snapshots and settings |
| Reindex | Guided `POST /_reindex`, optional query/slices, async task polling via `_tasks/<id>` and cancel |
| Live monitor | `_cluster/health` + `_nodes/stats`, configurable 3/5/10/30 s interval and 60/120/240-point in-memory cap |
| History / favorites | `chrome.storage.local`, capped at 100 / 50 entries; saved connection profiles and per-mode drafts |
| Mapping assist | Field insert from live mapping, JSON syntax/field lint, condition summary; right-click selected text opens Lucene/DSL prefill |

## Browser-mode coverage

The native Vue console talks to Elasticsearch directly through a compatibility bridge
(`ui/src/platform/browserApi.ts`), not through a second hand-written UI.

| Area | Browser mode |
|---|---|
| Connections | Multiple local profiles in extension storage; the top-bar switcher selects the active target; passwords never leave the browser |
| Overview, indices, documents, DSL/Lucene/SQL, PIT, reindex, bulk | Direct ES REST |
| Mapping, settings, aliases, templates, analysis, synonyms, scripts, Painless | Direct ES REST |
| Snapshots, ILM, SLM, Watcher, remote clusters, plugins | Direct ES REST |
| Tasks, nodes stats, shards, allocation explain, health report | Direct ES REST |
| Search templates, term vectors, validate/explain, profile | Direct ES REST |
| Monitor history / alerts | Local IndexedDB minute sampling (page + service-worker alarm); the alert state machine runs while a console tab is open, while the closed-tab alarm writes cluster-level health rows |
| Operation audit | Local IndexedDB request log, shown in Security; ES-native accounts replace the server user store |
| Task progress | `_tasks/<taskId>` → the server `ReindexProgress` shape (RUNNING / COMPLETED / UNKNOWN + counts); vanished tasks are treated as completed |
| Settings impact / guarded apply | Local ES 7.10 DYNAMIC/STATIC/ILLEGAL classification + L1 value gate + rebuild estimate; in-page confirmToken binds action + params; execute writes `PUT /{index}/_settings` and records a local GUARDED_ACTION receipt |
| Managed rebuild | Client-side `_reindex` + `_tasks` polling + atomic alias swap, persisted as local jobs |
| Cross-cluster migration | Client `scroll` + `_bulk` from a manually entered source into the connected host; local job records |
| Config validator | Client L1 lint + L2 temp-index dry-run |
| Config drift | Local baseline captured on first check, compared with the live mapping/settings |
| System indices | Local job-lock view for the current browser; true cross-instance locking remains a server capability |

### Honest browser-mode limits

These are intentional lossy equivalents, labelled in the UI rather than faked:

- **Cross-instance locks** — the System page shows jobs running in this browser only; two browsers cannot coordinate a cluster-wide lock.
- **Code-provider mapping reconcile** — the startup reconcile report needs server-side `@Mapping` sources; browser mode offers the local config-drift baseline instead.
- **Closed-tab sampling** — the service worker writes cluster, per-node and top-index rows per saved profile each minute, with the same shape as the page sampler and evaluates the same alert thresholds; an open console tab still adds high-frequency live detail. Only `_cluster/health` is a hard dependency: restricted accounts without `_nodes` / `_cat` / `_stats` permissions keep the real health row and degrade optional detail to empty.
- **Client migration** — `scroll` + `_bulk` stops when the tab closes; written documents remain and the job is marked `INTERRUPTED` for an explicit resume.
- **Audit scope** — the local audit ring is per browser profile and capped at 20k rows; it is not a compliance-grade cross-instance ledger.

The REST console deliberately exposes reindex, tasks, snapshots and settings
directly; the user owns the cluster credentials and accepts the risk. The
Spring Boot starter / standalone server remains the control plane for host
identity, cross-instance audit and server-managed job orchestration.

## Data and security

- Connection profiles and credentials stay in this extension's local storage
  (`localStorage` plus a `chrome.storage.local` mirror used by the background sampler);
  each saved profile is sent only to its own Elasticsearch endpoint. No third-party telemetry.
- The service worker is a narrow broker for the context-menu tool page: only `http`/`https`,
  allowlisted methods, 8 MB request cap, no remote code, no third-party telemetry. The native
  Vue console uses the granted optional host permission directly against the configured ES endpoint.
- `optional_host_permissions` cover `http/https`, but Chrome only grants the exact origin the
  user approves in the connect dialog; there is no install-time broad-host warning.
- Requests use the runtime-granted origin permission. Cluster CORS,
  TLS, gateway allowlists and network reachability still apply; ask the ES
  administrator to allow the extension origin if a gateway blocks it.
- The native Vue console keeps monitor samples in local IndexedDB (7 days / 20k rows,
  one sample per minute while a console tab is open; the service-worker alarm samples
  every saved profile while Chrome runs, writing one cluster-level row per profile per
  minute and isolating records by profile id). Audit entries are capped at 20k rows and
  managed-rebuild jobs stay local too. The separate direct tool page keeps its live
  samples in memory (120 points, ~10 min).

## Verification

```bash
node scripts/verify-extension.mjs
```

The guard checks the MV3 manifest, broker method/protocol allowlist, local-only
assets, required UI surfaces and absence of remote-code/telemetry references.
