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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestHighLevelClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 多集群连接管理端点（{@code /internal/es/index/clusters}。
 *
 * <p>路径设计说明：挂在 {@code /internal/es/index/**} 下天然被控制台鉴权拦截器覆盖；
 * {@code clusters}（复数）刻意避开 {@link EsTargetInterceptor} 的 {@code /cluster/} 白名单——
 * 连接管理永远作用于宿主集群。GET 列表对 VIEWER 开放（脱敏无密码， 起按 minRole
 * 过滤可见性 + 附 health 探活字段），探活为只读观测同样 VIEWER 可用（见
 * ConsoleAuthInterceptor 的 probe 豁免），保存/删除/连通性测试为 ADMIN（见高危清单 {@code /clusters/}）。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/clusters")
public class EsClusterConnController {

    private final ConnStore connStore;
    private final EsClientRouter router;
    private final RemoteEsClientFactory clientFactory;
    /** 探活开关关闭时为 null：列表降级为无 health 字段，probe 端点回友好提示。 */
    private final ConnHealthProber prober;
    /** 连接中心同步引擎(未启用= null:GET sync 回 null,POST sync/run 明确报错)。 */
    private final ClusterConnSyncEngine syncEngine;

    public EsClusterConnController(ConnStore connStore, EsClientRouter router,
                                   RemoteEsClientFactory clientFactory, ConnHealthProber prober) {
        this(connStore, router, clientFactory, prober, null);
    }

    /** 5 参全量构造(连接中心自动同步批):syncEngine 未启用传 null。 */
    public EsClusterConnController(ConnStore connStore, EsClientRouter router,
                                   RemoteEsClientFactory clientFactory, ConnHealthProber prober,
                                   ClusterConnSyncEngine syncEngine) {
        this.connStore = connStore;
        this.router = router;
        this.clientFactory = clientFactory;
        this.prober = prober;
        this.syncEngine = syncEngine;
    }

    /**
     * 连接列表（脱敏：无密码明文）——顶栏集群切换器数据源。
     * 按当前登录角色过滤 minRole（看不见 = 切不了，集群级隔离的第一道门），
     * 并附最近一次探活结果 {@code health}（探活关闭时无此字段）。
     */
    @GetMapping
    public List<Map<String, Object>> list(HttpServletRequest request) {
        Object p = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        ConsoleRole actual = p instanceof ConsolePrincipal
                ? ((ConsolePrincipal) p).getRole() : ConsoleRole.VIEWER;
        ConsolePrincipal principal = p instanceof ConsolePrincipal ? (ConsolePrincipal) p : null;
        /* 一次连接目录快照，避免每行一次 list()/ES 查询（N+1） */
        io.github.dengmeiluan.esquerystudio.console.auth.ConsoleConnVisibility.Snapshot snap =
                io.github.dengmeiluan.esquerystudio.console.auth.ConsoleConnVisibility.snapshot(principal, connStore);
        List<Map<String, Object>> out = new ArrayList<>();
        /* 复用快照已取到的目录行：再次 list() 在存储瞬时故障时会 500，
           返回 null 的实现还会 NPE；空目录也必须是空数组而不是异常。
           ADMIN 快照不受限（visibleIds=null）时不预取目录行，此处补一次读。 */
        List<Map<String, Object>> rows = snap.rows;
        if (snap.visibleIds == null) {
            try {
                rows = connStore.list();
                if (rows == null) rows = java.util.Collections.emptyList();
            } catch (Exception e) {
                rows = java.util.Collections.emptyList();
            }
        }
        for (Map<String, Object> c : rows) {
            ConsoleRole required = ConsoleRole.parse(c.get("minRole") == null ? null : String.valueOf(c.get("minRole")));
            /* principal=null=无鉴权部署：不按 minRole 过滤（全功能语义）；ADMIN 自然全过 */
            if (principal != null && !actual.atLeast(required)) {
                continue;
            }
            /* 连接模型：未授权的连接档案连名称/地址都不下发，与前端 canSeeConn 同口径 */
            if (!snap.seesId(String.valueOf(c.get("id")))) {
                continue;
            }
            if (prober != null) {
                c.put("health", prober.health(String.valueOf(c.get("id"))));
            }
            out.add(c);
        }
        return out;
    }

    /**
     * 保存连接（新建/编辑）。body: {id?, name, url, username?, password?, minRole?, connectTimeoutMs?, socketTimeoutMs?, env?}；
     * 编辑时密码留空=保留旧密码；超时留空=用全局默认；env 为环境标识（PROD/STAGING/QA/DEV， 纯展示）。
     */
    @PostMapping("save")
    public Map<String, Object> save(@RequestBody Map<String, Object> body) {
        Map<String, Object> saved = connStore.save(str(body.get("id")), str(body.get("name")),
                str(body.get("url")), str(body.get("username")), str(body.get("password")),
                str(body.get("minRole")), intOrNull(body.get("connectTimeoutMs")), intOrNull(body.get("socketTimeoutMs")),
                str(body.get("env")), str(body.get("authType")));
        router.evict(String.valueOf(saved.get("id"))); // 档案变更：关旧长连接，下次使用重建
        if (prober != null) {
            prober.probeOne(String.valueOf(saved.get("id"))); // 保存即探：新档案状态点秒级可见
            saved.put("health", prober.health(String.valueOf(saved.get("id"))));
        }
        return saved;
    }

    /** 手动即时探活单个连接（只读观测，VIEWER 可用；但不得低于该连接档案的 minRole）。 */
    @PostMapping("{id}/probe")
    public Map<String, Object> probe(@PathVariable String id, HttpServletRequest request) {
        RemoteClusterConn conn = connStore == null ? null : connStore.get(id);
        if (conn != null) {
            Object p = request == null ? null : request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
            /* principal=null=无鉴权部署：全功能可用，不走 minRole/页面可见性门；
               鉴权开启时拦截器保证 principal 恒在场。 */
            if (p instanceof ConsolePrincipal) {
                ConsolePrincipal principal = (ConsolePrincipal) p;
                ConsoleRole required = ConsoleRole.parse(conn.getMinRole());
                if (!principal.getRole().atLeast(required)) {
                    throw new org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatus.FORBIDDEN,
                            "当前角色无权探活该连接（需 " + required.name() + "）");
                }
                if (!connModelVisible(principal, id)) {
                    throw new org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatus.FORBIDDEN,
                            "当前身份未获该连接授权，不能探活");
                }
            }
        }
        Map<String, Object> r = new LinkedHashMap<>();
        if (prober == null) {
            r.put("status", "UNKNOWN");
            r.put("error", "探活已禁用（esquerystudio.elasticsearch.console.conn-probe-enabled=false）");
            /* 补 code+endpoint（additive，:191 PROBE_FAILED 先例同口径）。
               裁决备案：error 字段保留 string 只 additive——前端 ConnHealth.error 契约是
               string|null，ClusterSwitcher.probeConn 直接渲染「探活失败：${h.error}」，
               改 boolean 信封会破前端展示，故既有键零改动 */
            r.put("code", "PROBE_DISABLED");
            String endpoint = EsErrorMapper.endpointOf(currentRequest());
            if (endpoint != null) {
                r.put("endpoint", endpoint);
            }
            return r;
        }
        return prober.probeOne(id);
    }

    /** 连接可见性统一走 ConsoleConnVisibility（连接目录/权限面板/监控接口同口径）。 */
    private boolean connModelVisible(ConsolePrincipal p, String connId) {
        return io.github.dengmeiluan.esquerystudio.console.auth.ConsoleConnVisibility.canSee(p, connId, connStore);
    }

    /** 兼容旧内部调用/单测的一参入口（无 HTTP 请求上下文时按 VIEWER 角色处理）。 */
    public Map<String, Object> probe(String id) {
        return probe(id, currentRequest());
    }

    /**
     * 删除连接（幂等），并关闭缓存的长连接。
     * 同步档案（cc- 前缀）走软删除：档案落 syncState=DISMISSED 保留为墓碑——控制台读面
     * 整体隐身，自动同步引擎不再回灌；手工域档案物理删除，语义不变。
     */
    @PostMapping("delete")
    public Map<String, Object> delete(@RequestParam String id) {
        if (id != null && id.startsWith(ClusterConnSyncEngine.SYNC_ID_PREFIX)) {
            connStore.markDismissed(id);
        } else {
            connStore.delete(id);
        }
        router.evict(id);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("deleted", id);
        return r;
    }

    /**
     * 连通性测试：body 给 {id}（测已存档案）或 {url, username?, password?}（存前预测）。
     * 返回 {ok, clusterName, version, status, nodes}；失败返回 {ok:false, message}（HTTP 200，避免前端当系统错误）。
     */
    @PostMapping("test")
    public Map<String, Object> test(@RequestBody Map<String, String> body) {
        Map<String, Object> r = new LinkedHashMap<>();
        RemoteClusterConn conn;
        try {
            String id = body.get("id");
            if (id != null && !id.trim().isEmpty() && (body.get("url") == null || body.get("url").trim().isEmpty())) {
                conn = connStore.get(id.trim());
                if (conn == null) {
                    throw new IllegalArgumentException("连接不存在: " + id);
                }
            } else {
                conn = RemoteClusterConn.parse(body.get("url"));
                if (body.get("authType") != null && !body.get("authType").trim().isEmpty()) {
                    conn.setAuthType(body.get("authType").trim());
                }
                if (body.get("username") != null && !body.get("username").trim().isEmpty()) {
                    conn.setUsername(body.get("username").trim());
                }
                String pw = body.get("password");
                if (pw != null && !pw.isEmpty()) {
                    conn.setPassword(pw);
                } else if (id != null && !id.trim().isEmpty()) {
                    // 编辑态测试：密码留空 → 用已存档案的旧密码
                    RemoteClusterConn stored = connStore.get(id.trim());
                    if (stored != null) {
                        conn.setPassword(stored.getPassword());
                        if (!conn.hasCredentials()) {
                            conn.setUsername(stored.getUsername());
                        }
                    }
                }
            }
        } catch (IllegalArgumentException e) {
            r.put("ok", false);
            // URL 解析失败/连接不存在属请求形态错误：与本方法外层探测臂及 advice 路径
            // 错误体同轨——同 advice 对 IAE 的 BAD_REQUEST 同码；ok/message 既有键保留、
            // HTTP 200 形态不变（前端消费零破坏）；endpoint 无 web 上下文时宁缺勿炸不输出
            r.put("code", "BAD_REQUEST");
            r.put("message", e.getMessage() == null ? "连接串解析失败"
                    : EsErrorMapper.sanitizeTopology(e.getMessage()));
            String endpoint = EsErrorMapper.endpointOf(currentRequest());
            if (endpoint != null) {
                r.put("endpoint", endpoint);
            }
            return r;
        }

        // 临时 client 用完即关，不进路由缓存（测试不该产生长连接）
        try (RestHighLevelClient probe = clientFactory.build(conn)) {
            Response info = probe.getLowLevelClient().performRequest(new Request("GET", "/"));
            @SuppressWarnings("unchecked")
            Map<String, Object> infoMap = new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                    org.apache.http.util.EntityUtils.toString(info.getEntity()), Map.class);
            r.put("ok", true);
            r.put("clusterName", infoMap.get("cluster_name"));
            Object ver = infoMap.get("version");
            Object verNum = ver instanceof Map ? ((Map<?, ?>) ver).get("number") : null;
            r.put("version", verNum);
            // 测的是已存档案 → 顺带回写服务端版本（同值短路，失败静默）
            String testedId = body.get("id");
            if (verNum != null && testedId != null && !testedId.trim().isEmpty()) {
                connStore.updateVersion(testedId.trim(), String.valueOf(verNum));
            }
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
            // 与 advice 路径 {code,message} 双轨对齐——错误体补 code 键
            // （ok/message 既有键保留，前端消费零破坏）；message null 兜底改中文
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

    /**
     * 连接中心同步最近一轮报告(连接中心自动同步批);未启用同步(引擎未装配)返回 null。
     * 报告含集群名与跳过原因(脱敏无密码),路径含 /clusters/ 天然落高危清单 ADMIN。
     */
    /** 兼容直调/测试（无请求上下文=全量，与 ADMIN 语义一致）；HTTP 走带 request 的签名。 */
    ClusterConnSyncReport syncStatus() {
        return syncStatus(null);
    }

    @GetMapping("sync")
    public ClusterConnSyncReport syncStatus(HttpServletRequest request) {
        if (syncEngine == null) return null;
        ClusterConnSyncReport report = syncEngine.lastReport();
        if (report == null) return null;
        Object p = request == null ? null : request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (!(p instanceof ConsolePrincipal)
                || ((ConsolePrincipal) p).getRole().atLeast(ConsoleRole.ADMIN)) {
            return report;
        }
        /* sync 是自举豁免端点（撤权重定位要靠它刷新），但不能把 notes 里的全部连接名
           下发给只能看见部分目录的人：聚合计数保留，明细仅在全目录可见时下发。 */
        io.github.dengmeiluan.esquerystudio.console.auth.ConsoleConnVisibility.Snapshot snap =
                io.github.dengmeiluan.esquerystudio.console.auth.ConsoleConnVisibility.snapshot(
                        (ConsolePrincipal) p, connStore);
        return snap.seesAllKnown() ? report
                : report.withNotes(java.util.Collections.<String>emptyList());
    }

    /** 手动触发一轮同步(同步执行完返回报告,与周期调度 synchronized 互斥);引擎未启用显式报错。 */
    @PostMapping("sync/run")
    public ClusterConnSyncReport syncRun() {
        if (syncEngine == null) {
            throw new IllegalStateException(
                    "未启用连接中心同步(需注册 ClusterConnContributor 并开启 esquerystudio.elasticsearch.console.conn-sync.enabled)");
        }
        return syncEngine.runOnce("manual");
    }

    /** 当前 HTTP 请求（供探测错误体带 endpoint 上下文）；无 web 上下文返回 null，绝不抛异常。 */
    private static javax.servlet.http.HttpServletRequest currentRequest() {
        org.springframework.web.context.request.RequestAttributes ra =
                RequestContextHolder.getRequestAttributes();
        return ra instanceof ServletRequestAttributes
                ? ((ServletRequestAttributes) ra).getRequest() : null;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Integer intOrNull(Object o) {
        if (o instanceof Number) {
            return ((Number) o).intValue();
        }
        if (o instanceof String && !((String) o).trim().isEmpty()) {
            try {
                return Integer.parseInt(((String) o).trim());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("超时需为整数毫秒，实际: " + o);
            }
        }
        return null;
    }
}
