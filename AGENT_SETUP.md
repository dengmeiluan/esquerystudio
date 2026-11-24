# AI 一键搭建 / 接入提示词（Agent Setup）

把下面整段内容粘贴给任意 AI Agent（Claude Code / Cursor / Qoder / WorkBuddy / Codex / 通用 MCP 客户端），它会按当前形态完成部署、签发 key、写入客户端配置并做真实协议验证。

同一份提示词也内置在运行中的控制台：**MCP 接入 → 接入总览 → AI 一键搭建 / 接入**。选择形态、客户端、端点后可实时生成、复制或下载；MCP 客户端也可直接调用 `prompts/get`（`deploy_and_connect`）获取。

- 仓库：<https://github.com/dengmeiluan/esquerystudio>
- 滚动 Release：<https://github.com/dengmeiluan/esquerystudio/releases/latest>
- 服务端 / 宿主接入：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/integration/README.md>
- MCP 全量说明：<https://github.com/dengmeiluan/esquerystudio/blob/main/docs/mcp.md>

---

<!-- AGENT_SETUP:START -->
你是 ESQueryStudio 的部署与接入助手。目标：在 auto 上以「Spring Boot 独立服务端（java -jar）」方式完成搭建，并把「generic」接入为 MCP 客户端。只做必要动作；每一步都验证并回报证据，失败时给出原始错误与下一步，禁止伪成功。

【产品事实】
- 仓库与唯一滚动 Release：https://github.com/dengmeiluan/esquerystudio （`releases/latest`；资产名含版本号，先列资产再下载，不要猜文件名）。
- 工具面：17 个 action 组 / 171 个 action、14 个只读资源 + 1 个 MCP App、7 个引导提示词；精简面保留 17 组工具但 0 资源 / 0 提示词。
- 长调用：单次工具调用硬预算 180 秒，到点返回 `cancelled/DEADLINE`；reindex / update-by-query / delete-by-query / restore 等长任务用异步端点或 `tasks/get` 续传，不要阻塞等待；`tasks/cancel` 与 `notifications/cancelled` 会真中断（断连接 / 撤 ES 任务）。
- 凭据：MCP key 只在控制台「MCP 接入 → 密钥」或管理 API 签发；key 不写入仓库、日志、截图或终端历史。

【本次选择】
- 形态：Spring Boot 独立服务端（java -jar）
- 客户端：generic
- 端点 / 上下文：MCP 端点 `http://localhost:5601/esmcp`（宿主有 context-path 时按宿主前缀，如 QuoteHub 为 `http://localhost:5601/quotehub/esmcp`）；控制台 `http://localhost:5601/esquerystudio.html`
- 操作系统：auto

【执行步骤】
0. 预检：确认 OS / 架构、JDK（server 需 8+）/ Node（local-node 需 18+）/ Chrome（browser 需 MV3）、端口占用与 GitHub 可达；记录实际值。
1. 取资产：`GET https://api.github.com/repos/dengmeiluan/esquerystudio/releases/latest`，按名称选择资产并核对 `SHA256SUMS`（或 API digest）。
2. 安装并启动：下载 `esquerystudio-server-<ver>.jar` → `java -jar esquerystudio-server-<ver>.jar`（默认端口 5601）→ 打开 `http://localhost:5601/esquerystudio.html`。
3. 打开控制台并确认可登录：`GET http://localhost:5601/esquerystudio.html` 返回 200；登录后「MCP 接入」页的协议自检通过。
4. 签发 MCP key：ADMIN 登录 → MCP 接入 → 密钥 → 签发；按用途选择只读 / QA-UAT 可写 / 批量写，逐连接设置 read/write，记录过期与配额。管理 API 形态：`POST {context-path}/internal/es/index/mcp/keys`。
5. 配置客户端（优先 CLI，失败再手写）：
   `node mcp/esquerystudio-mcp-cli.mjs install --client generic --url http://localhost:5601/esmcp --token <key> --write`
   本地 stdio：`node mcp/esquerystudio-mcp-cli.mjs install --client generic --local --write`
   Windows 单文件：把 `esquerystudio-mcp.exe` 的绝对路径写进客户端 `command`（对标 `dbx-mcp.exe`）。
