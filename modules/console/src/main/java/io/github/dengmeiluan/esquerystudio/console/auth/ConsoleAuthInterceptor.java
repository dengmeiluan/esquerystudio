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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

/**
 * 控制台鉴权拦截器（覆盖 {@code /internal/es/index/**} 与 {@code /internal/es/xmigrate/**}。
 *
 * <p>分级规则（傻瓜化默认，无需配置）：</p>
 * <ul>
 *   <li>GET → {@link ConsoleRole#VIEWER}（只读观测全放行给最低角色）</li>
 *   <li>POST/PUT/DELETE → {@link ConsoleRole#OPERATOR}（普通写：文档编辑、analyze、渲染等）</li>
 *   <li>高危清单 → {@link ConsoleRole#ADMIN}（重建/迁移/删索引/别名切换/集群 settings/raw 透传/用户管理）</li>
 *   <li>2.5.0 页面门（菜单 SPI）：delegated 身份且宿主下发 grantedPages 时，页面专属端点须命中白名单，
 *   先于角色门判定；共享端点（auth/setup/全局引导/多页共用）不吃页面级</li>
 * </ul>
 *
 * <p>未认证回 401 {@code {code:"UNAUTHORIZED"}}，权限不足回 403 {@code {code:"FORBIDDEN",required:"ADMIN"}}，
 * 前端据此弹登录框/提示升权。写操作在 afterCompletion 异步落 {@link ConsoleOpsAuditStore}。</p>
 *
 * @author aicoding
 */
public class ConsoleAuthInterceptor implements HandlerInterceptor {

    private static final Logger LOG = LoggerFactory.getLogger(ConsoleAuthInterceptor.class);

    /** connName 解析失败 WARN 节流间隔（审计是每写请求路径，防刷屏）。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    /** request attribute：已认证身份，供 auth controller / 审计复用。 */
    public static final String ATTR_PRINCIPAL = "es.console.principal";

    /** request attribute：归一化路径（canonicalize 后），供 afterCompletion 审计口径复用。 */
    public static final String ATTR_NORMALIZED_PATH = "es.console.normalizedPath";

    /** request attribute：拦截器入口时刻（毫秒）——审计耗时维度（。 */
    static final String ATTR_START_MS = "es.console.audit.startMs";

    /** request attribute：本次请求是否拥有完整别名写权（preHandle 已叠加 env 页模板收缩）。 */
    public static final String ATTR_ALIASES_FULL_WRITE = "es.console.aliases.fullWrite";

    /** request attribute：连接模型下是否允许 /cluster/inspect 回传样本文档（无文档读页时 false）。 */
    public static final String ATTR_INSPECT_SAMPLE_ALLOWED = "es.console.inspect.sampleAllowed";

    /** request attribute：本次写请求是否由 conn:{id}:w:{page} 写键直接授权（静态页/角色回落不置位）。
     *  护栏动作执行器据此决定能否跳过动作 minRole——混合模型静态回落仍须角色档。 */
    public static final String ATTR_CONN_WRITE_GRANTED = "es.console.connWriteGranted";

    /** request attribute：raw 透传执行摘要（"GET /_cat/indices" 形态）——由 /cluster/raw
     *  端点解析请求体后回填，afterCompletion 落入 HIGH_RISK detail（*  高危操作从「零法证」到「谁对哪个集群执行了什么」）。 */
    public static final String ATTR_RAW_SUMMARY = "es.console.raw.summary";

    /**
     * request attribute：本次 raw / devtools 透传<b>仅凭页面读键</b>准入（无写键、非 ADMIN）。
     *
     * <p>外层永远是 POST，拦截器看不到内层真实方法，所以这里只判「有没有资格进这个端点」，
     * 真正的读/写分档由执行端（{@code executePassthrough}）拿到内层 method 后再裁决：
     * 读方法放行、写方法拒绝。属性缺失=老路径/未打标，执行端按写口径 fail-closed。</p>
     */
    public static final String ATTR_PASSTHROUGH_READ_ONLY = "es.console.passthrough.readOnlyOnly";

    /** 带 body 请求的统一体积上限（字节）：与 raw 通道的 32M 字符守卫对齐，
     *  封住 @RequestBody 端点（Jackson 全量读入）的内存耗尽面。 */
    private static final long MAX_BODY_BYTES = 32L * 1024 * 1024;

    /** 免鉴权路径（登录本身 +  Setup 状态查询）。 */
    private static final List<String> WHITELIST = Arrays.asList(
            "/internal/es/index/auth/login",
            "/internal/es/index/setup/status");

    /**
     * 高危路径关键字（uri contains 匹配）→ ADMIN。
     * 覆盖：重建生命周期 / 跨集群迁移写 / 删索引删数据 / 别名与模板与脚本变更 /
     * 集群级 settings/reroute / raw 透传 / snapshot restore / 用户管理。
     */
    /* w66:ADMIN 一把抓拆为独立权限域 — 每域可独立授权,不再全靠超管。
     * REBUILD_OP:重建/迁移/回滚/锁/合并/副本/批量写
     * CLUSTER_OP:索引生命周期(mapping/settings/alias/模板/脚本/快照/ILM/分析器)
     * AUDIT_OP:审计日志查看
     * ADMIN(超管):用户管理 + raw 透传(安全底线不拆) */
    private static final List<String> REBUILD_KEYWORDS = Arrays.asList(
            "/rebuild", "/first-migrate", "/full-reload", "/cleanup", "/abort",
            "/lock/release", "/force-merge", "/replicas",
            "/cluster/update-by-query", "/cluster/bulk",
            /* reindex-advanced（@PostMapping，无 GET 形态）与 /rebuild 同族的
               重建写端点，原先落缺省 OPERATOR，升 rank3 */
            "/reindex-advanced",
            "/xmigrate/start", "/xmigrate/resume", "/xmigrate/abort",
            /* 迁移探测面（连接自检/取源配置/变量解析/预检）接受任意连接串并让服务端建连，
               属 SSRF/环境变量读取面——与迁移写同档 rank3，不再对 VIEWER 开放。 */
            "/xmigrate/connect-check", "/xmigrate/fetch-config", "/xmigrate/resolve-preview",
            "/xmigrate/preflight",
            /* 裸词 "/adhoc-rebuild" 退役（危险级重划）——adhoc 的 GET（任务列表/
               就绪检查）是观测面，裸 contains 把静态模型 VIEWER 也拦在门外（历史 403 噪声源）；
               写动词逐一列出即可覆盖全部写端点（start/abort/confirm-switch）。 */
            "adhoc-rebuild/start", "adhoc-rebuild/abort", "adhoc-rebuild/confirm-switch",
            /* 取消在途的 reindex/update-by-query/force-merge 等任务，破坏力与重建中止同族，
               原先落缺省 OPERATOR 档——与 abort 族对齐提档。 */
            "/cluster/tasks/cancel");

    private static final List<String> CLUSTER_KEYWORDS = Arrays.asList(
            "/cluster/delete-index", "/cluster/create-index",
            "/cluster/delete-by-id", "/cluster/delete-by-query",
            "/cluster/settings/put", "/cluster/reroute", "/cluster/reroute/retry-failed",
            "/cluster/alias-actions", "/cluster/rollover",
            "/cluster/templates/put", "/cluster/templates/delete",
            "/cluster/scripts/put", "/cluster/scripts/delete",
            /* 危险级重划补漏：删备份/改 ILM 策略/执行 SLM 原先落在缺省 rank2
               （OPERATOR 即可）——删快照毁备份、ILM 策略变更影响全索引生命周期，升 rank3。 */
            "/cluster/snapshot/delete",
            "/cluster/snapshot/restore", "/cluster/snapshot/create",
            "/cluster/ilm/policy", "/cluster/ilm/move", "/cluster/ilm/start", "/cluster/ilm/stop",
            "/cluster/slm/execute",
            "/cluster/index-settings/update", "/cluster/update-settings",
            "/cluster/mapping-put", "/cluster/put-mapping", "/cluster/analysis-update",
            "/cluster/synonyms-upsert", "/cluster/reload-analyzers");

    private static final List<String> AUDIT_KEYWORDS = Arrays.asList(
            "/auth/ops-audit", "/auth/audit-facets");

    /* 仅超管:用户管理 + raw 透传 + 系统管理(requiredRole 档位/审计分级用) */
    private static final List<String> ADMIN_KEYWORDS = Arrays.asList(
            "/auth/users",
            "/cluster/raw",
            "/cluster/devtools/execute",
            "/setup/rebind",  //  重绑控制集群（高危：控制面数据归属切换）
            /* 已绑定后 setup/apply|test 与 rebind 同族（控制面归属/凭据流转）——
               未绑定窗口在 SETUP 短路放行（早于角色门），bootstrap 不受影响 */
            "/setup/apply", "/setup/test",
            "/clusters/");  //  多集群连接保存/删除/测试（凭据流转）；GET /clusters 列表脱敏，VIEWER 可读
    /** 系统管理层（重绑/连接档案）：ADMIN 角色专属。用户管理归 security 页写键，
     *  由页面门裁决；账号服务再限制非 ADMIN 不得授予/修改/删除 ADMIN（防提权）。 */
    private static final List<String> SYSTEM_ADMIN_KEYWORDS = Arrays.asList(
            "/setup/rebind", "/setup/apply",
            "/clusters/");
    /**
     * 集群级开关/集群级动作（连接模型补 rank 硬门）。
     *
     * <p>连接模型的语义是「页面写键即最终裁决」，角色门被短路——对绝大多数页面端点这是
     * 正确的（勾选即权限）。但下列端点<b>不带任何索引参数</b>，直接作用于目标集群全局：</p>
     * <ul>
     *   <li>{@code /cluster/ilm/start|stop}：启停整集群的 ILM 执行（lifecycle 页的语义是
     *       单索引 rollover / 推进步骤）；</li>
     *   <li>{@code /cluster/reroute/retry-failed}：对全集群未分配分片重试分配（diag 页
     *       其余端点全是只读诊断）。</li>
     *   <li>{@code /cluster/ilm/policy}：增删改 ILM 策略是集群级共享件，影响所有引用它的
     *       索引；ilm 页只读 explain、lifecycle 页是单索引动作，都不是策略编辑语义。</li>
     *   <li>{@code /cluster/slm/execute}：立即触发全集群快照策略（备份面）。</li>
     *   <li>{@code /cluster/tasks/cancel}：任务 id 不携带归属，取消的是别人的重建/快照/回滚。</li>
     * </ul>
     * <p>把这些能力挂在一页的写键上，等于用单页授权换集群级操作。这里补回静态模型已有的
     * rank3 档位：ADMIN / 三个 rank3 专项（含宿主映射的 CLUSTER_OP）不受影响，
     * 只有 rank2 的 OPERATOR 被拦（其页面写键仍可做页内动作）。</p>
     */
    private static final List<String> CLUSTER_SCOPE_WRITE_KEYWORDS = Arrays.asList(
            "/cluster/ilm/start", "/cluster/ilm/stop", "/cluster/ilm/policy",
            "/cluster/reroute/retry-failed", "/cluster/slm/execute", "/cluster/tasks/cancel");
    /** 审计分级专用（不参与授权）：破坏性数据/控制面操作一律记 HIGH_RISK。 */
    private static final List<String> HIGH_RISK_AUDIT_KEYWORDS = Arrays.asList(
            "/cluster/delete-index", "/cluster/delete-by-id", "/cluster/delete-by-query",
            "/cluster/snapshot/restore", "/cluster/snapshot/delete",
            /* 已存脚本是集群级共享件：装卸会即时改变他人查询/模板的行为，删除更不可逆 */
            "/cluster/scripts/put", "/cluster/scripts/delete",
            "/cluster/templates/delete", "/cluster/ilm/stop", "/cluster/slm/execute",
            "/cluster/settings/put", "/cluster/reroute", "/auth/users/delete",
            "/auth/users/upsert", "/xmigrate/start", "/xmigrate/resume",
            /* 1132：这两个此前只落 WRITE。rebuild-empty 删索引后重建（数据不可逆），
               adhoc confirm-switch 把写别名切到新索引（流量归属切换，回退需另一次切换）——
               都属「破坏性/控制面」，与 delete-index、xmigrate/start 同级。 */
            "/rebuild-empty", "adhoc-rebuild/confirm-switch");
    /** 执行类只读 POST（零数据写入但执行脚本/消耗资源）——落 EXEC 审计留痕。 */
    private static final List<String> EXEC_AUDIT_POST_KEYWORDS = Arrays.asList(
            "/cluster/analyze", "/cluster/reindex-preview", "/config-lab/validate",
            /* 只读语义但会创建/关闭服务端资源或游标：落 EXEC 留痕（谁锁了哪个 PIT/游标） */
            "/cluster/pit/open", "/cluster/pit/close",
            "/cluster/sql/cursor", "/cluster/sql/close");

    private static boolean isSystemAdminUri(String uri) {
        // 探活是只读观测（POST 但零副作用），不受系统管理 ADMIN 门约束（requiredRole 特判 VIEWER）
        if (uri != null && uri.endsWith("/probe")) return false;
        for (String kw : SYSTEM_ADMIN_KEYWORDS) {
            if (uri.contains(kw)) return true;
        }
        return false;
    }

    /**
     * 连接档案根路径的<b>写</b>形态（{@code POST /internal/es/index/clusters}）。
     *
     * <p>{@code "/clusters/"} 依赖尾斜杠，只覆盖子路径；根路径的批量导入/同步写
     * 会漏到 OPERATOR。GET 列表是脱敏只读观测（VIEWER 可读），不在此列——
     * 不能用根路径一刀切把有读权限的人拦在门外。</p>
     */
    private static boolean isClustersRootWrite(String uri, String method) {
        return uri != null && uri.endsWith("/internal/es/index/clusters")
                && !"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method);
    }

