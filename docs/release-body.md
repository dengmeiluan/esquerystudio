## ESQueryStudio 查询工作台 · 初版（滚动更新）

**为 Spring Boot 而生的 Elasticsearch 查询工作台。** 一套原生 Vue 控制台（53 页 / 11 个功能包）覆盖 **Elasticsearch 6.7 → 9.x**：请求形态、SQL 端点、模板与 mapping type 由集群版本驱动，未知版本走 6.x / 7.x+ 双兼容形态。宿主侧用同一个 `esquerystudio-boot-support` 自动装配：**Boot 2.3 宿主直接引依赖即可嵌入**（Java 8 / Spring 5.2 实测），Boot 2.7 / 3.5 / 4.2 各有可运行的薄适配器 app；另有 Chrome MV3 扩展浏览器模式与三接入面 MCP。

**本版已验证**：四个宿主车道全绿（Boot 2.3 10/10、2.7 15/15、3.5 20/20、4.2 9/9；Java 8 / 17 / 17 / 21），其中宿主 MCP 端点各 4/4（401 / discovery 17 组 / tools-list / 真实 `es_search` / console-only 动作如实报错），另有 `/mcp` 可配路径测试 1/1；6.7 形状回退实测、9.1 形状零回退实测；Java 全量 2,269 例、UI 全量 13,355 例（并发慢时钟误报经串行复验通过）与 parity / native-controls / doc-links / typecheck 门禁通过。MCP 由完整控制台与 Boot 2.3–4.2 宿主形态共同提供（同一 17 组 `/esmcp`；宿主默认服务 token，密钥治理仍由完整控制台提供）。

### 1.0.95 本轮

- **宿主形态 MCP 对等**：MCP 控制器拆入 `mcp-server` 共享核心；Boot 2.3 / 2.7 / 3.5 / 4.2 宿主（boot-support）开启 `esquerystudio.mcp.enabled=true` + 服务 token 即挂载同一 17 组 `/esmcp`，四车道各 4/4。按用户签发的 key 与 console 存储动作仍由完整控制台提供。
- **修复 `es_sql` 在 7.10+ 全部 400**：MCP 的 `es_sql` 此前拼接 `/_sql?format=json&timeout=180s`（ES SQL 只接受 `format`/`fetch_size`），全部集群返回 400 `unrecognized parameter` 并被误报为「未启用 _sql」。现已移除非法参数（止损依赖连接 abort + 3 分钟预算），400 请求级错误不再冒充能力降级；新增 2 例回归。
- **MCP 端点路径可配置**：默认 `/esmcp`（项目标志位，避免与其他开源集成的 `/mcp` 冲突），`esquerystudio.mcp.path` 可改成 `/mcp` 或带 context-path 的任意合法路径；非法值启动即失败，面板 / 提示词 / 文档 / 宿主形态跟随同一挂载路径。
- **全自动化发布**：Pages 演示站随 `main` 自动部署；四个宿主车道路径过滤覆盖共享核心；Release 附宿主 jar（boot-support + es-rest/es-engine/mcp-core/mcp-server）与 Boot 2.7/3.5/4.2 可运行适配器 app。

### 1.0.94 本轮

- **直方图轴标签与 ID 警示**：60 桶 ID 词条的 x 轴标签按最长标签抽稀（19 位 ID 在 600px 宽 ≤6 条、1300px ≤10 条），标签 CSS 上限与槽宽估算同步 140px，不再压成一条带；手动选择 ID 类弱字段时图上显示「ID 字段」警示，避免把 ID 分布误读为业务趋势。生产 QuoteHub 同索引实测（29,708 docs）诊断/选字段/60 桶出图闭环。
- **DSL 查询页同能力收口**：DSL 页与 IndexHub 共用 `analyzeHistFields`——「为什么？」逐字段诊断与手动选字段（含数值固定桶宽）全接线，选择即重跑；真实 Chromium 验收执行→日期 6 桶、切 `sentimentId`→2 桶 + ID 警示、「为什么？」列出 `_class`/`title` 原因，390px 无横向溢出。

### 1.0.93 本轮

- **直方图字段诊断 + 手动选择**：自动识别不到时间字段时，不再只给一句「未识别到」——节头「为什么？」逐字段列出不参与分桶的原因（常量 / ID / text 无 `.keyword` / 数组 / 无样本），并给出「直方图字段」选择框；date / keyword / 数值（固定桶宽）按所选类型注入，ID 类字段标注「ID」仅供手动选择。产线索引 `bond_management_sentiment_title`（仅 `_class`/`sentimentId`/`title`）可手动按 `sentimentId` 出词条图。
- **演示站同形复现**：新增 `sentiment_title` 合成索引与直方图合成桶，文档/查询两 tab 都能点出「空态 → 为什么 → 选字段 → 有图」。
- **可验证交付**：新增纯函数/接线锁 13 例；真实 Chromium 实测诊断、选择后 2 桶、1024/390 无横向溢出；UI 1,631 文件 / 13,348 例、Java 2,204 例，均 0 失败 0 跳过；parity / native-controls / zero-skipped / doc-links / typecheck 全绿。

