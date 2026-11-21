# Changelog

ESQueryStudio 采用「初版（滚动更新）」发布线：版本号可以递增，但仓库只保留一个初版提交、一个标签和一个滚动更新的 Release；每次发布直接覆盖，不追加历史版本。

## 1.0.79 — 2026-11-21

- 迁移后等价性验证 verify_equivalence（「零意外切换」收官一环，MCP 166→167 action / es_xmigrate 18→19）：双侧 `_count` 对比 + 源 `_doc` 序 id 抽样双侧 mget 后按 canonical SHA-256 前 16 hex 摘要逐 id 对比 + 可选 terms 聚合对比；`sampleFields` 投影（含点号路径，未命中字段告警）；`jobId`（复用作业登记的源/目标，owner-or-ADMIN 校验）或 `srcConnId`+`sourceIndex` 双形态；`verdict` EQUIVALENT/DIVERGENT/INCONCLUSIVE 三态诚实口径——count/样本/聚合一侧取数失败如实判 INCONCLUSIVE 不冒充比对过（三端同判）；差异清单回显 ≤20 条带截断标志；`sampleSize` 缺省 100 钳 10..500、`aggSize` 缺省 10 钳 1..50（钳制带告警，`requested` 回显钳后请求值三端同口径）；服务端 REST+MCP / 浏览器桥（jobId 形态读本机台账）/ 本地 stdio 三端同键名同语义；只读不进写/破坏性/MRTR/长任务任何清单。
- 全站原生 title 清零（零廉价原生控件收官）：新增 v-tip 全局指令（`ui/src/directives/vTip.ts` 单例浮层——300ms 显示/80ms 隐藏打闪窗口、top 优先视口翻转与水平 clamp、`.long` 320px/200px 滚动档、`--z-island` 浮岛 z 档保证 naive 模态/抽屉/ModalShell 内可见、aria-describedby 挂摘、focusin 键盘通道、Escape/任意滚动/resize 收起、reduced-motion 关过渡、触屏 pointerdown 通道、禁用控件父级代理、300ms 延迟窗口内宿主卸载守卫、单例清场后重挂）；约 100 个 .vue 文件千余处机械迁移（标签感知 codemod：静态字面量转义、动态表达式原样、>60 字符自动 long 档）+ 组件 fallthrough 清尾（n-select/n-input-number/n-checkbox/n-date-picker/n-slider/router-link/JsonArea 共 80 余处，MetaStrip 内部 tip 兜底改挂指令）；componentQualityBan1120 门禁升级为标签感知零容忍（组件声明的 title prop 合法放行）；spec 旧锚四形态全量随迁（getAttribute 属性断言/[title] 选择器/源码字面量/DOM `.title` 属性读，含行为断言浮层三要件范式：指令注册+focusin 立即显示+读 `#vt-tip`）。
- 迁移页能力栈五维补全：事件时间线单事件钻取（行展开完整 message/时间戳/level+复制）、关键字搜索（与档位芯片 AND）、JSONL 独立导出；详情深链 `?jobId=&detail=1` 自动开弹窗（作业缺失如实 toast）；速率 SparkLine 历史持久化（`xm-rate-hist-v1` 单作业 60 点环形、总键 cap 50 淘汰、删除/批量清理同步清键）；DONE 行「等价验证」弹层（verdict 三色徽标+role=status、计数对三态徽标、样本明细含截断标注、加载防重入、错误内联可复制）；迁移方案预设（调优/高级/建索引档六参数整存整取 cap 20，零连接零凭据）；diff_structure UI 化（同步行「结构对比」入口+三清单复刻浏览器端豁免口径：settings 整键/analysis 平铺前缀+嵌套组件差集/字段降级 type 未变豁免，计划外差异红显）；三步向导完成态点亮+「继续迁移数据」全链 CTA（自动 preflight 开报告）；「完成后自动等价验证」开关（默认开随草稿）+DONE 自动验证（竞态守卫防抢弹窗，消费即清）；verify 结果落事件线（浏览器 VERIFY 事件入台账环；服务端 /events 只读无写入口，降级 sessionStorage 会话稿+「本会话」徽标，不伪造持久化）；批量链「全部等价验证」（串行逐个+verdict 矩阵）；SparkLine 交互升级（scrub/点击定位「不晚于采样 ts 的最近事件」scrollIntoView+高亮一拍、粘性 pin、THROTTLE 事件插值打标）；workbench 草稿跨会话（localStorage 独立 key+redactDraft 凭据掩埋三层+旧会话稿一次性迁移+500ms 节流+「等于默认不落盘」）。
- MCP 增强与四端口径统一：es_xmigrate 组 schema 硬化（srcConnId/destConnId/sourceIndex/destIndex/jobId/sampleSize/sampleFields/aggField/aggSize/rps 十参数，sampleSize/aggSize number 型）；全组工具 annotations（readOnlyHint 仅零写组、destructiveHint 仅含破坏性 action 组、idempotentHint、openWorldHint——四 hint 静态表三端全等且 parity 含派生自检防漂移谎报）；migrate_index/cross_cloud_structure_sync prompt 升级（verify_equivalence 数据终验步骤、expectPlanDigest 执行守恒语句、destIndex 参数四端补齐、钳制值口径入文）；权限 rank3 前后端对拍清单双侧登记 verify-equivalence。
- 组件质量：三处自绘 input 升级（ClusterSwitcher 五输入 label/for+id 关联（uid 多实例安全）、ColFilterPopover 值内搜索 aria-label+焦点环补齐、GuardedActionButton aria 三件套+Enter 提交+aria-invalid 空输入不误报）；ConfirmModal 守卫输入 aria 接线对齐；Tip.vue 头注与 v-tip 承接现实对齐；XmigrateView 存储写通道单源收口（removeStoredRaw）。
- 双会话协同终局（两个会话并发推进同一批，文件所有权交错零冲突）：本批由主会话（任务池①②③④+MCP 增强+双兵蚁契约/组件审查）与接力会话（vTip 可达性 role/Escape/resize/触屏通道、MCP 四端七处口径差、diff UI+全链向导+verify 落线、任务级恢复提示 XmJobResumeTip、时间线×曲线联动、title 旧锁 48 处三波清零、S3 审查）叠加交付；合并全量后修复 spec 旧锚漏网 20 处与 Java 组清单断言 3 处。
- 测试与数字：check-mcp-parity 17 组/167 action+6 prompts+9 URIs 四端对齐（含 annotations 负控）；Java console 全量 1,981 例 0 失败 0 跳过（新增 VerifyEquivalenceTest 13 例）；UI 全量 12,904 例全绿（新增 vTip 18 例/browserVerifyEquivalence 12 例/xmVerifyEquivalence 8 例/xmPlanPresets 6 例/xmDiffStructure 6 例/xmFullChain 6 例/xmSparkScrub 9 例/xmDraftPersist 8 例/browserMcpPromptParity 3 例/colFilterFocus 等域）；verify-local-mcp 冒烟含 verify_equivalence 双形态+聚合+INCONCLUSIVE+annotations 断言；browser-parity 92/174/68/10、doc-links 28 文件、zero-skipped 双端全绿；typecheck 零错误。

