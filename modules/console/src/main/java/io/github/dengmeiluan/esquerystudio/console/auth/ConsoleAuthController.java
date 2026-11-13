/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.esquerystudio.console.auth;
import io.github.dengmeiluan.esquerystudio.platform.pages.ConsolePageCatalog;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * (内部) ES 控制台鉴权端点（登录 / 自助 / 用户管理 / 操作审计流水。
 *
 * <p>仅在使用内置 {@link BuiltinConsoleAuthService} 时装配；宿主用自己的
 * {@link EsConsoleAuthorizer} 替换后，登录发生在宿主体系里，本控制器不再出现。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/auth")
public class ConsoleAuthController {

    private static final Logger LOG = LoggerFactory.getLogger(ConsoleAuthController.class);

    private final BuiltinConsoleAuthService authService;
    private final ConsoleOpsAuditStore opsAuditStore;
    private final boolean pageAuthEnabled;
    /** 委托未上报 exp 时的拒绝表兜底 TTL（24h，覆盖常见宿主会话签发策略）。 */
    static final long DELEGATE_REVOKE_FALLBACK_MS = 24L * 60L * 60L * 1000L;
    /** 登录失败节流（按用户名+来源 IP 的失败窗口与临时拒绝）。 */
    private final ConsoleLoginThrottle loginThrottle = new ConsoleLoginThrottle();
    /** 审计行连接隔离的目录源；单测手工构造时可为 null（无连接模型语义）。 */
    private io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore connStore;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setConnStore(io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore connStore) {
        this.connStore = connStore;
    }
    /** env 页面模板（连接环境级页面收缩）；单测/自定义部署可为 null。 */
    private EnvPagesResolver envPagesResolver;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setEnvPagesResolver(EnvPagesResolver envPagesResolver) {
        this.envPagesResolver = envPagesResolver;
    }
    /** 页面契约全量载荷（组→页），构造期预建；前端 Forbidden 页取名 / 运行时对账用。 */
    private final Map<String, Object> pagesPayload;

    /** 受信代理清单（与 header 委托同源）：登录节流/审计 IP 只认清单内直连方转发的地址。 */
    private final java.util.List<String> trustedProxies;

    /** 宿主鉴权委托（登出吊销用）：PropertiesAuthDelegate 实现 jwt/endpoint 的本地拒绝表。 */
    private List<ConsoleAuthDelegate> authDelegates = Collections.emptyList();

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setAuthDelegates(ObjectProvider<ConsoleAuthDelegate> delegates) {
        List<ConsoleAuthDelegate> list = new ArrayList<>();
        delegates.forEach(list::add);
        this.authDelegates = list;
    }

    public ConsoleAuthController(BuiltinConsoleAuthService authService, ConsoleOpsAuditStore opsAuditStore,
                                 ConsolePageCatalog pageCatalog, boolean pageAuthEnabled) {
        this(authService, opsAuditStore, pageCatalog, pageAuthEnabled, java.util.Collections.emptyList());
    }

    /**
     * @param trustedProxies 受信代理清单（与 header 委托同源）：非空时登录节流的 IP 维度
     *                       只采信清单内直连方转发的地址，避免「换伪造 XFF 即换配额」。
     */
    public ConsoleAuthController(BuiltinConsoleAuthService authService, ConsoleOpsAuditStore opsAuditStore,
                                 ConsolePageCatalog pageCatalog, boolean pageAuthEnabled,
                                 java.util.List<String> trustedProxies) {
        this.authService = authService;
        this.opsAuditStore = opsAuditStore;
        this.pageAuthEnabled = pageAuthEnabled;
        this.pagesPayload = buildPagesPayload(pageCatalog);
        this.trustedProxies = trustedProxies == null
                ? java.util.Collections.emptyList() : trustedProxies;
    }

