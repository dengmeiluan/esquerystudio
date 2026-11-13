# 配置参考

引擎层统一前缀为 `esquerystudio.elasticsearch.*`。全部配置键来自 `ESQueryStudioElasticsearchProperties` 属性树，本页逐键对账 Java 默认值；
`ConfigurationReferenceContractTest` 反射遍历属性树与本页逐键核对——**新增配置键忘写本页即测试红**。

键名遵循 Spring Boot 宽松绑定：文档按 kebab-case 书写，`application.yml` / 环境变量（`ESQUERYSTUDIO_ELASTICSEARCH_...`）等价。

## 基础

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.mode` | `client` | 装配模式：`client`=业务应用侧只装索引声明；`console`=宿主侧全量装配（控制台+AOP 切面+控制集群解析）。允许值 `client` / `console`，拼写错误拒绝启动 |
| `esquerystudio.elasticsearch.web-enabled` | `true` | 是否启用内置运维 Controller 与静态面板 |
| `esquerystudio.elasticsearch.version-format` | `yyyyMMddHHmmss` | 物理索引版本号时间格式（物理索引名为 原名_v时间戳），非法 pattern 拒绝启动 |
| `esquerystudio.elasticsearch.env-pages` | （空 Map） | 连接环境 → 页面 key 白名单集合（键=PROD/STAGING/QA/DEV）；整个 Map 为空=不启用，未配置的 env 原样透传；**显式配置的 env 为空集/null=该环境全拒**（启动 WARN 点名）。`/auth/me` 会把模板下发给前端，菜单/按钮与后端同口径收缩 |
| `esquerystudio.elasticsearch.console.setup-token` | （空串） | 未绑定首连初始化令牌；非空时 `/setup/test`、`/setup/apply` 必须携带 `X-Setup-Token`（防匿名绑定/SSRF 探测）。空=仅允许本机（回环且无 `X-Forwarded-For`/`X-Real-IP`/`Forwarded` 头）匿名首连；远程初始化必须配置令牌 |

## 写入重试（esquerystudio.elasticsearch.retry）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.retry.max-attempts` | `5` | 最大尝试次数（**含首次**）：`1`=只调用一次=完全关闭重试，这也是关闭重试的唯一方式（刻意不设 enabled，避免双开关语义重叠） |
| `esquerystudio.elasticsearch.retry.init-backoff-ms` | `500` | 首次退避毫秒；须 ≤ max-backoff-ms |
| `esquerystudio.elasticsearch.retry.max-backoff-ms` | `8000` | 退避上限毫秒 |

## 重建锁（esquerystudio.elasticsearch.lock）

ES 文档锁（以 indexKey 为锁文档 _id）。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.lock.enabled` | `true` | 是否启用分布式锁；单实例或测试场景可关 |
| `esquerystudio.elasticsearch.lock.index-name` | （空串） | 锁索引名；空=按默认规则自动推导（唯一推导处在自动配置） |
| `esquerystudio.elasticsearch.lock.lease-ms` | `3600000` | 锁租约毫秒；必须 ≥ `orchestration.timeout-ms`，否则长 reindex 中途锁被强夺（启动期校验） |

## 一键编排（esquerystudio.elasticsearch.orchestration）

编程式一键重建的轮询/超时参数。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.orchestration.poll-interval-ms` | `2000` | reindex 进度轮询间隔毫秒 |
| `esquerystudio.elasticsearch.orchestration.timeout-ms` | `1800000` | 单次编排总超时毫秒（默认 30 分钟） |

## 托管重建确认门（esquerystudio.elasticsearch.adhoc）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.adhoc.confirm-timeout-ms` | `1800000` | 人工确认切换的等待超时（默认 30 分钟，上限 7 天）。超时按 abort 处理且对 WRITE_BLOCK 策略强制解除写阻断——绝不允许业务因「忘了点确认」永久写不进 |

## 跨集群迁移（esquerystudio.elasticsearch.migrate）

客户端 scroll+bulk 迁移参数。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.migrate.enabled` | `true` | 迁移能力子开关（与 web-enabled 同时为 true 才暴露接口/面板） |
| `esquerystudio.elasticsearch.migrate.default-slices` | `4` | sliced scroll 路数/worker 数（建议 ≈ 源索引主分片数） |
| `esquerystudio.elasticsearch.migrate.default-batch-size` | `2000` | 每 scroll/bulk 批大小 |
| `esquerystudio.elasticsearch.migrate.scroll-keep-alive-sec` | `120` | scroll 上下文存活秒 |
| `esquerystudio.elasticsearch.migrate.connect-timeout-ms` | `5000` | 临时旧集群 client 连接超时毫秒 |
| `esquerystudio.elasticsearch.migrate.socket-timeout-ms` | `60000` | 临时旧集群 client socket 超时毫秒 |
| `esquerystudio.elasticsearch.migrate.job-index-name` | （空串） | 迁移作业索引名；空=由实体 @Document SpEL 自动拼装 |

## 索引映射对账（esquerystudio.elasticsearch.mapping）

这些键来自 `ESQueryStudioElasticsearchProperties.Mapping` 的 Java 默认值。启动自动对账要求宿主处于 `esquerystudio.elasticsearch.mode=client`；`console` 模式不装配对账 runner。

| 配置键 | Java 默认值 | 允许值 | 行为 |
|---|---|---|---|
| `esquerystudio.elasticsearch.mapping.auto-register` | `startup` | `startup`, `off` | `startup` 在 ApplicationReady 后异步执行一次；`off` 不装配启动 runner |
| `esquerystudio.elasticsearch.mapping.conflict-policy` | `fail` | `fail`, `warn` | `fail` 不提交含冲突的 additions；`warn` 仅可继续提交独立兼容 additions，冲突字段仍不改 |
| `esquerystudio.elasticsearch.mapping.missing-index-policy` | `skip` | `skip`, `fail` | `skip` 报 `SKIPPED_INDEX_MISSING`；`fail` 报 `FAILED_INDEX_MISSING` |

## 索引配置校验（esquerystudio.elasticsearch.config-validation）

启动期对所有注册 provider 实体的 @Setting/@Mapping JSON 做 L1 静态 Lint + L2 临时索引 Dry-run，把「代码里写错索引配置、发到服务上建索引才炸」提前到启动那一刻暴露。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.config-validation.mode` | `strict` | `strict`=确定性配置错误挡启动 / `warn`=只告警 / `off`=关闭 |
| `esquerystudio.elasticsearch.config-validation.dry-run-on-startup` | `true` | 启动期是否追加 L2 dry-run（临时索引试建）；ES 不可达降级 WARN 不误杀启动 |

