# Mapping 指南

## 实体 Mapping 写法

以下示例使用本仓父 BOM 的 Spring Data Elasticsearch `4.0.9.RELEASE` API，可以直接编译。显式注解业务语义，不要让动态 mapping 替你做不可逆的决定。

### 常用字段

```java
package com.example.order;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.DateFormat;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

@Document(indexName = "trade_order")
public class TradeOrderES {
    @Id
    private String id;

    @Field(type = FieldType.Keyword)
    private String orderNo;

    @Field(type = FieldType.Keyword, normalizer = "lowercase", ignoreAbove = 256)
    private String counterpartyCode;

    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String description;

    @Field(type = FieldType.Date, format = DateFormat.date_optional_time)
    private LocalDateTime tradeTime;

    @Field(type = FieldType.Nested)
    private List<TradeLeg> legs;
}
```

```java
package com.example.order;

import java.math.BigDecimal;

import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

public class TradeLeg {
    @Field(type = FieldType.Keyword)
    private String bondCode;

    @Field(type = FieldType.Double)
    private BigDecimal amount;
}
```

`List<Pojo>` 只表达 Java 集合，不能自动表达 ES nested 查询语义。Spring Data Elasticsearch 4.0.9 的 `MappingBuilder` 会省略普通、未注解的 `List<Pojo>`，starter 的注解推导不会推导出 `object`。但是后续业务文档写入时，Elasticsearch dynamic mapping 可能根据实际 JSON 把它创建成 `object`。需要 nested 时必须提前写 `@Field(type = FieldType.Nested)`；一旦实际索引已动态形成 object，后续 object -> nested 不能原地修改，必须重建。

同理，没有 `@Mapping` 或 `@Field` 时，starter 不从 `String` 推断 `keyword`，也不猜全文检索 analyzer、大小写 normalizer、日期 format 或任何业务语义。无法推导出有效 properties 时会记录 `NO_MAPPING_SOURCE` 并跳过。

### 外部 mapping 文件优先

复杂 mapping 可放在 classpath，并通过 `@Mapping.mappingPath` 声明：

```java
package com.example.order;

import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Mapping;

@Document(indexName = "trade_order")
@Mapping(mappingPath = "mappings/trade-order.json")
public class TradeOrderFromFileES {
}
```

只要 `@Mapping.mappingPath` 能读取到内容，该 JSON 原文就优先于字段注解推导。它不是与 `@Field` 的合并层；修改文件后应以期望配置页展示的 mapping 为准。JSON 中引用的 analyzer 或 normalizer 还必须在目标索引 settings 中存在，否则 宿主应用 校验或 ES 写入会拒绝。

## Mapping 自动登记

### 生效范围与时机

自动登记只在 `esquerystudio.elasticsearch.mode=client` 下装配，`esquerystudio.elasticsearch.mapping.auto-register=startup` 默认开启。它监听 `ApplicationReadyEvent`，随后用一个 daemon 单线程异步执行一次；应用 ready 不等待对账完成。`off` 不装配启动 runner。

mapping 自动注册在启动时扫描宿主基础包中的 `@Document` 实体。手写 `ManagedEsIndex` 是已废弃的 legacy provider，残留 Bean 会被扫描器 fail-fast 拒绝，不能作为扩展点继续使用。

### Mapping 来源优先级

每个实体只按以下顺序选一份期望 mapping：

1. `@Mapping.mappingPath` 指向的 JSON 原文。
2. 没有 `@Mapping` 时，使用 Spring Data Elasticsearch 的 `@Field` 注解推导。
3. 两者都没有可用 properties 时跳过并记录 `reason=NO_MAPPING_SOURCE`。

starter 不根据裸 Java 类型猜业务语义。没有 `@Mapping` / `@Field` 时，不会把 `String` 自行猜成 `keyword`，也不会猜 analyzer、nested 或日期格式。

### 允许与禁止的变更

启动对账只提交 ES 允许的字段增量 addition：新增顶层字段，或在兼容对象下新增子字段。`dynamic_templates` 是 manual-only，不会由启动对账自动 PUT。字段写入后会重新读取并验证结果。

它永远不会：

- 删除现有字段。
- 把现有字段从 object 改成 nested，或修改任意既有 type。
- 修改既有 analyzer、search_analyzer、normalizer、format、ignore_above 等参数。
- 自动创建不存在的索引。

根 `dynamic` 与 `dynamic_templates` 都是整体边界：`dynamic` 只有完全相同才收敛，期望与实际不同或实际缺失均视为冲突；`dynamic_templates` 无论实际缺失还是内容不同，都产生 `DYNAMIC_TEMPLATE_CONFLICT` 与 `USE_ADHOC_REBUILD`，必须手工处理。两者都不能局部合并后假装兼容；未在期望配置中声明、但 ES 已有的根配置会保留。

### 策略语义

`conflict-policy=fail` 遇到任何冲突时不提交本轮 additions，返回 `CONFLICT` 和 `action=USE_ADHOC_REBUILD`；因此 `dynamic_templates` 冲突时是零写入。`conflict-policy=warn` 仍不会写入 `dynamic_templates`，但可只提交同一份 mapping 中独立、兼容的 `properties` 新增字段；报告仍保留冲突与 `USE_ADHOC_REBUILD`。

