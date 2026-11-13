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
| Managed rebuild | Client-side `_reindex` + `_tasks` polling + atomic alias swap; jobs persist locally |
| Cross-cluster migration | Client `scroll` + `_bulk`; written data survives a closed tab, the job is marked `INTERRUPTED` for an explicit resume |
| Config validator | Client L1 lint + temp-index dry-run |
| Config drift | Local baseline captured on first check, compared with live mapping/settings |
| Settings impact / guarded apply | Local ES 7.10 DYNAMIC/STATIC/ILLEGAL classification + L1 gate + rebuild estimate; in-page confirmToken; real `PUT /{index}/_settings`; local `GUARDED_ACTION` receipt |
| Task progress | `_tasks/<taskId>` mapped to the server `ReindexProgress` shape |
| MCP bridge | `window.ESQueryStudioMCP` handles MCP JSON-RPC in-page with the same tool, read-only resource and guided prompt family as server mode; resources read only the active local profile, read tools use the current local profile, write tools are opt-in in the MCP panel; server-mode panel can also trial tools against `/mcp` with a one-time in-memory key |

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

## Honest limits

These are deliberate lossy equivalents, not silent fake successes:

- **Cross-instance locks** — the System page shows jobs running in this browser;
  two browsers do not coordinate a cluster-wide lock.
- **Code-provider mapping reconcile** — the startup reconcile needs server-side
  `@Mapping` sources; browser mode offers the local config-drift baseline instead.
- **Closed-tab sampling** — the service worker writes cluster, per-node and top-index
  rows for every saved profile each minute and evaluates the same alert thresholds, with the
  same record shape as the page sampler; an open console tab still adds the high-frequency live detail.
- **Client migration** — `scroll` + `_bulk` stops when the tab closes; written
  documents remain and the job must be resumed explicitly.
- **Audit scope** — the local audit ring is per browser profile and capped at
  20k rows; it is not a compliance-grade cross-instance ledger.
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
[MCP quickstart](mcp-quickstart.md).
