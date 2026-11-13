/* 2.6.5 接入文档（顶栏抽屉展示）：内容是数据不是模板——6 节覆盖接入全路径，
 版本号从 __STARTER_VERSION__（vite define 构建期注入，见 ）单点拼装，
 升版本只改 pom，文档自动跟随。宿主侧代码片段按 宿主形态给出，接入方复制改包名即可。 */

export interface GuideSection {
  id: string;
  title: string;
  body: string;
}

/** starter 当前版本（构建期注入；vitest 同样经 define 注入，见 vitest.config.ts） */
export const STARTER_VERSION: string = __STARTER_VERSION__;

/** Maven 坐标单点拼装——所有节的坐标引用统一走这里 */
export function mavenCoordinate(): string {
  return 'io.github.dengmeiluan:esquerystudio-console:' + STARTER_VERSION;
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'integration',
    title: '0. Mapping 集成文档索引',
    body: `业务应用（client）与 宿主 运维入口：

  docs/integration/README.md
  docs/integration/quickstart.md
  docs/integration/configuration-reference.md
  docs/integration/troubleshooting.md
  docs/integration/mapping-auto-register.md
  docs/integration/entity-mapping.md
  docs/integration/desired-state.md
  docs/integration/mapping-conflict-to-adhoc.md

client 默认配置：
  esquerystudio.elasticsearch.mode: client
  esquerystudio.elasticsearch.mapping.auto-register: startup
  esquerystudio.elasticsearch.mapping.conflict-policy: fail
  esquerystudio.elasticsearch.mapping.missing-index-policy: skip

期望配置页：/internal/es/index/desired-state.html
启动日志检索：MappingReconcile
冲突策略键：conflict-policy
冲突操作：USE_ADHOC_REBUILD`,
  },
  {
    id: 'maven',
    title: '1. 引入 Maven 依赖',
    body: `在宿主工程 pom.xml 中加入：

<dependency>
  <groupId>io.github.dengmeiluan</groupId>
  <artifactId>esquerystudio-console</artifactId>
  <version>${STARTER_VERSION}</version>
</dependency>

坐标：${mavenCoordinate()}

注意：宿主若自带 ES 客户端栈，版本决定权在宿主（starter 侧 ES 依赖为 provided）。
目标集群 ES 7.10 时建议钉住 <elasticsearch.version>7.10.2</elasticsearch.version>，
否则 Spring Boot 默认仲裁到 7.17.x 与服务端存在兼容风险。`,
  },
  {
    id: 'static-page',
    title: '2. 静态页接入（免登录直达）',
    body: `控制台自带统一入口（无需前端工程即可用）：

  /esquerystudio.html   —— ESQueryStudio 控制台（自动进入 /esquerystudio/index.html）

宿主 Security 只需放行静态资源与 API 前缀，鉴权由 starter 的 ConsoleAuthInterceptor 完成：

  .antMatchers("/internal/es/**").permitAll()
  .antMatchers("/esquerystudio.html", "/esquerystudio/**").permitAll()

默认开启内置 token 鉴权（兜底账号 admin），可通过 esquerystudio.elasticsearch.console.auth.enabled=false 关闭。`,
  },
  {
    id: 'iframe',
    title: '3. iframe 嵌入与鉴权委托',
    body: `嵌入宿主页面后，可实现「宿主登录态直通控制台、免二次登录」：

① 宿主后端实现 io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthDelegate 并注册为 Spring Bean：
   - 从请求头 X-Es-Host-Token 读宿主凭证，认出则返回 ConsolePrincipal（含角色映射）
   - 认不出返回 null，自动交回控制台内置 token 鉴权（不视为失败）

② 宿主前端在 iframe 就绪握手后下发凭证（**禁止用 '\*' 作为 targetOrigin**：
   iframe 一旦被导航/替换，宿主 JWT 会被交给任意源）：
   const CONSOLE_ORIGIN = 'https://console.example.com'; // 控制台真实 origin
   window.addEventListener('message', (e) => {
     if (e.origin !== CONSOLE_ORIGIN) return;
     if (e.source !== iframe.contentWindow) return;
     if (e.data?.type === 'esquerystudio-ready') {
       iframe.contentWindow.postMessage(
         { type: 'esquerystudio-host-token', token: <宿主JWT> }, CONSOLE_ORIGIN);
     }
   });

③ 凭证变化（重新登录）时重发同一消息即可，控制台会重新探测身份；宿主登出时发
   { type: 'esquerystudio-host-token', token: '' }，控制台会立即清理上一账号工作现场。`,
  },
  {
    id: 'auth',
    title: '4. 角色与页面级权限（菜单 SPI）',
    body: `控制台两级权限（前端菜单/按钮与后端拦截器同源，越不过前端也拦得住）：

角色级（内置）：VIEWER 只读 / OPERATOR 普通写 / 专项 rank3（REBUILD_OP、CLUSTER_OP、
AUDIT_OP 同 rank）/ ADMIN 全部 + 用户管理 + raw 透传。委托鉴权时随 ConsolePrincipal 下发。

页面级（菜单 SPI）：宿主按 52 个功能页 × 连接 × 读/写授权。ConsolePrincipal 第 7 参 grantedPages：
  null                 —— 不启用页面级（全量放行，默认）
  空集合               —— 全拒（只看到 Forbidden 页）
  {page}               —— 静态全局页（对所有连接生效）
  conn:{id}:{page}     —— 该连接上该页可见（读）
  conn:{id}:w:{page}   —— 该连接上该页可写
页面 key 清单见 META-INF/esquerystudio-pages.json（契约是唯一真源：后端门、前端导航、宿主菜单三端共用）。

判定顺序（前端 auth.canEndpoint 逐步镜像，可复跑校验 npm run perm:scan）：
  ① 系统管理域（setup/rebind、/clusters 写）→ ADMIN
  ② ADMIN 全放行 → ③ 全量审计 rank3 → ④ 集群级动作 rank3 或 w:cluster-settings
  ⑤ 共享写端点（一个端点被多页合法复用）持任一真实使用方页写键 → ⑥ 页面门 →
  ⑦ 角色门；连接模型下「无页面归属且未登记共享写」的写端点默认拒绝（新增端点必须登记）

三条容易被忽略的边界：
  · 集群级动作（/cluster/ilm/start|stop、/cluster/reroute/retry-failed）作用于集群全局，
    连接模型下除页写键外还需 rank3 或该连接的 w:cluster-settings
  · /cluster/raw 与 /cluster/devtools/execute 共用透传内核：非 ADMIN 被收窄到数据面
    （检索/文档/bulk/UBQ/DBQ/SQL），但数据面内是全权——w:devtools 应按「数据面写权」评估
  · 非 ADMIN 的 PIT keep_alive 夹到 esquerystudio.elasticsearch.console.pit.max-keep-alive-minutes（默认 60）

跨站写（CSRF）一律拒绝：状态变更请求若由跨站页面发起（Sec-Fetch-Site: cross-site）返回
403 CSRF_BLOCKED 并落审计；iframe 嵌入与同站子域集成不受影响（iframe 内请求即 same-origin）。
委托 header 模式请配置 delegate.header.trusted-proxies——它同时约束身份采信、审计来源 IP
与登录节流（否则内网直连者可伪造 XFF、换 IP 绕过登录限流）。

逃生阀：esquerystudio.elasticsearch.console.page-auth.enabled=false 可整体关闭页面级拦截（回退纯角色档）。`,
  },
  {
    id: 'menu-spi',
    title: '5. 菜单注册与主题跟随（宿主侧对接）',
    body: `【菜单注册】starter classpath 提供 io.github.dengmeiluan.esquerystudio.platform.pages.ConsolePageCatalog，
宿主启动时直读契约注册菜单（13 目录 + 53 页面），perms 约定：
  ops:esquerystudio:conn:{connId}:{page}     读
  ops:esquerystudio:conn:{connId}:w:{page}   写

授权查询：从用户权限集合中筛上述前缀、剥前缀即 grantedPages（空集原样返回=全拒，
不得折叠成 null——null 语义是「不启用页面级」）。
参考实现（宿主形态，复制后改包名）：

  Set<String> granted = new LinkedHashSet<>();
  for (String p : permsOfUser) {
    if (p.startsWith("ops:esquerystudio:conn:")) {
      granted.add(p.substring("ops:esquerystudio:conn:".length()));  // 剥到 page / w:page
    }
  }
  return new ConsolePrincipal(username, role, false, true, nickname, attrs, granted);

自查：控制台顶栏「我的权限」调 /internal/es/index/auth/permissions，逐页回读/写与
writeDeny（PAGE_DENIED / WRITE_DENIED / CLUSTER_SCOPE_REQUIRED / HOST_DEST_WRITE_REQUIRED），
与真实执行门同序——排障时先看它，不要靠猜。

【主题跟随】iframe src 拼 ?hostTheme=dark|light 防首屏闪；
主题切换时 postMessage { type:'esquerystudio-host-theme', mode:'dark'|'light' } 热切。
用户也可在控制台顶栏手切主题档反超宿主（host 档才吃热推）。`,
  },
];
