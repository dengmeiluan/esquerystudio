## ESQueryStudio 查询工作台 · 初版（滚动更新）

**为 Spring Boot 而生的 Elasticsearch 查询工作台。** 一套原生 Vue 控制台，两种 transport：Spring Boot 服务端模式与 Chrome MV3 扩展浏览器模式。

### 1.0.64 本轮

- **密钥页顶部收口**：两段安全说明合并一行，7 天账本高度 74→46px；MCP 下拉筛选去掉 n-select 内层边框与根节点内衬，只保留一层 30px 外框，修复「双重边框」观感。
- **整体视觉验收**：390 客户端矩阵「CodeBuddy Code CLI / 通用远程 MCP」允许两行完整显示；审计页 390 的 KPI 最后一项整行铺满并显示「左右滑动查看全部 9 列」；1440/1024/390 全 tab 无页面横向溢出。
- **Key Inspector 按 tab 重组**：概览（130 动作 / 15 组 / 6 连接 / 2 可写连接统计、14 天请求、生命周期）、范围（15 组网格 + 逐连接权限）、调用（工具计数 + 最近调用）、记录（管理记录）四页切换；桌面检查器最小宽度 560px，390 窄屏统计两列，tab 支持方向键/Home/End。
- **MCP App 资源进目录**：工具目录资源区首位展示 `ui://esquerystudio/tool-console`（App 徽标、点击读取原始 HTML），资源计数 10 个（9 只读 + 1 App），与服务端/浏览器/本地 stdio 的 `resources/list` 对齐。
- **MRTR 二次确认**：声明 `elicitation` 的 2026 客户端在高危写操作（delete by query / delete index / delete doc / delete data stream / 非 GET·HEAD 的 es_rest）前收到 `input_required`，确认后带 `inputResponses` + `requestState` 重试才执行；服务端状态 HMAC 签名并绑定工具与参数摘要，浏览器/本地 Node 使用一次性内存状态。
- **Key Inspector 工具范围收拢**：默认按 15 个 action 组汇总（动作数 + 写动作数），130 个细粒度动作折叠进「查看全部」，不再用 96px 滚动区铺满工具墙；组芯片按对齐网格排列，≤600 回退为紧凑芯片；检查器内列表取消内层滚动，消除半行裁切与双滚动条。
- **MCP 协议扩展补齐**：Tasks（`io.modelcontextprotocol/tasks`）与 MCP Apps（`io.modelcontextprotocol/ui`）在服务端、页面内桥、本地 stdio 三端同步声明；`resources/list` 提供 `ui://esquerystudio/tool-console`（`text/html;profile=mcp-app` + `_meta.ui.csp`），15 个 action 工具通过 `_meta.ui.resourceUri` 绑定，资源目录更新为 10 个。
- **完整 MCP key 可复制**：签发/轮换时把完整 key 以 AES-256-GCM 密文持久化（ES 索引或宿主 JDBC 表），owner/ADMIN 可随时「复制 key」或从「接入配置」带入客户端；旧版本未保存明文的 key 首次复制会明确询问轮换（旧 key 立即失效）。
- **调用审计 ≥7 天**：每次 MCP 调用独立落一条审计（method / tool / requestId / IP / UA / HTTP / transport / 成败 / 耗时），默认保留 30 天；`GET /internal/es/index/mcp/keys/calls` 按 key/角色收窄；浏览器桥与本地 Node 同步持久化。
- **老版本 ES 兼容可见**：连接测试与顶栏切换器直接显示 `version.number`；6.x 显示「兼容」并按 `minVer` 禁用 7.x 专属能力；README 覆盖 6.7–9.x。
- **纯静态目录部署**：`npm run build:static` 输出 `dist/esquerystudio-static/`（相对路径 + hash 路由 + CORS 说明），Release 附 `esquerystudio-static-<version>.zip`，无需 Spring Boot 或扩展即可直连 ES。
- **可视区重塑**：MCP 页改为 `height:100%` 填满宿主内容区（去掉 86vh/210px 猜高），头部/信号条/阶段头压缩，嵌入 QuoteHub 后操作区从约 390px 提升到 590–650px；ES-SQL 有结果时编辑器收至 22vh，把高度还给结果表。