## 1.0.78 — 2026-11-21

- 跨云结构同步 v3（生产→UAT 跨厂商场景的执行守恒）：sync_structure 新增 `body`（适配后建索引体预览）/`planDigest`（canonical `{settings,mappings,aliases}` 摘要，浏览器 https/localhost 走 crypto.subtle SHA-256、http 降级稳定 FNV-1a）/`destConnId` 回显；执行时携带 `expectPlanDigest` 与重算摘要不一致即 409 `PLAN_DRIFT` 拒绝（dryRun 后源结构漂移零意外执行），预览带该参明确拒绝；三端（服务端/浏览器/本地 stdio）同语义，MRTR 修法双侧收口（验签前剥 `inputResponses`/`requestState` 构造 cleanArgs，用干净 args 验签+执行，签名侧本就干净）。
- 能力对比与结构对账（sync→verify 闭环）：新增 compare_capabilities（双侧探测产出版本差 `versionGap`（major.minor 口径）/厂商切换/插件差/节点规模/分级 risks 矩阵）与 diff_structure（源 vs 目标既有索引 settings/mappings 键级差异，兼容矩阵 `expectedRemovals` 豁免计划内剔除，计划外差异进 `unexpected` 并给 `compatible` 判定，报告含 `destConnId` 回显）；diff 豁免三形态齐备——settings 整键、`index.analysis.{kind}.{name}.*` 平铺前缀、嵌套 `index.analysis` 单键（计划剔除组件呈现为整键 valueChanged，按组件级差集豁免，sync 后 verify 不误报不兼容）；settings 值比较三端统一键序无关深比较（对象值 String 化恒等导致的漏报修复）；fieldChanged 豁免补「type 未变」条件（降级又改 type 的差异仍逐项呈报）；probe 附索引画像 `index` 参数本地端补齐（sourceAliases/sourceBytes/srcShards/srcDocCount/fieldTypeCounts 五键镜像，与浏览器端/服务端同口径）。
- 运行中动态调速：跨集群迁移 RUNNING 作业 `throttle` 端点（rps docs/s，-1 恢复不限速，0/<-1 三端一致拒绝）；服务端下一批搬运生效、浏览器批粒度限速（每批读当前值，运行中改立即生效）、本地 stdio 编排内核 transferLoop 同款；THROTTLE 事件入台账；页面详情 RUNNING 行调速弹层（NInputNumber+Enter 提交）。
- 别名元数据守恒：sync_structure 随迁别名带 `filter`/`index_routing`/`search_routing`/`routing` 定义原样透传（此前浏览器/本地端只发 `{add:{index,alias}}`，带过滤条件的别名随迁后静默丢失过滤语义——MCP 契约宣称的 "filter/routing metadata preserved" 三端兑现）。
- 迁移页与重建页观测升级：Xmigrate 详情事件时间线筛选芯片（全部/门禁/错误/终态，档位自适应无命中不出）+自动滚动（数据身份守卫——同内容刷新拍新 JSON 对象引用不打扰翻历史，修复引用比较在真实轮询下恒失效把用户拽回顶部的缺陷）+跨天分组段头（吸顶+`--n-color` 容器底色不露深色块，两页孪生口径 fs-2xs/tx1）；AdhocRebuild 速率 SparkLine（60 点环形窗）+健康芯片+参数预设（ar-rebuild-presets，坏 JSON 静默降级）+ProgressTrack 统一进度条组件（scaleX 动画/indeterminate 流动/reduced-motion 退化/aria 完备，xs 档无边框等值承接旧 4px 实心）。
- 三端行为语义统一（三端契约审查十四嫌疑点逐项裁决后修复工蚁三线并行落地）：diff_structure 语义合并（expectedRemovals 三端同构 `{area,key,reason}`、mappings 比较 type/analyzer/search_analyzer/normalizer 语义属性、onlyInTarget/valueChanged 计入 unexpected、按计划降级字段豁免——compatible 判定三端同口径）；错误码三态统一（计划漂移 409 `PLAN_DRIFT`、目标缺失 404 `DEST_NOT_FOUND`、目标已存在 409 `DEST_EXISTS`）；降级回退三端归一（analyzer/search_analyzer 缺省 standard、normalizer 恒剔除属性）；vendor-private 改键归属模型（键命中厂商前缀表且目标厂商已知且不同即剔——源侧残留的跨厂商私有键不再漏剔，目标厂商未知保守不剔并逐键 warning 留反应式兜底）；参数边界矩阵统一（compare sourceIndex 可选、destConnId 三端可选缺省宿主/自动回填、diff destIndex 可选缺省与源同名、dryRun=true 携 expectPlanDigest 三端明确拒绝）；compare risks 口径统一（versionGap major.minor、vendorChanged 排除 unknown、plugin_missing 按已知组件分档 action、shard_oversize 要求数据节点>0）；TS/本地迁移建索引路径接入兼容矩阵（跨厂商 xmigrate start 不再因私有 settings 裸失败，探测/矩阵失败降级原样不阻断）；body 形态统一（settings 嵌套 `{"index":{…}}`、aliases 按 synced 口径=「将 PUT/已 PUT 的内容」）；throttle 边界统一（rps 0 与 <-1 双拒绝、THROTTLE 事件三端入台账）；降级 reason/advice 文案与触发口径统一（英文模板+厂商尾缀、plugin_install 仅实际剔除时逐插件发）。
- MCP 全链路权限口径修复（用户实报）：`es_cluster` 组 `stats`/`cat_allocation` 两个正式 action 的实现走 rawGuarded，被 RAW_SYSTEM_READ_DENY「系统管理接口」清单误伤——非 ADMIN 调用必拒且错误文案是 raw 实现细节口径，而浏览器/本地端的 es_rest GET 同路径放行，三端口径打架；核验 `/_cluster/stats`（集群级聚合：节点数/OS/JVM/FS/分片统计）与 `/_cat/allocation`（节点级磁盘/分片占用）均为纯观测聚合、不含控制面索引名与凭据，且控制台 UI 概览/健康/分片页对同角色本就展示这些数据——两路径移出 DENY 清单，专用 action 与 es_rest GET 同口径可读，守卫测试随迁并新增放行正控（EsIndexAdminRawHardenTest 56 例）。
- ResultTable 列头「排序箭头叠筛选漏斗」用户实报修复：激活箭头此前是流内元素，悬停让位内衬（34px）会把它推进漏斗的绝对定位区形成图标叠图标；改为与 ⇅ 提示同锚点（absolute right:24 垂直居中）位置恒定，激活列列名常驻让位，两表多列角标（rt/qrt-sort-ord）同轴锚定不再贴列名尾部漂移（rtSortOnAnchor 锁面含源码锚点字面+挂载态+负控）。
- MCP 编排指引：新增 cross_cloud_structure_sync 提示词（六步编排：双侧 probe→compare→dryRun 预览→确认→执行（MRTR+expectPlanDigest）→diff 验证），三端正文逐字一致；docs/mcp.md 163→166 对齐（action 表 18 个 es_xmigrate/prompt 表 6 行/本地能力描述重写）。
- 测试与数字：check-mcp-parity 17 组/166 action+6 prompts+9 URIs 四端对齐（含负控）；Java console 全量 1,968 例 0 失败 0 跳过（全 reactor clean test -DforkCount=6 CI 等价终局）（新增 CompareCapabilitiesTest/DiffStructureTest 6/StructureSyncV3Test/EnsureDestCompatMatrixTest/MigrateAdviceErrorCodesTest/XmigrateThrottleTest 等）；UI 全量 12,798 例全绿（新增 xmCapDiff/xmCompatBody/xmThrottle/xmTimelineFilter 含数据身份守卫回归锁/browserCompareDiff 含嵌套豁免锁/arPresets/arRateSpark/arTimelineDayGroup/progressTrack/rtSortOnAnchor 等 1122 批 spec）；verify-local-mcp 冒烟含 throttle 三段/嵌套 arguments MRTR 正控/digest 闭环端到端。

