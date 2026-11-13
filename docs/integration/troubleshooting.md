# Mapping 对账故障排查

先按 `MappingReconcile` 搜索完整启动日志，再用 `indexKey` / `index` 缩小到单个实体。表中“Adhoc”只表示是否需要通过 宿主应用 新建物理索引并迁移；任何执行前都要确认真实目标集群。

## 哪些内容能从日志搜索

- **汇总日志可搜索字段**：per-index 行固定打印 `indexKey`, `index`, `source`, `added`, `unchanged`, `conflicts`, `status`；当 `MappingReconcileReport.detail` 非空时，追加可搜索的 `reason={detail}` 和 `targets=N`。`targets` 只表示物理目标数量，不打印物理目标名称；完整 mapping JSON 也不会进入日志。成功且 detail 为空时不打印 `reason`。
- **冲突告警可搜索字段**：每个冲突另打一行 `indexKey`, `index`, `path`, `actual`, `desired`, `status=CONFLICT`, `action=USE_ADHOC_REBUILD`。
- **runner reason 可搜索**：外层异常打印 `status=FAILED_ES reason=RUNNER_FAILED` 和堆栈；多个 ES 客户端打印 `reason=AMBIGUOUS_CLIENT candidates=N`；没有可用 mapping 来源时打印 `reason=NO_MAPPING_SOURCE`。
- **MappingReconcileReport 内部 `detail`**：`AUTO_REGISTER_OFF` 等值保存在报告对象内，并在非空时以汇总行 `reason={detail}` 输出，可直接 grep。物理目标仍只暴露 `targets=N`，需要名称时必须使用宿主同一客户端查询 alias。