### 1.0.92 本轮

- **安全审计列表可读性（截图实报修复）**：结果表新增 `textCols` / `readable` 阅读档——中文列（用户/角色/来源/动作/集群/详情）改走正文字体 12px，时间/方法/URI/IP/HTTP/耗时保持等宽数字；线盒锁 16.5px，与既有 25.5px 行距同高，行高与空白底纹不漂移。
- **集群连接管理页签化 + 复制连接**：760px 弹窗改「连接列表 / 新增连接」页签，两区互斥各得整幅高度；表单页签自滚、操作行钉底；行内与右键新增「复制连接」——端点/认证/环境/读写超时全带出、密码留空、名称自动生成唯一副本并聚焦连接串，同集群跨环境只改地址即可另存。
- **演示站全板块可点**：demo transport 增加内存态写动作——连接保存/删除、用户/别名写、托管重建（启动→推进→事件回放→中止/限速/放行）、迁移（进度→对账/冲突/预检/能力对比/结构同步剔除清单/智能同步/计划/等价验证）；Watcher、远程集群、模板、配置实验室、重建预估、智能动作均有合成样例；演示横幅继续声明合成数据。
- **MCP 长调用边界（沿用并复核）**：每个调用 3 分钟硬预算到点自动掐断；`tasks/cancel` / `notifications/cancelled` 真中断（断线程 / 断 HTTP / 撤 ES 任务）；声明 Tasks 的客户端先拿 `working` 再续传。Windows 单文件 `esquerystudio-mcp.exe`（Node SEA）真实握手通过，`--version` 回显 1.0.92。
- **可验证交付**：真实 Chromium 实测审计表字体/行高、连接页签与复制预填（焦点落连接串）；真实 CDP 对 demo 写动作逐项断言（重建 SUCCEEDED、迁移 DONE、对账/预检/结构同步/智能同步/计划/等价验证）；UI 1,629 文件 / 13,335 例、Java 2,204 例，均 0 失败 0 跳过；mcp-parity / browser-parity / native-controls / zero-skipped / doc-links / typecheck 全绿；Windows exe 20 项（真实握手 + `1.0.92`）。

### 1.0.91 本轮

- **Windows 单文件 exe 代码签名管线**：SEA 注入后先清掉损坏的 PE 证书目录，再支持 PFX / Azure Trusted Signing 签名并回读验签；签名结果写入 `esquerystudio-mcp.json.signature`（状态/主体/指纹/时间戳）。Release workflow 读取 `WINDOWS_SIGN_PFX_BASE64` / `WINDOWS_SIGN_PASSWORD` 自动签名，未配置时 metadata 明确 `unsigned`，不冒充已签名。
- **验签门禁与自检**：正式签名要求 `Valid` + 可信时间戳 + 主体/指纹一致；`scripts/verify-windows-signing.mjs` 用临时自签名证书验证整条管线（自签如实标为不受信任）。
- **边界**：SmartScreen 要真正不告警仍需受信任证书（OV/EV 或 Azure Trusted Signing）；证书是外部身份凭据，配置 secret 后即可产出受信任 exe，无需改代码。
- **可验证交付**：Java 2,165 console + 5 server 例 0 失败 0 跳过；UI 1,626 文件 / 13,316 例 0 失败 0 跳过；exe 契约门禁 20 项（含签名状态、真实握手、`1.0.91` 版本）；Windows 自签管线自检通过；mcp-parity / browser-parity / native-controls / zero-skipped / doc-links / typecheck 全绿。

### 1.0.90 本轮

