# Changelog

ESQueryStudio 采用「初版（滚动更新）」发布线：版本号可以递增，但仓库只保留一个初版提交、一个标签和一个滚动更新的 Release；每次发布直接覆盖，不追加历史版本。

## 1.0.64 — 2026-11-12

- 密钥页顶部收口：两段安全说明合并为一行；7 天用量账本高度 74→46px、内边距和日期字号收紧，标题/统计/筛选仍保持同一视觉节奏，顶部不再喧宾夺主。
- 修复 MCP 筛选下拉的双重边框：去掉 n-select 根节点的内衬 padding 与 `.n-base-selection__border` 内框，只保留一层 30px 外框；搜索框同步去掉多余阴影。

## 1.0.63 — 2026-11-12

- 整体视觉验收收口：390 客户端矩阵的「CodeBuddy Code CLI / 通用远程 MCP」不再省略号截断，允许两行完整显示；审计页 390 的最后一张 KPI 卡自动整行铺满，并在表格上方显示「左右滑动查看全部 9 列」提示；1440/1024/390 全 tab 均无页面横向溢出。

## 1.0.62 — 2026-11-12

- Key Inspector 改为四个 tab：概览（动作/工具组/连接/可写连接统计 + 14 天请求 + 生命周期）、范围（15 组工具网格 + 连接权限）、调用（工具计数 + 最近调用）、记录（管理记录），不再把七段内容纵向堆在窄栏里。
- 桌面端检查器最小宽度从 330px 提升到 560px；390 窄屏统计卡两列、tab 仍保持四枚可点；tab 支持 ←/→/Home/End 键切换并移动焦点。

## 1.0.61 — 2026-11-12

- MCP 工具目录的「资源与提示词」补齐 MCP App：列表首位展示 `ui://esquerystudio/tool-console`（App 徽标、可点击读取原始 HTML），资源计数更新为 10 个（9 个只读资源 + 1 个 MCP App），与服务端/浏览器/本地 stdio 的 `resources/list` 对齐。
- 测试零跳过：Sdes 双版本对照 jar 由 `maven-dependency-plugin` 固定复制到 `target/sdes-alt`，demo-host 资产契约自适应定位仓库源码，构建产物契约缺产物即失败；新增 `scripts/check-zero-skipped.mjs` 阻断 Assume/@Ignore/skipIf，全量 Java 与 UI 均为 0 skipped。

## 1.0.60 — 2026-11-12

- MCP MRTR（multi round-trip requests / `input_required`）在服务端、浏览器桥、本地 stdio 三端落地：声明 `elicitation` 的 2026 客户端调用 `es_delete_by_query` / `es_delete_index` / `es_delete_doc` / `es_delete_data_stream` / 非 GET·HEAD 的 `es_rest` 时先返回 `input_required`，确认后带 `inputResponses` + `requestState` 重试才执行；拒绝执行返回 cancelled。
- 服务端 `requestState` 使用 HMAC-SHA256 签名并绑定工具名 + 规范化参数摘要 + 5 分钟有效期；浏览器/本地 Node 使用内存一次性状态并在过期时回收，篡改或重放状态直接拒绝。
- 三端契约测试与 `verify-local-mcp` 覆盖：未声明确认能力的旧客户端保持原行为，确认前不执行写操作，拒绝/篡改状态不执行。

## 1.0.59 — 2026-11-12

- Key Inspector 的 15 个工具组改为对齐网格（1440/1024 为多列，≤600 回退为紧凑芯片），组名与动作数/写动作数左右对齐，不再呈现参差换行。
- Inspector 内的连接权限、工具调用、最近调用列表取消 96px 内层滚动，改由右侧检查器整体滚动，消除被裁掉半行的芯片和双滚动条。

## 1.0.58 — 2026-11-12