| 症状或状态 | 第一条日志 / 检查 | 常见原因 | 安全修复 | Adhoc |
|---|---|---|---|---|
| 没有任何 `MappingReconcile` 日志 | 检查 `esquerystudio.elasticsearch.mode`、`esquerystudio.elasticsearch.mapping.auto-register` 和应用是否已发布 ApplicationReady | 非 client 模式、配置为 `off`、日志级别过滤，或进程在 ready 前失败 | 业务应用用 `mode=client`；需要自动对账时设 `startup`；先修复更早的启动失败 | 否 |
| `DISABLED` | 检查 `esquerystudio.elasticsearch.mapping.auto-register` | 直接调用 reconciler 时配置为 `off`；正常自动装配下 runner 本身不会创建 | 改为 `startup` 并重启，或保留关闭状态 | 否 |
| `SKIPPED_NO_CLIENT` | 查宿主是否存在 `ElasticsearchOperations` Bean，再读 `[EsStackContract]` | 宿主未提供 ES 栈、ES 自动配置未生效，或 Bean 被排除 | 补齐并配套宿主 ES 依赖与连接配置，不要让 starter 决定版本 | 否 |
| `FAILED_ES reason=AMBIGUOUS_CLIENT` | 搜索同一行的 `candidates=N`，盘点全部 `ElasticsearchOperations` Bean 及其目标集群 | 宿主存在多个客户端，它们可能连接不同集群；runner 无法证明哪一个是业务写入目标，因此即使其中一个标了 `@Primary` 也拒绝猜测 | 立即方案是只保留一个业务 `ElasticsearchOperations`；确需多客户端时，应显式重新设计 mapping 客户端选择契约，不要靠 `@Primary` 猜目标 | 否 |
| `FAILED_ES reason=AMBIGUOUS_ALIAS_TARGET targets=N` | 用宿主同一个 ES 客户端执行 `GET /_alias/{name}`，核对顶层物理索引键数量 | 初始解析为多目标别名，startup 无法证明 PUT 只影响一个索引 | 把 alias 收敛为唯一物理索引目标后重启；禁止对多目标 alias 直接 PUT mapping | 否 |
| `SKIPPED_INDEX_MISSING` | 核对日志 index 与真实别名 / 物理索引 | `missing-index-policy=skip` 且目标不存在 | 确认索引名；首次建索引或迁移走受控流程，startup 不建索引 | 通常是 |
| `FAILED_INDEX_MISSING` | 同时检查 `missing-index-policy=fail` | 目标不存在；该状态只是 ApplicationReady 后报告 | 修正索引名或用 宿主应用 建立目标；不要等待应用自动退出 | 通常是 |
| `NO_CHANGE` | 对比 desired-state 与 ES mapping | 期望字段已存在且兼容，常见于第二次启动或另一实例已先写入 | 无需操作；保留日志作为收敛证据 | 否 |
| `UPDATED` | 看 `added` 数量并重新读取 ES mapping | 新增字段已 PUT 且写后验证通过 | 再次启动应为 `NO_CHANGE`；若不是，检查连接目标与日志 index | 否 |
| `UPDATED` 但写入仍走默认 mapping | 核对业务实际写入的索引/别名、字段 JSON 名与应用连接集群 | 对账和业务写入不在同一集群/索引，字段序列化名不同，或写入绕过声明实体 | 对真实写目标执行 GET mapping，修正连接、别名或序列化字段名；不要重复改注解碰运气 | 仅既有定义错误时 |
| `CONFLICT` / `USE_ADHOC_REBUILD` | 读取同组日志的 `path`, `actual`, `desired` | 既有 type、analyzer、normalizer、format、dynamic 或 dynamic_templates 不兼容 | 停止原地修改，按冲突文档在已确认目标集群走 Adhoc 托管重建 | 是 |
| `MAPPING_UNPARSED reason=DESIRED_OR_ACTUAL_MAPPING_UNPARSED` | 分别校验 `@Mapping` JSON 与 ES GET mapping 响应 | 期望 JSON 无效，或实际 mapping 含无法唯一解包的旧 type / 模糊结构 | 先修正期望 JSON；若实际 mapping 无效或歧义，保留原索引并在 宿主应用 dry-run 中核对 | 视实际定义而定 |
| `FAILED_CONNECTIVITY reason=READ_FAILED/PUT_FAILED/POST_WRITE_READ_FAILED` | 先核对宿主 ES 地址、DNS、网络与超时；汇总行不打印捕获的 IOException | timeout、connection refused、unknown host、no route 或连接地址错误 | 结合相邻客户端日志和网络探测只修连接问题，确认客户端指向真实业务集群后重启 | 否 |
| `FAILED_ES reason=POST_WRITE_TARGET_CHANGED targets=N` | 对比 PUT 前后两次 `GET /_alias/{name}` 的物理目标 | PUT 已固定写入初始物理索引，但 alias 在写后验证前切到了另一个索引，或写后复读得到多目标别名 | 按第二次目标数量和 alias 实查结果逐一核对 mapping；不要把任何新目标误报为本轮 `UPDATED` | 否 |
| `FAILED_ES reason=READ_FAILED/PUT_FAILED/POST_WRITE_READ_FAILED/POST_WRITE_VERIFICATION_FAILED` | 从同时间的 ES 客户端/服务端日志和 GET mapping 查起 | 权限、ES 拒绝 mapping、索引在对账中变化，或非连接型 I/O 错误 | 按 ES 证据修权限/定义；写后验证异常时先读取现状，不重复盲写 | 冲突定义时是 |
| `FAILED_ES reason=RUNNER_FAILED` | 查看同一 ERROR 的完整堆栈 | runner 外层未预期 RuntimeException，即 `RUNNER_FAILED` | 按第一处业务异常修复；若是 legacy provider，删除手写 `ManagedEsIndex` | 否 |
| `reason=NO_MAPPING_SOURCE` | 检查实体的 `@Mapping.mappingPath` 与 `@Field` | 没有 mapping 文件，且注解推导没有有效 properties | 为需要管理的字段显式补 `@Field` 或提供有效 `@Mapping` JSON | 否 |

## 内部 detail 与可观察检查

这些值来自 `MappingReconcileReport.detail`；detail 非空时也会作为正常汇总日志的 `reason`，因此可以直接搜索。`targets=N` 只给出报告中的物理目标数量：

