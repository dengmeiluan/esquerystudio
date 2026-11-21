## ESQueryStudio 查询工作台 · 初版（滚动更新）

**为 Spring Boot 而生的 Elasticsearch 查询工作台。** 一套原生 Vue 控制台，两种 transport：Spring Boot 服务端模式与 Chrome MV3 扩展浏览器模式。

### 1.0.81 本轮

- **MCP 客户端接入面 24→26 品牌**：新增 Crush（Charm TOML）与 JetBrains AI Assistant（`.idea/mcp.xml` XML，IntelliJ/GoLand/PyCharm 2025.2+，stdio 桥自动配置）；Cline / Roo Code / Kilo Code 补 Linux 路径探测。
- **等价验证弹层聚合对比**：verify_equivalence 的 aggregation 结果可视化（match 徽标/差异表/单侧清单）+ 可选聚合字段带聚合重跑；在途防重入 toast 提示。
- **一致性三刀**：naive Tooltip 与 v-tip 气泡亮暗双主题显式对齐；任务级恢复提示浏览器模式路由判定对称化；草稿凭据掩埋补对象值深遍历（嵌套明文对象值此前漏掩埋）。
- **可验证交付**：verify-mcp-cli 28 家断言绿；五门禁全绿。

### 1.0.80 本轮

- **MCP 客户端接入面扩容 15→24 品牌**：新增 Claude Desktop（stdio 桥自动配置）、Cline / Roo Code / Kilo Code（VS Code 插件，安全合并写入）、Gemini CLI（httpUrl 方言+CLI 命令）、GitHub Copilot CLI、Zed（context_servers 形态）、Continue（YAML）、Amp——面板可搜索矩阵与 `esquerystudio-mcp-cli` 同批对齐，`detect --json` 跨平台路径探测；面板退役指向已 404 端点的「SSE 兼容」toggle，传输统一 streamable HTTP。
- **可验证交付**：verify-mcp-cli 26 家断言绿；UI 12,905 例全绿；parity/浏览器/零跳过/文档链接门禁全绿。

### 1.0.79 本轮

- **迁移后等价性验证（MCP 第 167 个 action，三端同契约）**：`es_xmigrate verify_equivalence`——双侧计数对比 + 抽样摘要逐 id 对比 + 可选聚合对比，`jobId`（复用作业登记）或 `srcConnId+sourceIndex` 双形态，verdict 三态诚实口径（取数失败判 INCONCLUSIVE 不冒充比对过）；迁移页 DONE 行一键「等价验证」弹层 +「完成后自动等价验证」默认开 + 批量链 verdict 矩阵；`migrate_index`/`cross_cloud_structure_sync` 提示词升级为含数据终验的完整跨云链路。
- **全站原生 title 清零**：v-tip 全局指令（单例浮层/视口翻转/长文滚动档/模态内可见/键盘与触屏通道/reduced-motion）替换约 100 文件千余处原生 title 与 80 余处组件 fallthrough，质量门禁升级为零容忍；spec 断言四形态全量随迁至浮层行为断言范式。
- **迁移页五维补全**：事件时间线钻取/搜索/JSONL 导出、详情深链、速率曲线持久化、方案预设、diff_structure UI 化、三步向导点亮+全链 CTA、verify 落事件线、SparkLine×时间线联动定位、workbench 草稿跨会话（凭据掩埋不落盘）。
- **MCP 口径统一**：es_xmigrate 组 schema 十参数硬化、全组工具 annotations 四 hint（parity 派生自检）、四端七处文案/参数口径差收敛。
- **可验证交付**：Java console 全量 1,981 例 0 失败 0 跳过；UI 12,904 例全绿；mcp-parity（17 组/167 action）/ browser-parity / doc-links / zero-skipped / verify-local-mcp / typecheck 门禁全绿。

### 1.0.78 本轮

- **跨云结构同步 v3**：`sync_structure` 执行守恒——`planDigest` 计划摘要 + `expectPlanDigest` 漂移门（dryRun 后源结构漂移 409 PLAN_DRIFT 零意外执行）、`body` 适配后建索引体预览；`compare_capabilities` 能力对比风险矩阵与 `diff_structure` 跨集群结构 diff（计划内剔除豁免三形态）；运行中动态调速 `throttle`；别名元数据（filter/routing）随迁透传。
- **迁移页与重建页观测升级**：事件时间线筛选芯片+数据身份守卫自动滚动+跨天分组段头；速率 SparkLine；三端行为语义统一（错误码三态/降级回退/参数边界矩阵/vendor-private 键归属模型）。
- **可验证交付**：Java console 1,968 例、UI 12,798 例全绿，五门禁全绿。

