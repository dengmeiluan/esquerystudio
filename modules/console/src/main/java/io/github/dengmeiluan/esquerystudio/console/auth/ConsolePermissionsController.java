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

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 「我的权限面」查询端点：当前身份 × 目标连接的逐页读/写判定 + raw 直连档 + 共享写档。
 *
 * <p>判定序列与 {@link ConsoleAuthInterceptor} 的门序同源（页面门 → 连接写门 → 角色门），
 * 判定原子复用拦截器静态口径与 {@link EnvPagesResolver}；只披露本人权限面（页面目录本就随
 * {@code /auth/me} 下发，无新增敏感面）。GET 只读端点，VIEWER 即可自查。</p>
 */
@RestController
@RequestMapping("internal/es/index/auth")
public class ConsolePermissionsController {

    private final ConsolePageCatalog pageCatalog;
    private final EnvPagesResolver envPagesResolver;
    private final io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore connStore;
    private final boolean pageAuthEnabled;

    public ConsolePermissionsController(ConsolePageCatalog pageCatalog, EnvPagesResolver envPagesResolver,
            io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore connStore, boolean pageAuthEnabled) {
        this.pageCatalog = pageCatalog;
        this.envPagesResolver = envPagesResolver;
        this.connStore = connStore;
        this.pageAuthEnabled = pageAuthEnabled;
    }

    /** REST 直连走的透传端点（rest 页归属），raw 档判定的代表路径。 */
    static final String RAW_PATH = "/internal/es/index/cluster/raw";
    /** DevTools 独立执行端点（devtools/rest 页写键均可）。 */
    static final String DEVTOOLS_PATH = "/internal/es/index/cluster/devtools/execute";

    /**
     * 真实写端点路径（非 GET，且不是只读 POST）——页面写面判定的唯一依据。
     *
     * <p>不能再用 {@code requiredRole("POST", prefix)} 推断：GET-only 页面的前缀不在任何
     * 关键词表里，会被误判成 OPERATOR 可写，宿主据此下发 {@code w:} 键后会解锁共享写端点
     * （权限面误报→提权链）。</p>
     */
    private static final List<String> WRITE_ENDPOINT_PATHS = java.util.Arrays.asList(
            "/internal/es/index/rebuild",
            "/internal/es/index/rebuild-empty",
            "/internal/es/index/force-merge",
            "/internal/es/index/cluster/force-merge",
            "/internal/es/index/insight/actions/apply-index-settings",
            "/internal/es/index/replicas",
            "/internal/es/index/config-lab/validate",
            "/internal/es/index/cluster/delete-index",
            "/internal/es/index/cluster/create-index",
            "/internal/es/index/cluster/delete-by-id",
            "/internal/es/index/cluster/delete-by-query",
            "/internal/es/index/cluster/devtools/execute",
            "/internal/es/index/cluster/doc",
            "/internal/es/index/cluster/doc/update",
            "/internal/es/index/cluster/update-document",
            "/internal/es/index/cluster/update-partial",
            "/internal/es/index/cluster/put-mapping",
            "/internal/es/index/cluster/mapping-put",
            "/internal/es/index/cluster/update-settings",
            "/internal/es/index/cluster/index-settings/update",
            "/internal/es/index/cluster/bulk",
            "/internal/es/index/cluster/update-by-query",
            "/internal/es/index/cluster/alias-actions",
            "/internal/es/index/cluster/rollover",
            "/internal/es/index/cluster/templates/put",
            "/internal/es/index/cluster/templates/delete",
            "/internal/es/index/cluster/scripts/put",
            "/internal/es/index/cluster/scripts/delete",
            "/internal/es/index/cluster/painless/execute",
            "/internal/es/index/cluster/snapshot/create",
            "/internal/es/index/cluster/snapshot/restore",
            "/internal/es/index/cluster/snapshot/delete",
            "/internal/es/index/cluster/ilm/policy",
            "/internal/es/index/cluster/ilm/move",
            "/internal/es/index/cluster/ilm/start",
            "/internal/es/index/cluster/ilm/stop",
            "/internal/es/index/cluster/slm/execute",
            "/internal/es/index/cluster/settings/put",
            "/internal/es/index/cluster/reroute",
            "/internal/es/index/cluster/reroute/retry-failed",
            "/internal/es/index/cluster/tasks/cancel",
            "/internal/es/index/cluster/analysis-update",
            "/internal/es/index/cluster/synonyms-upsert",
            "/internal/es/index/cluster/reload-analyzers",
            "/internal/es/index/cluster/reindex-advanced",
            "/internal/es/index/cluster/raw",
            "/internal/es/index/auth/users/upsert",
            "/internal/es/index/auth/users/delete",
            "/internal/es/index/setup/rebind",
            "/internal/es/index/clusters/save",
            "/internal/es/index/clusters/delete",
            "/internal/es/index/clusters/test",
            "/internal/es/index/clusters/sync/run",
            "/internal/es/index/adhoc-rebuild/start",
            "/internal/es/index/adhoc-rebuild/abort",
            "/internal/es/index/adhoc-rebuild/confirm-switch",
            "/internal/es/xmigrate/start",
            "/internal/es/xmigrate/resume",
            "/internal/es/xmigrate/abort",
            "/internal/es/xmigrate/connect-check",
            "/internal/es/xmigrate/fetch-config",
            "/internal/es/xmigrate/resolve-preview",
            "/internal/es/xmigrate/preflight");

