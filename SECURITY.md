# 安全策略

## 数据与凭据边界

- ESQueryStudio 是**库与应用集合**：不持有、不存储任何 ES 凭据。连接凭据完全由宿主的
  `spring.data.elasticsearch.*` 与 `ElasticsearchRestClient` 配置供给，starter 只消费
  宿主容器里现成的 client bean。
- 运维控制台（`esquerystudio.elasticsearch.mode=console`）**自带鉴权是可选的**：默认 `client` 模式
  无 starter 级鉴权，依赖部署网络隔离。暴露到共享网络前，务必：
  - 实现 `ConsoleAuthDelegate` SPI 接入宿主账号体系（`mode=console` 下的审计/角色面）；
  - 或在网关层拦截 `/internal/es/**`。
- 控制台是静态单页 + 内部 JSON API，**不外发任何数据**；审计记录落宿主自己的 ES/数据库。
- 前端构建产物随 jar 分发，不含遥测、不含外链脚本。

## 报告漏洞

请勿公开 issue 披露可被利用的问题。通过 GitHub
[Security 页面](https://github.com/dengmeiluan/esquerystudio/security) 的
**Report a vulnerability** 私密报告；若该按钮尚未开放，请先在仓库 Discussions 联系维护者，
不要公开披露细节。预计 7 天内回应。报告时请附版本、部署模式、复现步骤和影响范围；
不要附加真实凭据或客户数据。

## 支持版本

| 版本 | 安全修复 |
|---|---|
| `1.x` | 支持，修复进入最新 patch |

## Chrome 扩展

- 扩展直接连接用户选择的 Elasticsearch 地址，不经过第三方服务；连接档案与凭据保存在本机扩展存储（`localStorage` 及供 service worker 使用的 `chrome.storage.local` 镜像），不会上传到任何服务端。删除连接档案时同步移除本机凭据。
- 浏览器模式的本机监控、审计与作业记录只写当前扩展 origin 的 IndexedDB/localStorage；它们是本机视图，不是跨实例合规审计账本。
- 扩展不提供第二套账号/角色模型：权限由 Elasticsearch 集群承担；REST 控制台可发起 reindex、tasks、snapshots 等管理操作，使用者接受风险。
- 安装包只从本仓库 Release 下载，并用 `SHA256SUMS` 校验；不要把扩展目录交给不可信来源二次打包。

## 已知取舍

- `ESQueryStudio` 的 HTTP 面以「部署在内网/受网关保护」为威胁模型：`/internal/es/**` 前缀
  表明这些端点不该裸露公网。`mode=console` 下请务必接入鉴权 SPI 或网关拦截。
- 控制台的数据面能力（文档 CRUD/DSL 查询/删除复活）等价于你授予 ES 账号的权限——
  最小权限原则请在 ES 侧落实，ESQueryStudio 不做第二套 ES 权限模型。