- Key Inspector 的「工具范围」改为按 15 个 action 组默认汇总，每组显示动作数与写动作数；130 个细粒度动作折叠进「查看全部 130 个动作」，不再用 96px 滚动区铺满工具墙，也不会出现被裁掉半行的芯片。
- 组芯片保留写动作提示（`写N`），危险动作仍只在展开后的完整清单中以红色标注；1440 / 1024 / 390 三档无横向溢出，窄屏组芯片自然换行。

## 1.0.57 — 2026-11-11

- MCP Apps 扩展（`io.modelcontextprotocol/ui`）在服务端、浏览器桥与本地 stdio 三端落地：`resources/list` 暴露 `ui://esquerystudio/tool-console`（`text/html;profile=mcp-app`，带 `_meta.ui.csp` / `prefersBorder`），15 个 action 工具的 `_meta.ui.resourceUri` 绑定该资源；`capabilities.extensions` 同时声明 Tasks 与 Apps。
- 资源目录更新为 10 个（9 个只读资源 + 1 个 MCP App）；面板、协议基线、`docs/mcp.md` 与文档 SVG 同步计数。
- 三端补充 Apps 契约测试：能力声明、App 资源读取、每个 action 工具的资源绑定；`verify-local-mcp` 冒烟同步覆盖 `ui://` 资源。

## 1.0.56 — 2026-11-11

- MCP 控制台紧凑排版：收紧页头标题、Tab、信号条、卡片内衬、模式表行高、客户端步骤条、密钥空态与体检段间距；桌面与 390 窄屏均无横向溢出。
- `server/discover` 在服务端 / 浏览器桥 / 本地 stdio 三种模式统一返回 `serverInfo`；补充五版本、四传输与核心 tools/resources/prompts/completion 的协议覆盖矩阵；已实现 Tasks 扩展（显式 opt-in、tasks/get/update/cancel）；MCP Apps/MRTR/subscriptions 未声明。
- MCP 接入管理页升级为权限链路控制台：客户端 / 传输 / 凭证 / 连接范围 / 审计五段可点击，连接体检展示真实协议、工具数、资源数与耗时，首把密钥提供三档用途预设，客户端配置可一键测试，审计支持密钥/时间筛选、实时刷新与排障包复制。
- MCP 签发范围逐连接对齐：服务端返回每个连接真正可写的 `writeTools` / `writePages`，前端只为可写连接渲染写勾选；写工具无连接覆盖时直接阻止提交。普通用户的生产只读连接不再显示写控件，ADMIN 代签按目标用户实际角色与页面授权收窄。
- 修复审计表旧列表样式把 `tr` 设为 flex 导致表头与单元格错位的问题；审计表恢复标准 table-row 对齐，并在窄屏保留可横向滚动的完整列。

## 初版（滚动更新）— 2026-11-09

首个公开版本：为 Spring Boot 而生的 Elasticsearch 查询工作台。六种查询模式共用一个现场，同一套 Vue 控制台同时运行在 Spring Boot 服务端与 Chrome MV3 扩展浏览器模式。

### 查询工作台

- 六模式同页：DSL 构建器、ES-SQL、Lucene、查询沙盒、PIT 深分页与 SQL ⇄ DSL 语法桥；条件树、JSON、结果、直方图、历史与草稿不丢。
- mapping 感知补全、值枚举与语义 lint：字段类型、`text` / `keyword` 子字段、分词器、日期格式与可排序性都来自实时索引。
- 树 ⇄ 文本双向同步，含未知子句原文回退与嵌套 `bool`；一边无法结构化时不静默丢内容。
- 跨模式历史、收藏、草稿与可分享的 base64 DSL 深链。
- 结果面：表格 / JSON / Tree / 卡片视图、直方图、`took` / `_shards` / `totalGte` 诚实展示，CSV / Markdown / XLSX / NDJSON 导出。
- 相关性实验室：打分解剖（BM25 因子树）、排名侦探、查询 X 光、子句命中矩阵、Boost 调参、Profile 火焰图。
- SQL 控制台默认严格模式：数组字段不再被静默压成首值；宽容模式显式开启并标注「数组/多值字段只显示首值」；SQL 结果列保持原始值，数组以 JSON 展示，long / boolean 不再被值推断改写成 `410.0s` / `0%`。