    /** 集群级开关（见 {@link #CLUSTER_SCOPE_WRITE_KEYWORDS}）：段边界尾匹配，不吃前缀子路径。 */
    static boolean isClusterScopeWrite(String uri) {
        if (uri == null) return false;
        for (String kw : CLUSTER_SCOPE_WRITE_KEYWORDS) {
            if (uri.endsWith(kw)) return true;
        }
        return false;
    }

    /**
     * -C1 只读 POST 清单（DSL/SQL 必须走 body 才用 POST，零副作用）。
     * 审计与 GET 同策略——不落流水：查询类每翻一页就一条，噪音会把真正的写操作淹没（产线截图实锤：
     * 三条 POST /cluster/query 被记成 WRITE，合规回溯时误导「谁改了数据」）。
     */
    private static final List<String> READONLY_POST_KEYWORDS = Arrays.asList(
            "/cluster/query", "/cluster/profile", "/cluster/count",
            "/cluster/search-dsl", "/cluster/search-raw", "/cluster/search-template", "/cluster/render-template",
            "/cluster/validate-query", "/cluster/explain-doc", "/cluster/allocation-explain",
            "/cluster/analyze", "/cluster/reindex-preview",
            "/cluster/sql", "/cluster/pit/",
            "/insight/settings-impact");
    /* Painless 执行是“可执行脚本”而非纯查询：消费 CPU/可在 filter/score 上下文
       读取文档（含控制索引）。按写档（OPERATOR/页写键）裁决，不再借只读 POST 放行。 */

    /**
     * 共享写端点 → 合法页面写键归属（conn 模型）。
     *
     * <p>这些端点没有独占的页面前缀（文档 CRUD/任务取消/ILM 策略等被多页复用），原实现
     * 按“任意写键”放行——持 optimizer 写键即可删文档/取消重建任务/改 ILM 策略。
     * 改为：必须持有至少一个真实使用该端点的页面写键；未登记的共享写回落角色门（保守）。
     * 前端 auth.canEndpoint 必须镜像同一张表（防“看得见点不了/看不见能直调”）。</p>
     */
    private static final java.util.Map<String, List<String>> SHARED_WRITE_PAGES;
    static {
        java.util.Map<String, List<String>> m = new java.util.LinkedHashMap<>();
        /* browser 只有文档读面（列表/查看/深链），没有编辑入口：w:browser 不得隐式获得文档覆盖权。 */
        m.put("/cluster/doc/update", Arrays.asList("search", "indices", "doc-diff"));
        m.put("/cluster/doc", Arrays.asList("search", "indices", "doc-diff"));
        m.put("/cluster/update-document", Arrays.asList("search", "indices", "doc-diff"));
        m.put("/cluster/update-partial", Arrays.asList("search", "indices", "doc-diff"));
        m.put("/cluster/delete-by-id", Arrays.asList("search", "indices"));
        m.put("/cluster/delete-by-query", Arrays.asList("search", "update-by-query"));
        m.put("/cluster/tasks/cancel", Arrays.asList("tasks", "task-tree"));
        m.put("/cluster/ilm/policy", java.util.Collections.singletonList("ilm"));
        m.put("/cluster/ilm/move", Arrays.asList("ilm", "lifecycle"));
        m.put("/cluster/index-settings/update", Arrays.asList("index-settings", "indices", "optimizer"));
        /* 热 Setting 的两个入口必须同页集：update-settings 原先只吃 mapping 页前缀，
           而真正持有热更写键的 index-settings/indices/optimizer 反而被 403（有权限的人被拦）。
           同一 PUT _settings 能力，页集对齐后不新增任何写面。 */
        m.put("/cluster/update-settings", Arrays.asList("mapping", "index-settings", "indices", "optimizer"));
        m.put("/cluster/reload-analyzers", Arrays.asList("analysis-settings", "synonyms"));
        m.put("/cluster/reroute", java.util.Collections.singletonList("cluster-settings"));
        m.put("/cluster/alias-actions", Arrays.asList("aliases", "config-validator", "indices"));
        /* retry-failed 是 reroute 的子集（只能重试未分配分片）：持 cluster-settings 写键的人
           本来就能执行任意 reroute，若反而做不了更窄的 retry 就是口径倒挂（有权限的人被拦）。 */
        m.put("/cluster/reroute/retry-failed", Arrays.asList("diag", "cluster-settings"));
        /* ilm/start|stop 是集群级开关，与 cluster-settings 页的语义同级：集群设置写键持有人
           不应被「lifecycle 页写键」这一更窄的入口挡住（rank 档位仍由 CLUSTER_SCOPE 硬门把控）。 */
        m.put("/cluster/ilm/start", Arrays.asList("lifecycle", "cluster-settings"));
        m.put("/cluster/ilm/stop", Arrays.asList("lifecycle", "cluster-settings"));
        /* 建索引同时服务“索引工作区”的快速新建与“配置校验器”的校验后落地 */
        m.put("/cluster/create-index", Arrays.asList("config-validator", "indices"));
        m.put("/cluster/scripts/put", Arrays.asList("search-templates", "painless-lab"));
        m.put("/cluster/scripts/delete", Arrays.asList("search-templates", "painless-lab"));
        /* 脚本执行不是只读查询：可消费 CPU 并读取 filter/score 上下文文档，按本页写键放行。 */
        m.put("/cluster/painless/execute", java.util.Collections.singletonList("painless-lab"));
        /* DevTools 独立执行端点：rest 写键兼容旧授权，devtools 写键可单独授权。 */
        m.put("/cluster/devtools/execute", Arrays.asList("rest", "devtools"));
        /* MCP key 管理属于 DevTools 的接入面：写键持有者才能签发/撤销；服务端仍按
           owner/ADMIN 做第二道所有权校验，页面键不能替代所有权。 */
        m.put("/mcp/keys", java.util.Collections.singletonList("devtools"));
        /* 护栏动作按动作归属页裁决：apply-index-settings 是 index-settings 页的保存出口；
           未登记的新动作在连接模型下一律拒绝（防未来动作回落角色门绕过页面写键）。 */
        m.put("/insight/actions/apply-index-settings",
                Arrays.asList("index-settings", "indices", "optimizer"));
        SHARED_WRITE_PAGES = java.util.Collections.unmodifiableMap(m);
    }

    /**
     * 共享读端点 → 允许读取的页面写/读键。这些端点没有页面归属（pageOf=null），
     * 连接模型下若只按角色门放行，任意页面授权用户都能读业务数据——必须按页面读键裁决。
     */
    private static final java.util.Map<String, List<String>> SHARED_READ_PAGES;
    static {
        java.util.Map<String, List<String>> m = new java.util.LinkedHashMap<>();
        m.put("/cluster/query", Arrays.asList("search", "indices", "analyzer-lab"));
        m.put("/cluster/search-dsl", Arrays.asList("search", "profile-flame", "update-by-query"));
        m.put("/cluster/search-template", java.util.Collections.singletonList("search-templates"));
        m.put("/cluster/search-raw", Arrays.asList("search", "indices", "browser", "analyzer-lab",
                "update-by-query", "bulk", "doc-diff", "boost-tuner", "rank-debug",
                "score-explain", "match-matrix", "query-xray", "profile-flame"));
        m.put("/cluster/profile", Arrays.asList("search", "indices"));
        m.put("/cluster/count", Arrays.asList("search", "indices"));
        m.put("/cluster/explain-doc", Arrays.asList("rank-debug", "search", "indices"));
        m.put("/cluster/validate-query", Arrays.asList("query-xray", "search"));
        m.put("/cluster/term-vectors", java.util.Collections.singletonList("query-xray"));
        /* 文档读取：只允许真实有文档面权限的页面，不能再让任意 conn 读键直读业务文档 */
        m.put("/cluster/doc", Arrays.asList("search", "indices", "browser", "doc-diff"));
        /* 跨页只读复用：mapping 页用 inspect 载索引概览；lifecycle 用 ilm/explain；
           workspace 用 sql/health-report；live 用 ring-usage。 */
        /* /cluster/indices 是全局索引选择器的基线读（所有页面开屏都要用），维持连接内任意页面可见；
           控制面索引名已由服务端按 ADMIN 过滤。 */
        m.put("/cluster/inspect", Arrays.asList("indices", "mapping", "search", "config-validator", "adhoc-rebuild"));
        m.put("/cluster/ilm/explain", Arrays.asList("ilm", "lifecycle"));
        m.put("/cluster/ilm/policies", Arrays.asList("ilm", "lifecycle"));
        m.put("/cluster/templates", Arrays.asList("templates", "templates-gallery"));
        m.put("/cluster/shards", Arrays.asList("overview", "indices", "topology"));
        /* workspace 工作台的「任务数/远程集群」卡片复用这两个只读端点 */
        m.put("/cluster/task-detail", Arrays.asList("tasks", "task-tree", "workspace"));
        m.put("/cluster/remote-clusters", Arrays.asList("remote-clusters", "workspace"));
        m.put("/cluster/sql", Arrays.asList("search", "workspace"));
        m.put("/cluster/health-report", Arrays.asList("health-report", "workspace"));
        m.put("/insight/settings-impact", Arrays.asList("index-settings", "optimizer"));
        m.put("/monitor-metrics", Arrays.asList("overview", "live"));
        m.put("/monitor-history", Arrays.asList("overview", "live"));
        m.put("/monitor-alerts", Arrays.asList("overview", "live"));
        m.put("/ring-usage", Arrays.asList("overview", "topology", "live"));
        m.put("/cluster/tasks", Arrays.asList("tasks", "task-tree"));
        /* 无页前缀的集群只读端点：按真实调用页收口，不能让任意 conn 读键拿到脚本源码/
           mapping/settings/节点清单等超出本页的数据面信息。 */
        m.put("/cluster/index-settings", Arrays.asList("index-settings", "indices", "optimizer"));
        /* 更长片段优先：mapping 页读默认值不能被热更页的共享读误拦 */
        m.put("/cluster/index-settings-defaults", Arrays.asList("mapping", "index-settings", "indices", "optimizer"));
        m.put("/cluster/aliases", Arrays.asList("aliases", "indices", "browser"));
        m.put("/cluster/scripts", Arrays.asList("painless-lab", "search-templates"));
        m.put("/cluster/mapping-detail",
                Arrays.asList("mapping", "mapping-designer", "indices", "analyzer-lab",
                        "search", "browser", "doc-diff"));
        m.put("/cluster/analysis-settings", Arrays.asList("analysis-settings", "analyze", "mapping", "synonyms"));
        m.put("/cluster/nodes-stats-brief", Arrays.asList("topology", "overview", "live"));
        m.put("/cluster/shard-stores", Arrays.asList("topology", "indices", "overview"));
        m.put("/cluster/analyze", Arrays.asList("analyze", "analyzer-lab", "analysis-settings"));
        /* 宿主 provider 只读面：已登记索引键/漂移报告同样按真实使用页收口。
           /es/index/keys 精确到段，避免误吞 /config-lab/drift/keys。 */
        m.put("/es/index/keys", java.util.Collections.singletonList("xmigrate"));
        /* MCP key 列表是 DevTools 接入面板的读面；非 ADMIN 只返回自己的 key。 */
        m.put("/mcp/keys", java.util.Collections.singletonList("devtools"));
        m.put("/desired-state", Arrays.asList("config-drift", "adhoc-rebuild", "indices", "mapping"));
        /* .html 变体是同一端点的直出页形态，段边界匹配不吞后缀，须单独登记。 */
        m.put("/desired-state.html", Arrays.asList("config-drift", "adhoc-rebuild", "indices", "mapping"));
        m.put("/mapping-reconcile/report", Arrays.asList("config-drift", "indices", "mapping"));
        /* 任务进度是跨页读取：DBQ/UBQ/reindex/DSL 都可能轮询同一 taskId */
        m.put("/progress", Arrays.asList("indices", "update-by-query", "reindex-advanced",
                "search", "tasks", "task-tree", "adhoc-rebuild"));
        /* 迁移作业进度同路径族：更长片段优先于通用 /progress，否则 only-xmigrate 用户被误拒，
           而 search/tasks 页用户反能读到迁移作业元数据。 */
        m.put("/xmigrate/progress", java.util.Collections.singletonList("xmigrate"));
        /* 宿主锁健康：只允许真实消费它的观测页读取（Overview 对纯连接用户会跳过调用）。 */
        m.put("/internal/es/index/health", Arrays.asList("overview", "diag", "health-report"));
        SHARED_READ_PAGES = java.util.Collections.unmodifiableMap(m);
    }

    /** 最长片段匹配的共享读页面集合；无登记返回 null（调用方维持既有角色/页面门）。 */
    static List<String> sharedReadPages(String path) {
        List<String> best = null;
        int bestLen = -1;
        for (java.util.Map.Entry<String, List<String>> e : SHARED_READ_PAGES.entrySet()) {
            if (sharedPathMatches(path, e.getKey()) && e.getKey().length() > bestLen) {
                best = e.getValue();
                bestLen = e.getKey().length();
            }
        }
        return best;
    }

    /**
     * 恒定作用于宿主集群的路径（执行侧不跟随 X-Es-Target）。与 {@code EsTargetInterceptor}
     * 的数据面白名单同口径，另有连接维度的宿主侧读端点（监控行级过滤/连接目录/自助/迁移）
     * 不计入：它们按目标头取页面授权是设计语义，但执行仍在宿主，读结果已按连接收口。
     */
    static boolean isHostBoundPath(String path) {
        return isHostBoundPath(path, "GET");
    }

