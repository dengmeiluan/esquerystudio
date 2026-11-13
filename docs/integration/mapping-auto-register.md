# Mapping 自动登记

## 生效范围与时机

自动登记只在 `esquerystudio.elasticsearch.mode=client` 下装配，`esquerystudio.elasticsearch.mapping.auto-register=startup` 默认开启。它监听 `ApplicationReadyEvent`，随后用一个 daemon 单线程异步执行一次；应用 ready 不等待对账完成。`off` 不装配启动 runner。

mapping 自动注册在启动时扫描宿主基础包中的 `@Document` 实体。手写 `ManagedEsIndex` 是已废弃的 legacy provider，残留 Bean 会被扫描器 fail-fast 拒绝，不能作为扩展点继续使用。

## Mapping 来源优先级

每个实体只按以下顺序选一份期望 mapping：

1. `@Mapping.mappingPath` 指向的 JSON 原文。
2. 没有 `@Mapping` 时，使用 Spring Data Elasticsearch 的 `@Field` 注解推导。
3. 两者都没有可用 properties 时跳过并记录 `reason=NO_MAPPING_SOURCE`。

starter 不根据裸 Java 类型猜业务语义。没有 `@Mapping` / `@Field` 时，不会把 `String` 自行猜成 `keyword`，也不会猜 analyzer、nested 或日期格式。

## 允许与禁止的变更

启动对账只提交 ES 允许的字段增量 addition：新增顶层字段，或在兼容对象下新增子字段。`dynamic_templates` 是 manual-only，不会由启动对账自动 PUT。字段写入后会重新读取并验证结果。

它永远不会：

- 删除现有字段。
- 把现有字段从 object 改成 nested，或修改任意既有 type。
- 修改既有 analyzer、search_analyzer、normalizer、format、ignore_above 等参数。
- 自动创建不存在的索引。

根 `dynamic` 与 `dynamic_templates` 都是整体边界：`dynamic` 只有完全相同才收敛，期望与实际不同或实际缺失均视为冲突；`dynamic_templates` 无论实际缺失还是内容不同，都产生 `DYNAMIC_TEMPLATE_CONFLICT` 与 `USE_ADHOC_REBUILD`，必须手工处理。两者都不能局部合并后假装兼容；未在期望配置中声明、但 ES 已有的根配置会保留。

## 策略语义

`conflict-policy=fail` 遇到任何冲突时不提交本轮 additions，返回 `CONFLICT` 和 `action=USE_ADHOC_REBUILD`；因此 `dynamic_templates` 冲突时是零写入。`conflict-policy=warn` 仍不会写入 `dynamic_templates`，但可只提交同一份 mapping 中独立、兼容的 `properties` 新增字段；报告仍保留冲突与 `USE_ADHOC_REBUILD`。

目标索引不存在时，`missing-index-policy=skip` 返回 `SKIPPED_INDEX_MISSING`，`fail` 返回 `FAILED_INDEX_MISSING`。两者都只报告，均不创建索引；由于执行发生在 ApplicationReady 后，`fail` 也不会终止已 ready 的 Spring Boot 应用。

## 多实例与请求路径

启动对账先通过本次选中的同一个 `ElasticsearchRestTemplate` / RHLC 查询 alias，alias 必须唯一解析到一个**唯一物理索引**。多目标别名会以 `AMBIGUOUS_ALIAS_TARGET` fail closed，既不读 mapping 也不 PUT；查询返回 404 时才把输入按具体索引名处理，并继续由 `IndexOperations.exists()` 判断是否缺失。starter 不会调用 宿主应用 目标选择器，也不会换用控制集群或另一个低层客户端猜目标。

首次读取成功后，本轮 PUT 会**固定到该物理索引**，不会向 alias 广播。写后验证仍重新读取逻辑 alias，并再次解析目标；若 alias 在窗口内从物理索引 A 切到 B，返回 `FAILED_ES` / `POST_WRITE_TARGET_CHANGED`，报告采用第二次解析到的坐标，不确认任何 addedFields，也不会把 B 上的 mapping 当成本轮写入结果。只有两次解析得到同一个唯一物理索引，才可能验证为 `UPDATED`。

PUT mapping additions 本身可重复提交，写后验证让并发实例按时序最终收敛。只有初始读取已经看到 additions 存在的实例才会返回 `NO_CHANGE`；如果两个实例都在任一 PUT 之前完成初始读取，两者都会计算同一 addition，并且在各自写后验证成功时，两个实例都可能返回 `UPDATED`。后续启动在初始读取看到结果后才收敛为 `NO_CHANGE`。若不同版本声明不兼容定义，则按冲突策略报告，不会用最后写入者覆盖既有定义。

对账不是请求切面：它不会在每次 save、index、bulk 或 query 上运行，也不依赖 `EsWriteRetryAspect`。业务写重试与启动 mapping 对账是两条独立链路，关闭或调整其中一条不会改变另一条的契约。