### 1.0.77 本轮

- **跨集群迁移兼容矩阵（生产 → UAT 跨厂商结构同步）**：`probe_capabilities` 探测源/目标集群厂商（阿里云/腾讯云/AWS/Elastic/OSS/未知六档，附判定依据 evidence 可回查）、版本、插件清单与节点拓扑（第 163 个 MCP action，服务端/浏览器/本地 stdio/文档四端契约逐字对齐）；兼容矩阵八规则主动预剔除——apack 私有设置、TTL、路由分配属性、目标缺失插件的分析组件（级联剔除引用它的自定义 analyzer 并降级字段）、缺失 ILM 策略五类剔除，分片数/副本数/存储介质三类建议不动数据，每刀带中文理由；`sync_structure` v2 报告（planned 预剔除计划 / reactive 建索引报错兜底 / aliases 别名随迁 / advice 建议 / warnings），`dryRun` 预览零写、执行按事实回报（skipped + synced 恒等于源别名总数）。
- **迁移页旗舰流**：兼容计划预览弹层（源/目标厂商芯片对、每刀理由、vendor 判定依据悬停可查）、dry-run 预览、别名随迁开关；批量迁移渐进提交 + 失败重试 + 前缀映射预设（本地记忆）；详情事件时间线（筛选 + 新事件自动滚动）；冲突样本游标分页拉满（服务端游标 / 浏览器单页双形态兼容）；右键菜单（克隆作业 / 导出快照）、迁移健康摘要、作业停滞告警。
- **托管重建增强**：重跑参数覆盖（限速/并行/批大小，-1 = 不限速）、文档数终态对账（源索引 404 时如实标「源已删，仅快照可比」）、事件时间线随重跑刷新 + 轮询静默更新。
- **MCP 编排指引增强**：`migrate_index` 提示词插入结构兼容步骤（先 probe 能力 → dry-run 预览剔除计划 → 确认后执行），本地 Node stdio 全链支持 probe/dry-run/别名随迁/断点台账。
- **高质量组件收口**：长 title 存量 13 处全量迁移 Tip 统一件（门禁白名单归零 = 零容忍）、手搓 1024 换算 3 处退役；分区折叠与前缀预设存储收口 writeStoredRaw 单源。
- **可验证交付**：Java console 全量 1,918 例 0 失败 0 跳过；UI 12,708 例全绿；mcp-parity（17 组 / 163 action）/ browser-parity / doc-links / zero-skipped / verify-local-mcp / typecheck 六门禁全绿。

### 1.0.76 本轮

- **重建迁移群治理与可观测闭环**：跨集群迁移作业历史可治理（REST DELETE 单删终态/按天清理 + 行级删除入口）；迁移对账读面补齐（reconcile 双侧文档数比对 + conflicts 冲突样本环）；托管重建事件时间线三端落地（事件环封顶 200 条、GATE 琥珀高亮、终态着色）。
- **跨集群结构同步·兼容性自适应首版**：sync_structure 四端落地，目标多轮试建（≤20 轮）按 ES 报错自动剔除厂商私有 setting 与不可用分析组件并降级字段引用，报告逐项说明「剔了什么、为什么」。
- **本地 stdio MCP 编排内核**：scroll+bulk 搬运、断点台账（重启标 INTERRUPTED）、托管重建/迁移探测/续跑/对账全链；MCP 17 组 / 162 action。纯前端迁移并行搬运（sliced scroll ≤4 路）与 bulk create 语义修复。

### 1.0.75 本轮

- **MCP 辅助工具扩展与渲染升级**：AuxTools 域、结果表格渐进渲染统一（useRenderMore 收口）、多视图打磨、工作台对齐与结果陈旧态提示。

### 1.0.74 本轮

- **MCP 治理强化**：工具单轨制收口、key 管理面、迁移对账工具；新增 verify-server-mcp / verify-mcp-cli 验证脚本，三验证链齐备。

### 1.0.73 本轮

