# Boot 2 / 3 / 4 宿主适配器迁移

目标：交付一套**统一核心**，同一份代码服务 Spring Boot 2.3（QuoteHub 以依赖嵌入）/ 2.7 / 3.5 / 4.2 宿主；
Elasticsearch 6.7–9.x 走同一条现代请求路径 + 通用回退（如 `_sql` → `_xpack/sql`），
不再维护 6.x/7.x 代码分支；**不再发布 Boot 2.3 legacy 独立产物**（宿主嵌入继续支持）。

最终形态：

- `modules/es-rest`：Spring-neutral、Java 8 的 REST 契约（所有基线共用），含异步/取消句柄与版本能力矩阵。
- `modules/es-engine`：Spring-neutral、Java 8 的索引/别名/reindex 引擎（`EsIndexAdmin` 等），
  基于 low-level REST 与共享 `EsClientContext`；console 与各 Boot 基线共用同一份字节码。
- `modules/mcp-core`：Spring-neutral 的 MCP 密钥/配额/密文/任务台账核心（`McpAccessService`、
  `McpKeyStore`、`McpSecretCipher`、`McpTaskRegistry`、共享错误码），console 与宿主共用。
- `modules/boot-support`：**Java 8 字节码、按 Spring 5.3 编译**的共享核心；同时登记
  `META-INF/spring/...AutoConfiguration.imports`（2.7+）与 `META-INF/spring.factories`（2.3）。
  Boot 2.3（Spring 5.2/Java 8）与 Boot 3/4（Spring 6/7）运行同一份字节码，控制台静态资源随库 jar 提供。
- `modules/console-boot2` / `console-boot3` / `console-boot4`：只保留
  `@SpringBootApplication` 与依赖版本，不复制业务代码。
- `modules/boot-support-boot23-it`：Boot 2.3 / Java 8 嵌入验收（test-only，不是产品产物）。
- `modules/console` / `apps/server` / `platform`：当前完整控制台（53 页 + MCP + 运维深面，
  按 Spring 5.3 编译）与页面契约；随独立 jar 发布，不再承载 2.3 专属分支。
- 浏览器模式：继续覆盖 6.7–9.x，直连 REST。

## 统一兼容原则

- **一个请求路径**：`_doc` 路由、typeless 请求、`_sql` 优先；400/404 时通用回退到
  `_xpack/sql` 或 typed body，不写 `if (major == 6)`。
- **一个响应解析**：`hits.total` 同时接受数字与 `{value}` 对象，不按版本分支。
- **一个宿主核心**：Spring 5.3 编译的 `boot-support` 在 Boot 2.7 / 3.5 / 4.2 均通过。
- **不再新增 6.x/7.x 分叉**；仓库里没有 2.3 专属分支，2.3 宿主经 `boot-support` 嵌入。

## 当前状态

- Phase 0 已落地：Boot 2.7 / 3.5 / 4.2 适配器 + 健康/搜索/SQL/只读概览/只读查询工作台
  （mapping-detail、inspect、query、profile、index-settings）+ DevTools raw 透传
  （`/cluster/raw`、`/cluster/devtools/execute`）+ 文档 CRUD / mapping / settings /
  建删索引 / force_merge（写默认 403，需显式开关）；ES 6.7 `_xpack/sql` 回退 2/2。
  真实浏览器打开现有 Vue 控制台：概览与查询工作台均渲染成功，相关 API 全 200。
  宿主认证 SPI（`ConsoleAuthProvider` / `ConsolePrincipal`）已落地并有 Boot 3 宿主测试；
  页面契约同源（53 页 / 13 组随共享核心打包，`/pages` 与 `/auth/me.pages` 下发，计数有测试锁）；
  **自动装配已生效**（`AutoConfiguration.imports`，三个 app 删除显式 `@Import` 后仍全绿）；
  bootstrap 身份与写开关默认关闭，仅本地开关。
- **Boot 2.3 嵌入已实测**（QuoteHub 基线）：共享库改为 Java 8 字节码并在
  `spring.factories` 登记同一配置类；Boot 2.3.12 / Spring 5.2 / Java 8 宿主无 `@Import`
  启动，控制台外壳从库 jar 的 classpath 静态资源加载，53 页契约下发，6.7 形状的数字
  `hits.total` 透传与 `_xpack/sql` 回退全通过（`Boot23EmbedSmokeTest` 6/6）。
- ES 6.7 形状已实测：typed 建索引/put-mapping 自动重试、数字 `hits.total` 透传、
  `inspect` docCount 正常（`Boot2Es67FallbackTest` 4/4）；ES 9.1 形状同样实测：搜索 / SQL /
  mapping / 查询全程 `_sql` 与 typeless 路由，`_xpack/sql` 与 `_doc/_mapping` 零调用
  （`Boot3Es9SeamlessTest` 3/3）；Boot 4.2 适配器已在真实浏览器渲染同一查询工作台。