- **迁移 / 重建作业「事件回放」**：作业详情的事件时间线新增回放控制条——播放 / 暂停、逐条步进、拖动进度、1× / 2× / 4× / 8× 倍速与「回到实时」。进入回放即冻结当前筛选后的事件快照（轮询拍不改变播放序列，退出恢复实时与自动滚动）；当前事件常驻高亮并自动滚入视野；虚拟时间轴把连发事件垫到 300ms、长空档压到 1500ms、末事件留 900ms，只改观看节奏不改事件。键盘 Space / ← / → / Home / End；倍速落 `localStorage`。Xmigrate 与 Adhoc 重建页共用同一内核与控制条。
- **窄档可读性**：≤600px 事件行两段式（时间 + 阶段一行、消息整行），阶段词不再逐字竖排；回放条两排布局（播放 / 步进 / 位置 / 退出；倍速 + 滑杆），390 宽无横向溢出。
- **演示站可体验**：demo 增加 DONE 迁移作业与 8 条事件（启动 / 解析 / 搬运 / 调速 / 确认门 / 对账 / 完成，合成数据），在线演示可直接回放；真实 Chrome CDP 以鼠标路径验收步进、自动推进、倍速持久化与退出恢复。
- **可验证交付**：Java 2,165 console + 5 server 例 0 失败 0 跳过；UI 1,626 文件 / 13,316 例 0 失败 0 跳过；mcp-parity（17 组 / 171 action / 7 prompts / 14 URIs）、browser-parity（95/177/68/10）、native-controls、zero-skipped、doc-links、typecheck、`verify-local-mcp` 双通道 / 取消断连 / exe 16 项全绿；真实 Chrome CDP 回放验收与 1440/1024/768/390 四档无横向溢出。

### 1.0.89 本轮

- **AI 一键搭建 / 接入（`deploy_and_connect`）**：第 7 个 MCP 提示词按形态（server / host / browser / local-exe / local-node）、客户端、端点与 OS 生成完整 Agent 指令：预检 → 按 Release 资产名下载并核对摘要 → 启动 → 打开控制台 → 签发 key → 写客户端配置 → probe / 协议往返 → 回报权限边界与回滚；内置 180 秒预算、异步续传、key 不落日志与跨云 `smart_sync` 预览约束。服务端 / 浏览器 / 本地 Node 三端同文案，仓库根 [`AGENT_SETUP.md`](../AGENT_SETUP.md) 与运行中页面逐字一致。
- **控制台「AI 一键搭建 / 接入」卡**：四格参数、折叠态与参数持久化、本地生成不占配额、复制与下载 `AGENT_SETUP.md`；宿主内嵌（如 QuoteHub）默认 host 形态并生成 `.../quotehub/esmcp`，浏览器形态禁用端点并明示无外部 HTTP 端点。真实 Chrome CDP 验收折叠/展开、Naive 下拉、端点输入、剪贴板、刷新持久化与 1440/1024/768/390 四档无横向溢出。
- **资源读取与补全并入 3 分钟预算**：`resources/read` 与 `completion/complete` 也会打 ES，现与 `tools/call` 共用同一条死线、在途任务台账与 `notifications/cancelled` 取消通道；到点返回 `MCP_CALL_TIMEOUT`。
- **计数与文档校正**：面板旧文案「151 action / 10 资源 / 5 提示词」改为派生值（171 action / 15 资源含 1 个 MCP App / 7 提示词）；只读资源口径纠正为 14 个（含迁移作业与任务资源）。
- **可验证交付**：Java 2,204 例 0 失败 0 跳过；UI 1,623 文件 / 13,298 例 0 失败 0 跳过（新增 `agentSetupPrompt1089` 5 例与 `browserMcpResourceBudget1124` 2 例）；mcp-parity（17 组 / 171 action / 7 prompts / 14 URIs）、browser-parity、native-controls、doc-links、zero-skipped、typecheck 全绿；QuoteHub 以 1.0.89 构建通过并在宿主 context-path 下真实渲染 MCP 页（默认 host 形态，端点 `.../quotehub/esmcp`）。

### 1.0.88 本轮

- **长调用真可取消、不堵生产（三端同语义）**：每个 MCP 调用 3 分钟硬预算，到点 `cancelled/DEADLINE`；`tasks/cancel` 与 `notifications/cancelled` 真中断——REST 透传 / SQL / force merge 走低层 `Cancellable` 线级 abort（断连接，本地 HTTP 桩实测），批量写走 ES 异步端点并对 `node:num` 下发 `_tasks/_cancel`；任务资源 `esquerystudio://tasks/active`、`esquerystudio://task/{id}`（资源 URI 14）让 Agent 断线后按 id 续查；控制台「调用任务」条可看 Agent 发起的在途调用、进度与剩余预算并直接取消；Windows 免装 Node 的单文件 `.exe`（对标 DBX）。
- **任务台账跨刷新 / 跨重启 / 多实例（续传边界收口）**：服务端台账落共享存储（控制集群索引 `esquerystudio_mcp_tasks` 或宿主表 `esquerystudio_mcp_task`）：完成结果跨重启可读、多实例互查，任意实例取消会写共享标记并由执行实例 2 秒内真中断，执行方失联 30 秒终结为 `EXECUTOR_LOST`；浏览器台账落 `localStorage`，刷新后 completed 可读、在途标 `RELOAD`；本地 stdio 台账 `tasks.json` 同样跨重启可读。
- **多实例配额改为全局口径**：新增 `McpQuotaStore`（ES `if_seq_no` CAS / JDBC 行锁）原子「检查+1」，多实例共用一把 key 时 rpm/日/月配额不被实例数放大；存储故障回落单实例并节流告警。
- **重建/迁移板块升级**：结构同步计划在页面可直接查看/复制/重跑（与 MCP `plan_list`/`plan_apply` 同源）；`es_xmigrate` 新增 `events` 回放作业时间线（与资源同形，四端一致）；Update/DeleteByQuery 与 Bulk 提交新增「停止等待」，Xmigrate/Reindex/UBQ/Bulk 卸载即收连接；`smart_sync` 兼容矩阵/增量五清单/漂移门与 `verify_equivalence structureOnly` 闭环沿用。
- **零裸控件与门禁**：全站裸 `input/select/textarea` 普查门禁（仅登记豁免）；`check-local-mcp-exe`（16 项含真实二进制握手）、`verify-local-mcp-cancel`（慢 ES stub 真断连接）、任务台账跨重启断言、共享配额并发用例纳入必跑。
- **可验证交付**：Java 2,203 例 0 失败 0 跳过；UI 1,621 文件 / 13,281 例全绿；mcp-parity（17 组/171 action/6 prompts/14 URIs）/ browser-parity / doc-links / zero-skipped / verify-local-mcp 双通道 / exe 门禁 / typecheck 全绿。

