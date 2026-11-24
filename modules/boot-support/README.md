# esquerystudio-boot-support

Boot 2.3 / 2.7 / 3.5 / 4.2 宿主共用的 REST/探针核心。Java 8 字节码，按 **Spring 5.3 编译**；
Boot 2.3（Spring 5.2 / Java 8）、Boot 3/4（Spring 6/7）运行同一份字节码。
控制台静态资源随库 jar 从 classpath 提供。各 app 只负责 Boot 基线、ES client 版本和启动类。

## 内容

- `EsQueryStudioBootAutoConfiguration`：唯一入口。同时登记在
  `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`（2.7+）
  与 `META-INF/spring.factories`（2.3 唯一通道）；三个适配器 app 均已删除显式 `@Import`，
  Boot 2.3 宿主同样无需 `@Import`，挂载完全来自自动装配。
- `EsRestClientConfiguration`：从 `esquerystudio.elasticsearch.*` 构建 low-level
  `RestClient`，并暴露三基线共用的 `EsRestClient`。
- `BootHealthController`：`GET /internal/es/index/boot/health`，返回集群
  `version.number` 与 `artifact`，不硬编码支持范围。
- `BootSearchController`：`POST /internal/es/index/boot/search?index=...`，受控 DSL
  搜索代理（索引名 allow-list）。
- `BootSqlController`：`POST /internal/es/index/boot/sql`，先走 `_sql`，400/404 时
  通用回退 `_xpack/sql`（ES 6.7）；不写版本分支。
- `BootConsoleApiController`：现有 Vue 控制台的只读 API（setup / auth/me / clusters /
  overview / cluster health/indices/aliases/shards / tasks / pending / snapshot status /
  monitor-history / ui-config；查询工作台的 mapping-detail / inspect / query / profile /
  index-settings）；DevTools raw 透传 `/cluster/raw` 与 `/cluster/devtools/execute`
  （返回 `{status,body}`，GET/HEAD 默认放行）；文档 CRUD、mapping、settings、建删索引、
  force_merge 也走 raw `_doc` 路由。所有写操作需 `esquerystudio.boot.allow-writes=true`
  （默认 403）。
- **宿主认证 SPI**：宿主注册 `ConsoleAuthProvider` Bean，`currentPrincipal()` 返回
  `ConsolePrincipal`（用户名/显示名/角色/页面授权）；`/auth/me` 与
  `setup/status.authEnabled` 直接读取宿主身份。未注册时可用
  `esquerystudio.boot.dev-bootstrap-auth=true` 本地兜底。页面契约/MCP 仍在迁移。
- **页面契约**：53 页 / 13 组契约从 `platform` 原样打包进共享核心（不复制），
  `/pages` 与 `/auth/me.pages` 下发同一份数据，计数由 Boot 3 测试锁定。
- `BootRootController`：`/` → `/esquerystudio.html`，与旧入口一致。

## 使用方

| 产物 | Boot | ES client | 说明 |
|---|---|---|---|
| `console-boot2` | 2.7.18 | 8.18.1 | 同一套 `@Import` |
| `console-boot3` | 3.5.4 | 8.18.1 | 同一套 `@Import` |
| `console-boot4` | 4.2.0 | 9.5.7 | 同一套 `@Import` |

三者复用 `modules/console-ui/src/main/resources/static` 的同一套 Vue 控制台资源，
不复制 UI 或控制器。

## 验证

```bash
# Boot 2.7（JDK 17）
JAVA_HOME=/path/to/jdk-17 ./mvnw -Pboot2 -pl modules/console-boot2 -am test

# Boot 3.5（JDK 17）
JAVA_HOME=/path/to/jdk-17 ./mvnw -Pboot3 -pl modules/console-boot3 -am test

# Boot 4.2（JDK 21）
JAVA_HOME=/path/to/jdk-21 ./mvnw -Pboot4 -pl modules/console-boot4 -am test
```

完整迁移阶段见 [docs/boot3-migration.md](../../docs/boot3-migration.md)。
