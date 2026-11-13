# 贡献指南

感谢关注 ESQueryStudio！这是一个以**查询工作台**为核心的 Elasticsearch 平台：
六种查询模式共用一个现场，叠加零停机重建、可嵌入运维控制台与同源 Chrome 扩展。
平台内核、控制台、独立服务与浏览器模式分模块交付，宿主按需接入。

## 项目结构

| 目录 | 内容 |
|---|---|
| `platform/` | 页面契约、功能包、品牌与宿主 SPI（不依赖 ES 客户端） |
| `modules/console/` | 引擎、控制台 HTTP API、鉴权、审计与内嵌 UI 资源 |
| `apps/server/` | Kibana 式独立部署 |
| `ui/` | Vue 3 + TypeScript 控制台源码（服务端模式与 Chrome 浏览器模式共用） |
| `extensions/chrome/` | MV3 Chrome 扩展：同一 Vue 控制台的 browser 构建 + 原生直连 transport |
| `examples/demo-host/` | 最小宿主示例 |

详见 [架构说明](docs/architecture.md) 与 [文档索引](docs/README.md)。

## 环境准备

```bash
git clone https://github.com/dengmeiluan/esquerystudio.git
cd esquerystudio

# 前端（Node 18+；产物 git-ignored，构建时现生成）
cd ui && npm ci && cd ..

# 后端（JDK 8+；默认构建会在 generate-resources 阶段自动调 vite）
mvn clean test

```

要求：JDK 8+、Node 18+、Maven 3.6+。编辑器配置见 [.editorconfig](.editorconfig)。

## 提交前必须全绿

一条命令并行跑完全部门禁（构建 → 后端测试 / 前端分片 / typecheck / 权限扫描）：

```bash
node scripts/verify.mjs               # 本地全量（后端 fork 并行 + 前端分片并行）
node scripts/verify.mjs --server  # 发版前追加 server 构建与冒烟
```

也可以按需单跑：

```bash
cd ui && npm test             # 前端全量（自动分片；失败文件自动串行复验）
cd ui && npm run test:serial  # 前端串行基准（排障/确认并发伪失败）
node scripts/check-doc-links.mjs  # 文档相对链接
node scripts/check-browser-parity.mjs  # 纯前端 / 服务端能力对齐门
node scripts/check-mcp-parity.mjs      # 服务端 / 纯前端 / 文档 MCP 工具契约对齐门
mvn clean test -Dconsole.build.skip=true  # 后端全量（默认 4 fork；低核/CI 用 -DforkCount=N 覆盖）
mvn -P release -DskipTests -Dconsole.build.skip=true verify  # 发布档案：sources/javadoc/SBOM/可复现时间戳
```

## 纯前端对齐铁律

浏览器模式不是「另一套 UI」，而是同一套控制台的第二种 transport。任何新增页面、端点或动作，必须同时给出 `ui/src/platform/browserApi.ts` 的纯前端实现；只写服务端、等以后再补 **不接受**。

- `node scripts/check-browser-parity.mjs` 会扫描 `ui/src/api.ts`、后端 Controller 映射与页面契约，发现没有浏览器实现的端点直接失败。
- 确实无法在前端实现的少数能力，必须登记在 `ui/src/utils/browserUnsupported.ts` 的 `BROWSER_SERVER_ONLY_ENDPOINTS`，逐项写明原因，并在对应页面显示真实边界，不能静默 501 或假装成功。
- 数据可以有界有损（如跨实例锁、代码 provider），但交互与状态必须一致：同一按钮、同一流程、同一错误/空态语言。
- 新增或修改浏览器模式能力时，同时更新 `docs/browser-mode.md` 的边界表与验证命令。

> 发布档案绑定固定 `project.build.outputTimestamp`：同一源码重复 `package` 的
> `platform` / `console` / `server` jar SHA-256 必须一致。改动构建插件或资源打包后
> 请本地复跑一次哈希对照，避免把不可复现的变更带进 release。