    @GetMapping("permissions")
    public ResponseEntity<Map<String, Object>> permissions(HttpServletRequest request,
            @RequestParam(required = false) String target) {
        ConsolePrincipal p = (ConsolePrincipal) request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        Map<String, Object> out = new LinkedHashMap<>();
        if (p == null) {
            // 拦截器在前面 principal 恒在场；此臂=拦截器被旁路的部署形态，fail-closed。
            // 状态码对齐拦截器未认证拒绝（401 {code:"UNAUTHORIZED"}）——200 包体带错误码
            // 会让前端登录遮罩广播（api.ts 401 通道）失效
            out.put("code", "UNAUTHORIZED");
            out.put("message", "请先登录 ES 控制台");
            return ResponseEntity.status(401).body(out);
        }
        String tid = (target == null || target.isEmpty() || "host".equalsIgnoreCase(target.trim()))
                ? "host" : target.trim();
        boolean targetIsConn = !"host".equals(tid);
        boolean admin = p.getRole().atLeast(ConsoleRole.ADMIN);
        Set<String> gp = pageAuthEnabled ? p.getGrantedPages() : null;
        boolean pageGateActive = gp != null;
        boolean connModel = pageGateActive && envPagesResolver.inConnModel(gp);
        Set<String> effective = pageGateActive ? envPagesResolver.effectivePages(tid, gp) : null;

        /* 目标连接名/环境按 canSeeConn 同口径过滤：/auth/permissions 是自举端点，
           任意已认证用户都能带 target 探测，不能借此枚举未授权连接档案。 */
        boolean targetVisible = targetIsConn && canSeeTarget(p, tid);
        boolean targetAccessible = !targetIsConn || targetVisible;

        // raw 直连档：ADMIN 全局可用；连接模型=精确 rest 页写键（混入静态页时按静态写权+角色）；
        // 静态模型=环境模板收缩后的页可见 + 角色档。
        // DevTools 走独立端点，w:devtools 不能顺带解锁 REST 直连（/cluster/raw 仍是 rest 页）。
        ConsoleRole rawRole = ConsoleAuthInterceptor.requiredRole("POST", RAW_PATH);
        ConsoleRole devtoolsRole = ConsoleAuthInterceptor.requiredRole("POST", DEVTOOLS_PATH);
        boolean rawAllowed = targetAccessible && (admin || (pageGateActive && connModel
                ? (envPagesResolver.writeAllowed(tid, "rest", gp)
                    || (envPagesResolver.staticWriteAllowed(tid, "rest", gp)
                        && p.getRole().atLeast(rawRole)))
                : p.getRole().atLeast(rawRole)
                    && (!pageGateActive || effective.contains("rest"))));
        boolean devtoolsAllowed = targetAccessible && (admin || (pageGateActive && connModel
                ? (envPagesResolver.writeAllowed(tid, "devtools", gp)
                    || envPagesResolver.writeAllowed(tid, "rest", gp)
                    || ((envPagesResolver.staticWriteAllowed(tid, "devtools", gp)
                        || envPagesResolver.staticWriteAllowed(tid, "rest", gp))
                        && p.getRole().atLeast(devtoolsRole)))
                : p.getRole().atLeast(devtoolsRole)
                    && (!pageGateActive || effective.contains("devtools") || effective.contains("rest"))));
        // 共享写档：ADMIN 全局可用；连接模型需持有真实使用共享端点的页面写键；        // 静态/内置模型按「页面可见 + 角色档」判定（不能只对 conn 模型报可用）
        boolean sharedWriteAllowed = targetAccessible && (admin
                || (pageGateActive && connModel
                    && (ConsoleAuthInterceptor.hasSharedWriteGrant(tid, gp, effective)
                        || ConsoleAuthInterceptor.hasStaticSharedWriteGrant(gp, effective, p.getRole())))
                || (pageGateActive && !connModel
                    && ConsoleAuthInterceptor.hasStaticSharedWriteGrant(gp, effective, p.getRole()))
                || (!pageGateActive && p.getRole().atLeast(ConsoleRole.OPERATOR)));
        String connName = null;
        String env = null;
        if (targetVisible) {
            try {
                connName = connStore.getName(tid);
            } catch (Exception e) {
                // 连接档案瞬态不可用：查询面尽力而为，绝不反噬
            }
            try {
                io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn conn = connStore.get(tid);
                if (conn != null) {
                    env = conn.getEnv();
                }
            } catch (Exception e) {
                // 同上
            }
        }
        boolean envPagesApplied = targetVisible && envPagesResolver.pagesFor(tid) != null;

        out.put("role", p.getRole().name());
        out.put("delegated", p.isDelegated());
        out.put("pageAuthEnabled", pageAuthEnabled);
        out.put("pageGateActive", pageGateActive);
        out.put("target", tid);
        out.put("connName", connName);
        out.put("env", env);
        out.put("connModel", connModel);
        out.put("envPagesApplied", envPagesApplied);
        /* 1133：读档能力与写档分开回报。执行端点外层恒 POST，只读身份凭读键也能执行内层只读请求，
           面板若只报「写可用」就会与实际行为脱节（用户看到「不可用」但 GET 明明能跑）。 */
        boolean rawReadAllowed = targetAccessible && (admin || (pageGateActive && connModel
                ? (envPagesResolver.readAllowed(tid, "rest", gp)
                    || envPagesResolver.writeAllowed(tid, "rest", gp)
                    || (envPagesResolver.staticWriteAllowed(tid, "rest", gp)
                        && p.getRole().atLeast(rawRole)))
                : p.getRole().atLeast(rawRole)
                    && (!pageGateActive || effective.contains("rest"))));
        boolean devtoolsReadAllowed = targetAccessible && (admin || (pageGateActive && connModel
                ? (envPagesResolver.readAllowed(tid, "devtools", gp)
                    || envPagesResolver.readAllowed(tid, "rest", gp)
                    || envPagesResolver.writeAllowed(tid, "devtools", gp)
                    || envPagesResolver.writeAllowed(tid, "rest", gp)
                    || ((envPagesResolver.staticWriteAllowed(tid, "devtools", gp)
                        || envPagesResolver.staticWriteAllowed(tid, "rest", gp))
                        && p.getRole().atLeast(devtoolsRole)))
                : p.getRole().atLeast(devtoolsRole)
                    && (!pageGateActive || effective.contains("devtools") || effective.contains("rest"))));
        out.put("rawAllowed", rawAllowed);
        out.put("devtoolsAllowed", devtoolsAllowed);
        out.put("rawReadAllowed", rawReadAllowed);
        out.put("devtoolsReadAllowed", devtoolsReadAllowed);
        out.put("sharedWriteAllowed", sharedWriteAllowed);

        Set<String> hostEffective = pageGateActive
                ? envPagesResolver.effectivePages("host", gp) : null;
        List<Map<String, Object>> groups = new ArrayList<>();
        for (ConsolePageCatalog.Group g : pageCatalog.getGroups()) {
            List<Map<String, Object>> pages = new ArrayList<>();
            for (ConsolePageCatalog.Page pg : pageCatalog.pagesOf(g.getId())) {
                Map<String, Object> pm = new LinkedHashMap<>();
                pm.put("key", pg.getKey());
                pm.put("name", pg.getName());
                /* system/config-drift 的执行恒定宿主：面板必须按 host 授权回显，
                   否则 conn:c1:system 会显示可读、实际端点 403（与拦截器 isHostBoundPath 同源）。 */
                boolean hostPage = "system".equals(pg.getKey()) || "config-drift".equals(pg.getKey());
                Set<String> pageEffective = pageGateActive
                        ? envPagesResolver.effectivePages(hostPage ? "host" : tid, gp) : null;
                boolean read = admin || !pageGateActive
                        || (hostPage
                            /* config-drift 的共享读（desired-state / mapping-reconcile）跟随目标，
                               system 的端点恒宿主——两者取并集才不会虚报不可读。 */
                            ? (pageEffective.contains(pg.getKey())
                                || (targetAccessible && effective != null && effective.contains(pg.getKey())))
                            : targetAccessible && pageEffective.contains(pg.getKey()))
                        /* security 页的审计读是 host-scope：目标不可见/不持有该连接键时，
                           持 conn:host:security 仍能看到宿主审计入口。 */
                        || ("security".equals(pg.getKey()) && hostEffective != null
                            && hostEffective.contains("security"));
                /* 安全中心两个作用域必须分开回显：/auth/users 恒宿主、/auth/ops-audit 跟随目标。
                   面板 read=true 只表示「本页至少有一个可读面」，具体 tab 由 readScopes 标注，
                   避免把「只能看宿主流水」误读成「能看该连接全部审计」。 */
                boolean usersRead = admin || !pageGateActive
                        || (hostEffective != null && hostEffective.contains("security"));
                /* 全量审计是 rank3 专项数据：security 读键给 VIEWER 只能看用户列表/自助流水，
                   不得读全量 IP/URI/连接维度审计。面板必须与拦截器同序（原先只看页键，
                   面板报 audit=true 而实际 /auth/ops-audit 403）。 */
                boolean auditRead = p.getRole().atLeast(ConsoleRole.REBUILD_OP)
                        && (admin || !pageGateActive
                            || (targetAccessible && pageEffective.contains("security"))
                            || (hostEffective != null && hostEffective.contains("security")));
                if (!admin && "rest".equals(pg.getKey())) {
                    read = pageGateActive && hasConnKey(gp, tid, "rest")
                            && pageEffective.contains("rest");
                } else if (!admin && "devtools".equals(pg.getKey())) {
                    boolean devtoolsKey = pageGateActive && hasConnKey(gp, tid, "devtools")
                            && pageEffective.contains("devtools");
                    boolean restKey = pageGateActive && gp != null
                            && gp.contains("conn:" + tid + ":w:rest")
                            && pageEffective.contains("rest");
                    read = devtoolsKey || restKey;
                }
                List<String> prefixes = pg.getApiPrefixes();
                List<ConsoleRole> writeRoles = writeRoles(pg.getKey(), prefixes);
                ConsoleRole writeRole = writeRoles.isEmpty() ? null : maxRole(writeRoles);
                boolean hasWriteEndpoint = writeRole != null;
                Boolean write = null;
                String writeDeny = null;
                if (hasWriteEndpoint) {
                    if (!read) {
                        write = Boolean.FALSE;
                        writeDeny = "PAGE_DENIED";
                    } else if (pageGateActive && connModel) {
                        /* security 的写端点（auth/users）与 system/config-drift 一样恒定宿主：
                           面板必须按 host 写键回显，不能把 conn:c1:w:security 报成可写。 */
                        String writeTid = ("security".equals(pg.getKey()) || hostPage) ? "host" : tid;
                        /* 与拦截器同序：conn 写键优先；混合模型静态页写权 = 静态键 + 角色档。 */
                        write = admin || envPagesResolver.writeAllowed(writeTid, pg.getKey(), gp)
                                || (envPagesResolver.staticWriteAllowed(writeTid, pg.getKey(), gp)
                                    && p.getRole().atLeast(writeRole));
                        if (!write) {
                            writeDeny = "WRITE_DENIED";
                        }
                    } else {
                        /* 静态模型按端点逐个判定：页面写权 = 至少有一个本页写端点角色达标。
                           用「最高危端点」一票否决会把 OPERATOR 的 search/indices/config-validator
                           报成完全不可写，而实际文档编辑/校验 dry-run 都能做——面板比后端严格
                           同样是「有权限的人被拦」（只是发生在 UI 层）。 */
                        boolean any = false;
                        boolean partial = false;
                        for (ConsoleRole r : writeRoles) {
                            if (p.getRole().atLeast(r)) any = true; else partial = true;
                        }
                        write = any;
                        if (!any) {
                            writeDeny = "ROLE_INSUFFICIENT:" + writeRole.name();
                        } else if (partial) {
                            writeDeny = "PARTIAL_ROLE:" + writeRole.name();
                        }
                    }
                    /* DevTools 专用端点同时接受 devtools/rest 写键（兼容），页行必须同口径。 */
                    /* 本地账号管理是全局 ABI：页面授权身份（含非委派的连接写键）不得建/改/删号，
                       后端 forbidDelegatedLocalUserWrite 已按「委派 或 grantedPages!=null 且非 ADMIN」拒绝。
                       面板必须同口径——否则「面板说可写、实际 403」，管理员会以为授权已生效。 */
                    if (pageGateActive && connModel && !admin
                            && "security".equals(pg.getKey())) {
                        write = Boolean.FALSE;
                        writeDeny = "PAGE_SCOPED_SECURITY_READONLY";
                    }
                    if (pageGateActive && connModel && "devtools".equals(pg.getKey())) {
                        write = admin || envPagesResolver.writeAllowed(tid, "devtools", gp)
                                || envPagesResolver.writeAllowed(tid, "rest", gp);
                        writeDeny = write ? null : "WRITE_DENIED";
                        /* REST 写键可执行 DevTools（后端共享写映射同口径）：面板读能力不得显示 false，
                           否则前端路由/侧栏与权限面板自相矛盾。 */
                        if (Boolean.TRUE.equals(write)) {
                            read = true;
                        }
                    }
                    /* 迁移写入端恒为宿主：start/resume/preflight 需要「源写键 + 宿主写键」双证；
                       abort/connect-check/fetch-config/resolve-preview 只需源写键。
                       面板 write 表示「本页写操作至少有一部分可用」，缺宿主写键时用 writeDeny
                       标注限制（而不是一律 false 把只能中止在途作业的人报成完全不可写）。 */
                    if (pageGateActive && connModel && !admin && "xmigrate".equals(pg.getKey())) {
                        boolean sourceWrite = Boolean.TRUE.equals(write);
                        boolean hostWrite = envPagesResolver.writeAllowed("host", "xmigrate", gp)
                                || (envPagesResolver.staticWriteAllowed("host", "xmigrate", gp)
                                    && p.getRole().atLeast(writeRole));
                        if (!sourceWrite) {
                            write = Boolean.FALSE;
                            writeDeny = "WRITE_DENIED";
                        } else if (!hostWrite) {
                            writeDeny = "HOST_DEST_WRITE_REQUIRED";
                        }
                    }
                }
                pm.put("read", read);
                pm.put("write", write);
                if (writeDeny != null) {
                    pm.put("writeDeny", writeDeny);
                }
                /* 细粒度说明（前端按需消费，不影响既有布尔契约）：
                   security 的两个读作用域（users=宿主、audit=目标）实际不可互换；
                   aliases 在 config-validator 归属下只有 add-only 写权（后端 aliasActionsAddOnly 同源）。 */
                if ("security".equals(pg.getKey())) {
                    Map<String, Object> scopes = new LinkedHashMap<>();
                    scopes.put("users", usersRead);
                    scopes.put("audit", auditRead);
                    pm.put("readScopes", scopes);
                }
                if ("aliases".equals(pg.getKey()) && Boolean.TRUE.equals(write)) {
                    String writeTid = "host".equals(tid) ? "host" : tid;
                    boolean fullAlias = envPagesResolver.writeAllowed(writeTid, "aliases", gp)
                            || (envPagesResolver.staticWriteAllowed(writeTid, "aliases", gp)
                                && writeRole != null && p.getRole().atLeast(writeRole));
                    pm.put("writeScope", fullAlias ? "FULL" : "ADD_ONLY");
                }
                /* rest/devtools 的写键实际授予的是「目标连接的数据面全权」——两者共用同一
                   透传内核（文档 CRUD/bulk/UBQ/DBQ/SQL，管理面写被 guardRawGuarded 拦住）。
                   宿主按「一页」授权时，面板必须说清这一键给出的真实范围，否则
                   管理员会把 devtools 当成调试工具授出整个数据面的写能力。 */
                if (("rest".equals(pg.getKey()) || "devtools".equals(pg.getKey()))
                        && Boolean.TRUE.equals(write)) {
                    pm.put("writeScope", "DATA_PLANE");
                }
                /* 集群级动作（ilm start/stop/policy、reroute retry-failed、slm execute、tasks cancel）
                   在连接模型下补了「rank3 或 w:cluster-settings」双通道硬门：
                   - 页面全部写端点都是集群级 → 硬门不过时该页实际零写能力，write=false；
                   - 混合页（lifecycle 的 rollover/move 等）仍 write=true，但标注这一限制。
                   与拦截器 CLUSTER_SCOPE_WRITE_KEYWORDS 同源，避免面板说可写而点什么都 403。 */
                if (pageGateActive && connModel && !admin && Boolean.TRUE.equals(write)
                        && !p.getRole().atLeast(ConsoleRole.CLUSTER_OP)
                        && !envPagesResolver.writeAllowed(tid, "cluster-settings", gp)) {
                    if (allWritesAreClusterScope(pg.getKey(), prefixes)) {
                        write = Boolean.FALSE;
                    }
                    writeDeny = "CLUSTER_SCOPE_REQUIRED";
                }
                pages.add(pm);
            }
            Map<String, Object> gm = new LinkedHashMap<>();
            gm.put("id", g.getId());
            gm.put("name", g.getName());
            gm.put("pages", pages);
            groups.add(gm);
        }
        out.put("groups", groups);
        return ResponseEntity.ok(out);
    }

