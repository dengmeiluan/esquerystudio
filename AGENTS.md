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
node scripts/verify-local-mcp.mjs       # 本地 Node MCP 直连 ES 冒烟（stdio/多连接/写开关）
node scripts/check-zero-skipped.mjs     # Java/UI 测试零跳过门禁（Assume/@Ignore/skipIf 直接阻断）
node scripts/check-doc-links.mjs
cd ui && npm run typecheck
cd ui && npm test
```

改动浏览器模式能力时同步更新 `docs/browser-mode.md` 的边界表与验证说明。