> 并发不是无脑加线程：前端仍保持 `fileParallelism:false`（242 批的稳定性决定），
> 并发度来自进程级分片；分片内 20s 超时只吸收并发慢时钟，失败文件会在全部分片退出后
> 用原始 5s 串行基准复验，复验通过会明确标注，不会静默放行。
> 后端用 Surefire `forkCount`（独立 JVM）而非同 JVM 多线程，避免测试静态状态串扰。
> 实测（28 核）：前端串行 15–17min → 8 分片 5.2min；后端 clean 串行 74s → 4 fork 30s；
> 统一门禁（构建 + typecheck + 权限扫描 + 后端 + 前端）5.9min。
> 分片数用 `VITEST_SHARDS` 或 `--shards=N` 覆盖；`--serial` 可随时退回串行基准。
> CI 前端为 8 路 matrix，每个作业只跑一个分片（`--only-shard=i/8`）；本地 `npm test`
> 仍是一个进程编排 8 分片。矩阵是 CI 墙钟优化，不改变测试语义。
> 共享工作区里若还有并行 vite/dev server、视觉测试或 chrome-headless 在跑，全量会被
> 外部进程拖慢，并可能让挂载用例触发慢时钟超时；跑本地门禁前先停掉这些进程，
> 或直接以 CI 矩阵结果为准。

> 后端测试里有若干**源码契约锁**（readFileSync 读源码/文档断言形态），
> 改包名、改文件路径、改文档结构时它们会红——红即提醒你随迁锁面，不是环境问题。

## TDD 纪律（Iron Law）

- **bug 先写复现测试，看它红，再修到绿**——没有复现测试的修复不接受。
- 新功能测试先行；重构前后测试必须同绿。
- 前端新能力配 `*.spec.ts`；后端新能力配 JUnit 用例。守卫类 spec（如键盘可达、
  死代码清扫、文档契约）是本项目的骨架，随刀随迁，永不删除断言了事。

## 代码与设计约定

- **Java 8 语法基线**：不用 `String.isBlank()`/`Map.of()`/var 等 9+ API。
- **ES 栈 provided 契约不可破**：不要把 `spring-boot-starter-data-elasticsearch`
  或 RHLC 改回 `compile`——版本裁决权必须留在宿主（README「ES 栈契约」节）。
- **库 jar 不可 repackage**：`spring-boot-maven-plugin` 的 `<skip>true</skip>` 不可删
  （删了打出 fat jar，宿主引不到任何类）。
- **前端设计语言**：扁平、克制、信息密度优先；间距走 `--sp` 阶梯、语义色走 token、
  禁私造第五种字号。新页面先过「扁平化自查」再加样式。
- **纯视觉重构不引入新高度反例**：改布局前后页面总高必须恒定。

## 提交规范

- 提交信息一句话说清「改了什么、为什么」；一个提交一个主题。
- 构建产物（`modules/console/src/main/resources/static/esquerystudio/`）、IDE 文件、本地日志不入库（`.gitignore` 已拦）。
- 文档现在时、无时间线、无占位符（`TODO`/`TBD`/`待补充` 会被文档契约测试拦截）。
- 提交即表示你同意以 [Apache-2.0](LICENSE) 许可贡献该代码；不要提交来源不明或带专有许可的代码。
- 涉及安全问题的修复请先看 [SECURITY.md](SECURITY.md)，不要公开披露可利用细节。

## 社区

- [行为准则](CODE_OF_CONDUCT.md) · [治理与决策](GOVERNANCE.md) · [支持渠道](SUPPORT.md)
- [文档索引](docs/README.md) · [架构说明](docs/architecture.md) · [设计宪法](docs/design.md)

## 报告问题

提 issue 时请附：ESQueryStudio / Spring Boot / ES 服务端与客户端版本、部署模式、复现步骤、
期望与实际行为、相关日志（`[EsStackContract]`/`[MappingReconcile]`/rebuild 前缀）。
**不要贴凭据或客户数据。** 安全问题请走
[GitHub Security 页面](https://github.com/dengmeiluan/esquerystudio/security)（Report a vulnerability），
不要开 public issue。
