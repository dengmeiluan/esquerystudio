# esquerystudio-console-boot4

Boot 4.2 / Java 17 宿主适配器，与 Boot 2.7 / 3.5 共用同一套 `es-rest` + `boot-support`
核心；不是独立分叉的 UI 或业务实现。
与 `esquerystudio-console-boot3` 共用 `esquerystudio-boot-support` 的 REST/探针核心，
不复制控制器或 Vue 源码；两者只在 Boot 基线、ES client 版本与 artifact/端口上不同。

> **当前状态：Phase 0（骨架）**
> - Boot 4.2.0 / Java 17 / Tomcat（Jakarta）可启动。
> - 复用 `modules/console-ui/src/main/resources/static` 的同一套 Vue 控制台静态资源。
> - 通过 `elasticsearch-rest-client` 9.5.7 连接集群，`GET /internal/es/index/boot/health`
>   返回集群自己的 `version.number`（artifact 字段为 `esquerystudio-console-boot4`）。
> - `POST /internal/es/index/boot/search?index=...` 与 Boot 3 共用受控 DSL 搜索代理。
> - `POST /internal/es/index/boot/sql` 走现代 `_sql`，400/404 时通用回退 `_xpack/sql`。
> - `Boot4HealthSmokeTest` 用本地 ES stub 验证 9.5.7 响应、UI 壳、搜索与 SQL（4/4 通过）。
>
> **尚未迁移**：页面契约、认证、查询/索引/运维 API、sdes 6.x 映射自动登记、MCP。
> 完整阶段、验收标准与风险见 [docs/boot3-migration.md](../../docs/boot3-migration.md)。

## 运行

需要 JDK 17+（默认 Java 8 构建不受影响）：

```bash
export JAVA_HOME=/path/to/jdk-17-or-21
./mvnw -Pboot4 -pl modules/console-boot4 -am spring-boot:run
```

默认端口 `5603`，连接 `http://localhost:9200`；可用 `ESQ_ES_URL` / `ESQ_ES_USERNAME` /
`ESQ_ES_PASSWORD` 覆盖。

## 验证

```bash
export JAVA_HOME=/path/to/jdk-17-or-21
./mvnw -Pboot4 -pl modules/console-boot4 -am test
```

CI：`.github/workflows/boot4.yml`（JDK 21，构建 shared + Boot 4 模块）。
