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

package io.github.dengmeiluan.esquerystudio.console.control;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthDelegate;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestHighLevelClient;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 控制集群 Setup 端点（{@code /internal/es/index/setup}。
 *
 * <p>与 Kibana 首连体验对齐：宿主无 ES（NONE 模式）时前端弹首连向导，
 * 用户录入控制集群连接串 → test 探测 → apply 绑定（幂等初始化控制索引 + 本地自举档案）。</p>
 *
 * <p><b>防劫持</b>：{@code test}/{@code apply} 仅在未绑定时开放（绑定后 403 ALREADY_BOUND，
 * 即便控制集群暂时不可达也不重开——见 {@link ControlClusterResolver} 语义）；重绑走
 * {@code rebind}（常规鉴权 ADMIN 高危清单）。宿主注册了 {@link ConsoleAuthDelegate} 时，
 * apply 还要求委托认出的 ADMIN 身份（宿主 场景：绑定动作只有宿主管理员能做）。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/setup")
public class ConsoleSetupController {

    private final ControlClusterResolver resolver;
    private final RemoteEsClientFactory clientFactory;
    private final ConsoleOpsAuditStore opsAuditStore;
    private final ConsoleAuthDelegate delegate;
    private final String appName;
    private final boolean hostClusterVisible;
    /** 鉴权是否启用：前端据此区分「无鉴权部署 404」与代理/版本错配 404，避免写门误放开。 */
    private final boolean authEnabled;
    /** 是否提供内置账号登录（false=自定义授权器/宿主委托，前端不应展示本地账号表单）。 */
    private final boolean builtinLogin;
    /** 未绑定首连令牌；空=不启用（历史行为）。配置后 test/apply 必须携带 X-Setup-Token。 */
    private final String setupToken;

    public ConsoleSetupController(ControlClusterResolver resolver, RemoteEsClientFactory clientFactory,
                                  ConsoleOpsAuditStore opsAuditStore, ConsoleAuthDelegate delegate,
                                  String appName, boolean hostClusterVisible) {
        this(resolver, clientFactory, opsAuditStore, delegate, appName, hostClusterVisible, false, "");
    }

    public ConsoleSetupController(ControlClusterResolver resolver, RemoteEsClientFactory clientFactory,
                                  ConsoleOpsAuditStore opsAuditStore, ConsoleAuthDelegate delegate,
                                  String appName, boolean hostClusterVisible, boolean authEnabled) {
        this(resolver, clientFactory, opsAuditStore, delegate, appName, hostClusterVisible, authEnabled, "");
    }

    public ConsoleSetupController(ControlClusterResolver resolver, RemoteEsClientFactory clientFactory,
                                  ConsoleOpsAuditStore opsAuditStore, ConsoleAuthDelegate delegate,
                                  String appName, boolean hostClusterVisible, boolean authEnabled,
                                  String setupToken) {
        this(resolver, clientFactory, opsAuditStore, delegate, appName, hostClusterVisible,
                authEnabled, authEnabled, setupToken);
    }

    public ConsoleSetupController(ControlClusterResolver resolver, RemoteEsClientFactory clientFactory,
                                  ConsoleOpsAuditStore opsAuditStore, ConsoleAuthDelegate delegate,
                                  String appName, boolean hostClusterVisible, boolean authEnabled,
                                  boolean builtinLogin, String setupToken) {
        this.resolver = resolver;
        this.clientFactory = clientFactory;
        this.opsAuditStore = opsAuditStore;
        this.delegate = delegate;
        this.appName = appName;
        this.hostClusterVisible = hostClusterVisible;
        this.authEnabled = authEnabled;
        this.builtinLogin = builtinLogin;
        this.setupToken = setupToken == null ? "" : setupToken.trim();
    }

    /** 未绑定窗口的匿名防线：配置了 setup-token 且没有可鉴权的委托时，必须携带正确令牌。 */
    private boolean setupTokenConfigured() {
        return !setupToken.isEmpty();
    }

    private boolean setupTokenValid(HttpServletRequest request) {
        if (!setupTokenConfigured()) return true;
        return setupTokenMatches(setupToken, request == null ? null : request.getHeader("X-Setup-Token"));
    }

