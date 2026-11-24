## ESQueryStudio 查询工作台 · 初版（滚动更新）

**为 Spring Boot 而生的 Elasticsearch 查询工作台。** 一套原生 Vue 控制台（53 页 / 11 个功能包）覆盖 **Elasticsearch 6.7 → 9.x**：请求形态、SQL 端点、模板与 mapping type 由集群版本驱动，未知版本走 6.x / 7.x+ 双兼容形态。同一套共享核心支持 **Boot 2.3–4.2 任意宿主**嵌入，并内建 **17 组 MCP**（服务端 / 宿主 / 浏览器 / 本地 stdio），另有 Chrome MV3 扩展浏览器模式。

**本版 1.0.99 修复了两处 MCP 配置面问题**：独立服务端默认未启用 MCP 时，面板不再显示「服务端在线 / 签发密钥」，也不再抢跑 `/mcp/keys`；开启但未绑定控制集群时，密钥存储异常改为可读提示。独立服务端的 AI 一键搭建默认端点回到服务根（此前会落到 `/esquerystudio` 并生成旧路径），默认提示词正确输出 `/esmcp`。UI typecheck、`ConsoleSetupStatusMask999Test` 3/3、standalone 两态实测通过；1.0.98 的 17 组 MCP / 四形态 / `es_sql` 修复保持不变。

### 本版修复（1.0.99）

- **MCP 未启用状态如实显示**：`setup/status` 新增 `mcpEnabled`；面板在状态返回前显示「检查中…」，未启用时显示「MCP 未启用」并隐藏签发入口，`/mcp/keys` 请求数为 0。开启但控制集群未绑定时，`/mcp/keys` 500 改为「MCP 密钥存储不可用：确认 enabled + 绑定控制集群」提示，不再抛原始 JSON。
- **AI 接入默认端点修正**：standalone 不再从 `/esquerystudio/` 静态目录推导 MCP 端点，改为服务根（standalone `origin`，host `context-path`）；默认提示词、控制台/端点字段与 `/esmcp` 一致。
- **验证**：UI typecheck；`serviceRootFromLocation` 3 例、`mcpEnabledState` 2 例、`agentSetupPrompt1089` 5 例；Java `ConsoleSetupStatusMask999Test` 3/3；standalone disabled 态 0 次 key 请求、enabled 态服务端在线。

### 1.0.98 基线（继续有效）

- **宿主形态 MCP 对等**：MCP 控制器拆入 `mcp-server` 共享核心；Boot 2.3 / 2.7 / 3.5 / 4.2 宿主开启 `esquerystudio.mcp.enabled=true` + 服务 token，即挂载与完整控制台相同的 17 组 `/esmcp`。按用户签发的 key 与 console 存储动作仍由完整控制台提供。
- **修复 `es_sql` 在 7.10+ 全部 400**：移除 `/_sql?format=json&timeout=180s` 中非法的 `timeout` query 参数（ES SQL 只接受 `format` / `fetch_size` 等），并把 400 请求级错误从「能力不可用」降级中剥离；止损依赖连接 abort + 3 分钟预算。
- **MCP 端点可配置**：默认 `/esmcp`（项目标志位，避免与其他集成的 `/mcp` 冲突）；`esquerystudio.mcp.path` 可改成 `/mcp` 或带 context-path 的合法路径，非法值启动即失败。
- **全自动化发布**：Pages 演示站随 `main` 自动部署；四条车道路径过滤覆盖共享核心；Release 附宿主 jar 与三套可运行适配器 app。
- **供应链与端口收敛**：Boot 4 适配器内置 Jackson 2.18.11；共享模块 Jackson 为 provided、按最老宿主 API 编译并在 SECURITY.md 说明；UI 升级 typescript-eslint/minimatch；端口统一 5601 / 5602 / 5603 / 5604。
- **安全面归零**：修复设置编辑三处 dot-path 原型污染；CodeQL 真实项清零，误报逐条关闭；Scorecard 实践项归徽章，不占代码扫描。
- **初版规范**：只保留一个提交 / 一个标签 / 一个 Release / 一个 `main` 分支；Pages 自动部署但只保留一条滚动 deployment；核心库发布到 **GitHub Packages**（`https://maven.pkg.github.com/dengmeiluan/esquerystudio`）；CodeQL 切到 `security` 套件。完整故事见 [1.0.98 发布文章](announcement-1.0.98.md)。