## 1.0.77 — 2026-11-21

- 跨集群迁移兼容矩阵（生产→UAT 跨厂商结构同步核心）：新增 probe_capabilities（MCP 162→163 action，服务端/浏览器/本地 stdio/文档四端契约逐字对齐）——探测源/目标集群厂商六档（阿里云/腾讯云/AWS/Elastic/OSS/未知，附判定依据 evidence，插件 id 与 distribution 双证据链）、版本、插件清单（跨节点聚合去重，探测失败如实标 pluginsReliable=false）、节点/数据节点拓扑；CompatMatrix 八规则主动预剔除：apack 私有设置、TTL、路由分配属性（include/exclude/require/initial_recovery 四子域精确匹配，total_shards_per_node 等跨集群设置保留）、目标缺失插件的分析组件（级联剔除引用缺失组件的自定义 analyzer、无定义直引也降级字段）、缺失 ILM 策略五类 strip，分片数/副本数/存储介质三类 advise 只建议不动数据；单条规则失败不阻断整体（per-rule 隔离+warning）。
- sync_structure v2：报告升级为 planned（预剔除计划，每刀带中文理由）/reactive（建索引报错兜底，≤20 轮旧行为保留）/aliases（别名随迁，dryRun 按计划口径、执行按事实口径，skipped+synced 恒等于源别名总数）/advice/warnings 五段；dryRun=true 零写预览（不 PUT、不写别名、MRTR 豁免仅限 dry-run），syncAliases=true 随迁源别名；三端（服务端/浏览器/本地）镜像同语义。
- 迁移页旗舰流：兼容计划预览弹层（源/目标厂商芯片对、每刀理由清单、vendor 判定依据 Tip 悬停可查）、dry-run 预览入口、别名随迁开关；批量迁移渐进提交+失败重试+前缀映射预设（writeStoredRaw 单源记忆）；详情事件时间线（筛选+新事件自动滚动+轮询拍失败保旧数据）；冲突样本游标分页拉满（服务端游标/浏览器单页双形态兼容+truncated 两端对齐）；作业右键菜单（克隆/导出快照）、迁移健康摘要、jobTracker 停滞告警（3 拍触发/恢复再停滞/终态清理）。
- 托管重建增强：重跑参数覆盖（requestsPerSecond/slices/batchSize，-1=不限速、0/负 slices 归一 auto，服务端/浏览器同口径，修复浏览器端互斥条件自指误拒）；文档数终态对账四态（MATCH/GAP/SOURCE_GONE/UNAVAILABLE，源 404 如实标「源已删，仅快照可比」）；事件时间线随重跑刷新+运行期节流静默刷新。
- MCP 编排指引：migrate_index 提示词插入结构兼容步骤（先 probe_capabilities 探测能力→sync_structure dryRun=true 预览剔除计划→确认后 dryRun=false 执行需 MRTR，别名随迁 syncAliases=true），三端正文逐字节一致；本地 stdio 编排支持 probe/dry-run 预览/别名随迁/断点台账（10 adhoc+15 xmigrate action 冒烟含 vendor 推断与 planned/reactive 两层收敛端到端）；es_xmigrate_conflicts 本地返回形态对齐服务端契约（conflicts/conflictSamples/sampleCap/note）。
- 浏览器镜像诚实度对齐：probe 补 pluginsReliable、routing 四前缀精确匹配、reactive reason 去前缀直存原始报错、版本对比警告改 major.minor 口径、evidence 统一小写、探测失败 plugins 输出 null 不塌缩为空数组；reconcile 源计数空串不再冒充 0（numOrNull）。
- 高质量组件收口：长 title 存量 13 处全量迁移 Tip 统一件（componentQualityBan 白名单归零=零容忍，dateFieldSniff 单源常量承接双页重复文案）；手搓 1024 换算 3 处退役（改直书 524288/措辞调整）；XmigrateView 分区折叠与前缀预设存储收口 writeStoredRaw 单源；AdhocRebuildView 事件线容器弹性档（max(240px,42vh)）。
- 测试与数字：check-mcp-parity 17 组/163 action 四端对齐（含负控）；Java console 全量 1,918 例 0 失败 0 跳过（新增 CompatMatrixTest 18/ProbeCapabilitiesTest 10/StructureSyncDryRunTest+AliasesTest/XmigrateEventsTest 6/XmigrateConflictsPagingTest 5/PreflightEnhanceTest 5/AdhocRebuildReconcileTest/AdhocRetryOverrideTest 等）；UI 12,708 例全绿（新增 xmCompatPlan/xmBatchProgressive/xmDetailEvents/xmConflictsPaging/xmHealthSummary/jobTrackerStall/arContextMenu/arExportSnapshot/arHealthSummary/arReconcile/arRetryOverride/arTimelineFilter/browserCompatMatrix/browserReconcile/browserSyncStructureDryRun/browserXmigrateEvents 17 个 1121 spec）；verify-local-mcp 冒烟含 probe vendor 推断与 planned/reactive 两层结构同步 dryRun 预览端到端。