## 日期兼容（esquerystudio.elasticsearch.compat）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.compat.date-converters` | `false` | 注册 epoch↔日期转换器。⚠ 只救**不带**日期注解而存储形态为 epoch 数值的 Timestamp/Date/Instant 字段；带 `@Field(type=Date)` 的字段由属性级转换器接管，打开开关什么也不会发生且不报错 |

## 控制台（esquerystudio.elasticsearch.console）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.conn-index-name` | `esquerystudio_conn` | 多集群连接档案索引名（存控制集群，密码只留服务端） |
| `esquerystudio.elasticsearch.console.home-dir` | （空串） | 控制集群自举档案目录；空=用户目录下 `.esquerystudio/<appName>/` |
| `esquerystudio.elasticsearch.console.control-mode` | `auto` | 控制集群解析模式：`auto`（自举档案→spring 探测→Setup 向导）/ `spring`（钉死宿主 ES，向导永不出现） |
| `esquerystudio.elasticsearch.console.conn-probe-enabled` | `true` | 连接档案后台周期探活开关（列表/顶栏状态点数据源） |
| `esquerystudio.elasticsearch.console.conn-probe-interval-seconds` | `60` | 探活间隔秒（最小 10） |
| `esquerystudio.elasticsearch.console.host-cluster-visible` | `true` | 数据面是否暴露「宿主集群」目标；纯管理平台形态设 `false`——控制集群降级为纯元数据存储，后端同步拒绝 host 目标直捣 |
| `esquerystudio.elasticsearch.console.store` | `control-es` | 元数据存储模式：`control-es`（落控制集群 ES 索引）/ `jdbc`（落宿主 DataSource 数据库表）/ `sqlite`（落本地 SQLite 库文件，见 `sqlite-path`——零外部服务依赖，重启后历史可查）。影响作业元数据、控制台操作审计与 MCP API key（`jdbc` 时落 `esquerystudio_mcp_key` 表）；classpath 缺 sqlite 驱动（`org.xerial:sqlite-jdbc`，starter 中为 optional）时回落 `control-es` 并 WARN |
| `esquerystudio.elasticsearch.console.sqlite-path` | （空串） | `store=sqlite` 时的本地库文件路径；空 → `~/.esquerystudio/<appName>/jobs.db`（与控制集群自举档案同目录） |

## 控制台鉴权（esquerystudio.elasticsearch.console.auth）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.auth.enabled` | `true` | 控制台鉴权开关；关闭后恢复无鉴权行为，仅限内网/演示 |
| `esquerystudio.elasticsearch.console.auth.fallback-username` | `admin` | 兜底账号：仅当用户索引一个账号都没有时可登录（角色 ADMIN） |
| `esquerystudio.elasticsearch.console.auth.fallback-password` | `esquerystudio` | 兜底密码；enabled=true 时账号/密码不可为空（启动期校验）——**上线务必修改** |
| `esquerystudio.elasticsearch.console.auth.token-ttl-ms` | `43200000` | token 有效期毫秒（默认 12 小时） |
| `esquerystudio.elasticsearch.console.auth.token-secret` | （空串） | token HMAC secret；空=启动随机生成（重启后需重新登录）；多实例部署必须显式配置保证互通。**注意**：登出吊销表与登录节流均为实例内存态——多实例下登出只吊销处理该请求的实例，被盗 token 在其余实例继续有效至 TTL（单实例或短 TTL 部署无此窗口） |
| `esquerystudio.elasticsearch.console.auth.conn-secret` | （空串） | 连接档案凭据加密密钥（base64 的 32 字节 AES-256-GCM）。空=自动生成并落自举档案目录 `conn.key`（单实例零配置；**多实例必须显式配置共享同一密钥**，否则各实例互相解不开对方加密的档案）。存量明文档案读取透明兼容；带新凭据的保存自动升级为密文（`enc:v1:` 前缀），密钥不一致时显性报错绝不静默降级 |
| `esquerystudio.elasticsearch.console.auth.user-index-name` | `esquerystudio_user` | 控制台用户索引名 |
| `esquerystudio.elasticsearch.console.auth.ops-audit-index-name` | `esquerystudio_ops_audit` | 操作审计索引名：环形开启时为日期索引前缀，关闭时为固定单索引名 |
| `esquerystudio.elasticsearch.console.auth.host-audit-merge` | `false` | 宿主审计并入开关：开启后宿主注册的 ConsoleAuditContributor 记录才并入控制台审计视图 |
| `esquerystudio.elasticsearch.console.auth.builtin-login-enabled` | （未设置） | 内置账号登录三态：未设置=有宿主委托时自动关闭、独立部署开启；true/false 强制开/关。关闭后 `/auth/login` 回 403 `BUILTIN_LOGIN_DISABLED`（防默认兜底账号绕过宿主鉴权）。**联动提示**：只要宿主注册了 `ConsoleAuthDelegate`（代码 SPI 或 header 模式）且本键未设置，内置登录即自动关闭——存量双轨部署（委托+本地账号并用）升级后需显式置 `true` 恢复本地登录 |

## 审计环形保留（esquerystudio.elasticsearch.console.auth.audit-retention）

