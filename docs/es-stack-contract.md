# ES 栈契约（provided）FAQ

starter 对 Elasticsearch 栈的立场是 **provided**：不传递、只校验。本文回答常见问题。

> 本文只描述**完整控制台（`esquerystudio-console` / 独立 jar）的 Java 客户端栈配套**。控制台（含独立 jar 与 Chrome 扩展浏览器模式）的 REST 查询 / 运维路径支持 **Elasticsearch 6.7–9.x**：服务端版本差异（typed / typeless、SQL 端点、模板、data streams、kNN）由统一版本感知层处理，不需要为 8/9 换一套 UI。
>
> **两种形态，两套 ES 栈约束**：
> - **宿主适配器（Boot 2.7 / 3.5 / 4.2，`console-boot2|3|4` + `boot-support`）**：只带 low-level `elasticsearch-rest-client`（Boot 2/3 用 8.18.1，Boot 4 用 9.5.7），所有请求走 raw REST + 通用回退；**不引入 spring-data-elasticsearch，不需要宿主声明 ES 栈**，同样直接支持 ES 6.7–9.x。
> - **完整控制台**：保留 provided 契约与 `EsStackContractValidator`；其配套矩阵是 sdes 4.x / Boot 2.7（对应 ES 7.6–7.17）。下文各节只适用于这一形态，宿主适配器不需要。

## 为什么 starter 不带我需要的 ES 依赖？

宿主几乎必然自带 ES 栈。若 starter 用 `compile` 声明自己的版本，而宿主 BOM 仲裁出
另一个版本，Maven 就近原则会**静默**选择其一——错配不在编译期暴露，而在运行时
特定路径炸。真实事故形态：

- 宿主把 `elasticsearch` 客户端降到 7.10.2 以匹配 7.10 服务端（动机正确）；
- 但 `spring-data-elasticsearch` 仍由 Boot BOM 仲裁为 4.4.18——**只覆盖了一半**；
- 运行时抛 `NoSuchFieldError: INDEX_CONTENT_TYPE`，**且炸在建出目标索引之后，
  留下半拷贝**。

`provided` 把版本决定权完整交回宿主：两个版本在同一处声明，配套关系显式可见。

## 我需要声明哪些依赖？（仅完整控制台）

> 新宿主适配器不需要本节：它们只带 low-level `elasticsearch-rest-client`，不读宿主的 sdes 栈。

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
</dependency>
<dependency>
    <groupId>org.elasticsearch.client</groupId>
    <artifactId>elasticsearch-rest-high-level-client</artifactId>
</dependency>
```

缺了任何一个，启动即 `ClassNotFoundException`——这是刻意的 fail fast，不是疏漏。

## 版本怎么配套？

以 **spring-data-elasticsearch 的官方兼容矩阵**为准：sdes 的每个 minor 版本
对应一个 elasticsearch 客户端与服务端 minor 区间。常见配套示例：

| spring-data-elasticsearch | elasticsearch 客户端/服务端 |
|---|---|
| 4.0.x | 7.6.x |
| 4.1.x | 7.9.x |
| 4.2.x | 7.12.x–7.15.x |
| 4.3.x | 7.15.x–7.17.x |
| 4.4.x | 7.17.x |

## 配错了会静默吗？

不会。启动期 `EsStackContractValidator` **比对真实类型签名**（不比版本号——版本号
会被 shading/重定位骗过，签名不会）。错配即拒绝启动：

```text
[EsStackContract] 宿主 ES 栈版本不配套，拒绝启动：
  - org.elasticsearch.client.Requests.INDEX_CONTENT_TYPE 的类型签名不一致：
    spring-data-elasticsearch 期待 org.elasticsearch.xcontent.XContentType，
    而 elasticsearch 客户端实际提供 org.elasticsearch.common.xcontent.XContentType
    —— 两者版本不配套
  修法二选一（两条路不等价）：
    ① 把 elasticsearch 客户端升到与 spring-data-elasticsearch 匹配的版本
       ⚠ 仅当服务端 minor >= 客户端 minor 时可行 —— RHLC 官方保证是单向前向兼容
    ② 把 spring-data-elasticsearch 降到与当前 elasticsearch 客户端匹配的版本
       ⚠ 机制必须是 import spring-data-bom；单写属性会被静默压过（实测空转）
```

配套时只打一行 INFO：`[EsStackContract] ... starter 侧契约点全部满足`。

## 我的服务端版本和客户端不一样可以吗？

服务端与**客户端**的 minor 差异由 RHLC 的单向前向兼容保证（客户端可以比服务端新，
但不能老过服务端已移除的 API）。starter 的契约校验只盯 **sdes ↔ 客户端** 这一对——
它才是同一进程内的直接依赖对。