- **迁移数据完整性修复**：极速模式 bulk 计数虚报与 refresh 静默吞异常两缺陷修复，计数如实、异常上抛。
- **迁移体验全面强化**：迁移 UX 打磨、作业回放、启动门与导出、源目标选择、作业列表生成。

### 1.0.72 本轮

- **托管重建历史作业回读补全**：宿主重启后历史作业的逻辑名/策略/源目标/文档计数/耗时/轮次/收尾报告不再残缺（回读展示字段覆盖层，快照真值直接透出）；Es/Jdbc 双档同口径。
- **可验证交付**：Java 全模块 1,770 例全绿（+5）。

### 1.0.71 本轮

- **托管重建「别名链安全」自洽闭环**：探测结果卡新增「所属别名」行（所选物理索引挂在哪些别名下一目了然）；是其他别名成员且非别名形态时红字警示断链风险，别名 chip 一键转换输入并自动重探；启动硬拒兜底（服务端实时反查、非空拒绝并指路，反查失败同样拒绝；浏览器端同款）——选错入口时向导自己识别、自己转换，不再依赖使用者预先知道「必须选别名」。
- **可验证交付**：前端 1,532 个文件 / 12,358 例全绿（+5），Java adhoc 域 124 例全绿（+5），零跳过。

### 1.0.70（前轮）


- **全站「廉价组件」清零**：64 处原生 `<select>`（34 文件）全部升档 NSelect；14 处原生 `datalist` 全部退役（值建议位升 combobox，可输可选保留）；原生 confirm/alert/prompt/dialog 维持零存活——下拉与浮层全站统一设计语言。
- **校验报告区重设计**：StatusPill 主徽章 + 三色计数 pill；错误码/路径/修复目标键全部 code chip 化（键名与建议值从悬停上屏可见）；徽章列定宽、长路径栅格修复；托管重建与配置校验两页双轨统一。
- **行内 code 全局 chip 档**：四页私造皮退役，裸奔位点自动收口；**手搓弹窗迁 ModalShell**（阴影/过渡/blur 遮罩/动态 z-index）；**升档连带修复 3 处产品缺陷**（chip 回车退化/查询树重扫崩溃/右键排除误弹）。
- **可验证交付**：前端 1,532 个文件 / 12,353 例全绿（+19），零跳过；browser-parity / mcp-parity / doc-links 门禁全绿。



- **校验一键补充与目标名剥代（1.0.69）**：dry-run 的 ngram 等 index 级限制错误解析出缺失键名+差值，「一键补充」写回 settings；目标名剥净历史 `_adhoc_` 后缀不再叠层。



- **托管重建全面升级（1.0.68）**：诚实反馈与危险操作收口（磁盘预估/切换双门/守卫对象物理名/终态耗时冻结/失败原因友好化/进度百分比真实消费）；执行调优参数面（requestsPerSecond 限流+slices）；reindex 失败文档样本透出；宿主重启孤儿作业收养（实例标识防多实例误杀）；浏览器模式与服务端语义对齐（`_adhoc_` 命名/双 add 切换/INCREMENTAL 追平轮/终追异步）；MCP 第 16 组 `es_adhoc_rebuild` 六动作三端四面（136 工具）；《重建与迁移选型指南》。



- **跨集群结构复刻与一键移除（1.0.67）**：托管重建审编步「从集群复刻」（连接中心档案+白名单 settings+插件组件名还原）；校验报告 issue 携带 `REMOVE_SETTING` 修复动作；草稿凭据掩码与系统只读键剥离三根因修复。
- **文档整合（1.0.66）**：integration 目录的实体写法 / 自动登记 / 冲突转 Adhoc 三篇合一为 `mapping.md`（内容原样迁移）；MCP 快速开始并入 `mcp.md` 的「快速开始」章节；docs 从 19 篇收敛到 15 篇，全部索引、产品内集成指南与契约测试同步。
- **宿主冲突收敛（1.0.65 起）**：`spring-boot-starter-web`/`-aop` 改 `optional`（宿主自带才启用，不传递强加）；静态资源守卫、期望状态控制器、控制台模式配置三个 Web 组件加 `@ConditionalOnWebApplication(SERVLET)` 守卫，非 Web 宿主零装配；写重试切面加 `@ConditionalOnClass` 守卫与 `write-retry-aspect-enabled` 开关，栈契约校验加 `stack-contract-enabled` 开关（默认全开，生产行为零变化）。
- **测试与 CI 提速（1.0.65 起）**：23 个编号测试文件合并为 5 个（JUnit `Enclosed`）；重建锁轮询间隔构造注入（关键测试类 10.4s → 0.34s）；Surefire `forkCount=6`；UI 并行分片按核数 60% 自适应（上限 16）；CI 全流水线约 4 分钟。
- **依赖卫生（1.0.65 起）**：开发依赖链 67 处 semver 内安全升级，生产依赖零漏洞。