审计写日期索引（`<索引名前缀>-yyyy.MM.dd`），双闸（超龄+总量）整索引删最旧；`enabled=false` 一键回退固定单索引行为（发版期回退开关）。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.auth.audit-retention.enabled` | `true` | 按日环形写+周期双闸清理；false=旧固定单索引行为 |
| `esquerystudio.elasticsearch.console.auth.audit-retention.max-days` | `90` | 超龄闸（天）：严格早于「今天-N 天」的日期索引整索引删除 |
| `esquerystudio.elasticsearch.console.auth.audit-retention.max-total-bytes` | `32212254720` | 总量闸（字节，默认 30GB）：日期索引族 store.size 合计上限，超限从最旧删起 |
| `esquerystudio.elasticsearch.console.auth.audit-retention.dry-run` | `false` | 演练模式：清理轮只记待删清单不执行删除（上线初期观察面） |

## 页面级授权（esquerystudio.elasticsearch.console.page-auth）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.page-auth.enabled` | `true` | 页面级授权开关（仅 delegated 身份+宿主下发 grantedPages 时生效）；false=逃生阀，紧急回退纯角色档 |

### 授权键与判定顺序（宿主集成契约）

`grantedPages` 是宿主下发的字符串集合，三种键形态共存：

| 键形态 | 语义 | 例 |
|---|---|---|
| `{page}` | 静态全局页授权（对所有连接生效） | `search` |
| `conn:{connId}:{page}` | 该连接上该页**可见**（读） | `conn:acme-qa:search` |
| `conn:{connId}:w:{page}` | 该连接上该页**可写** | `conn:acme-qa:w:bulk` |

判定顺序（`ConsoleAuthInterceptor#preHandle`，前端 `auth.canEndpoint` 逐步镜像）：

1. **系统管理域**（`/setup/rebind|apply`、`/clusters/**` 写）→ ADMIN，连接写键不放行；
2. **ADMIN** → 全放行（超管不受页面白名单拖累）；
3. **全量审计**（`/auth/ops-audit*`，自助 `/mine` 除外）→ rank3；
4. **集群级动作** → rank3（连接模型不短路，见下）；
5. **共享写端点**：一个端点被多页合法复用时，持任一**真实使用方**的页写键即放行
   （`/cluster/doc*`→search/indices/doc-diff，`/cluster/tasks/cancel`→tasks/task-tree，
   `/cluster/ilm/policy`→ilm，`/cluster/ilm/move`→ilm/lifecycle，
   `/cluster/ilm/start|stop`→lifecycle/cluster-settings，
   `/cluster/reroute`→cluster-settings，`/cluster/reroute/retry-failed`→diag/cluster-settings，
   `/cluster/index-settings/update` 与 `/cluster/update-settings`→index-settings/indices/optimizer(+mapping)，
   `/cluster/devtools/execute`→devtools/rest，`/insight/actions/apply-index-settings`→index-settings/indices/optimizer）；
6. **页面门**：`pageOf(path)` 最长前缀归属页 → 连接模型要求 `conn:{tid}:w:{page}`；
   静态模型要求页可见 + 端点角色档；
7. **未登记写的默认拒绝**：连接模型下 `pageOf=null` 且未登记共享写的写端点一律 403
   （防新增端点悄悄回落 OPERATOR）；启动期 `ConsoleEndpointCoverageAuditor` 会列出未归类端点。

**集群级动作的 rank 硬门**：`/cluster/ilm/start|stop`（启停整集群 ILM）、
`/cluster/ilm/policy`（增删改集群共享策略）、`/cluster/reroute/retry-failed`（全集群未分配分片重试）、
`/cluster/slm/execute`（触发全集群快照策略）、`/cluster/tasks/cancel`（取消无归属的任务）都不带索引参数、
作用于集群全局，连接模型下**除页写键外还需 rank3**（`REBUILD_OP`/`CLUSTER_OP`/`AUDIT_OP` 同 rank，或 ADMIN）
**或该连接的 `w:cluster-settings`**（集群设置页的语义本就是集群级操作，给宿主留显式授权通道，
rank2 的运维也能被授到）。静态/内置模型本就走 `CLUSTER_OP` 关键词档，行为不变。
rank2 的 `w:lifecycle` 仍可做单索引 rollover / `ilm/move`，`w:diag` 仍可读全部诊断面。
前端同源前置：LifecycleView / DiagView / IlmView / SlmView / TasksView / TaskTreeView 在
`canClusterScope()` 为假时禁用这些钮并说明「需 rank3 或集群设置写键」，不是「能点、点下去 403」。

**写面与读面同权限（1007）**：
- 已存脚本是集群共享命名空间：只有 `painless-lab` 页（或 ADMIN）能写入/删除 painless 脚本；
  `search-templates` 页写键仅能写 **mustache**。删除前读回真实 `lang` 判定（未知 id fail-closed），
  防止模板页覆盖/按 id 删除他人的 painless 脚本。
- 组件模板没有 `index_patterns` 可供判定，却被索引模板（可能覆盖控制面模式）引用：非 ADMIN
  需 rank3 或 `w:cluster-settings` 才能写/删组件模板；普通索引模板仍按 patterns 守卫。
- `_cat/shards` 的 `n`/`id` 列是 `node` 的别名：行过滤同时摘除 `ip/node/n/id/sync_id/unassigned.*`，
  `ilm-history-*` / `slm-history-*` 行按系统面过滤（只影响展示，不放宽写入守卫）。
- 非 ADMIN raw 的 `keep_alive` 上限同时覆盖 **`pit.keep_alive` 嵌套形态**，页面
  `/cluster/pit/search` 的 body 续期同样校验；根级 `_analyze` 的
  `body.index` 与路径同权（不得指向控制面索引）；`/clusters/sync` 的 `notes` 仅在调用者可证明
  全目录可见时下发（聚合计数保留）。

- **非 ADMIN raw 是白名单而非黑名单**：未列入数据面白名单的形态一律拒绝（如 EQL
  `_eql/search`、按路径释放 async/scroll、根级 `_cluster/health/{index}`、`?index=` 限定）。
  能力缺失优先于越权；需要这些能力请使用对应页面或由 ADMIN 执行。

**PIT id 归属（1007）**：控制台内打开的 PIT 会登记「id → 用户名」（有效期 ≥ 上限，ADMIN 7 天 /
其他 2 小时）。同一 PIT 只允许开启者本人或 ADMIN 用于 `_search` / `/cluster/pit/search` / 关闭；
账号切换后旧标签页里的 PIT id 不会随新身份放行。控制台外（curl/其他工具）打开的 id 不登记，
维持既有能力；进程内表与内置 token 吊销表同限制（多实例不共享）。