| 内部 detail | 可观察 status / 阶段 | 第一项安全检查 |
|---|---|---|
| `AUTO_REGISTER_OFF` | `DISABLED`；自动装配通常因 `off` 根本没有 runner 日志 | 检查 `esquerystudio.elasticsearch.mapping.auto-register`，不要把无日志当成 ES 故障 |
| `READ_FAILED` | 初始 GET mapping 后为 `FAILED_CONNECTIVITY` 或 `FAILED_ES` | 核对宿主 ES 连接、目标索引读取权限及同时间客户端/服务端日志 |
| `AMBIGUOUS_ALIAS_TARGET` | 初始 alias 解析后为 `FAILED_ES`，且零 PUT | 检查是否为多目标别名；必须先收敛为一个唯一物理索引，禁止猜测写目标 |
| `INDEX_MISSING` | `SKIPPED_INDEX_MISSING` 或 `FAILED_INDEX_MISSING` | 核对日志 index、别名和真实物理索引；starter 不创建索引 |
| `DESIRED_OR_ACTUAL_MAPPING_UNPARSED` | `MAPPING_UNPARSED` | 分别用 JSON 解析器检查期望 mapping，并直接 GET 实际 mapping 排查旧 type 包装或歧义 |
| `MAPPING_CONFLICT` | `CONFLICT`，另有包含 path/actual/desired 的冲突告警 | 逐条读冲突告警，禁止原地改 type/参数，确认是否需要 Adhoc |
| `ADDITIONS_SERIALIZATION_FAILED` | `FAILED_ES`，发生在 PUT 前 | 保存期望 mapping 与汇总日志时间点，在同版本复现并检查 JSON/delta 序列化；不要向 ES 重复写入 |
| `PUT_FAILED` | PUT mapping 阶段的 `FAILED_CONNECTIVITY` 或 `FAILED_ES` | 检查网络、`indices:admin/mapping/put` 权限和同时间 ES 拒绝原因 |
| `POST_WRITE_READ_FAILED` | PUT 后复读阶段的 `FAILED_CONNECTIVITY` 或 `FAILED_ES` | 直接 GET mapping 确认 PUT 是否已经生效，再修复读连接；不要盲目重复提交 |
| `POST_WRITE_TARGET_CHANGED` | PUT 后 alias 唯一目标与初始物理索引不同，状态 `FAILED_ES` | 分别核对初始固定写入目标和第二次 alias 目标；该次不会确认 addedFields 或报告 `UPDATED` |
| `POST_WRITE_INDEX_MISSING` | PUT 后复读发现索引消失，状态 `FAILED_ES` | 检查别名/索引是否在对账窗口被删除或切换，先冻结并发运维操作 |
| `POST_WRITE_VERIFICATION_FAILED` | 写后 delta 仍有 addition、冲突或无法解析，状态 `FAILED_ES` | 直接 GET 当前 mapping，与刚提交 additions 逐字段比较后再决定恢复或重建 |

`RUNNER_FAILED`、`AMBIGUOUS_CLIENT` 和 `NO_MAPPING_SOURCE` 不属于报告 detail；它们是 runner 直接输出、可搜索的 `reason` 日志，处理方式见上表。

## 启动失败：控制面 SetupRequiredException

控制面尚未绑定控制集群时（新环境首次启动，Setup 首连未完成），任何控制面读取（如 `EsConnStore.list()`、`ControlClusterResolver.client()`）都会抛 `SetupRequiredException`（“控制台尚未绑定控制集群，请先完成 Setup 首连”）。这是引导首连的接口契约，不是故障。

| 症状 | 检查 | 修复 |
|---|---|---|
| 宿主应用启动失败在 `Failed to execute ApplicationRunner`，堆栈含 `SetupRequiredException` | 盘点宿主自己的启动逻辑（`ApplicationRunner` / `CommandLineRunner` / `@EventListener` 启动钩子）里是否有对控制面 API 的直接调用 | 在该宿主 runner 中 catch 并降级：打印 WARN 日志后跳过本轮依赖连接清单的逻辑；Setup 首连完成、保存连接事件发生后，该逻辑通常会被事件路径再次触发，无需重启补齐 |

- 全新环境（空存储）首次启动命中此异常是常态，与配置缺失无关，也没有跳过 Setup 的配置键——首连必须经控制台 Setup 向导完成。
- 宿主启动逻辑不降级会形成死锁：Setup 要在应用启动后经控制台页面完成，而应用起不来就永远无法 Setup。
- 更简单的替代：把依赖连接清单的宿主启动逻辑改为响应连接保存事件（连接建立后自动触发），从结构上避免启动期强依赖。

## 快速复核

1. 业务应用应是 `mode=client`，目标页面是 `/internal/es/index/desired-state.html`。
2. 日志 index 必须与业务实际写别名一致，客户端必须连到预期集群。
3. `UPDATED` 只证明同一唯一物理索引上的读取、固定 PUT 和 alias 写后验证链路成功，不证明业务序列化或其他写入路由正确。
4. `CONFLICT` 不是失败重试信号；它是禁止原地变更并转 `USE_ADHOC_REBUILD` 的安全信号。