### Chrome 扩展 / 浏览器模式

- 同一套 Vue 52 页控制台，在扩展内以 `browser` 构建直连 Elasticsearch；服务端模式与浏览器模式只切换 transport。
- 多个本机连接档案与顶栏切换，BASIC / API Key 认证，保存前真实 `ConnHealth` 探活；旧单档存储自动迁移。
- 索引 / Mapping / Setting / 别名 / 模板、快照 / ILM / SLM / Watcher、任务 / 节点 / REST / SQL / PIT / Reindex / Bulk、托管重建与跨集群迁移（客户端 scroll + bulk）均可用。
- 本机监控（IndexedDB 采样 + service worker 全档采样，关闭标签页后仍为每条连接写集群 / 每节点 / Top 索引行；受限账号只硬依赖集群健康，节点/索引明细失败时降级为空而不是把整条采样标红；关闭标签页后仍做阈值告警判定；监控环形保留 60k 行，覆盖 7 天窗口）、本机告警、操作审计（20k 行上限）、配置校验（L1 + temp-index dry-run）、配置漂移本机基线与系统索引本机作业锁。
- 浏览器模式的设置影响预估与护栏执行：本机 ES 7.10 DYNAMIC / STATIC / ILLEGAL 分类、L1 值校验、静态重建预估、页面内 confirmToken、真实 `PUT /{index}/_settings` 与本地 `GUARDED_ACTION` 审计。
- 首次启动只挂载一个浏览器连接对话框；地址 / 密钥错误留在对话框并显示真实错误，不再三套全屏引导同时出现。
- 诚实的边界：没有跨实例分布式锁与代码 provider，跨集群迁移在关闭标签页后需显式恢复，监控与审计只覆盖本机，不伪造离线历史。

### MCP 接入

