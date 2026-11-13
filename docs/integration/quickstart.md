# 快速接入

本页适用于持有 `@Document` 实体、需要在业务应用启动后把新增字段安全登记到既有 ES 索引的接入方。

## 1. 引入依赖

当前版本是 `1.0.64`。ESQueryStudio 的 ES 栈是 `provided`，宿主必须同时提供与自身 Spring Boot、服务端 ES 配套的 Spring Data Elasticsearch 与 RHLC 依赖；版本继续由宿主 BOM 管理。

```xml
<dependency>
    <groupId>io.github.dengmeiluan</groupId>
    <artifactId>esquerystudio-console</artifactId>
    <version>1.0.64</version>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
</dependency>
<dependency>
    <groupId>org.elasticsearch.client</groupId>
    <artifactId>elasticsearch-rest-high-level-client</artifactId>
</dependency>
```

## 2. 声明实体

mapping 自动注册会扫描宿主 `AutoConfigurationPackages` 基础包及其子包中的全部 `@Document` 实体。不要实现或注册手写 `ManagedEsIndex`：legacy provider 通道已经废弃，扫描器发现残留实现会直接拒绝启动。

```java
package com.example.quote;

import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

@Document(indexName = "bond_quote")
public class BondQuoteES {
    @Id
    private String id;

    @Field(type = FieldType.Keyword)
    private String bondCode;

    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String shortName;
}
```

实体必须位于宿主启动类的基础包或子包下。字段语义的完整示例见[实体 Mapping 写法](entity-mapping.md)。

## 3. 使用默认配置

```yaml
es:
  rebuild:
    mode: client
    mapping:
      auto-register: startup
      conflict-policy: fail
      missing-index-policy: skip
```

`mode: client` 是前置条件也是默认值。以上 mapping 三项分别控制启动登记、冲突处理和目标索引不存在时的行为。

## 4. 启动并核对

Spring Boot 发布 `ApplicationReadyEvent` 后，starter 才在线程 `es-mapping-reconcile` 中异步执行一次。单个进程内只启动一次，索引按 registry 顺序串行处理，不阻塞应用 ready，也不在每次 save、index、bulk 或 query 时运行。

第一次发现可兼容的新字段时，日志形如：

```text
[MappingReconcile] indexKey=bondQuote index=bond_quote source=ANNOTATION_DERIVED added=2 unchanged=1 conflicts=0 status=UPDATED
```

用相同代码第二次启动应收敛为：

```text
[MappingReconcile] indexKey=bondQuote index=bond_quote source=ANNOTATION_DERIVED added=0 unchanged=3 conflicts=0 status=NO_CHANGE
```

最后打开精确页面：

```text
/internal/es/index/desired-state.html
```

该页在 client 模式无 starter 鉴权，依赖部署网络隔离。需要改既有字段类型、analyzer、normalizer 或 format 时，不要期待启动对账处理，按[期望配置交给 宿主应用](desired-state.md)执行。

## 5. HTTP 端点与映射自动对账速查

重建/期望态入口由 `InternalEsIndexRebuildController` 暴露在 `/internal/es/index/` 路径前缀下（鉴权交由宿主，见上文 client 模式的网络隔离要求）：

| 端点 | 用途 |
|---|---|
| `POST /internal/es/index/rebuild` | 触发一次零停机重建 |
| `GET /internal/es/index/keys` | 枚举已注册的 `ManagedEsIndex` 键 |
| `GET /internal/es/index/desired-state.html` | 期望配置页：业务侧声明 mapping 期望，宿主应用确认后受控执行 |

启动期映射自动对账由 `MappingReconcile` 承担，配置键 `esquerystudio.elasticsearch.mapping.auto-register` 开启；
`esquerystudio.elasticsearch.mapping.conflict-policy` 决定冲突语义——`fail`（默认）检测到冲突即拒绝启动，
冲突修复建议返回 `USE_ADHOC_REBUILD` 走托管重建；`warn` 仅提交无冲突的 `properties` additions，
冲突记入报告。全量状态/原因与排查手册见 [mapping-auto-register.md](mapping-auto-register.md)
与 [troubleshooting.md](troubleshooting.md)。

## 6. 下一步：让 Agent 通过 MCP 接入

控制台起来后，打开 `esquerystudio.mcp.enabled=true` 并在宿主 Security 放行 `/mcp`；
随后在 **Dev Tools → MCP → 密钥与用量** 实时签发 key，按连接设置 read/write。
最短路径、Claude/Cursor 配置和多环境 key 示例见 [MCP 快速开始](../mcp-quickstart.md)。