6. 验证：`esquerystudio-mcp-cli probe --url http://localhost:5601/esmcp --token <key> --json`；再真实往返 `server/discover`、`tools/list`、`resources/list`、`prompts/list`，确认 17 组 / 171 action / 14 资源 + 1 App / 7 提示词（精简面 0 资源 / 0 提示词），并做一次只读工具调用。
7. 回报：版本、端点、客户端配置文件路径、验证输出、实际权限边界、回滚方式。

【其他形态速查】
- server：下载 `esquerystudio-server-<ver>.jar` → `java -jar` → `http://localhost:5601/esquerystudio.html`。
- host：完整控制台（Boot 2.7）引入 `esquerystudio-console` / `esquerystudio-platform`；任意 Boot 2.3–4.2 宿主引入 `esquerystudio-boot-support`（含 17 组 `/esmcp`，服务 token）。放行 `/esquerystudio.html` 与 `/esmcp`；QuoteHub 的 MCP 端点是 `<host>/quotehub/esmcp`。
- browser：解压扩展 → `chrome://extensions` 加载已解压的扩展程序 → 页面内使用 `window.ESQueryStudioMCP`。
- local-exe：Windows 下载 `esquerystudio-mcp.exe`；签名状态见同目录 `esquerystudio-mcp.json` 的 `signature`（未签名时首次可能触发 SmartScreen；只从官方 Release 下载并核对摘要）。
- local-node：`cd mcp && npm install -g .`（或直接 `node esquerystudio-mcp.mjs`），写工具需 `--allow-write`。

【安全与边界】
- 生产默认只读；写操作需显式授权与 MRTR 二次确认。跨云结构同步先 `smart_sync` `apply=false` 预览，确认 `planDigest` 后再 `apply=true`。
- 不把 key 打印到终端历史；使用环境变量或客户端密钥存储。
- 浏览器模式没有外部 HTTP 端点；本地模式连接凭据留在本机。
<!-- AGENT_SETUP:END -->

---

## 形态变体

| 形态 | `mode` | 典型 `endpoint` | 说明 |
|---|---|---|---|
| 独立服务端 | `server` | `http://<host>:5601` | `java -jar`，页面 `/esquerystudio.html`，MCP `POST /esmcp` |
| 嵌入宿主 | `host` | `http://<host>:7788` | 宿主引入 starter；QuoteHub 的 context-path 为 `/quotehub`，端点为 `/quotehub/esmcp` |
| 浏览器扩展 | `browser` | — | 页面内桥 `window.ESQueryStudioMCP`，没有外部 HTTP 端点 |
| Windows 单文件 | `local-exe` | — | `esquerystudio-mcp.exe`，对标 `dbx-mcp.exe`，目标机零依赖 |
| 本地 Node | `local-node` | — | `mcp/` 目录或全局安装，stdio 直连 ES |

`prompts/get` 会按参数替换形态、客户端、端点与操作系统；上方正文是 `mode=server, client=generic, endpoint=http://localhost:5601, os=auto` 的默认输出，也是本文件的契约正文（门禁逐字比对）。

## 为什么这样设计

- **AI 可识别**：先给事实与硬约束，再给编号步骤和验证命令，最后要求回报证据与回滚，避免「看起来成功」。
- **真实可取消**：所有 MCP 调用 180 秒硬预算；长任务走异步端点或 `tasks/get` 续传，`tasks/cancel` / `notifications/cancelled` 真中断，不占住生产连接。
- **最小权限**：key 在控制台或管理 API 签发，按连接 read/write、rpm 与日/月配额收窄；提示词明确禁止把 key 写入仓库、日志或截图。
- **跨云可落地**：生产（如阿里云）→ UAT（如腾讯云）先 `smart_sync apply=false` 预览兼容剔除计划，`planDigest` 漂移门通过后再 `apply=true`，必要时 `mode=incremental` 跟随增量字段。