### 为什么是 ESQueryStudio

- **六模式共用一个现场** —— DSL 构建器 + 原始编辑器、ES-SQL、Lucene、查询沙盒、PIT 深分页、SQL ⇄ DSL 语法桥共享条件树、JSON、结果、直方图、历史、收藏与草稿。
- **真正懂 ES 的语义层** —— 实时 mapping、analyzer、字段角色、可排序性与集群版本共同驱动补全、lint、值枚举和执行前检查；树 ⇄ 文本双向同步，未知子句退回原文。
- **相关性实验室** —— 打分解剖（BM25 因子树）、排名侦探、查询 X 光、子句命中矩阵、Boost 调参、Profile 火焰图。
- **一套源码，两种形态** —— 同一套 53 页 Vue 控制台运行在 Spring Boot 服务端与 Chrome MV3 扩展；浏览器模式直连 Elasticsearch，多本机连接档案、本机监控（关闭标签页后仍写集群 / 每节点 / Top 索引行并继续判定阈值告警）/ 审计 / 作业 / 护栏执行。
- **MCP 接入** —— 服务端 `POST /mcp` JSON-RPC 2.0（服务 token / 按用户与角色签发的 API key；15 个 action 型工具（覆盖 130 个细粒度操作）+ 9 个只读资源 + 1 个 MCP App + 5 个引导提示词（MCP resources/prompts）覆盖索引生命周期：建/删索引、mapping、settings、别名、rollover、merge、模板、数据流、克隆/收缩/拆分、Transform 生命周期，批量 update/delete/reindex、分词配置/同义词/查询校验/词频取证、集群设置/reroute、分片诊断、节点/热点线程/插件/Watcher、快照/ILM/SLM、脚本、ingest pipeline 生命周期、settings/aliases/templates/nodes/tasks/stats 与按路径语义精确分类的原始 REST 透传）与 stdio 桥；ADMIN 可为 key 指定连接集合、**连接级 read/write（一把 key：QA/UAT 可写、生产只读）**、工具白名单、频率、日/月配额与有效期；key 发版后在面板/API 实时签发/编辑、立即生效，可持久化到控制集群 ES 或宿主 JDBC；控制台内置「密钥与用量」管理面（含近 14 天请求趋势）；浏览器模式安装 `window.ESQueryStudioMCP`；另附本地 Node MCP（多连接、stdio、无第三方依赖、可 `npm install -g`，浏览器可导出连接配置，写工具默认关闭），本地 Claude Desktop / Cursor 无需 Spring Boot 或浏览器；面板可搜索客户端矩阵与 `esquerystudio-mcp-cli`（`list` / `detect` / `probe` / `config` / `install`）覆盖 Claude Code、Cursor、CodeBuddy Code CLI、ZCode、TRAE、VS Code、Windsurf、Codex、DeepSeek Harness、OpenCode、Pi、Cherry Studio、Qoder、WorkBuddy、Antigravity——`detect --json` 逐家回报 PATH/配置路径/已接入三态，`probe` 一条命令验证端点/key/实际权限，`--local` 可把客户端直接接到本机 Node stdio 桥；系统管理工具统一仅 ADMIN 角色可签发与调用，ADMIN 代签低角色 key 时同样不能超发。每次 MCP 调用与拒绝都会留档 method / tool / 客户端 IP / UA / HTTP 方法路径 / `X-Request-Id` / 耗时 / 成败（服务端持久化审计默认保留 30 天、最低 7 天；浏览器桥 localStorage 保留 30 天；本地 Node 追加 `~/.esquerystudio/mcp-audit.jsonl`；key 详情保留最近 100 条预览），`[mcp-denied]` 额外记录命中的 key 前缀与请求路径，日志 `[mcp-call]` / `[mcp-denied]` 可用 `requestId` 关联排查。密钥页已重塑为签发工作台：左侧密钥台账（复制前缀即时反馈、审计/详情/更多分组动作），右侧逐连接 read/write 权限矩阵、身份/连接/写权限/工具面实时预览与目标用户范围校验（ADMIN 代签先读 `owner-scope`，按目标角色/页面授权收窄）；签发与轮换用一次性明文弹窗（自动聚焦复制、全选、下载 `.env`、可粘贴客户端配置，Esc/遮罩不可误关）；所有复制走 Clipboard API → copy 事件权威写入 → 焦点门三层管线，修复 HTTP 非安全上下文（QuoteHub 内网 IP）下点复制无反应的实报。客户端接入页内置「连不上？先核对三件事」：完整端点含 context-path、`Unexpected token '<'` 是打到网页/404、`MCP_KEY_REVOKED` 是旧 key 已撤销或轮换，并给出 WorkBuddy `~/.workbuddy/mcp.json` 的 `type: "http"` 示例。传输同时支持 Streamable HTTP 与旧版 HTTP+SSE（`/mcp/sse` + `/mcp/message`）；`esquerystudio-mcp-cli` 的 `install/config` 支持 `--transport sse`，会自动把 `.../mcp` 映射为 `.../mcp/sse`。客户端 tools/list 已收敛为 15 个 action 组，签发面板也按 15 组 action 勾选（130 个细粒度工具收进高级排障开关），分组调用的留档 tool 记录为 `组:action`（如 `es_indices:create`）；控制台左侧新增「开发者工具 → MCP 接入」独立页（`/mcp`），以顶部信号链 + 01–05 工作台标签组织接入总览、工具目录、客户端、密钥与调用审计，调用台账汇总当前身份可见 key 的最近调用并支持 IP / UA / requestId 检索与 CSV 导出；资源列表使用人类可读名称，不再暴露 `connection-<hash>`。
- **宿主优先、可裁剪** —— 53 页、13 分组、11 功能包；页面契约是导航、页面门与宿主菜单的唯一事实源；`ConsoleHostIntegration` + 认证 / 连接目录 / 审计 SPI。
- **可验证的工程交付** —— 前端 1,521 个文件 / 12,259 例全绿，Java 1,659 例全绿，覆盖认证、页面授权、重建状态机、映射对账、跨集群迁移、MCP key 权限/配额/持久化与 REST 语义分类；真实浏览器探针、权限矩阵、可复现构建、SBOM、CodeQL、OpenSSF Scorecard。托管重建向导另修复目标名复用旧草稿导致撞名：进入向导或切换源索引即清空，由本次 prepare 生成，遇到已存在索引/别名自动顺延。

