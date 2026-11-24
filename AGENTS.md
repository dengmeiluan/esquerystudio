# AGENTS.md

## 纯前端 / 服务端同源铁律

本仓库只有一套 Vue 控制台源码。`ui/src/api.ts` 的每个端点必须同时有
`ui/src/platform/browserApi.ts` 的纯浏览器实现；页面契约里的每个 `apiPrefixes`
也必须被浏览器 transport 覆盖。

- 不允许只实现服务端、把纯前端留到以后；新增端点/页面/动作时同批完成两端。
- 确实无法在浏览器实现的少数能力，登记在 `ui/src/utils/browserUnsupported.ts`
  的 `BROWSER_SERVER_ONLY_ENDPOINTS`，逐项写明原因，并在 UI 中展示真实边界；
  不允许静默 501、伪成功或只在文档里口头说明。
- 数据可以有界有损（如跨实例锁、代码 provider、历史采样），交互、状态、错误/空态
  语言必须一致。

## 必跑门禁

```bash
node scripts/check-browser-parity.mjs   # API + 后端 Controller + 页面契约对齐，CI 阻断
node scripts/check-mcp-parity.mjs       # 服务端 / 纯前端 / 文档 MCP 工具契约对齐，CI 阻断
node scripts/check-native-controls.mjs  # 全站禁止廉价原生控件（裸 input/select/textarea；豁免须登记原因）
node scripts/check-local-mcp-exe.mjs    # 本地 stdio 单文件产物契约 + （已构建时）真实二进制握手 + 签名状态
node scripts/verify-windows-signing.mjs # Windows 签名管线自检（临时自签名，不冒充受信任签名）
node scripts/verify-local-mcp.mjs       # 本地 Node MCP 直连 ES 冒烟（stdio/多连接/写开关/取消真中断）
node scripts/verify-local-mcp-cancel.mjs # 慢 ES stub 下验证 tasks/cancel 断开真实连接（独立可跑）
node scripts/verify-server-mcp-cancel.mjs # 真 jar + 慢 ES stub：异步提交/轮询/核心取消/撤 ES 任务（需先起 server）
node scripts/check-zero-skipped.mjs     # Java/UI 测试零跳过门禁（Assume/@Ignore/skipIf 直接阻断）
node scripts/check-doc-links.mjs
cd ui && npm run typecheck
cd ui && npm test
```

构建单文件 stdio MCP（Windows `.exe`，对标 `dbx-mcp.exe`）：`node scripts/build-local-mcp-exe.mjs`。

MCP 长调用的硬约束（三端同语义，改动任一端必须同批验证）：**每个工具调用 3 分钟预算到点自动掐断**、
`tasks/cancel` 与 `notifications/cancelled` 必须**真中断**（断线程/断 HTTP 连接/撤 ES 任务），
声明 Tasks 扩展的客户端一律先拿 `working` 任务再续传。只把状态词改成 cancelled 视为缺陷。

改动浏览器模式能力时同步更新 `docs/browser-mode.md` 的边界表与验证说明。