    /**
     * 未配置 setup-token 的匿名首连只允许本机：否则公网可达的未绑定控制台可被匿名
     * 指向攻击者 ES（SSRF + 用攻击者账号接管控制面）。配置令牌后远程可初始化。
     * request=null 是控制器直调/单测路径，保持内部兼容。
     */
    private boolean anonymousSetupSourceAllowed(HttpServletRequest request) {
        if (request == null) return true;
        if (setupTokenConfigured()) return true;
        /* 反向代理会把公网请求的 remoteAddr 变成回环；带转发头时不能仅凭回环判定本机。 */
        for (String h : new String[]{"X-Forwarded-For", "X-Real-IP", "Forwarded"}) {
            String v = request.getHeader(h);
            if (v != null && !v.trim().isEmpty()) return false;
        }
        String addr = request.getRemoteAddr();
        if (addr == null) return false;
        String a = addr.trim().toLowerCase(java.util.Locale.ROOT);
        return "127.0.0.1".equals(a) || "0:0:0:0:0:0:0:1".equals(a) || "::1".equals(a)
                || a.startsWith("127.");
    }

    private ResponseEntity<Map<String, Object>> localSetupOnly() {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("code", "SETUP_LOCAL_ONLY");
        b.put("message", "未配置 setup-token 时只允许本机完成初始化；远程初始化请配置 esquerystudio.elasticsearch.console.setup-token");
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(b);
    }

