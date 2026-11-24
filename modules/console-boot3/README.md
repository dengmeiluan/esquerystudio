# esquerystudio-console-boot3

Boot 3.5 / Java 17 宿主适配器，与 Boot 2.7 / 4.2 共用同一套 `es-rest` + `boot-support`
核心；不是独立分叉的 UI 或业务实现。
它不替代 `esquerystudio-console`（Spring Boot 2.3 / Java 8 / sdes 4.x），而是与它并行交付：
老宿主继续用 2.3 产物，8/9 宿主使用本产物。

> **当前状态：Phase 0（骨架）**
> - Boot 3.5.4 / Java 17 / Tomcat 10（Jakarta）可启动。
> - 复用 `modules/console-ui/src/main/resources/static` 的同一套 Vue 控制台静态资源，不复制 UI 源码。
> - 通过 Elasticsearch 8.18 low-level REST client 连接集群，`GET /internal/es/index/boot/health`
>   返回集群自己的 `version.number`（不硬编码支持范围）。
> - `POST /internal/es/index/boot/search?index=...` 是受控 DSL 搜索代理（索引名 allow-list），
>   真实走 `POST /{index}/_search`。
> - `POST /internal/es/index/boot/sql` 先走 `_sql`，400/404 时通用回退 `_xpack/sql`（ES 6.7）。
> - `Boot3HealthSmokeTest` 用本地 ES stub 验证 8.18.1 响应、UI 壳、搜索与 SQL（4/4 通过）。
>
> **尚未迁移**：页面契约、认证、查询/索引/运维 API、sdes 5.x 映射自动登记、MCP。
> 完整阶段、验收标准与风险见 [docs/boot3-migration.md](../../docs/boot3-migration.md)。

## 运行

需要 JDK 17（默认构建仍是 Java 8，不受影响）：

```bash
export JAVA_HOME=/path/to/jdk-17
./mvnw -Pboot3 -pl modules/console-boot3 spring-boot:run
```

默认端口 `5602`，连接 `http://localhost:9200`；可用环境变量覆盖：

```bash
ESQ_ES_URL=http://es8.example:9200 \
ESQ_ES_USERNAME=elastic \
ESQ_ES_PASSWORD=*** \
./mvnw -Pboot3 -pl modules/console-boot3 spring-boot:run
```

打开 `http://localhost:5602/esquerystudio.html` 是同一套 Vue 控制台壳；
当前只有健康端点，完整 API 迁移完成前页面数据请求会失败，这是 Phase 0 的已知边界。

## 验证

```bash
export JAVA_HOME=/path/to/jdk-17
./mvnw -Pboot3 -pl modules/console-boot3 test
```

CI：`.github/workflows/boot3.yml`（JDK 17，仅构建本模块）。