**凭据类资源与模板/脚本边界（1046）**：
- PIT 的 `?source=` 与请求体同权，`DELETE /_pit` 的 id 在根级——两者都过同一归属校验；
- SQL cursor 与 PIT 同类：页面 `/cluster/sql/{query,cursor,close}` 与 raw `_sql` 的开启/续页/关闭
  绑定开启者（ADMIN 可接管），cursor 轮换登记新 id 并释放旧 id；
- `query.template.inline` 等 Mustache 模板在任意深度都做「去标签后的控制面字面扫描」（含拆
  section 拼接）并拒绝分隔符切换；嵌套模板解析失败不再静默放行；
- `esquerystudio_validate_*` 仅校验器专用的 `createValidatorTempIndex` / `deleteValidatorTempIndex`
  通道可用，通用建/删/查/模式守卫一律按控制面拒绝；
- 搜索模板页覆盖已存脚本时先读回目标 id 的 lang：非 mustache 覆盖需要 painless-lab 页写权；
- 委托部署 `builtin-login-enabled=false` 时，浏览器残留的内置 token 也立即失效（不再成为
  绕过宿主授权的第二条身份）；
- 非 ADMIN raw/DevTools 拒绝 `_logstash` / `_connector` / `_synonyms` / `_query_rules` /
  `_autoscaling` / `_searchable_snapshots` 等可带凭据/容量的管理面读；
- `host-cluster-visible=false` 时，非 ADMIN 的宿主专属 provider（inspect/query/force-merge/
  rebuild-empty/replicas）与数据面同口径 403 `HOST_DISABLED`；自举端点仍放行。
- 控制器主动判定的拒绝（`ResponseStatusException`）保留 403 等业务状态码，不再被兜底拉平为 500。

**DevTools / REST 写键的真实范围**：`/cluster/raw` 与 `/cluster/devtools/execute` 共用同一
透传内核，非 ADMIN 会被 `guardRawGuarded` 收窄到**数据面**（检索/文档 CRUD/bulk/
update-by-query/delete-by-query/SQL/别名与模板的受控写入被拒、快照仓库与集群设置被拒），
但**在数据面内是全权**——包括对任意业务索引批量删文档。`/auth/permissions` 对这两页回
`writeScope: DATA_PLANE`，「我的权限」面板据此标注。授予 `w:devtools` 前请按「数据面写权」
而非「调试工具」评估。

**根级检索要带索引范围**：`/_search`、`/_count`、`/_field_caps`、`/_async_search`、
`/_terms_enum`、`/_rank_eval`、`/_search/template` 在非 ADMIN 下必须把索引放在**路径**里
（`/{index}/_search`），或走 PIT（body 带有效 `pit.id`；PIT 搜索按 ES 契约不带 index）。
**查询参数 `index`/`indices` 不被接受**：REST 层路径参数与查询参数如何合并、谁优先随版本实现
而变，一旦目标端忽略该参数，`/_search?index=logs` 就是一次全量读（控制面索引一并读出），
守卫却以为「已限定」；索引级路径再带同名参数还会造成目标二义（`/logs/_search?index=orders`）。
标准写法在所有版本都生效，能力不缺。前端 DevTools/REST 页已镜像同一套规则：不可执行时
tooltip 直接给出改法（`/{index}/_search`、PIT、控制面索引不可用），不再「点下去 403」。

**同一规则的查询串与批量形态**（1124 实测补钉）：

| 形态 | 非 ADMIN 裁决 | 原因 |
|---|---|---|
| `GET /_search?q=*`、`?q=*&size=N` | 拒 | 不带 body 也能全量读 |
| `GET /_count?q=*` | 拒 | 同上（计数也是全量） |
| `GET /_search?source={...}` | 拒 | `source` 与 body 同权 |
| `GET /_search_shards` | 拒 | 分片视图枚举索引名 |
| `POST /_msearch`（空头 `{}`） | 拒 | 根路径空头 = 不限索引（全量） |
| `POST /{index}/_msearch`（空头） | **放行** | ES 语义：路径索引是头的默认索引，只查该索引 |
| `POST /logs/_bulk`（`{"index":{}}`） | 放行 | 同上：继承路径索引 |
| `POST /_bulk`（显式 `_index: 控制面`） | 拒 | 请求体通道 |
| `GET /_cat/aliases`、`/_cat/shards`（`format=json`） | 放行 + 结果侧行过滤 | 与 `_cat/indices` 同族，逐行剔除控制面 |
| `GET /_cat/count`、`/_stats`、`/_cluster/state`、`/_nodes` | 拒 | 聚合形态无法按行过滤 |

**前后端同一份金标准**：`ui/src/__tests__/fixtures/devtoolsScope.golden.json` 是两边
共用的作用域样例（`allow`=内核裁决，`ui`=前端应有态）。后端 `DevtoolsScopeGolden1005Test`
断言内核与 `allow` 逐条一致，前端 `devtoolsScopeGolden1005.spec` 断言 UI 与 `ui` 逐条一致，
并额外锁死不变量：**allow=true ⇒ 前端必须可执行**（有权限的人不能被拦）。改任一侧规则
未同步样例 → 该侧红。

**跨页「到 DevTools」入口门**：任何写 `sessionStorage['esquerystudio.devtools.open']` 的跳转
（含 `run:true` 自动执行档）都必须在**写入点附近**有 `canDevtools.value` 判定；收藏回放这类
通用件用注入的 `canOpen(path)` 页面门。`ui/scripts/perm-scan.mjs` 对其做机械检查，且
`permScanSelfCheck1124.spec` 会注入违规反证规则本身仍有效——规则失效比没有规则更危险。