    /** 页面契约 → me 响应载荷（apiPrefixes 随契约下发：前端用同一份数据镜像 pageOf 定端点归属；hotkey/icon 前端走构建期 JSON）。 */
    static Map<String, Object> buildPagesPayload(ConsolePageCatalog catalog) {
        List<Map<String, Object>> groups = new ArrayList<>();
        for (ConsolePageCatalog.Group g : catalog.getGroups()) {
            Map<String, Object> gm = new LinkedHashMap<>();
            gm.put("id", g.getId());
            gm.put("name", g.getName());
            gm.put("sort", g.getSort());
            List<Map<String, Object>> ps = new ArrayList<>();
            for (ConsolePageCatalog.Page p : catalog.pagesOf(g.getId())) {
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("key", p.getKey());
                pm.put("name", p.getName());
                pm.put("route", p.getRoute());
                pm.put("minVer", p.getMinVer());
                pm.put("apiPrefixes", p.getApiPrefixes());
                ps.add(Collections.unmodifiableMap(pm));
            }
            gm.put("pages", Collections.unmodifiableList(ps));
            groups.add(Collections.unmodifiableMap(gm));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("groups", Collections.unmodifiableList(groups));
        return Collections.unmodifiableMap(out);
    }

    /** 登录（免鉴权白名单）。凭证错误回 401 结构化 code。：登录审计带来源 IP。
     *  同一用户名+IP 的失败在窗口内触顶后临时拒绝（429 LOGIN_THROTTLED），防在线爆破兜底账号。 */
    @PostMapping("login")
    public Map<String, Object> login(@RequestBody Map<String, String> body,
                                     HttpServletRequest request,
                                     javax.servlet.http.HttpServletResponse response) throws IOException {
        String username = body.get("username");
        String ip = clientIp(request);
        /* 委托部署默认关闭本地登录：明确回 403 而不是 401 密码错误，
           否则运维会一直以为是自己密码敲错了（实为身份必须来自宿主）。 */
        if (!authService.isLoginEnabled()) {
            response.setStatus(403);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("code", "BUILTIN_LOGIN_DISABLED");
            err.put("message", "本部署已启用宿主统一登录，控制台本地账号登录已关闭；请从宿主系统进入控制台");
            return err;
        }
        /* 出厂默认口令（admin/esquerystudio）是公开已知凭据：空用户库时只允许本机登录。
           否则任何能访问 /auth/login 的人都能直接拿到 ADMIN，再「首登改密」把真管理员锁在门外。
           远程部署请显式配置 esquerystudio.elasticsearch.console.auth.fallback-password（强口令），
           或先在本机建好首个账号——有权限的运维能力不受影响。 */
        if (authService.usesFactoryDefaultCredential() && !isLoopbackRequest(request)
                && !hasAnyUserQuietly()) {
            response.setStatus(403);
            opsAuditStore.record(ConsoleOpsAuditEvent.builder()
                    .username(clipAuditName(username)).role("-")
                    .method("POST").uri("/internal/es/index/auth/login")
                    .action("LOGIN_DENIED").httpStatus(403)
                    .detail("factory-default-password remote=" + ip)
                    .ip(ip)
                    .build());
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("code", "DEFAULT_PASSWORD_LOCAL_ONLY");
            err.put("message", "兜底账号仍使用出厂默认口令，仅允许服务器本机（loopback）登录。"
                    + "请在本机登录后立即改密，或配置 esquerystudio.elasticsearch.console.auth.fallback-password 为强口令"
                    + "（也可在首个账号建好后关闭 builtin-login-enabled）");
            return err;
        }
        long lockMs = loginThrottle.remainingLockMs(username, ip);
        if (lockMs > 0) {
            response.setStatus(429);
            long minutes = (lockMs + 59_999) / 60_000;
            opsAuditStore.record(ConsoleOpsAuditEvent.builder()
                    .username(clipAuditName(username)).role("-")
                    .method("POST").uri("/internal/es/index/auth/login")
                    .action("LOGIN_THROTTLED").httpStatus(429)
                    .ip(ip)
                    .build());
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("code", "LOGIN_THROTTLED");
            err.put("message", "登录失败次数过多，请约 " + minutes + " 分钟后再试");
            return err;
        }
        Map<String, Object> result = authService.login(username, body.get("password"));
        if (result == null) {
            loginThrottle.recordFailure(username, ip);
            response.setStatus(401);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("code", "BAD_CREDENTIALS");
            err.put("message", "用户名或密码错误");
            opsAuditStore.record(ConsoleOpsAuditEvent.builder()
                    .username(clipAuditName(username)).role("-")
                    .method("POST").uri("/internal/es/index/auth/login")
                    .action("LOGIN_FAIL").httpStatus(401)
                    .ip(ip)
                    .build());
            return err;
        }
        loginThrottle.recordSuccess(username, ip);
        opsAuditStore.record(ConsoleOpsAuditEvent.builder()
                .username(clipAuditName(String.valueOf(result.get("username"))))
                .role(String.valueOf(result.get("role")))
                .method("POST").uri("/internal/es/index/auth/login")
                .action("LOGIN").httpStatus(200)
                .detail(Boolean.TRUE.equals(result.get("fallback")) ? "fallback 默认账号登录" : null)
                .ip(ip)
                .build());
        return result;
    }

    /** 登出：无状态 token 的服务端吊销——TTL 内的被盗 token 立即失效，而非只清客户端本地。
     *  拦截器已验过有效身份才可达；token 未生效（重复登出等）同样返回 ok（登出幂等）。 */
    @PostMapping("logout")
    public Map<String, Object> logout(HttpServletRequest request) {
        String token = request.getHeader(BuiltinConsoleAuthService.TOKEN_HEADER);
        if (token == null || token.isEmpty()) {
            String auth = request.getHeader("Authorization");
            if (auth != null && auth.startsWith("Bearer ")) {
                token = auth.substring(7);
            }
        }
        boolean revoked = authService.revokeToken(token);
        /* 委托令牌（jwt/endpoint）的本地吊销：宿主签发无法真正撤销，但本实例可以拒绝
           「已在本控制台退出」的令牌，避免登出只清 localStorage、被复制令牌继续可用。
           必须用委托自己的令牌头（X-Es-Host-Token 等）——拿内置 token 去调 revoke
           只会登记一个不相关的指纹，托管登录的退出实际从未生效。
           自定义委托（宿主内嵌委托）只实现 tokenOf、不实现 revoke：此前登出回 200 但令牌
           在 TTL 内继续可用（产线实测）。委托报出令牌而自己没登记时，由内核按保守 TTL
           兜底登记——「退出后同一令牌必须失效」不能依赖每个宿主实现自觉。 */
        boolean delegatedRevoked = false;
        for (ConsoleAuthDelegate d : authDelegates) {
            try {
                String delegatedToken = d.tokenOf(request);
                if (delegatedToken == null || delegatedToken.isEmpty()) continue;
                boolean revokedByDelegate;
                try {
                    revokedByDelegate = d.revoke(delegatedToken);
                } catch (Exception revokeFailed) {
                    LOG.warn("[esquerystudio-auth] 委托 revoke 异常，改由内核拒绝表兜底: {}",
                            revokeFailed.getMessage(), revokeFailed);
                    revokedByDelegate = false;
                }
                if (!revokedByDelegate) {
                    /* 拿不到宿主 exp 时的保守上界：宿主会话通常 ≤ 12h，24h 足够覆盖
                       常见签发策略，又不会让拒绝表无限驻留。 */
                    long until = System.currentTimeMillis()
                            + Math.max(authService.getTokenTtlMs(), DELEGATE_REVOKE_FALLBACK_MS);
                    revokedByDelegate = DelegatedTokenRevocations.revoke(delegatedToken, until);
                }
                if (revokedByDelegate) delegatedRevoked = true;
            } catch (Exception e) {
                /* 委托实现异常不得让登出失败（拒绝/放行决策已由清本地 + 内置吊销完成） */
                LOG.warn("[esquerystudio-auth] 委托令牌登出吊销失败（忽略，登出仍成功）: {}", e.getMessage(), e);
            }
        }
        Object p = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (p instanceof ConsolePrincipal) {
            ConsolePrincipal principal = (ConsolePrincipal) p;
            opsAuditStore.record(ConsoleOpsAuditEvent.builder()
                    .username(principal.getUsername()).role(principal.getRole().name())
                    .method("POST").uri("/internal/es/index/auth/logout")
                    .action("LOGOUT").httpStatus(200)
                    .ip(clientIp(request))
                    .build());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("revoked", revoked || delegatedRevoked);
        return out;
    }

    /** 失败登录的用户名是攻击者可控串：钳制后入审计，防长串撑爆审计索引/污染合规流水
     （与 JDBC 档列宽同量级）；此前 role 误占 displayName 位，人名列显示 "ADMIN" 属字段错位。
     同时清洗 CR/LF 与控制符——审计落档与日志两用，防伪造日志行。 */
    private static String clipAuditName(String raw) {
        if (raw == null) return null;
        String s = raw.replaceAll("[\\r\\n\\t\\p{Cntrl}]", " ").trim();
        return s.length() > 128 ? s.substring(0, 128) : s;
    }

    /** 来源地址（与拦截器同一实现：仅受信代理才信转发头，防伪造审计 IP 与换 IP 绕节流）。 */
    private String clientIp(HttpServletRequest request) {
        return ConsoleAuthInterceptor.clientIp(request, trustedProxies);
    }

    /** 是否服务器本机直连（出厂默认口令的唯一放行面；代理转发的请求 remoteAddr 是代理，不算）。 */
    static boolean isLoopbackRequest(HttpServletRequest request) {
        String addr = request == null ? null : request.getRemoteAddr();
        if (addr == null) return false;
        String a = addr.trim().toLowerCase(java.util.Locale.ROOT);
        if (a.startsWith("::ffff:")) a = a.substring(7);
        return "::1".equals(a) || "0:0:0:0:0:0:0:1".equals(a) || a.startsWith("127.");
    }

    /** 用户库是否已有账号；IO 失败按「有账号」处理（默认口令分支只在确定空库时收紧）。 */
    private boolean hasAnyUserQuietly() {
        try {
            return authService.hasAnyUser();
        } catch (IOException e) {
            return true;
        }
    }

    /** 当前身份（前端启动时探测 token 是否仍有效）。 */
    @GetMapping("me")
    public Map<String, Object> me(HttpServletRequest request) throws IOException {
        ConsolePrincipal p = (ConsolePrincipal) request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("username", p.getUsername());
        out.put("role", p.getRole().name());
        out.put("fallback", p.isFallback());
        out.put("delegated", p.isDelegated());
        // 身份档案位——人名 + 来源 + 宿主扩展属性，顶栏身份卡产品化的数据源
        out.put("displayName", p.getDisplayName());
        out.put("authSource", p.isDelegated() ? "delegate" : "builtin");
        // 2.5.0 菜单 SPI：页面白名单三态下发（null=不启用；空列表=全拒，不得折叠成 null）+ 契约全量
        out.put("grantedPages", pageAuthEnabled && p.getGrantedPages() != null
                ? new ArrayList<>(new TreeSet<>(p.getGrantedPages())) : null);
        // 契约非秘密，无条件下发——逃生阀只关授权判定与 grantedPages，不关 Forbidden 取名数据源
        out.put("pages", pagesPayload);
        /* 环境页面模板（env → 页面 key 集）随身份下发：前端菜单/按钮必须与后端
           EnvPagesResolver 同口径收缩，否则会出现「菜单可见、点了 403」的假入口。
           仅下发页面 key（配置策略，非账号/凭据）；未配置/非委托模型不下发。 */
        if (pageAuthEnabled && p.getGrantedPages() != null
                && envPagesResolver != null) {
            java.util.Map<String, java.util.Set<String>> envPages =
                    envPagesResolver.configuredTemplates();
            if (!envPages.isEmpty()) {
                java.util.Map<String, Object> payload = new LinkedHashMap<>();
                for (java.util.Map.Entry<String, java.util.Set<String>> e : envPages.entrySet()) {
                    payload.put(e.getKey(), new ArrayList<>(new java.util.TreeSet<>(e.getValue())));
                }
                out.put("envPages", payload);
            }
        }
        if (!p.getAttributes().isEmpty()) {
            out.put("attributes", p.getAttributes());
        }
        out.put("hasAnyUser", authService.hasAnyUser());
        return out;
    }

    /** 改自己的密码（兜底账号改密 = 建立首个真实账号；宿主委托身份无内置密码可改）。 */
    @PostMapping("change-password")
    public Map<String, Object> changePassword(HttpServletRequest request,
                                              javax.servlet.http.HttpServletResponse response,
                                              @RequestBody Map<String, String> body) throws IOException {
        ConsolePrincipal p = (ConsolePrincipal) request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (p.isDelegated()) {
            // 委托身份由宿主体系管理凭证，控制台无密码可改
            response.setStatus(400);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("code", "DELEGATED");
            err.put("message", "当前身份由宿主系统委托鉴权，请在宿主系统修改密码");
            return err;
        }
        authService.changePassword(p, body.get("oldPassword"), body.get("newPassword"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("relogin", p.isFallback());
        return out;
    }

    /** 用户写操作不再接受缺 principal：拦截器被绕过/关闭时 fail-closed，防匿名建 ADMIN。 */
    private static ConsolePrincipal requirePrincipal(HttpServletRequest request) {
        Object p = request == null ? null : request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (!(p instanceof ConsolePrincipal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录 ES 控制台");
        }
        return (ConsolePrincipal) p;
    }

    /* ------------------------------- 用户管理（ADMIN，拦截器已卡） ------------------------------- */

    /** 用户列表。 */
    @GetMapping("users")
    public List<Map<String, Object>> listUsers() throws IOException {
        return authService.listUsers();
    }

    /** 新建/更新用户。body: {username, password?, role}。 */
    @PostMapping("users/upsert")
    public Map<String, Object> upsertUser(HttpServletRequest request,
                                          @RequestBody Map<String, String> body) throws IOException {
        ConsolePrincipal p = requirePrincipal(request);
        authService.upsertUser(p, body.get("username"), body.get("password"), ConsoleRole.parse(body.get("role")));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    /** 删除用户。 */
    @PostMapping("users/delete")
    public Map<String, Object> deleteUser(HttpServletRequest request, @RequestParam String username) throws IOException {
        ConsolePrincipal p = requirePrincipal(request);
        authService.deleteUser(username, p);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        return out;
    }

    /** 操作审计流水（倒序，支持 from 分页）。：线缆 {records:[...]}——
     *  旧「ES search 响应形态直通」的契约泄漏在此单点终结，记录键即 {@link ConsoleOpsAuditEvent} 维度全集。
     *  20260922 快筛批：全维筛选下推（时间范围/集群/角色/方法/HTTP/来源/IP/耗时阈值/URI 前缀/关键词），
     *  旧 since 参数保持兼容（fromMs 未传时落 since）。 */
    @GetMapping("ops-audit")
    public Map<String, Object> opsAudit(HttpServletRequest request,
                                        @RequestParam(required = false) String username,
                                        @RequestParam(required = false) String action,
                                        @RequestParam(required = false, defaultValue = "100") int size,
                                        @RequestParam(required = false, defaultValue = "0") int from,
                                        @RequestParam(required = false) Long since,
                                        @RequestParam(required = false) Long fromMs,
                                        @RequestParam(required = false) Long toMs,
                                        @RequestParam(required = false) String connId,
                                        @RequestParam(required = false) String connName,
                                        @RequestParam(required = false) String role,
                                        @RequestParam(required = false) String method,
                                        @RequestParam(required = false) Integer httpStatus,
                                        @RequestParam(required = false) String source,
                                        @RequestParam(required = false) String ip,
                                        @RequestParam(required = false) Long minCostMs,
                                        @RequestParam(required = false) String uriPrefix,
                                        @RequestParam(required = false) String kw) {
        /* 时间范围下推；20260922：全维结构化查询对象 */
        List<ConsoleOpsAuditEvent> records = opsAuditStore.search(ConsoleOpsAuditQuery.builder()
                .username(username).action(action)
                .fromMs(fromMs != null ? fromMs : since).toMs(toMs)
                .connId(connId).connName(connName).role(role).method(method)
                .httpStatus(httpStatus).source(source).ip(ip).minCostMs(minCostMs)
                .uriPrefix(uriPrefix).kw(kw)
                .size(size).from(from)
                .build());
        Object p = request == null ? null : request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        /* security 页读键可只授权到单个连接：行级按 ConsoleConnVisibility 收口，
           与连接目录/监控/权限面板同口径；ADMIN/全局静态页授权保持全量。 */
        return wire(ConsoleAuditVisibility.filter(records,
                p instanceof ConsolePrincipal ? (ConsolePrincipal) p : null, connStore));
    }

    /** 自助操作流水——任何已认证身份（VIEWER+，拦截器已放行）查「自己的」操作。
        username 强制取服务端身份，请求参数不可注入——越权看他人流水在结构上不可能；
        非审计角色（非 AUDIT_OP/ADMIN）无法进安全中心全量表，这里给「我做了什么」的最小回溯。
        20260922 快筛批：自助安全子集=时间范围/动作/方法/HTTP/耗时阈值/URI 前缀/关键词。 */
    @GetMapping("ops-audit/mine")
    public Map<String, Object> opsAuditMine(HttpServletRequest request,
                                            @RequestParam(required = false) String action,
                                            @RequestParam(required = false, defaultValue = "50") int size,
                                            @RequestParam(required = false, defaultValue = "0") int from,
                                            @RequestParam(required = false) Long since,
                                            @RequestParam(required = false) Long fromMs,
                                            @RequestParam(required = false) Long toMs,
                                            @RequestParam(required = false) String method,
                                            @RequestParam(required = false) Integer httpStatus,
                                            @RequestParam(required = false) Long minCostMs,
                                            @RequestParam(required = false) String uriPrefix,
                                            @RequestParam(required = false) String kw,
                                            @RequestParam(required = false) String connName) {
        ConsolePrincipal p = (ConsolePrincipal) request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return wire(opsAuditStore.search(ConsoleOpsAuditQuery.builder()
                .username(p.getUsername()).action(action).connName(connName)
                .fromMs(fromMs != null ? fromMs : since).toMs(toMs)
                .method(method).httpStatus(httpStatus).minCostMs(minCostMs)
                .uriPrefix(uriPrefix).kw(kw)
                .size(size).from(from)
                .build()));
    }

    /** 类型化记录 → 线缆载荷（扁平键，与 {@link ConsoleOpsAuditEvent} 维度一一对应；null 省略）。 */
    private static Map<String, Object> wire(List<ConsoleOpsAuditEvent> records) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (ConsoleOpsAuditEvent e : records) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("timestamp", e.getTimestamp());
            r.put("username", e.getUsername());
            if (e.getDisplayName() != null) {
                r.put("displayName", e.getDisplayName());
            }
            r.put("role", e.getRole());
            r.put("method", e.getMethod());
            r.put("uri", e.getUri());
            r.put("action", e.getAction());
            r.put("httpStatus", e.getHttpStatus());
            if (e.getDetail() != null) {
                r.put("detail", e.getDetail());
            }
            if (e.getConnId() != null) {
                r.put("connId", e.getConnId());
            }
            if (e.getConnName() != null) {
                r.put("connName", e.getConnName());
            }
            if (e.getIp() != null) {
                r.put("ip", e.getIp());
            }
            if (e.getCostMs() != null) {
                r.put("costMs", e.getCostMs());
            }
            r.put("source", e.getSource() == null ? "console" : e.getSource());
            rows.add(Collections.unmodifiableMap(r));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", Collections.unmodifiableList(rows));
        return Collections.unmodifiableMap(out);
    }
}