- Phase 1 已起步：`es-rest` 6/6（异步、真取消、HEAD/204 无实体兼容）；`EsIndexAdmin` 已可运行在
  共享 `EsClientContext` 上（`overContext`，不再依赖 RHLC 句柄或 console 路由器），9.1 走 typeless、
  6.7 自动带 type 包层的行为在同一 stub 上实测（`EsIndexAdminContextTest` 2/2）；旧 console 首批存储迁移完成
  （认证/审计/作业/写入阻断/`EsIndexAdmin` high-level 调用清零），作为新核心的行为参考。
- **宿主 MCP 已对等**：MCP 控制器拆入 `modules/mcp-server` 共享核心（console 的 `McpController`
  成为薄子类）；Boot 2.3 / 2.7 / 3.5 / 4.2 四条车道都挂载同一 17 组 `/esmcp`（服务 token 认证），
  各有 4/4 冒烟（401 / discovery / tools-list / 真实 `es_search` / console-only 动作如实报错）。
  按用户签发的 key 治理与依赖 console 存储的动作仍由完整控制台提供。
- 剩余：页面契约/认证、查询/索引/运维 API、sdes 5.x/6.x 映射在共享核心上的对等；
  2.3 宿主不需要专属模块，经 `boot-support` 嵌入。

## 阶段与验收

### Phase 0 · 宿主适配器骨架（已落地）

- `modules/boot-support`：按 **Spring 5.3 编译**的共享核心（无 Spring Boot 依赖），
  同一份字节码在 Boot 2.7 / 3.5 / 4.2 运行时均通过。
- `modules/console-boot2`：Boot 2.7.18 / Java 17；`console-boot3`：Boot 3.5.4 / Java 17；
  `console-boot4`：Boot 4.2.0 / Java 17。
- 三个 app 只保留 `@SpringBootApplication` + 版本化依赖；控制器、健康/搜索/SQL 探针
  全部来自 `boot-support`，不复制业务代码或 Vue 源码。
- `GET /internal/es/index/boot/health` 返回集群 `version.number`；
  `POST /internal/es/index/boot/search` 是受控 DSL 搜索代理；
  `POST /internal/es/index/boot/sql` 先走 `_sql`，400/404 时通用回退 `_xpack/sql`（ES 6.7）。
- 测试：Boot 2.7 11/11、Boot 3.5 16/16、Boot 4.2 5/5；ES 6.7 SQL 回退 2/2；`es-rest` 6/6。
- Maven：`-Pboot2` / `-Pboot3` / `-Pboot4` 激活；
  CI：`.github/workflows/boot2.yml`、`boot3.yml`、`boot4.yml`。

**验收**：

```bash
JAVA_HOME=jdk17 ./mvnw -Pboot2 -pl modules/console-boot2 -am test
JAVA_HOME=jdk17 ./mvnw -Pboot3 -pl modules/console-boot3 -am test
JAVA_HOME=jdk21 ./mvnw -Pboot4 -pl modules/console-boot4 -am test
```

### Phase 1 · 统一核心与旧代码行为参考（进行中）

- `modules/es-rest` 已落地：`EsRestClient` / `EsRestResponse` / `LowLevelEsRestClient`，
  Java 8、无 Spring 依赖，3/3 测试（GET / POST / 错误体透传）。
- `modules/boot-support` 已改接 `EsRestClient`，控制器不再直接依赖 ES client；
  Boot 2.7 11/11、Boot 3.5 16/16、Boot 4.2 5/5 通过（JDK 17 / 17 / 21）。
- 旧 `modules/console` / `apps/server` / `platform` 仅作行为参考；不向新核心复制
  6.x/7.x 分支，待页面契约/认证/API 对等后整包删除。
- 已完成 console 侧首批迁移：`BuiltinConsoleAuthService`、`AuditFacetsStore`、
  `EsConsoleOpsAuditStore`、`AuditIndexRetentionSweeper`、`EsAdhocJobStore`、
  `StaleWriteBlockDetector`、`ControlDailyIndex` 走 `EsRestClient`；共享适配器
  `EsRestClientAdapters` 收敛 `RestHighLevelClient → EsRestClient`。
  认证/审计 61 例 + 作业/可观测 14 例 + 写阻断探测 22 例全绿。
- `ControlClusterResolver` 增加 `restClient()` 出口（与 `client()` 同生命周期），
  为后续替换公开类型铺路。
- `EsIndexAdmin` 已**去掉全部 high-level 调用**：createIndex / updateAliases / putSettings /
  getSettings / search / tasks / reindex 提交全部落到低层 REST 或 `EsRestClient`；剩余仅为
  `getLowLevelClient()` 的 raw / cancellable 通道。
  别名/守卫 21 例 + 重建 36 例 + inspect/可观测 25 例 + 进度/失败样本 14 例 + 别名原子 26 例全绿。
- 下一步：以旧 console 的行为为参考，在 `boot-support` 重写页面契约、认证、查询/索引/
  运维 API 与 MCP；不复制旧分支；完成后删除 `modules/console`、`apps/server`、`platform`。
