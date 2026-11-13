<!-- 提交前请确认以下事项（详见 CONTRIBUTING.md） -->

## 改了什么 / 为什么

## 验证

- [ ] `mvn clean test -Dconsole.build.skip=true` 全绿（需先有 UI 构建产物）
- [ ] `cd ui && npm run typecheck` 0 错
- [ ] `cd ui && npm test` 全绿
- [ ] `node scripts/check-browser-parity.mjs` 通过（新端点/页面必须同时有纯前端实现）
- [ ] `mvn -P release -DskipTests -Dconsole.build.skip=true verify` 通过（改构建/发布配置时）
- [ ] 新能力配 spec 锚（TDD 先红后绿）

## 补充

- [ ] 不含内部信息（内部端点 / 台账 / 项目名 / 凭据 / 客户数据）
- [ ] 文档无占位符（TODO / TBD / 待补充 / 待完善）
- [ ] 已阅读 [架构说明](docs/architecture.md) 与 [行为准则](CODE_OF_CONDUCT.md)
