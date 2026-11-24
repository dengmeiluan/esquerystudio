# esquerystudio-es-rest

三基线（Boot 2.3 / Boot 3 / Boot 4）共用的低层 Elasticsearch REST 契约。
它只描述「method + path + body → status + body」，不包含 Spring 依赖，也不决定
版本分叉；typed/typeless、SQL 端点、模板等版本差异仍由调用方的版本感知层处理。

```java
EsRestClient client = new LowLevelEsRestClient(restClient);
EsRestResponse response = client.perform("POST", "/orders/_search", dsl);
```

- **编译基线**：Java 8，`elasticsearch-rest-client` 7.17（provided）。
- **运行基线**：7.x / 8.x / 9.x 的 low-level client；Boot 3/4 产物分别提供 8.18 / 9.5。
- **错误语义**：非 2xx 不抛异常，返回真实 status 与 ES 错误体，调用方可按业务处理。
- **测试**：`./mvnw -pl modules/es-rest test`（GET / POST / 500 错误体，3/3）。

当前使用方：`modules/boot-support`（Boot 3/4 共享核心）。下一步把
`modules/console` 的认证/审计/作业存储从 `RestHighLevelClient` 收敛到该契约，
见 [docs/boot3-migration.md](../../docs/boot3-migration.md) Phase 1。