**透传内核的越权矩阵**（`DevtoolsEscalationMatrix1004Test` 逐条锁定，约 60 条向量）：
A 集群/系统管理写全拒（settings/security/template/script/ingest/ilm/slm/snapshot/reindex/
aliases/nodes/tasks/watcher/ml/transform/rollup/remote/license）；B 索引结构写全拒（建删索引/
mapping/settings/alias/close/open/forcemerge/rollover/refresh/flush）；C 控制面索引
路径/通配/请求体三通道全拒（bulk 动作行、msearch 头、mget docs、SQL FROM、`_index` 改写脚本）；
D 路径与方法变形（`//`、`/./`、`..`、`%5F`、大写、绝对 URL、TRACE/PATCH）一律拒；
E 数据面放行；F 根级 PIT/scroll 仅 DELETE 形态（释放）放行。

**PIT 资源上限**：非 ADMIN 的 `POST /cluster/pit/open` 会把 `keep_alive` 夹到
`-Desquerystudio.elasticsearch.console.pit.max-keep-alive-minutes`（默认 60 分钟），响应回填
`keepAliveRequested/keepAliveApplied/keepAliveClamped` 供前端提示；ADMIN 不受限。

**身份切换与委托凭据（1007）**：
- 登录换人/宿主 token 换人时，除清理 localStorage/sessionStorage 外，前端会同步清零内存态
  （目标连接、索引清单、收藏、通知、查询历史、作业清单、监控序列）并广播 `esquerystudio:identity-changed`；
  只清磁盘会让单例 ref 在下一笔写入时把旧账号数据落回，或让请求在「界面显示 A 的集群、实际不带
  X-Es-Target」的状态下打到宿主。同名账号被降权/撤页不做整页重挂：403 / 窗口聚焦 /
  标签页恢复会触发 30s 节流 `/auth/me` 重探，按钮与菜单随 `me` 响应式收敛。
- **工作现场与词项缓存同属账号视角（1046）**：`esquerystudio.qw.session:`（DSL 会话）、
  `esquerystudio_terms_stash`（字段词项持久档）、`esquerystudio.qb.subtree`、`esquerystudio.pref.sqlbridge.sql`、
  `esquerystudio.health-report.last`、`es_vars`、`es_confirm_skip:` 随换人清理；App 同步清空模块级
  词项/字段/别名缓存并剥掉当前路由 query（防 `?dsl=` 用新身份自动执行旧查询）。登录顺序固定为
  `setToken → invalidateIdentity → purgeIfUserChanged`，否则作业/监控轮询会带上一身份跑第一拍。
- `delegate.mode=jwt|endpoint` 的登出会用**宿主令牌头**原文登记本地拒绝表（此前误用内置 token，
  等于没吊销）；`header` 模式无令牌原文，无法本地吊销。
- 宿主凭证存在但被拒绝（过期/撤销/验签失败）时**不回落**内置登录：否则 iframe 会在宿主撤销会话后
  静默变成浏览器里残留的内置 ADMIN。只有「本请求没带宿主凭证」才回退内置登录。
- 新建本地账号的 `epoch` 使用随机正值（不再固定 1）：删号→同名重建后，旧账号未变更时签发的
  token 不会在新账号上复活。任何改密/改角色仍递增 epoch。
- 出厂的 `admin/esquerystudio` 默认口令在用户库为空时**只允许 loopback 登录**；远程部署请先在本机登录
  改密，或配置强 `fallback-password`。默认口令比较改为常量时间。
- `delegate.mode` 拼写错误或该模式必填项缺失（jwt 无密钥/公钥、endpoint 无 verify-url、header 无
  user-header）会在启动期直接失败——否则部署正常启动但内置登录已关闭，所有身份都 401。
- 配置了 `setup-token` 时，安全中心的重绑表单会显示令牌输入框并随请求发送 `X-Setup-Token`
  （此前后端要求、前端不传，ADMIN 重绑必 403）。

### 权限矩阵集成测试（三身份口径，可直接接发版冒烟）

`ui/scripts/perm-matrix.mjs`（`npm --prefix ui run perm:matrix`）用真实 HTTP 跑
「授权用户 / 超管 / 零授权」三类身份，断言：

- 授权用户：至少一个连接可写、至少一个只读；可写连接 DevTools 数据面放行、管理面读 403；
  只读连接 DevTools 读被拒，且**写探针必须被授权层拒绝（403）**——探针是对不存在索引发
  `DELETE`，即便授权被绕过也只会得到 ES 的 404，产线零副作用，但足以区分「拦住了」与「放行了」；
- 超管：连接目录可见、管理面读放行；
- 零授权：连接目录为空、页面集为空、目标连接 403、用户管理/全量审计 403；
- **跨身份污染**：拿授权用户的连接 id 配零授权身份的令牌 → 403（连接可见性只认当前身份，
  不认请求里残留的目标头）；
- **控制面全量读形态**：根级 `_msearch` 空头 → 403；带索引前缀的同类请求不得被误拒
  （有权限的人不能被拦）；
- 登出两条路径都必须即时失效：宿主 `/api/auth/logout`（Redis 黑名单）后同一 token 访问
  控制台 401；控制台 `/auth/logout` 后同一**委托** token 也应 401（自定义委托只实现
  `tokenOf` 时由内核兜底登记拒绝表，见「已知边界」）。

凭据只走环境变量，不写入仓库/日志：

~~~bash
CONSOLE_BASE=https://host/acme \
CONSOLE_USER_X1=... CONSOLE_PASS_X1=... \
CONSOLE_USER_X2=... CONSOLE_PASS_X2=... \
CONSOLE_USER_X3=... CONSOLE_PASS_X3=... \
npm --prefix console run perm:matrix
~~~

退出码 1=矩阵不符（附逐项 expected/actual），0=全部通过；只输出状态与计数，不打印 token。
（脚本用 `process.exitCode` 收敛而非强退：Windows 上 fetch 的 keep-alive 套接字未关闭时
强退会触发 libuv 断言，退出码会变成 127 而不是 1，CI 会读错状态。）

## 连接中心自动同步（esquerystudio.elasticsearch.console.conn-sync）