### 为什么是 ESQueryStudio

- **六模式共用一个现场** —— DSL 构建器 + 原始编辑器、ES-SQL、Lucene、查询沙盒、PIT 深分页、SQL ⇄ DSL 语法桥共享条件树、JSON、结果、直方图、历史、收藏与草稿。
- **真正懂 ES 的语义层** —— 实时 mapping、analyzer、字段角色、可排序性与集群版本共同驱动补全、lint、值枚举和执行前检查；树 ⇄ 文本双向同步，未知子句退回原文。
- **相关性实验室** —— 打分解剖（BM25 因子树）、排名侦探、查询 X 光、子句命中矩阵、Boost 调参、Profile 火焰图。
- **一套源码，两种形态** —— 同一套 53 页 Vue 控制台运行在 Spring Boot 服务端与 Chrome MV3 扩展；浏览器模式直连 Elasticsearch，多本机连接档案、本机监控（关闭标签页后仍写集群 / 每节点 / Top 索引行并继续判定阈值告警）/ 审计 / 作业 / 护栏执行。
- **MCP 接入** —— 服务端 `POST /mcp` JSON-RPC 2.0（服务 token / 按用户与角色签发的 API key；17 个 action 型工具（覆盖 163 个细粒度操作）+ 9 个只读资源 + 1 个 MCP App + 5 个引导提示词（MCP resources/prompts）覆盖索引生命周期：建/删索引、mapping、settings、别名、rollover、merge、模板、数据流、克隆/收缩/拆分、Transform 生命周期，批量 update/delete/reindex、分词配置/同义词/查询校验/词频取证、集群设置/reroute、分片诊断、节点/热点线程/插件/Watcher、快照/ILM/SLM、脚本、ingest pipeline 生命周期、settings/aliases/templates/nodes/tasks/stats 与按路径语义精确分类的原始 REST 透传）与 stdio 桥；ADMIN 可为 key 指定连接集合、**连接级 read/write（一把 key：QA/UAT 可写、生产只读）**、工具白名单、频率、日/月配额与有效期；key 发版后在面板/API 实时签发/编辑、立即生效，可持久化到控制集群 ES 或宿主 JDBC；控制台内置「密钥与用量」管理面（含近 14 天请求趋势）；浏览器模式安装 `window.ESQueryStudioMCP`；另附本地 Node MCP（多连接、stdio、无第三方依赖、可 `npm install -g`，浏览器可导出连接配置，写工具默认关闭），本地 Claude Desktop / Cursor 无需 Spring Boot 或浏览器；面板可搜索客户端矩阵与 `esquerystudio-mcp-cli`（`list` / `detect` / `probe` / `config` / `install`）覆盖 Claude Code、Cursor、CodeBuddy Code CLI、ZCode、TRAE、VS Code、Windsurf、Codex、DeepSeek Harness、OpenCode、Pi、Cherry Studio、Qoder、WorkBuddy、Antigravity——`detect --json` 逐家回报 PATH/配置路径/已接入三态，`probe` 一条命令验证端点/key/实际权限，`--local` 可把客户端直接接到本机 Node stdio 桥；系统管理工具统一仅 ADMIN 角色可签发与调用，ADMIN 代签低角色 key 时同样不能超发。每次 MCP 调用与拒绝都会留档 method / tool / 客户端 IP / UA / HTTP 方法路径 / `X-Request-Id` / 耗时 / 成败（服务端持久化审计默认保留 30 天、最低 7 天；浏览器桥 localStorage 保留 30 天；本地 Node 追加 `~/.esquerystudio/mcp-audit.jsonl`；key 详情保留最近 100 条预览），`[mcp-denied]` 额外记录命中的 key 前缀与请求路径，日志 `[mcp-call]` / `[mcp-denied]` 可用 `requestId` 关联排查。密钥页已重塑为签发工作台：左侧密钥台账（复制前缀即时反馈、审计/详情/更多分组动作），右侧逐连接 read/write 权限矩阵、身份/连接/写权限/工具面实时预览与目标用户范围校验（ADMIN 代签先读 `owner-scope`，按目标角色/页面授权收窄）；签发与轮换用一次性明文弹窗（自动聚焦复制、全选、下载 `.env`、可粘贴客户端配置，Esc/遮罩不可误关）；所有复制走 Clipboard API → copy 事件权威写入 → 焦点门三层管线，修复 HTTP 非安全上下文（QuoteHub 内网 IP）下点复制无反应的实报。客户端接入页内置「连不上？先核对三件事」：完整端点含 context-path、`Unexpected token '<'` 是打到网页/404、`MCP_KEY_REVOKED` 是旧 key 已撤销或轮换，并给出 WorkBuddy `~/.workbuddy/mcp.json` 的 `type: "http"` 示例。传输同时支持 Streamable HTTP 与旧版 HTTP+SSE（`/mcp/sse` + `/mcp/message`）；`esquerystudio-mcp-cli` 的 `install/config` 支持 `--transport sse`，会自动把 `.../mcp` 映射为 `.../mcp/sse`。客户端 tools/list 已收敛为 17 个 action 组，签发面板也按 17 组 action 勾选（163 个细粒度工具收进高级排障开关），分组调用的留档 tool 记录为 `组:action`（如 `es_indices:create`）；控制台左侧新增「开发者工具 → MCP 接入」独立页（`/mcp`），以顶部信号链 + 01–05 工作台标签组织接入总览、工具目录、客户端、密钥与调用审计，调用台账汇总当前身份可见 key 的最近调用并支持 IP / UA / requestId 检索与 CSV 导出；资源列表使用人类可读名称，不再暴露 `connection-<hash>`。
- **宿主优先、可裁剪** —— 53 页、13 分组、11 功能包；页面契约是导航、页面门与宿主菜单的唯一事实源；`ConsoleHostIntegration` + 认证 / 连接目录 / 审计 SPI。
- **可验证的工程交付** —— 前端 1,566 个文件 / 12,708 例全绿，Java console 1,918 例全绿（0 跳过），覆盖认证、页面授权、重建状态机、映射对账、跨集群迁移、MCP key 权限/配额/持久化与 REST 语义分类；真实浏览器探针、权限矩阵、可复现构建、SBOM、CodeQL、OpenSSF Scorecard。托管重建向导另修复目标名复用旧草稿导致撞名：进入向导或切换源索引即清空，由本次 prepare 生成，遇到已存在索引/别名自动顺延。