    /** 与前端 canSeeConn / 连接目录 / 监控接口同口径。 */
    private boolean canSeeTarget(ConsolePrincipal p, String tid) {
        return ConsoleConnVisibility.canSee(p, tid, connStore);
    }

    /** 该连接上是否持有某页的读或写键（rest/devtools 的读侧兼容判定用）。 */
    private static boolean hasConnKey(Set<String> gp, String tid, String page) {
        return gp != null && (gp.contains("conn:" + tid + ":" + page)
                || gp.contains("conn:" + tid + ":w:" + page));
    }

    /**
     * 该页每个真实写端点的角色档（页面前缀直连 + SHARED_WRITE_PAGES 声明本页归属）。
     * 静态模型要「至少一个端点可用」才叫可写，因此必须保留逐端点档位，而不是只取最高档。
     */
    private static List<ConsoleRole> writeRoles(String pageKey, List<String> prefixes) {
        List<ConsoleRole> roles = new ArrayList<>();
        for (String write : WRITE_ENDPOINT_PATHS) {
            if (ConsoleAuthInterceptor.isReadonlyPost(write)) continue;
            if (!ownsWriteEndpoint(pageKey, prefixes, write)) continue;
            roles.add(ConsoleAuthInterceptor.requiredRole("POST", write));
        }
        return roles;
    }