双门设计：宿主注册 ClusterConnContributor Bean **且** enabled=true 才启用；任一缺席=零行为（不建线程、不落库）。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.conn-sync.enabled` | `false` | 总开关（默认关） |
| `esquerystudio.elasticsearch.console.conn-sync.interval-seconds` | `3600` | 同步周期秒（引擎侧下限钳 60）；默认对齐连接中心 1h 快照节奏 |
| `esquerystudio.elasticsearch.console.conn-sync.initial-delay-seconds` | `30` | 启动后首跑延迟秒 |
| `esquerystudio.elasticsearch.console.conn-sync.min-role` | `VIEWER` | 同步档案默认 minRole（贡献者未显式给时） |

## 监控落库（esquerystudio.elasticsearch.console.monitor）

多集群监控历史的唯一写入方是服务端定时任务（每轮落全部连接的最近探活结果）；用户页面轮询只读不入库。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.monitor.enabled` | `true` | 落库总开关；false=不启动监控落库调度（探活展示不受影响） |
| `esquerystudio.elasticsearch.console.monitor.interval-seconds` | `60` | 落库节奏秒（下限钳 10；与探活间隔解耦） |
| `esquerystudio.elasticsearch.console.monitor.metrics-interval-seconds` | `60` | 指标采集节奏秒（下限 30，由采集器侧钳制） |
| `esquerystudio.elasticsearch.console.monitor.index-name` | `esquerystudio_monitor` | 监控日期索引前缀（查询/清理打 `<前缀>-*`） |

## 宿主鉴权委托（esquerystudio.elasticsearch.console.auth.delegate）

不写一行 Java 即可把控制台登录接到宿主凭据体系；宿主若注册 ConsoleAuthDelegate 代码 SPI Bean，代码 SPI 优先（本配置被忽略）。mode 不配 = 不启用。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.auth.delegate.mode` | （空串） | 委托模式：`jwt`（本地验签宿主 JWT）/ `endpoint`（回调宿主校验接口）/ `header`（信任网关注入头） |
| `esquerystudio.elasticsearch.console.auth.delegate.token-header` | `Authorization` | 携带宿主凭据的请求头（jwt/endpoint 模式取 token 用，Bearer 前缀自动剥离） |
| `esquerystudio.elasticsearch.console.auth.delegate.role-mapping` | （空 Map） | 角色映射：console 角色 → 宿主角色逗号串（如 ADMIN=admin,superuser）；宿主角色未命中一律 VIEWER |

### jwt 模式（本地验签宿主 JWT，HS256 共享密钥 / RS256 公钥二选一，同配以 alg 为准）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.auth.delegate.jwt.secret` | （空串） | HS256 共享密钥（支持 `${ENV}` 环境变量引用） |
| `esquerystudio.elasticsearch.console.auth.delegate.jwt.public-key` | （空串） | RS256 PEM 公钥 |
| `esquerystudio.elasticsearch.console.auth.delegate.jwt.username-claim` | `sub` | 用户名 claim（支持 a.b.c 点分路径） |
| `esquerystudio.elasticsearch.console.auth.delegate.jwt.roles-claim` | `roles` | 角色 claim（数组或逗号串） |
| `esquerystudio.elasticsearch.console.auth.delegate.jwt.display-name-claim` | （空串） | 展示名 claim（点分路径）；空=不取，顶栏回落 username |
| `esquerystudio.elasticsearch.console.auth.delegate.jwt.require-exp` | `true` | 是否强制要求 `exp`：true（默认）缺 exp 即拒——无 exp 的令牌等同永久凭证；旧宿主未签发 exp 可置 false 兼容（启动 WARN），非数值 exp/nbf 始终拒绝 |

### endpoint 模式（凭据转发宿主校验接口，2xx 即认）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.auth.delegate.endpoint.verify-url` | （空串） | 宿主校验接口 URL（POST） |
| `esquerystudio.elasticsearch.console.auth.delegate.endpoint.forward-headers` | （空串） | 透传请求头白名单（逗号分隔；默认只透传 token-header） |
| `esquerystudio.elasticsearch.console.auth.delegate.endpoint.username-path` | `username` | 返回 JSON 里用户名字段路径（a.b.c） |
| `esquerystudio.elasticsearch.console.auth.delegate.endpoint.roles-path` | `roles` | 返回 JSON 里角色字段路径（数组或逗号串） |
| `esquerystudio.elasticsearch.console.auth.delegate.endpoint.display-name-path` | （空串） | 返回 JSON 里展示名字段路径；空=不取 |
| `esquerystudio.elasticsearch.console.auth.delegate.endpoint.cache-seconds` | `30` | 校验结果短缓存秒数（按 token 缓存，降低宿主接口压力） |