### 1.0.86 本轮

- **smart_sync 增量模式（生产→UAT 结构跟随同步的补全形态）**：目标索引已存在时 `mode=incremental`——计划五清单如实呈报（addedFields 新增字段 / skippedConflicts 冲突字段跳过不修 / updatedSettings 动态 settings 白名单差异 / staticBlocked 静态差异只建议 / addedAliases 补加别名），`apply=true` 经 planDigest 漂移门后按序执行 PUT _mapping 合并补字段 → PUT _settings → 补别名；目标不存在 404 DEST_NOT_FOUND；兼容矩阵照跑（新增字段引用目标缺失分析组件仍降级）。
- **同步后复检闭环（agent 自证「目标=计划」）**：diff_structure 增 `autoTunedShards`/`removedKeys` 豁免参数——回传上次 smart_sync 报告值，autoTune 分片收敛与 reactive 剔除不再被自己的优化误报为 unexpected；verify_equivalence 增 `structureOnly`——纯结构同步场景只比双侧 canonical 结构摘要，终局 verdict 三态。
- **兼容矩阵规则扩表（跨云剔除非兼容的覆盖率）**：version-floor 精确键+前缀族扩表（soft_deletes/default_pipeline/routing_shards/wait_for_active_shards/sort.*/xpack.*，版本号经官方文档查证，目标版本未知保守不剔）；AWS/OpenSearch 前缀（index.knn/index.remote_store）；codec 值级规则（ZSTD 系 OpenSearch 专属）；腾讯云 QQ 分词组件族（qq_smart/qq_max 等四组件+固定插件映射）；pipeline-missing 探针（final/default_pipeline 引用的 ingest pipeline 目标缺失即剔）；total_fields/nested_fields limit 超目标默认 advice。
- **MCP 架构四件（AI 调用摩擦清零）**：annotations 增 `readOnlyActions` action 级清单（只读 action 免确认，含 smart_sync 缺省只读口径）；tools/call 错误统一附 `structuredContent:{code,message}`（9 code+INTERNAL 四端同判定）；completion 补 srcConnId/destConnId/sourceIndex/destIndex/jobId；resources +2（`esquerystudio://xmigrate/jobs` 作业摘要与 `…/job/{id}/events` 事件流，11 URIs）；cross_cloud_structure_sync 提示词四端逐字升级（增量教学/豁免回传/structureOnly 终验）。
- **重建/迁移板块六维升级**：长作业后台通知（useJobNotify 双通道：桌面通知+标题闪烁，幂等防重/偏好持久化/授权态实时回显；useAutoRefresh 增 hiddenMs 隐藏降频保拍——页面隐藏 30s 一拍不再弃守，停门/终态全窗口触达）；Xmigrate 运行中 ETA+批量「预计全部完成」；目标已存在行内即时提示；DONE 作业一键增量重迁；作业表批量中止/续跑（确认列全 jobId+汇总 toast）；Adhoc 事件时间线补齐 Xmigrate 三件（关键字搜索/JSONL 导出/单事件钻取）+失败错误聚类 top-N。
- **零裸控件收官续章**：P0 render 函数残留清零（GeoValueEditor h('input')+原生 title / App.vue toast 钮）；8 处裸 table→MiniTable（DevTools/LiveDashboard/Lucene/SqlBridge/McpPanel）；views 层约 65 处裸 input→TextInput/NInputNumber（Security/DslQuery/Snapshots 等 27 视图）；密码型字段统一 NInput password 档（Firefox 无 -webkit-text-security 明文缺陷修复）；TextInput 增 modelModifiers.trim 支持；McpPanel 密码框 name/autocomplete 经 input-props 落真实 input。
- **可验证交付**：Java 全量 2,075 例 0 失败 0 跳过（新增 CompatMatrixV3Test/SmartSyncIncrementalTest/DiffStructureExemptionTest/VerifyEquivalenceStructureTest/XmigrateEnhanceToolsTest 等）；UI 全量 13,156 例全绿（新增 browserSmartSync1085/browserDiffExempt1085/browserVerifyStructure1085/browserMcpXmigrate1085/xmUx1085/arBgNotify1124/arEvtoolsCluster1124/componentP0Tables1085/inputSweep 双分片等）；action 数不变（168），mcp-parity（17 组/168 action/6 prompts/11 URIs）/ browser-parity / doc-links / zero-skipped / verify-local-mcp 双通道 / typecheck 全绿；双兵蚁审查（四端契约+行为语义）27 项发现全修复。

