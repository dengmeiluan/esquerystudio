# Chrome Web Store submission copy

Everything needed to fill the Chrome Web Store Developer Dashboard listing.
Character limits are enforced by the store; the values below are checked against them.

## Store listing

| Field | Value |
|---|---|
| Extension name (45 max) | `ESQueryStudio — Elasticsearch Query Workbench` (45) |
| Summary / manifest description (132 max) | `Elasticsearch query workbench: DSL, Lucene, SQL, PIT, explain and live monitoring. Connect directly to your cluster, no backend.` (128) |
| Category | Developer Tools |
| Primary language | Chinese (Simplified) — the console UI is Chinese |
| Additional language | English |
| Homepage | https://github.com/dengmeiluan/esquerystudio |
| Support URL | https://github.com/dengmeiluan/esquerystudio/issues |
| Privacy policy URL | https://gist.github.com/dengmeiluan/5de4486616c4f313b8e473b26adf69b7 |
| Mature content | No |

## Detailed description (English, 1320 max)

ESQueryStudio is a direct-to-Elasticsearch query workbench for developers and platform teams.
It runs in your browser and connects only to your cluster. No backend, account, or telemetry.

Six query modes share one workspace:
- DSL Builder: condition tree with two-way JSON sync.
- Lucene: raw syntax with highlighting and prefill from selected text.
- ES-SQL: SQL with cursor deep paging and DSL conversion.
- Sandbox: free-form DSL with raw response inspection.
- PIT: stable deep pagination with search_after.
- Syntax Bridge: SQL/DSL translation with semantic differences called out.

Mapping-aware completion and lint flag missing fields, unsortable text fields, and
version-incompatible clauses before execution. The Relevance Lab breaks BM25 scores
into tf/idf/boost/norm, compares rankings, shows clause hit matrices, and renders profiles
as flame graphs.

Also included: mappings, settings, aliases, templates, snapshots, ILM/SLM, Watcher, tasks,
nodes, REST console, reindex, bulk editing, managed rebuild, and cross-cluster migration.

Connection profiles, credentials, history, favorites, monitor samples, and audit records
stay in local extension storage. Requests go only to the Elasticsearch endpoint you enter.
Works with Elasticsearch 7.x.

Source: https://github.com/dengmeiluan/esquerystudio

## Chinese localization

| Field | Value |
|---|---|
| Name (45 max) | `ESQueryStudio — Elasticsearch 查询工作台` |
| Summary (132 max) | `直连 Elasticsearch 的查询工作台：DSL、Lucene、SQL、PIT、打分与实时监控，无需后端。` |
| Detailed description | 见下节（626 字符） |

## Detailed description (Chinese, optional localization)

ESQueryStudio 是直连 Elasticsearch 的查询工作台，面向开发者、搜索工程师与平台团队。
整个扩展在浏览器内运行，只连接你自己配置的集群，不需要后端、账号或遥测。

六种查询模式共用同一个现场：
- DSL 构建器：条件树与 JSON 双向同步。
- Lucene：原始语法直查，支持选中文本预填。
- ES-SQL：游标深分页，SQL 与 DSL 互转。
- 沙盒：自由 DSL 与原始响应检查。
- PIT：基于 search_after 的稳定深分页。
- 语法桥：SQL/DSL 翻译并标出语义差异。

补全与 lint 会基于实时 mapping：字段不存在、text 不可排序、版本不兼容子句在查询前提示。
相关性实验室可拆解 BM25 分数、比较文档排名、查看子句命中矩阵、把 profile 输出渲染成火焰图。

还包括：Mapping、Setting、别名、模板、快照、ILM/SLM、Watcher、任务、节点、REST 控制台、
Reindex、Bulk 编辑、托管重建与别名原子切换、基于 scroll + bulk 的跨集群迁移。

连接档案、凭据、历史、收藏、监控采样与审计记录只保存在扩展本地存储；请求只发往你填写的
Elasticsearch 地址。兼容 Elasticsearch 7.x。

源码与文档：https://github.com/dengmeiluan/esquerystudio

## Single purpose

Provide a browser-based Elasticsearch query and operations workbench that connects directly to
a user-configured cluster.

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Save connection profiles, query drafts, history, favorites, and local preferences in the extension. No data is sent to the developer. |
| `contextMenus` | Add a right-click action that prefills a Lucene/DSL query from the selected text. The menu does not read pages automatically. |
| `alarms` | Run the local cluster monitor sampler on a configurable interval while Chrome is running. Samples are stored only on the device. |
| Optional host access (`http://*/*`, `https://*/*`) | Elasticsearch clusters are user-specific and can run on any host, port, path prefix, or reverse proxy; no fixed domain list is possible. The extension requests access only to the exact origin the user enters, at the moment they press **Connect**. Declining the prompt cancels the connection; the extension never reads or modifies other websites. |

## Data usage declaration

- The developer does **not** collect, transmit, sell, or share user data.
- No analytics, advertising, crash reporting, or remote logging SDK is bundled.
- Credentials and query data stay in local browser storage and are sent only to the
  Elasticsearch endpoint the user configures.
- The extension contains no remote code; all JavaScript is bundled in the package.

## Remote code declaration

**No, this extension does not use remote code.** All scripts are included in the uploaded
package. The manifest Content Security Policy is `script-src 'self'; object-src 'self'`.

## Review test instructions

1. Install the extension and click the toolbar icon. The full console opens in a tab.
2. The native connection screen appears; no account is required.
3. Enter the base URL of a reachable Elasticsearch 7.x cluster (for example,
   `http://localhost:9200`) and optional credentials, then connect.
4. The console opens the cluster overview and the full navigation. Query workbench, index,
   relevance, lifecycle, observe, and devtools pages are available without any backend.
5. If no cluster is available, the connection screen and navigation still render; data
   pages require a reachable Elasticsearch endpoint.

## Graphic assets

Screenshots are captured from the current source build with synthetic demo data (the UI
labels the demo cluster as synthetic); no screenshot is a design mockup or an older build.

| Asset | File | Size |
|---|---|---|
| Store icon | `extensions/chrome/icons/icon128.png` | 128×128 |
| Screenshot 1 (query workbench) | `extensions/chrome/store/screenshots/01-query-workbench.png` | 1280×800 |
| Screenshot 2 (score explain) | `extensions/chrome/store/screenshots/02-score-explain.png` | 1280×800 |
| Screenshot 3 (SQL console) | `extensions/chrome/store/screenshots/03-sql-console.png` | 1280×800 |
| Screenshot 4 (console overview) | `extensions/chrome/store/screenshots/04-console.png` | 1280×800 |
| Screenshot 5 (cluster overview) | `extensions/chrome/store/screenshots/05-cluster-overview.png` | 1280×800 |
| Small promo tile (optional) | `extensions/chrome/store/promo/small-tile-440x280.png` | 440×280 |
| Marquee (optional) | `extensions/chrome/store/promo/marquee-1400x560.png` | 1400×560 |
