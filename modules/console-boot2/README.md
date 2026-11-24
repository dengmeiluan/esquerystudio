# esquerystudio-console-boot2

Spring Boot 2.7 / Java 17 宿主适配器。它不是旧 6.x/7.x 产物：与 Boot 3/4 共用
`esquerystudio-es-rest` + `esquerystudio-boot-support`，只保留 Boot 2 的启动壳与依赖版本。

## 统一核心

- `boot-support` 按 Spring 5.3 编译；同一份字节码在 Boot 2.7 / 3.5 / 4.2 运行时均通过。
- ES 6.7–9.x 走同一条现代请求路径：
  - 健康：`GET /`
  - 搜索：`POST /{index}/_search`
  - SQL：`POST /_sql`，400/404 时通用回退 `/_xpack/sql`（ES 6.7），不写版本分支
- 不复制 Vue 源码；静态资源来自 `modules/console-ui/src/main/resources/static`。

## 运行

```bash
export JAVA_HOME=/path/to/jdk-17
./mvnw -Pboot2 -pl modules/console-boot2 -am spring-boot:run
```

默认端口 `5602`，连接 `http://localhost:9200`；可用 `ESQ_ES_URL` / `ESQ_ES_USERNAME` /
`ESQ_ES_PASSWORD` 覆盖。

## 验证

```bash
export JAVA_HOME=/path/to/jdk-17
./mvnw -Pboot2 -pl modules/console-boot2 -am test
```

覆盖：健康版本（8.18.1）、UI 壳、DSL 搜索、现代 `_sql`、以及 ES 6.7 `_xpack/sql` 回退（6/6）。

CI：`.github/workflows/boot2.yml`。