- 目标：同一份业务代码 + 同一组适配器覆盖 Boot 2.7/3.5/4.2；ES 6.7–9.x 一条现代路径。

**验收**：6.7 / 8 / 9 stub 上行为一致（通用回退）；新增跨版本契约测试。

### Phase 2 · 页面契约与认证

- 把 `META-INF/esquerystudio-pages.json`、功能包、页面级权限、`ConsoleAuthDelegate`、
  `ConnStore`、`ConsoleAuditContributor` 迁入**共享核心**（Boot 2/3/4 适配器共用）。
- Security 5/6 与 javax/jakarta 只做薄适配；共享核心不直接依赖 servlet；保留 iframe
  共享登录态与委托认证。
- 页面契约仍是前端导航、后端页面门、宿主菜单的唯一事实源。

**验收**：53 页契约计数一致；未授权页面 403；深链停用页可解释；宿主 SPI 示例可启动。

### Phase 3 · 控制台 API

- 迁移查询工作台、索引/Mapping、SQL/PIT、治理/观测、重建/迁移作业的控制器与服务。
- 优先顺序：查询工作台 → 索引/Mapping → 观测 → 重建/迁移 → MCP。
- 每迁移一组，补一组 6.7 / 8 / 9 stub 响应形状对照测试；不允许只改某个宿主造成漂移。

**验收**：查询、SQL、Mapping、索引工作区在 6.7 / 8 / 9 stub 上返回同形状结果；
UI 的 53 页至少完成查询/索引/治理三条主链路。

### Phase 4 · sdes 5.x 映射适配

- sdes 只作为**可选映射适配器**按宿主提供；共享核心不依赖 sdes。
  `@Document` 映射自动登记与 desired-state / reconcile 保留；未提供 sdes 时页面明确降级。
- 8/9 宿主若只想用 REST 控制台，可不引入 sdes；映射自动登记显式降级并在页面说明。
- 不在平台层硬编码业务字段；SPI 与页面契约保持不变。

**验收**：7.x 走 sdes 4.x、8.x 走 sdes 5.x 的映射对账各有一组真集群/stub 测试；
未引入 sdes 时页面明确显示「映射自动登记未启用」，不伪成功。

### Phase 5 · MCP 与长任务

- 迁移 `/esmcp`、工具目录、key/配额、Tasks 取消与审计；三端契约（服务端 / 浏览器 / 本地 Node）
  保持 17 组 / 171 action / 14 资源 + 1 App / 7 提示词。
- 3 分钟预算与真取消语义不变；Boot 2/3/4 适配器必须通过 `scripts/check-mcp-parity.mjs`。

**验收**：MCP parity 绿；慢 ES stub 下 `tasks/cancel` 真断开；四车道宿主端点各 4/4（服务 token）；
按用户 key 的权限矩阵仍以完整控制台为准。

### Phase 6 · 打包、CI 与发布

- Boot 2.7 / 3.5 / 4.2 三个宿主适配器共用同一核心；release profile 产出 sources/javadoc/SBOM。
- CI 三条车道（JDK 17 / 17 / 21）都跑 `zero-skipped`、`doc-links`、`browser-parity`、
  `native-controls`；Boot 2.3 嵌入车道（JDK 8）常驻，持续验证 `spring.factories` 与 Java 8 字节码（QuoteHub 基线）。
- README 兼容矩阵只保留「宿主适配器（Boot 2.7/3.5/4.2）」「浏览器模式」两行。

**验收**：三个适配器可重复构建、SHA-256 稳定；release 只包含 Boot 2/3/4 适配器；
`modules/console`、`apps/server`、`platform` 已从构建与发布中删除。

## 风险与约束

- **源码漂移**：旧 console 只作行为参考，不复制 192 个 Java 文件；共享核心 + 三个薄适配器。
- **sdes 可选**：共享核心不依赖 sdes；映射适配器按宿主提供，未提供时明确降级。
- **RHLC 移除**：新核心只走 low-level REST；不再引入 7.x RHLC 作为运行时依赖。
- **Spring Security 5/6**：认证委托、iframe、CORS、CSRF 需要在两个 servlet 栈逐项复验。
- **测试栈**：新适配器用 JUnit 5；零跳过门禁不放宽。
- **UI 单一源码**：只共享静态资源，不 fork `ui/`；所有 API 形状由契约测试锁住。

## 当前命令

```bash
# Boot 2.7 宿主适配器（JDK 17）
JAVA_HOME=/path/to/jdk-17 ./mvnw -Pboot2 -pl modules/console-boot2 -am test

# Boot 3.5 宿主适配器（JDK 17）
JAVA_HOME=/path/to/jdk-17 ./mvnw -Pboot3 -pl modules/console-boot3 -am test

# Boot 4.2 宿主适配器（JDK 21）
JAVA_HOME=/path/to/jdk-21 ./mvnw -Pboot4 -pl modules/console-boot4 -am test
```
