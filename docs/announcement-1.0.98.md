# ESQueryStudio 1.0.98：一个控制台，如何无缝跨越 Elasticsearch 6.7 → 9.x

> 发布文章 · 2026-11-26 · [GitHub](https://github.com/dengmeiluan/esquerystudio) · [在线演示](https://dengmeiluan.github.io/esquerystudio/demo/)

## 先说结论

ESQueryStudio 是**为 Spring Boot 而生的 Elasticsearch 查询工作台**：53 页控制台，覆盖 **ES 6.7 → 9.x**；能独立跑、能嵌进 Boot 2.3–4.2 宿主、能装成 Chrome 扩展、还能作为本地 stdio MCP。这一版把「**全版本 × 全形态 × 全自动**」真正收口了。

如果你曾经在 6.x 的 typed mapping、7.x 的 typeless、8/9 的 REST 差异之间来回改代码，这一版值得看一眼。

## 我们为什么不再为每个 ES 版本写一套代码

很多 ES 工具支持 6.7，也支持 9.x，但背后是三套分支：6.x 一套 typed 路由，7.x 一套 typeless，8/9 再补丁。结果是查询工作台长得一样，行为却随版本漂移。

ESQueryStudio 的选择是：**只保留一条现代请求路径 + 通用回退**。

- 默认 typeless；遇到 6.x 形状，自动带 `_doc` 包层并重试；
- SQL 优先走 `_sql`，6.x 回退到 `_xpack/sql`；
- `hits.total` 同时接受数字与对象，不在 UI 层猜版本；
- 版本未知时不猜 major，先用 6.x / 7.x+ 都合法的形态，探活后精确。

这不是一句口号：`Boot2Es67FallbackTest` 在 6.7 stub 上验证 typed 建索引 / put mapping 自动重试与数字 `total`；`Boot3Es9SeamlessTest` 在 9.1 形状上验证全程 `_sql` 与 typeless，`_xpack/sql` 与 `_doc/_mapping` **零调用**。

## 这一版真正变了什么

### 1. 17 组 MCP，四种形态同源

服务端 `/esmcp`、Boot 2.3–4.2 宿主、浏览器内桥、本地 Node/exe 共用同一份 [`mcp-server`](https://github.com/dengmeiluan/esquerystudio/tree/main/modules/mcp-server) 核心：17 个 action 组（171 个细粒度操作）、14 个只读资源 + 1 个 MCP App、7 个引导提示词。

宿主形态只需 `esquerystudio.mcp.enabled=true` + 服务 token，即挂载同一端点；console-only 的 adhoc/跨集群动作会**明确报不可用**，而不是静默降级。四条宿主车道（2.3 / 2.7 / 3.5 / 4.2）都有 4/4 端点冒烟。

### 2. 修掉 `es_sql` 在 7.10+ 的 400

此前 MCP 的 `es_sql` 会拼 `/_sql?format=json&timeout=180s`。ES SQL 只接受 `format` / `fetch_size` 等参数，7.10+ 对所有集群返回 400 `unrecognized parameter: [timeout]`，还被误报成「未启用 _sql」。

现在：非法参数移除，止损交给连接 abort + 3 分钟预算；400 请求级错误不再冒充「能力不可用」。新增 2 例回归（URI 不含 timeout、400 原样直传）。

### 3. 一个控制台，四种交付

| 形态 | 入口 | Spring Boot | MCP |
|---|---|---|---|
| 独立 jar | `esquerystudio-server-1.0.98.jar` | 2.7 | 17 组 `/esmcp` |
| 宿主嵌入 | `esquerystudio-boot-support` + 共享核心 | 2.3 / 2.7 / 3.5 / 4.2 | 17 组（服务 token） |
| Chrome MV3 | `esquerystudio-chrome-1.0.98.zip` | — | 页面内桥 |
| 本地 stdio | `esquerystudio-mcp.exe` / Node | — | 17 组 + 资源/提示词 |

### 4. 工程侧的"初版规范"

- 仓库只保留 **一个提交、一个标签、一个 Release**；Pages 自动部署但只保留**一条滚动 deployment**；
- 核心库发布到 **GitHub Packages**，宿主可直接从 `https://maven.pkg.github.com/dengmeiluan/esquerystudio` 解析；
- CodeQL 切到 `security` 套件、Dependabot 告警清零；Boot 4 适配器显式带 Jackson 2.18.11（Boot 4 不再自带 Jackson 2）。

## 证据，而不是口号

| 检查 | 结果 |
|---|---|
| 四宿主车道 | Boot 2.3 10/10 · 2.7 15/15 · 3.5 20/20 · 4.2 9/9 |
| 宿主 MCP | 各 4/4（401 / discovery / tools-list / 真实 `es_search` / console-only 如实报错） |
| Java / UI | 2,269 例 / 13,355 例，0 失败 0 跳过 |
| 门禁 | doc-links / mcp-parity / browser-parity / native-controls / zero-skipped 全绿 |
| 真 jar | `/esmcp` 401/200；慢 ES 下取消真断连（`_tasks/_cancel`） |

## 5 分钟上手

```bash
# 直接跑完整控制台
java -jar esquerystudio-server-1.0.98.jar
# 或跑 Boot 3.5 宿主适配器（默认 5603）
JAVA_HOME=/path/to/jdk-17 ./mvnw -Pboot3 -pl modules/console-boot3 -am spring-boot:run
```

打开 `http://localhost:5601/esquerystudio.html`（或 5602/5603/5604），连上任意 6.7–9.x 集群即可。不想装？[在线演示](https://dengmeiluan.github.io/esquerystudio/demo/) 是同一套源码 + 合成数据，点开即玩。

## 如果它帮你少部署一套 Kibana

一个 Star 不会改变世界，但会让下一个在 6.7 和 9.x 之间挣扎的团队更容易找到它：

**⭐ [Star ESQueryStudio](https://github.com/dengmeiluan/esquerystudio)** · 有场景或问题，欢迎在 [Discussions](https://github.com/dengmeiluan/esquerystudio/discussions) / [Issues](https://github.com/dengmeiluan/esquerystudio/issues) 里聊。