    private static ConsoleRole maxRole(List<ConsoleRole> roles) {
        ConsoleRole need = null;
        for (ConsoleRole r : roles) {
            if (need == null || r.ordinal() > need.ordinal()) need = r;
        }
        return need;
    }

    /** 该页是否拥有该写端点（页面前缀直连，或被共享写映射声明为本页写能力）。 */
    private static boolean ownsWriteEndpoint(String pageKey, List<String> prefixes, String write) {
        if (prefixes != null) {
            for (String prefix : prefixes) {
                if (covers(prefix, write)) return true;
            }
        }
        List<String> shared = ConsoleAuthInterceptor.sharedWritePages(write);
        return shared != null && shared.contains(pageKey);
    }

    /**
     * 该页是否**只有**集群级动作写端点（diag 的 retry-failed 是唯一写）：
     * 用于把「硬门不过＝零写能力」如实回成 write=false。
     */
    private static boolean allWritesAreClusterScope(String pageKey, List<String> prefixes) {
        boolean any = false;
        for (String write : WRITE_ENDPOINT_PATHS) {
            if (ConsoleAuthInterceptor.isReadonlyPost(write)) continue;
            if (!ownsWriteEndpoint(pageKey, prefixes, write)) continue;
            any = true;
            if (!ConsoleAuthInterceptor.isClusterScopeWrite(write)) return false;
        }
        return any;
    }

    /** 页面前缀是否覆盖写端点（段边界：前缀等于端点或为端点父路径）。 */
    private static boolean covers(String prefix, String write) {
        if (write.equals(prefix)) return true;
        if (prefix.endsWith("/")) return write.startsWith(prefix);
        return write.startsWith(prefix + "/");
    }
}
