# esquerystudio-server

ESQueryStudio 的独立部署形态：一个可启动 jar，自带 Web 服务器与 Elasticsearch 客户端栈，
不需要宿主应用。Kibana 式交付，但面向的是搜索运维与索引生命周期。

## 构建

在仓库根（reactor）构建即可，不需要单独 install：

```bash
./mvnw clean package
# 产物：apps/server/target/esquerystudio-server-1.0.0.jar
```

`ServerPomContractTest`（保留历史类名）守卫 server 模块的可执行 jar 纪律：
repackage 永远生效，`esquerystudio-console` 依赖版本由 reactor 统一。

## 运行

```bash
java -jar apps/server/target/esquerystudio-server-1.0.0.jar
```

| 面 | 位置 |
|---|---|
| 控制台入口 | `http://localhost:5601/esquerystudio.html` |
| 首连向导 | 未绑定控制集群时自动出现（`/internal/es/index/setup/status` 报 `bound:false`） |
| 控制集群档案 | `~/.esquerystudio/esquerystudio-server/`（重启仍在） |
| 默认登录 | `admin` / `esquerystudio`——仅在用户索引为空时有效，创建真实账号后自动失效 |
| 端口 | `--server.port=...`（默认 `5601`） |

### 首次启动顺序

1. 启动 jar 并打开控制台；Setup 向导要求填写控制集群（未绑定时登录会以
   `SETUP_REQUIRED` 拒绝，因此首连不需要任何账号）。
2. 完成向导，控制集群档案落到本地。
3. 用默认凭据登录并创建自己的账号（创建任意用户后兜底账号失效）。

> **要暴露到 localhost 之外？** 先创建真实账号，或在 jar 前放自己的网关鉴权。
> 完整键表见 [docs/integration/configuration-reference.md](../../docs/integration/configuration-reference.md)。

## 与嵌入式形态的关系

`esquerystudio-server` 只做「启动 + 自带运行时栈」，全部能力来自 `esquerystudio-console`
（传递 `esquerystudio-platform`）。宿主应用不需要 server 模块，直接依赖
`esquerystudio-console` 即可。