### 1.0.85 本轮

- **迁移写面工具可签发修复**：es_xmigrate 系写工具（含 smart_sync）此前缺页面归属映射，页面作用域 key 双路 fail-closed 永远签不下（报错还显示「所需页面 null」）；补 xmigrate 页映射后，持 `conn:<id>:w:xmigrate` 写授权即可正常签发，无授权得到点名 xmigrate 页的明确 403。
- **可验证交付**：Java McpXmigrateToolPageTest 3 例 + 受影响面 46/46 全绿；Java 全量 2,057 例 0 失败 0 跳过；UI 零触面；五门禁 + typecheck 全绿。

### 1.0.84 本轮

- **MCP key 全量常青包（toolPack=full）**：选「全量」包签发的 key 随服务端升级自动纳入新增 action（如 smart_sync），免每次发版后人工补勾；读写边界与连接授权照常过滤，存量死枚举 key 语义不变，面板点「全量」包保存一次即转常青（key 列表带「常青包」徽标）。
- **可验证交付**：Java McpKeyToolPackTest 5 例 + 受影响面 90/90 全绿；UI 常青包源码锁 5 例；action 数 168 不变，五门禁 + typecheck 全绿。

### 1.0.83 本轮

- **MCP 溯源收尾**：本地 stdio 桥 smart_sync 计划清单的 `rule` 溯源 id 由产出侧直带（六类兼容规则与插件降级逐条携带），废弃按 reason 文案反查——文案演进不再影响溯源正确性。
- **TextInput 收尾**：清空钮与后缀槽并存转流内布局（恒占位防叠放、宽度不跳动）；无后缀场景维持原形态零漂移。
- **可验证交付**：UI 全量 12,986 例全绿；verify-local-mcp 双通道 exit 0；五门禁 + typecheck 全绿；Java 零触面（沿 1.0.82 全绿基线）。

### 1.0.82 本轮

- **MCP 一步式智能结构同步 `smart_sync`（es_xmigrate 19→20 action / 全项目 167→168）**：对 Agent 只需描述意图——生产源索引 + 目标/UAT 连接——一次调用完成「探目标集群能力（版本/厂商/插件/数据节点）→ 兼容矩阵剔除非兼容属性 → 可选 autoTune 按目标硬件收敛分片 → 计划摘要 → 可选落盘」；`apply=false` 只读预览免写权限免 MRTR，`apply=true` 携 `expectPlanDigest` 漂移门（PUT 前拦截，三端统一 409 `PLAN_DRIFT`）；剔除清单每项带 rule/reason 规则溯源；服务端 REST+MCP / 浏览器桥 / 本地 stdio / 文档四端同契约（mcp-parity 17 组/168 action 全对齐）；`cross_cloud_structure_sync` 提示词升级为一步式教学。
- **兼容矩阵两新规则（跨云自动剔除非兼容）**：`version-floor` 版本地板（`index.search.idle.after` 7.0 / `index.hidden` 7.7 / `index.final_pipeline` 7.12，目标版本未知保守不剔）；`store-type-vendor` 值级厂商判定（`hybridfs` 为阿里云特有，目标厂商不同即剔，unknown 给人工确认 advice）。
- **迁移页智能同步弹层**：目标连接必选 + 双侧集群卡（vendor/版本/节点规模）+ 规则溯源清单 + autoTune 开关 + 计划摘要芯片 +「按此计划创建」二次确认；APPLIED 联动回填 / PLAN_DRIFT 红徽标+漂移告警+引导重新预览，服务端与浏览器两模式同形。
- **零裸控件收官 + 两统一件**：`TextInput`（状态档/一键清空/前后缀槽/皮肤类透传）与 `MiniTable`（声明式列 + `#rows` 行自治槽 + `#tfoot` 聚合槽 + 统一空态）；重建迁移四视图（Xmigrate/AdhocRebuild/ReindexAdvanced/UpdateByQuery）零裸 input、零裸 table，行级右键菜单/键盘行导航/Σ 聚合原样保留。
- **可验证交付**：Java 全量 2,049 例 0 失败 0 跳过；UI 全量 12,985 例全绿；verify-local-mcp 双通道 exit 0；mcp-parity / browser-parity / doc-links / zero-skipped / typecheck 五门禁全绿。