### header 模式（信任网关/上游代理注入的身份头；必须配合网关剥离外部同名头，否则可伪造）

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.auth.delegate.header.user-header` | （空串） | 用户名头（非空即信任） |
| `esquerystudio.elasticsearch.console.auth.delegate.header.roles-header` | （空串） | 角色头（逗号分隔，经 role-mapping 映射） |
| `esquerystudio.elasticsearch.console.auth.delegate.header.display-name-header` | （空串） | 展示名头；值若经 URL 编码可携中文，服务端自动解码 |
| `esquerystudio.elasticsearch.console.auth.delegate.header.trusted-proxies` | `[]` | 受信代理清单（精确 IP 或 IPv4 CIDR，如 `10.0.0.5,10.8.0.0/16`）。非空时身份头仅在 remoteAddr 命中清单时被采信——推荐显式配置网关地址，把「私网整体信任」收窄到具体代理；留空维持默认行为（回环/私网/链路本地即信）。注意容器网段（如 172.17.x）、CGNAT（100.64/10）与 IPv6 直连不在默认私网清单内——网关地址属这些段时必须显式配置，否则身份头被拒识（日志有 remote 与配置写法提示） |

## 控制台安全响应头（esquerystudio.elasticsearch.console.security）

控制台 API 与控制台 HTML/静态资源统一过安全头过滤器：`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer` 全量；auth 域响应额外 `Cache-Control: no-store`（token/身份档案不留缓存）。

### 跨站写防护（CSRF）

所有**状态变更请求**（非 GET/HEAD/OPTIONS）在鉴权之前先过一道跨站判定：

- 判据只用浏览器强制写入、页面 JS 不可伪造的 `Sec-Fetch-Site`：`cross-site` → **403
  `CSRF_BLOCKED`**（并落审计 `action=CSRF_BLOCKED`）；`same-origin` / `same-site` / `none` /
  缺省（curl、SDK、服务间调用不带该头）→ 放行。
- 只拒 `cross-site` 是刻意的：宿主页与 console 位于不同子域的同站集成、iframe 内请求
  （iframe 文档自身 origin 即 console，浏览器判为 `same-origin`）都不受影响。
- 为什么需要：委托 `header` 模式下身份来自「网关注入头 + 浏览器自动携带的宿主 cookie」，
  跨站表单 POST 属 CORS simple request（不触发预检），一个 `<form>` 即可借用户身份
  abort 迁移 / 取消任务 / 删账号。

### 受信代理与来源 IP（审计 / 登录节流）

`esquerystudio.elasticsearch.console.auth.delegate.header.trusted-proxies` **同时约束审计来源 IP 与登录节流**：

- 非空：只有清单内（精确 IP 或 CIDR）的直连方才可经 `X-Forwarded-For` / `X-Real-IP`
  声明客户端地址；清单外的私网直连视为终端本身。
- 为空：沿用历史启发式（回环/私网即代理）。**生产建议显式配置**，否则内网直连者可伪造
  XFF 污染审计来源、并以「换 IP 即换配额」绕过登录节流（10 次/5 分钟）。

### 已知边界（当前版本有意不做，接入方需自行评估）

- **作业变更是「用户级」、观测是「连接级」**：`adhoc-rebuild` / `xmigrate` 的 abort / resume /
  confirm-switch 只允许**创建者本人或 ADMIN**（同连接同事仍可看 progress 做团队排障）；升级前
  无 owner 的旧作业保持连接级语义以便收尾；前端 Adhoc/Xmigrate 同源隐藏非创建者的
  中止/续跑/确认钮并给出创建者说明。`adhoc confirm-switch` 还要求作业已进入
  `AWAIT_CONFIRM` 阶段（不能提前放行）。`/cluster/tasks/cancel` 属集群级动作（taskId 无归属）：
  连接模型下需 rank3 或 `w:cluster-settings`。
- **jobId 不可预测**：xmigrate 为 `dest_<毫秒>_<16 hex>`、adhoc 为 `adhoc-<16 hex>`；日志检索
  仍可按前缀匹配。旧格式历史作业照常读取。
- **委托登出会在本实例登记拒绝表**（jwt 到 exp、endpoint 到裁决缓存窗口）；自定义
  `ConsoleAuthDelegate` 只要实现 `tokenOf(request)` 报出原始令牌，内核会在认证前查同一张
  拒绝表——即使 `revoke` 未实现（返回默认 `false`），`/auth/logout` 也由内核按
  `max(内置 token-ttl-ms, 24h)` 兜底登记（宿主内嵌形态无需改代码即生效）；委托已自行登记
  时不重复写。未实现 `tokenOf` 的委托控制台无法得知令牌原文，`/auth/logout` 不承诺吊销，
  账号切换以宿主自己的 logout（Redis 黑名单）为准。
  进程内表，多实例部署只在当前实例生效，需要全局即时失效请缩短 TTL 或走宿主侧
  `revoke`（多实例共享存储）。`header` 模式无令牌原文，无法本地吊销。
- **委托鉴权异常不回落内置身份**：宿主 `authenticate` 抛异常时，若请求携带宿主凭证
  （`hasCredential` 返回 true，**或** `tokenOf` 报出非空令牌）则直接 401，不再回落到浏览器
  残留的内置 token——否则宿主任一 5xx 都能把已撤销会话升级成本地 ADMIN。只实现
  `tokenOf`、未实现 `hasCredential` 的委托同样受保护；任一探测抛异常按「携带」处理。
  未携带宿主凭证的独立部署仍走内置登录，避免误拦。
- **内置登录的兜底账号 `admin`/`esquerystudio`** 仅在 `builtin-login-enabled` 打开时可用，
  委托部署默认关闭；用户库为空时还要求 loopback 直连。独立部署请在本机首登改密或配置强
  `fallback-password`（启动日志有 ERROR 提醒）。
- 读侧「内网拓扑」按**页面语义**收窄：节点 host/IP、远端 seeds、painless 源码只对
  `topology` / `remote-clusters` / `painless-lab` 页读键可见；`overview` / `indices` / `live` /
  `workspace` 等顺带消费的共享读端点会摘除分片行的 `ip`、节点 `host`，只回远端连接数、
  脚本仅回 mustache。`path.repo` 没有页面端点直出（快照页只回仓库 `location`，凭据已脱敏）；
  ADMIN 的 raw 通道仍可读全量。静态/内置模型（无页面语义）维持历史可见性，不受此收窄影响。

### 首次绑定（setup）与重绑

- 未绑定窗口只放行 `setup/status|test|apply`；`test/apply` 在**无委托**时要求
  `X-Setup-Token`（配置后）且默认仅本机可调；**有委托**时要求委托认出的 ADMIN。
- 配置了 `esquerystudio.elasticsearch.console.setup-token` 后，**委托模式与 `setup/rebind` 同样校验该令牌**
  （第二因子：header 模式身份可伪造，「改控制面指向」不能只凭角色）。未配置时行为不变。
- 反代部署注意：若代理不追加 `X-Forwarded-For`，未绑定请求的 `remoteAddr` 会是回环，
  被判定为本机——请配置 `setup-token` 或仅在初始化窗口短暂暴露。

| 配置键 | Java 默认值 | 说明 |
|---|---|---|
| `esquerystudio.elasticsearch.console.security.frame-ancestors` | （空串） | iframe 嵌入白名单（CSP `frame-ancestors` 值，如 `'self' https://portal.example.com`）。**空=不下发任何 frame 头**——同源 iframe 嵌入（如 宿主内嵌形态）与独立部署不受影响；显式配置后仅白名单域可嵌控制台页面（防点击劫持）。清单必须包含实际嵌页的完整 origin |

## 完整默认配置