### 交付物

- **Chrome 扩展** —— `esquerystudio-chrome-1.0.64.zip`：同一套 Vue 控制台在扩展内直连 ES；解压后在 `chrome://extensions` 加载已解压的扩展程序。浏览器模式保留索引 / Mapping / Setting / 别名 / 模板、快照 / ILM / SLM / Watcher、任务 / 节点 / REST / SQL / PIT / Reindex / Bulk、托管重建、跨集群迁移、配置校验、配置漂移、系统作业锁与护栏执行。
- **独立服务端** —— `esquerystudio-server-1.0.64.jar`：JDK 8+，`java -jar` 后打开 `http://localhost:5601/esquerystudio.html`。
- **嵌入式模块** —— `esquerystudio-console-1.0.64.jar` + `esquerystudio-platform-1.0.64.jar`：接入 Spring Boot 宿主，认证、连接目录、审计与品牌均可通过 SPI 接管。
- **可复现材料** —— sources / javadoc / SBOM 与 `SHA256SUMS` 一并附上；ES 客户端栈由宿主以 provided 契约自备。

### 链接

- 在线演示（合成数据，点开即玩）：<https://dengmeiluan.github.io/esquerystudio/demo/>
- GitHub：<https://github.com/dengmeiluan/esquerystudio>
- 文档索引：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/README.md>
- 宿主接入：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/integration/README.md>
- LINUX DO 社区：<https://linux.do>

> 发布线约定：「初版（滚动更新）」是唯一 Release；版本号可递增，但只保留一个标签、一个提交，资产直接覆盖更新。