    /**
     * 环境封顶裁决：该请求所属页面是否被连接的 env 模板排除。返回被排除的页面 key（未越界返回 null）。
     *
     * <p>与 {@code effectivePages} 的「取交集」不同，这里是<b>逐请求</b>判定：交集只决定
     * 「授权集里还剩哪些页」，而 ADMIN 会在页面门提前放行、根本不看交集。要让 env 真正约束
     * ADMIN，必须在 ADMIN 豁免之前单独判一次「这个请求归哪个页、这个页在不在环境模板里」。</p>
     *
     * <p>页面归属的取法（从严）：页面前缀优先；无前缀时看共享写映射（raw/devtools 这类
     * 多页复用端点），任一归属页在模板内即放行——共享端点本就允许被多页复用，只要环境
     * 允许其中一页就不该拦。<b>两者都判不出归属时不封顶</b>（读端点如 keys/desired-state
     * 是跨页基础读，封顶会误伤有权限的人）。</p>
     */
    private String envCapViolation(String path, javax.servlet.http.HttpServletRequest request) {
        if (envPagesResolver == null || path == null) return null;
        String method = request == null ? "GET" : request.getMethod();
        /* 宿主专属端点恒在宿主执行：带了远端目标头也不落在那个环境里。
           实测：当前自举端点（auth/me、clusters、setup、keys 等）即便没有这一行也会因
           「判不出页归属」返回 null 而放行，所以它是**防御性**的——防的是将来 pageCatalog
           给某个自举端点挂上页前缀后，PROD 视图把自助面封掉（看不见菜单/退不出）。 */
        if (isHostBoundPath(path, method)) return null;
        String targetId = request == null ? null : request.getHeader("X-Es-Target");
        java.util.Set<String> cap = envPagesResolver.pagesFor(
                targetId == null || targetId.trim().isEmpty() ? "host" : targetId.trim());
        if (cap == null) return null; /* 该连接未配环境模板：不收缩（原样行为） */
        ConsolePageCatalog.Page page = pageCatalog.pageOf(path);
        if (page != null) {
            return cap.contains(page.getKey()) ? null : page.getKey();
        }
        if (!"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)
                && !"OPTIONS".equalsIgnoreCase(method)) {
            List<String> shared = sharedWritePages(path);
            if (shared != null && !shared.isEmpty()) {
                for (String k : shared) {
                    if (cap.contains(k)) return null;
                }
                return shared.get(0);
            }
        }
        return null;
    }

    /**
     * 该路径是否跟随 {@code X-Es-Target} 执行（与 {@code EsTargetInterceptor} 同一判定）。
     * 审计归属必须与真实执行集群一致：宿主专属端点即使带了远端目标头，也不能记到远端连接账上。
     */
    public static boolean followsTarget(String path, String method) {
        if (path == null) return false;
        String p = path;
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        if (p.contains("/cluster/") || p.contains("/insight")
                || p.contains("/config-lab/validate")
                || p.endsWith("/internal/es/index/progress")) return true;
        return p.endsWith("/adhoc-rebuild/prepare") || p.endsWith("/adhoc-rebuild/start");
    }

    /** 本次请求的真实执行目标：不跟随目标头的端点一律 host。 */
    static String executionTarget(String path, String method, String headerTarget) {
        if (!followsTarget(path, method)) return "host";
        if (headerTarget == null || headerTarget.trim().isEmpty()) return "host";
        return "host".equalsIgnoreCase(headerTarget.trim()) ? "host" : headerTarget.trim();
    }

    /**
     * 审计归属目标：执行在宿主、但操作对象是连接工作流的端点（迁移/托管重建）
     * 仍记到请求目标连接，否则 conn:{id}:security 看不到自己的迁移事件，
     * 而 conn:host:security 反而看到跨连接操作。
     */
    static String auditTarget(String path, String method, String headerTarget) {
        boolean connectionWorkflow = path != null
                && (path.contains("/xmigrate/") || path.contains("/adhoc-rebuild/"));
        if (!followsTarget(path, method) && !connectionWorkflow) return "host";
        if (headerTarget == null || headerTarget.trim().isEmpty()) return "host";
        return "host".equalsIgnoreCase(headerTarget.trim()) ? "host" : headerTarget.trim();
    }

    static boolean isHostBoundPath(String path, String method) {
        if (path == null) return false;
        if (path.contains("/cluster/") || path.contains("/insight")
                || path.contains("/config-lab/validate")
                || path.endsWith("/internal/es/index/progress")
                || path.contains("/adhoc-rebuild/")) {
            return false;
        }
        if (path.contains("/monitor-metrics") || path.contains("/monitor-history")
                || path.contains("/monitor-alerts") || path.contains("/ring-usage")) {
            return false;
        }
        /* 宿主 provider 的只读辅助面：执行仍在宿主，但页面授权按当前目标选择——
           Xmigrate（/keys）、ConfigDrift/Adhoc（desired-state/mapping-reconcile）是
           目标工作流的一部分，强制 host 授权会把已授权连接用户挡在页面外。
           只对只读请求生效：未来若在这些前缀下新增写端点，仍按 host 授权。 */
        boolean readOnly = "GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method)
                || "OPTIONS".equalsIgnoreCase(method) || isReadonlyPost(path);
        if (readOnly && (path.endsWith("/es/index/keys") || path.contains("/desired-state")
                || path.contains("/mapping-reconcile/report"))) {
            return false;
        }
        /* 概览页主聚合读（登记 indexKey 的状态摘要+本实例 owner）：与 /keys 同类——
           执行恒在宿主，但它是概览页随目标选择消费的读端点，纯连接授权用户
           （grantedPages 只有 conn:{id}:* 键）按 host 授权会落空页集被页面门 403。
           只放行读；该前缀下未来若新增写端点仍按 host 授权。 */
        if (readOnly && path.endsWith("/internal/es/index/overview")) {
            return false;
        }
        if (path.contains("/clusters") || path.contains("/xmigrate/")
                || path.contains("/setup/")) {
            return false;
        }
        /* 本地账号管理恒定宿主（远端连接不存在本地账号库）；审计流水仍按目标连接行级过滤。 */
        if (path.contains("/auth/")) {
            return path.contains("/auth/users");
        }
        return true;
    }

    /** 空页面授权仍必须放行的自举/自助端点（身份、退出、改密、权限自查、setup 状态、
     * 基础健康探针）。连接目录（GET /clusters 精确形态）也在列：它是「获知自己有哪些
     * 可切换授权目标」的唯一自助通道——拒掉它会让纯连接授权用户（宿主维度无键）既看不到
     * 菜单也拿不到可切换列表，形成无法自救的死锁环（前端 autoPickConnTarget 依赖该目录
     * 自动落位到首个授权连接）。列表本身已按 minRole+可见性过滤，不泄露未授权连接。 */
    private static boolean isBootstrapPath(String path) {
        return path.endsWith("/auth/me") || path.endsWith("/auth/logout")
                || path.endsWith("/auth/change-password") || path.endsWith("/auth/permissions")
                || path.endsWith("/auth/ops-audit/mine") || path.endsWith("/setup/status")
                /* 平台 UI 配置（品牌/功能包/停用页）零敏感信息：空页集身份也要能读，
                   否则前端无法区分「模块未启用」与「无权限」。 */
                || path.endsWith("/ui/config")
                || path.endsWith("/cluster/health")
                || path.endsWith("/internal/es/index/health")
                || path.endsWith("/internal/es/index/clusters")
                /* MCP key 管理是跨连接的宿主自举面：页面门不能按当前 X-Es-Target 的
                   conn:{id}:devtools 单连接裁决，否则只有某一连接授权的用户被误拦；
                   McpKeyController 自行校验 owner/角色/连接级权限。 */
                || path.contains("/internal/es/index/mcp/keys")
                /* 连接目录的同步状态是连接页轮询刷新（只读、已按可见性过滤）：
                   与目录本身同属自举面——零页用户在「连接被撤权后重新定位授权」时
                   也要靠它刷新，不能只豁免目录不豁免 sync。 */
                || path.endsWith("/internal/es/index/clusters/sync");
    }

    /** 只有真实持有文档读面的页面才允许索引详情携带样本文档；纯 mapping 元数据页只回结构。 */
    static boolean inspectSampleAllowed(java.util.Set<String> effectivePages) {
        if (effectivePages == null || effectivePages.isEmpty()) return false;
        for (String page : new String[]{"indices", "search", "browser", "doc-diff"}) {
            if (effectivePages.contains(page)) return true;
        }
        return false;
    }

    /** 共享端点匹配必须落在段边界：apply-index-settings 不得命中 apply-index-settings-extra。 */
    private static boolean sharedPathMatches(String path, String key) {
        int i = path.indexOf(key);
        while (i >= 0) {
            int end = i + key.length();
            if (end == path.length() || path.charAt(end) == '/' || path.charAt(end) == '?') return true;
            i = path.indexOf(key, i + 1);
        }
        return false;
    }

    /** 最长片段匹配的共享写页面集合；无登记返回 null（调用方回落角色门）。 */
    static List<String> sharedWritePages(String path) {
        List<String> best = null;
        int bestLen = -1;
        for (java.util.Map.Entry<String, List<String>> e : SHARED_WRITE_PAGES.entrySet()) {
            if (sharedPathMatches(path, e.getKey()) && e.getKey().length() > bestLen) {
                best = e.getValue();
                bestLen = e.getKey().length();
            }
        }
        return best;
    }

    /**
     * 静态页（全局授权）在混合/纯静态模型下是否真正解锁任一共享写端点：
     * 页面可见 + 该端点角色档达标。权限面板回显必须与实际执行门同序。
     */
    static boolean hasStaticSharedWriteGrant(java.util.Set<String> grantedPages,
                                             java.util.Set<String> effectivePages, ConsoleRole role) {
        if (grantedPages == null || effectivePages == null || role == null) return false;
        for (Map.Entry<String, List<String>> e : SHARED_WRITE_PAGES.entrySet()) {
            if (!role.atLeast(requiredRole("POST", e.getKey()))) continue;
            for (String page : e.getValue()) {
                if (grantedPages.contains(page) && effectivePages.contains(page)) return true;
            }
        }
        return false;
    }