### 1.0.81 本轮

- **MCP 客户端接入面 24→26 品牌**：新增 Crush（Charm TOML）与 JetBrains AI Assistant（`.idea/mcp.xml` XML，IntelliJ/GoLand/PyCharm 2025.2+，stdio 桥自动配置）；Cline / Roo Code / Kilo Code 补 Linux 路径探测。
- **等价验证弹层聚合对比**：verify_equivalence 的 aggregation 结果可视化（match 徽标/差异表/单侧清单）+ 可选聚合字段带聚合重跑；在途防重入 toast 提示。
- **一致性三刀**：naive Tooltip 与 v-tip 气泡亮暗双主题显式对齐；任务级恢复提示浏览器模式路由判定对称化；草稿凭据掩埋补对象值深遍历（嵌套明文对象值此前漏掩埋）。
- **可验证交付**：verify-mcp-cli 28 家断言绿；五门禁全绿。

### 1.0.80 本轮

- **MCP 客户端接入面扩容 15→24 品牌**：新增 Claude Desktop（stdio 桥自动配置）、Cline / Roo Code / Kilo Code（VS Code 插件，安全合并写入）、Gemini CLI（httpUrl 方言+CLI 命令）、GitHub Copilot CLI、Zed（context_servers 形态）、Continue（YAML）、Amp——面板可搜索矩阵与 `esquerystudio-mcp-cli` 同批对齐，`detect --json` 跨平台路径探测；面板退役指向已 404 端点的「SSE 兼容」toggle，传输统一 streamable HTTP。
- **可验证交付**：verify-mcp-cli 26 家断言绿；UI 12,905 例全绿；parity/浏览器/零跳过/文档链接门禁全绿。

### 1.0.79 本轮

- **迁移后等价性验证（新增 MCP action，三端同契约）**：`es_xmigrate verify_equivalence`——双侧计数对比 + 抽样摘要逐 id 对比 + 可选聚合对比，`jobId`（复用作业登记）或 `srcConnId+sourceIndex` 双形态，verdict 三态诚实口径（取数失败判 INCONCLUSIVE 不冒充比对过）；迁移页 DONE 行一键「等价验证」弹层 +「完成后自动等价验证」默认开 + 批量链 verdict 矩阵；`migrate_index`/`cross_cloud_structure_sync` 提示词升级为含数据终验的完整跨云链路。
- **全站原生 title 清零**：v-tip 全局指令（单例浮层/视口翻转/长文滚动档/模态内可见/键盘与触屏通道/reduced-motion）替换约 100 文件千余处原生 title 与 80 余处组件 fallthrough，质量门禁升级为零容忍；spec 断言四形态全量随迁至浮层行为断言范式。
- **迁移页五维补全**：事件时间线钻取/搜索/JSONL 导出、详情深链、速率曲线持久化、方案预设、diff_structure UI 化、三步向导点亮+全链 CTA、verify 落事件线、SparkLine×时间线联动定位、workbench 草稿跨会话（凭据掩埋不落盘）。
- **MCP 口径统一**：es_xmigrate 组 schema 十参数硬化、全组工具 annotations 四 hint（parity 派生自检）、四端七处文案/参数口径差收敛。
- **可验证交付**：Java console 全量 1,981 例 0 失败 0 跳过；UI 12,904 例全绿；mcp-parity（17 组/167 action）/ browser-parity / doc-links / zero-skipped / verify-local-mcp / typecheck 门禁全绿。

### 1.0.78 本轮

- **跨云结构同步 v3**：`sync_structure` 执行守恒——`planDigest` 计划摘要 + `expectPlanDigest` 漂移门（dryRun 后源结构漂移 409 PLAN_DRIFT 零意外执行）、`body` 适配后建索引体预览；`compare_capabilities` 能力对比风险矩阵与 `diff_structure` 跨集群结构 diff（计划内剔除豁免三形态）；运行中动态调速 `throttle`；别名元数据（filter/routing）随迁透传。
- **迁移页与重建页观测升级**：事件时间线筛选芯片+数据身份守卫自动滚动+跨天分组段头；速率 SparkLine；三端行为语义统一（错误码三态/降级回退/参数边界矩阵/vendor-private 键归属模型）。
- **可验证交付**：Java console 1,968 例、UI 12,798 例全绿，五门禁全绿。