目标索引不存在时，`missing-index-policy=skip` 返回 `SKIPPED_INDEX_MISSING`，`fail` 返回 `FAILED_INDEX_MISSING`。两者都只报告，均不创建索引；由于执行发生在 ApplicationReady 后，`fail` 也不会终止已 ready 的 Spring Boot 应用。

### 多实例与请求路径

启动对账先通过本次选中的同一个 `ElasticsearchRestTemplate` / RHLC 查询 alias，alias 必须唯一解析到一个**唯一物理索引**。多目标别名会以 `AMBIGUOUS_ALIAS_TARGET` fail closed，既不读 mapping 也不 PUT；查询返回 404 时才把输入按具体索引名处理，并继续由 `IndexOperations.exists()` 判断是否缺失。starter 不会调用 宿主应用 目标选择器，也不会换用控制集群或另一个低层客户端猜目标。

首次读取成功后，本轮 PUT 会**固定到该物理索引**，不会向 alias 广播。写后验证仍重新读取逻辑 alias，并再次解析目标；若 alias 在窗口内从物理索引 A 切到 B，返回 `FAILED_ES` / `POST_WRITE_TARGET_CHANGED`，报告采用第二次解析到的坐标，不确认任何 addedFields，也不会把 B 上的 mapping 当成本轮写入结果。只有两次解析得到同一个唯一物理索引，才可能验证为 `UPDATED`。

PUT mapping additions 本身可重复提交，写后验证让并发实例按时序最终收敛。只有初始读取已经看到 additions 存在的实例才会返回 `NO_CHANGE`；如果两个实例都在任一 PUT 之前完成初始读取，两者都会计算同一 addition，并且在各自写后验证成功时，两个实例都可能返回 `UPDATED`。后续启动在初始读取看到结果后才收敛为 `NO_CHANGE`。若不同版本声明不兼容定义，则按冲突策略报告，不会用最后写入者覆盖既有定义。

对账不是请求切面：它不会在每次 save、index、bulk 或 query 上运行，也不依赖 `EsWriteRetryAspect`。业务写重试与启动 mapping 对账是两条独立链路，关闭或调整其中一条不会改变另一条的契约。

## Mapping 冲突转 Adhoc 重建

ES 不允许原地改变既有字段的核心语义。startup reconciler 检出这些差异时只报告 `CONFLICT`，不会删除字段、覆盖 type 或自动执行重建。

### 不能原地完成的变更

- `object` -> `nested`
- `text` -> `keyword`
- `long` -> `date`
- 既有 `analyzer` / `search_analyzer` 变化
- 既有 `normalizer` 变化
- 既有日期 `format` 变化

典型日志明确给出 actual、desired、path 与 action：

```text
[MappingReconcile] indexKey=tradeOrder index=trade_order path=properties.legs actual=object desired=nested status=CONFLICT action=USE_ADHOC_REBUILD
[MappingReconcile] indexKey=tradeOrder index=trade_order path=properties.description actual=text desired=keyword status=CONFLICT action=USE_ADHOC_REBUILD
[MappingReconcile] indexKey=tradeOrder index=trade_order path=properties.tradeTime actual=long desired=date status=CONFLICT action=USE_ADHOC_REBUILD
[MappingReconcile] indexKey=tradeOrder index=trade_order path=properties.code.normalizer actual=<missing> desired=lowercase status=CONFLICT action=USE_ADHOC_REBUILD
```

`conflict-policy=warn` 只允许同一请求中独立的新字段继续追加，不会让这些冲突变更变得可写，也不会清除 `USE_ADHOC_REBUILD`。

### 安全处理步骤

先确认当前目标边界：顶栏全局数据目标选择器及其 `X-Es-Target` 请求头**不控制 Adhoc**。当前 Adhoc 仍绑定 host/control-cluster local client；Adhoc target-aware routing 是更大范围的后续能力，本次 startup-mapping 功能中**尚未交付**。

非 host 业务目标必须同时具备 **Adhoc 专属目标选择器**、明确展示集群身份/地址/索引的**执行预览**、以及执行请求和作业绑定同一目标的**后端目标路由与确认**。缺任一项都必须 **STOP**，先协调部署/升级；当前仓库没有可替代的任意非 host 目标 Adhoc 工作流。

1. 在业务应用 `/internal/es/index/desired-state.html` 复制该索引的完整期望配置。
2. 打开 宿主应用，按上述边界确认 Adhoc 实际绑定目标；不得用全局选择器推断。
3. 进入 Adhoc 托管重建，粘贴期望配置，确认 alias、源物理索引和新物理索引计划。
4. 运行 validate 与 dry-run，逐项核对冲突 path、actual、desired、settings 引用和数据转换风险。
5. 对 `long` -> `date` 等存储形态变化明确转换策略；无法无损解释的数据不得直接执行。
6. 执行重建，观察全量复制、增量追平与别名切换；完成后验证文档数、抽样查询、mapping 和写别名。
7. 保留旧物理索引到回滚窗口结束，再按既定运维流程清理；startup reconciler 不会自动删除它。

自动对账没有“强制覆盖”路径：不会 auto delete，不会 type update，也不会把冲突伪装成成功。`USE_ADHOC_REBUILD` 是要求新建兼容目标并迁移的操作指引。