## 1.0.76 — 2026-11-21

- 重建迁移群治理与可观测闭环：跨集群迁移作业历史首次可治理（REST DELETE 单删终态/按天清理 + 作业表行级删除与「清理 7 天前」入口，对齐托管重建体验）；迁移对账读面补齐（reconcile 双侧文档数比对 + conflicts 版本冲突样本环 → 详情弹窗「目标对账」区，diff=0 绿/≠0 红/取数失败中性，浏览器模式 501 诚实边界）；托管重建作业事件时间线三端落地（服务端 stageEvents 事件环封顶 200 条随阶段转移自动记录 + events REST/浏览器轮次派生/本地台账同形，详情页竖向时间线轴，GATE 事件琥珀高亮、终态按状态着色）。
- 跨集群结构同步·兼容性自适应（生产→UAT 跨厂商场景）：新增 sync_structure 能力（REST + MCP + 浏览器 + 本地四端）——拉源 settings/mapping 规范化后在目标多轮试建（≤20 轮），按 ES 报错自动剔除厂商私有 setting（unknown/private setting）、剔除不可用自定义分词组件并降级引用字段（analyzer/search_analyzer 回退 standard、normalizer 剔除），回报告逐项说明「剔了什么、为什么」（removedSettings/removedAnalysis/downgradedFields 三清单 + 双侧版本对比警告）；目标已存在 409 拒绝不覆盖。页面端在迁移页源配置区新增「同步结构到目标」入口（目标名跟随预填、报告区含继续迁移数据快捷衔接）。
- MCP 三端增强（17 组 / 156→162 action）：es_xmigrate 组 +connect_check/resolve_preview/dest_indices/delete_jobs/sync_structure（13→14）、es_adhoc_rebuild 组 +events（9→10）。本地 Node stdio MCP 从「编排类 9/9 诚实报错」升级为真实编排内核：scroll+bulk 搬运（409 冲突样本环）、断点台账（~/.esquerystudio/local-mcp/jobs.json，重启标 INTERRUPTED）、托管重建建目标/确认门/别名切换保序/可选删源、迁移探测/续跑/对账全链，写操作仍需 --allow-write。README/architecture 文档数字随批对齐（16 组/136 → 17 组/161→162）。
- 纯前端模式迁移搬运升级：sliced scroll 并行搬运（上限 4 路，台账 500ms 节流合并写）、preflight 双侧检查（源/目标 health 与文档数分片数，字段口径对齐服务端）、resume 从已迁移基线续扫（bulk 改 create 语义使 409 跳过真实生效）；修正 resume 后 hostCall 空引用。browserApi 响应体构造修复（204/205/304 携带 "null" 字符串会在标准 fetch 构造器抛错）。
- 高质量组件清零续章：任务树行勾选（render 函数原生 checkbox→NCheckbox 受控）、MCP 工具试运行参数数字输入（原生 number→NInputNumber 整数/浮点档）、伪链接两处（javascript:void 0/#→role=link 键盘可达）、孤儿 ProgressBar 组件退役（零引用确认后删除）、原生 title 长文本继续迁移 Tip 统一件（任务树 9 处全量/设置网格 3 处/MCP 面板与结果表降级档，componentQualityBan 门禁快照归零新增）；legacy 重建死客户端面退役（api.rebuildEmpty/api.status 全站零调用整条移除，spec 锁反转防回潮）。
- 测试与数字：check-mcp-parity 17 组/162 action 三端+文档对齐（含负控）；Java console 全量 1,852 例 0 失败 0 跳过（新增 StructureSyncServiceTest 13 例/XmigrateSyncStructureToolsTest 8 例/XmigrateGovernance 与事件环与治理端点等）；UI 12,615 例全绿（新增 xmigrateGovernance 9/adhocEventsTimeline 4/xmigrateStructureSync 9/browserMcp+5/browserXmigrate+4 等）；verify-local-mcp 冒烟含三轮自适应剔除收敛端到端。