- 服务端模式提供 `POST /mcp` JSON-RPC 2.0 端点（服务级 Bearer token，默认关闭；同时受 `web-enabled` 约束）与 `mcp/esquerystudio-mcp-stdio.mjs` stdio 桥，支持 Claude Desktop / Cursor 等 MCP 客户端。
- 服务端 MCP API key 管理：按登录人/角色签发与撤销、SHA-256 摘要存储、连接集合、**连接级 read/write（`connectionPermissions`，一把 key 可 QA/UAT 可写、生产只读）**、工具白名单、每分钟频率、日/月配额、有效期；发版后在面板/API 实时签发/编辑、立即生效、无需重启或改配置；`console.store=jdbc` 时落宿主 `esquerystudio_mcp_key` 表（自动补列迁移），`control-es` 时落控制集群索引，宿主可替换 `McpKeyStore` SPI（旧实现无覆盖时明确失败，不静默丢权限）；控制台 **Dev Tools → MCP → 密钥与用量** 提供管理面与用量视图，非 ADMIN 只能管理本人 key 且受页面授权收窄。
- 浏览器模式在页面内安装 `window.ESQueryStudioMCP`，页面内 AI / Agent 可直接处理 `initialize`、`tools/list`、`tools/call`；外部进程客户端不能直连浏览器标签页，HTTP key/限流只在服务端模式生效，边界与替代路径见 `docs/mcp.md`。
- 新增本地 Node MCP（`mcp/esquerystudio-local-mcp.mjs`）：Node 18+、无第三方依赖、stdio，支持多连接配置与 `es_list_connections`；可 `npm install -g .` 安装为 `esquerystudio-mcp` 命令，浏览器 MCP 面板可导出本机连接配置；本地 Claude Desktop / Cursor 不需要 Spring Boot 或浏览器即可直连 ES，写工具默认关闭，需 `--allow-write`。
- 支持 **MCP 2026-07-28**（最新稳定版，stateless `server/discover` + 缓存提示）并兼容 2025-11-25 / 2025-06-18 / 2025-03-26 / 2024-11-05 `initialize`；`tools/list`、`resources/list`、`resources/read`、`prompts/list` 统一返回 `ttlMs` 与 `cacheScope`。
- 客户端工具面为 15 个 action 型工具（内部保留 130 个细粒度兼容实现）+ 9 个只读资源 + 5 个引导提示词契约：连接发现、索引/mapping/文档/计数/DSL/SQL/explain、索引生命周期（建/删索引、mapping、settings、别名、rollover、merge、模板、数据流、克隆/收缩/拆分、Transform 生命周期）、批量 update/delete/reindex、分词配置/同义词/查询校验/词频取证、集群设置/reroute、分片诊断、节点/热点线程/插件/Watcher、快照/ILM/SLM、脚本、ingest pipeline 生命周期、文档写入、原始 REST 透传；`es_rest` 按“方法 + 路径”精确分类，POST `_search` / `_msearch` / `_count` / `_mget` / `_sql` / `_field_caps` 等查询不需要 write，未知 POST 与写 API fail-closed；浏览器/本地 Node 采用同一分类。key 用量额外持久化近 31 天 UTC 每日请求数（ES 与 JDBC 存储同契约），管理面展示近 7 天账本、近 14 天趋势并可导出 CSV。
- ES 6 / 7 / 8 / 9 兼容：服务端沿用 `EsIndexAdmin` 版本感知路径；本地 Node 探测版本并对 6.x SQL/explain/update typed 路由回退，7/8/9 使用 typeless；`es_rest` 跨版本逃生。
- 客户端接入向导覆盖 Claude Code、Cursor、CodeBuddy Code CLI、ZCode、TRAE、VS Code、Windsurf、Codex、DeepSeek Harness、OpenCode、Pi、Cherry Studio、Qoder、WorkBuddy、Antigravity 与通用 HTTP / stdio / 本地 Node；面板以客户端标签行展示，可复制或下载配置。`mcp/esquerystudio-mcp-cli.mjs` 提供 `list` / `detect --json` / `config` / `install`：Cursor / VS Code / Windsurf / OpenCode / Qoder / TRAE / CodeBuddy / ZCode / WorkBuddy / Pi / Antigravity 安全合并写入，Claude Code 输出 `.mcp.json` 与 `claude mcp add` 命令，Codex 输出官方 `~/.codex/config.toml` TOML，不覆盖已有服务器；`detect --json` 逐家回报 CLI 在 PATH（`commandFound`）、官方配置路径（`configFound`）、配置里是否已有 `esquerystudio`（`installed`，读不懂为 `null`），`install --local` 可把客户端直接接到本机 Node stdio 桥。
- 权限一致性：系统管理工具（Transform / Watch / SLM / Snapshot repository / Ingest pipeline / `es_cluster_state`）在工具目录、签发清单和执行面统一限定 ADMIN 角色；ADMIN 代签低角色 key 时同样不能勾选这些工具，避免“签发成功但永远不会下发”的漏权快照；工具目录以「仅 ADMIN」标签显式标注。`es_rest` 的 `readOnlyHint` 固定为 `false`（动态读写、`destructiveHint: true`），写-only key 也可签发并使用原始 REST 写路径。使用 API key 的 `GET /mcp` 服务卡会返回 `role`、`connections`、`permissions`、`connectionPermissions`，Agent 首次连接即可读取真实读写范围。每次 MCP JSON-RPC 调用留档 `method`/`tool`/`requestId`/`ip`/`remoteIp`/`ua`/`http`/`ok`/`ms`，key 持久化最近 100 条并在服务端输出 `[mcp-call]` 日志，便于按调用方 IP 定位；认证/鉴权失败输出 `[mcp-denied]`（状态码/code/命中 key 前缀/requestId/IP/HTTP 方法路径/UA），响应头统一回写 `X-Request-Id` 供前后端关联排查。
- 传输兼容：除 Streamable HTTP（`POST /mcp` + `GET /mcp` 服务卡）外，新增旧版 HTTP+SSE 兼容端点 `GET /mcp/sse` + `POST /mcp/message?sessionId=...`；`GET /mcp` 在 `Accept: text/event-stream` 时自动切换事件流。SSE 每条 POST 都重新认证，权限不会因长连接固化；WorkBuddy / 早期 SDK 选择 SSE 时可直接接入。
- 工具分组：客户端 tools/list 返回 15 个 action 型工具，覆盖 130 个细粒度操作；旧细粒度工具名仍可直接调用。签发面板保留 130 个兼容动作白名单与四档工具包，默认 32 个核心查询动作；分组后客户端不再一次加载 130 个工具。
- CI 依赖源：`ui/package-lock.json` 的 tarball 统一指向 `registry.npmjs.org`，避免 npmmirror 单个包表缺失导致 CI/Release 全量失败（环境故障，不是代码失败）。
- 工具目录分组视图：MCP「接入与工具」默认展示 15 个 action 组及 action→legacy 映射，点击 action 直接带入细粒度试跑；「细粒度兼容（130）」保留完整旧目录。分组目录按组折叠，默认仅展开首组，搜索或权限筛选自动展开命中分组，440px 内可直接看到全部 15 个组名，不再为 130 个 action 拉出数千像素长滚动。
- 工具筛选窄档：权限类型下拉在 1440/768/390 三个宽度都完整显示「全部权限 / 仅 ADMIN」，不再出现「全部…」截断；390px 下筛选行与 action 按钮保持单列可点。
- CLI 帮助：`esquerystudio-mcp-cli --help` 明确列出 `--transport http|sse` 与 WorkBuddy SSE 示例；`install/config` 的 `--transport sse` 与 `--local` 互斥说明同步到帮助文本。
- 密钥页交互重塑：密钥从横向窄表改为卡片台账，每把 key 直接显示状态、角色、归属、连接/工具范围、日/月用量与最近使用；`复制前缀` 一键复制并显示真实结果，`审计 / 详情 / 更多` 分组动作不再被表格右缘裁切；`更多` 提供编辑、轮换（明确旧 key 立即失效）、撤销、精简和以此为模板签发；编辑/克隆会自动滚回表单并聚焦名称。
- 完整 key 复制修复：签发与轮换改为一次性明文弹窗，自动聚焦「复制 key」，支持全选、下载 `.env` 与可粘贴客户端配置；弹窗不可被 Esc/遮罩误关。全站复制改走 `copyText` 三层管线（Clipboard API → copy 事件权威写入 → 焦点门），修复 HTTP 非安全上下文（如 QuoteHub 内网 IP）下 `navigator.clipboard` 不存在导致「点了复制没反应」的实报；失败时会全选 key 并提示 Ctrl+C。
- WorkBuddy / 客户端接入排障：接入页新增「连不上？先核对三件事」——完整端点必须含宿主 context-path（如 `/quotehub/mcp`）、`Unexpected token '<'` 表示打到了网页/404、`MCP_KEY_REVOKED` 表示旧 key 已撤销/轮换；补充 WorkBuddy `~/.workbuddy/mcp.json` 的 `type: "http"` 示例。`[mcp-denied]` 日志新增命中的 key 前缀与 HTTP 方法/路径，后端可直接定位「谁还在用旧 key」。
- 托管重建目标名修复：向导不再复用 sessionStorage 中上一轮/上一索引的 `*_adhoc_<时间戳>` 目标名（实报恢复到 9 天前的名字导致撞名）；进入向导或切换源索引即清空目标名，由本次 prepare 重新生成；服务端建议名遇到已存在索引/别名时自动顺延 `_2`，并在前端新增回归测试。
- 工具试跑 action 视图：试跑区可勾选「以 action 组调用（客户端视图）」，用 legacy schema 填参但真实发送 `es_indices` + `action=create` 形态；面板会显示将要调用的组/action，验证客户端真实路径。
- 签发 API 兼容 action 组名：`allowedTools` 可直接传 `es_indices`、`es_documents` 等非同名组，服务端展开为该组 legacy action 后仍逐项校验权限；同名 `es_search`/`es_sql`/`es_rest` 保持 legacy 语义。
- 密钥签发分组视图：MCP 面板默认按 15 个 action 组展示，action 勾选仍落到 legacy 白名单；「显示 130 个兼容细粒度工具」保留高级排障入口，默认不再铺 130 个复选框。
- 调用留档细化：分组调用在 `tool` 字段记录 `组:action`（如 `es_indices:create`），服务端 `[mcp-call]`、key `recentCalls`、浏览器/本地 `recentCalls` 同口径；权限仍按 legacy 工具名判定。
- 推荐工具按凭证收敛：`GET /mcp`、`server/discover`、`initialize` 的 `recommendedTools` 与 `maxRecommendedTools` 不再对受限 key 固定返回 15 组，只列其 `allowedTools` 命中的组（服务 token 仍为 15 组）；客户端预载不会先撞未授权组。`allowedTools` 传 action 组名时仍逐项校验读写权限，组内含写 action 而 key 无 write 会明确拒绝，避免静默漏发。
- 代签权限 fail-closed：宿主未接入 `McpKeyOwnerResolver` 时，ADMIN 代签他人 key 只能签发 VIEWER 只读 key；请求写权限或更高角色一律 403，不再信任请求体自报角色。修复了宿主委托身份下 VIEWER key 可携带 `connectionPermissions: write` 的越权口子；已撤销存量 `VIEWER + write` 测试 key。自动配置现在优先消费宿主 `McpKeyOwnerResolver` bean（回落内置用户目录）；QuoteHub 已按宿主角色映射接入，ADMIN 代签 OPERATOR 写 key 可正常放行，不再误拒合法签发。
- MCP 独立菜单与深塑：新增「开发者工具 → MCP 接入」独立页 `/mcp`（顶栏 MCP 按钮仍可快速打开同一面板），左侧 01–05 流程轨（连接 / 工具目录 / 客户端 / 密钥 / 调用审计）+ 顶部 HTTP/SSE/协议链路条；工具目录改为全宽注册表 + 试跑双栏，连接页用三张模式卡把服务端 HTTP、浏览器内桥、本地 Node stdio 同屏对齐。
- 调用审计独立面：汇总当前身份可见 key 的 `recentCalls`（ADMIN 全部、普通用户仅自己的 key），新增 KEY / 方法 / 工具 / 成功失败 / 来源 IP / UA / HTTP / 耗时 / requestId 列，支持关键字与状态过滤、requestId 一键复制、CSV 导出；也可填入单个 key 查看该凭证的最近调用。审计读取复用 key 管理端点，不新增伪造数据源。
- 审计入口联动：每行密钥新增「审计」动作，跳转调用审计并自动按该 key 前缀过滤；审计空态提供「去工具目录」入口，首次使用不需要自己猜从哪里发起调用。
- 审计留档加深：每个 key 的 `recentCalls` 与 service token 进程内环形缓冲从最近 20 条提升到最近 100 条；审计 CSV 增加 KEY 名称 / 前缀列。工具页在 390px 下 SSE 兼容地址自动换行，不再把页面撑出 13px 横向溢出。
- 顶栏入口收口：顶栏 MCP 按钮直接进入 `/mcp` 独立控制台，不再先跳 DevTools 再弹模态；`devtools` 或 `mcp` 任一页面授权都能进入，页面门与密钥 API 权限同口径。
- MCP 控制台 2.0 深塑：顶部改为「客户端 → 传输 → 权限 → 集群」信号链 + 01–05 工作台标签；接入页用一张矩阵对齐服务端 / 浏览器桥 / 本地 Node 的入口、身份、留档与边界，并给出端点自检/curl/probe 三条 30 秒验证命令；客户端页改为可搜索的客户端矩阵（含 DBX MCP Server 的「非客户端」边界）；密钥页改为台账 + Key Inspector 双栏，点击密钥在右侧查看工具白名单、逐连接读写、近 14 天请求与最近调用留档，签发工作台增加身份/连接/写权限/工具面实时预览与逐连接 read-write 权限矩阵。
- 角色 × 密钥 × 端点读写一致：签发时写工具必须命中该工具所属页面的 `conn:{id}:w:{page}`（不再以「连接上任意写页面」放行）；内置身份无页面模型时按角色门（OPERATOR+ 可逐连接写、VIEWER 只读）；ADMIN 代签先读 `owner-scope`（目标角色/页面授权可解析性/可签发连接/工具/配额），连接、工具、写权限、配额与有效期上限全部按目标用户角色收窄；`connectionPermissions` 在签发/编辑时补全为每个所选连接的显式快照，管理面看到的范围就是端点执行范围；ADMIN 代签 ADMIN 目标保持全量，页面授权不可解析时 fail-closed 到宿主连接。
- 调用留档三面对齐：浏览器桥与本地 Node `recentCalls` 从 20 条提升到 100 条，补齐 `requestId` / `transport` / `http`；服务端调用留档新增 `transport`（http/sse）并持久化；调用审计表新增来源列、整行展开详情（origin / pid / host / UA / HTTP / requestId）与整条 JSON 复制。
- 密钥复制与客户端接入闭环：密钥台账新增「复制 key」「接入配置」动作——最近签发/轮换的完整 key 仍在页面内存时直接复制，否则明确询问是否轮换生成新 key（不再让人误以为前缀就是 key）；「接入配置」自动带入可用 key 跳到客户端配置并滚动定位到配置区，签发/轮换成功弹窗新增「去客户端接入 →」。调用审计改为默认汇总可见 key，service token 仅作可选附加来源；凭证失效不再把 93 条历史清空为 0，并显示附加凭证失败原因。
- CLI 友好接入：新增 `probe --url ... --token ...`，真实执行 `initialize` + `tools/list` 并读取服务卡，输出协议、工具数、key 角色、连接与逐连接读写；`detect --json` 增加 `role: client|server`，识别 DBX 0.6+ 是 MCP Server 而非客户端并给出「同一 Agent 并列注册两个 server」的落地指引。
- 签发表单工具组折叠：新建/编辑 key 的可用工具默认按 15 组折叠，组头显示已选/总数，组内「全选/清空」保留；支持「展开全部/收起全部」和搜索自动展开，避免一打开就铺满 130 个复选框。
- 连接页链路图：新增「客户端 → MCP Bridge → Elasticsearch」三段式信号链路，展示客户端接入面、当前端点/协议和当前连接/读写收窄；桌面横向、390px 纵向堆叠，不靠装饰图表达状态。
- 客户端接入补全：Codex / DeepSeek Harness / Cherry Studio 也显示 CLI 安装命令；客户端页新增「复制检测命令」，可直接执行 `detect --json` 识别本机已装客户端。
- 页面契约新增 `mcp`（devx 组，路由 `/mcp`），控制台页面数 52 → 53；文档、架构 SVG、发布说明同步更新。
- 15 个 action 组：`es_connections`、`es_search`、`es_sql`、`es_documents`、`es_indices`、`es_data_streams`、`es_templates`、`es_analysis`、`es_cluster`、`es_batch`、`es_transforms`、`es_snapshots`、`es_lifecycle`、`es_automation`、`es_rest`；服务端、浏览器桥、本地 Node 使用同一 action→legacy 映射，门禁校验 130 个 legacy 操作全部有归属，并按 key 的 allowedTools 只暴露已授权 action。
- 资源展示名：`resources/list` 的连接资源改用人类可读名称（如 `连接 · 生产集群`），不再把 `connection-<hash>` 暴露给客户端 UI；模板名统一为「连接详情 / 集群概览 / 索引目录」等中文标签，三种接入面一致。
- 窄档签发表单：≤720px 时「连接集合 / 写权限连接」改为单列，390px 下不再把「允许写入」挤成竖排；工具包按钮自动换行，弹窗宽度保持在视口内。
- 服务卡工具预算：`GET /mcp`、`server/discover` 与 `initialize` 增加 `recommendedTools`（15 个 action 组）和 `maxRecommendedTools: 15`；服务端、浏览器桥、本地 Node 三面同字段，Agent 首次发现即可按分组加载。
- SSE 客户端接入：MCP 面板新增「Streamable HTTP / SSE 兼容」传输切换，SSE 模式生成 `/mcp/sse` 地址与 `type: "sse"` 配置；`esquerystudio-mcp-cli` 新增 `--transport sse`，自动把 `.../mcp` 映射到 `.../mcp/sse`，Claude Code / Codex / DeepSeek Harness / WorkBuddy 等客户端分别输出对应传输配置。
- ADMIN 代签写权限：目标用户角色低于 OPERATOR 时，代签 key 不得携带全局或连接级 `write`；已存在 key 编辑同样校验，避免 ADMIN 给 VIEWER 造出控制台本人无法执行的写权限。