### 1.0.77 本轮

- **跨集群迁移兼容矩阵（生产 → UAT 跨厂商结构同步）**：`probe_capabilities` 探测源/目标集群厂商（阿里云/腾讯云/AWS/Elastic/OSS/未知六档，附判定依据 evidence 可回查）、版本、插件清单与节点拓扑（新增的 MCP action，服务端/浏览器/本地 stdio/文档四端契约逐字对齐）；兼容矩阵八规则主动预剔除——apack 私有设置、TTL、路由分配属性、目标缺失插件的分析组件（级联剔除引用它的自定义 analyzer 并降级字段）、缺失 ILM 策略五类剔除，分片数/副本数/存储介质三类建议不动数据，每刀带中文理由；`sync_structure` v2 报告（planned 预剔除计划 / reactive 建索引报错兜底 / aliases 别名随迁 / advice 建议 / warnings），`dryRun` 预览零写、执行按事实回报（skipped + synced 恒等于源别名总数）。
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
- **MCP 接入** —— 服务端 `POST /esmcp` JSON-RPC 2.0（服务 token / 按用户与角色签发的 API key；17 个 action 型工具（覆盖 171 个细粒度操作）+ 14 个只读资源 + 1 个 MCP App + 7 个引导提示词（MCP resources/prompts，含一键搭建/接入 `deploy_and_connect` 与仓库 `AGENT_SETUP.md` 同文案）覆盖索引生命周期：建/删索引、mapping、settings、别名、rollover、merge、模板、数据流、克隆/收缩/拆分、Transform 生命周期，批量 update/delete/reindex、分词配置/同义词/查询校验/词频取证、集群设置/reroute、分片诊断、节点/热点线程/插件/Watcher、快照/ILM/SLM、脚本、ingest pipeline 生命周期、settings/aliases/templates/nodes/tasks/stats 与按路径语义精确分类的原始 REST 透传）与 stdio 桥；ADMIN 可为 key 指定连接集合、**连接级 read/write（一把 key：QA/UAT 可写、生产只读）**、工具白名单、频率、日/月配额与有效期；key 发版后在面板/API 实时签发/编辑、立即生效，可持久化到控制集群 ES 或宿主 JDBC；控制台内置「密钥与用量」管理面（含近 14 天请求趋势）；浏览器模式安装 `window.ESQueryStudioMCP`；另附本地 Node MCP（多连接、stdio、无第三方依赖、可 `npm install -g`，浏览器可导出连接配置，写工具默认关闭），本地 Claude Desktop / Cursor 无需 Spring Boot 或浏览器；面板可搜索客户端矩阵与 `esquerystudio-mcp-cli`（`list` / `detect` / `probe` / `config` / `install`）覆盖 Claude Code、Cursor、CodeBuddy Code CLI、ZCode、TRAE、VS Code、Windsurf、Codex、DeepSeek Harness、OpenCode、Pi、Cherry Studio、Qoder、WorkBuddy、Antigravity——`detect --json` 逐家回报 PATH/配置路径/已接入三态，`probe` 一条命令验证端点/key/实际权限，`--local` 可把客户端直接接到本机 Node stdio 桥；系统管理工具统一仅 ADMIN 角色可签发与调用，ADMIN 代签低角色 key 时同样不能超发。每次 MCP 调用与拒绝都会留档 method / tool / 客户端 IP / UA / HTTP 方法路径 / `X-Request-Id` / 耗时 / 成败（服务端持久化审计默认保留 30 天、最低 7 天；浏览器桥 localStorage 保留 30 天；本地 Node 追加 `~/.esquerystudio/mcp-audit.jsonl`；key 详情保留最近 100 条预览），`[mcp-denied]` 额外记录命中的 key 前缀与请求路径，日志 `[mcp-call]` / `[mcp-denied]` 可用 `requestId` 关联排查。密钥页已重塑为签发工作台：左侧密钥台账（复制前缀即时反馈、审计/详情/更多分组动作），右侧逐连接 read/write 权限矩阵、身份/连接/写权限/工具面实时预览与目标用户范围校验（ADMIN 代签先读 `owner-scope`，按目标角色/页面授权收窄）；签发与轮换用一次性明文弹窗（自动聚焦复制、全选、下载 `.env`、可粘贴客户端配置，Esc/遮罩不可误关）；所有复制走 Clipboard API → copy 事件权威写入 → 焦点门三层管线，修复 HTTP 非安全上下文（QuoteHub 内网 IP）下点复制无反应的实报。客户端接入页内置「连不上？先核对三件事」：完整端点含 context-path、`Unexpected token '<'` 是打到网页/404、`MCP_KEY_REVOKED` 是旧 key 已撤销或轮换，并给出 WorkBuddy `~/.workbuddy/mcp.json` 的 `type: "http"` 示例。传输同时支持 Streamable HTTP 与旧版 HTTP+SSE（`/esmcp/sse` + `/esmcp/message`）；`esquerystudio-mcp-cli` 的 `install/config` 支持 `--transport sse`，会自动把 `.../esmcp` 映射为 `.../esmcp/sse`。所有 MCP 调用单次预算 3 分钟到点自动掐断（`cancelled/DEADLINE`），声明 Tasks 的长 action 立即回 `working` 并可 `tasks/cancel` / 核心 `notifications/cancelled` 真中断（批量写走 ES 异步端点并对 `node:num` 下发 `_tasks/_cancel`）；只读 `tasks/list` 让控制台「调用任务」条显示在途任务/进度/剩余预算并可直接取消。客户端 tools/list 已收敛为 17 个 action 组，签发面板也按 17 组 action 勾选（171 个细粒度工具收进高级排障开关），分组调用的留档 tool 记录为 `组:action`（如 `es_indices:create`）；控制台左侧新增「开发者工具 → MCP 接入」独立页（`/mcp`），以顶部信号链 + 01–05 工作台标签组织接入总览、工具目录、客户端、密钥与调用审计，调用台账汇总当前身份可见 key 的最近调用并支持 IP / UA / requestId 检索与 CSV 导出；资源列表使用人类可读名称，不再暴露 `connection-<hash>`。
- **宿主优先、可裁剪** —— 53 页、13 分组、11 功能包；页面契约是导航、页面门与宿主菜单的唯一事实源；`ConsoleHostIntegration` + 认证 / 连接目录 / 审计 SPI。
- **可验证的工程交付** —— 前端 1,619 个文件 / 13,270 例全绿，Java console 2,144 例全绿（0 跳过），覆盖认证、页面授权、重建状态机、映射对账、跨集群迁移、MCP key 权限/配额/持久化与 REST 语义分类；真实浏览器探针、权限矩阵、可复现构建、SBOM、CodeQL、OpenSSF Scorecard。托管重建向导另修复目标名复用旧草稿导致撞名：进入向导或切换源索引即清空，由本次 prepare 生成，遇到已存在索引/别名自动顺延。