## 1.0.75 — 2026-11-20

- MCP 辅助工具扩展（AuxTools 域）与浏览器镜像同步；结果表格渐进渲染升级（useRenderMore 收口、ResultTable/QueryResultTable 统一形态）；直方图与托管重建/REST/SQL/DSL 多视图打磨；工作台视图对齐与结果陈旧态提示（useResultStale）落地。
- 测试与数字：verify 系脚本（server/cli/local）三链冒烟齐备。

## 1.0.74 — 2026-11-20

- MCP 治理强化：工具单轨制校验收口、MCP key 管理面（McpKeyController 与管理测试域）、迁移对账工具（ReconcileTools）；新增 verify-server-mcp / verify-mcp-cli 验证脚本，本地/服务端/CLI 三验证链齐备；整体瘦身（净删约 380 行）。

## 1.0.73 — 2026-11-20

- 迁移数据完整性修复：极速模式 bulk 计数虚报（成功条数改按响应聚合如实统计）与 refresh 静默吞异常两缺陷修复，异常不再被吞、计数不再虚高。
- 迁移体验全面强化：迁移 UX 全量打磨、作业回放、启动门与导出、源目标选择、作业列表生成等一批能力落地（xmigrateUx/Replay/GateExport/SourceTarget/JobsGen 测试域同批落位）。