    /** 首连令牌常量时间比较；expected 为空=未启用（恒放行），provided 允许首尾空白。 */
    static boolean setupTokenMatches(String expected, String provided) {
        if (expected == null || expected.trim().isEmpty()) return true;
        if (provided == null || provided.trim().isEmpty()) return false;
        return java.security.MessageDigest.isEqual(
                expected.trim().getBytes(java.nio.charset.StandardCharsets.UTF_8),
                provided.trim().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private ResponseEntity<Map<String, Object>> setupTokenDenied() {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("code", "SETUP_TOKEN_REQUIRED");
        b.put("message", "初始化需要 X-Setup-Token（见 esquerystudio.elasticsearch.console.setup-token 配置）");
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(b);
    }

    /** 绑定状态（免鉴权：前端启动即查，决定是否弹向导）。 */
    @GetMapping("status")
    public Map<String, Object> status() {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("bound", resolver.bound());
        r.put("mode", resolver.mode().name());
        // status 是免鉴权白名单端点：绑定后控制集群地址不再向未认证方回显
        // （向导只在未绑定窗口出现，前端把该键声明为可空，消费零破坏）
        r.put("endpoint", resolver.bound() ? null : resolver.endpoint());
        r.put("appName", appName);
        // .2：纯管理平台形态下前端藏掉「宿主集群」入口（后端 EsTargetInterceptor 同步拒绝）
        r.put("hostVisible", hostClusterVisible);
        r.put("authEnabled", authEnabled);
        r.put("builtinLogin", builtinLogin);
        /* 令牌要求与实际守卫必须同口径：委托模式下配置了令牌同样会校验（见 test/apply/rebind），
           向导据此决定是否显示令牌输入框。 */
        r.put("setupTokenRequired", setupTokenConfigured());
        return r;
    }

    /** 兼容直调（单测/内部）：无 web 上下文时无法校验宿主身份，仅限无 delegate 场景。 */
    public ResponseEntity<Map<String, Object>> test(Map<String, String> body) {
        return test(body, null);
    }

    /** 连通性测试（仅未绑定开放）。body: {url, username?, password?}。失败 HTTP 200 {ok:false}。 */
    @PostMapping("test")
    public ResponseEntity<Map<String, Object>> test(@RequestBody Map<String, String> body,
                                                    HttpServletRequest request) {
        if (resolver.bound()) {
            return alreadyBound();
        }
        /* 独立部署的未绑定窗口：配置令牌后匿名请求不得做 SSRF 探测/绑定；
           未配置令牌时也只允许本机，避免公网匿名探测内网/绑定攻击者 ES。 */
        if (delegate == null) {
            if (!setupTokenValid(request)) return setupTokenDenied();
            if (!anonymousSetupSourceAllowed(request)) return localSetupOnly();
        }
        /* 宿主委托部署在未绑定窗口同样要求 ADMIN：否则匿名可用 /setup/test 对内网做 SSRF 探测。 */
        if (delegate != null) {
            /* 配置了 setup-token 就必须携带——委托身份在 header 模式下可由网关注入头伪造，
               单靠「认出 ADMIN」不足以为「把控制面指向哪个 ES」背书（第二因子）。 */
            if (!setupTokenValid(request)) return setupTokenDenied();
            ConsolePrincipal p = delegate.authenticate(request);
            if (p == null || !p.getRole().atLeast(ConsoleRole.ADMIN)) {
                Map<String, Object> b = new LinkedHashMap<>();
                b.put("code", "FORBIDDEN");
                b.put("message", "绑定控制集群需要宿主管理员身份");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(b);
            }
        }
        return ResponseEntity.ok(probe(body));
    }

    /** 绑定控制集群（仅未绑定开放；有委托时要求宿主 ADMIN）。body: {url, username?, password?}。 */
    @PostMapping("apply")
    public ResponseEntity<Map<String, Object>> apply(@RequestBody Map<String, String> body,
                                                     HttpServletRequest request) {
        if (resolver.bound()) {
            return alreadyBound();
        }
        if (delegate == null) {
            if (!setupTokenValid(request)) return setupTokenDenied();
            if (!anonymousSetupSourceAllowed(request)) return localSetupOnly();
        }
        String operator = "setup";
        if (delegate != null) {
            /* 同 test：配置了令牌就必须携带（委托身份 + 一次性口令双因子才允许改控制面归属）。 */
            if (!setupTokenValid(request)) return setupTokenDenied();
            ConsolePrincipal p = delegate.authenticate(request);
            if (p == null || !p.getRole().atLeast(ConsoleRole.ADMIN)) {
                Map<String, Object> b = new LinkedHashMap<>();
                b.put("code", "FORBIDDEN");
                b.put("message", "绑定控制集群需要宿主管理员身份");
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(b);
            }
            operator = p.getUsername();
        }
        RemoteClusterConn conn = parseConn(body);
        resolver.bindBootstrap(conn);
        opsAuditStore.record(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditEvent.builder()
                .username(operator).role(ConsoleRole.ADMIN.name()).method("POST")
                .uri("/internal/es/index/setup/apply").action("SETUP").httpStatus(200)
                .detail("bind " + conn.endpoint())
                .build());
        return ResponseEntity.ok(status());
    }

    /** 重绑控制集群（高危：常规鉴权 ADMIN，见拦截器高危清单 /setup/rebind）。 */
    @PostMapping("rebind")
    public ResponseEntity<Map<String, Object>> rebind(@RequestBody Map<String, String> body,
                                                      HttpServletRequest request) {
        /* 配置了 setup-token 时重绑同样要带：ADMIN 会话若被 CSRF/伪造头取得，
           没有第二因子就能无声改控制面归属（旧集群凭据不会被校验）。未配置=历史行为不变。 */
        if (!setupTokenValid(request)) {
            Map<String, Object> denied = new LinkedHashMap<>();
            denied.put("code", "SETUP_TOKEN_REQUIRED");
            denied.put("message", "重绑需要 X-Setup-Token（见 esquerystudio.elasticsearch.console.setup-token 配置）");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(denied);
        }
        RemoteClusterConn conn = parseConn(body);
        resolver.bindBootstrap(conn);
        Object p = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        String operator = p instanceof ConsolePrincipal ? ((ConsolePrincipal) p).getUsername() : "unknown";
        opsAuditStore.record(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditEvent.builder()
                .username(operator).role(ConsoleRole.ADMIN.name()).method("POST")
                .uri("/internal/es/index/setup/rebind").action("REBIND").httpStatus(200)
                .detail("rebind " + conn.endpoint())
                .build());
        return ResponseEntity.ok(status());
    }

    // ---------------- internal ----------------

    private static ResponseEntity<Map<String, Object>> alreadyBound() {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("code", "ALREADY_BOUND");
        b.put("message", "控制台已绑定控制集群；重绑请由 ADMIN 走 setup/rebind");
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(b);
    }

    private static RemoteClusterConn parseConn(Map<String, String> body) {
        RemoteClusterConn conn = RemoteClusterConn.parse(body.get("url"));
        if (body.get("username") != null && !body.get("username").trim().isEmpty()) {
            conn.setUsername(body.get("username").trim());
        }
        if (body.get("password") != null && !body.get("password").isEmpty()) {
            conn.setPassword(body.get("password"));
        }
        return conn;
    }

    /** 与 EsClusterConnController.test 同款探测：临时 client 用完即关。 */
    private Map<String, Object> probe(Map<String, String> body) {
        Map<String, Object> r = new LinkedHashMap<>();
        RemoteClusterConn conn;
        try {
            conn = parseConn(body);
        } catch (IllegalArgumentException e) {
            r.put("ok", false);
            // URL 解析失败属请求形态错误：与本方法外层探测臂及 advice 路径错误体同轨——
            // 同 advice 对 IAE 的 BAD_REQUEST 同码；ok/message 既有键保留、HTTP 200 形态
            // 不变（前端消费零破坏）；endpoint 无 web 上下文时宁缺勿炸不输出该键
            r.put("code", "BAD_REQUEST");
            r.put("message", e.getMessage() == null ? "连接串解析失败"
                    : EsErrorMapper.sanitizeTopology(e.getMessage()));
            String endpoint = EsErrorMapper.endpointOf(currentRequest());
            if (endpoint != null) {
                r.put("endpoint", endpoint);
            }
            return r;
        }
        try (RestHighLevelClient probe = clientFactory.build(conn)) {
            Response info = probe.getLowLevelClient().performRequest(new Request("GET", "/"));
            @SuppressWarnings("unchecked")
            Map<String, Object> infoMap = new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                    org.apache.http.util.EntityUtils.toString(info.getEntity()), Map.class);
            r.put("ok", true);
            r.put("clusterName", infoMap.get("cluster_name"));
            Object ver = infoMap.get("version");
            r.put("version", ver instanceof Map ? ((Map<?, ?>) ver).get("number") : null);
            try {
                Response health = probe.getLowLevelClient().performRequest(new Request("GET", "/_cluster/health"));
                @SuppressWarnings("unchecked")
                Map<String, Object> h = new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                        org.apache.http.util.EntityUtils.toString(health.getEntity()), Map.class);
                r.put("status", h.get("status"));
                r.put("nodes", h.get("number_of_nodes"));
            } catch (Exception ignore) {
                // 有的账号无 health 权限：info 已通即算连通
            }
        } catch (Exception e) {
            r.put("ok", false);
            // 与 EsClusterConnController.test 及 advice 路径 {code,message} 双轨对齐
            // ——错误体补 code 键（ok/message 既有键保留，前端消费零破坏）；message null 兜底改中文
            r.put("code", "PROBE_FAILED");
            r.put("message", e.getMessage() == null ? "连接探测失败(未知异常类型)"
                    : EsErrorMapper.sanitizeTopology(e.getMessage()));
            // 补 endpoint 键（additive）——与 advice 路径 EsErrorMapper.body 同口径
            // （method + " " + requestURI），失败端点一眼可定位；RequestContextHolder 取当前请求，
            // 非 web 线程/单测无上下文时宁缺勿炸不输出该键（endpointOf 空白口径同源）
            String endpoint = EsErrorMapper.endpointOf(currentRequest());
            if (endpoint != null) {
                r.put("endpoint", endpoint);
            }
        }
        return r;
    }

    /** 当前 HTTP 请求（供探测错误体带 endpoint 上下文）；无 web 上下文返回 null，绝不抛异常。 */
    private static javax.servlet.http.HttpServletRequest currentRequest() {
        org.springframework.web.context.request.RequestAttributes ra =
                RequestContextHolder.getRequestAttributes();
        return ra instanceof ServletRequestAttributes
                ? ((ServletRequestAttributes) ra).getRequest() : null;
    }
}