### 全版本 × 全形态

| 形态 | 入口 | ES 6.7–9.x | Spring Boot | MCP |
|---|---|---|---|---|
| 独立 jar | `esquerystudio-server-1.0.99.jar` | ✅ | 2.7 | 17 组 `/esmcp` |
| 宿主嵌入 | `esquerystudio-boot-support` + 共享核心 jar | ✅ | 2.3 / 2.7 / 3.5 / 4.2 | 17 组（服务 token） |
| 完整控制台嵌入 | `esquerystudio-console` | ✅ | 2.7 | 17 组 + key 治理 |
| Chrome MV3 | `esquerystudio-chrome-1.0.99.zip` | ✅ | — | 页面内桥 |
| 本地 stdio | `esquerystudio-mcp.exe` / Node | ✅ | — | 17 组 + 资源/提示词 |

### 发行资产怎么选

| 你想要的 | 下载 |
|---|---|
| 直接运行完整控制台 | `esquerystudio-server-1.0.99.jar`（`java -jar`，默认 5601） |
| 嵌入现有 Boot 2.3–4.2 宿主 | `esquerystudio-boot-support-1.0.99.jar` + `es-rest` / `es-engine` / `mcp-core` / `mcp-server` jar（`mvn install:install-file` 或直接 classpath） |
| 跑三个 Boot 基线演示 | `esquerystudio-console-boot2/3/4-1.0.99.jar`（默认端口 5602 / 5603 / 5604） |
| Chrome 扩展 | `esquerystudio-chrome-1.0.99.zip` |
| 离线静态演示 | `esquerystudio-static-1.0.99.zip` |
| Agent 本地接入 | `esquerystudio-mcp.exe` + `esquerystudio-mcp.json` |
| 源码 / 依赖清单 / 校验 | `*-sources.jar` / `esquerystudio-sbom.json` / `SHA256SUMS` |

### 诚实边界

- 宿主形态默认 **服务 token** 认证；按用户签发的 API key 与依赖 console 存储的动作（adhoc 重建 / 跨集群迁移 / 配置实验室等）由完整控制台提供，宿主对这类动作返回明确的不可用错误，不静默降级。宿主注册 `McpAccessService` 时也可启用 API key。
- 独立服务端的 API key 存储需要绑定控制集群（或宿主提供 JDBC 存储）；未绑定时密钥页会明确提示，不会假装可签发。
- Windows 单文件 exe 未配置代码签名证书时如实标记 `unsigned`；签名接入点已就绪。
- 当前未发布到 Maven Central；宿主 jar 可 `install-file` 到本地仓库或直接加入 classpath。
- 每次 MCP 调用与拒绝都留档 method / tool / IP / UA / HTTP / `X-Request-Id` / 耗时 / 成败，便于按 requestId 关联排查。

### 快速链接

- 在线演示（合成数据，点开即玩）：<https://dengmeiluan.github.io/esquerystudio/demo/>
- 5 分钟接入 / 全版本 × 全形态：<https://github.com/dengmeiluan/esquerystudio#-5-分钟接入>
- MCP 快速开始与 30 秒验收：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/mcp.md#快速开始>
- 宿主集成：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/integration/README.md>
- 文档索引：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/README.md>
- 1.0.98 发布文章：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/announcement-1.0.98.md>
- LINUX DO 社区：<https://linux.do>

> 发布线约定：「初版（滚动更新）」是唯一 Release；版本号递增，但仓库只保留一个提交、一个标签、一个 Release，资产直接覆盖更新。