## 1.0.72 — 2026-11-19

- 托管重建历史作业回读补全（自洽续章）：持久化 payload 本就保存完整 toMap 快照，但回读实现只挑状态字段——宿主重启后历史作业在列表/详情里逻辑名空、计数与耗时缺席。回读现经展示字段覆盖层（逻辑名/策略/源目标物理名/源目标文档数/进度三字段/耗时/轮次/收尾报告/失败样本等 22 键白名单）叠上快照真值，纯查询视图零行为语义；Es/Jdbc 双档同口径。连带修复 memberAliases 探测失败日志缺异常尾参（静默降级面留堆栈守卫）。
- 测试与数字：Java 全模块 1,770 例全绿（+5）。

## 1.0.71 — 2026-11-19

- 托管重建「别名链安全」自洽闭环（QA 实报事故驱动：直连重建删除源物理索引时，连带断开了它作为唯一成员的业务别名，业务查询 404）：**探测结果卡新增「所属别名」行**——所选物理索引挂在哪些别名下一目了然，是其他别名成员且非别名形态时红字警示「直连重建会删除它并断开这些别名，业务会 404」，别名 chip 可点一键转换（输入名换成该别名并自动重探，切换形态变原子零窗口）；**启动硬拒兜底**——服务端 start 在直连分支实时反查源物理的别名成员（不采信探测时点结果），非空即拒绝并指路「请改用别名名作为重建入口」，反查失败 fail-closed 同样拒绝；浏览器端逐字同款。别名模式（write-index 原子切换）不受影响。
- 测试与数字：前端 1,532 个文件 / 12,358 例全绿（+5），Java adhoc 域 124 例全绿（+5），零跳过。

## 1.0.70 — 2026-11-19

- 全站「廉价组件」清零批（用户点名弹窗与下拉）：**64 处原生 `<select>`（34 文件）全部升档 NSelect**（naive-ui，深色主题全局承托、键盘/焦点语义内建；含 DevTools 原生 select 伪装 ghost 按钮的廉价件、10+ 页消费的 AutoRefreshSelect 统一件——对外契约零变化）；**14 处原生 `datalist` 全部退役**（值建议位升 SuggestInput/usePopupList combobox，可输可选语义保留——「从集群复刻」弹窗内与 NSelect 并存的双范式、审计三筛、分词实验室四清单、MCP 面板三处、构建器算子位）；原生 confirm/alert/prompt/dialog 此前已零存活。
- 校验报告区去廉价化重设计（用户截图点名）：托管重建审编步报告头手写 ✔/✘ 混排退役 → StatusPill 主徽章 + 错误/警告/建议三色计数 pill（0 值档不渲染）；错误码/路径/修复目标键全部 `<code>` chip 化（键名与建议值从 title 悬停上屏可见——「一键补充 max_ngram_diff=39」一目了然）；severity 徽章列定宽收齐、正文列 min-width 栅格修复（长 mono 路径 anywhere 换行不再跨列）；两页（托管重建/配置校验）双轨形态统一。
- 行内 code 全局统一 chip 档（theme.css）：四页各自私造的四种底/内距皮退役，更多裸奔位点（taskId/语法速查/权限信息）自动吃全局档——mono 长串与中文散文混排从此有界可辨。
- 手搓弹窗迁精致壳：MappingDesigner 与 Plugins 两处自研 modal（无阴影/无过渡的「纸片感」）迁 ModalShell（teleport+过渡+blur 遮罩+动态 z-index 治理）。
- 升档连带修复 3 处产品缺陷：值 chip「回车添加」在零候选环境被吞（Enter 分支显式化）；查询树重扫仍按原生 select API 读已升档算子位（TypeError 中断整条链路，改读回显文本）；7 处右键排除判定不含 NSelect 根（下拉区右键误弹行菜单，排除集统一补 `.n-select`）。
- 细节噪音收口：SideNav 等图标线宽五档分裂归一（统一默认 2）；同语义图标尺寸混用档收敛。
- 测试与数字：前端 1,532 个文件 / 12,353 例全绿（+19），零跳过。