### 平台

- 可嵌入 Spring Boot starter 与独立 server：同一能力集，三种交付形态（独立 jar、嵌入式模块、宿主 SPI）；README 新增「三种交付形态」「宿主集成」「MCP 三接入面」三张矢量架构图，宿主安全放行 `/mcp` 的边界同步写入文档。
- 52 页 / 13 分组 / 11 功能包，支持按包与单页裁剪；功能包是部署选择，页面级读 / 写授权独立执法。
- 页面契约 `META-INF/esquerystudio-pages.json` 是前端导航、后端页面门与宿主菜单注册器的唯一事实源。
- `ConsoleHostIntegration`、`ConsoleAuthDelegate`、`ConnStore`、`ConsoleAuditContributor` SPI；不硬编码任何宿主业务模型。
- 索引生命周期：零停机别名翻转重建、跨集群迁移、Reindex 预估、快照 / SLM / ILM 与删除复活补偿。

### 质量与安全

- 前端 1,521 个文件 / 12,259 例全绿；Java 1,659 例全绿，覆盖认证、页面授权、重建状态机、映射对账、跨集群迁移、MCP key 权限/配额/持久化与 REST 语义分类。
- 真实浏览器验证：Mock ES + 真实控制台，覆盖补全、lint、导航裁剪、深链停用页与权限矩阵。
- 反向对照：非法契约、未知功能包、空页面授权等失败样本先红后绿，不靠「没报错」证明正确。
- 可复现发布：固定 `project.build.outputTimestamp`，release profile 产出 sources / javadoc / SBOM，同一源码重复构建 SHA-256 一致。
- 纯前端对齐门 `scripts/check-browser-parity.mjs`：`api.ts` 端点、后端 Controller 映射与页面契约前缀必须由 `browserApi` 覆盖，或登记到有原因的服务端独占白名单；CI 阻断，避免只实现服务端。
- MCP 契约对齐门 `scripts/check-mcp-parity.mjs`：服务端 `McpController`、纯前端 `browserMcp.ts` 与 `docs/mcp.md` 的工具名/描述必须一致；附负控，CI 阻断。
- 本地 Node MCP 冒烟门 `scripts/verify-local-mcp.mjs`：无 Spring Boot 启动 stdio，验证多连接发现、读工具、写工具默认关闭与 `--allow-write` 后直连 ES HTTP。
- CodeQL、OpenSSF Scorecard、Dependency Review 与 Dependabot 已启用；安全更新保持开启，版本更新 PR 在 1.x 发布线暂停。