### 交付物

- **Chrome 扩展** —— `esquerystudio-chrome-1.0.94.zip`：同一套 Vue 控制台在扩展内直连 ES；解压后在 `chrome://extensions` 加载已解压的扩展程序。浏览器模式保留索引 / Mapping / Setting / 别名 / 模板、快照 / ILM / SLM / Watcher、任务 / 节点 / REST / SQL / PIT / Reindex / Bulk、托管重建、跨集群迁移、配置校验、配置漂移、系统作业锁与护栏执行。
- **独立服务端** —— `esquerystudio-server-1.0.94.jar`：JDK 8+，`java -jar` 后打开 `http://localhost:5601/esquerystudio.html`。
- **嵌入式模块** —— `esquerystudio-console-1.0.94.jar` + `esquerystudio-platform-1.0.94.jar`：接入 Spring Boot 宿主，认证、连接目录、审计与品牌均可通过 SPI 接管。
- **本地 stdio MCP（Windows 单文件）** —— `esquerystudio-mcp.exe`：内含 Node 运行时，目标机零依赖；客户端配置只需一个可执行路径（对标 `dbx-mcp.exe`），凭据仍留在本机 `mcp.json`；同目录 `esquerystudio-mcp.json` 记录平台/架构/SHA-256、握手自检与 `signature`（`status` / 主体 / 指纹 / 时间戳）。Windows 产物仅在 windows-latest 上构建（SEA 复制的是构建机运行时）；代码签名已内置：配置 `WINDOWS_SIGN_PFX_BASE64` + `WINDOWS_SIGN_PASSWORD`（或 Azure Trusted Signing）后构建会自动签名并验签，未配置时 metadata 明确 `unsigned` 并如实提示 SmartScreen。
- **可复现材料** —— sources / javadoc / SBOM 与 `SHA256SUMS` 一并附上；ES 客户端栈由宿主以 provided 契约自备。

### 链接

- 在线演示（合成数据，点开即玩）：<https://dengmeiluan.github.io/esquerystudio/demo/>
- GitHub：<https://github.com/dengmeiluan/esquerystudio>
- 文档索引：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/README.md>
- 宿主接入：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/integration/README.md>
- LINUX DO 社区：<https://linux.do>

> 发布线约定：「初版（滚动更新）」是唯一 Release；版本号可递增，但只保留一个标签、一个提交，资产直接覆盖更新。