## 1.0.69 — 2026-11-19

- 校验报告新增「一键补充」（ADD_SETTING）：dry-run 对 ngram diff 等 index 级限制报错时（ES 错误文本自带 `This limit can be set by changing the [index.max_ngram_diff]` 指路），解析出缺失键名与实际差值生成机器可执行修复动作，审编步与配置校验页报告行渲染「一键补充」按钮，确认门后写入 settings（已有键按原书写形态覆盖、新键入 index 嵌套，纯数字值写数字）；服务端/浏览器端同口径。典型场景：粘贴期望配置整体替换 settings 时源索引的治理键被静默丢弃——此前用户被 ERROR 卡死且无路可修，现在点一下即通。
- 托管重建目标名剥净历史代后缀：源索引是历史重建产物（`..._adhoc_yyyyMMddHHmmss`）时，建议名先剥净旧 `_adhoc_` 后缀再拼新时间戳——不再每重建一代叠一层（实测出现 `..._adhoc_20260806134223_adhoc_20261119161520` 双层叠加，多代后逼近 255 上限且不可读）；服务端 suggestDest 与浏览器端同口径。
- 测试与数字：前端 1,530 个文件 / 12,334 例全绿（+12），Java 全模块 1,764 例全绿（+4），零跳过。

## 1.0.68 — 2026-11-19

- 托管重建「诚实反馈与危险操作收口」：确认预览步接入目标磁盘预估（复用 `/cluster/reindex-preview` 三端同构端点，按源物理名异步拉取，同源缓存、失败静默整行不渲染不播报，「再来一次」清场连带失效缓存）；别名切换确认门补位——未勾删除旧索引时同样先过 warn 门（此前零确认直接翻写入路由），勾删除的 critical 门守卫对象改用将被物理删除的 `sourcePhysical`（此前手输的是逻辑名，别名≠物理名时确认形同虚设）；中止确认去掉「本次会话不再询问」（删半成品索引属破坏性动作）。监控与作业表可读性：失败原因友好化（完整原文可复制）、终态耗时冻结不再走字、类型风险计数给截断前真实总数、strategy 列中文、作业清单拉取失败改错误卡+就地重试（不再整卡消隐）；MANUAL 直切隐藏无意义输入、INCREMENTAL 禁用给现场原因、追平缓冲补语义提示；顶栏徽标与实时大屏消费运行态真实进度百分比（旧后端/终态不冒充）；零剔除提示改 target-aware 口径（旧「恒定作用于宿主集群」在连接目标下误导核对方向）。
- 托管重建执行调优参数面：`start` 新增 `requestsPerSecond`（限流，-1/缺省不限，0 拒绝）与 `slices`（auto/≥1 整数），全量 reindex 走 typed API、追平轮走 body 顶级键，大索引重建可限速护集群；向导追平策略步内新增执行参数区（草稿化、即时校验、确认预览回显、缺省不发键）。
- reindex 失败文档样本透出：任务收尾轮经低层 `_tasks` 补采 `response.failures`（前 10 条 `{type,reason,index,id}`，RHLC typed client 丢弃该节点的限制绕开），随作业快照透出到监控步（缺席不渲染，≥6 条折叠）。
- 宿主重启孤儿作业收养：作业清单/详情查询时把「持久化快照 RUNNING 且本实例内存缺席」的作业标 FAILED 并写明中断阶段与处置建议（懒收养避开启动窗口；快照携带实例标识——多实例共享控制集群 store 拓扑下外来实例的活作业不误杀，宁可遗留陈旧态交运维按实例判断）。
- 浏览器模式与服务端语义对齐：目标名 `_adhoc_` 同构；别名切换改 write-index 原子双 add（旧索引保留别名内只读，不再被移出）；中止保留目标索引供诊断；INCREMENTAL 追平轮全量移植（覆盖式 range reindex ≤3 轮、created+updated<50 收敛、切换后终追任务 `op_type=create` 异步收尾、确认门移至追平收敛后）；MANUAL 给回补 DSL 建议；执行参数透传；中止终追期间可取消且收尾不覆写已中止状态。
- 托管重建接入 MCP 工具面：新增第 16 个 action 组 `es_adhoc_rebuild`（prepare/start/status/abort/confirm_switch/jobs 六动作，136 工具），三端四面逐字对齐；写动作进 WRITE/DESTRUCTIVE/MRTR 确认门三清单，页面键挂 `adhoc-rebuild`；浏览器桥经既有本地实现直达，本地 stdio 诚实降级提示需服务端控制台；fail-fast 与目标过滤两例行为护栏入测。
- 新增《重建与迁移选型指南》（`docs/rebuild-guide.md`）：托管重建 / Reindex 高级 / Reindex 预估 / 跨集群迁移四页的决策表、能力对照与重叠取舍，README 与文档地图挂链。
- 测试与数字：前端 1,529 个文件 / 12,322 例全绿（+36），Java 全模块 1,760 例全绿（+25），零跳过；MCP parity 16 组 / 136 工具对齐。