### 交付物

- **Chrome 扩展** —— `esquerystudio-chrome-1.0.81.zip`：同一套 Vue 控制台在扩展内直连 ES；解压后在 `chrome://extensions` 加载已解压的扩展程序。浏览器模式保留索引 / Mapping / Setting / 别名 / 模板、快照 / ILM / SLM / Watcher、任务 / 节点 / REST / SQL / PIT / Reindex / Bulk、托管重建、跨集群迁移、配置校验、配置漂移、系统作业锁与护栏执行。
- **独立服务端** —— `esquerystudio-server-1.0.81.jar`：JDK 8+，`java -jar` 后打开 `http://localhost:5601/esquerystudio.html`。
- **嵌入式模块** —— `esquerystudio-console-1.0.81.jar` + `esquerystudio-platform-1.0.81.jar`：接入 Spring Boot 宿主，认证、连接目录、审计与品牌均可通过 SPI 接管。
- **可复现材料** —— sources / javadoc / SBOM 与 `SHA256SUMS` 一并附上；ES 客户端栈由宿主以 provided 契约自备。

### 链接

- 在线演示（合成数据，点开即玩）：<https://dengmeiluan.github.io/esquerystudio/demo/>
- GitHub：<https://github.com/dengmeiluan/esquerystudio>
- 文档索引：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/README.md>
- 宿主接入：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/integration/README.md>
- LINUX DO 社区：<https://linux.do>

> 发布线约定：「初版（滚动更新）」是唯一 Release；版本号可递增，但只保留一个标签、一个提交，资产直接覆盖更新。