```yaml
es:
  rebuild:
    mode: client
    version-format: yyyyMMddHHmmss
    web-enabled: true
    retry:
      max-attempts: 5
      init-backoff-ms: 500
      max-backoff-ms: 8000
    lock:
      enabled: true
      index-name: ""
      lease-ms: 3600000
    orchestration:
      poll-interval-ms: 2000
      timeout-ms: 1800000
    migrate:
      enabled: true
      default-slices: 4
      default-batch-size: 2000
      scroll-keep-alive-sec: 120
      connect-timeout-ms: 5000
      socket-timeout-ms: 60000
      job-index-name: ""
    adhoc:
      confirm-timeout-ms: 1800000
    compat:
      date-converters: false
    config-validation:
      mode: strict
      dry-run-on-startup: true
    mapping:
      auto-register: startup
      conflict-policy: fail
      missing-index-policy: skip
    console:
      conn-index-name: esquerystudio_conn
      home-dir: ""
      control-mode: auto
      conn-probe-enabled: true
      conn-probe-interval-seconds: 60
      host-cluster-visible: true
      store: control-es
      page-auth:
        enabled: true
      conn-sync:
        enabled: false
        interval-seconds: 3600
        initial-delay-seconds: 30
        min-role: VIEWER
      monitor:
        enabled: true
        interval-seconds: 60
        metrics-interval-seconds: 60
        index-name: esquerystudio_monitor
      auth:
        enabled: true
        fallback-username: admin
        fallback-password: esquerystudio
        token-ttl-ms: 43200000
        token-secret: ""
        user-index-name: esquerystudio_user
        ops-audit-index-name: esquerystudio_ops_audit
        host-audit-merge: false
        audit-retention:
          enabled: true
          max-days: 90
          max-total-bytes: 32212254720
          dry-run: false
        delegate:
          mode: ""
          token-header: Authorization
          jwt:
            secret: ""
            public-key: ""
            username-claim: sub
            roles-claim: roles
            display-name-claim: ""
          endpoint:
            verify-url: ""
            forward-headers: ""
            username-path: username
            roles-path: roles
            display-name-path: ""
            cache-seconds: 30
          header:
            user-header: ""
            roles-header: ""
            display-name-header: ""
            trusted-proxies: []
```

## ESQueryStudio 平台层（`esquerystudio.console`）

平台层只决定「产品面」：品牌、功能包与单页排除；引擎运行参数仍在 `esquerystudio.elasticsearch.*`。

| 配置键 | 默认值 | 说明 |
|---|---|---|
| `esquerystudio.console.features.packs` | `[]`（全部 11 个包） | 显式列表只启用列出的功能包；未知包名 WARN 忽略，全部未知则启动失败 |
| `esquerystudio.console.features.exclude-pages` | `[]` | 在功能包之上再隐藏单页（page key，如 `security`） |
| `esquerystudio.console.branding.product-name` | `ESQueryStudio` | 产品名（侧栏/登录层/标题） |
| `esquerystudio.console.branding.tagline` | `为 Spring Boot 而生的 Elasticsearch 查询工作台` | 品牌副标语 |
| `esquerystudio.console.branding.integration-id` | `generic` | 宿主集成标识；注册 `ConsoleHostIntegration` Bean 时默认取 Bean 值 |
| `esquerystudio.console.branding.integration-name` | `""` | 宿主展示名（如 `Acme`），作为侧栏副标题 |
| `esquerystudio.console.branding.docs-url` | `""` | 宿主帮助/文档链接（透传前端） |

运行时前端读取 `GET /internal/es/index/ui/config` 获取合并后的配置；该端点零敏感信息，
属于自举面（空页面授权身份也可读），不参与页面级授权判定。

## MCP 接入（`esquerystudio.mcp`）

| 配置键 | 默认值 | 说明 |
|---|---|---|
| `esquerystudio.mcp.enabled` | `false` | 是否注册 `/mcp` JSON-RPC 端点；关闭时端点不存在；同时要求 `esquerystudio.elasticsearch.web-enabled=true` |
| `esquerystudio.mcp.token` | （空串） | 服务级自举 Bearer token；API key 管理启用后可作为应急通道，日常建议按用户/角色签发 key |
| `esquerystudio.mcp.key-encryption-key` | （空串） | 完整 MCP key 落盘加密主密钥（AES-256-GCM）。空时回落 `mcp.token`，再回落 `~/.esquerystudio/mcp-secret.key`；多实例必须显式配置同一值 |
| `esquerystudio.mcp.audit-retention-days` | `30` | MCP 调用审计保留天数，最低 7 天；与 key 存储同档（控制 ES 索引 / 宿主数据库表） |
| `esquerystudio.elasticsearch.console.mcp-key-index-name` | `esquerystudio_mcp_keys` | `store=control-es` 时 MCP key 记录所在控制集群索引；认证只存 SHA-256 摘要，完整 key 存 AES-256-GCM 密文；另建 `<name>_audit` 索引保存调用审计 |

MCP 端点默认只暴露只读工具；ADMIN 签发的 key 可按连接授权写工具（连接级 `connectionPermissions`）。配置与边界见 [MCP 接入](../mcp.md)。

## 行为边界

- 键名允许值在属性校验阶段检查，拼写错误会拒绝 Spring 上下文启动（含 retry 退避区间、lock 租约 ≥ 编排超时等不变量）。
- `auto-register=startup` 的 ES I/O 发生在 ApplicationReady 后的 daemon 单线程中，不阻塞 ready。
- `mapping.conflict-policy=fail` 中的 fail 表示本轮 mapping addition 不写入，不表示关闭应用。
- `mapping.missing-index-policy=fail` 也发生在应用 ready 之后；`FAILED_INDEX_MISSING` 是对账报告，不会终止已经 ready 的 Spring Boot 应用。
- `skip` 与 `fail` 都不会创建缺失索引。需要建新物理索引或改变既有字段定义时走 宿主应用 Adhoc 托管重建。
- 对账 runner 仅在 client 模式装配，并要求宿主存在可用的 `ElasticsearchOperations`；缺失时记录 `SKIPPED_NO_CLIENT`。