## 1.0.67 — 2026-11-18

- 修复「从生产拷贝索引结构校验失败」三个根因：草稿凭据掩码正则误伤 `tokenizer`/`token_chars` 家族键（值被掩成 `***` 落盘、恢复后污染校验与建索引，观测环脱敏同口径豁免）；GET `_settings` 原样粘贴带来的系统只读键（uuid/creation_date/provided_name/version/routing 等 8 类头键）与显式重置的 null 值键未随归一化剥离（原样建索引被目标集群拒 `unknown setting`），现与自动取源路径的清理清单对齐、以 INFO 标注透出；Dry-run 错误消息解析在 reason 内层 `]` 处截断（`unknown setting [index.xxx` 缺右括号），改为段尾判定后完整透出。
- 新增「从集群复刻」：托管重建审编步选连接中心已存档案 + 源集群索引清单点选（`connect-check` 拉取、datalist 原生补全、失败手输兜底），一键拉取白名单精选 settings（插件 analyzer 组件名按源集群 `_nodes/analysis` 还原）与 mapping 拆填审编框；浏览器模式补 fetch-config 的 connId 档案解析（本机档案库取凭据，档案不存在 404 不回落当前激活档案），迁移页浏览器模式同款缺口一并修复。
- 新增校验报告「一键移除」：issue 携带机器可执行修复动作 `REMOVE_SETTING`（L1 `UNKNOWN_SETTING_KEY` 与 L2 dry-run `unknown setting [index.xxx]` 两产生点，服务端/浏览器端同口径），审编步与配置校验页报告行渲染按钮，确认门后 `removeSettingKey` 共享内核三形态删键（顶层平铺 / `index.` 前缀 / index 嵌套清空父），取消或键已不在都如实反馈。
- 测试与数字：前端 1,527 个文件 / 12,286 例全绿（+24），Java 全模块 1,735 例全绿（+13），零跳过。

## 1.0.66 — 2026-11-17

- 文档整合：integration 目录的实体写法 / 自动登记 / 冲突转 Adhoc 三篇合一为 `mapping.md`（内容原样迁移，标题层级重排）；MCP 快速开始并入 `mcp.md` 的「快速开始」章节；docs 从 19 篇收敛到 15 篇，全部索引、产品内集成指南与契约测试同步。

## 1.0.65 — 2026-11-16

- 宿主冲突收敛：`spring-boot-starter-web`/`-aop` 依赖改 `optional`（宿主自带才启用，不再传递强加）；三个 Web 组件（静态资源守卫、期望状态控制器、控制台模式配置）加 `@ConditionalOnWebApplication(SERVLET)` 守卫，非 Web 宿主零装配；写重试切面加 `@ConditionalOnClass` 守卫与 `esquerystudio.elasticsearch.write-retry-aspect-enabled` 开关，栈契约校验加 `stack-contract-enabled` 开关（默认全开，行为不变）。
- 测试整合：23 个编号测试文件合并为 5 个（JUnit `Enclosed` 套件，嵌套类各自独立 fixture）；重建锁巨类按「失锁防护 / 禁用降级」语义拆分。测试总数前后对账一致，零跳过。
- 提速：重建锁确认轮询间隔改为构造注入（失锁测试用例 10.4s → 0.34s，生产默认 1s 不变）；Surefire `forkCount=6`；UI 并行分片 8 → 16（按核数 60% 自适应）；CI 移除冗余步骤并改浅克隆，全流水线约 4 分钟。
- 清理与修复：移除历史探针与社区发帖物料；quickstart 与配置参考中的死前缀 `es: rebuild:` 修正为真实绑定 `esquerystudio.elasticsearch`；重复图片去重；开发依赖链 67 处 semver 内安全升级（生产依赖零漏洞）。

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