    /**
     * conn 模型下是否持有任一共享写端点的合法页面写键（权限面板 sharedWriteAllowed 用）。
     * effectivePages 必须已按 env 模板收缩：否则面板报“可写”而实际写门 403。
     */
    static boolean hasSharedWriteGrant(String targetId, java.util.Set<String> grantedPages,
                                       java.util.Set<String> effectivePages) {
        if (targetId == null || targetId.isEmpty() || grantedPages == null) return false;
        for (List<String> pages : SHARED_WRITE_PAGES.values()) {
            for (String page : pages) {
                if (effectivePages != null && !effectivePages.contains(page)) continue;
                if (grantedPages.contains(EnvPagesResolver.CONN_KEY_PREFIX + targetId + ":w:" + page)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * alias-actions 的动作级收口：config-validator 页只会“建索引后 add 挂载别名”，
     * 不能借共享写映射执行 remove/remove_index；aliases 页写权不受限。
     */
    public static boolean aliasActionsAddOnly(HttpServletRequest request) {
        Object p = request == null ? null : request.getAttribute(ATTR_PRINCIPAL);
        if (!(p instanceof ConsolePrincipal)) return false;
        ConsolePrincipal cp = (ConsolePrincipal) p;
        if (cp.getRole().atLeast(ConsoleRole.ADMIN)) return false;
        java.util.Set<String> gp = cp.getGrantedPages();
        if (gp == null) return false;
        String h = request.getHeader("X-Es-Target");
        String tid = h == null || h.trim().isEmpty() ? "host" : h.trim();
        if ("host".equalsIgnoreCase(tid)) tid = "host";
        Object full = request.getAttribute(ATTR_ALIASES_FULL_WRITE);
        if (full instanceof Boolean) {
            return !((Boolean) full);
        }
        boolean aliases = gp.contains(EnvPagesResolver.CONN_KEY_PREFIX + tid + ":w:aliases")
                /* 静态 aliases 页键在连接模型里只是可见性；只有角色达写档时才等于完整别名写权。 */
                || (gp.contains("aliases")
                    && cp.getRole().atLeast(requiredRole("POST", "/internal/es/index/cluster/alias-actions")));
        boolean validator = gp.contains("config-validator")
                || gp.contains(EnvPagesResolver.CONN_KEY_PREFIX + tid + ":w:config-validator");
        /* indices 页的写键包含「建索引」，建索引时顺手挂别名是同一工作流的一步；
           但删别名/摘别名属于 aliases 页语义，indices 侧同样只允许 add。 */
        boolean indicesPage = gp.contains("indices")
                || gp.contains(EnvPagesResolver.CONN_KEY_PREFIX + tid + ":w:indices");
        return (validator || indicesPage) && !aliases;
    }

    /** 矩阵参数（每个路径段的 {@code ;...}）：与 Spring UrlPathHelper.removeSemicolonContent 同口径。 */
    private static final Pattern MATRIX_PARAM = Pattern.compile(";[^/]*");

    /** 审计 detail 控制符清洗（日志注入防护：CR/LF/TAB 与 C0/C1 控制符一律折成空格）。 */
    private static final Pattern AUDIT_CTRL = Pattern.compile("[\\r\\n\\t\\u0000-\\u001f\\u007f]");

    private final EsConsoleAuthorizer authorizer;
    private final ConsoleOpsAuditStore opsAuditStore;
    private final io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver resolver;
    private final ConsolePageCatalog pageCatalog;
    private final boolean pageAuthEnabled;
    /*  P2-4 v2：连接环境页面模板（env-pages profile）——纯 grantedPages 同构方案 */
    private final EnvPagesResolver envPagesResolver;
    /* 连接档案——审计的集群实名维度（connId → connName）；可为 null（测试桩） */
    private final io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore connStore;
    /** 受信代理清单（见构造器 javadoc）：非空时审计来源 IP 只认清单内直连方转发的转发头。 */
    private final List<String> trustedProxies;
    /** connName 解析失败 WARN 节流计数（实例级——拦截器产线单例）。 */
    private final AtomicLong lastConnNameWarnAt = new AtomicLong(0);

    /** 宿主集群是否作为数据面目标暴露（host-cluster-visible，默认 true）。纯管理平台形态
     *  设 false 时，非 ADMIN 不得借残留的 conn:host 授权直捣宿主数据面/托管重建 provider。 */
    private boolean hostClusterVisible = true;

    /** 由自动配置注入（见 ESQueryStudioConsoleAutoConfiguration）；测试可显式设置。 */
    public void setHostClusterVisible(boolean hostClusterVisible) {
        this.hostClusterVisible = hostClusterVisible;
    }

    /** insight 护栏动作注册表（可选注入：1031 fail-closed——未登记 actionId 的写请求
        在授权层直接拒绝，不落兜底角色门；null=旧装配形态，检查跳过）。 */
    private io.github.dengmeiluan.esquerystudio.console.insight.action.GuardedActionRegistry guardedActionRegistry;

    public void setGuardedActionRegistry(io.github.dengmeiluan.esquerystudio.console.insight.action.GuardedActionRegistry guardedActionRegistry) {
        this.guardedActionRegistry = guardedActionRegistry;
    }
    /* 委托令牌首见登记（会话 LOGIN 审计去重）——LRU 封顶防长期运行膨胀；
       令牌即会话标识（宿主 会话期内令牌稳定，换发即新会话）。 */
    private final java.util.Map<String, Long> seenDelegateTokens =
            java.util.Collections.synchronizedMap(new java.util.LinkedHashMap<String, Long>(16, 0.75f, false) {
                @Override
                protected boolean removeEldestEntry(java.util.Map.Entry<String, Long> eldest) {
                    return size() > 500;
                }
            });

    public ConsoleAuthInterceptor(EsConsoleAuthorizer authorizer, ConsoleOpsAuditStore opsAuditStore,
                                  io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver resolver,
                                  ConsolePageCatalog pageCatalog, boolean pageAuthEnabled,
                                  EnvPagesResolver envPagesResolver,
                                  io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore connStore) {
        this(authorizer, opsAuditStore, resolver, pageCatalog, pageAuthEnabled, envPagesResolver,
                connStore, java.util.Collections.emptyList());
    }

    /**
     * @param trustedProxies 受信代理清单（精确 IP 或 IPv4 CIDR）：非空时<b>只有清单内的直连方</b>
     *                       才有资格转发客户端地址（X-Forwarded-For / X-Real-IP）；为空时沿用
     *                       「回环/私网即代理」的历史启发式。与 header 委托模式的
     *                       {@code trusted-proxies} 同一份配置——审计来源与身份采信必须同源，
     *                       否则内网直连者可伪造 XFF 污染审计并绕过登录节流。
     */
    public ConsoleAuthInterceptor(EsConsoleAuthorizer authorizer, ConsoleOpsAuditStore opsAuditStore,
                                  io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver resolver,
                                  ConsolePageCatalog pageCatalog, boolean pageAuthEnabled,
                                  EnvPagesResolver envPagesResolver,
                                  io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore connStore,
                                  List<String> trustedProxies) {
        this.authorizer = authorizer;
        this.opsAuditStore = opsAuditStore;
        this.resolver = resolver;
        this.pageCatalog = pageCatalog;
        this.pageAuthEnabled = pageAuthEnabled;
        this.envPagesResolver = envPagesResolver;
        this.connStore = connStore;
        this.trustedProxies = trustedProxies == null
                ? java.util.Collections.emptyList() : trustedProxies;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 审计耗时起点（覆盖拒绝/放行全程）
        request.setAttribute(ATTR_START_MS, System.currentTimeMillis());
        // 授权判定一律走归一化路径：raw requestURI 直接匹配会被 ;矩阵参数 与 %编码 变形绕过
        // （pageOf 失配误判「共享端点」放行、/%72ebuild 逃 ADMIN 提档）
        String path = normalizePath(request);
        if (path == null) {
            // 畸形路径（非法 % 序列/UTF-8 解码失败/.. 越界）fail-closed：非授权事件，不落 PAGE_DENIED 审计
            deny(response, 400, "{\"code\":\"BAD_PATH\",\"message\":\"请求路径非法：无法解码或含非法 % 序列\"}");
            return false;
        }
        request.setAttribute(ATTR_NORMALIZED_PATH, path);
        /* 带 body 请求的统一体积上限：raw 透传有自己的 32M 字符守卫，其余 @RequestBody
           端点此前无任何应用层限制（容器 maxPostSize 只管 form 编码）——认证用户
           POST 数百 MB JSON 会被 Jackson 全量读入，属内存耗尽面。32MB 与 raw 对齐。 */
        String reqMethod = request.getMethod();
        long bodyLen;
        boolean lenKnown = true;
        try {
            bodyLen = request.getContentLengthLong();
        } catch (UnsupportedOperationException e) {
            /* 最小桩/极老容器没有这个方法：**不是攻击面**（真实 Servlet 容器都实现它），
               不能因此拒绝——否则所有不带该方法的合法调用方都会被 411 掉。 */
            bodyLen = -1;
            lenKnown = false;
        }
        boolean bodyless = "GET".equalsIgnoreCase(reqMethod) || "HEAD".equalsIgnoreCase(reqMethod)
                || "OPTIONS".equalsIgnoreCase(reqMethod);
        if (!bodyless) {
            if (bodyLen > MAX_BODY_BYTES) {
                deny(response, 413, "{\"code\":\"BODY_TOO_LARGE\",\"message\":\"请求体超过 32MB 上限\"}");
                return false;
            }
            /* 长度未知（chunked transfer-encoding 不带 Content-Length，容器报 -1）：
               旧实现把 -1 当作「没超限」直接放行，于是换一个传输编码就能把任意体积
               推给 Jackson 全量读入——32MB 上限对分块请求完全失效。
               判据必须是「容器明确回了 -1」；抛 UnsupportedOperationException 的情形
               由上方的 lenKnown=false 排除，不能混为一谈。 */
            if (lenKnown && bodyLen < 0) {
                deny(response, 411, "{\"code\":\"LENGTH_REQUIRED\",\"message\":"
                        + "写请求必须携带 Content-Length（不接受长度未知的分块传输）；"
                        + "如需流式上传请走专门的导入接口\"}");
                return false;
            }
        }
        /* CSRF/跨站写防护（先于任何放行分支，含 SETUP 窗口与登录白名单）：
           委托 header 模式下身份来自「网关注入头 + 浏览器自动携带的宿主 cookie」，
           跨站表单 POST（simple request，不触发 CORS 预检）可借用户身份完成写操作——
           abort 迁移/取消任务/删账号都是 @RequestParam 形态，一个 <form> 即可。
           判据只用浏览器强制写入、页面 JS 不可伪造的 Sec-Fetch-Site：
           cross-site → 拒；same-origin / same-site / none / 缺省（非浏览器客户端）→ 放行。
           只拒 cross-site 是刻意的：宿主页与 console 不同子域的同站集成不能被误伤。 */
        if (crossSiteWrite(request)) {
            recordCsrfBlocked(path, reqMethod);
            deny(response, 403, "{\"code\":\"CSRF_BLOCKED\",\"message\":\""
                    + "跨站写请求已被拒绝（Sec-Fetch-Site: cross-site）；请在控制台页面内操作\"}");
            return false;
        }
        //  SETUP 短路：未绑定控制集群时，除 setup 三端点外统一 409（前端据此弹首连向导）
        if (!resolver.bound()) {
            if ("/internal/es/index/setup/status".equals(path)
                    || "/internal/es/index/setup/test".equals(path)
                    || "/internal/es/index/setup/apply".equals(path)
                    || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
                return true;
            }
            deny(response, 409, "{\"code\":\"SETUP_REQUIRED\",\"message\":\"控制台尚未绑定控制集群\"}");
            return false;
        }
        if ("OPTIONS".equalsIgnoreCase(request.getMethod()) || isWhitelisted(path)) {
            return true;
        }
        ConsolePrincipal principal;
        try {
            principal = authorizer.authenticate(request);
        } catch (io.github.dengmeiluan.esquerystudio.console.control.SetupRequiredException e) {
            deny(response, 409, "{\"code\":\"SETUP_REQUIRED\",\"message\":\"控制台尚未绑定控制集群\"}");
            return false;
        } catch (Exception e) {
            // 已绑定但控制集群不可达：明确 503（绝不回落 SETUP，防拒绝服务骗出重绑向导）。
            // 该响应发给未认证调用方：异常 message 内嵌的控制集群地址同口径脱敏
            deny(response, 503, "{\"code\":\"CONTROL_CLUSTER_DOWN\",\"message\":\"控制集群不可达: "
                    + jsonEscape(io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper
                            .sanitizeTopology(e.getMessage())) + "\"}");
            return false;
        }
        if (principal == null) {
            deny(response, 401, "{\"code\":\"UNAUTHORIZED\",\"message\":\"请先登录 ES 控制台\"}");
            return false;
        }
        /* 逃生阀关闭页面授权时，把授权集在身份入口就归一为 null：拦截器、连接可见性、
           监控行过滤与权限面板必须看到同一个“未启用”形态，不能只有门禁被关、
           可见性仍拿旧 grants 继续收窄（有权限的人被隐藏）。 */
        if (!pageAuthEnabled && principal.getGrantedPages() != null) {
            /* 第 4 参是 delegated，必须保留原身份形态：此前硬编码 true 会把「页面授权逃生阀
               关闭」的委派/内置身份全部误标成委派，导致 /auth/me 报 authSource=delegate、
               改密被 DELEGATED 只读规则挡下（有权限的人被误拦）。 */
            principal = new ConsolePrincipal(principal.getUsername(), principal.getRole(),
                    principal.isFallback(), principal.isDelegated(), principal.getDisplayName(),
                    principal.getAttributes(), null);
        }
        request.setAttribute(ATTR_PRINCIPAL, principal);
        /* 委托会话 LOGIN 审计——宿主 iframe 流没有控制台登录动作（历史 LOGIN
           事件全来自独立部署的内置登录），「正常登录的审计日志」在宿主形态下一直缺位。
           以宿主令牌首见为会话建立点落一笔 LOGIN（实名/角色/IP 全维；令牌换发=新会话再落）。
           GET 观测不审计的原则不破例——这是会话级事件，不是请求级观测。 */
        if (principal.isDelegated()) {
            String hostTok = request.getHeader("X-Es-Host-Token");
            if (hostTok != null && !hostTok.isEmpty()
                    && seenDelegateTokens.put(Integer.toHexString(hostTok.hashCode()),
                            System.currentTimeMillis()) == null) {
                opsAuditStore.record(auditEvent(principal, request, "-", "-",
                        "LOGIN", 200, "宿主委托会话建立"));
            }
        }
        // 2.5.0 菜单 SPI 页面门（先于角色门）：delegated 且宿主下发了白名单（含空集=全拒）时，
        // 页面专属端点必须在白名单内；共享端点（pageOf 返回 null）不吃页面级，维持角色档
        /* 2.5.0 页面门 × 连接写门(合并):delegated 且宿主下发 grantedPages 时,
           conn:{connId}:{page} 键按连接判定页面可见;conn 模型用户的读写判定即为最终裁决
           (写请求须 conn:{target}:w:{page} 写键),短路角色门——菜单授权即权限,无二次推导。
           静态 key(无 conn: 前缀)=全局页,对所有连接生效,仍受 env 模板收缩;无 conn 键=现状行为。 */
        /* 页面白名单对所有非 ADMIN 身份生效：内置/委托/自定义授权器返回的非空
           grantedPages 都是同一语义，否则前端按页收缩而后端仍按角色放行（执法分叉）。 */
        /* 环境级封顶先于一切角色/页面裁决——env 模板约束的是「这个连接是生产库」，
           与角色、与是否下发 grantedPages 都正交。此前它只出现在
           `grantedPages != null` 分支内部且排在 ADMIN 豁免之后：内置 ADMIN（grantedPages=null）
           与委派 ADMIN 都不走这里，「x1 生产只读」对超管形同虚设（raw/devtools 实测均放行）。 */
        /* 环境级封顶：env 模板约束的是「这个连接是生产库」，与角色、与是否下发 grantedPages 都正交。
           它必须排在 ADMIN 豁免之前——产线 deng_test_x1 在测试环境的角色档就是 ADMIN，
           而页面门对 ADMIN 是提前 return 的，env 判定若在其后就永远走不到：
           「生产环境只读」对超管形同虚设（raw / devtools/execute 实测均放行）。
           放在 grantedPages 分支之外：内置 ADMIN 的 grantedPages 就是 null，同样要吃环境封顶。 */
        if (pageAuthEnabled) {
            String envCapped = envCapViolation(path, request);
            if (envCapped != null) {
                opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                        "ENV_PAGE_DENIED", 403, "env-cap page=" + envCapped
                                + " target=" + request.getHeader("X-Es-Target")));
                deny(response, 403, EnvPagesResolver.denyBody(envCapped));
                return false;
            }
        }
        if (pageAuthEnabled && principal.getGrantedPages() != null) {
            String envCapped = envCapViolation(path, request);
            if (envCapped != null) {
                opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                        "ENV_PAGE_DENIED", 403, "env-cap page=" + envCapped
                                + " target=" + request.getHeader("X-Es-Target")));
                deny(response, 403, EnvPagesResolver.denyBody(envCapped));
                return false;
            }
        }
        if (pageAuthEnabled && principal.getGrantedPages() != null) {
            /* MCP key 管理是跨连接的宿主自举面，不按当前 X-Es-Target 的单连接页面门裁决。
               McpKeyController 会校验 owner、角色快照、连接集合与连接级读写；这里不能再
               用当前目标连接的 devtools 写键把「有 QA 授权但当前选中生产」的用户误 403。 */
            if (path.contains("/internal/es/index/mcp/keys")) {
                return true;
            }
            /* 超管域优先裁决：用户管理/重绑/连接档案是授权载体本身，任何连接写键都不放行；
               必须 ADMIN 角色；ADMIN 不受页面写键限制（全局管理权）。
               连接同步状态的 GET 是只读观测（前端轮询），与 /probe 同口径豁免。 */
            if ((isSystemAdminUri(path) || isClustersRootWrite(path, request.getMethod()))
                    && !("GET".equalsIgnoreCase(request.getMethod()) && path.endsWith("/clusters/sync"))) {
                if (!principal.getRole().atLeast(ConsoleRole.ADMIN)) {
                    /* 越权尝试必须留痕：这是攻击者最常探测的一类高价值端点（账号库/连接档案/重绑），
                       此前直接 deny 不落审计，等于「有人试过但查不到」。同批其它拒绝点均已有记录。 */
                    opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                            "ADMIN_DENIED", 403, "required=ADMIN uri-family=system-admin"));
                    deny(response, 403, "{\"code\":\"FORBIDDEN\",\"message\":\"该操作属管理员专属（用户管理/连接档案/重绑），连接页面授权不放行\",\"required\":\"ADMIN\"}");
                    return false;
                }
                return true;
            }
            /* 超级管理员是全局权限：不受宿主页面白名单/连接写键限制（“有权限的人不能被门禁拖懒”）。
               非 ADMIN 仍严格走页面/连接写键门。 */
            if (principal.getRole().atLeast(ConsoleRole.ADMIN)) {
                return true;
            }
            /* 全量审计是 rank3 专项数据：连接模型下页面读键会短路角色门，
               这里补回 rank3 硬门——security 读键给 VIEWER 只能看用户列表/自助流水，
               不得读全量 IP/URI/连接维度审计。/auth/ops-audit/mine 是自助面（服务端强制
               username=自己），不吃该硬门；用前缀匹配而非精确相等，防未来新增
               /auth/ops-audit/export 之类子路径被 security 读键静默短路。 */
            if (path.startsWith("/internal/es/index/auth/ops-audit")
                    && !path.endsWith("/auth/ops-audit/mine")
                    && !principal.getRole().atLeast(ConsoleRole.REBUILD_OP)) {
                opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                        "ROLE_DENIED", 403, "required=REBUILD_OP"));
                deny(response, 403, "{\"code\":\"FORBIDDEN\",\"message\":\"全量审计需要 AUDIT_OP/ADMIN 角色\","
                        + "\"required\":\"REBUILD_OP\"}");
                return false;
            }
            /* 目标绑定的执行语义：只有数据面通道跟随 X-Es-Target；重建 provider、系统索引
               查询等宿主专属端点即使带了远端目标头也恒定执行在宿主。授权若仍按目标头取
               conn:{c1} 页键，持 c1 写键的人就能改宿主索引——因此这类路径一律按 host 授权。 */
            String targetId;
            if (isHostBoundPath(path, request.getMethod())) {
                targetId = "host";
            } else {
                String targetHeader = request.getHeader("X-Es-Target");
                /* host/缺省目标也必须参与连接模型写键裁决：conn 用户不该因「没带目标头」
                   落到全局角色门，从而改写宿主集群。 */
                targetId = targetHeader == null || targetHeader.trim().isEmpty()
                        ? "host" : targetHeader.trim();
                if ("host".equalsIgnoreCase(targetId)) targetId = "host";
            }
            /* host-cluster-visible=false（纯管理平台）时，宿主数据面/托管重建 provider 必须
               和 EsTargetInterceptor 同口径拒绝：这些端点恒定执行在宿主，残留的 conn:host
               页键不能成为直捣宿主的第二通道。ADMIN 已在上方整体放行；自举端点保留
               （身份/连接目录/健康），否则换号用户无法自救。 */
            if (!hostClusterVisible && "host".equals(targetId) && !isBootstrapPath(path)) {
                opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                        "HOST_DISABLED", 403, "host-cluster-visible=false"));
                deny(response, 403, "{\"code\":\"HOST_DISABLED\",\"message\":\"当前部署未开放宿主集群，请先在顶栏选择集群连接\"}");
                return false;
            }
            /* 目标连接的角色闸，对所有「按目标头取页键」的路径统一生效。
               此前只有数据面（EsTargetInterceptor 覆盖的 /cluster/**、/insight 等）做过 minRole 校验；
               adhoc-rebuild/abort|status|jobs、desired-state、es/index/keys、mapping-reconcile/report、
               config-lab/drift 等同样吃 X-Es-Target 授权却完全跳过了它——持 conn:B:w:adhoc-rebuild
               但角色低于 B.minRole 的用户可中止 B 上的重建。
               档案查不到（null）时不额外拒绝：存在性由数据面拦截器与宿主键下发共同保证，
               这里只补「连接存在时必须同时满足 minRole」这一条，避免把有页面键的人误拦。
               自救通道（bootstrap：身份/连接目录/健康/setup）例外——它们是空页集/换号
               用户的定位通道，残留的跨账号目标头（localStorage 按域共享）不得把它们
               打死成 CONN_FORBIDDEN（产线实报：换号后 /auth/me、/clusters 全 403，
               「身份未确认」+连接目录加载失败要等兜底重置才自愈）。数据面另有独立闸：
               EsTargetInterceptor 对 followsTarget 路径独立做 canSeeResolved，安全不减。 */
            if (!"host".equals(targetId) && connStore != null && !isBootstrapPath(path)) {
                try {
                    io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn targetConn = connStore.get(targetId);
                    if (targetConn != null && !ConsoleConnVisibility.canSeeResolved(principal, targetId, targetConn)) {
                        ConsoleRole need = ConsoleRole.parse(targetConn.getMinRole());
                        /* 两种不可见分开说（产线实报混用误导）：角色低于 minRole=提示升角色；
                           角色够但页面授权缺失=提示去宿主系统勾选（升级角色解决不了）。 */
                        boolean roleShort = !principal.getRole().atLeast(need);
                        String connMsg = roleShort
                                ? "当前角色无权访问该集群连接（需 " + need.name() + " 及以上），请联系管理员调整连接的最低角色或切换其他集群目标"
                                : "该集群连接未授权给当前身份，请联系管理员在宿主系统勾选该连接的页面授权";
                        opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                                "CONN_DENIED", 403, "target=" + targetId + " required=" + need.name()
                                        + (roleShort ? "" : " pageModel=missing")));
                        deny(response, 403, "{\"code\":\"CONN_FORBIDDEN\",\"message\":\"" + jsonEscape(connMsg)
                                + "\",\"required\":\"" + need.name() + "\"}");
                        return false;
                    }
                } catch (Exception e) {
                    // 档案瞬态不可用：不能让审计/授权读取反噬请求（数据面仍有独立 503 闸）
                }
            }
            if ("/internal/es/index/cluster/alias-actions".equals(path)) {
                /* 完整别名写权必须叠加 env 页模板收缩：静态 aliases 命中但被环境模板排除时，
                   不能借 config-validator 的 add-only 通道执行 remove/remove_index。 */
                /* 静态 aliases 页键只是可见性，完整写权还需角色达写档（与 aliasActionsAddOnly
                   的无属性回落分支同序）；否则 VIEWER + config-validator 写键可借该属性绕过 add-only。 */
                boolean fullAlias = envPagesResolver.writeAllowed(targetId, "aliases", principal.getGrantedPages())
                        || (envPagesResolver.staticWriteAllowed(targetId, "aliases", principal.getGrantedPages())
                            && principal.getRole().atLeast(
                                    requiredRole("POST", "/internal/es/index/cluster/alias-actions")));
                request.setAttribute(ATTR_ALIASES_FULL_WRITE, fullAlias);
            }
            ConsolePageCatalog.Page page = pageCatalog.pageOf(path);
            java.util.Set<String> effectivePages = envPagesResolver.effectivePages(
                    targetId, principal.getGrantedPages());
            /* security 页横跨宿主账号库与目标连接审计：持 conn:host:security 的用户在顶栏
               选中某连接时，审计读仍应放行（行级过滤仍按 host scope，不会看到连接流水）。 */
            java.util.Set<String> pageScope = effectivePages;
            if (page != null && "security".equals(page.getKey())
                    && !effectivePages.contains("security")) {
                java.util.Set<String> hostPages = envPagesResolver.effectivePages(
                        "host", principal.getGrantedPages());
                if (hostPages.contains("security")) pageScope = hostPages;
            }
            /* 索引详情是跨页复用读：mapping/config-validator 只该拿结构，样本文档属文档读页。 */
            if ("/internal/es/index/cluster/inspect".equals(path)) {
                request.setAttribute(ATTR_INSPECT_SAMPLE_ALLOWED, inspectSampleAllowed(effectivePages));
            }
            /* HEAD 由容器映射到 GET 处理链（只读观测）：与 GET 同权，不能按写档拦健康检查。 */
            boolean writeReq = !"GET".equalsIgnoreCase(request.getMethod())
                    && !"HEAD".equalsIgnoreCase(request.getMethod())
                    && !"OPTIONS".equalsIgnoreCase(request.getMethod())
                    && !isReadonlyPost(path);

            /* raw / devtools 透传的外层恒 POST，内层真实方法只有执行端能看到。若这里按写门
               一刀切，只读身份（宿主只授 conn:{id}:devtools 读键）连 GET /_cluster/health 都进不来，
               「生产只读」退化成「生产不可用」。所以：写键持有者走下面的写门（照旧）；
               仅当没有写键、但有归属页读键时先行准入并打标，由执行端按内层 method 再裁决读/写。
               打标只放宽「能否进入」，不改变「能否写」——写判据仍在执行端。
               必须放在页面前缀裁决之前：raw 的 rest 页有 apiPrefixes，devtools 页没有，
               两者靠不同分支裁决，提前拦截才能对两者同口径。 */
            if (writeReq && isPassthroughEndpoint(path)
                    && envPagesResolver.inConnModel(principal.getGrantedPages())) {
                /* 两个端点的页面归属来源不同：devtools 靠共享写表（表里登记 rest/devtools），
                   raw 靠 rest 页的 apiPrefixes（页面前缀分支）。任一为空就取另一来源，
                   两者必须同口径，否则修好 DevTools 却漏掉 REST 直连。 */
                List<String> passthroughPages = sharedWritePages(path);
                if (passthroughPages == null) {
                    ConsolePageCatalog.Page owned = pageCatalog.pageOf(path);
                    if (owned != null) {
                        passthroughPages = java.util.Collections.singletonList(owned.getKey());
                    }
                }
                if (passthroughPages != null) {
                    boolean hasWrite = false;
                    for (String pageKey : passthroughPages) {
                        if (envPagesResolver.writeAllowed(targetId, pageKey, principal.getGrantedPages())
                                || (envPagesResolver.staticWriteAllowed(targetId, pageKey, principal.getGrantedPages())
                                    && principal.getRole().atLeast(requiredRole(request.getMethod(), path)))) {
                            hasWrite = true;
                            break;
                        }
                    }
                    if (!hasWrite) {
                        boolean hasRead = false;
                        for (String pageKey : passthroughPages) {
                            if (envPagesResolver.readAllowed(targetId, pageKey, principal.getGrantedPages())) {
                                hasRead = true;
                                break;
                            }
                        }
                        if (hasRead) {
                            request.setAttribute(ATTR_PASSTHROUGH_READ_ONLY, Boolean.TRUE);
                            return true;
                        }
                    }
                }
            }
            /* insight 护栏动作 fail-closed（1031）：动态 actionId 的写请求在授权层双查——
               ①未注册动作：拒绝（执行器只会 400，授权层提前给出确定语义）；
               ②已注册但共享写映射漏登：拒绝（否则静态/混合模型回落 OPERATOR 角色门，
               新动作 minRole≤OPERATOR 即失控——配置漂移在此显式拦下逼登记）。 */
            int insightActionsAt = path.indexOf("/insight/actions/");
            if (writeReq && guardedActionRegistry != null && insightActionsAt >= 0) {
                String rest = path.substring(insightActionsAt + "/insight/actions/".length());
                String actionId = rest.indexOf('/') >= 0 ? rest.substring(0, rest.indexOf('/')) : rest;
                if (!guardedActionRegistry.contains(actionId)) {
                    opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                            "WRITE_DENIED", 403, "insight action 未注册: " + actionId));
                    deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"未知的护栏动作: "
                            + jsonEscape(actionId) + "\"}");
                    return false;
                }
                if (!SHARED_WRITE_PAGES.containsKey("/insight/actions/" + actionId)) {
                    opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                            "WRITE_DENIED", 403, "insight action 未登记共享写映射: " + actionId));
                    deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"护栏动作未配置页面授权映射，请联系开发者登记\"}");
                    return false;
                }
            }
            List<String> sharedWrite = writeReq ? sharedWritePages(path) : null;
            /* 空有效页集=全拒：不仅空 grantedPages，env 模板收缩后为空也必须拒绝，
               否则无页面归属的共享端点会回落角色门（OPERATOR 也能读/写）。
               自助端点（改密/退出）例外：无页面授权也必须能管理自己的会话。 */
            /* 页面专属端点保留后续按页拒绝（可给出具体页名）；这里先堵 pageOf=null 的共享端点。 */
            boolean noEffectivePages = effectivePages.isEmpty() && page == null;
            if (writeReq && noEffectivePages && !isBootstrapPath(path)) {
                opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                        "WRITE_DENIED", 403, "pageGrants=empty target=" + targetId
                                + " env=" + envPagesResolver.pagesFor(targetId)));
                deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"当前身份无任何页面授权，写操作一律拒绝\"}");
                return false;
            }
            /* 空有效页集同样覆盖读：除身份/退出/改密/权限自查/setup 状态外一律拒绝，
               防止 env 模板全拒/连接键不匹配时直调 pageOf=null 的 query/search 读端点。 */
            if (!writeReq && noEffectivePages && !isBootstrapPath(path)) {
                opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                        "PAGE_DENIED", 403, "pageGrants=empty target=" + targetId
                                + " env=" + envPagesResolver.pagesFor(targetId)));
                /* 文案必须可操作：宿主委托部署下「无任何页面授权」最常见根因是
                   委托侧实体没拿到授权（如飞书 SSO 自动新建账号只挂默认角色），
                   直接告诉用户去哪配，而不是一句无上下文的拒绝。 */
                deny(response, 403, "{\"code\":\"PAGE_DENIED\",\"message\":\"当前身份没有任何 ES 控制台页面授权——宿主委托部署请到宿主系统（宿主内嵌委托）的角色菜单勾选 ES 控制台连接授权；若用飞书等 SSO 登录，请确认登录绑定的是被授权的账号（SSO 自动新建的账号不带任何授权）\"}");
                return false;
            }
            /* 共享读端点按归属页裁决——静态页白名单与连接模型同一口径：
               pageOf=null / 跨页复用端点不能直接吃角色门，否则 only-overview 用户可读
               query/search 业务数据；live/workspace 也会被 overview 的页面前缀误拦。
               bootstrap 自助端点（健康探针/连接目录等）豁免：它们不承载业务数据，
               且是空页集用户定位自己授权的自救通道。 */
            if (!writeReq && !isBootstrapPath(path)) {
                List<String> readPages = sharedReadPages(path);
                if (readPages != null) {
                    boolean allowed = false;
                    for (String pageKey : readPages) {
                        if (effectivePages.contains(pageKey)) { allowed = true; break; }
                    }
                    if (!allowed) {
                        opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                                "PAGE_DENIED", 403, "target=" + targetId + " readPages=" + String.join(",", readPages)));
                        deny(response, 403, "{\"code\":\"PAGE_DENIED\",\"message\":\"暂无该查询端点归属页面的读权限（需 "
                                + jsonEscape(String.join("/", readPages)) + " 之一），请联系管理员授权\"}");
                        return false;
                    }
                    return true;
                }
            }
            /* 集群级动作注入 rank 硬门（见 CLUSTER_SCOPE_WRITE_KEYWORDS）：静态/内置模型
               已由 CLUSTER 关键词档位裁决，这里只补连接模型被「页面写键即最终裁决」短路的那道门。
               放行通道二选一——rank3 及以上，或该连接的 cluster-settings 写键
               （集群设置页的语义本就是集群级操作，宿主可显式授权；避免把「有权限的人」一刀切拦住）。 */
            if (writeReq && envPagesResolver.inConnModel(principal.getGrantedPages())
                    && isClusterScopeWrite(path)
                    && !principal.getRole().atLeast(ConsoleRole.CLUSTER_OP)
                    && !envPagesResolver.writeAllowed(targetId, "cluster-settings", principal.getGrantedPages())) {
                opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                        "ROLE_DENIED", 403, "clusterScope required=CLUSTER_OP|w:cluster-settings role="
                                + principal.getRole() + " conn=" + targetId));
                deny(response, 403, "{\"code\":\"CLUSTER_SCOPE_REQUIRED\",\"page\":\"lifecycle\","
                        + "\"message\":\"该操作是集群级动作（作用于目标集群全局），需要 CLUSTER_OP 及以上角色，"
                        + "或该连接的「集群设置」写权限；单索引的 rollover / 推进步骤仍可用\","
                        + "\"required\":\"CLUSTER_OP\"}");
                return false;
            }
        /* 托管重建向导的「校验并继续」是 adhoc 流程内步骤：持 adhoc 写键即可调用
               config-lab/validate 的 dry-run，不要求再勾 config-validator 页（否则向导
               第 1 步永远无法前进）。校验器页自身的写键仍按原页面门裁决。
               静态页白名单同样要放行——effectivePages 有 adhoc-rebuild 且角色达 rank3。 */
            if (writeReq && "/internal/es/index/config-lab/validate".equals(path)
                    && (envPagesResolver.writeAllowed(targetId, "adhoc-rebuild", principal.getGrantedPages())
                        || ((envPagesResolver.staticWriteAllowed(targetId, "adhoc-rebuild", principal.getGrantedPages())
                                || (!envPagesResolver.inConnModel(principal.getGrantedPages())
                                    && effectivePages.contains("adhoc-rebuild")))
                            && principal.getRole().atLeast(requiredRole("POST", "/internal/es/index/adhoc-rebuild/start"))))) {
                if (envPagesResolver.writeAllowed(targetId, "adhoc-rebuild", principal.getGrantedPages())) {
                    request.setAttribute(ATTR_CONN_WRITE_GRANTED, Boolean.TRUE);
                }
                return true;
            }
            /* 共享写映射优先于单一页面前缀：一个端点被多页合法使用时，
               持任一归属页写键都应放行（否则 ilm/move、写别名等会误拦另一页的授权）。 */
            if (writeReq && envPagesResolver.inConnModel(principal.getGrantedPages())) {
                if (sharedWrite != null) {
                    for (String pageKey : sharedWrite) {
                        if (envPagesResolver.writeAllowed(targetId, pageKey, principal.getGrantedPages())) {
                            request.setAttribute(ATTR_CONN_WRITE_GRANTED, Boolean.TRUE);
                            return true;
                        }
                    }
                    /* 混合模型：静态页授权仍是全局写权（与纯静态模型同语义，角色门照旧）。
                       不能因为混入 conn 读键就把用户自己看得见的静态写入口全部 403。 */
                    ConsoleRole sharedRole = requiredRole(request.getMethod(), path);
                    for (String pageKey : sharedWrite) {
                        if (envPagesResolver.staticWriteAllowed(targetId, pageKey, principal.getGrantedPages())
                                && principal.getRole().atLeast(sharedRole)) {
                            return true;
                        }
                    }
                    opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                            "WRITE_DENIED", 403, "conn=" + targetId + " sharedPages=" + String.join(",", sharedWrite)));
                    deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"暂无该共享写端点的页面写权限（需 "
                            + jsonEscape(String.join("/", sharedWrite)) + " 之一），请联系管理员授权\"}");
                    return false;
                }
            }
            /* 静态页白名单同样必须让共享写映射优先于页前缀：create-index 归属 config-validator、
               ilm/move 归属 lifecycle，但 indices/ilm 页也是合法使用者。原顺序先吃页前缀，
               有权限的静态页用户会被自己看得到的按钮 403——授权可见性与执行门必须同序。 */
            boolean staticSharedWrite = writeReq && sharedWrite != null
                    && !envPagesResolver.inConnModel(principal.getGrantedPages());
            if (staticSharedWrite) {
                boolean visible = false;
                for (String pageKey : sharedWrite) {
                    if (effectivePages.contains(pageKey)) { visible = true; break; }
                }
                if (!visible) {
                    opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                            "WRITE_DENIED", 403, "target=" + targetId + " sharedPages=" + String.join(",", sharedWrite)));
                    deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"暂无该共享写端点归属页面的访问权限（需 "
                            + jsonEscape(String.join("/", sharedWrite)) + " 之一），请联系管理员授权\"}");
                    return false;
                }
            }
            /* 自助/自举端点不吃页面白名单：/auth/me、改密、退出、我的流水、权限自查、setup 状态
               必须对任何已认证身份可用；否则把 ops-audit/mine 收进 security 页后，
               没勾 security 的普通用户连自己的操作记录都看不了。 */
            boolean bootstrapRead = !writeReq && isBootstrapPath(path);
            if (page != null && !bootstrapRead && !staticSharedWrite) {
                if (!pageScope.contains(page.getKey())) {
                    /* 页面不可见:拒绝事件显式落审计(:带目标集群/实名/来源 IP 维度) */
                    opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                            "PAGE_DENIED", 403, "page=" + page.getKey()));
                    deny(response, 403, "{\"code\":\"FORBIDDEN\",\"page\":\"" + jsonEscape(page.getKey())
                            + "\",\"message\":\"暂无「" + jsonEscape(page.getName()) + "」功能权限,请联系管理员在宿主系统中授权\"}");
                    return false;
                }
                /* 连接模型:该连接的读写授权即最终裁决,跳过角色门 */
                if (envPagesResolver.inConnModel(principal.getGrantedPages())) {
                    if (writeReq && !envPagesResolver.writeAllowed(targetId, page.getKey(), principal.getGrantedPages())) {
                        /* 混合模型：静态页写权 = 可见 + 角色档（与纯静态模型同序）。 */
                        if (envPagesResolver.staticWriteAllowed(targetId, page.getKey(), principal.getGrantedPages())
                                && principal.getRole().atLeast(requiredRole(request.getMethod(), path))) {
                            return true;
                        }
                        opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                                "WRITE_DENIED", 403, "conn=" + targetId + " page=" + page.getKey()));
                        deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"page\":\"" + jsonEscape(page.getKey())
                                + "\",\"message\":\"暂无「" + jsonEscape(page.getName()) + "」的写权限,请联系管理员在宿主系统中授权\"}");
                        return false;
                    }
                    if (writeReq) request.setAttribute(ATTR_CONN_WRITE_GRANTED, Boolean.TRUE);
                    return true;
                }
            }
            /* 无页面归属的共享写端点：必须持有真实使用该端点的页面写键（共享端点被多页
               复用，不能按“任意写键”放行——optimizer 写键不应能删文档/改 ILM 策略）。
               未登记共享写回落角色门（保守）；已登记但无对应页写键直接 WRITE_DENIED。 */
            if (writeReq && envPagesResolver.inConnModel(principal.getGrantedPages())) {
                List<String> allowedPages = sharedWritePages(path);
                if (allowedPages == null) {
                    /* 连接模型默认拒绝「无页面归属」的写端点：未登记共享写映射的新端点
                       不得回落角色门（OPERATOR 角色即可写）。仅自助端点（改密/退出）
                       与未绑定时的 setup 引导放行到角色门。 */
                    boolean bootstrapWrite = isBootstrapPath(path)
                            || path.endsWith("/setup/test") || path.endsWith("/setup/apply");
                    /* 混合模型仍有静态全局页权限：未登记端点按纯静态语义回落角色门；
                       纯连接模型保持默认拒绝（未登记写不得回落 OPERATOR）。 */
                    if (!bootstrapWrite && !envPagesResolver.hasStatic(principal.getGrantedPages())) {
                        opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                                "WRITE_DENIED", 403, "target=" + targetId + " unregisteredWrite"));
                        deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"该写端点未登记页面归属，连接模型下拒绝执行\"}");
                        return false;
                    }
                }
                if (allowedPages != null) {
                    for (String pageKey : allowedPages) {
                        if (envPagesResolver.writeAllowed(targetId, pageKey, principal.getGrantedPages())) {
                            request.setAttribute(ATTR_CONN_WRITE_GRANTED, Boolean.TRUE);
                            return true;
                        }
                    }
                    opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                            "WRITE_DENIED", 403, "conn=" + targetId + " sharedPages=" + String.join(",", allowedPages)));
                    deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"暂无该共享写端点的页面写权限（需 "
                            + jsonEscape(String.join("/", allowedPages)) + " 之一），请联系管理员授权\"}");
                    return false;
                }
            } else if (writeReq) {
                /* 静态页白名单（无 conn 键）：共享写端点至少要能看到一个归属页，
                   否则「只授 overview」的 OPERATOR 仍可直调文档写。写档仍由角色门兜底。 */
                List<String> allowedPages = sharedWritePages(path);
                if (allowedPages != null) {
                    boolean visible = false;
                    for (String pageKey : allowedPages) {
                        if (effectivePages.contains(pageKey)) { visible = true; break; }
                    }
                    if (!visible) {
                        opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                                "WRITE_DENIED", 403, "target=" + targetId + " sharedPages=" + String.join(",", allowedPages)));
                        deny(response, 403, "{\"code\":\"WRITE_DENIED\",\"message\":\"暂无该共享写端点归属页面的访问权限（需 "
                                + jsonEscape(String.join("/", allowedPages)) + " 之一），请联系管理员授权\"}");
                        return false;
                    }
                }
            }
        }
        ConsoleRole required = requiredRole(request.getMethod(), path);
        if (!principal.getRole().atLeast(required)) {
            opsAuditStore.record(auditEvent(principal, request, request.getMethod(), path,
                    "ROLE_DENIED", 403, "required=" + required.name()));
            deny(response, 403, "{\"code\":\"FORBIDDEN\",\"message\":\"权限不足，需要 " + required.name()
                    + " 角色\",\"required\":\"" + required.name() + "\"}");
            return false;
        }
        return true;
    }

    /** 命中执行类清单的只读 POST 落 EXEC 审计（谁在哪个集群执行了脚本/预估）。 */
    private void recordExecAuditIfNeeded(HttpServletRequest request, HttpServletResponse response, String uri) {
        boolean isExec = false;
        for (String kw : EXEC_AUDIT_POST_KEYWORDS) {
            if (uri.contains(kw)) { isExec = true; break; }
        }
        if (!isExec) return;
        Object p = request.getAttribute(ATTR_PRINCIPAL);
        if (!(p instanceof ConsolePrincipal)) return;
        /* 状态码取真实响应：硬编码 200 会把一次 4xx/5xx 的执行尝试记成「成功」，
           法证回溯时无法区分「跑了但失败」与「真的执行成功」。 */
        opsAuditStore.record(auditEvent((ConsolePrincipal) p, request, request.getMethod(), uri,
                "EXEC", response == null ? 200 : response.getStatus(), null));
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        // 只审计写操作（GET/HEAD 观测太密，无回溯价值）
        if ("GET".equalsIgnoreCase(request.getMethod())
                || "HEAD".equalsIgnoreCase(request.getMethod())
                || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return;
        }
        String uri = stripContextPath(request);
        // 归一化路径优先（preHandle 已 canonicalize）——避免 /cluster/sql/../raw 之流在审计口径露出裸形；
        // 测试直调 afterCompletion（无 preHandle）时 attr 缺失，回落 raw 剥 context 口径
        Object normalizedPath = request.getAttribute(ATTR_NORMALIZED_PATH);
        if (normalizedPath instanceof String) {
            uri = (String) normalizedPath;
        }
        // -C1：只读查询类 POST（含 /probe 探活）与 GET 同策略，不算 WRITE
        if (isReadonlyPost(uri)) {
            /* ·可审计补全：执行类只读 POST（painless 脚本执行/analyze 分词验证/
               reindex 预估/config-lab dry-run）零数据写入但执行脚本或消耗集群资源——落 EXEC
               审计留痕（谁在哪个集群跑了什么），其余只读查询维持零噪音。 */
            recordExecAuditIfNeeded(request, response, uri);
            return;
        }
        Object p = request.getAttribute(ATTR_PRINCIPAL);
        if (!(p instanceof ConsolePrincipal)) {
            return;
        }
        ConsolePrincipal principal = (ConsolePrincipal) p;
        /* 高危审计标签与角色门分离：删除索引/恢复快照/改模板等操作仍按页写键+rank 授权，
           但审计动作必须标 HIGH_RISK（isAdminUri 同时参与授权，不能把这里的关键词塞进去）。 */
        String action = isAdminUri(uri) || containsAny(uri, HIGH_RISK_AUDIT_KEYWORDS)
                ? "HIGH_RISK" : "WRITE";
        String qs = request.getQueryString();
        /* 高危 raw 透传的法证摘要（端点回填）——detail 从空到「raw=GET /_cat/indices」；
           拒绝/畸形路径也可能进入摘要，换行控制符不得污染审计行。 */
        String detail = null;
        Object rawSummary = request.getAttribute(ATTR_RAW_SUMMARY);
        if (rawSummary instanceof String && !((String) rawSummary).isEmpty()) {
            detail = "raw=" + ((String) rawSummary).replace('\r', ' ').replace('\n', ' ');
        }
        if (ex != null && ex.getMessage() != null) {
            /* 异常文本可能含 CR/LF 与其他控制符（ES 报错体、连接串片段）——
               审计是行式渲染 + 导出面，不清洗会制造日志注入（伪造审计行）。 */
            String msg = AUDIT_CTRL.matcher(ex.getMessage()).replaceAll(" ");
            if (msg.length() > 300) {
                msg = msg.substring(0, 300) + "…";
            }
            detail = detail == null ? "err=" + msg : detail + " err=" + msg;
        }
        opsAuditStore.record(auditEvent(principal, request, request.getMethod(),
                qs == null ? uri : uri + "?" + qs, action, response.getStatus(), detail));
    }

    /**
     * 审计事件组装（目标集群（connId/connName）+来源 IP+耗时三维采集单点。
     * connId 取 X-Es-Target（"host"/空=无连接上下文→null）；connName 经 ConnStore 实名，
     * 查不到留 null；耗时覆盖拒绝（preHandle 记录点）与写完成（afterCompletion）两路。
     */
    private ConsoleOpsAuditEvent auditEvent(ConsolePrincipal principal, HttpServletRequest request,
                                            String method, String uri, String action, int httpStatus,
                                            String detail) {
        /* 审计归属：一般跟随真实执行集群；迁移/托管重建按请求目标连接记账（连接工作流）。 */
        String targetId = auditTarget(uri, method, request.getHeader("X-Es-Target"));
        boolean targetIsConn = !"host".equalsIgnoreCase(targetId);
        String connName = null;
        if (targetIsConn && connStore != null) {
            try {
                String resolved = connStore.getName(targetId.trim());
                /* xmigrate/adhoc 族的归属头不经过 EsTargetInterceptor 校验（执行锚是
                   请求体的 srcConnId/作业 targetId）：未知 id 不落连接账——防伪造
                   X-Es-Target 把写操作记到他人连接名下误导法证。
                   其余端点保留连接维度（自定义 ConnStore 的 getName 可能未实现，
                   一律按 null 摘除会让审计永久丢失集群列——污染面小于信息丢失面）。 */
                boolean connectionWorkflow = uri != null
                        && (uri.contains("/xmigrate/") || uri.contains("/adhoc-rebuild/"));
                if (resolved == null && connectionWorkflow) {
                    targetIsConn = false;
                }
                connName = resolved;
            } catch (Exception e) {
                /* 连接档案瞬态不可用：审计维度尽力而为，绝不反噬；
                   补节流 WARN——connName 恒 null 会让审计集群列失真且此前零痕 */
                long now = System.currentTimeMillis();
                long last = lastConnNameWarnAt.get();
                if (now - last > WARN_THROTTLE_MS && lastConnNameWarnAt.compareAndSet(last, now)) {
                    LOG.warn("[ConsoleAuthInterceptor] 审计集群实名解析失败 connId={}（审计 connName 留空，"
                            + "{}s 内不再重复告警）: {}", targetId.trim(), WARN_THROTTLE_MS / 1000, e.getMessage(), e);
                }
            }
        }
        Object start = request.getAttribute(ATTR_START_MS);
        Long costMs = start instanceof Long ? System.currentTimeMillis() - (Long) start : null;
        return ConsoleOpsAuditEvent.builder()
                .username(principal.getUsername())
                .displayName(principal.getDisplayName())
                .role(principal.getRole().name())
                .method(method)
                .uri(uri)
                .action(action)
                .httpStatus(httpStatus)
                .detail(detail)
                .connId(targetIsConn ? targetId.trim() : null)
                .connName(connName)
                .ip(clientIp(request, trustedProxies))
                .costMs(costMs)
                .build();
    }

    /**
     * 来源地址：只有直连方是回环/私网代理时才信转发头；X-Forwarded-For 取「从右往左
     * 第一个非受信代理」的跳——代理把真实客户端地址追加在客户端可伪造的值之后，
     * 取最左首跳会让伪造值冒充审计来源（法证失真）。转发链上的地址全是受信代理时
     * 回退最左一跳（最接近客户端的那个）。
     */
    static String clientIp(HttpServletRequest request) {
        return clientIp(request, java.util.Collections.emptyList());
    }

    /**
     * @param trustedProxies 受信代理清单；非空时只有清单内的直连方才可转发客户端地址
     *                       （清单外私网直连视为终端本身）。空=沿用回环/私网启发式。
     */
    static String clientIp(HttpServletRequest request, List<String> trustedProxies) {
        String remote = request.getRemoteAddr();
        List<String> allow = trustedProxies == null ? java.util.Collections.emptyList() : trustedProxies;
        boolean trustedProxy;
        if (!allow.isEmpty()) {
            /* 显式清单优先：与 header 委托模式同一份配置——审计来源与身份采信必须同源，
               否则内网直连者可伪造 XFF 污染审计、并以换 IP 绕过登录节流。 */
            trustedProxy = remote != null && !remote.trim().isEmpty()
                    && PropertiesAuthDelegate.matchesProxyList(remote.trim(), allow);
        } else {
            trustedProxy = remote == null || remote.trim().isEmpty()
                    || isProxyAddress(remote.trim());
        }
        if (trustedProxy) {
            String xff = request.getHeader("X-Forwarded-For");
            if (xff != null && !xff.trim().isEmpty()) {
                String[] hops = xff.split(",");
                String leftmostTrusted = null;
                for (int i = hops.length - 1; i >= 0; i--) {
                    String hop = hops[i].trim();
                    if (hop.isEmpty()) {
                        continue;
                    }
                    if (!isProxyAddress(hop)) {
                        return hop;
                    }
                    /* 从右往左持续覆盖：循环自然结束时留下的是最左（最接近客户端）的受信跳 */
                    leftmostTrusted = hop;
                }
                if (leftmostTrusted != null) {
                    return leftmostTrusted;
                }
            }
            String real = request.getHeader("X-Real-IP");
            if (real != null && !real.trim().isEmpty()) {
                return real.trim();
            }
        }
        return remote;
    }

    /**
     * 是否「跨站发起的写请求」：判据只用 {@code Sec-Fetch-Site}——浏览器强制写入、
     * 页面 JS 不可伪造。缺省（curl/SDK/服务间调用）视为非浏览器，放行：
     * CSRF 只可能由浏览器页面发起，把缺省当跨站会误杀所有非浏览器客户端。
     */
    static boolean crossSiteWrite(HttpServletRequest request) {
        String m = request.getMethod();
        if (m == null) return false;
        if ("GET".equalsIgnoreCase(m) || "HEAD".equalsIgnoreCase(m) || "OPTIONS".equalsIgnoreCase(m)) {
            return false;
        }
        String site = request.getHeader("Sec-Fetch-Site");
        return site != null && "cross-site".equalsIgnoreCase(site.trim());
    }

    /** 跨站写拦截留痕：此时身份尚未解析（可能在白名单/SETUP 窗口），按匿名事件记账。 */
    private void recordCsrfBlocked(String path, String method) {
        try {
            opsAuditStore.record(ConsoleOpsAuditEvent.builder()
                    .username("anonymous")
                    .role(ConsoleRole.VIEWER.name())
                    .method(method)
                    .uri(path)
                    .action("CSRF_BLOCKED")
                    .httpStatus(403)
                    .detail("sec-fetch-site=cross-site")
                    .build());
        } catch (Exception e) {
            /* 审计落档失败不得改变拒绝结果（拒绝是安全决策，审计是留痕） */
            LOG.warn("[esquerystudio] 跨站写拦截审计落档失败（拒绝结果不变）", e);
        }
    }

    /** 回环/私网/链路本地地址（反向代理常见部署位置）；公网直连不得借转发头改审计 IP。 */
    static boolean isProxyAddress(String addr) {        if (addr == null) return false;
        String a = addr.trim().toLowerCase(java.util.Locale.ROOT);
        if (a.startsWith("::ffff:")) a = a.substring(7);
        if ("::1".equals(a) || "0:0:0:0:0:0:0:1".equals(a)
                || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80:")) {
            return true;
        }
        if (a.startsWith("127.") || a.startsWith("10.") || a.startsWith("192.168.")
                || a.startsWith("169.254.")) {
            return true;
        }
        if (a.startsWith("172.")) {
            int dot = a.indexOf('.', 4);
            if (dot > 4) {
                try {
                    int second = Integer.parseInt(a.substring(4, dot));
                    return second >= 16 && second <= 31;
                } catch (NumberFormatException ignore) {
                    return false;
                }
            }
        }
        return false;
    }

    /** URI + 方法 → 所需最低角色。 */
    static ConsoleRole requiredRole(String method, String uri) {
        // 探活是只读观测（POST 但零副作用），从 /clusters/ 高危清单中豁免给 VIEWER
        if (uri.contains("/clusters/") && uri.endsWith("/probe")) {
            return ConsoleRole.VIEWER;
        }
        // 连接同步状态是只读观测（前端轮询刷新），GET 形态从 /clusters/ 高危清单豁免给 VIEWER
        if ("GET".equalsIgnoreCase(method) && uri.endsWith("/clusters/sync")) {
            return ConsoleRole.VIEWER;
        }
        /* w66:多域判定 — 按命中顺序取最高要求(超管域>专项域)。
         * ADMIN(rank 4)自然涵盖所有专项(rank 3);专项之间互不覆盖。 */
        if (isAdminUri(uri) || isClustersRootWrite(uri, method)) {
            return ConsoleRole.ADMIN;
        }
        /* 自助流水「只看自己」给全角色——username 由服务端身份强制（见 controller），
           须在 AUDIT_KEYWORDS(/auth/ops-audit 前缀包含)命中前特例，否则被提 rank3 */
        if (uri.endsWith("/auth/ops-audit/mine")) {
            return ConsoleRole.VIEWER;
        }
        /* 重建/索引生命周期关键词是「写动作」清单：GET 读取（如 /cluster/ilm/policies）
           不能因包含 /cluster/ilm/policy 被误提 rank3（有权限的 VIEWER 被挡）。
           审计关键词是读敏感面，GET 仍须 rank3；ADMIN 关键词已在上方处理。 */
        boolean readMethod = "GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method)
                || "OPTIONS".equalsIgnoreCase(method);
        if (containsAny(uri, AUDIT_KEYWORDS)
                || (!readMethod && (containsAny(uri, REBUILD_KEYWORDS)
                    || containsAny(uri, CLUSTER_KEYWORDS)))) {
            return ConsoleRole.REBUILD_OP; /* 三个专项同 rank,任一命中都返回 rank3;
                                              atLeast 判定保证 CLUSTER_OP/AUDIT_OP 也能过 */
        }
        if (readMethod) {
            return ConsoleRole.VIEWER;
        }
        // -C1：只读查询类 POST 与 GET 同权——UI 承诺「VIEWER 仅查询观测」，查询却要 OPERATOR 是自相矛盾
        if (isReadonlyPost(uri)) {
            return ConsoleRole.VIEWER;
        }
        // auth 自助端点：登录后任何角色都能看自己/改自己密码
        if (uri.endsWith("/auth/me") || uri.endsWith("/auth/change-password") || uri.endsWith("/auth/logout")) {
            return ConsoleRole.VIEWER;
        }
        return ConsoleRole.OPERATOR;
    }

    /**
     * 授权判定专用路径归一化：剥 contextPath → 剥 servletPath → %XX 单趟解码（UTF-8）→ 去每段矩阵参数
     * → canonicalize（折叠 {@code .}/{@code ..} 与重复斜杠）。
     *
     * <p><b>先解码后剥矩阵参数</b>：{@code %3B}（编码分号）经容器解码 + Spring removeSemicolonContent
     * 后照样路由到 controller，顺序反过来会让 {@code /cluster/bulk%3Bx=y} 漏出页面门。</p>
     *
     * <p><b>canonicalize 必须在解码之后</b>：{@code %2e%2e} 解码后才是 {@code ..}；同时拒绝反斜杠与
     * NUL（Tomcat 之外容器的路径分隔歧义），{@code ..} 越过根直接 fail-closed。
     * 白名单/高危清单/页面归属全部使用归一化结果，{@code /auth/login/../users/upsert} 不再能
     * 借白名单 contains 短路。</p>
     *
     * <p>归一化只会让变形路径被正确识别（单调变严），不会让原本拒绝的变放行。</p>
     *
     * @return 归一化路径；非法 % 序列 / UTF-8 解码失败 / 反斜杠 / NUL / {@code ..} 越界返回
     *         {@code null}（调用方必须 fail-closed）
     */
    static String normalizePath(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path == null) {
            return null;
        }
        String ctx = request.getContextPath();
        if (ctx != null && !ctx.isEmpty() && path.startsWith(ctx)) {
            path = path.substring(ctx.length());
        }
        // 宿主配 spring.mvc.servlet.path 时 DispatcherServlet 前缀必须剥掉，否则页面门整体静默失效。
        // 但判据必须是 pathInfo 非 null：仅前缀映射（/api/*）时容器才拆出 pathInfo；
        // Tomcat 默认映射（/）下 getServletPath() 返回完整请求路径且 pathInfo=null，
        // 此时剥离会吞掉整条路径（377fed0 真机事故：归一化恒为 "" → 白名单失效 → 全端点 401）
        String servletPath = request.getServletPath();
        if (servletPath != null && !servletPath.isEmpty() && !"/".equals(servletPath)
                && request.getPathInfo() != null && path.startsWith(servletPath)) {
            path = path.substring(servletPath.length());
        }
        path = percentDecode(path);
        if (path == null) {
            return null;
        }
        String canonical = canonicalizePath(MATRIX_PARAM.matcher(path).replaceAll(""));
        if (canonical == null) {
            return null;
        }
        /* 后缀模式匹配（Spring 5.x 默认 useSuffixPatternMatch=true）会把
           /cluster/doc.json 路由到 cluster/doc handler，但页面门/共享映射按严格段边界匹配，
           `.json` 会让 pageOf 与 sharedRead/sharedWrite 双双失配 → 落角色门 VIEWER 放行，
           页面级授权被整体旁路（任何持 overview 只读页的 VIEWER 可读任意文档）。
           授权口径统一剥掉末段扩展名，与真实路由语义对齐；剥空即非法路径 fail-closed。 */
        return stripPathExtension(canonical);
    }

    /**
     * 剥掉最后一段的扩展名（{@code /cluster/doc.json} → {@code /cluster/doc}）。
     *
     * <p>只处理最后一段的第一个点之后的内容：Spring 的 {@code pattern + ".*"} 后缀匹配
     * 会把 {@code doc.a.b} 也路由到 {@code doc}，因此必须整段后缀一起剥。
     * 路径段本身不含 "."（控制台全部端点都是固定字面量）时行为逐字节不变。</p>
     *
     * @return 剥后缀后的路径；最后一段剥空（如 {@code /.json}）返回 null（fail-closed）
     */
    static String stripPathExtension(String path) {
        if (path == null || path.isEmpty()) {
            return path;
        }
        int slash = path.lastIndexOf('/');
        int dot = path.indexOf('.', slash + 1);
        if (dot < 0) {
            return path; // 无扩展名：逐字节不变
        }
        if (dot == slash + 1) {
            /* 段以点开头（/.json）：主体为空，剥完只剩 "/" —— 不是合法端点形态 */
            return null;
        }
        String stripped = path.substring(0, dot);
        /* 剥完只剩 "/" 或空段：原路径不是合法端点形态，拒绝而非回落到根（根无页面归属） */
        return stripped.length() > 1 && !stripped.endsWith("/") ? stripped : null;
    }

    /**
     * 路径 canonicalize（fail-closed）：拒绝 {@code \} 与 NUL；按 {@code /} 分段丢弃空段与 {@code .}，
     * {@code ..} 弹栈（栈空=越过根，返回 null）；重建为以 {@code /} 开头、段间单斜杠、无尾部斜杠的路径。
     * 根路径返回 {@code /}。
     */
    static String canonicalizePath(String path) {
        if (path == null || path.indexOf('\\') >= 0 || path.indexOf('\0') >= 0) {
            return null;
        }
        java.util.ArrayDeque<String> segments = new java.util.ArrayDeque<>();
        int start = 0;
        int len = path.length();
        while (start <= len) {
            int slash = path.indexOf('/', start);
            int end = slash < 0 ? len : slash;
            String segment = path.substring(start, end);
            if (segment.isEmpty() || ".".equals(segment)) {
                // 空段（//）与 . 直接丢弃
            } else if ("..".equals(segment)) {
                if (segments.isEmpty()) {
                    return null; // 越过根：拒绝（不回绕到根，防白名单/页面门被归一化制造命中）
                }
                segments.removeLast();
            } else {
                segments.addLast(segment);
            }
            if (slash < 0) {
                break;
            }
            start = slash + 1;
        }
        StringBuilder sb = new StringBuilder(path.length());
        for (String segment : segments) {
            sb.append('/').append(segment);
        }
        return sb.length() == 0 ? "/" : sb.toString();
    }

    /**
     * 单趟 %XX 解码（路径语义：{@code +} 是字面量不是表单空格，故不用 URLDecoder）。
     * 连续 %XX 聚合成字节段按 UTF-8 严格解码（多字节字符横跨多个 %XX）；非法序列/解码失败返回 null。
     */
    private static String percentDecode(String s) {
        if (s.indexOf('%') < 0) {
            return s;
        }
        StringBuilder out = new StringBuilder(s.length());
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(16);
        int i = 0;
        int len = s.length();
        while (i < len) {
            char c = s.charAt(i);
            if (c == '%') {
                bytes.reset();
                while (i < len && s.charAt(i) == '%') {
                    if (i + 2 >= len) {
                        return null; // 孤立 % 尾
                    }
                    int hi = Character.digit(s.charAt(i + 1), 16);
                    int lo = Character.digit(s.charAt(i + 2), 16);
                    if (hi < 0 || lo < 0) {
                        return null; // 非法 % 序列
                    }
                    bytes.write((hi << 4) | lo);
                    i += 3;
                }
                String decoded = decodeUtf8Strict(bytes.toByteArray());
                if (decoded == null) {
                    return null;
                }
                out.append(decoded);
            } else {
                out.append(c);
                i++;
            }
        }
        return out.toString();
    }

    /** UTF-8 严格解码：malformed/不可映射输入返回 null（不作 U+FFFD 替换放行）。 */
    private static String decodeUtf8Strict(byte[] bytes) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            return null;
        }
    }

    /** -C1：审计 URI 统一剥 servlet context（宿主部署在 /宿主 时与登录记录口径一致）。 */
    private static String stripContextPath(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String ctx = request.getContextPath();
        if (ctx != null && !ctx.isEmpty() && uri.startsWith(ctx)) {
            return uri.substring(ctx.length());
        }
        return uri;
    }

    /** 只读 POST 判定（清单段边界匹配 + 三个精确尾缀）。
     * 段边界=kw 前是 / 或串首、kw 后是段尾（/ ? ; 或串尾；尾带 / 的 kw 天然段前缀）——
     * 裸 contains 会让未来落在 /cluster/counter-reset 等前缀内的新写端点被静默归为
     * VIEWER 只读档，与「连接模型未登记写默认拒绝」的纵深不一致。 */
    static boolean isReadonlyPost(String uri) {
        for (String kw : READONLY_POST_KEYWORDS) {
            boolean prefixKw = kw.endsWith("/");
            int at = uri.indexOf(kw);
            while (at >= 0) {
                int end = at + kw.length();
                /* kw 以 / 开头时前导 / 自身就是段分隔（/index/cluster/query 的 at-1 是 x 不是 /）；
                   不以 / 开头才要求前一字符是段边界，防 /mycluster/query 命中 cluster/query。 */
                boolean prevOk = at == 0 || uri.charAt(at - 1) == '/' || kw.charAt(0) == '/';
                boolean endOk = prefixKw
                        || end == uri.length()
                        || uri.charAt(end) == '/' || uri.charAt(end) == '?' || uri.charAt(end) == ';';
                if (prevOk && endOk) {
                    return true;
                }
                at = uri.indexOf(kw, at + 1);
            }
        }
        return uri.endsWith("/index/query") || uri.endsWith("/index/system-query") || uri.endsWith("/probe");
    }

    /** raw 透传端点（外层恒 POST，内层真实方法藏在请求体里）。 */
    public static boolean isPassthroughEndpoint(String path) {
        if (path == null) return false;
        return path.endsWith("/cluster/raw") || path.endsWith("/cluster/devtools/execute");
    }

    /**
     * 内层 <b>ES 请求</b>是否为只读（raw / devtools 透传用）。
     *
     * <p>外层永远是 POST，权限层看不到真实动作，只能由执行端解析出内层 method + path 后回判。
     * 口径（A 方案白名单，fail-closed）：</p>
     * <ul>
     *   <li>{@code GET}/{@code HEAD}/{@code OPTIONS} → 只读；外加 {@code POST <索引>/_search_source}；
     *       注意 ES 的 {@code _search} 用 GET 时也可能带 body，按 method 判定即可。</li>
     *   <li>{@code POST} 仅当路径命中明确无副作用的读端点（见 {@link #READONLY_ES_POST_SUFFIXES}）。</li>
     *   <li>其余（含 {@code PUT}/{@code DELETE}/{@code PATCH}、{@code _bulk}、{@code _reindex}、
     *       {@code _close}/{@code _open}/写别名等）→ 写。</li>
     * </ul>
     * <p><b>宁可判写</b>：名单没覆盖到的读端点会被拦（用户可申请权限或走 ADMIN），
     * 但名单外的写端点绝不会被误放行。</p>
     */
    public static boolean isReadonlyEsRequest(String method, String path) {
        String m = method == null ? "" : method.trim().toUpperCase(java.util.Locale.ROOT);
        if ("GET".equals(m) || "HEAD".equals(m) || "OPTIONS".equals(m)) return true;
        if (!"POST".equals(m)) return false;
        String p = path == null ? "" : path.trim();
        int q = p.indexOf('?');
        if (q >= 0) p = p.substring(0, q);
        while (p.length() > 1 && p.endsWith("/")) p = p.substring(0, p.length() - 1);
        if (p.isEmpty()) return false;
        String lower = p.toLowerCase(java.util.Locale.ROOT);
        for (String suffix : READONLY_ES_POST_SUFFIXES) {
            if (lower.endsWith(suffix)) return true;
        }
        /* _cat/* 全族都是只读观测（列表/计数），统一按前缀放行。 */
        return lower.contains("/_cat/") || lower.startsWith("_cat/");
    }

    /**
     * 无副作用的 ES 只读 POST 端点（尾匹配）。名单刻意保守：每一条都确认「不改集群状态、
     * 只读文档/元数据」。{@code _scripts}、{@code _search_shards} 之类虽只读但极少在透传里用，
     * 不收录——宁可判写，不放行拿不准的。
     */
    private static final List<String> READONLY_ES_POST_SUFFIXES = Arrays.asList(
            "_search", "_async_search", "_search/template", "_render/template", "_msearch",
            "_msearch/template", "_count", "_field_caps", "_validate/query", "_explain",
            "_mget", "_get", "_source", "_termvectors", "_mtermvectors", "_analyze",
            "_search_source", "_knn_search", "_rank_eval", "_terms_enum",
            "_sql", "_sql/translate", "_eql/search", "_pit", "_search/point_in_time",
            "_ilm/explain", "_reindex/preview", "_cluster/health", "_cluster/state",
            "_cluster/stats", "_nodes/stats", "_cat", "_resolve/index");

    private static boolean containsAny(String uri, List<String> keywords) {
        for (String kw : keywords) {
            if (uri.contains(kw)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isAdminUri(String uri) {
        for (String kw : ADMIN_KEYWORDS) {
            if (uri.contains(kw)) {
                return true;
            }
        }
        return false;
    }

    /** 白名单精确匹配（不再 endsWith/contains——{@code /auth/login/../users/upsert} 曾借此短路鉴权）。 */
    static boolean isWhitelisted(String uri) {
        if (uri == null) {
            return false;
        }
        for (String w : WHITELIST) {
            if (uri.equals(w)) {
                return true;
            }
        }
        return false;
    }

    private static void deny(HttpServletResponse response, int status, String body) throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
    }

    private static String jsonEscape(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ");
    }
}
