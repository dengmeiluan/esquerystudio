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

package io.github.dengmeiluan.esquerystudio.console.core;

import java.util.Locale;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.action.admin.indices.alias.IndicesAliasesRequest;
import org.elasticsearch.action.admin.indices.alias.get.GetAliasesRequest;
import org.elasticsearch.action.admin.indices.delete.DeleteIndexRequest;
import org.elasticsearch.action.admin.indices.settings.put.UpdateSettingsRequest;
import org.elasticsearch.client.GetAliasesResponse;
import org.elasticsearch.client.RequestOptions;
import org.elasticsearch.client.RestHighLevelClient;
import org.elasticsearch.client.indices.CreateIndexRequest;
import org.elasticsearch.client.indices.GetIndexRequest;
import org.elasticsearch.client.tasks.GetTaskRequest;
import org.elasticsearch.client.tasks.GetTaskResponse;
import org.elasticsearch.client.tasks.TaskSubmissionResponse;
import org.elasticsearch.common.settings.Settings;
import org.elasticsearch.common.xcontent.XContentType;
import org.elasticsearch.index.reindex.ReindexRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * ES 索引/别名/reindex 底层操作封装，基于原生 {@link RestHighLevelClient}（与 spring-data-es 版本解耦）。
 *
 * <p>所有方法直接透传 ES 客户端异常（{@link IOException}），由编排层处理。</p>
 */
public class EsIndexAdmin {

    private static final Logger logger = LoggerFactory.getLogger(EsIndexAdmin.class);

    /** 复用单例 ObjectMapper 解析 reindex status 的 JSON 文本（ES {@code RawTaskStatus.toString()}）。 */
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 宿主集群 client（单集群时代的唯一通道，仍是兼容兜底）。 */
    private final RestHighLevelClient hostClient;

    /**  多集群路由（setter 可选注入）：非空时数据面操作跟随请求上下文的目标集群。 */
    private volatile io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter clientRouter;

    public EsIndexAdmin(RestHighLevelClient restHighLevelClient) {
        this.hostClient = restHighLevelClient;
    }

    /** 注入多集群路由（自动装配时调；不注入则恒用宿主 client，行为与旧版完全一致）。 */
    public void setClientRouter(io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter clientRouter) {
        this.clientRouter = clientRouter;
    }

    /* ============================================================================
     * 控制面索引保护（963）：用户库/审计/连接档案/监控等控制索引与数据面同集群时，
     * 通用数据端点（查询 / 文档 CRUD / 批量写 / mapping / settings / reindex / SQL / 模板 / ILM）
     * 不得触达 esquerystudio_*——否则 VIEWER 可读用户哈希与审计、OPERATOR 可篡改审计/伪造用户。
     * ADMIN raw 是唯一逃生通道（performUnguarded），不在此守卫范围。
     * ============================================================================ */

    /** 控制面索引前缀（用户库/审计/连接档案/监控/校验临时索引）。 */
    static final String CONTROL_INDEX_PREFIX = "esquerystudio_";
    /** 配置校验临时索引：校验器创建后即删，允许其经 EsIndexAdmin 走建/删/存在性检查。 */
    static final String VALIDATE_INDEX_PREFIX = "esquerystudio_validate_";

    /** 宿主可配置的控制索引实名（用户库/审计/连接档案/监控），由自动装配注入。 */
    private volatile Set<String> extraControlIndexNames = Collections.emptySet();

    /** 注入控制索引实名（大小写归一、去空；默认前缀之外的宿主自定义名）。 */
    public void setExtraControlIndexNames(java.util.Collection<String> names) {
        java.util.Set<String> out = new java.util.LinkedHashSet<>();
        if (names != null) {
            for (String n : names) {
                if (n != null && !n.trim().isEmpty()) out.add(n.trim().toLowerCase(Locale.ROOT));
            }
        }
        this.extraControlIndexNames = Collections.unmodifiableSet(out);
    }

    /** 控制面/系统/隐藏索引（列表展示脱敏用，非 ADMIN 不下发名字）。 */
    public boolean isControlIndex(String n) {
        return isControlIndexName(n);
    }

    private boolean isControlIndexName(String n) {
        if (n == null || n.isEmpty()) return false;
        /* 点号索引是 ES 系统/隐藏索引（.security/.watches/.kibana 等），通用数据面一律不得触达 */
        if (n.startsWith(".")) return true;
        if (n.startsWith(CONTROL_INDEX_PREFIX)
                || n.equals("esquerystudio_adhoc_job")
                || n.startsWith("esquerystudio_adhoc_job-")
                || n.endsWith("_esquerystudio_lock")
                || n.endsWith("_esquerystudio_migrate_job")) {
            return true;
        }
        for (String x : extraControlIndexNames) {
            if (n.equals(x) || n.startsWith(x + "-") || n.startsWith(x + ".")) return true;
        }
        return false;
    }

    /** _cat 行过滤专用：ES 自带的作业历史索引含跨租户策略/快照活动，不属数据面。
     *  仅用于展示脱敏，不放宽/收紧 guardIndexName（校验器的临时索引仍需可清理）。 */
    private static boolean isSensitiveSystemIndexName(String n) {
        return n.startsWith("ilm-history-") || n.startsWith("slm-history-");
    }

    /** 通配字面量前缀是否可能覆盖任一控制索引名（含宿主自定义名）。 */
    private boolean couldMatchControl(String literal) {
        if (literal == null || literal.isEmpty()) return true;
        if (CONTROL_INDEX_PREFIX.startsWith(literal)
                || "esquerystudio_adhoc_job".startsWith(literal)
                || "_esquerystudio_lock".startsWith(literal)
                || "_esquerystudio_migrate_job".startsWith(literal)) {
            return true;
        }
        for (String x : extraControlIndexNames) {
            if (x.startsWith(literal)) return true;
        }
        return false;
    }

    private org.elasticsearch.client.Response performGuarded(org.elasticsearch.client.Request req) throws IOException {
        guardControlPath(req.getEndpoint());
        return restHighLevelClient().getLowLevelClient().performRequest(req);
    }

    /** ADMIN raw 专用：绕过控制索引守卫（应急逃生通道）。 */
    private org.elasticsearch.client.Response performUnguarded(org.elasticsearch.client.Request req) throws IOException {
        return restHighLevelClient().getLowLevelClient().performRequest(req);
    }

    /**
     * 低层请求路径守卫：首段是控制索引、或其通配模式可能命中控制索引时拒绝。
     * 系统 API（首段 {@code _}）不在此判定；需要时由调用方显式 guardIndexPattern（如 _cat/shards）。
     */
    void guardControlPath(String path) {
        if (path == null || !path.startsWith("/")) return;
        int q = path.indexOf('?');
        String p = q < 0 ? path : path.substring(0, q);
        /* 逐段拒绝目录穿越/编码分隔符：只查首段会漏掉 /logs/_doc/../../_security/...。
           用户可控 ID 已由 encodePathToken 编码，这里兜底未来新增的裸拼路径。 */
        for (String rawSeg : p.split("/")) {
            if (rawSeg.isEmpty()) continue;
            String seg;
            try {
                seg = java.net.URLDecoder.decode(rawSeg, "UTF-8");
            } catch (Exception e) {
                throw new ControlPlaneGuardException("请求路径编码非法，已拒绝：" + rawSeg);
            }
            if (".".equals(seg) || "..".equals(seg)
                    || seg.indexOf('/') >= 0 || seg.indexOf('\\') >= 0
                    || seg.indexOf('\u0000') >= 0) {
                throw new ControlPlaneGuardException("请求路径含目录穿越片段，已拒绝：" + p);
            }
        }
        int slash = p.indexOf('/', 1);
        String first = slash < 0 ? p.substring(1) : p.substring(1, slash);
        if (first.isEmpty()) {
            // "//" 前缀空首段：ES 路由跳过空段，折叠出真实首段再判定——直接放行会让
            // 上层裸拼 "/"+indexOrAlias 在入参自带前导斜杠时整条守卫失明
            for (String seg : p.substring(1).split("/")) {
                if (!seg.isEmpty()) { first = seg; break; }
            }
        }
        if (first.isEmpty() || "_all".equalsIgnoreCase(first)) {
            if (first.isEmpty()) return;
            throw new ControlPlaneGuardException("不允许对全量索引执行该操作（控制面索引不可触达）：_all");
        }
        if (first.startsWith("_")) return;
        String decoded;
        try {
            decoded = java.net.URLDecoder.decode(first, "UTF-8");
        } catch (Exception e) {
            // 非法编码无法判定真实目标——fail-closed（不存在需要非法 % 序列的合法索引路径）
            throw new ControlPlaneGuardException("索引路径编码非法，已拒绝：" + first);
        }
        String lower = decoded.toLowerCase(Locale.ROOT);
        /* 只校验首段索引表达式：后续段是文档/脚本 ID，ES 允许空格与 <>{|" 等字符，
           全局段校验会把合法的 my%20id 误杀。 */
        rejectIndexExpressionChars(lower, decoded);
        if ("_all".equals(lower) || "*".equals(lower)) {
            throw new ControlPlaneGuardException("不允许对全量索引执行该操作（控制面索引不可触达）：" + decoded);
        }
        if (lower.contains("..") || lower.indexOf('/') >= 0 || lower.indexOf('\\') >= 0) {
            throw new ControlPlaneGuardException("索引路径含目录穿越片段，已拒绝：" + first);
        }
        if (lower.indexOf('*') >= 0 || lower.indexOf('?') >= 0 || lower.indexOf(',') >= 0) {
            guardIndexPattern(lower);
        } else {
            guardIndexName(lower);
        }
    }

    /**
     * 路径段安全编码：文档 ID / 脚本 ID 等用户可控值一律不得携带路径分隔或穿越片段。
     * 仅靠 URLEncoder 不够——{@code ..} 不被编码，HTTP 客户端规范化后会把
     * {@code /logs/_doc/../../_security/...} 收缩成控制面路径。
     */
    static String encodePathToken(String value, String label) {
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException(label + " 不能为空");
        }
        String lower = value.toLowerCase(Locale.ROOT);
        if (lower.contains("..") || value.indexOf('/') >= 0 || value.indexOf('\\') >= 0
                || value.indexOf('?') >= 0 || value.indexOf('#') >= 0
                || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0
                || value.indexOf('\u0000') >= 0) {
            throw new ControlPlaneGuardException(label + " 含非法路径字符，已拒绝：" + value);
        }
        try {
            return java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException("UTF-8 unavailable", e);
        }
    }

    /**
     * 索引表达式结构字符守卫：ES 索引名不允许 {@code < > { } " |} 与空白。
     * date-math（{@code <esquerystudio_user>}）会在 ES 侧被解析回控制索引名，若只按
     * 字面前缀判定即可绕过全部控制面守卫；数据面端点一律不接受 date-math 包装。
     */
    private static void rejectIndexExpressionChars(String lower, String original) {
        for (int i = 0; i < lower.length(); i++) {
            char c = lower.charAt(i);
            /* # 是 URI 片段分隔符：守卫看到 index#，HTTP 客户端却只把 index 发给 ES——
               会绕过按名判定（DELETE /index# 实际删除 index）。索引名本身也禁止 #。 */
            if (c == '<' || c == '>' || c == '{' || c == '}' || c == '"' || c == '|' || c == '#'
                    || Character.isWhitespace(c) || Character.isISOControl(c)) {
                throw new ControlPlaneGuardException("索引名/模式含非法字符，已拒绝：" + original);
            }
        }
    }

    /** 精确索引名守卫；校验器临时索引放行（只用于建/删/存在性检查）。 */
    void guardIndexName(String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("索引名不能为空");
        }
        String n = stripBom(name).trim().toLowerCase(Locale.ROOT);
        rejectIndexExpressionChars(n, name);
        /* 精确索引操作不接受逗号列表/通配：ES 的 DeleteIndexRequest 会按逗号拆成多目标，
           logs,esquerystudio_user 这类载荷能绕过单名控制面判定。 */
        if (n.indexOf(',') >= 0 || n.indexOf('*') >= 0 || n.indexOf('?') >= 0) {
            throw new ControlPlaneGuardException("精确索引操作不允许逗号列表或通配符：" + name);
        }
        if (n.indexOf('#') >= 0 || n.indexOf('%') >= 0) {
            throw new ControlPlaneGuardException("索引名含 URL 特殊字符，已拒绝：" + name);
        }
        if ("_all".equals(n) || "*".equals(n)) {
            throw new ControlPlaneGuardException("不允许对全量索引执行该操作（控制面索引不可触达）：" + name);
        }
        if (n.contains("..") || n.indexOf('/') >= 0 || n.indexOf('\\') >= 0) {
            throw new ControlPlaneGuardException("索引名含目录穿越片段，已拒绝：" + name);
        }
        if (n.indexOf(':') >= 0) {
            throw new ControlPlaneGuardException("索引名不允许跨集群表达式：" + name);
        }
        /* 校验器临时索引前缀属于控制面命名空间（isControlIndexName 已覆盖）：
           不能在通用守卫里做前缀豁免——否则任何持 create-index/doc 写键的人都能建
           esquerystudio_validate_* 隐藏索引（所有非 ADMIN 列表都看不到，仍可写）。
           校验器走专用 createValidatorTempIndex/deleteValidatorTempIndex 通道。 */
        if (isControlIndexName(n)) {
            throw new ControlPlaneGuardException("控制面索引不对通用数据接口开放：" + name);
        }
    }

    /** 迁移等跨集群流程的源/目标索引：只接受精确业务索引名（拒绝控制面/系统/通配/列表/表达式）。 */
    public void guardExactDataIndex(String name) {
        guardIndexName(name);
    }

    /**
     * 索引通配模式守卫：{@code *}/{@code _all}/空字面量前缀，以及字面量前缀能覆盖
     * 控制索引名的模式（{@code es_*}、{@code e*}、宿主自定义名前缀）一律拒绝——
     * 防止“查全部”把控制索引带出。
     */
    public void guardIndexPattern(String pattern) {
        guardIndexPattern(pattern, true);
    }

    void guardIndexPattern(String pattern, boolean resolveWildcards) {
        if (pattern == null) return;
        boolean anyPositive = false;
        for (String raw : pattern.split(",")) {
            String p = stripBom(raw).trim().toLowerCase(Locale.ROOT);
            boolean excluded = p.startsWith("-");
            if (excluded) p = p.substring(1).trim();
            if (p.isEmpty()) continue;
            rejectIndexExpressionChars(p, pattern);
            if (!excluded) anyPositive = true;
            if (p.contains("..") || p.indexOf('/') >= 0 || p.indexOf('\\') >= 0) {
                throw new ControlPlaneGuardException("索引模式含目录穿越片段，已拒绝：" + pattern);
            }
            if (p.indexOf(':') >= 0) {
                throw new ControlPlaneGuardException("索引模式不允许跨集群表达式：" + pattern);
            }
            if ("_all".equals(p) || "*".equals(p)) {
                throw new ControlPlaneGuardException("不允许对全量索引执行该操作（控制面索引不可触达）：" + pattern);
            }
            if (p.startsWith(VALIDATE_INDEX_PREFIX)) {
                throw new ControlPlaneGuardException("校验器临时索引不对用户态接口开放：" + pattern);
            }
            if (p.startsWith(".")) {
                throw new ControlPlaneGuardException("系统/隐藏索引不对通用数据接口开放：" + pattern);
            }
            if (isControlIndexName(p)) {
                throw new ControlPlaneGuardException("控制面索引不对通用数据接口开放：" + pattern);
            }
            /* 后缀型控制索引（*_esquerystudio_lock / *_esquerystudio_migrate_job）无法靠“字面前缀”判断，
               模式里出现控制面词根时直接拒绝，防 logs*_esquerystudio_lock* 这类通配命中。 */
            if (p.contains(CONTROL_INDEX_PREFIX) || p.contains("esquerystudio_adhoc_job")
                    || p.contains("_esquerystudio_lock") || p.contains("_esquerystudio_migrate_job")) {
                throw new ControlPlaneGuardException("索引模式含控制面词根，已拒绝：" + pattern);
            }
            int wild = -1;
            for (int i = 0; i < p.length(); i++) {
                char c = p.charAt(i);
                if (c == '*' || c == '?') { wild = i; break; }
            }
            if (wild < 0) continue;
            String literal = p.substring(0, wild);
            if (couldMatchControl(literal)) {
                throw new ControlPlaneGuardException("索引模式可能命中控制面索引，已拒绝：" + pattern);
            }
        }
        /* 纯排除表达式（如 index=-logs）在 ES 里等价于“全量减 logs”，会把控制面索引带出。 */
        if (!anyPositive) {
            throw new ControlPlaneGuardException("索引模式不能只包含排除项（会隐式全量）：" + pattern);
        }
        if (!resolveWildcards || !hasIndexClient()) return;
        for (String raw : pattern.split(",")) {
            String p = raw.trim();
            if (p.startsWith("-")) p = p.substring(1).trim();
            if (p.isEmpty() || p.startsWith(VALIDATE_INDEX_PREFIX)) continue;
            if (p.indexOf('*') < 0 && p.indexOf('?') < 0) continue;
            resolveWildcardTargets(p);
        }
    }

    /**
     * 通配模式真实目标解析：字面前缀判定看不到 {@code logs-2026*} 命中
     * {@code logs-2026_esquerystudio_lock} 这类后缀控制索引。解析失败/为空一律 fail-closed，
     * 与 {@link #guardDestructivePattern(String)} 同口径；解析成功则逐个过精确名守卫。
     */
    private void resolveWildcardTargets(String pattern) {
        final java.util.List<Map<String, Object>> rows;
        try {
            String enc = java.net.URLEncoder.encode(pattern, "UTF-8").replace("+", "%20");
            rows = performJsonArray("GET",
                    "/_cat/indices/" + enc + "?format=json&h=index&expand_wildcards=all");
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception e) {
            throw new ControlPlaneGuardException("无法解析通配索引目标，已拒绝："
                    + pattern + "（" + e.getMessage() + "）");
        }
        if (rows == null) {
            throw new ControlPlaneGuardException("通配索引目标解析为空，已拒绝：" + pattern);
        }
        for (Map<String, Object> row : rows) {
            Object name = row.get("index");
            if (name != null) guardIndexName(String.valueOf(name));
        }
    }

    /**
     * 破坏性通配操作（_delete_by_query/_update_by_query）的目标解析：
     * {@code logs-2026*} 会命中 {@code logs-2026_esquerystudio_lock} 这类“后缀控制索引”，
     * 字面前缀判定看不出来。先向集群解析出真实索引名，再逐个过精确名守卫；
     * 解析失败时 fail-closed（无法证明通配不覆盖控制面就不执行）。
     */
    void guardDestructivePattern(String pattern) {
        guardIndexPattern(pattern, false);
        if (pattern == null) return;
        String p = pattern.trim();
        if (p.indexOf('*') < 0 && p.indexOf('?') < 0) return;
        final java.util.List<Map<String, Object>> rows;
        try {
            String enc = java.net.URLEncoder.encode(p, "UTF-8").replace("+", "%20");
            /* 不带 expand_wildcards：6.x 兼容性优先；控制面后缀索引均为普通 open 索引，
               通配破坏性操作本身也只作用于 open 索引。 */
            rows = performJsonArray("GET", "/_cat/indices/" + enc + "?format=json&h=index");
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception e) {
            throw new ControlPlaneGuardException("无法解析通配索引目标，已拒绝破坏性操作："
                    + pattern + "（" + e.getMessage() + "）");
        }
        if (rows == null) {
            throw new ControlPlaneGuardException("通配索引目标解析为空，已拒绝破坏性操作：" + pattern);
        }
        for (Map<String, Object> row : rows) {
            Object name = row.get("index");
            if (name != null) guardIndexName(String.valueOf(name));
        }
    }

    /** 对外数据面端点专用：校验器临时索引也不得被用户态请求读写（内部校验器仍走 guardIndexPattern）。 */
    private void guardPublicIndexPattern(String pattern) {
        pattern = stripBom(pattern);
        if (pattern != null) {
            for (String raw : pattern.split(",")) {
                String p = stripBom(raw).trim().toLowerCase(Locale.ROOT);
                if (p.startsWith("-")) p = p.substring(1).trim();
                if (p.startsWith(VALIDATE_INDEX_PREFIX)) {
                    throw new ControlPlaneGuardException("校验器临时索引不对用户态接口开放：" + pattern);
                }
            }
        }
        guardIndexPattern(pattern);
    }

    /** 请求体守卫：SQL / reindex / bulk / 模板 / ILM / 快照 body 中一旦出现控制面索引名即拒绝。 */
    void guardControlBody(String body) {
        body = stripBom(body);
        if (body == null || body.isEmpty()) return;
        // ES 解码 JSON unicode 转义；字面扫描前同步解码，防转义绕过按名守卫。
        // 精确前缀之外补通配形态（esquerystudio* 可匹配账号/连接/审计族），但不用裸词根
        // 以免误伤正文里出现 "esquerystudio" 字样的业务文档。
        String lower = decodeJsonUnicodeEscapes(body).toLowerCase(Locale.ROOT);
        if (lower.contains(CONTROL_INDEX_PREFIX) || lower.contains("esquerystudio*") || lower.contains("esquerystudio?")
                || lower.contains("esquerystudio_adhoc_job")
                || lower.contains("_esquerystudio_lock") || lower.contains("_esquerystudio_migrate_job")
                || lower.contains(".security") || lower.contains(".kibana")) {
            throw new ControlPlaneGuardException("请求体不得引用控制面索引：" + CONTROL_INDEX_PREFIX + "*");
        }
        for (String x : extraControlIndexNames) {
            if (lower.contains(x)) {
                throw new ControlPlaneGuardException("请求体不得引用控制面索引：" + x);
            }
        }
    }

    /**
     * 搜索 DSL 的结构化目标守卫：{@code terms/terms_set/percolate} 的 lookup index 与
     * {@code more_like_this} 的文档 _index 是请求体里的<b>二级数据源</b>，字面扫描
     * （只查 .security / esquerystudio_ 精确词）挡不住 {@code .securit*} 等通配形态。
     * 逐个解析并复用统一索引表达式守卫。
     */
    void guardSearchBody(String body) {
        body = stripBom(body);
        if (body == null || body.trim().isEmpty()) return;
        final Object root;
        try {
            root = OBJECT_MAPPER.readValue(body, Object.class);
        } catch (Exception e) {
            return; // 非 JSON 由 ES 原始报错
        }
        /* 只做结构化目标扫描：查询值里合法出现 "esquerystudio"/".security" 字样
           （业务日志检索）不能误杀；索引目标由 _index/terms/wrapper/indices/模板体逐层守卫。 */
        guardSearchTargets(root, true);
    }

    @SuppressWarnings("unchecked")
    private void guardSearchTargets(Object node) {
        guardSearchTargets(node, false);
    }

    /** 查询子句容器：其直接键是子句类型（terms/bool/...），Mustache 渲染会伪装成另一子句。 */
    private static final java.util.Set<String> QUERY_CLAUSE_CONTAINER_KEYS = new java.util.HashSet<>(
            java.util.Arrays.asList("query", "must", "should", "must_not", "filter", "filters", "functions"));

    /** 子句容器直接键出现占位符=渲染后可变成 terms/lookup 等目标子句，一律拒绝。 */
    private static void rejectPlaceholderClauseKeys(Object container) {
        if (container instanceof Map) {
            rejectPlaceholderKeys((Map<?, ?>) container);
        } else if (container instanceof java.util.List) {
            for (Object one : (java.util.List<?>) container) {
                if (one instanceof Map) rejectPlaceholderKeys((Map<?, ?>) one);
            }
        }
    }

    /** 对象形态的模板 source 也要拒绝分隔符切换（字符串分支已单独处理）。 */
    private static void rejectTemplateDelimiters(Object node) {
        if (node instanceof String) {
            String s = (String) node;
            if (s.contains("{{=")) {
                throw new ControlPlaneGuardException("搜索模板不允许切换 Mustache 分隔符");
            }
        } else if (node instanceof Map) {
            for (Map.Entry<?, ?> e : ((Map<?, ?>) node).entrySet()) {
                if (e.getKey() instanceof String && ((String) e.getKey()).contains("{{=")) {
                    throw new ControlPlaneGuardException("搜索模板不允许切换 Mustache 分隔符");
                }
                rejectTemplateDelimiters(e.getValue());
            }
        } else if (node instanceof java.util.List) {
            for (Object one : (java.util.List<?>) node) rejectTemplateDelimiters(one);
        }
    }

    /**
     * Mustache 模板字符串的控制面目标守卫（与 {@link #guardControlBody(String)} 同词表）。
     *
     * <p>模板体在服务端渲染后才成为 DSL，结构化扫描看不到渲染结果；嵌套模板解析失败时
     * 旧实现只对根级 fail-closed，{@code query.template.inline} 可借此把
     * {@code {{#x}}.security{{/x}}} 渲染成 terms lookup 的 index。这里对任意深度的模板串
     * 做去标签后的字面扫描：既拦直写，也拦把控制面名拆进多个 section 的拼接写法。</p>
     */
    private void guardTemplateStringTargets(String s) {
        if (s == null || s.isEmpty()) return;
        if (s.contains("{{=")) {
            throw new ControlPlaneGuardException("搜索模板不允许切换 Mustache 分隔符");
        }
        if (!s.contains("{{")) return;
        String lower = decodeJsonUnicodeEscapes(s).toLowerCase(Locale.ROOT);
        /* 去掉 {{...}} 段后再拼起来：{{#a}}.sec{{/a}}{{#b}}urity{{/b}} 不能靠拆词绕过。 */
        String stitched = lower.replaceAll("\\{\\{[^}]*\\}\\}", "");
        if (containsControlLiteral(lower) || containsControlLiteral(stitched)) {
            throw new ControlPlaneGuardException("搜索模板体不得引用控制面索引：" + CONTROL_INDEX_PREFIX + "*");
        }
        for (String x : extraControlIndexNames) {
            if (lower.contains(x) || stitched.contains(x)) {
                throw new ControlPlaneGuardException("搜索模板体不得引用控制面索引：" + x);
            }
        }
    }

    private static boolean containsControlLiteral(String lower) {
        return lower.contains(CONTROL_INDEX_PREFIX)
                || lower.contains("esquerystudio*") || lower.contains("esquerystudio?")
                || lower.contains("esquerystudio_adhoc_job")
                || lower.contains("_esquerystudio_lock") || lower.contains("_esquerystudio_migrate_job")
                || lower.contains(".security") || lower.contains(".kibana");
    }

    @SuppressWarnings("unchecked")
    private void guardSearchTargets(Object node, boolean root) {
        if (node instanceof Map) {
            Map<String, Object> map = (Map<String, Object>) node;
            rejectPlaceholderStructuralKeys(map);
            for (Map.Entry<String, Object> e : map.entrySet()) {
                if (QUERY_CLAUSE_CONTAINER_KEYS.contains(e.getKey())) {
                    rejectPlaceholderClauseKeys(e.getValue());
                }
            }
            guardTermsClause(map.get("terms"));
            guardTermsClause(map.get("terms_set"));
            guardLookupClause(map.get("percolate"));
            guardLookupClause(map.get("indexed_shape"));
            guardMoreLikeThis(map.get("more_like_this"));
            guardWrapperQuery(map.get("wrapper"));
            /* boost 目标键虽然只加权已命中的检索，为维持索引键位全集口径，
               目标同样过索引表达式守卫（index_boost 数组形态 / indices_boost 对象键形态）。 */
            guardIndexBoostTargets(map.get("index_boost"));
            guardIndexBoostTargets(map.get("indices_boost"));
            /* ES 7.13+ 的 indices 查询是二级数据源：子查询跑在另一个索引上。 */
            guardIndicesQuery(map.get("indices"));
            /* 任何内嵌文档引用（pinned/MLT 等）的 _index 同样是二级数据源。 */
            Object docIndex = map.get("_index");
            rejectPlaceholderTarget("_index", docIndex);
            if (docIndex instanceof String && !((String) docIndex).trim().isEmpty()) {
                guardPublicIndexPattern((String) docIndex);
            }
            for (Map.Entry<String, Object> e : map.entrySet()) {
                Object value = e.getValue();
                boolean templateField = "source".equals(e.getKey()) || "inline".equals(e.getKey())
                        || "template".equals(e.getKey());
                if (value instanceof Map || value instanceof java.util.List) {
                    if (root && templateField) {
                        /* 对象形态的 source 同样会被 Mustache 渲染；分隔符切换先把
                           <%k%> 伪装成普通字段名，后续子句键扫描会失明。 */
                        rejectTemplateDelimiters(value);
                    }
                    guardSearchTargets(value, false);
                } else if (templateField && value instanceof String) {
                    /* 根级 source/inline/template 才是 _search/template 的模板体；
                       嵌套同名字段可能只是普通字段值。ES 三种字段名都接受且后者覆盖前者。 */
                    String s = ((String) value).trim();
                    /* 嵌套 template 查询（query.template.inline）同样是 Mustache 模板：
                       解析失败时不能静默放行，否则 {{#x}}.security{{/x}} 这类渲染后目标
                       可绕过全部结构化守卫（控制面 terms/wrapper/MLT 查询）。 */
                    guardTemplateStringTargets(s);
                    if (s.startsWith("{") || s.startsWith("[")) {
                        try {
                            guardSearchTargets(OBJECT_MAPPER.readValue(s, Object.class), false);
                        } catch (ControlPlaneGuardException ex) {
                            throw ex;
                        } catch (Exception ignored) {
                            if (root) {
                                /* 模板 source 解析失败仍可能被 ES 作为 Mustache 渲染
                                   （{{!注释}} 前缀会让 Jackson 失败），不能静默放行。 */
                                throw new ControlPlaneGuardException("搜索模板 source 不是合法 JSON，已拒绝");
                            }
                        }
                    }
                }
            }
        } else if (node instanceof java.util.List) {
            for (Object one : (java.util.List<?>) node) {
                if (one instanceof Map || one instanceof java.util.List) {
                    guardSearchTargets(one);
                }
            }
        }
    }

    /** boost 目标守卫：index_boost 为数组（元素 {index,boost} 或裸索引名），
     * indices_boost 为对象（键=索引名）或数组（元素为键值对象）。 */
    private void guardIndexBoostTargets(Object value) {
        if (value instanceof Map) {
            for (Object key : ((Map<?, ?>) value).keySet()) {
                if (key instanceof String) guardRawIndexToken((String) key);
            }
        } else if (value instanceof List) {
            for (Object one : (List<?>) value) {
                if (one instanceof Map) {
                    Object idx = ((Map<?, ?>) one).get("index");
                    if (idx instanceof String) guardRawIndexToken((String) idx);
                    for (Object key : ((Map<?, ?>) one).keySet()) {
                        if (key instanceof String && !"boost".equals(key)) {
                            /* 数组元素的裸键形态（[{"logs":1.5}]）键即索引名 */
                            guardRawIndexToken((String) key);
                        }
                    }
                } else if (one instanceof String) {
                    guardRawIndexToken((String) one);
                }
            }
        }
    }

    /**
     * Mustache 模板参数出现在结构键位（lookup 的 index/id/path、文档 _index/_id 等）时，
     * 渲染后可能把普通字段名变成控制面目标，而结构化守卫只认字面键名。此类模板直接拒绝；
     * 普通动态字段键（如 match 的 {{field}}）没有这些兄弟键，不受影响。
     */
    private static void rejectPlaceholderStructuralKeys(Map<?, ?> map) {
        boolean placeholder = false;
        for (Object k : map.keySet()) {
            if (k instanceof String && ((String) k).contains("{{") && ((String) k).contains("}}")) {
                placeholder = true;
                break;
            }
        }
        if (!placeholder) return;
        for (String key : new String[]{"_index", "_id", "id", "path", "_source", "source", "query", "indices"}) {
            if (map.containsKey(key)) {
                throw new ControlPlaneGuardException("搜索模板参数不得出现在结构化键位（邻近 " + key + "）");
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void guardLookupClause(Object clause) {
        if (!(clause instanceof Map)) return;
        Object index = ((Map<String, Object>) clause).get("index");
        guardLookupIndex(index);
    }

    /** {@code indices} 查询：{"indices":[...],"query":{...}}，子查询目标必须过同一索引守卫。 */
    private void guardIndicesQuery(Object clause) {
        if (!(clause instanceof Map)) return;
        guardLookupIndex(((Map<?, ?>) clause).get("indices"));
    }

    /** terms/terms_set 的 lookup 形态是 {@code {"field":{"index":...,"id":...}}}：逐字段下探。 */
    @SuppressWarnings("unchecked")
    private void guardTermsClause(Object clause) {
        if (!(clause instanceof Map)) return;
        Map<String, Object> terms = (Map<String, Object>) clause;
        guardLookupIndex(terms.get("index"));
        for (Object value : terms.values()) {
            if (value instanceof Map) {
                /* terms lookup 的字段级对象形如 {"index":...,"id":...,"path":...}。
                   字段键本身也可能被 Mustache 渲染（{"{{k}}":"{{v}}"}），渲染后
                   会变成真实的 index/id/path 键，静态守卫看不见——模板里一律拒绝。 */
                rejectPlaceholderKeys((Map<?, ?>) value);
                guardLookupIndex(((Map<String, Object>) value).get("index"));
            }
        }
    }

    /**
     * 结构化目标位出现 Mustache 占位符时拒绝：渲染后的索引名无法静态校验，
     * 允许 {@code {{idx}}} 等于把控制面守卫交给模板参数。普通字段键不受影响。
     */
    private static void rejectPlaceholderTarget(String label, Object value) {
        if (value instanceof String) {
            String s = (String) value;
            if (s.contains("{{") && s.contains("}}")) {
                throw new ControlPlaneGuardException("搜索模板参数不得用于结构目标 " + label + "：" + s);
            }
        } else if (value instanceof java.util.List) {
            for (Object one : (java.util.List<?>) value) {
                rejectPlaceholderTarget(label, one);
            }
        }
    }

    private static void rejectPlaceholderKeys(Map<?, ?> map) {
        for (Object key : map.keySet()) {
            if (key instanceof String && ((String) key).contains("{{")
                    && ((String) key).contains("}}")) {
                throw new ControlPlaneGuardException("搜索模板参数不得出现在结构化键位：" + key);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void guardLookupIndex(Object index) {
        rejectPlaceholderTarget("index", index);
        if (index instanceof String && !((String) index).trim().isEmpty()) {
            guardPublicIndexPattern((String) index);
        } else if (index instanceof java.util.List) {
            for (Object one : (java.util.List<?>) index) {
                if (one instanceof String && !((String) one).trim().isEmpty()) {
                    guardPublicIndexPattern((String) one);
                }
            }
        }
    }

    /** wrapper 查询把真实 DSL 藏在 base64 里：解码后递归走同一套二级索引守卫，非法编码 fail-closed。 */
    private void guardWrapperQuery(Object wrapper) {
        if (!(wrapper instanceof Map)) return;
        Object encoded = ((Map<?, ?>) wrapper).get("query");
        if (!(encoded instanceof String)) return;
        String s = ((String) encoded).trim();
        if (s.isEmpty()) return;
        byte[] bytes;
        try {
            bytes = java.util.Base64.getDecoder().decode(s);
        } catch (IllegalArgumentException standard) {
            try {
                bytes = java.util.Base64.getUrlDecoder().decode(s);
            } catch (IllegalArgumentException urlSafe) {
                throw new ControlPlaneGuardException("wrapper 查询编码非法，已拒绝");
            }
        }
        try {
            guardSearchTargets(OBJECT_MAPPER.readValue(
                    new String(bytes, java.nio.charset.StandardCharsets.UTF_8), Object.class));
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception e) {
            throw new ControlPlaneGuardException("wrapper 查询解码后不是合法 DSL，已拒绝");
        }
    }

    @SuppressWarnings("unchecked")
    private void guardMoreLikeThis(Object mlt) {
        if (!(mlt instanceof Map)) return;
        for (String key : new String[]{"like", "unlike"}) {
            Object docs = ((Map<String, Object>) mlt).get(key);
            if (!(docs instanceof java.util.List)) continue;
            for (Object doc : (java.util.List<?>) docs) {
                if (!(doc instanceof Map)) continue;
                Object index = ((Map<String, Object>) doc).get("_index");
                guardLookupIndex(index);
            }
        }
    }

    /** 仅解码 JSON 字符串里的 unicode 转义（控制面名均为 ASCII，无需处理代理对）。 */
    private static String decodeJsonUnicodeEscapes(String s) {
        if (s == null || s.indexOf("\\u") < 0) return s;
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); ) {
            char c = s.charAt(i);
            if (c == '\\' && i + 5 < s.length() && s.charAt(i + 1) == 'u') {
                int v = 0;
                boolean hex = true;
                for (int j = i + 2; j < i + 6; j++) {
                    int d = Character.digit(s.charAt(j), 16);
                    if (d < 0) { hex = false; break; }
                    v = (v << 4) | d;
                }
                if (hex) {
                    out.append((char) v);
                    i += 6;
                    continue;
                }
            }
            out.append(c);
            i++;
        }
        return out.toString();
    }

    /** SQL 守卫：除字面控制索引外，FROM/JOIN 的通配模式（* / es_* / e*）也不得覆盖控制索引。 */
    void guardSql(String sqlBody) {
        sqlBody = stripBom(sqlBody);
        if (sqlBody == null || sqlBody.isEmpty()) return;
        /* SQL 的 filter 是独立 Query DSL 通道：只扫 SQL 文本会漏掉 terms lookup /
           more_like_this 等二级数据源，filter 必须与搜索 body 同一套结构化守卫。 */
        String trimmedBody = sqlBody.trim();
        if (trimmedBody.startsWith("{") || trimmedBody.startsWith("[")) {
            guardSearchBody(sqlBody);
        }
        /* ES 执行的是 JSON 解码后的 query 字符串。正则抽 FROM/JOIN 会被以下形态绕过：
           FROM"e*"（无空白）、FROM 后紧跟注释、FROM "a", "e*"（只取首个目标）、
           字符串内的 -- 被误当注释。改为词法扫描：先剥注释（保留单引号字面量），
           再逐个识别 FROM/JOIN 并解析完整表清单（引号/反引号/别名/逗号列表/子查询）。 */
        String normalized = stripSqlComments(decodeJsonUnicodeEscapes(sqlQueryOf(sqlBody)));
        String head = normalized.trim();
        String firstWord = head.isEmpty() ? "" : sqlWordAt(head, 0);
        if ("SHOW".equalsIgnoreCase(firstWord) || "DESCRIBE".equalsIgnoreCase(firstWord)
                || "DESC".equalsIgnoreCase(firstWord)) {
            /* 元数据枚举会列出控制面索引名；无索引目标可审，直接拒绝（ADMIN 走 raw 逃生通道） */
            throw new ControlPlaneGuardException("SQL 元数据枚举不对通用数据接口开放：" + firstWord);
        }
        java.util.List<String> wildcardTables = new java.util.ArrayList<>();
        int i = 0;
        int n = normalized.length();
        while (i < n) {
            char c = normalized.charAt(i);
            if (c == '\'' || c == '"' || c == '`') {
                int end = skipSqlQuoted(normalized, i);
                if (end >= n && normalized.charAt(Math.max(0, n - 1)) != c) {
                    throw new ControlPlaneGuardException("SQL 引号未闭合，已拒绝");
                }
                i = end;
                continue;
            }
            if (Character.isLetter(c) || c == '_') {
                int start = i;
                while (i < n && isSqlWordChar(normalized.charAt(i))) i++;
                String word = normalized.substring(start, i);
                if ("FROM".equalsIgnoreCase(word) || "JOIN".equalsIgnoreCase(word)) {
                    i = guardSqlTableList(normalized, i, wildcardTables);
                }
                continue;
            }
            i++;
        }
        /* 通配表可能命中后缀型控制索引（logs-2026* -> logs-2026_esquerystudio_lock）：
           有 ES 客户端时解析真实目标；测试/无客户端环境维持既有字面守卫。 */
        if (hasIndexClient()) {
            for (String pattern : wildcardTables) {
                guardDestructivePattern(pattern);
            }
        }
    }

    private boolean hasIndexClient() {
        return clientRouter != null || hostClient != null;
    }

    private static boolean isSqlWordChar(char c) {
        return Character.isLetterOrDigit(c) || c == '_';
    }

    /** 跳过单引号字面量/双引号或反引号标识符；支持 SQL 双写转义与反斜杠转义。 */
    private static int skipSqlQuoted(String s, int start) {
        char quote = s.charAt(start);
        int i = start + 1;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == '\\' && i + 1 < s.length()) { i += 2; continue; }
            if (c == quote) {
                if (i + 1 < s.length() && s.charAt(i + 1) == quote) { i += 2; continue; }
                return i + 1;
            }
            i++;
        }
        return i;
    }

    /** 注释剥离：单引号字面量内的 -- / /* 原样保留，避免“删注释”反而吞掉真实 FROM。 */
    private static String stripSqlComments(String s) {
        if (s == null || s.isEmpty()) return s;
        StringBuilder out = new StringBuilder(s.length());
        int i = 0;
        int n = s.length();
        while (i < n) {
            char c = s.charAt(i);
            if (c == '\'') {
                int end = skipSqlQuoted(s, i);
                if (end >= n && s.charAt(Math.max(0, n - 1)) != '\'') {
                    throw new ControlPlaneGuardException("SQL 字符串未闭合，已拒绝");
                }
                out.append(s, i, end);
                i = end;
                continue;
            }
            if (c == '-' && i + 1 < n && s.charAt(i + 1) == '-') {
                i += 2;
                while (i < n && s.charAt(i) != '\n' && s.charAt(i) != '\r') i++;
                out.append(' ');
                if (i < n) { out.append(s.charAt(i)); i++; }
                continue;
            }
            if (c == '/' && i + 1 < n && s.charAt(i + 1) == '*') {
                i += 2;
                boolean closed = false;
                while (i + 1 < n) {
                    if (s.charAt(i) == '*' && s.charAt(i + 1) == '/') { i += 2; closed = true; break; }
                    i++;
                }
                if (!closed) {
                    /* 未闭合块注释会让解析器吞掉后续 FROM——无法证明目标安全即拒绝 */
                    throw new ControlPlaneGuardException("SQL 块注释未闭合，已拒绝");
                }
                out.append(' ');
                continue;
            }
            out.append(c);
            i++;
        }
        return out.toString();
    }

    private static int skipSqlWs(String s, int i) {
        while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
        return i;
    }

    private static String sqlWordAt(String s, int i) {
        int start = i;
        while (i < s.length() && isSqlWordChar(s.charAt(i))) i++;
        return s.substring(start, i);
    }

    private static boolean isSqlClauseTerminator(String word) {
        if (word == null || word.isEmpty()) return false;
        return "WHERE".equalsIgnoreCase(word) || "GROUP".equalsIgnoreCase(word)
                || "ORDER".equalsIgnoreCase(word) || "HAVING".equalsIgnoreCase(word)
                || "LIMIT".equalsIgnoreCase(word) || "OFFSET".equalsIgnoreCase(word)
                || "UNION".equalsIgnoreCase(word) || "EXCEPT".equalsIgnoreCase(word)
                || "INTERSECT".equalsIgnoreCase(word) || "WINDOW".equalsIgnoreCase(word)
                || "FETCH".equalsIgnoreCase(word) || "FOR".equalsIgnoreCase(word)
                || "ON".equalsIgnoreCase(word) || "USING".equalsIgnoreCase(word)
                || "JOIN".equalsIgnoreCase(word) || "INNER".equalsIgnoreCase(word)
                || "LEFT".equalsIgnoreCase(word) || "RIGHT".equalsIgnoreCase(word)
                || "FULL".equalsIgnoreCase(word) || "CROSS".equalsIgnoreCase(word)
                || "NATURAL".equalsIgnoreCase(word) || "SEMI".equalsIgnoreCase(word)
                || "ANTI".equalsIgnoreCase(word);
    }

    /**
     * 解析 FROM/JOIN 后的表清单并逐个过控制面守卫；返回继续扫描的位置。
     * 子查询返回 '(' 位置，让外层扫描进入内部继续找 FROM；逗号列表/别名完整覆盖。
     */
    private int guardSqlTableList(String s, int i, java.util.List<String> wildcardTables) {
        int n = s.length();
        while (true) {
            i = skipSqlWs(s, i);
            if (i >= n) return i;
            char c = s.charAt(i);
            if (c == ')' || c == ';' || c == '(') return i;
            String word = sqlWordAt(s, i);
            if (!word.isEmpty() && isSqlClauseTerminator(word)) return i;

            String table;
            if (c == '"' || c == '`') {
                int end = skipSqlQuoted(s, i);
                if (end >= n && s.charAt(Math.max(0, n - 1)) != c) {
                    throw new ControlPlaneGuardException("SQL 标识符引号未闭合，已拒绝");
                }
                table = s.substring(i + 1, Math.max(i + 1, end - 1));
                if (c == '"') table = table.replace("\"\"", "\"");
                i = end;
            } else {
                int start = i;
                while (i < n) {
                    char ch = s.charAt(i);
                    if (Character.isWhitespace(ch) || ch == ',' || ch == '(' || ch == ')') break;
                    i++;
                }
                table = s.substring(start, i);
            }
            if (!table.isEmpty()) {
                /* 表函数/系统命令不是索引名；ES SQL 的 FROM 只接受索引表达式，保守起见
                   一律过守卫（含 * ? 通配与跨集群冒号）。 */
                guardPublicIndexPattern(table);
                if (wildcardTables != null && (table.indexOf('*') >= 0 || table.indexOf('?') >= 0)) {
                    wildcardTables.add(table);
                }
            }
            i = skipSqlWs(s, i);
            /* 可选别名：AS x / 裸 x / "x"；随后只接受逗号继续列表，否则交给外层扫描 */
            if (i < n) {
                char ac = s.charAt(i);
                String next = sqlWordAt(s, i);
                if (ac == '"' || ac == '`' || ac == '\'') {
                    i = skipSqlQuoted(s, i);
                } else if ("AS".equalsIgnoreCase(next) && !next.isEmpty()) {
                    i = skipSqlWs(s, i + next.length());
                    i = skipSqlQuotedOrWord(s, i);
                } else if (!next.isEmpty() && !isSqlClauseTerminator(next)) {
                    i = skipSqlQuotedOrWord(s, i);
                }
                i = skipSqlWs(s, i);
                if (i < n && s.charAt(i) == ',') { i++; continue; }
            }
            return i;
        }
    }

    private static int skipSqlQuotedOrWord(String s, int i) {
        if (i >= s.length()) return i;
        char c = s.charAt(i);
        if (c == '"' || c == '`' || c == '\'') return skipSqlQuoted(s, i);
        if (isSqlWordChar(c)) {
            while (i < s.length() && isSqlWordChar(s.charAt(i))) i++;
        }
        return i;
    }

    /**
     * Painless 执行体守卫：filter/score 上下文可按 {@code context_setup.index} 读取文档，
     * 脚本本身也能遍历该索引全部文档——控制面索引不得借脚本沙盒绕过页面读门。
     */
    void guardPainlessBody(String body) {
        guardControlBody(body);
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            guardPainlessIndex(root.get("index"));
            Object setup = root.get("context_setup");
            if (setup instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> s = (Map<String, Object>) setup;
                guardPainlessIndex(s.get("index"));
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception ignore) {
            // 非 JSON 交给 ES 原始报错；字面控制面名已由 guardControlBody 拦截
        }
    }

    private void guardPainlessIndex(Object index) {
        if (index instanceof String) {
            if (!((String) index).trim().isEmpty()) guardPublicIndexPattern((String) index);
        } else if (index instanceof java.util.List) {
            for (Object one : (java.util.List<?>) index) {
                if (one instanceof String && !((String) one).trim().isEmpty()) {
                    guardPublicIndexPattern((String) one);
                }
            }
        }
    }

    /**
     * SQL 请求体是 JSON {"query":"..."} 时取解码后的 query；裸 SQL 原样扫描。
     * 以 '{'/'[' 开头却解析失败（含未转义换行）必须 fail-closed：若回退扫原文，
     * JSON 外层双引号会把整条 SQL 当成“引号标识符”跳过（行注释通配正是这样绕过的）。
     */
    private static String sqlQueryOf(String body) {
        if (body == null) return null;
        body = stripBom(body);
        String t = body.trim();
        if (!t.startsWith("{") && !t.startsWith("[")) return body;
        try {
            Map<?, ?> root = OBJECT_MAPPER.readValue(body, Map.class);
            Object q = root.get("query");
            if (q instanceof String) return (String) q;
            /* _sql/close 只带 cursor，没有表目标；其余缺 query 的 JSON 一律拒绝 */
            if (root.containsKey("cursor") && !root.containsKey("query")) return "";
            throw new ControlPlaneGuardException("SQL JSON 请求缺少 query 字符串，已拒绝");
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception e) {
            throw new ControlPlaneGuardException("SQL 请求体不是合法 JSON，已拒绝：" + e.getMessage());
        }
    }

    /** reindex body 守卫：source.index / dest.index 可为字符串或数组；通配 * 同样拒绝。 */
    void guardReindexBody(String body) {
        body = stripBom(body);
        /* 不做整串字面扫描：source.query 里检索 "esquerystudio" 字样是合法业务；
           源/目标索引由 guardReindexTarget 结构化校验，脚本已整体禁止。 */
        guardSearchBody(body);
        if (body == null || body.isEmpty()) return;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            /* 缺省 source.index 等同全量源（跨全部业务索引复制，带索引枚举语义），
               非 ADMIN 必须显式指定源索引。 */
            Object source = root.get("source");
            if (!(source instanceof Map) || ((Map<?, ?>) source).get("index") == null) {
                throw new ControlPlaneGuardException("reindex 必须显式指定 source.index（缺省即全量源，已拒绝）");
            }
            guardReindexTarget(source);
            guardReindexTarget(root.get("dest"));
            Object dest = root.get("dest");
            if (dest instanceof Map && ((Map<?, ?>) dest).get("pipeline") != null) {
                guardPipelineRef(String.valueOf(((Map<?, ?>) dest).get("pipeline")));
            }
            /* reindex 脚本可用 ctx._index='...' 改写目标索引（还能字符串拼接绕过字面扫描），
               非 ADMIN 一律不允许脚本。 */
            if (root.get("script") != null) {
                throw new ControlPlaneGuardException("非管理员 reindex 不允许脚本（可改写 _index 绕过控制面守卫）");
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception ignore) {
            // 非 JSON/结构异常交由 ES 原始报错，不在此改变语义；目标索引由 guardReindexTarget 结构化校验
        }
    }

    /**
     * _update / _update_by_query 脚本守卫：与 reindex 同权——Painless 可改写文档落到哪个索引
     * （旧版 ES 的 {@code ctx._index} 可写）。允许普通字段更新脚本，但任何触碰索引元数据的
     * 形态（点号 / 方括号 / 拼接 / 动态键 / 已存脚本 id）一律拒绝。
     */
    void guardUpdateScript(String body) {
        body = stripBom(body);
        if (body == null || body.trim().isEmpty()) return;
        final Object script;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            script = root.get("script");
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception ignore) {
            return; // 非 JSON 交由 ES 原始报错
        }
        if (script == null) return;
        guardScriptValue(script);
    }

    /** update 脚本值守卫（bulk update 的伴生文档行与 _update/_update_by_query 同权）。 */
    private void guardScriptValue(Object script) {
        if (script instanceof String) {
            guardUpdateScriptSource((String) script, null);
            return;
        }
        if (!(script instanceof Map)) {
            throw new ControlPlaneGuardException("update 脚本形态无法静态审计，已拒绝");
        }
        Map<?, ?> m = (Map<?, ?>) script;
        if (m.get("id") != null) {
            throw new ControlPlaneGuardException("非管理员 update 不允许按已存脚本执行");
        }
        Object lang = m.get("lang");
        if (lang != null && !"painless".equalsIgnoreCase(String.valueOf(lang).trim())) {
            throw new ControlPlaneGuardException("非管理员 update 只允许可静态审计的 painless 脚本");
        }
        Object source = m.containsKey("source") ? m.get("source") : m.get("inline");
        if (!(source instanceof String) || ((String) source).trim().isEmpty()) {
            throw new ControlPlaneGuardException("update 脚本缺少可审计的 source，已拒绝");
        }
        guardUpdateScriptSource((String) source, m.get("params"));
    }

    private void guardUpdateScriptSource(String source, Object params) {
        String decoded = decodeJsonUnicodeEscapes(source);
        String lower = decoded.toLowerCase(Locale.ROOT);
        /* 去掉引号/反斜杠/加号/空白后再取 token：ctx['_'+'index'] 会归一为 ctx[_index]，
           ctx._source.index 仍是 source/index 两个 token，不会误杀普通字段更新。 */
        String normalized = lower.replaceAll("[\"'`\\\\+\\s]", "");
        for (String token : normalized.split("[^a-z0-9_]+")) {
            if ("_index".equals(token)) {
                throw new ControlPlaneGuardException("非管理员 update 脚本不允许触碰 _index");
            }
        }
        /* ctx[...] 动态方括号访问可把 _index 藏在运行时变量/参数里；
           只放行 ctx['literal'] 形态，其余一律拒绝。 */
        java.util.regex.Matcher dynamicCtx = java.util.regex.Pattern
                .compile("ctx\\s*\\[\\s*[^\"'`\\s]").matcher(lower);
        if (dynamicCtx.find()) {
            throw new ControlPlaneGuardException("非管理员 update 脚本不允许动态 ctx[...] 访问");
        }
        /* ctx['_'+params.s] / concat 形态：方括号内出现拼接或运行时参数，
           渲染后可能等于 _index，不能静态证明安全。 */
        java.util.regex.Matcher computedCtx = java.util.regex.Pattern
                .compile("ctx\\s*\\[[^\\]]*(\\+|params|concat|tostring|join)").matcher(lower);
        if (computedCtx.find()) {
            throw new ControlPlaneGuardException("非管理员 update 脚本不允许拼接/参数化 ctx[...] 访问");
        }
        if (params instanceof Map) {
            StringBuilder joined = new StringBuilder();
            for (Object v : ((Map<?, ?>) params).values()) {
                if (v instanceof String) joined.append((String) v);
            }
            String paramsJoined = joined.toString().toLowerCase(Locale.ROOT)
                    .replaceAll("[\"'`\\\\+\\s]", "");
            for (String token : paramsJoined.split("[^a-z0-9_]+")) {
                if ("_index".equals(token)) {
                    throw new ControlPlaneGuardException("非管理员 update 脚本参数不允许携带 _index");
                }
            }
        }
    }

    /** @deprecated 使用 {@link #guardUpdateScript(String)}；保留方法名兼容既有调用方。 */
    @Deprecated
    void guardUpdateByQueryScript(String body) {
        guardUpdateScript(body);
    }

    /**
     * ingest pipeline 目标守卫：管道里的 {@code reroute}/{@code _index} 处理器可把文档改写到
     * 控制面索引；非管理员只能使用可证明不改写目标索引的管道。无法读取定义一律 fail-closed。
     */
    void guardPipelineRef(String pipelineId) {
        String id = stripBom(pipelineId);
        if (id == null || id.trim().isEmpty()) return;
        String clean = id.trim();
        if (clean.indexOf('/') >= 0 || clean.indexOf('\\') >= 0 || clean.indexOf('?') >= 0
                || clean.indexOf('#') >= 0 || clean.contains("..")) {
            throw new ControlPlaneGuardException("pipeline ID 含非法字符，已拒绝：" + clean);
        }
        final Map<?, ?> def;
        try {
            def = performJson("GET", "/_ingest/pipeline/" + encodePathToken(clean, "pipeline"), null);
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception e) {
            throw new ControlPlaneGuardException("无法确认 pipeline 是否会改写目标索引，已拒绝：" + clean);
        }
        String json;
        try {
            json = OBJECT_MAPPER.writeValueAsString(def).toLowerCase(Locale.ROOT);
        } catch (Exception e) {
            throw new ControlPlaneGuardException("无法解析 pipeline 定义，已拒绝：" + clean);
        }
        /* reroute/date_index_name 与 inner script 都能把文档改写到别的索引；
           定义里出现控制面索引名同样拒绝（enrich 等处理器可作为控制面读跳板）。 */
        if (json.contains("\"reroute\"") || json.contains("_index")
                || json.contains("\"date_index_name\"") || json.contains("\"script\"")
                /* 嵌套 pipeline 处理器会把定义委托给另一条管道，当前层静态扫描看不到目标改写。 */
                || json.contains("\"pipeline\"")) {
            throw new ControlPlaneGuardException("非管理员不允许使用可改写目标索引的 pipeline：" + clean);
        }
        guardControlBody(json);
    }

    /** 查询串里的 pipeline 参数同样要过管道目标守卫（重复参数取首值，守卫必须拒绝歧义）。 */
    private void guardRawPipeline(String query) {
        if (query == null || query.isEmpty()) return;
        boolean seen = false;
        for (String pair : query.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            final String key;
            final String value;
            try {
                key = java.net.URLDecoder.decode(eq < 0 ? pair : pair.substring(0, eq), "UTF-8");
                value = eq < 0 ? "" : java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
            } catch (Exception e) {
                throw new ControlPlaneGuardException("查询参数编码非法，已拒绝：" + pair);
            }
            if (!"pipeline".equals(key)) continue;
            if (seen) throw new ControlPlaneGuardException("非管理员 raw 不允许重复 pipeline 参数");
            seen = true;
            guardPipelineRef(value);
        }
    }

    @SuppressWarnings("unchecked")
    private void guardReindexTarget(Object node) {
        if (!(node instanceof Map)) return;
        Object index = ((Map<String, Object>) node).get("index");
        if (index instanceof String) {
            guardPublicIndexPattern((String) index);
        } else if (index instanceof java.util.List) {
            for (Object one : (java.util.List<Object>) index) {
                if (one instanceof String) guardPublicIndexPattern((String) one);
            }
        }
    }

    /**
     * 索引模板守卫：index_patterns 必须显式业务模式，禁止 * / _all / 控制面通配——
     * 否则 rank3 可通过 catch-all 模板把 settings/mapping/ILM 施加到用户库/审计等控制索引。
     */
    void guardIndexTemplateBody(String bodyJson) {
        bodyJson = stripBom(bodyJson);
        guardControlBody(bodyJson);
        if (bodyJson == null || bodyJson.trim().isEmpty()) return;
        final Object patterns;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(bodyJson, Map.class);
            patterns = root.get("index_patterns");
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            return; // 非 JSON 交由 ES 原始报错
        }
        if (patterns instanceof String) {
            guardPublicIndexPattern((String) patterns);
        } else if (patterns instanceof java.util.List) {
            java.util.List<?> list = (java.util.List<?>) patterns;
            if (list.isEmpty()) throw new IllegalArgumentException("index_patterns 不能为空");
            for (Object one : list) {
                if (!(one instanceof String) || ((String) one).trim().isEmpty()) {
                    throw new IllegalArgumentException("index_patterns 元素必须是非空字符串");
                }
                guardPublicIndexPattern((String) one);
            }
        } else if (patterns != null) {
            throw new IllegalArgumentException("index_patterns 必须是字符串或字符串数组");
        }
    }

    /**
     * 非 ADMIN 快照恢复守卫：必须显式给出业务 indices，禁止“恢复全部”/通配/控制索引——
     * 否则 rank3 可把包含控制面索引的快照恢复到线上，覆盖用户库/审计/连接档案。
     */
    void guardRestoreBody(String bodyJson) {
        bodyJson = stripBom(bodyJson);
        guardControlBody(bodyJson);
        if (bodyJson == null || bodyJson.trim().isEmpty()) {
            throw new ControlPlaneGuardException("恢复快照必须显式指定 indices（不允许恢复全部）");
        }
        final Object indices;
        final Object renameReplacement;
        final Object renamePattern;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(bodyJson, Map.class);
            if (truthy(root.get("include_global_state"))) {
                throw new ControlPlaneGuardException("非管理员恢复快照不得包含全局状态（集群配置/模板/ILM）");
            }
            Object featureStates = root.get("feature_states");
            if (featureStates instanceof java.util.Collection && !((java.util.Collection<?>) featureStates).isEmpty()) {
                throw new ControlPlaneGuardException("非管理员恢复快照不得包含 feature_states（安全/告警等系统数据）");
            }
            indices = root.get("indices");
            renameReplacement = root.get("rename_replacement");
            renamePattern = root.get("rename_pattern");
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("恢复快照 body 不是合法 JSON: " + e.getMessage());
        }
        if (indices instanceof String) {
            String s = ((String) indices).trim();
            if (s.isEmpty()) throw new IllegalArgumentException("恢复快照 indices 不能为空");
            guardPublicIndexPattern(s);
        } else if (indices instanceof java.util.List) {
            java.util.List<?> list = (java.util.List<?>) indices;
            if (list.isEmpty()) throw new IllegalArgumentException("恢复快照 indices 不能为空");
            for (Object one : list) {
                if (!(one instanceof String) || ((String) one).trim().isEmpty()) {
                    throw new IllegalArgumentException("恢复快照 indices 元素必须是非空字符串");
                }
                guardPublicIndexPattern((String) one);
            }
        } else {
            throw new ControlPlaneGuardException("恢复快照必须显式指定 indices（不允许恢复全部）");
        }
        /* 业务快照可以被重命名：不校验最终目标名，就能把快照写成 esquerystudio_users
           等控制索引（覆盖账号/连接档案，借恢复注入管理员文档）。 */
        guardRestoreRename(renameReplacement, renamePattern, indices);
    }

    /** 恢复快照的重命名目标守卫：静态名过字面判定；$1 展开按真实源索引逐个判定。 */
    private void guardRestoreRename(Object renameReplacement, Object renamePattern, Object indices) {
        if (renameReplacement == null) return;
        if (!(renameReplacement instanceof String)) {
            throw new IllegalArgumentException("恢复快照 rename_replacement 必须是字符串");
        }
        String s = ((String) renameReplacement).trim();
        if (s.isEmpty()) return;
        String lower = s.toLowerCase(Locale.ROOT);
        if (lower.startsWith(".") || lower.contains("..") || lower.contains("/") || lower.contains("\\")
                || lower.contains(":") || lower.contains("*") || lower.contains("?")
                || lower.contains("#") || lower.contains("%")
                || lower.contains(CONTROL_INDEX_PREFIX) || lower.contains("esquerystudio_adhoc_job")
                || lower.contains("_esquerystudio_lock") || lower.contains("_esquerystudio_migrate_job")) {
            throw new ControlPlaneGuardException("恢复快照的重命名目标不得指向系统/控制面索引：" + renameReplacement);
        }
        if (!s.contains("$")) return;
        /* 占位符展开后的真实名字才是 ES 落地的索引名：es_consol$1 + 源 e_user 会拼出
           esquerystudio_user。通配/排除源无法枚举时拒绝占位符重命名。 */
        java.util.List<String> sources = concreteIndexNames(indices);
        if (sources == null) {
            throw new ControlPlaneGuardException("通配/排除索引恢复不允许 $ 占位符重命名，请显式列出索引");
        }
        if (!(renamePattern instanceof String) || ((String) renamePattern).trim().isEmpty()) {
            throw new IllegalArgumentException("rename_replacement 使用占位符时必须提供 rename_pattern");
        }
        final java.util.regex.Pattern pattern;
        try {
            pattern = java.util.regex.Pattern.compile((String) renamePattern);
        } catch (Exception e) {
            throw new IllegalArgumentException("rename_pattern 不是合法正则: " + e.getMessage());
        }
        for (String src : sources) {
            final String expanded;
            try {
                expanded = pattern.matcher(src).replaceAll(s);
            } catch (Exception e) {
                throw new IllegalArgumentException("rename_replacement 展开失败: " + e.getMessage());
            }
            guardPublicIndexPattern(expanded);
        }
    }

    /** 恢复源索引为显式名单时返回之；含通配/排除/非字符串时返回 null（无法安全展开）。 */
    private static java.util.List<String> concreteIndexNames(Object indices) {
        java.util.List<String> out = new java.util.ArrayList<>();
        if (indices instanceof String) {
            for (String one : ((String) indices).split(",")) {
                String s = one.trim();
                if (s.isEmpty()) continue;
                if (s.startsWith("-") || s.contains("*") || s.contains("?")) return null;
                out.add(s);
            }
        } else if (indices instanceof java.util.List) {
            for (Object one : (java.util.List<?>) indices) {
                if (!(one instanceof String)) return null;
                String s = ((String) one).trim();
                if (s.isEmpty()) continue;
                if (s.startsWith("-") || s.contains("*") || s.contains("?")) return null;
                out.add(s);
            }
        } else {
            return null;
        }
        return out;
    }

    /** 当前请求应使用的 client：无路由/无目标 → 宿主；有目标 → 路由器长连接。 */
    private RestHighLevelClient restHighLevelClient() {
        io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter r = clientRouter;
        return r == null ? hostClient : r.current();
    }

    /**
     * 物理索引是否存在
     */
    public boolean indexExists(String index) throws IOException {
        guardIndexName(index);
        return restHighLevelClient().indices().exists(new GetIndexRequest(index), RequestOptions.DEFAULT);
    }

    /**
     * 显式创建物理索引（带 settings + mapping），不依赖 ES 自动建索引。
     *
     * <p> 版本感知：目标是 6.x 集群时 mappings 必须带 type 包一层，走低层 REST 分叉；
     * 7.x+/版本未知走既有 typeless 路径（行为与旧版完全一致）。</p>
     *
     * @param mappingJson 可为 null（无 @Mapping 的实体）
     */
    public void createIndex(String index, String settingsJson, String mappingJson) throws IOException {
        guardIndexName(index);
        doCreateIndex(index, settingsJson, mappingJson);
    }

    /** MCP 等需要向调用方回传真实 acknowledged 的入口；不把 ES 的 false 伪装成成功。 */
    public boolean createIndexChecked(String index, String settingsJson, String mappingJson) throws IOException {
        guardIndexName(index);
        return doCreateIndex(index, settingsJson, mappingJson);
    }

    /**
     * 校验器 dry-run 临时索引专用通道：只接受 {@code esquerystudio_validate_} 前缀。
     * 通用 createIndex 不再豁免该前缀（防任意写键创建不可见控制面索引）。
     */
    public void createValidatorTempIndex(String index, String settingsJson, String mappingJson) throws IOException {
        if (index == null || !index.startsWith(VALIDATE_INDEX_PREFIX)) {
            throw new IllegalArgumentException("校验器临时索引必须使用 " + VALIDATE_INDEX_PREFIX + " 前缀");
        }
        doCreateIndex(index, settingsJson, mappingJson);
    }

    /** 校验器临时索引存在性（通用 indexExists 会按控制面索引拒绝）。 */
    public boolean validatorTempIndexExists(String index) throws IOException {
        if (index == null || !index.startsWith(VALIDATE_INDEX_PREFIX)) {
            throw new IllegalArgumentException("校验器临时索引必须使用 " + VALIDATE_INDEX_PREFIX + " 前缀");
        }
        return restHighLevelClient().indices().exists(new GetIndexRequest(index), RequestOptions.DEFAULT);
    }

    /** 校验器临时索引清理专用通道（通用 deleteIndex 会按控制面索引拒绝）。 */
    public void deleteValidatorTempIndex(String index) throws IOException {
        if (index == null || !index.startsWith(VALIDATE_INDEX_PREFIX)) {
            throw new IllegalArgumentException("校验器临时索引必须使用 " + VALIDATE_INDEX_PREFIX + " 前缀");
        }
        doDeleteIndex(index);
    }

    private boolean doCreateIndex(String index, String settingsJson, String mappingJson) throws IOException {
        io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter r = clientRouter;
        String targetVersion = r == null ? null : r.currentEsVersion();
        if (io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps.requiresMappingType(targetVersion)) {
            return createIndexLegacy6(index, settingsJson, mappingJson, targetVersion);
        }
        CreateIndexRequest request = new CreateIndexRequest(index);
        if (settingsJson != null && !settingsJson.isEmpty()) {
            request.settings(settingsJson, XContentType.JSON);
        }
        if (mappingJson != null && !mappingJson.isEmpty()) {
            request.mapping(mappingJson, XContentType.JSON);
        }
        boolean acknowledged = restHighLevelClient().indices()
                .create(request, RequestOptions.DEFAULT).isAcknowledged();
        logger.info("[EsIndexAdmin] createIndex done: {}", index);
        return acknowledged;
    }

    /**
     * 6.x 目标建索引：低层 PUT /{index}，mappings 用 {@code _doc} type 包层
     * （typed CreateIndexRequest 的 typeless body 对 6.x 会报 mapping type 缺失）。
     */
    private boolean createIndexLegacy6(String index, String settingsJson, String mappingJson, String version) throws IOException {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        if (settingsJson != null && !settingsJson.isEmpty()) {
            body.put("settings", OBJECT_MAPPER.readValue(settingsJson, Map.class));
        }
        if (mappingJson != null && !mappingJson.isEmpty()) {
            Map<String, Object> mapping = OBJECT_MAPPER.readValue(mappingJson, Map.class);
            // 已是 typed 形态（如从 6.x 旧索引 getMapping 拷来：单 type 键且内层才是 mapping 体）则直接用，
            // typeless 才包 _doc。判定：单键 + 值是 Map + 内层含 properties（或键本身是 _doc）
            boolean alreadyTyped = false;
            if (mapping.size() == 1 && !mapping.containsKey("properties")) {
                Map.Entry<String, Object> only = mapping.entrySet().iterator().next();
                alreadyTyped = only.getValue() instanceof Map
                        && ("_doc".equals(only.getKey()) || ((Map<?, ?>) only.getValue()).containsKey("properties"));
            }
            body.put("mappings", alreadyTyped ? mapping
                    : java.util.Collections.singletonMap("_doc", mapping));
        }
        Map<String, Object> result = performJson("PUT", "/" + index, OBJECT_MAPPER.writeValueAsString(body));
        logger.info("[EsIndexAdmin] createIndex done (legacy6 target v{}): {}", version, index);
        return !Boolean.FALSE.equals(result.get("acknowledged"));
    }

    /**
     * mapping body 归一化——6.x 目标集群的 {@code _mapping} 响应多一层 type 包裹
     * （{@code mappings.{type}.properties}），剥掉后与 7.x 同构，避免控制台字段视图对 6.x 集群误报「无字段」。
     * <p>包级可见：-C1 单测锁双形态行为（见 EsResponseShapeTest）。</p>
     */
    @SuppressWarnings("unchecked")
    static Map<String, Object> unwrapTypeLayer(Map<String, Object> mappings) {
        if (mappings == null || mappings.containsKey("properties")) return mappings;
        if (mappings.size() == 1) {
            Object only = mappings.values().iterator().next();
            if (only instanceof Map && ((Map<?, ?>) only).containsKey("properties")) {
                return (Map<String, Object>) only;
            }
        }
        return mappings;
    }

    /**
     * -C1：hits.total 双形态归一——6.x 是数字，7.x+ 是 {@code {value,relation}} 对象，
     * 统一取出数值。未知形态（null/异构）原样透传，不在这里拦。
     * <p>注：searchDsl/pitSearch 等透传原始响应的路径不走本方法——前端已统一
     * {@code total?.value ?? total} 双形态消费，那是既定契约。</p>
     */
    static Object parseHitsTotal(Object total) {
        if (total instanceof Map) return ((Map<?, ?>) total).get("value");
        return total;
    }

    /**
     * 读取物理索引当前 mapping 的 JSON（{@code {"properties":...}} body，可直接用作 {@link #createIndex} 的 mappingJson）。
     * <p>用于实体无 {@code @Mapping} 时从旧索引复制 mapping，避免新物理索引退化为 ES 动态映射、与旧索引漂移。</p>
     *
     * @return mapping JSON；索引无 mapping 时返回 null
     */
    public String getMapping(String index) throws IOException {
        guardIndexPattern(index);
        // 低层 REST 直取：避开 MappingMetaData（7.7 改名 MappingMetadata）的类名变更，兼容宿主锁任意 7.x client
        Map<String, Object> resp = performJson("GET", "/" + index + "/_mapping", null);
        Object idxEntry = resp.get(index);
        if (!(idxEntry instanceof Map)) {
            // 传入别名时响应键为物理索引名，取第一个
            idxEntry = resp.values().stream().filter(v -> v instanceof Map).findFirst().orElse(null);
        }
        if (idxEntry == null) return null;
        Object mappings = ((Map<?, ?>) idxEntry).get("mappings");
        if (!(mappings instanceof Map) || ((Map<?, ?>) mappings).isEmpty()) return null;
        return OBJECT_MAPPER.writeValueAsString(unwrapTypeLayer((Map<String, Object>) mappings));
    }

    /**
     * 别名是否存在
     */
    public boolean aliasExists(String alias) throws IOException {
        guardIndexName(alias);
        return restHighLevelClient().indices().existsAlias(new GetAliasesRequest(alias), RequestOptions.DEFAULT);
    }

    /**
     * 返回别名当前指向的物理索引集合（别名不存在时返回空集）
     */
    public Set<String> getIndicesByAlias(String alias) throws IOException {
        guardIndexName(alias);
        if (!aliasExists(alias)) {
            return Collections.emptySet();
        }
        GetAliasesResponse response =
                restHighLevelClient().indices().getAlias(new GetAliasesRequest(alias), RequestOptions.DEFAULT);
        return response.getAliases() == null ? Collections.emptySet() : response.getAliases().keySet();
    }

    /**
     * 返回别名当前的 write 物理索引（is_write_index=true）。
     * 若无显式 write 标志但别名仅指向单个索引，则返回该唯一索引；否则返回 null。
     */
    public String getWriteIndex(String alias) throws IOException {
        guardIndexName(alias);
        if (!aliasExists(alias)) {
            return null;
        }
        // 低层 REST：GET /_alias/{alias}，避开 AliasMetaData（7.7 改名 AliasMetadata）的类名变更
        Map<String, Object> resp = performJson("GET", "/_alias/" + alias, null);
        if (resp.isEmpty()) {
            return null;
        }
        for (Map.Entry<String, Object> entry : resp.entrySet()) {
            Object aliasesObj = entry.getValue() instanceof Map ? ((Map<?, ?>) entry.getValue()).get("aliases") : null;
            if (!(aliasesObj instanceof Map)) continue;
            Object meta = ((Map<?, ?>) aliasesObj).get(alias);
            if (meta instanceof Map && Boolean.TRUE.equals(((Map<?, ?>) meta).get("is_write_index"))) {
                return entry.getKey();
            }
        }
        return resp.size() == 1 ? resp.keySet().iterator().next() : null;
    }

    /**
     * 首次创建别名并指向物理索引（is_write_index=true）
     */
    public void createWriteAlias(String alias, String physicalIndex) throws IOException {
        guardIndexName(alias);
        guardIndexName(physicalIndex);
        IndicesAliasesRequest request = new IndicesAliasesRequest();
        request.addAliasAction(IndicesAliasesRequest.AliasActions.add()
                .index(physicalIndex).alias(alias).writeIndex(true));
        restHighLevelClient().indices().updateAliases(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] createWriteAlias: {} -> {}", alias, physicalIndex);
    }

    /**
     * 原子切换写索引：新物理索引设为 write，旧物理索引（若有）取消 write 但保留可读。
     * 切换后增量自动写入新物理索引。
     */
    public void switchWriteIndex(String alias, String newPhysical, String oldPhysical) throws IOException {
        guardIndexName(alias);
        guardIndexName(newPhysical);
        guardIndexName(oldPhysical);
        IndicesAliasesRequest request = new IndicesAliasesRequest();
        request.addAliasAction(IndicesAliasesRequest.AliasActions.add()
                .index(newPhysical).alias(alias).writeIndex(true));
        if (oldPhysical != null && !oldPhysical.isEmpty()) {
            request.addAliasAction(IndicesAliasesRequest.AliasActions.add()
                    .index(oldPhysical).alias(alias).writeIndex(false));
        }
        restHighLevelClient().indices().updateAliases(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] switchWriteIndex alias={} newWrite={} oldReadOnly={}", alias, newPhysical, oldPhysical);
    }

    /**
     * 从别名原子移除某物理索引
     */
    public void removeAlias(String alias, String physicalIndex) throws IOException {
        guardIndexName(alias);
        guardIndexName(physicalIndex);
        IndicesAliasesRequest request = new IndicesAliasesRequest();
        request.addAliasAction(IndicesAliasesRequest.AliasActions.remove()
                .index(physicalIndex).alias(alias));
        restHighLevelClient().indices().updateAliases(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] removeAlias: {} x {}", alias, physicalIndex);
    }

    /**
     * 提交 reindex 异步任务。dest op_type=create + conflicts=proceed：
     * 切 write_index 后已写入目标的增量（同 _id）会因 create 冲突被跳过，不被旧存量覆盖。
     *
     * @return taskId，格式 {@code nodeId:taskNum}
     */
    public String submitReindex(String sourceIndex, String destIndex) throws IOException {
        guardIndexPattern(sourceIndex);
        guardIndexPattern(destIndex);
        ReindexRequest request = new ReindexRequest();
        request.setSourceIndices(sourceIndex);
        request.setDestIndex(destIndex);
        request.setDestOpType("create");
        request.setConflicts("proceed");
        TaskSubmissionResponse response = restHighLevelClient().submitReindexTask(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] submitReindex {} -> {} taskId={}", sourceIndex, destIndex, response.getTask());
        return response.getTask();
    }

    /**
     * 查询 reindex 任务进度。把 ES status 的 JSON 文本解析为结构化计数（{@link ReindexProgress}），
     * 前端直接读字段、不再自行解析；解析失败或 task 已消失时回退原文/兜底状态。
     */
    public ReindexProgress getReindexProgress(String taskId) throws IOException {
        int idx = taskId.lastIndexOf(':');
        if (idx <= 0) {
            return new ReindexProgress(false, "invalid taskId: " + taskId);
        }
        String nodeId = taskId.substring(0, idx);
        long taskNum = Long.parseLong(taskId.substring(idx + 1));
        Optional<GetTaskResponse> resp =
                restHighLevelClient().tasks().get(new GetTaskRequest(nodeId, taskNum), RequestOptions.DEFAULT);
        if (!resp.isPresent()) {
            // 任务已从 _tasks 列表消失，通常表示已完成
            return new ReindexProgress(true, "task not found (likely completed)");
        }
        GetTaskResponse taskResponse = resp.get();
        boolean completed = taskResponse.isCompleted();
        String detail = "running";
        if (taskResponse.getTaskInfo() != null && taskResponse.getTaskInfo().getStatus() != null) {
            detail = taskResponse.getTaskInfo().getStatus().toString();
        }
        Map<String, Object> statusMap = tryParseStatus(detail);
        if (statusMap == null) {
            // 拿不到 status JSON（如 task 刚起无 status），仍据 completed 给 RUNNING/COMPLETED，计数留空
            return ReindexProgress.of(completed, detail, null, null, null, null, null);
        }
        return ReindexProgress.of(completed, detail,
                asLong(statusMap.get("total")), asLong(statusMap.get("created")),
                asLong(statusMap.get("updated")), asLong(statusMap.get("deleted")),
                asLong(statusMap.get("version_conflicts")));
    }

    /**
     * 解析 reindex status 的 JSON 文本为 Map，非 JSON / 解析失败返回 null（调用方回退原文）。
     */
    private static Map<String, Object> tryParseStatus(String json) {
        if (json == null || json.isEmpty() || json.charAt(0) != '{') {
            return null;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = OBJECT_MAPPER.readValue(json, Map.class);
            return map;
        } catch (Exception e) {
            // 状态体解析失败回 null（调用方回退原文，契约不变）——debug 带 reason 摘要留痕
            logger.debug("[EsIndexAdmin] tryParseStatus 解析失败回退原文：{}: {}",
                    e.getClass().getSimpleName(), e.getMessage());
            return null;
        }
    }

    /**
     * status JSON 数值字段转 {@link Long}（Jackson 可能解析为 Integer/Long），非数值返回 null。
     */
    private static Long asLong(Object v) {
        return v instanceof Number ? ((Number) v).longValue() : null;
    }

    /**
     * 设置/解除物理索引写阻塞（{@code index.blocks.write}）。
     * <p>常规重建把别名 write 切到新索引后，对旧物理索引加写阻塞（true），使残余写请求在 old 被拒、
     * 由可重试写入模板重试到新 write 索引（物理只读契约）；删除旧索引或回滚前解除（false）。</p>
     * <p>注意：仅阻塞写，读不受影响，reindex 读取 old 存量正常。</p>
     */
    public void setIndexWriteBlock(String index, boolean writeBlocked) throws IOException {
        guardIndexName(index);
        UpdateSettingsRequest request = new UpdateSettingsRequest(index);
        request.settings(Settings.builder().put("index.blocks.write", writeBlocked).build());
        restHighLevelClient().indices().putSettings(request, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] setIndexWriteBlock index={} writeBlocked={}", index, writeBlocked);
    }

    /**
     * 删除物理索引（高危，仅在确认不被任何别名指向后调用）
     */
    public void deleteIndex(String index) throws IOException {
        guardIndexName(index);
        doDeleteIndex(index);
    }

    /** MCP 等需要向调用方回传真实 acknowledged 的入口。 */
    public boolean deleteIndexChecked(String index) throws IOException {
        guardIndexName(index);
        return doDeleteIndex(index);
    }

    private boolean doDeleteIndex(String index) throws IOException {
        boolean acknowledged = restHighLevelClient().indices()
                .delete(new DeleteIndexRequest(index), RequestOptions.DEFAULT).isAcknowledged();
        logger.info("[EsIndexAdmin] deleteIndex: {}", index);
        return acknowledged;
    }

    /**
     * 强制合并索引 segment，减少碎片。大量删除后调用以回收磁盘空间。
     */
    /** 单索引 force merge。ES 7.10 的 _forcemerge 不支持 wait_for_completion（会 400），
     *  该 API 本身同步执行；前端文案按同步语义展示。 */
    public Map<String, Object> forceMerge(String index, int maxNumSegments) throws IOException {
        guardIndexName(index);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                "POST", "/" + index + "/_forcemerge");
        req.setJsonEntity("{\"max_num_segments\":" + maxNumSegments + ",\"flush\":true}");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] forceMerge sync index={} maxSegments={} result={}", index, maxNumSegments, result);
        return result;
    }

    /**
     * 热更新索引 settings（仅限动态参数如 number_of_replicas）。
     */
    public void updateSettings(String index, String settingsJson) throws IOException {
        guardIndexName(index);
        UpdateSettingsRequest req = new UpdateSettingsRequest(index);
        req.settings(settingsJson, XContentType.JSON);
        restHighLevelClient().indices().putSettings(req, RequestOptions.DEFAULT);
        logger.info("[EsIndexAdmin] updateSettings index={}", index);
    }

    /**
     * 索引详情快照：mapping / settings / docCount / aliases / sample N 条文档。
     * Q1 面板"索引详情卡 + Multi-head 风格"用。
     */
    public Map<String, Object> inspect(String indexOrAlias, int sampleSize) throws IOException {
        return inspect(indexOrAlias, sampleSize, true);
    }

    /** 服务端已解析的系统索引（lock）专用读——调用方只能传服务端解析值，不得透传用户输入。 */
    Map<String, Object> inspectInternal(String indexOrAlias, int sampleSize) throws IOException {
        return inspect(indexOrAlias, sampleSize, false);
    }

    private Map<String, Object> inspect(String indexOrAlias, int sampleSize, boolean guard) throws IOException {
        return inspect(indexOrAlias, sampleSize, guard, false);
    }

    /** trustedControl=true 仅限系统页专用读（见 inspectSystemIndex），普通 inspect 恒 false。 */
    private Map<String, Object> inspect(String indexOrAlias, int sampleSize, boolean guard, boolean trustedControl) throws IOException {
        // 混用高级客户端调用（不经 performGuarded 路径闸），必须在入口按名/模式守卫
        if (guard) guardIndexPattern(indexOrAlias);
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("name", indexOrAlias);
        // mappings（低层 REST，避开 MappingMetaData 类名在 7.7 的变更）
        try {
            Map<String, Object> mresp = performJson("GET", "/" + indexOrAlias + "/_mapping", null, trustedControl);
            Map<String, Object> mapByIndex = new java.util.LinkedHashMap<>();
            mresp.forEach((idx, v) -> {
                if (v instanceof Map) {
                    Object mm = ((Map<?, ?>) v).get("mappings");
                    @SuppressWarnings("unchecked")
                    Map<String, Object> normalized = mm instanceof Map ? unwrapTypeLayer((Map<String, Object>) mm) : null;
                    mapByIndex.put(idx, normalized != null ? normalized : mm);
                }
            });
            result.put("mappings", mapByIndex);
        } catch (Exception e) {
            result.put("mappingsError", e.getMessage());
        }
        // settings
        try {
            org.elasticsearch.action.admin.indices.settings.get.GetSettingsRequest sr =
                    new org.elasticsearch.action.admin.indices.settings.get.GetSettingsRequest().indices(indexOrAlias);
            org.elasticsearch.action.admin.indices.settings.get.GetSettingsResponse sresp =
                    restHighLevelClient().indices().getSettings(sr, RequestOptions.DEFAULT);
            Map<String, Object> settingsMap = new java.util.LinkedHashMap<>();
            org.elasticsearch.common.collect.ImmutableOpenMap<String, Settings> all = sresp.getIndexToSettings();
            for (java.util.Iterator<String> it = all.keysIt(); it.hasNext(); ) {
                String idx = it.next();
                Settings s = all.get(idx);
                Map<String, String> mm = new java.util.LinkedHashMap<>();
                for (String k : s.keySet()) mm.put(k, s.get(k));
                settingsMap.put(idx, mm);
            }
            result.put("settings", settingsMap);
        } catch (Exception e) {
            result.put("settingsError", e.getMessage());
        }
        // count + aliases
        try {
            org.elasticsearch.action.search.SearchRequest cnt = new org.elasticsearch.action.search.SearchRequest(indexOrAlias);
            cnt.source().size(0).trackTotalHits(true);
            org.elasticsearch.action.search.SearchResponse cresp = restHighLevelClient().search(cnt, RequestOptions.DEFAULT);
            result.put("docCount", cresp.getHits().getTotalHits() == null ? -1 : cresp.getHits().getTotalHits().value);
        } catch (Exception e) {
            result.put("docCountError", e.getMessage());
        }
        try {
            // 低层 REST：GET /{index}/_alias，避开 AliasMetaData 类名在 7.7 的变更
            Map<String, Object> aresp = performJson("GET", "/" + indexOrAlias + "/_alias", null, trustedControl);
            Map<String, java.util.List<String>> aliases = new java.util.LinkedHashMap<>();
            aresp.forEach((idx, v) -> {
                java.util.List<String> names = new java.util.ArrayList<>();
                Object as = v instanceof Map ? ((Map<?, ?>) v).get("aliases") : null;
                if (as instanceof Map) ((Map<?, ?>) as).keySet().forEach(a -> names.add(String.valueOf(a)));
                aliases.put(idx, names);
            });
            result.put("aliases", aliases);
        } catch (Exception e) {
            result.put("aliasesError", e.getMessage());
        }
        // sample
        if (sampleSize > 0) {
            try {
                org.elasticsearch.action.search.SearchRequest sr = new org.elasticsearch.action.search.SearchRequest(indexOrAlias);
                sr.source().size(sampleSize).trackTotalHits(false);
                org.elasticsearch.action.search.SearchResponse sresp = restHighLevelClient().search(sr, RequestOptions.DEFAULT);
                java.util.List<Map<String, Object>> docs = new java.util.ArrayList<>();
                for (org.elasticsearch.search.SearchHit h : sresp.getHits().getHits()) {
                    Map<String, Object> d = new java.util.LinkedHashMap<>();
                    d.put("_id", h.getId());
                    d.put("_index", h.getIndex());
                    d.put("_source", h.getSourceAsMap());
                    docs.add(d);
                }
                result.put("sample", docs);
            } catch (Exception e) {
                result.put("sampleError", e.getMessage());
            }
        }
        return result;
    }

    /**
     * 自由 query DSL：用 raw JSON 查任意索引。仅用于运维调试。
     */
    public Map<String, Object> queryDsl(String indexOrAlias, String dslJson, int size) throws IOException {
        return queryDsl(indexOrAlias, dslJson, size, true);
    }

    /** 1063：带搜索请求级 URL 参数（routing/preference/search_type/...）的查询入口。 */
    public Map<String, Object> queryDsl(String indexOrAlias, String dslJson, int size,
                                        java.util.Map<String, String> requestParams) throws IOException {
        return queryDsl(indexOrAlias, dslJson, size, true, requestParams);
    }

    /** 服务端已解析的系统索引（lock）专用查询——索引名不得由用户输入控制。 */
    Map<String, Object> queryDslInternal(String indexOrAlias, String dslJson, int size) throws IOException {
        return queryDsl(indexOrAlias, dslJson, size, false);
    }

    /**
     * 系统页专用：锁索引是本 console 自家控制面索引，通用数据接口守卫会拒绝其名。
     * 仅由 {@code EsIndexRebuildService.inspectSystem/querySystem} 以装配处注入的 lockIndexName 调用；
     * 页面授权仍由 /system 的 apiPrefixes 页门兜住（HOST_ONLY 导航 + ADMIN/系统页授权）。
     */
    Map<String, Object> inspectSystemIndex(String exactIndexName, int sampleSize) throws IOException {
        return inspect(exactIndexName, sampleSize, false, true);
    }

    /** 系统页专用查询：见 {@link #inspectSystemIndex} 的安全边界说明。 */
    Map<String, Object> querySystemIndex(String exactIndexName, String dslJson, int size) throws IOException {
        return queryDsl(exactIndexName, dslJson, size, false, java.util.Collections.emptyMap(), true);
    }

    private Map<String, Object> queryDsl(String indexOrAlias, String dslJson, int size, boolean guard) throws IOException {
        return queryDsl(indexOrAlias, dslJson, size, guard, java.util.Collections.emptyMap());
    }

    /* 搜索请求级参数白名单顺序（URL 书写稳定）；键值为 ES 官方查询串参数，绝不写进 body。 */
    private static final String[] SEARCH_REQUEST_PARAM_ORDER = {
            "routing", "preference", "search_type", "allow_partial_search_results",
            "ignore_unavailable", "expand_wildcards",
    };

    /** 白名单 + 值校验后的请求参数（供 _search / profile 共用）。 */
    static java.util.Map<String, String> checkedSearchRequestParams(java.util.Map<String, String> raw) {
        java.util.Map<String, String> out = new java.util.LinkedHashMap<>();
        if (raw == null) return out;
        for (String key : SEARCH_REQUEST_PARAM_ORDER) {
            String v = raw.get(key);
            if (v != null && !v.trim().isEmpty()) out.put(key, validateSearchRequestParam(key, v.trim()));
        }
        return out;
    }

    /** 白名单 + 值校验后拼到 _search URL；URL 编码兜底特殊字符。 */
    static String searchPathWithParams(String path, java.util.Map<String, String> params) {
        if (params == null || params.isEmpty()) return path;
        StringBuilder qs = new StringBuilder();
        for (String key : SEARCH_REQUEST_PARAM_ORDER) {
            String raw = params.get(key);
            if (raw == null) continue;
            String value = raw.trim();
            if (value.isEmpty()) continue;
            value = validateSearchRequestParam(key, value);
            try {
                qs.append(qs.length() == 0 ? '?' : '&')
                        .append(key).append('=')
                        .append(java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8.name()));
            } catch (java.io.UnsupportedEncodingException e) {
                throw new IllegalStateException("URL 参数编码失败", e);
            }
        }
        return qs.length() == 0 ? path : path + qs;
    }

    /** 值校验（不含长度上限的 routing/preference 另判）；返回规范化键，未知键直接拒绝。 */
    static String validateSearchRequestParamKey(String key) {
        for (String known : SEARCH_REQUEST_PARAM_ORDER) if (known.equals(key)) return key;
        throw new IllegalArgumentException("不支持的搜索请求参数：" + key);
    }

    static String validateSearchRequestParam(String key, String value) {
        validateSearchRequestParamKey(key);
        if ("routing".equals(key) || "preference".equals(key)) {
            if (value.length() > 512) throw new IllegalArgumentException(key + " 过长（上限 512 字符）");
            for (int i = 0; i < value.length(); i++) {
                char c = value.charAt(i);
                if (c < 0x20 || c == 0x7f) throw new IllegalArgumentException(key + " 含控制字符");
            }
            return value;
        }
        if ("search_type".equals(key)) {
            if (!"query_then_fetch".equals(value) && !"dfs_query_then_fetch".equals(value)) {
                throw new IllegalArgumentException("search_type 只支持 query_then_fetch / dfs_query_then_fetch");
            }
            return value;
        }
        if ("allow_partial_search_results".equals(key) || "ignore_unavailable".equals(key)) {
            if (!"true".equals(value) && !"false".equals(value)) {
                throw new IllegalArgumentException(key + " 只支持 true/false");
            }
            return value;
        }
        if ("expand_wildcards".equals(key)) {
            String[] parts = value.split(",", -1);
            boolean none = false;
            for (String part : parts) {
                String p = part.trim();
                if (!("open".equals(p) || "closed".equals(p) || "hidden".equals(p)
                        || "none".equals(p) || "all".equals(p))) {
                    throw new IllegalArgumentException("expand_wildcards 非法取值：" + p);
                }
                if ("none".equals(p)) none = true;
            }
            if (none && parts.length > 1) throw new IllegalArgumentException("expand_wildcards=none 不能与其他取值组合");
            return value;
        }
        throw new IllegalArgumentException("不支持的搜索请求参数：" + key);
    }

    private Map<String, Object> queryDsl(String indexOrAlias, String dslJson, int size, boolean guard,
                                         java.util.Map<String, String> requestParams) throws IOException {
        return queryDsl(indexOrAlias, dslJson, size, guard, requestParams, false);
    }

    /** trustedControl=true 仅限系统页专用读（见 querySystemIndex），普通 queryDsl 恒 false。 */
    private Map<String, Object> queryDsl(String indexOrAlias, String dslJson, int size, boolean guard,
                                         java.util.Map<String, String> requestParams, boolean trustedControl) throws IOException {
        if (guard) guardIndexPattern(indexOrAlias);
        guardSearchBody(dslJson);
        java.util.Map<String, String> checked = checkedSearchRequestParams(requestParams);
        String body = dslJson;
        if (body == null || body.trim().isEmpty()) {
            body = "{\"query\":{\"match_all\":{}},\"size\":" + size + "}";
        } else if (!body.contains("\"size\"")) {
            body = body.trim();
            body = body.substring(0, body.length() - 1) + ",\"size\":" + size + "}";
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                "POST", searchPathWithParams("/" + indexOrAlias + "/_search", checked));
        req.setJsonEntity(body);
        org.elasticsearch.client.Response resp = trustedControl ? performUnguarded(req) : performGuarded(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = OBJECT_MAPPER.readValue(respBody, Map.class);
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        @SuppressWarnings("unchecked")
        Map<String, Object> hitsWrap = (Map<String, Object>) raw.get("hits");
        if (hitsWrap != null) {
            Object totalRaw = hitsWrap.get("total");
            result.put("total", parseHitsTotal(totalRaw));
            /* 300+ 批：relation 透传——gte=下界（track_total_hits 默认 10000 截断）。
               此前 parseHitsTotal 归一后 relation 丢失，前端 totalGte 恒 false，
               「10,000」永远不带「+（命中数为下界）」标注，与索引工作区精确计数形态割裂 */
            if (totalRaw instanceof Map && "gte".equals(((Map<?, ?>) totalRaw).get("relation"))) {
                result.put("totalGte", Boolean.TRUE);
            }
            @SuppressWarnings("unchecked")
            java.util.List<Map<String, Object>> hitsList = (java.util.List<Map<String, Object>>) hitsWrap.get("hits");
            java.util.List<Map<String, Object>> hits = new java.util.ArrayList<>();
            if (hitsList != null) {
                for (Map<String, Object> h : hitsList) {
                    Map<String, Object> d = new java.util.LinkedHashMap<>();
                    d.put("_id", h.get("_id"));
                    d.put("_index", h.get("_index"));
                    d.put("_score", h.get("_score"));
                    d.put("_source", h.get("_source"));
                    hits.add(d);
                }
            }
            result.put("hits", hits);
        } else {
            result.put("total", 0);
            result.put("hits", java.util.Collections.emptyList());
        }
        Object aggregations = raw.get("aggregations");
        if (aggregations != null) {
            result.put("aggregations", aggregations);
        }
        result.put("took", raw.get("took"));
        return result;
    }

    /**
     * 列出集群全部索引（排除 . 开头的系统索引）。
     * segments.count / docs.deleted 供段碎片体检用（force_merge 判据）；
     * 注意 _cat 返回值均为字符串，且关闭的索引这两列可能缺失或为空，消费端需容错。
     */
    public java.util.List<Map<String, Object>> listClusterIndices() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_cat/indices?format=json&h=index,health,status,docs.count,store.size,pri,rep,creation.date.string,segments.count,docs.deleted");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        java.util.List<Map<String, Object>> list = OBJECT_MAPPER.readValue(body,
                OBJECT_MAPPER.getTypeFactory().constructCollectionType(java.util.List.class, Map.class));
        java.util.List<Map<String, Object>> filtered = new java.util.ArrayList<>();
        for (Map<String, Object> item : list) {
            String name = String.valueOf(item.get("index"));
            if (!name.startsWith(".")) filtered.add(item);
        }
        filtered.sort((a, b) -> String.valueOf(a.get("index")).compareTo(String.valueOf(b.get("index"))));
        return filtered;
    }

    /**
     * 执行 ES SQL（_sql API，ES 6.3+ 支持）。返回 columns + rows 原始结构。
     * 遇到数组字段报错时自动检测并排除数组字段后重试。
     */
    public Map<String, Object> executeSql(String sql, int fetchSize) throws IOException {
        try {
            return doExecuteSql(sql);
        } catch (org.elasticsearch.client.ResponseException e) {
            String body = org.apache.http.util.EntityUtils.toString(e.getResponse().getEntity());
            if (body != null && body.contains("are not supported")) {
                String rewritten = rewriteSqlExcludingArrays(sql, body);
                if (rewritten != null) {
                    Map<String, Object> result = doExecuteSql(rewritten);
                    result.put("_rewrittenSql", rewritten);
                    result.put("_arrayFieldsExcluded", detectArrayFieldsFromIndex(sql));
                    return result;
                }
            }
            throw e;
        }
    }

    private Map<String, Object> doExecuteSql(String sql) throws IOException {
        String body = OBJECT_MAPPER.writeValueAsString(java.util.Collections.singletonMap("query", sql));
        /* 经版本感知 SQL 路径（6.x 是 /_xpack/sql） */
        return performSqlVersionAware("?format=json", body);
    }

    private String rewriteSqlExcludingArrays(String originalSql, String errorBody) {
        java.util.regex.Matcher fm = java.util.regex.Pattern
                .compile("(?i)\\bFROM\\s+\"?([\\w\\-.*]+)\"?").matcher(originalSql);
        if (!fm.find()) return null;
        String index = fm.group(1);
        java.util.Set<String> arrayFields = detectArrayFieldsFromIndex(index);
        if (arrayFields.isEmpty()) return null;

        java.util.List<String> safeCols = new java.util.ArrayList<>();
        try {
            // 低层 REST 直取 mapping，避开 MappingMetaData 类名在 7.7 的变更
            Map<String, Object> resp = performJson("GET", "/" + index + "/_mapping", null);
            for (Object idxEntry : resp.values()) {
                if (!(idxEntry instanceof Map)) continue;
                Object mappings = ((Map<?, ?>) idxEntry).get("mappings");
                if (!(mappings instanceof Map)) continue;
                @SuppressWarnings("unchecked")
                Map<String, Object> props = (Map<String, Object>) unwrapTypeLayer((Map<String, Object>) mappings).get("properties");
                if (props != null) {
                    for (String field : props.keySet()) {
                        if (!arrayFields.contains(field)) safeCols.add(field);
                    }
                }
            }
        } catch (Exception e) {
            /* 静默吞补 debug 留痕（异常类名+message）——「重写放弃」与「没触发重写」
               在日志上可区分；返回 null 契约不变（重写放弃，原始错误照常透传）。 */
            logger.debug("[EsIndexAdmin] rewriteSqlExcludingArrays mapping 探测失败（放弃重写）：{}: {}",
                    e.getClass().getSimpleName(), e.getMessage());
            return null;
        }
        if (safeCols.isEmpty()) return null;

        String limit = "20";
        java.util.regex.Matcher lm = java.util.regex.Pattern.compile("(?i)\\bLIMIT\\s+(\\d+)").matcher(originalSql);
        if (lm.find()) limit = lm.group(1);

        StringBuilder sb = new StringBuilder("SELECT ");
        for (int i = 0; i < safeCols.size(); i++) {
            if (i > 0) sb.append(", ");
            sb.append("\"").append(safeCols.get(i)).append("\"");
        }
        sb.append(" FROM \"").append(index).append("\" LIMIT ").append(limit);
        return sb.toString();
    }

    private java.util.Set<String> detectArrayFieldsFromIndex(String index) {
        java.util.Set<String> arrayFields = new java.util.LinkedHashSet<>();

        // 首选：scripted_metric 聚合全量扫描（精确但需要 script 权限）
        try {
            String aggBody = "{"
                + "\"size\":0,"
                + "\"aggs\":{"
                + "\"_array_detect\":{"
                + "\"scripted_metric\":{"
                + "\"init_script\":\"state.arrays = new HashSet()\","
                + "\"map_script\":\"for (entry in params._source.entrySet()) { if (entry.getValue() instanceof List) { state.arrays.add(entry.getKey()) } }\","
                + "\"combine_script\":\"return state.arrays\","
                + "\"reduce_script\":\"def result = new HashSet(); for (s in states) { result.addAll(s) } return result\""
                + "}}}}";
            org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/" + index + "/_search");
            req.setJsonEntity(aggBody);
            org.elasticsearch.client.Response resp = performGuarded(req);
            String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> aggs = (Map<String, Object>) result.get("aggregations");
            if (aggs != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> detect = (Map<String, Object>) aggs.get("_array_detect");
                if (detect != null && detect.get("value") instanceof java.util.List) {
                    @SuppressWarnings("unchecked")
                    java.util.List<String> fields = (java.util.List<String>) detect.get("value");
                    arrayFields.addAll(fields);
                    logger.info("[EsIndexAdmin] detectArrayFields via scripted_metric for : found {} array fields", index, arrayFields.size());
                    return arrayFields;
                }
            }
        } catch (Exception e) {
            logger.warn("[EsIndexAdmin] scripted_metric detection failed for {}, fallback to sampling: {}", index, e.getMessage(), e);
        }

        // Fallback：样本检测（抽 30 条）
        try {
            org.elasticsearch.action.search.SearchRequest sr = new org.elasticsearch.action.search.SearchRequest(index);
            sr.source().size(30).trackTotalHits(false);
            org.elasticsearch.action.search.SearchResponse resp = restHighLevelClient().search(sr, RequestOptions.DEFAULT);
            for (org.elasticsearch.search.SearchHit hit : resp.getHits().getHits()) {
                Map<String, Object> src = hit.getSourceAsMap();
                if (src == null) continue;
                for (Map.Entry<String, Object> entry : src.entrySet()) {
                    if (entry.getValue() instanceof java.util.List) {
                        arrayFields.add(entry.getKey());
                    }
                }
            }
            logger.info("[EsIndexAdmin] detectArrayFields via sampling for {}: found {} array fields", index, arrayFields.size());
        } catch (Exception e) {
            logger.warn("[EsIndexAdmin] sampling detection also failed for {}: {}", index, e.getMessage(), e);
        }
        return arrayFields;
    }

    /** 集群健康概览。 */
    public Map<String, Object> clusterHealth() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_cluster/health");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        /* 顺带版本号（伴随 GET /，best-effort）——控制台版本识别回落原先走
           raw 透传（ADMIN 域），每次开屏被记成 HIGH_RISK「raw=GET /」刷屏（实报
           「我只是打开页面却出现高危操作」）。共享端点带版本后前端弃 raw 回落。 */
        try {
            org.elasticsearch.client.Request root = new org.elasticsearch.client.Request("GET", "/");
            org.elasticsearch.client.Response rootResp = performGuarded(root);
            mergeVersion(result, org.apache.http.util.EntityUtils.toString(rootResp.getEntity()));
        } catch (Exception e) {
            logger.debug("[EsIndexAdmin] health 版本伴随探测失败（健康概览照常返回）: {}", e.getMessage());
        }
        return result;
    }

    /** 版本合并（包内可见=可测）：root JSON 的 version.number 并入健康概览；无版本静默不动。 */
    static void mergeVersion(Map<String, Object> health, String rootJson) throws IOException {
        if (rootJson == null || rootJson.isEmpty()) return;
        @SuppressWarnings("unchecked")
        Map<String, Object> root = OBJECT_MAPPER.readValue(rootJson, Map.class);
        Object version = root.get("version");
        if (version instanceof Map) {
            Object number = ((Map<String, Object>) version).get("number");
            if (number != null) health.put("version", String.valueOf(number));
        }
    }

    /** 按 _id 删除单条文档。 */
    public Map<String, Object> deleteById(String index, String id) throws IOException {
        guardIndexName(index);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("DELETE",
                "/" + index + "/_doc/" + encodePathToken(id, "文档 ID"));
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        return result;
    }

    /**
     * 全量覆盖写入单个文档（_source 整体替换，运维修正脏数据用）。
     * <p>注意：这是<b>整体覆盖</b>语义（PUT _doc），非字段级合并；调用方须传完整 _source。
     * refresh=true 保证写入后立即可搜，便于控制台编辑后刷新验证。</p>
     *
     * @return ES 响应（result: created/updated）
     */
    public Map<String, Object> updateDocument(String index, String id, String docJson) throws IOException {
        guardIndexName(index);
        String encodedId = encodePathToken(id, "文档 ID");
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT",
                "/" + index + "/_doc/" + encodedId + "?refresh=true");
        req.setJsonEntity(docJson);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        logger.info("[EsIndexAdmin] updateDocument index={} id={} result={}", index, id, result.get("result"));
        return result;
    }

    /** 按 query 批量删除文档 (_delete_by_query)。 */
    public Map<String, Object> deleteByQuery(String index, String queryDsl) throws IOException {
        guardIndexName(index);
        guardSearchBody(queryDsl);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/" + index + "/_delete_by_query");
        req.setJsonEntity(queryDsl);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        return result;
    }

    /** 热更新索引 settings（不关闭索引）。 */
    public Map<String, Object> updateSettingsDynamic(String index, Map<String, Object> settings) throws IOException {
        guardIndexName(index);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT", "/" + index + "/_settings");
        req.setJsonEntity(OBJECT_MAPPER.writeValueAsString(settings));
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        return result;
    }

    /**
     * 向已有索引添加/更新字段 mapping（ES PUT _mapping API）。
     * <p>ES 仅允许<b>新增</b>字段或为已有 text 字段追加 multi-field；<b>不支持</b>删除字段或修改已有字段类型（需 reindex）。
     * 调用方应确保传入的 properties 不含对已有字段的破坏性修改。</p>
     *
     * @param index       物理索引名（或别名，ES 自动路由到 write index）
     * @param mappingJson mapping JSON body，如 {@code {"properties":{"new_field":{"type":"keyword"}}}}
     * @return ES 响应（含 acknowledged 字段）
     */
    public Map<String, Object> putMapping(String index, String mappingJson) throws IOException {
        /* mapping 写入是精确索引操作：不允许通配/逗号列表批量改（可能命中控制面后缀索引） */
        guardIndexName(index);
        Map<String, Object> result = putMappingVersionAware(index, mappingJson);
        logger.info("[EsIndexAdmin] putMapping index={} body={}", index, mappingJson);
        return result;
    }

    /**
     *  版本感知 PUT _mapping：6.x 目标 typeless 会报 400 mapping type is missing，
     * 必须走 {@code PUT /{index}/_mapping/{type}}（type 从现有 mapping 反查，老索引可能是自定义 type，
     * 拿不到回退 {@code _doc}，与 {@link #createIndexLegacy6} 同构）。
     * 版本未探到但目标实为 6.x 时，typeless 首发 400 再用 typed 路径重试一次兜底。
     */
    private Map<String, Object> putMappingVersionAware(String index, String mappingJson) throws IOException {
        io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter r = clientRouter;
        String version = r == null ? null : r.currentEsVersion();
        if (io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps.requiresMappingType(version)) {
            return performJson("PUT", "/" + index + "/_mapping/" + legacyMappingType(index), mappingJson);
        }
        try {
            return performJson("PUT", "/" + index + "/_mapping", mappingJson);
        } catch (org.elasticsearch.client.ResponseException e) {
            boolean typeMissing = e.getResponse().getStatusLine().getStatusCode() == 400
                    && String.valueOf(e.getMessage()).contains("mapping type is missing");
            if (!typeMissing) throw e;
            logger.info("[EsIndexAdmin] putMapping typeless 400（目标疑似 6.x），typed 路径重试: {}", index);
            return performJson("PUT", "/" + index + "/_mapping/" + legacyMappingType(index), mappingJson);
        }
    }

    /**
     * 6.x typed 路径的 type 名：从现有 mapping 反查首个非 {@code _default_} type；无 mapping（新索引）回退 {@code _doc}。
     */
    private String legacyMappingType(String index) {
        try {
            Map<String, Object> resp = performJson("GET", "/" + index + "/_mapping", null);
            for (Object idxEntry : resp.values()) {
                if (!(idxEntry instanceof Map)) continue;
                Object mappings = ((Map<?, ?>) idxEntry).get("mappings");
                if (!(mappings instanceof Map)) continue;
                for (Object k : ((Map<?, ?>) mappings).keySet()) {
                    String key = String.valueOf(k);
                    if (!"_default_".equals(key) && !"properties".equals(key)) return key;
                }
            }
        } catch (Exception e) {
            // 裁决（三态之②冷路径 WARN）：反查失败回退 _doc 的降级有真实代价——
            // 6.x 索引若实为自定义 type，后续 PUT _mapping/_doc 会以「more than 1 type」类
            // 错误失败，运营者看到的将是误导性下游根因；此处 WARN 把反查失败的真因留在日志
            // 因果链里。冷路径（用户触发的 putMapping / 文档级操作才走到），直接 WARN 无需
            // 节流；返回 _doc 契约不变（Observability552Test 反锁）。
            logger.warn("[EsIndexAdmin] 反查 6.x legacy mapping type 失败，回退 _doc: index={}",
                    index, e);
        }
        return "_doc";
    }

    /**
     *  版本感知文档级子路由：{@code _update}/{@code _explain}/{@code _termvectors} 的 typeless 形态
     * （{@code /{index}/_update/{id}}）是 7.0 才有的路由，6.x 会把 {@code _update} 段误解析成 type 名报
     * 400 invalid_type_name，必须走 {@code /{index}/{type}/{id}/_update}（type 同 {@link #legacyMappingType} 反查）。
     * 版本未探到时 typeless 首发 400 再 typed 路径重试一次兜底，与 {@link #putMappingVersionAware} 同构。
     *
     * @param op 子操作名（带下划线，如 {@code _update}）
     * @param qs 查询串（含前导 {@code ?}，无则传空串）
     */
    private Map<String, Object> performDocOpVersionAware(String method, String index, String encodedId,
                                                          String op, String qs, String body) throws IOException {
        String typeless = "/" + index + "/" + op + "/" + encodedId + qs;
        io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter r = clientRouter;
        String version = r == null ? null : r.currentEsVersion();
        if (io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps.requiresMappingType(version)) {
            return performJson(method, legacyDocOpPath(index, encodedId, op, qs), body);
        }
        try {
            return performJson(method, typeless, body);
        } catch (org.elasticsearch.client.ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() != 400) {
                throw e;
            }
            logger.info("[EsIndexAdmin] {} typeless 400（目标疑似 6.x），typed 路径重试: {}", op, index);
            return performJson(method, legacyDocOpPath(index, encodedId, op, qs), body);
        }
    }

    /** 6.x 文档级 typed 路径：{@code /{index}/{type}/{id}/{op}}。 */
    private String legacyDocOpPath(String index, String encodedId, String op, String qs) {
        return "/" + index + "/" + legacyMappingType(index) + "/" + encodedId + "/" + op + qs;
    }

    /**
     * 把 {@code "profile":true} 注入 DSL body，返回新的 body JSON。
     *
     * <p><b>为什么必须进 body、不能进 URL</b>：ES 的 {@code _search} 不接受 {@code profile}
     * 作为 URL 查询参数，传了会直接报
     * {@code illegal_argument_exception: request [...] contains unrecognized parameter: [profile]}。
     * 已对 ES 7.10.1 实测：{@code _search?profile=true} 报上述错，
     * 而 body 里带 {@code "profile":true} 正常返回 {@code profile.shards}。
     * 注意 {@code explain} 恰好相反 —— 它<b>是</b>合法的 URL 参数（实测可用），故不走这里。
     *
     * <p><b>为什么用 Jackson 解析回写、不用字符串拼接</b>：原先的
     * {@code substring(0, lastIndexOf('}')) + ",\"profile\":true}"} 在 body 为 {@code {}} 时
     * 会产出 {@code {,"profile":true}} 这种非法 JSON。
     * 非法 JSON 按本类 {@code count()} 的既有约定抛 {@link IllegalArgumentException}，
     * 而不是丢给 ES —— 否则用户拿到的是一次没有 profile 数据的普通搜索，且不知道为什么。
     *
     * <p>包可见 + static 是为了让 {@code ProfileFlagTest} 在无 ES 客户端的情况下直接测它。
     */
    static String withProfileFlag(String dslJson) {
        String body = dslJson == null || dslJson.trim().isEmpty() ? "{}" : dslJson.trim();
        Map<String, Object> dsl;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = OBJECT_MAPPER.readValue(body, Map.class);
            dsl = parsed;
        } catch (Exception e) {
            throw new IllegalArgumentException("DSL 不是合法 JSON: " + e.getMessage());
        }
        dsl.put("profile", true);
        try {
            return OBJECT_MAPPER.writeValueAsString(dsl);
        } catch (Exception e) {
            throw new IllegalArgumentException("DSL 序列化失败: " + e.getMessage());
        }
    }

    /**
     * Profile 查询（Query Profiler）：注入 {@code "profile":true} 后执行 _search，
     * 返回完整原始响应 JSON 文本（含 profile breakdown 段），由前端渲染火焰树。
     */
    public String profile(String indexOrAlias, String dslJson) throws IOException {
        return profile(indexOrAlias, dslJson, java.util.Collections.emptyMap());
    }

    /** 1063：Profile 搜索同样支持请求级 URL 参数（routing/preference/...）。 */
    public String profile(String indexOrAlias, String dslJson, java.util.Map<String, String> requestParams) throws IOException {
        guardIndexPattern(indexOrAlias);
        guardSearchBody(dslJson);
        String body = withProfileFlag(dslJson);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                "POST", searchPathWithParams("/" + indexOrAlias + "/_search", checkedSearchRequestParams(requestParams)));
        req.setJsonEntity(body);
        org.elasticsearch.client.Response resp = performGuarded(req);
        return org.apache.http.util.EntityUtils.toString(resp.getEntity());
    }

    /**
     * _count 预估（dry-run）：提取 dsl 中的 query 子树执行 _count；无 query 则 match_all。
     * 用于 delete-by-query 等高危操作前的「将影响 N 条」预估。
     */
    public Map<String, Object> count(String indexOrAlias, String dslJson) throws IOException {
        guardIndexPattern(indexOrAlias);
        guardSearchBody(dslJson);
        Object query = null;
        if (dslJson != null && !dslJson.trim().isEmpty()) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> dsl = OBJECT_MAPPER.readValue(dslJson.trim(), Map.class);
                query = dsl.get("query");
            } catch (Exception e) {
                throw new IllegalArgumentException("DSL 不是合法 JSON: " + e.getMessage());
            }
        }
        String body = query == null ? "{\"query\":{\"match_all\":{}}}"
                : "{\"query\":" + OBJECT_MAPPER.writeValueAsString(query) + "}";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/" + indexOrAlias + "/_count");
        req.setJsonEntity(body);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        return result;
    }

    /**
     * REST Playground：透传任意 ES REST 调用。path 必须以 "/" 开头且不含 ".."；
     * method 白名单 GET/POST/PUT/DELETE/HEAD。返回 {status, body(原始文本)}。
     */
    /**
     * 非 ADMIN 的 raw 透传：仍可访问业务索引，但不得触达控制面索引（路径/通配/请求体）。
     * ADMIN raw 继续走 {@link #raw} 作为应急逃生通道。
     */
    public Map<String, Object> rawGuarded(String method, String path, String body) throws IOException {
        guardRawGuarded(method, path, body);
        Map<String, Object> result = raw(method, path, body);
        /* 与守卫链同一大小写口径：守卫按小写判定（/_CAT/INDICES 也命中），行过滤若用原始
           大小写就会在目标端/代理大小写不敏感时静默漏掉控制面行（以为过滤了其实没过滤）。 */
        return filterCatControlRows(
                rawPathOnly(canonicalRawPath(path)).toLowerCase(Locale.ROOT), result);
    }

    /** _cat 索引目录只允许 JSON 行式返回，便于逐行剔除控制面索引（文本表格无法可靠解析）。 */
    private static boolean isCatControlMetadataPath(String p) {
        return "/_cat/indices".equals(p) || p.startsWith("/_cat/indices/")
                || "/_cat/aliases".equals(p) || p.startsWith("/_cat/aliases/")
                || "/_cat/shards".equals(p) || p.startsWith("/_cat/shards/");
    }

    private static boolean queryHasFormatJson(String query) {
        if (query == null) return false;
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            try {
                String key = java.net.URLDecoder.decode(pair.substring(0, eq), "UTF-8");
                String value = java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
                if ("format".equals(key) && "json".equalsIgnoreCase(value)) return true;
            } catch (Exception ignore) {
                // 非法编码由其他守卫拒绝
            }
        }
        return false;
    }

    /** _cat 结果必须保留 index 列（h=i 之类别名会让行过滤失效）。 */
    private static boolean queryProjectsIndex(String query) {
        if (query == null || query.trim().isEmpty()) return true; // 默认列含 index
        boolean sawH = false;
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            try {
                String key = java.net.URLDecoder.decode(pair.substring(0, eq), "UTF-8");
                if (!"h".equals(key) && !"headers".equals(key)) continue;
                sawH = true;
                String value = java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
                boolean hasIndex = false;
                for (String col : value.split(",")) {
                    String c = col.trim();
                    int order = c.indexOf(':');
                    if (order > 0) c = c.substring(0, order).trim();
                    if ("index".equals(c) || "*".equals(c) || c.startsWith("index.")) hasIndex = true;
                }
                /* 重复 h（?h=status&h=index）时 ES 只认最后一组，不能因任一值含 index 就放行。 */
                if (!hasIndex) return false;
            } catch (Exception ignore) {
                return false;
            }
        }
        /* 无 h=默认列含 index；有 h 且每组都含 index（上面已逐组校验）同样安全。 */
        return true;
    }

    /** 非 ADMIN raw 的 _cat 结果行级脱敏：控制面索引/别名/分片行不下发。 */
    Map<String, Object> filterCatControlRows(String pathOnly, Map<String, Object> result) {
        if (result == null || !isCatControlMetadataPath(pathOnly)) return result;
        Object body = result.get("body");
        if (!(body instanceof String)) return result;
        String text = (String) body;
        if (text.trim().isEmpty()) return result;
        final java.util.List<Object> rows;
        try {
            rows = OBJECT_MAPPER.readValue(text, java.util.List.class);
        } catch (Exception e) {
            throw new ControlPlaneGuardException("非管理员 raw 的 _cat 目录查询必须使用 format=json：" + pathOnly);
        }
        java.util.List<Object> kept = new java.util.ArrayList<>(rows.size());
        /* _cat/shards 的默认列含 ip / node：节点名与内网地址属拓扑面（与 /_nodes、/_cat/nodes
           的拒绝口径同源）。行仍保留 index/shard/state/docs/store 等排障所需列，只摘掉
           定位节点所需的两个字段——非 ADMIN 仍然能看「哪些分片在哪个状态」，看不到集群地图。 */
        boolean shardsView = pathOnly.startsWith("/_cat/shards");
        for (Object row : rows) {
            if (row instanceof Map) {
                Map<?, ?> map = (Map<?, ?>) row;
                boolean control = false;
                for (Object v : map.values()) {
                    if (v != null && (isControlIndexName(String.valueOf(v))
                            || isSensitiveSystemIndexName(String.valueOf(v)))) {
                        control = true;
                        break;
                    }
                }
                if (control) continue;
                if (shardsView) {
                    Map<String, Object> trimmed = new java.util.LinkedHashMap<>();
                    for (Map.Entry<?, ?> e : map.entrySet()) {
                        String k = String.valueOf(e.getKey()).toLowerCase(Locale.ROOT);
                        /* ES 按请求的 h 列名回写 JSON（buildXContentBuilder 用 header.display），
                           所以别名 n / id / i 与全名同权：只删 node/ip 等于留了一条别名旁路。 */
                        if ("ip".equals(k) || "node".equals(k) || "n".equals(k)
                                || "id".equals(k) || "i".equals(k) || "sync_id".equals(k)
                                || k.startsWith("unassigned")) continue;
                        trimmed.put(String.valueOf(e.getKey()), e.getValue());
                    }
                    kept.add(trimmed);
                    continue;
                }
            }
            kept.add(row);
        }
        try {
            result.put("body", OBJECT_MAPPER.writeValueAsString(kept));
        } catch (Exception e) {
            throw new ControlPlaneGuardException("_cat 结果脱敏失败，已拒绝：" + e.getMessage());
        }
        return result;
    }

    /**
     * 非 ADMIN raw 的守卫；独立方法便于逐请求形态单测（不触 ES）。
     *
     * <p>非 ADMIN 的 raw 只保留<b>数据面</b>能力：业务索引上的检索/文档增删改/批量/
     * delete-by-query/reindex/别名与模板的受控写入。集群管理、系统配置、账号安全、
     * 快照仓库、脚本/管道、索引结构管理一律拒绝——这些操作在控制台都有各自的页面写键，
     * 不能借 devtools/rest 页的写键越权。路径先做一次规范化再判定，尾斜杠、重复斜杠、
     * 百分号编码、矩阵参数不能改变路由语义。</p>
     */
    void guardRawGuarded(String method, String path, String body) {
        /* 守卫按 canonical（剥矩阵参数）判定而实际请求原样发出，两端语义一旦被
           目标端分号归一收窄即成分歧——路径部分含矩阵参数直接拒绝。
           只查 '?' 之前的路径段：query 值里的分号是合法字符（q=foo;bar），
           对全串检查会把正常检索误杀。 */
        int qIdx = path.indexOf('?');
        String pathPart = qIdx < 0 ? path : path.substring(0, qIdx);
        if (pathPart.indexOf(';') >= 0) {
            throw new ControlPlaneGuardException("非管理员 raw 不允许携带矩阵参数的路径：" + pathPart);
        }
        String canonical = canonicalRawPath(path);
        String p = rawPathOnly(canonical);
        String query = rawQueryOnly(canonical);
        /* 系统段判定统一小写：_CAT/_MSEARCH 这类大写变体目前依赖目标端路由的
           大小写敏感兜底，一旦中间介入代理或版本升级放宽即失去守卫。仅守卫链内部
           归一，不改变实际发出的路径与查询串。 */
        String pGuard = p.toLowerCase(Locale.ROOT);
        /* 不在入口盲扫 body：文档源正文可以合法包含 ".security"/"esquerystudio" 字样，
           盲扫会把正常写入误杀。各结构化渠道（bulk/msearch/mget/sql/reindex/alias/
           template/restore/search）在下面逐一做目标级守卫。 */
        List<String> segments = rawSegments(p);
        if (!segments.isEmpty()) {
            String first = segments.get(0);
            if ("_all".equalsIgnoreCase(first)) {
                throw new ControlPlaneGuardException("不允许对全量索引执行该操作（控制面索引不可触达）：_all");
            }
            if (!first.startsWith("_")) {
                guardRawIndexToken(first);
            } else if (segments.size() > 1) {
                /* 系统 API 的第二段以后同样可能是索引名/别名/仓库名——逐段做控制面判定，
                   防止 _cat/indices/esquerystudio*、_cluster/state/metadata/esquerystudio_users
                   这类“首段是 _ 系统词”的读取把控制面元数据带出。 */
                for (int i = 1; i < segments.size(); i++) {
                    String seg = segments.get(i);
                    /* 索引位的 _all 是隐式全量（/_cluster/health/_all、_cat/indices/_all），
                       与首段同权拒绝；_ALL 变体同样命中。 */
                    if ("_all".equalsIgnoreCase(seg)) {
                        throw new ControlPlaneGuardException("不允许对全量索引执行该操作（路径中段 _all）：_all");
                    }
                    if (!seg.startsWith("_")) guardRawIndexToken(seg);
                }
            }
        }
        guardRawQueryIndexRefs(query);
        guardRawPipeline(query);
        /* index/indices 查询参数不能充当「已限定目标」的凭据（见方法注释）：非 ADMIN 一律拒绝。 */
        guardRawIndexQueryParam(query);
        /* 搜索上下文 TTL 上限：PIT/scroll/async_search 的 keep_alive 不设界＝低成本 DoS
           （一个 999d 的 PIT 把 reader 与段引用钉死到集群重启），页面端点已夹紧，raw 不能绕过。 */
        guardRawKeepAlive(pGuard, query, body);
        /* ES 的 source 查询参数与 body 同权（RestRequest.contentOrSourceParam）：
           只守卫 body 会让 ?source=... 成为控制面读写旁路。source 与 body 各过一遍
           同一套结构化守卫，任一命中即拒。 */
        String sourceBody = rawSourceBody(query);
        boolean write = !"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)
                && !"OPTIONS".equalsIgnoreCase(method);
        boolean system = !segments.isEmpty() && segments.get(0).startsWith("_");
        guardRawBody(method, pGuard, query, body, write, system);
        guardStructuredRawBody(pGuard, body, query);
        if (sourceBody != null) {
            guardRawBody(method, pGuard, query, sourceBody, write, system);
            guardStructuredRawBody(pGuard, sourceBody, query);
            guardRawKeepAlive(pGuard, query, sourceBody);
        }
    }

    /**
     * 非 ADMIN raw 的搜索上下文 TTL 上限（与页面端点 {@code pitOpenClamped} 同一上限）。
     *
     * <p>PIT / scroll / async_search 都是「服务端资源 + 客户端持有 id」的模型：keep_alive
     * 决定资源被钉住多久。限制只作用于非 ADMIN——ADMIN 的 raw 是应急逃生通道，
     * 行为不变；有权限的运维仍可把 PIT 活到上限（默认 60m），能力不缺。</p>
     */
    private void guardRawKeepAlive(String p, String query, String body) {
        boolean relevant = p.equals("/_pit") || p.endsWith("/_pit")
                || p.equals("/_search") || p.endsWith("/_search")
                || p.equals("/_search/scroll") || p.equals("/_async_search");
        if (!relevant) return;
        long cap = pitKeepAliveCapMillis();
        checkKeepAliveValue("keep_alive", queryParam(query, "keep_alive"), cap);
        checkKeepAliveValue("scroll", queryParam(query, "scroll"), cap);
        if (body == null || body.trim().isEmpty()) return;
        try {
            Map<?, ?> root = OBJECT_MAPPER.readValue(stripBom(body), Map.class);
            checkKeepAliveValue("keep_alive", root.get("keep_alive") instanceof String
                    ? (String) root.get("keep_alive") : null, cap);
            checkKeepAliveValue("scroll", root.get("scroll") instanceof String
                    ? (String) root.get("scroll") : null, cap);
            /* PIT 搜索/异步搜索可把 keep_alive 嵌在 pit 对象里（PointInTimeBuilder.KEEP_ALIVE_FIELD）：
               只看根层会让 {"pit":{"id":...,"keep_alive":"9999d"}} 绕过上限。 */
            Object pit = root.get("pit");
            if (pit instanceof Map) {
                checkKeepAliveValue("keep_alive", ((Map<?, ?>) pit).get("keep_alive") instanceof String
                        ? (String) ((Map<?, ?>) pit).get("keep_alive") : null, cap);
            }
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception ignore) {
            /* 非 JSON body 交由 ES 原生报错；守卫不因解析失败放行已有字段（上面 query 已查） */
        }
    }

    /** 查询串单值（同名重复取首值；编码非法 fail-closed）。 */
    private static String queryParam(String query, String name) {
        if (query == null || query.isEmpty()) return null;
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            final String key;
            final String value;
            try {
                key = java.net.URLDecoder.decode(pair.substring(0, eq), "UTF-8");
                if (!name.equals(key)) continue;
                value = java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
            } catch (Exception e) {
                throw new ControlPlaneGuardException("查询参数编码非法，已拒绝：" + pair);
            }
            return value;
        }
        return null;
    }

    /** keep_alive/scroll 字面量必须可识别且有界：无法识别/超上限一律拒绝（fail-closed）。 */
    private static void checkKeepAliveValue(String name, String value, long capMillis) {
        if (value == null || value.trim().isEmpty()) return;
        String v = value.trim();
        long ms = v.matches("\\d+") ? Long.parseLong(v) : parseEsTimeMillis(v);
        if (ms < 0) {
            throw new ControlPlaneGuardException(
                    "非管理员 raw 的 " + name + " 不是可识别的时长（需如 30s/5m/1h）：" + value);
        }
        if (ms > capMillis) {
            throw new ControlPlaneGuardException(
                    "非管理员 raw 的 " + name + " 超出上限 " + esTimeLiteral(capMillis) + "（请求 " + value
                            + "）：长时间占用搜索上下文会阻止段合并并耗尽堆外内存；请改用不超过上限的值，"
                            + "PIT 深度分页请走查询实验室（服务端按同一上限自动夹紧）");
        }
    }

    /**
     * {@code index} / {@code indices} 查询参数在 raw 通道不能作为「已限定目标」的凭据。
     *
     * <p>两个理由，任一成立都足以 fail-closed：</p>
     * <ol>
     *   <li><b>无法证明目标端按它路由</b>：REST 层的路径参数与查询参数如何合并、谁优先，
     *       随 ES 版本/实现而变；一旦目标端忽略该参数，{@code /_search?index=logs} 就是
     *       一次全量读（控制面索引一并读出），守卫却以为「已限定」。</li>
     *   <li><b>目标二义</b>：索引级路径再带同名参数（{@code /logs/_search?index=orders}）时，
     *       路径与参数各说一个目标；若目标端以查询参数为准，等于绕过首段控制面判定。</li>
     * </ol>
     * <p>标准写法 {@code /{index}/_search} 在所有版本都生效，能力不缺；PIT 搜索按契约
     * 不带索引，走 body 里的 pit.id。非 ADMIN 命中即拒，ADMIN 走 raw 逃生通道不受影响。</p>
     */
    static void guardRawIndexQueryParam(String query) {
        if (query == null || query.isEmpty()) return;
        for (String pair : query.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            final String key;
            try {
                key = java.net.URLDecoder.decode(eq < 0 ? pair : pair.substring(0, eq), "UTF-8");
            } catch (Exception e) {
                throw new ControlPlaneGuardException("索引参数编码非法，已拒绝：" + pair);
            }
            if (!"index".equals(key) && !"indices".equals(key)) continue;
            throw new ControlPlaneGuardException(
                    "非管理员 raw 不支持用 index/indices 查询参数限定目标（无法保证目标端按该参数路由，"
                            + "被忽略即全量读）：请改用 /{index}/_search 路径形式，或用 PIT 搜索（body 带 pit.id）");
        }
    }

    /** 路径形态（系统级 / 索引级，写 / 读）对应的守卫；body 可以是实体体或 source 参数体。 */
    private void guardRawBody(String method, String p, String query, String body,                              boolean write, boolean system) {
        if (system) {
            if (write) {
                guardRawSystemWrite(method, p, query, body);
            } else {
                guardRawSystemRead(p, query);
            }
        } else {
            /* typed 兼容路由（/{index}/{type}/{verb} 与 /{index}/{type}/{id}/{verb}，如
               /logs/_doc/_bulk、/logs/_doc/1/_update）把操作动词挪到第 3/4 段，固定看
               第 2 段会把 type 段当白名单命中而漏掉全部 body 守卫（update 脚本、bulk
               动作行、search 跨索引 lookup 全部失明）。ES 8.x 已移除 typed 路由，
               非 ADMIN 对「后置动词段」一律拒绝。 */
            List<String> segs = rawSegments(p);
            for (int i = 2; i < segs.size(); i++) {
                String later = segs.get(i).toLowerCase(Locale.ROOT);
                if (RAW_INDEX_DATA_WRITE_OPS.contains(later)
                        || RAW_INDEX_MUTATING_GET.contains(later)
                        || RAW_INDEX_TOPOLOGY_READ_DENY.contains(later)
                        || "_mapping".equals(later) || "_alias".equals(later)) {
                    throw new ControlPlaneGuardException(
                            "非管理员 raw 不允许 typed 兼容路由（操作动词后置形态）：" + p);
                }
            }
            if (write) {
                guardRawIndexWrite(p, body);
            } else {
                guardRawIndexRead(p, body);
                /* GET 形态的 refresh/flush/forcemerge/close 等同样改状态：不能借只读方法绕过写白名单。 */
                if (segs.size() >= 2
                        && RAW_INDEX_MUTATING_GET.contains(segs.get(1).toLowerCase(Locale.ROOT))) {
                    throw new ControlPlaneGuardException("非管理员 raw 不允许以 GET 形态执行索引管理写操作：" + p);
                }
                /* 索引级拓扑读与根形态同权拒绝：分片恢复/段/存储/统计会把节点名与传输地址带出，
                   借索引前缀绕开根路径拒绝清单即成口径破口。 */
                if (segs.size() >= 2
                        && RAW_INDEX_TOPOLOGY_READ_DENY.contains(segs.get(1).toLowerCase(Locale.ROOT))) {
                    throw new ControlPlaneGuardException("非管理员 raw 不允许读取索引分片拓扑：" + p);
                }
            }
        }
    }

    /** 结构化端点专用守卫；raw 通道必须复用同一套，不能只靠字面扫描。 */
    private void guardStructuredRawBody(String p, String body, String query) {
        if (p.equals("/_reindex") || p.startsWith("/_reindex/")) {
            guardReindexBody(body);
            guardReindexRemote(body);
        } else if (p.startsWith("/_snapshot/") && p.endsWith("/_restore")) {
            guardRestoreBody(body);
        } else if (p.equals("/_aliases")) {
            guardAliasActionsBody(body);
        } else if (p.startsWith("/_index_template") || p.startsWith("/_component_template")
                || p.startsWith("/_template")) {
            /* 组件模板没有 index_patterns 是合法形态；索引/旧模板缺 patterns 在部分 ES 版本
               等同 catch-all，非 ADMIN 必须显式给出业务模式。 */
            if (!p.startsWith("/_component_template")) {
                guardIndexTemplatePatternsPresent(body);
            }
            guardIndexTemplateBody(body);
        } else if (p.equals("/_sql") || (p.startsWith("/_sql/") && !p.equals("/_sql/close"))
                || p.equals("/_xpack/sql") || (p.startsWith("/_xpack/sql/") && !p.equals("/_xpack/sql/close"))) {
            guardSql(body);
        } else if (p.equals("/_render/template")) {
            /* 渲染已存模板会回显模板体（可能由 ADMIN 写入）；非 ADMIN raw 只允许内联 source。 */
            guardStoredTemplateReference(body);
            guardSearchBody(body);
        } else if (p.startsWith("/_render/template/")) {
            /* 路径形态 /_render/template/{id} 本身就是已存模板引用，body 守卫看不到 id。 */
            throw new ControlPlaneGuardException("非管理员 raw 不允许按已存 id 渲染模板：" + p);
        } else if (p.startsWith("/_search/template/")) {
            /* 路径形态 /_search/template/{id} 按已存 id 执行搜索模板：模板体可能由
               更高权限写入（terms lookup 控制面等），body 守卫看不到路径里的 id。 */
            throw new ControlPlaneGuardException("非管理员 raw 不允许按已存 id 执行搜索模板：" + p);
        } else if (p.equals("/_search") || p.equals("/_search/template")
                || p.equals("/_count") || p.equals("/_async_search") || p.equals("/_field_caps")
                || p.equals("/_terms_enum") || p.equals("/_rank_eval")) {
            guardStoredTemplateReference(body);
            /* PIT 搜索按 ES 契约不能带 index：有有效 pit.id 时不要求显式 index。 */
            if (!searchBodyHasPit(body)) guardAllIndexRead(query, p);
            guardSearchBody(body);
        } else if (p.equals("/_analyze")) {
            /* 根级 _analyze 是数据面通道，但 body 的 index 目标同样会触达控制面索引配置。 */
            guardAnalyzeBody(body);
        } else if (p.equals("/_msearch") || p.equals("/_msearch/template")) {
            guardMsearchBody(body);
        } else if (p.equals("/_mget")) {
            guardMgetBody(body, null);
        } else if (p.equals("/_mtermvectors")) {
            /* 根路径多词向量：docs[]._index/parameters.index 都是二级数据源。 */
            guardMtermvectorsBody(body);
        } else if (p.equals("/_bulk")) {
            guardBulkBody(body);
        }
    }

    /** raw 系统级读：数据面查询照旧，但账号/快照仓库/脚本/管道等敏感配置不向非 ADMIN 开放。 */
    private void guardRawSystemRead(String p, String query) {
        if (p.equals("/_security/_authenticate") || p.equals("/_xpack/security/_authenticate")) return;
        /* 异步查询结果（async search / async SQL / EQL）按 id 取回，id 即凭据：
           结果集是按**执行者**权限生成的（可能是 ADMIN 的全量命中），响应还会带 pit_id；
           持 rest/devtools 读键的人拿到 id 就能读出别人的结果并继续翻页——不能按普通读放行。
           提交动作（POST /_async_search、POST /_sql）不受影响，只挡按 id 取回/状态查询。 */
        if (p.startsWith("/_async_search/") || p.startsWith("/_sql/async/")
                || p.startsWith("/_xpack/sql/async/") || p.startsWith("/_eql/search/")) {
            throw new ControlPlaneGuardException(
                    "非管理员 raw 不允许按 id 读取异步查询结果（结果按执行者权限生成，id 即凭据）：" + p);
        }
        for (String deny : RAW_SYSTEM_READ_DENY) {
            if (p.equals(deny) || p.startsWith(deny + "/")) {
                throw new ControlPlaneGuardException("非管理员 raw 不允许读取系统管理接口：" + p);
            }
        }
        if (p.equals("/_search") || p.equals("/_search/template") || p.equals("/_count")
                || p.equals("/_async_search") || p.equals("/_field_caps")
                || p.equals("/_terms_enum") || p.equals("/_rank_eval")) {
            guardAllIndexRead(query, p);
        }
        if (isCatControlMetadataPath(p) && !queryHasFormatJson(query)) {
            throw new ControlPlaneGuardException(
                    "非管理员 raw 的索引目录查询必须带 format=json（返回前会过滤控制面索引行）：" + p);
        }
        if (isCatControlMetadataPath(p) && !queryProjectsIndex(query)) {
            throw new ControlPlaneGuardException(
                    "非管理员 raw 的索引目录查询必须包含 index 列（否则无法过滤控制面索引）：" + p);
        }
        /* health 的索引级视图会枚举响应内的全部索引名；除根路径外还有
           /_cluster/health/{index}、/_cluster/health/_all 等路径形态，必须同权拒绝。 */
        if (("/_cluster/health".equals(p) || p.startsWith("/_cluster/health/"))
                && queryRequestsIndexLevel(query)) {
            throw new ControlPlaneGuardException(
                    "非管理员 raw 不允许按索引级 health 枚举（会暴露控制面索引名）：" + p);
        }
    }

    private static boolean queryRequestsIndexLevel(String query) {
        if (query == null) return false;
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            try {
                String key = java.net.URLDecoder.decode(pair.substring(0, eq), "UTF-8");
                String value = java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
                if ("level".equals(key)
                        && ("indices".equalsIgnoreCase(value) || "shards".equalsIgnoreCase(value))) {
                    return true;
                }
            } catch (Exception ignore) {
                return true;
            }
        }
        return false;
    }

    /**
     * raw 系统级写：只放行数据面 API（检索/文档/批量/reindex/SQL/受控别名与模板/快照恢复），
     * 集群设置、reroute、快照创建删除、ILM/SLM、脚本、ingest、security、watcher、transform
     * 等一律拒绝。所有放行项仍会走各自的结构化守卫。
     */
    private void guardRawSystemWrite(String method, String p, String query, String body) {
        /* 别名切换 / reindex / 快照恢复 / 模板写入都有专属页面与写键：
           raw 数据面只保留文档、检索、批量、delete-by-query 一类操作，
           不允许持 rest/devtools 写键绕过 aliases/reindex-advanced/snapshots/templates 页。 */
        boolean dataPlane = p.equals("/_bulk")
                || p.equals("/_msearch") || p.equals("/_msearch/template")
                || p.equals("/_mget")
                || p.equals("/_search") || p.equals("/_search/template")
                || p.equals("/_count") || p.equals("/_async_search") || p.equals("/_field_caps")
                || p.equals("/_analyze") || p.equals("/_render/template")
                /* SQL 只放行「提交查询 / 关闭游标 / 翻译」三个具名子路由：
                   此前 /_sql/** 整段前缀放行，任何新增子路由（如 7.11 的 DELETE /_sql/async/{id}）
                   都会自动获得写权限——把「新增路由=新增越权」变成默认行为。 */
                || p.equals("/_sql") || p.equals("/_sql/close") || p.equals("/_sql/translate")
                || p.equals("/_xpack/sql") || p.equals("/_xpack/sql/close")
                || p.equals("/_xpack/sql/translate")
                /* 开 PIT/续读 scroll 覆盖的是打开时刻的全部索引（无路径级目标限定），
                   非 ADMIN 经 raw 开全集群 PIT 或续读他人 scroll 等价于全量读；
                   仅 DELETE（释放自己持有的资源）放行。限定索引的开点走查询实验室
                   专属端点（/cluster/pit/open 强制显式索引过守卫）。 */
                || (p.equals("/_pit") && "DELETE".equalsIgnoreCase(method))
                || (p.equals("/_search/scroll") && "DELETE".equalsIgnoreCase(method));
        if (!dataPlane) {
            throw new ControlPlaneGuardException("非管理员 raw 不允许执行集群/系统管理写操作：" + p);
        }
        if (p.equals("/_search") || p.equals("/_count") || p.equals("/_async_search")
                || p.equals("/_search/template") || p.equals("/_field_caps")) {
            /* PIT 搜索按 ES 契约不带 index：有有效 pit.id 时不要求显式索引。 */
            if (!searchBodyHasPit(body)) guardAllIndexRead(query, p);
            guardSearchBody(body);
        }
    }

    /** 索引路径上的写：只放行文档级数据操作；建删索引/mapping/settings/alias/close/forcemerge 等交给带页写键的专用端点。 */
    private void guardRawIndexWrite(String p, String body) {
        List<String> segments = rawSegments(p);
        if (segments.size() < 2) {
            throw new ControlPlaneGuardException("非管理员 raw 不允许创建/删除索引：" + p);
        }
        String defaultIndex = segments.get(0);
        String op = segments.get(1).toLowerCase(Locale.ROOT);
        if (!RAW_INDEX_DATA_WRITE_OPS.contains(op)) {
            throw new ControlPlaneGuardException("非管理员 raw 不允许执行索引结构/管理写操作：" + p);
        }
        /* 带索引前缀的 _msearch/_mget/_bulk 同样要逐条校验 body；否则
           /logs/_msearch 的 index 头可写 * 或控制面索引，绕过根路径守卫。 */
        if ("_msearch".equals(op) || "_msearch/template".equals(op)) {
            guardMsearchBody(body, defaultIndex);
        } else if ("_mget".equals(op)) {
            guardMgetBody(body, defaultIndex);
        } else if ("_bulk".equals(op)) {
            guardBulkBody(body);
        } else if ("_mtermvectors".equals(op) || "_termvectors".equals(op)) {
            /* 单数 _termvectors 的 docs[] 同样可带 _index 跨索引，与 _mtermvectors 同守卫。 */
            guardMtermvectorsBody(body);
        } else if ("_update".equals(op)) {
            /* 局部更新脚本与 UBQ 同权：可改写 _index 的脚本一律拒绝。 */
            guardUpdateScript(body);
        } else if ("_search".equals(op) || "_count".equals(op)
                || "_explain".equals(op) || "_validate".equals(op)
                || "_field_caps".equals(op)
                || "_terms_enum".equals(op) || "_rank_eval".equals(op) || "_knn_search".equals(op)) {
            guardSearchBody(body);
            /* 索引前缀的 _search/template 同样不能按已存 id 执行（模板可能由更高权限写入）；
               路径形态 /{index}/_search/template/{id} 的 id 在路径上，body 守卫看不到——直接拒绝。 */
            if (segments.size() >= 3 && "template".equalsIgnoreCase(segments.get(2))) {
                if (segments.size() >= 4) {
                    throw new ControlPlaneGuardException("非管理员 raw 不允许按已存 id 执行搜索模板：" + p);
                }
                guardStoredTemplateReference(body);
            }
            if ("_rank_eval".equals(op)) guardStoredTemplateReference(body);
        } else if ("_delete_by_query".equals(op) || "_update_by_query".equals(op)) {
            /* 通配破坏性操作必须解析真实索引名再逐个判定——logs-* 会命中
               *_esquerystudio_lock / *_esquerystudio_migrate_job 这类后缀控制索引，字面前缀看不出来。 */
            guardDestructivePattern(defaultIndex);
            guardSearchBody(body);
            if ("_update_by_query".equals(op)) guardUpdateByQueryScript(body);
        }
    }

    /** 索引前缀的只读 body（含 GET ?source= 形态）：与写形态复用同一套目标守卫。 */
    private void guardRawIndexRead(String p, String body) {
        List<String> segments = rawSegments(p);
        if (segments.size() < 2) return;
        String defaultIndex = segments.get(0);
        String op = segments.get(1).toLowerCase(Locale.ROOT);
        if ("_msearch".equals(op)) {
            guardMsearchBody(body, defaultIndex);
        } else if ("_mget".equals(op)) {
            guardMgetBody(body, defaultIndex);
        } else if ("_mtermvectors".equals(op) || "_termvectors".equals(op)) {
            guardMtermvectorsBody(body);
        } else if ("_search".equals(op) || "_count".equals(op) || "_async_search".equals(op)
                || "_explain".equals(op) || "_validate".equals(op)
                || "_field_caps".equals(op)
                || "_terms_enum".equals(op) || "_rank_eval".equals(op) || "_knn_search".equals(op)) {
            guardSearchBody(body);
            /* 与写形态同口径：路径上的模板 id（/{index}/_search/template/{id}）body 守卫看不到。 */
            if (segments.size() >= 3 && "template".equalsIgnoreCase(segments.get(2))) {
                if (segments.size() >= 4) {
                    throw new ControlPlaneGuardException("非管理员 raw 不允许按已存 id 执行搜索模板：" + p);
                }
                guardStoredTemplateReference(body);
            }
            if ("_rank_eval".equals(op)) guardStoredTemplateReference(body);
        }
    }

    /** 多词向量：docs[]._index、parameters.index / 根 index 都是可指定目标索引的通道。 */
    private void guardMtermvectorsBody(String body) {
        guardSearchBody(body);
        body = stripBom(body);
        if (body == null || body.trim().isEmpty()) return;
        try {
            Map<?, ?> root = OBJECT_MAPPER.readValue(body, Map.class);
            guardBodyIndexValue(root.get("index"));
            Object parameters = root.get("parameters");
            if (parameters instanceof Map) guardBodyIndexValue(((Map<?, ?>) parameters).get("index"));
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception ignore) {
            /* 非 JSON 交由 ES 原始报错；docs 内 _index 已由 guardSearchBody 覆盖 */
        }
    }

    /** 根级 _analyze：body.index 与路径一样是目标通道，不能让它读到控制面索引的 analyzer 配置。 */
    private void guardAnalyzeBody(String body) {
        if (body == null || body.trim().isEmpty()) return;
        try {
            Map<?, ?> root = OBJECT_MAPPER.readValue(stripBom(body), Map.class);
            guardBodyIndexValue(root.get("index"));
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception ignore) {
            /* 非 JSON 交由 ES 原始报错；没有可解析的 index 字段即无目标可越界 */
        }
    }

    private void guardBodyIndexValue(Object index) {        if (index instanceof String) {
            if (!((String) index).trim().isEmpty()) guardPublicIndexPattern((String) index);
        } else if (index instanceof java.util.List) {
            for (Object one : (java.util.List<?>) index) {
                if (one instanceof String && !((String) one).trim().isEmpty()) {
                    guardPublicIndexPattern((String) one);
                }
            }
        }
    }

    /** 请求体里逐行 _index 校验（bulk 动作行不能借 unicode 转义/数组形态夹带控制面）。 */
    private void guardBulkBody(String body) {
        if (body == null || body.trim().isEmpty()) return;
        String[] lines = stripBom(body).split("\\r?\\n", -1);
        for (String rawLine : lines) {
            String line = stripBom(rawLine);
            if (line.trim().isEmpty()) continue;
            final Map<?, ?> action;
            try {
                action = OBJECT_MAPPER.readValue(line, Map.class);
            } catch (Exception e) {
                /* 非动作行（文档行）或非法 JSON 交由 ES 原始报错；动作行目标由下方 _index/pipeline 校验把守 */
                continue;
            }
            for (Object v : action.values()) {
                if (!(v instanceof Map)) continue;
                Map<?, ?> actionMeta = (Map<?, ?>) v;
                Object idx = actionMeta.get("_index");
                if (idx instanceof String) {
                    guardRawIndexToken(stripBom((String) idx));
                }
                /* 动作行 pipeline 与查询串 pipeline 同权：ES 会用它改写目标索引。 */
                Object pipeline = actionMeta.get("pipeline");
                if (pipeline != null) guardPipelineRef(String.valueOf(pipeline));
            }
            /* bulk update 的伴生文档行可携带 script（旧版 ES 的 ctx._index 可写），
               与 _update 通道同权过脚本守卫，堵住动作行 _index 合法 + 脚本改道的组合。 */
            Object script = action.get("script");
            if (script != null) guardScriptValue(script);
        }
    }

    /** 守卫解析前的 BOM/零宽噪声剥离（含前导空白后的 BOM）：解析口径必须覆盖 ES 能接受的形态。 */
    private static String stripBom(String s) {
        if (s == null || s.isEmpty()) return s;
        int i = 0;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == '\uFEFF' || c == '\u200B' || Character.isWhitespace(c)) {
                i++;
                continue;
            }
            break;
        }
        return i == 0 ? s : s.substring(i);
    }

    /** 索引/旧模板必须显式给出 index_patterns——缺省在部分 ES 版本等同 catch-all。 */
    private void guardIndexTemplatePatternsPresent(String body) {
        body = stripBom(body);
        if (body == null || body.trim().isEmpty()) {
            throw new ControlPlaneGuardException("索引模板必须显式指定 index_patterns");
        }
        try {
            Map<?, ?> root = OBJECT_MAPPER.readValue(body, Map.class);
            if (!root.containsKey("index_patterns")) {
                throw new ControlPlaneGuardException("索引模板必须显式指定 index_patterns（不允许缺省 catch-all）");
            }
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception e) {
            /* 非 JSON 交由 ES 原始报错；index_patterns 在场性由上方结构化校验 */
        }
    }

    /** reindex 的 remote 源会把服务端当 SSRF 跳板/读取远端凭据，非 ADMIN 一律拒绝。 */
    void guardReindexRemote(String body) {
        body = stripBom(body);
        if (body == null || body.trim().isEmpty()) return;
        try {
            Map<?, ?> root = OBJECT_MAPPER.readValue(body, Map.class);
            Object source = root.get("source");
            if (source instanceof Map && ((Map<?, ?>) source).get("remote") != null) {
                throw new ControlPlaneGuardException("非管理员 reindex 不允许使用 remote 源");
            }
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception ignore) {
            /* 非 JSON 交由 ES 原始报错；remote 源由上方结构化校验拒绝 */
        }
    }

    /** raw 查询串中的 index/indices 目标同样过控制面与全量通配守卫。 */
    private void guardRawQueryIndexRefs(String query) {
        if (query == null || query.isEmpty()) return;
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (String pair : query.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            final String key;
            final String value;
            try {
                /* 参数名同样要解码：?%69ndex=... 在 ES 侧等价于 index，不能按字面 key 漏过 */
                key = java.net.URLDecoder.decode(eq < 0 ? pair : pair.substring(0, eq), "UTF-8");
                value = eq < 0 ? "" : java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
            } catch (Exception e) {
                throw new ControlPlaneGuardException("索引参数编码非法，已拒绝：" + pair);
            }
            if (!"index".equals(key) && !"indices".equals(key)) continue;
            /* ES 对重复参数取首值；首个为空/naked 参数会退化为全量索引搜索。
               守卫不能只校验“最后一个看得过去的值”，空值/重复一律拒绝。 */
            if (value.trim().isEmpty()) {
                throw new ControlPlaneGuardException("索引参数不得为空（空值会退化为全量索引）：" + key);
            }
            if (!seen.add(key)) {
                throw new ControlPlaneGuardException("非管理员 raw 不允许重复 " + key + " 参数");
            }
            guardRawIndexToken(value);
        }
    }

    /** 索引 token（可逗号列表/排除项）：拒绝跨集群冒号、点号系统索引、校验临时索引与控制面。 */
    private void guardRawIndexToken(String token) {
        if (token == null || token.trim().isEmpty()) return;
        boolean anyPositive = false;
        for (String raw : token.split(",")) {
            String part = stripBom(raw).trim();
            boolean excluded = part.startsWith("-");
            if (excluded) part = part.substring(1).trim();
            /* "+" 是索引表达式的显式包含标记：目标端解析时会剥掉再判定，
               守卫不归一的话 +.security / +宿主控制索引能躲过点号前缀检查。 */
            if (part.startsWith("+")) part = part.substring(1).trim();
            if (part.isEmpty()) continue;
            if (!excluded) anyPositive = true;
            String lower = part.toLowerCase(Locale.ROOT);
            if (lower.indexOf(':') >= 0) {
                throw new ControlPlaneGuardException("非管理员 raw 不允许跨集群索引表达式：" + part);
            }
            if (lower.startsWith(".") || lower.startsWith(VALIDATE_INDEX_PREFIX)) {
                throw new ControlPlaneGuardException("非管理员 raw 不允许访问系统/校验索引：" + part);
            }
            guardIndexPattern(lower);
        }
        if (!anyPositive) {
            throw new ControlPlaneGuardException("索引表达式不能只包含排除项（会隐式全量）：" + token);
        }
    }

    /** raw 路径规范化：单次严格解码每个路径段、去矩阵参数、折叠空段与尾斜杠；失败 fail-closed。 */
    static String canonicalRawPath(String path) {
        if (path == null || !path.startsWith("/")) {
            throw new IllegalArgumentException("path 非法：须以 / 开头");
        }
        if (path.indexOf('\\') >= 0 || path.indexOf('\0') >= 0) {
            throw new ControlPlaneGuardException("path 非法：含反斜杠或 NUL");
        }
        int q = path.indexOf('?');
        String pathOnly = q < 0 ? path : path.substring(0, q);
        String query = q < 0 ? "" : path.substring(q);
        StringBuilder out = new StringBuilder(pathOnly.length());
        for (String raw : pathOnly.split("/", -1)) {
            if (raw.isEmpty()) continue;
            String decoded;
            try {
                decoded = java.net.URLDecoder.decode(raw.replace("+", "%2B"), "UTF-8");
            } catch (Exception e) {
                throw new ControlPlaneGuardException("path 编码非法，已拒绝：" + raw);
            }
            decoded = java.util.regex.Pattern.compile(";[^/]*").matcher(decoded).replaceAll("");
            if (decoded.isEmpty() || ".".equals(decoded)) continue;
            if ("..".equals(decoded)) {
                throw new ControlPlaneGuardException("path 含目录穿越片段，已拒绝");
            }
            /* # 会被 URI 客户端当片段截断，? 会把后续段变成查询串：
               守卫判定与线上实际路径必须逐字节同义，不能把差异留给 HTTP 库。 */
            if (decoded.indexOf('/') >= 0 || decoded.indexOf('\\') >= 0 || decoded.indexOf('\0') >= 0
                    || decoded.indexOf('#') >= 0 || decoded.indexOf('?') >= 0) {
                throw new ControlPlaneGuardException("path 段含非法分隔符，已拒绝：" + decoded);
            }
            out.append('/').append(decoded);
        }
        String p = out.length() == 0 ? "/" : out.toString();
        return p + query;
    }

    private static String rawPathOnly(String canonical) {
        int q = canonical.indexOf('?');
        return q < 0 ? canonical : canonical.substring(0, q);
    }

    private static String rawQueryOnly(String canonical) {
        int q = canonical.indexOf('?');
        return q < 0 ? "" : canonical.substring(q + 1);
    }

    /**
     * ES 的 {@code ?source=} 与请求体同权：提取并解码，作为第二个 body 过全部守卫。
     * 非 JSON 的 source_content_type 无法用结构化守卫解析，直接拒绝（ADMIN 不受此限）。
     */
    private static String rawSourceBody(String query) {
        if (query == null || query.isEmpty()) return null;
        String source = null;
        boolean sourceSeen = false;
        for (String pair : query.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            final String key;
            final String value;
            try {
                key = java.net.URLDecoder.decode(pair.substring(0, eq), "UTF-8");
                value = java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
            } catch (Exception e) {
                throw new ControlPlaneGuardException("查询参数编码非法，已拒绝：" + pair);
            }
            if ("source_content_type".equals(key)) {
                String ct = value.trim().toLowerCase(Locale.ROOT);
                if (!ct.isEmpty() && !ct.startsWith("application/json")) {
                    throw new ControlPlaneGuardException("非管理员 raw 的 source 只允许 JSON 内容类型：" + value);
                }
            } else if ("source".equals(key)) {
                /* ES 对重复参数取首值，守卫若只取末值会被「首个恶意、末个干净」绕过。 */
                if (sourceSeen) {
                    throw new ControlPlaneGuardException("非管理员 raw 不允许重复 source 参数");
                }
                sourceSeen = true;
                source = value;
            }
        }
        return source == null || source.trim().isEmpty() ? null : source;
    }

    private static List<String> rawSegments(String pathOnly) {
        List<String> out = new java.util.ArrayList<>();
        for (String s : pathOnly.split("/")) {
            if (!s.isEmpty()) out.add(s);
        }
        return out;
    }

    /** 系统级读禁止清单：账号/快照仓库凭据/脚本/管道/变更数据捕获/远端连接等配置面。 */
    private static final java.util.List<String> RAW_SYSTEM_READ_DENY = java.util.Arrays.asList(
            "/_security", "/_xpack/security", "/_snapshot", "/_watcher", "/_xpack/watcher",
            "/_scripts", "/_ingest", "/_ilm", "/_xpack/ilm", "/_slm", "/_ml", "/_xpack/ml",
            "/_transform", "/_xpack/transform", "/_rollup", "/_xpack/rollup",
            "/_ccr", "/_xpack/ccr", "/_remote", "/_nodes", "/_cluster/state",
            "/_cluster/settings", "/_mapping", "/_settings", "/_cat/repositories", "/_cat/snapshots",
            /* 聚合/非列式元数据无法按行过滤控制面索引，直接拒绝；
               _cat/indices|aliases|shards 改为 JSON 行过滤（见 filterCatControlRows）。 */
            "/_cat/count", "/_cat/segments", "/_cat/recovery", "/_cat/allocation", "/_stats",
            /* 无索引路径的索引枚举/分片/段视图会把控制面索引名带出 */
            "/_search_shards", "/_segments", "/_recovery", "/_shard_stores", "/_cat/fielddata",
            /* 解析/别名全量视图同样会枚举控制面索引与别名（_aliases 复数形态曾漏网） */
            "/_resolve", "/_alias", "/_aliases",
            /* 任务描述/分配诊断会带出控制面索引名与查询原文；模板视图同样属于页面专属元数据 */
            "/_tasks", "/_cat/tasks", "/_cluster/allocation", "/_cluster/pending_tasks", "/_cat/pending_tasks",
            "/_cat/templates", "/_index_template", "/_component_template", "/_template",
            /* 节点/许可/数据流/富化/监控等集群元数据面：非数据面读所需，避免暴露节点与内部数据流名 */
            "/_cat/nodes", "/_cat/nodeattrs", "/_cat/thread_pool", "/_cat/plugins",
            /* master 身份与投票排除清单是「选主成员 + 节点 id/name」的直接出口：
               与 /_cat/nodes、/_nodes 同属拓扑面，非数据面读所需。
               注意清单按「deny 本身或 deny + /」匹配——`/_cluster/voting` 匹配不到
               `/_cluster/voting_config_exclusions`（下划线不是段边界），必须写全。 */
            "/_cat/master", "/_cluster/voting", "/_cluster/voting_config_exclusions",
            "/_cat/transforms", "/_cat/ml", "/_cat/component_templates",
            "/_data_stream", "/_features", "/_license", "/_xpack/license", "/_xpack/usage",
            "/_cluster/stats", "/_enrich", "/_monitoring",
            /* 1046：新版采集/连接器/同义词/查询规则/弹性伸缩/可搜索快照的只读元数据面——
               可带出管道凭据、连接器密钥与集群容量信息，属管理面，非 ADMIN 不开放。 */
            "/_logstash", "/_connector", "/_synonyms", "/_query_rules",
            "/_autoscaling", "/_searchable_snapshots",
            /* scroll 续读无法从请求验明所属搜索上下文：id 一旦泄露（审计/同屏）可续读
               任意人打开过的控制面上下文；GET 形态在此兜底（POST 续读已被数据面写白名单拒绝）。
               热线程栈、悬挂索引、许可/特性根、脚本上下文与异步搜索状态会带出
               控制面索引名、节点内部结构与集群元数据，均非数据面读所需。 */
            "/_search/scroll", "/_cat/hot_threads", "/_dangling", "/_xpack",
            "/_script_context", "/_script_language", "/_migration", "/_async_search/status",
            /* 这些“读”动词在 ES 侧会改状态（refresh/flush/cache/forcemerge/close/open） */
            "/_refresh", "/_flush", "/_cache", "/_forcemerge", "/_close", "/_open", "/_reindex");

    /** 索引前缀路径上以 GET 形态出现的状态变更动词（ES 对部分 POST 接口也接受 GET）。 */
    private static final java.util.Set<String> RAW_INDEX_MUTATING_GET = new java.util.HashSet<>(
            java.util.Arrays.asList("_refresh", "_flush", "_cache", "_forcemerge", "_close", "_open",
                    "_rollover", "_delete_by_query", "_update_by_query", "_bulk", "_reindex"));

    /** 索引级形态同权拒绝的分片拓扑读：根形态已在系统读拒绝清单，索引前缀变体不得绕行。
     *  {@code _search_shards} 的响应自带 {@code nodes[].transport_address}（节点名 + 内网
     *  IP:9300），与根形态 {@code /_search_shards} 的拒绝口径必须一致——只在索引前缀放行
     *  等于把「根路径禁拓扑」变成一条换前缀即可绕过的假边界。 */
    private static final java.util.Set<String> RAW_INDEX_TOPOLOGY_READ_DENY = new java.util.HashSet<>(
            java.util.Arrays.asList("_recovery", "_shard_stores", "_segments", "_stats", "_search_shards"));

    /** 索引级数据面写操作白名单（其余索引结构/管理写一律拒绝）。 */
    private static final java.util.Set<String> RAW_INDEX_DATA_WRITE_OPS = new java.util.HashSet<>(
            java.util.Arrays.asList("_doc", "_create", "_update", "_bulk", "_delete_by_query",
                    "_update_by_query", "_search", "_count", "_msearch", "_mget", "_explain",
                    "_validate", "_field_caps", "_termvectors", "_mtermvectors", "_analyze", "_pit",
                    /* 只读但接受 body（GET/POST 均可）的检索类端点：允许下发但必须过 DSL 守卫。 */
                    "_terms_enum", "_rank_eval", "_knn_search"));

    /** PIT 搜索按 ES 契约不带 index：只有非空 pit.id 且没有 index/indices 时才豁免显式索引。 */
    private static boolean searchBodyHasPit(String body) {
        body = stripBom(body);
        if (body == null || body.trim().isEmpty()) return false;
        try {
            Map<?, ?> root = OBJECT_MAPPER.readValue(body, Map.class);
            Object pit = root.get("pit");
            if (!(pit instanceof Map)) return false;
            Object id = ((Map<?, ?>) pit).get("id");
            return id instanceof String && !((String) id).trim().isEmpty()
                    && !root.containsKey("index") && !root.containsKey("indices");
        } catch (Exception e) {
            return false;
        }
    }

    /** 无索引路径的系统级查询默认覆盖全部索引——必须显式给 index/indices 且不得命中控制面。 */
    private void guardAllIndexRead(String query, String endpoint) {
        boolean scoped = false;
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (String pair : query.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            final String key;
            String value;
            try {
                key = java.net.URLDecoder.decode(eq < 0 ? pair : pair.substring(0, eq), "UTF-8");
                value = eq < 0 ? "" : java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
            } catch (Exception e) {
                throw new ControlPlaneGuardException("索引参数编码非法，已拒绝：" + pair);
            }
            if (!"index".equals(key) && !"indices".equals(key)) continue;
            /* 空/naked 首值在 ES 侧等价于未指定（全量），重复参数只取首值；
               守卫必须按同一语义拒绝，而不是跳过空值后校验后面的干净值。 */
            if (value.trim().isEmpty()) {
                throw new ControlPlaneGuardException("系统级查询的索引参数不得为空（会退化为全量）：" + endpoint);
            }
            if (!seen.add(key)) {
                throw new ControlPlaneGuardException("系统级查询不允许重复 " + key + " 参数：" + endpoint);
            }
            guardPublicIndexPattern(value);
            scoped = true;
        }
        if (!scoped) {
            throw new ControlPlaneGuardException("系统级全量查询必须显式指定 index（不允许全量）：" + endpoint);
        }
    }

    /** _msearch NDJSON：每个索引头必须显式且不得是控制面/全量通配。 */
    private void guardMsearchBody(String body) {
        guardMsearchBody(body, null);
    }

    private void guardMsearchBody(String body, String defaultIndex) {
        if (body == null || body.trim().isEmpty()) {
            throw new ControlPlaneGuardException("_msearch 每个请求必须显式指定 index（不允许全量）");
        }
        boolean expectHeader = true;
        int headers = 0;
        String[] lines = body.split("\\r?\\n", -1);
        int lineCount = lines.length;
        /* 只忽略末尾换行；内部空行会让守卫与 ES 的 NDJSON 配对错位
           （守卫把下一行当头、ES 可能跳过空行后仍当头），必须拒绝。 */
        while (lineCount > 0 && stripBom(lines[lineCount - 1]).trim().isEmpty()) lineCount--;
        for (int lineNo = 0; lineNo < lineCount; lineNo++) {
            String line = stripBom(lines[lineNo]);
            if (line.trim().isEmpty()) {
                throw new ControlPlaneGuardException("_msearch 不允许空行（避免索引头与查询体错位）");
            }
            if (!expectHeader) {
                /* 查询行同样可能夹带 terms lookup 的二级索引目标；模板 id 形态也必须拒绝。 */
                guardStoredTemplateReference(line);
                guardSearchBody(line);
                expectHeader = true;
                continue;
            }
            headers++;
            final Map<String, Object> root;
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> parsed = OBJECT_MAPPER.readValue(line, Map.class);
                root = parsed;
            } catch (Exception e) {
                throw new IllegalArgumentException("_msearch 索引头不是合法 JSON: " + e.getMessage());
            }
            /* ES 的 _msearch 头同时接受 index 与 indices；只看单数会让 indices 形态直读控制面。
               两者都在场时逐一校验（任一命中即拒），空数组/空串等同未指定（ES 会退化为 _all）。 */
            boolean hasIndex = root.containsKey("index") || root.containsKey("indices");
            if (!hasIndex) {
                /* 路径已带索引时允许空头继承路径索引（ES 语义），但路径索引本身必须已过守卫。 */
                if (defaultIndex != null) {
                    guardRawIndexToken(defaultIndex);
                } else {
                    guardMsearchIndex(null);
                }
            } else {
                if (root.containsKey("index")) guardMsearchIndex(root.get("index"));
                if (root.containsKey("indices")) guardMsearchIndex(root.get("indices"));
            }
            expectHeader = false;
        }
        if (headers == 0) {
            throw new ControlPlaneGuardException("_msearch 每个请求必须显式指定 index（不允许全量）");
        }
    }

    private void guardMsearchIndex(Object index) {
        if (index == null) {
            throw new ControlPlaneGuardException("_msearch 每个请求必须显式指定 index（不允许全量）");
        }
        if (index instanceof String) {
            if (((String) index).trim().isEmpty()) {
                throw new ControlPlaneGuardException("_msearch 每个请求必须显式指定 index（不允许全量）");
            }
            guardPublicIndexPattern((String) index);
            return;
        }
        if (index instanceof java.util.List) {
            if (((java.util.List<?>) index).isEmpty()) {
                throw new ControlPlaneGuardException("_msearch 每个请求必须显式指定 index（不允许全量）");
            }
            for (Object one : (java.util.List<?>) index) {
                if (!(one instanceof String) || ((String) one).trim().isEmpty()) {
                    throw new IllegalArgumentException("_msearch index 数组元素必须是非空字符串");
                }
                guardPublicIndexPattern((String) one);
            }
            return;
        }
        throw new IllegalArgumentException("_msearch index 必须是字符串或字符串数组");
    }

    /**
     * _mget 文档级 _index 守卫：无路径索引时每篇必须显式 _index；
     * 路径形式 {@code POST /logs/_mget {"docs":[{"_id":"1"}]}} 可省略 _index（默认索引已由路径守卫）。
     */
    private void guardMgetBody(String body, String defaultIndex) {
        body = stripBom(body);
        if (body == null || body.trim().isEmpty()) return;
        final Object docs;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            docs = root.get("docs");
        } catch (Exception e) {
            throw new IllegalArgumentException("_mget body 不是合法 JSON: " + e.getMessage());
        }
        if (!(docs instanceof java.util.List)) return;
        boolean hasPathIndex = defaultIndex != null && !defaultIndex.trim().isEmpty();
        for (Object one : (java.util.List<?>) docs) {
            if (!(one instanceof Map)) continue;
            Object index = ((Map<?, ?>) one).get("_index");
            if (!(index instanceof String) || ((String) index).trim().isEmpty()) {
                if (hasPathIndex) continue;
                throw new ControlPlaneGuardException("_mget 每篇文档必须显式指定 _index（不允许全量）");
            }
            guardPublicIndexPattern((String) index);
        }
    }

    public Map<String, Object> raw(String method, String path, String body) throws IOException {        if (path == null || !path.startsWith("/") || path.contains("..")) {
            throw new IllegalArgumentException("path 非法：须以 / 开头且不含 ..");
        }
        if (path.indexOf('#') >= 0) {
            throw new IllegalArgumentException("path 非法：不得包含 URI 片段分隔符 #");
        }
        String m = method == null ? "GET" : method.trim().toUpperCase(Locale.ROOT);
        if (!java.util.Arrays.asList("GET", "POST", "PUT", "DELETE", "HEAD").contains(m)) {
            throw new IllegalArgumentException("method 不支持: " + method);
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(m, path);
        /* ES 接受 GET 携带 body（_search/_count 等）；HEAD 语义无响应体，忽略。
           此前丢弃 GET body 会让 DevTools 导入的 GET 搜索静默退化为 match_all。 */
        if (body != null && !body.trim().isEmpty() && !"HEAD".equals(m)) {
            req.setJsonEntity(body);
        }
        /* ADMIN raw 是控制面应急逃生通道：不走控制索引守卫（结构化端点才是越权面） */
        org.elasticsearch.client.Response resp = performUnguarded(req);
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("status", resp.getStatusLine().getStatusCode());
        result.put("body", resp.getEntity() == null ? "" : org.apache.http.util.EntityUtils.toString(resp.getEntity()));
        return result;
    }

    // ═══ : 集群级运维观测能力（tasks/allocation/hot_threads/pending/nodes_stats/analyze/aliases） ═══

    /**
     * 列出集群任务（{@code GET /_tasks}）。返回结构化 {@code [{taskId,node,action,description,parentTaskId,startTimeMillis,runningTimeNanos,tookMs,cancellable}]}。
     * 支持 actions 过滤（如 {@code indices:data/write/reindex}）与 detailed。
     * tookMs=已运行毫秒（running_time_in_nanos 折算；ES _tasks 无 finished 概念，任务完成即从列表消失，
     * 语义与 AdhocRebuildJob「运行中=-1」不同，前端 TasksView 口径注释已同步）。
     */
    public java.util.List<Map<String, Object>> listTasks(String actions, boolean detailed) throws IOException {
        StringBuilder path = new StringBuilder("/_tasks?");
        path.append("detailed=").append(detailed);
        if (actions != null && !actions.trim().isEmpty()) {
            path.append("&actions=").append(java.net.URLEncoder.encode(actions.trim(), "UTF-8"));
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path.toString());
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> nodesMap = (Map<String, Object>) raw.get("nodes");
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        if (nodesMap == null) return out;
        for (Map.Entry<String, Object> ne : nodesMap.entrySet()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> nodeInfo = (Map<String, Object>) ne.getValue();
            String nodeName = String.valueOf(nodeInfo.getOrDefault("name", ne.getKey()));
            @SuppressWarnings("unchecked")
            Map<String, Object> tasksMap = (Map<String, Object>) nodeInfo.get("tasks");
            if (tasksMap == null) continue;
            for (Map.Entry<String, Object> te : tasksMap.entrySet()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> t = (Map<String, Object>) te.getValue();
                Map<String, Object> row = new java.util.LinkedHashMap<>();
                row.put("taskId", te.getKey());
                row.put("node", nodeName);
                row.put("action", t.get("action"));
                row.put("description", t.get("description"));
                row.put("parentTaskId", t.get("parent_task_id"));
                row.put("startTimeMillis", t.get("start_time_in_millis"));
                row.put("runningTimeNanos", t.get("running_time_in_nanos"));
                Object runningNanos = t.get("running_time_in_nanos");
                row.put("tookMs", runningNanos instanceof Number
                        ? ((Number) runningNanos).longValue() / 1_000_000L : -1L);
                row.put("cancellable", t.get("cancellable"));
                row.put("status", t.get("status"));
                out.add(row);
            }
        }
        return out;
    }

    /**
     * 取消集群任务（{@code POST /_tasks/{taskId}/_cancel}）。仅对 cancellable=true 的任务生效。
     */
    public Map<String, Object> cancelTask(String taskId) throws IOException {
        if (taskId == null || taskId.isEmpty() || !taskId.contains(":")
                || !taskId.matches("[A-Za-z0-9._:-]{1,255}") || taskId.contains("..")) {
            throw new IllegalArgumentException("taskId 非法：应为 nodeId:taskNum 形式");
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/_tasks/" + taskId + "/_cancel");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        logger.info("[EsIndexAdmin] cancelTask taskId={}", taskId);
        return result;
    }

    /**
     * 分片分配诊断（{@code POST /_cluster/allocation/explain}）。body 可选：{@code {index, shard, primary}}；
     * 为 null/空则让 ES 自选第一个 unassigned shard 解释。返回原始 explain 结构，前端渲染 decisions 决策链。
     */
    public Map<String, Object> allocationExplain(String bodyJson) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/_cluster/allocation/explain");
        if (bodyJson != null && !bodyJson.trim().isEmpty()) {
            try {
                Map<?, ?> root = OBJECT_MAPPER.readValue(bodyJson, Map.class);
                guardAllocationIndex(root.get("index"));
            } catch (ControlPlaneGuardException e) {
                throw e;
            } catch (Exception ignore) {
                // 非 JSON 由 ES 原始报错
            }
            req.setJsonEntity(bodyJson);
        }
        org.elasticsearch.client.Response resp = performGuarded(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        Object idx = result.get("index");
        if (idx != null && isControlIndexName(String.valueOf(idx))) {
            throw new ControlPlaneGuardException("分片分配诊断不得返回控制面索引信息");
        }
        return result;
    }

    private void guardAllocationIndex(Object index) {
        if (index instanceof String && !((String) index).trim().isEmpty()) {
            guardPublicIndexPattern((String) index);
        } else if (index instanceof java.util.List) {
            for (Object one : (java.util.List<?>) index) {
                if (one instanceof String && !((String) one).trim().isEmpty()) {
                    guardPublicIndexPattern((String) one);
                }
            }
        }
    }

    /**
     * 热点线程（{@code GET /_nodes/hot_threads}）。返回纯文本报告（多节点堆叠），前端 mono 字体渲染。
     */
    public String hotThreads(int threads, String interval, String type, String nodeId) throws IOException {
        StringBuilder path = new StringBuilder("/_nodes/");
        if (nodeId != null && !nodeId.trim().isEmpty()) {
            path.append(java.net.URLEncoder.encode(nodeId.trim(), "UTF-8")).append("/");
        }
        path.append("hot_threads?threads=").append(threads);
        if (interval != null && !interval.trim().isEmpty()) path.append("&interval=").append(interval.trim());
        if (type != null && !type.trim().isEmpty()) path.append("&type=").append(type.trim());
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path.toString());
        org.elasticsearch.client.Response resp = performGuarded(req);
        return org.apache.http.util.EntityUtils.toString(resp.getEntity());
    }

    /**
     * Master 待处理任务（{@code GET /_cluster/pending_tasks}）。tasks 数组含 priority/insert_order/time_in_queue 等。
     */
    public Map<String, Object> pendingTasks() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_cluster/pending_tasks");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(body, Map.class);
        return result;
    }

    /**
     * 节点 stats（{@code GET /_nodes/stats/jvm,fs,os,thread_pool}）。精简为每节点 {jvm.mem, fs.total, os.cpu, thread_pool.search/write/bulk}。
     */
    public java.util.List<Map<String, Object>> nodesStats() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_nodes/stats/jvm,fs,os,thread_pool");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        @SuppressWarnings("unchecked")
        Map<String, Object> nodesMap = (Map<String, Object>) raw.get("nodes");
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        if (nodesMap == null) return out;
        for (Map.Entry<String, Object> ne : nodesMap.entrySet()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> n = (Map<String, Object>) ne.getValue();
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("nodeId", ne.getKey());
            row.put("name", n.get("name"));
            row.put("host", n.get("host"));
            row.put("roles", n.get("roles"));
            @SuppressWarnings("unchecked")
            Map<String, Object> jvm = (Map<String, Object>) n.get("jvm");
            if (jvm != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> mem = (Map<String, Object>) jvm.get("mem");
                if (mem != null) {
                    Map<String, Object> j = new java.util.LinkedHashMap<>();
                    j.put("heapUsedBytes", mem.get("heap_used_in_bytes"));
                    j.put("heapMaxBytes", mem.get("heap_max_in_bytes"));
                    j.put("heapUsedPercent", mem.get("heap_used_percent"));
                    row.put("jvm", j);
                }
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> fs = (Map<String, Object>) n.get("fs");
            if (fs != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> total = (Map<String, Object>) fs.get("total");
                if (total != null) {
                    Map<String, Object> f = new java.util.LinkedHashMap<>();
                    f.put("totalBytes", total.get("total_in_bytes"));
                    f.put("freeBytes", total.get("free_in_bytes"));
                    f.put("availableBytes", total.get("available_in_bytes"));
                    row.put("fs", f);
                }
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> os = (Map<String, Object>) n.get("os");
            if (os != null) {
                Object cpu = os.get("cpu");
                // ES 5.x+ 把 load_average 挪到了 os.cpu.load_average（{1m,5m,15m}），旧位置 os.load_average 仅作兼容
                Object loadAvg = os.get("load_average");
                if (loadAvg == null && cpu instanceof Map) loadAvg = ((Map<?, ?>) cpu).get("load_average");
                Map<String, Object> o = new java.util.LinkedHashMap<>();
                if (cpu instanceof Map) o.put("cpuPercent", ((Map<?,?>) cpu).get("percent"));
                o.put("loadAverage", loadAvg);
                row.put("os", o);
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> tp = (Map<String, Object>) n.get("thread_pool");
            if (tp != null) {
                Map<String, Object> tpOut = new java.util.LinkedHashMap<>();
                for (String pool : new String[]{"search", "write", "bulk", "get", "flush", "refresh"}) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> p = (Map<String, Object>) tp.get(pool);
                    if (p != null) {
                        Map<String, Object> pp = new java.util.LinkedHashMap<>();
                        pp.put("active", p.get("active"));
                        pp.put("queue", p.get("queue"));
                        pp.put("rejected", p.get("rejected"));
                        pp.put("completed", p.get("completed"));
                        tpOut.put(pool, pp);
                    }
                }
                row.put("threadPool", tpOut);
            }
            out.add(row);
        }
        return out;
    }

    /**
     * 分词器测试（{@code POST /{index}/_analyze}）。index 可为 "_analyze" 走全局；
     * body 形如 {@code {"analyzer":"ik_smart","text":"..."}} 或 {@code {"tokenizer":"...","filter":[...]}}。
     */
    public Map<String, Object> analyze(String index, String bodyJson) throws IOException {
        boolean global = index == null || index.trim().isEmpty() || "_analyze".equals(index);
        if (!global) guardIndexName(index);
        String path = global ? "/_analyze" : "/" + index + "/_analyze";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", path);
        req.setJsonEntity(bodyJson == null || bodyJson.trim().isEmpty() ? "{}" : bodyJson);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        return result;
    }

    /**
     * 别名全图（{@code GET /_alias}）。返回 {@code [{alias, index, isWriteIndex, filter, routing}]} 扁平列表，
     * 前端可自行按 alias 聚合展示指向关系。排除 . 开头系统索引。
     */
    public java.util.List<Map<String, Object>> listAllAliases() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_alias");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            String idx = e.getKey();
            if (idx.startsWith(".")) continue;
            @SuppressWarnings("unchecked")
            Map<String, Object> aliasesWrap = (Map<String, Object>) ((Map<String, Object>) e.getValue()).get("aliases");
            if (aliasesWrap == null || aliasesWrap.isEmpty()) continue;
            for (Map.Entry<String, Object> ae : aliasesWrap.entrySet()) {
                @SuppressWarnings("unchecked")
                Map<String, Object> aMeta = (Map<String, Object>) ae.getValue();
                Map<String, Object> row = new java.util.LinkedHashMap<>();
                row.put("alias", ae.getKey());
                row.put("index", idx);
                row.put("isWriteIndex", aMeta.get("is_write_index"));
                row.put("filter", aMeta.get("filter"));
                row.put("routing", aMeta.get("index_routing"));
                out.add(row);
            }
        }
        out.sort((a, b) -> {
            int c = String.valueOf(a.get("alias")).compareTo(String.valueOf(b.get("alias")));
            return c != 0 ? c : String.valueOf(a.get("index")).compareTo(String.valueOf(b.get("index")));
        });
        return out;
    }

    /**
     * 字段级部分更新（_update partial doc）：body 形如 {"doc":{...}}，
     * 与 {@link #updateDocument} 的整体覆盖语义区分，供表格单元格 Pending Changes 批量提交。
     * refresh=true 保证提交后立即可搜。
     */
    public Map<String, Object> updatePartial(String index, String id, String partialDocJson) throws IOException {
        guardIndexName(index);
        String encodedId = encodePathToken(id, "文档 ID");
        /* typeless _update 是 7.0 才有的路由，经版本感知路径兼容 6.x */
        Map<String, Object> result = performDocOpVersionAware("POST", index, encodedId,
                "_update", "?refresh=true", "{\"doc\":" + partialDocJson + "}");
        logger.info("[EsIndexAdmin] updatePartial index={} id={} result={}", index, id, result.get("result"));
        return result;
    }

    // ═══ : 平台/分布式能力（templates / snapshot / shards distribution） ═══

    /**
     * 列出所有索引模板（{@code _index_template}）与组件模板（{@code _component_template}）并集。
     * 返回 {@code {index_templates:[{name,index_patterns,priority,version,composed_of,template}], component_templates:[{name,template,version}]}}。
     * <p>：composable template 是 7.8+ 才有的 API，目标集群更低版本（6.x / 7.7-）时
     * 降级读 legacy {@code /_template}，归一化成同构形状并附 {@code legacy:true} 标记。
     */
    public Map<String, Object> listTemplates() throws IOException {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        if (!supportsComposableTemplateNow()) {
            org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_template");
            org.elasticsearch.client.Response resp = performGuarded(req);
            String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
            java.util.List<Map<String, Object>> list = new java.util.ArrayList<>();
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                Map<String, Object> row = new java.util.LinkedHashMap<>();
                row.put("name", e.getKey());
                row.put("index_template", e.getValue());
                list.add(row);
            }
            out.put("index_templates", list);
            out.put("component_templates", Collections.emptyList());
            out.put("legacy", Boolean.TRUE);
            return out;
        }
        out.put("index_templates", performGetJsonList("/_index_template", "index_templates"));
        out.put("component_templates", performGetJsonList("/_component_template", "component_templates"));
        return out;
    }

    @SuppressWarnings("unchecked")
    private java.util.List<Map<String, Object>> performGetJsonList(String path, String field) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        Object list = raw.get(field);
        return list instanceof java.util.List ? (java.util.List<Map<String, Object>>) list : Collections.emptyList();
    }

    /**
     * 创建/更新索引或组件模板。
     * @param kind 取值 {@code index} 或 {@code component}
     */
    public Map<String, Object> putTemplate(String kind, String name, String bodyJson) throws IOException {
        /* 非 ADMIN 结构化入口同样要求显式业务 index_patterns：缺省在部分版本等同 catch-all。
           组件模板没有 index_patterns，必须与 raw 通道同口径豁免。 */
        if (!"component".equalsIgnoreCase(kind)) {
            guardIndexTemplatePatternsPresent(bodyJson);
        }
        guardIndexTemplateBody(bodyJson);
        return doPutTemplate(kind, name, bodyJson);
    }

    /** ADMIN 结构化入口：允许 catch-all 模板（与 raw 逃生通道同权，非 ADMIN 仍走严格守卫）。 */
    public Map<String, Object> putTemplateAdmin(String kind, String name, String bodyJson) throws IOException {
        return doPutTemplate(kind, name, bodyJson);
    }

    private Map<String, Object> doPutTemplate(String kind, String name, String bodyJson) throws IOException {
        String base = resolveTemplateBase(kind);
        guardPathToken(name, "模板名");
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                "PUT", base + "/" + encodePathSegment(name));
        req.setJsonEntity(bodyJson);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] putTemplate kind={} name={} result={}", kind, name, result);
        return result;
    }

    /** 删除索引或组件模板。 */
    public Map<String, Object> deleteTemplate(String kind, String name) throws IOException {
        String base = resolveTemplateBase(kind);
        guardPathToken(name, "模板名");
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                "DELETE", base + "/" + encodePathSegment(name));
        org.elasticsearch.client.Response resp = performGuarded(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] deleteTemplate kind={} name={} result={}", kind, name, result);
        return result;
    }

    /**
     * 非 ADMIN 删除模板：<b>先读回模板定义、按其 index_patterns 判定</b>再删。
     *
     * <p>写入侧（{@link #putTemplate}）早就要求显式业务模式、拒绝 catch-all 与控制面通配；
     * 删除侧此前没有任何守卫——持 templates 页写键即可删掉任意集群模板（含覆盖控制面
     * 索引模式的模板）。模板是集群级、影响未来所有匹配索引的建索引行为，「写有守卫、
     * 删无守卫」是同一口径的破口，这里补齐对称性。读不到/解析不出模式一律拒绝
     * （fail-closed）：无法证明安全就不允许删。</p>
     */
    public Map<String, Object> deleteTemplateGuarded(String kind, String name) throws IOException {
        guardPathToken(name, "模板名");
        if (!"component".equalsIgnoreCase(kind)) {
            guardTemplateDeletionTarget(resolveTemplateBase(kind), name);
        }
        return deleteTemplate(kind, name);
    }

    /** 读回模板体并抽出 index_patterns 过写入同款守卫；模板不存在时交给 DELETE 自然 404。 */
    private void guardTemplateDeletionTarget(String base, String name) throws IOException {
        final String body;
        try {
            org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                    "GET", base + "/" + encodePathSegment(name));
            org.elasticsearch.client.Response resp = performGuarded(req);
            body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        } catch (org.elasticsearch.client.ResponseException e) {
            if (e.getResponse() != null && e.getResponse().getStatusLine() != null
                    && e.getResponse().getStatusLine().getStatusCode() == 404) {
                return; // 不存在：让 DELETE 走原错误通道（404 语义不变）
            }
            throw new ControlPlaneGuardException("模板定义读取失败，非管理员不得删除：" + name);
        }
        if (body == null || body.trim().isEmpty()) {
            throw new ControlPlaneGuardException("无法读取模板定义，非管理员不得删除：" + name);
        }
        final Object patterns;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            Object node = root;
            Object list = root.get("index_templates");
            if (list instanceof java.util.List && !((java.util.List<?>) list).isEmpty()) {
                /* composable：{"index_templates":[{"name":..,"index_template":{..}}]} */
                Object first = ((java.util.List<?>) list).get(0);
                node = first instanceof Map ? ((Map<?, ?>) first).get("index_template") : null;
            } else if (root.size() == 1) {
                /* legacy：{"<模板名>":{"index_patterns":[..],..}} */
                Object only = root.values().iterator().next();
                node = only;
            }
            if (!(node instanceof Map)) {
                throw new ControlPlaneGuardException("模板定义结构无法识别，非管理员不得删除：" + name);
            }
            patterns = ((Map<?, ?>) node).get("index_patterns");
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new ControlPlaneGuardException("模板定义无法解析，非管理员不得删除：" + name);
        }
        if (patterns == null) {
            /* 缺 patterns 在部分 ES 版本等同 catch-all：无法证明只落在业务索引上，fail-closed */
            throw new ControlPlaneGuardException(
                    "模板未声明 index_patterns（部分版本等同 catch-all），非管理员不得删除：" + name);
        }
        final String patternsJson;
        try {
            patternsJson = OBJECT_MAPPER.writeValueAsString(
                    java.util.Collections.singletonMap("index_patterns", patterns));
        } catch (Exception e) {
            throw new ControlPlaneGuardException("模板 index_patterns 无法序列化，非管理员不得删除：" + name);
        }
        /* 与写入同口径：缺 patterns（部分版本等同 catch-all）/ catch-all / 控制面通配一律拒。 */
        guardIndexTemplatePatternsPresent(patternsJson);
        guardIndexTemplateBody(patternsJson);
    }

    /* 模板端点版本感知——路由到目标集群时按其版本选 composable / legacy API */
    private boolean supportsComposableTemplateNow() {
        io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter r = clientRouter;
        String v = r == null ? null : r.currentEsVersion();
        return io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps.supportsComposableTemplate(v);
    }

    private String resolveTemplateBase(String kind) {
        boolean composable = supportsComposableTemplateNow();
        if ("component".equalsIgnoreCase(kind)) {
            if (!composable) {
                throw new IllegalStateException("目标集群不支持 component_template（需 7.8+），请改用 legacy 索引模板");
            }
            return "/_component_template";
        }
        return composable ? "/_index_template" : "/_template";
    }

    /** 列出已注册的 snapshot repositories。返回 {@code [{name,type,settings}]}。 */
    public java.util.List<Map<String, Object>> listSnapshotRepositories() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_snapshot");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> meta = (Map<String, Object>) e.getValue();
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("name", e.getKey());
            row.put("type", meta.get("type"));
            row.put("settings", meta.get("settings"));
            out.add(row);
        }
        return out;
    }

    /** 非 ADMIN 的仓库视图：递归脱敏云存储凭据（含 Azure key / GCS service_account 嵌套形态）。 */
    public static java.util.List<Map<String, Object>> maskSnapshotRepoSecrets(
            java.util.List<Map<String, Object>> repos) {
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        if (repos == null) return out;
        for (Map<String, Object> row : repos) {
            out.add(maskSecretMap(row));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> maskSecretMap(Map<?, ?> src) {
        Map<String, Object> masked = new java.util.LinkedHashMap<>();
        for (Map.Entry<?, ?> e : src.entrySet()) {
            String key = String.valueOf(e.getKey());
            /* 点号/连字符/下划线统一后再判定：Hadoop/Azure 插件常用
               conf.fs.s3a.access.key、conf.fs.azure.account.key.<acct> 等写法。 */
            String k = key.toLowerCase(Locale.ROOT).replace('.', '_').replace('-', '_');
            boolean secret = k.contains("secret") || k.contains("password") || k.contains("passwd")
                    || k.contains("passphrase") || k.contains("token") || k.contains("access_key")
                    || k.contains("accesskey") || k.contains("credential") || k.contains("role_arn")
                    || k.contains("service_account") || k.contains("private_key") || k.contains("client_key")
                    || k.contains("api_key") || k.contains("account_key") || k.contains("key")
                    || k.contains("sas") || k.contains("cert") || k.contains("authorization");
            masked.put(key, secret ? "***" : maskSecretValue(e.getValue()));
        }
        return masked;
    }

    private static Object maskSecretValue(Object v) {
        if (v instanceof Map) return maskSecretMap((Map<?, ?>) v);
        if (v instanceof java.util.List) {
            java.util.List<Object> out = new java.util.ArrayList<>();
            for (Object one : (java.util.List<?>) v) out.add(maskSecretValue(one));
            return out;
        }
        /* URL 内嵌凭据（https://user:pass@host）不在 key 名里：按值形态脱敏。 */
        if (v instanceof String) return maskUrlUserInfo((String) v);
        return v;
    }

    static String maskUrlUserInfo(String value) {
        if (value == null) return null;
        int scheme = value.indexOf("://");
        if (scheme < 0) return value;
        int at = value.indexOf('@', scheme + 3);
        if (at < 0) return value;
        int slash = value.indexOf('/', scheme + 3);
        if (slash >= 0 && slash < at) return value;
        return value.substring(0, scheme + 3) + "***" + value.substring(at);
    }

    /** 列出指定 repo 下所有 snapshot。 */
    @SuppressWarnings("unchecked")
    public java.util.List<Map<String, Object>> listSnapshots(String repo) throws IOException {
        guardSnapshotToken(repo, "snapshot repo");
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_snapshot/" + repo + "/_all?ignore_unavailable=true");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        Map<String, Object> raw = OBJECT_MAPPER.readValue(body, Map.class);
        Object list = raw.get("snapshots");
        return list instanceof java.util.List ? (java.util.List<Map<String, Object>>) list : Collections.emptyList();
    }

    /** 会拼进 ES REST 路径的标识（模板名/SLM 策略等）：拒绝穿越/查询/通配注入，其余按段编码放行。 */
    static void guardPathToken(String value, String label) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(label + " 非法: " + value);
        }
        String s = value.trim();
        if (s.contains("..") || s.contains("/") || s.contains("\\") || s.contains("?")
                || s.contains("#") || s.contains("%") || s.contains("*") || s.indexOf('\0') >= 0
                || s.indexOf('\r') >= 0 || s.indexOf('\n') >= 0) {
            throw new IllegalArgumentException(label + " 非法: " + value);
        }
    }

    /** 路径段编码：保留 ES 合法名称的 unicode/@/等字符，空格按 %20 而非 +。 */
    static String encodePathSegment(String value) throws IOException {
        return java.net.URLEncoder.encode(value.trim(), "UTF-8").replace("+", "%20");
    }

    /** repo/snapshot 名会拼进 URL 路径：只允许 ES 合法字符，杜绝 `..`/斜杠/查询串注入。 */
    static void guardSnapshotToken(String value, String label) {
        if (value == null || value.trim().isEmpty()
                || !value.matches("[A-Za-z0-9._+*\\-]{1,255}")
                || value.contains("..")) {
            throw new IllegalArgumentException(label + " 非法: " + value);
        }
    }

    /** 写/删/恢复的目标必须精确：`*` 只允许出现在列表查询，不能一击清空整个仓库。 */
    static void guardExactSnapshotToken(String value, String label) {
        guardSnapshotToken(value, label);
        if (value.indexOf('*') >= 0) {
            throw new ControlPlaneGuardException(label + " 不允许通配符: " + value);
        }
    }

    /** 创建 snapshot（非阻塞，wait_for_completion=false）。body 可传 indices/include_global_state 等。 */
    public Map<String, Object> createSnapshot(String repo, String name, String bodyJson) throws IOException {
        guardExactSnapshotToken(repo, "snapshot repo");
        guardExactSnapshotToken(name, "snapshot name");
        guardControlBody(bodyJson);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT", "/_snapshot/" + repo + "/" + name + "?wait_for_completion=false");
        if (bodyJson != null && !bodyJson.trim().isEmpty()) req.setJsonEntity(bodyJson);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] createSnapshot repo={} name={} result={}", repo, name, result);
        return result;
    }

    /** 非 ADMIN 快照创建：必须显式业务 indices，禁止全量/控制面/全局状态（防把用户库/审计打包外带）。 */
    public Map<String, Object> createSnapshotGuarded(String repo, String name, String bodyJson) throws IOException {
        guardSnapshotCreateBody(bodyJson);
        guardSnapshotCreateWildcards(bodyJson);
        return createSnapshot(repo, name, bodyJson);
    }

    /** 创建快照的通配目标解析：防 logs-2026* 把后缀控制索引一起打包。 */
    void guardSnapshotCreateWildcards(String bodyJson) throws IOException {
        if (bodyJson == null || bodyJson.trim().isEmpty()) return;
        final Object indices;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(bodyJson, Map.class);
            indices = root.get("indices");
        } catch (Exception e) {
            return; // guardSnapshotCreateBody 已拒绝非法 JSON
        }
        if (indices instanceof String) {
            guardSnapshotCreateWildcard((String) indices);
        } else if (indices instanceof java.util.List) {
            for (Object one : (java.util.List<?>) indices) {
                if (one instanceof String) guardSnapshotCreateWildcard((String) one);
            }
        }
    }

    private void guardSnapshotCreateWildcard(String pattern) {
        if (pattern == null) return;
        String p = pattern.trim();
        if (p.indexOf('*') >= 0 || p.indexOf('?') >= 0) {
            guardDestructivePattern(p);
        }
    }

    /** 非 ADMIN 快照创建 body 守卫；独立方法便于单测。 */
    void guardSnapshotCreateBody(String bodyJson) {
        if (bodyJson == null || bodyJson.trim().isEmpty()) {
            throw new ControlPlaneGuardException("创建快照必须显式指定业务 indices（不允许全量快照）");
        }
        final Object indices;
        final Object globalState;
        try {
            Map<?, ?> root = OBJECT_MAPPER.readValue(bodyJson, Map.class);
            indices = root.get("indices");
            globalState = root.get("include_global_state");
        } catch (Exception e) {
            throw new IllegalArgumentException("创建快照 body 不是合法 JSON: " + e.getMessage());
        }
        if (truthy(globalState)) {
            throw new ControlPlaneGuardException("非管理员创建快照不得包含全局状态（集群配置/模板/ILM）");
        }
        if (rootContainsNonEmptyFeatureStates(bodyJson)) {
            throw new ControlPlaneGuardException("非管理员创建快照不得包含 feature_states（安全/告警等系统数据）");
        }
        if (indices == null) {
            throw new ControlPlaneGuardException("创建快照必须显式指定业务 indices（不允许全量快照）");
        }
        if (indices instanceof String) {
            String s = ((String) indices).trim();
            if (s.isEmpty()) throw new ControlPlaneGuardException("创建快照 indices 不能为空");
            guardPublicIndexPattern(s);
        } else if (indices instanceof java.util.List) {
            java.util.List<?> list = (java.util.List<?>) indices;
            if (list.isEmpty()) throw new ControlPlaneGuardException("创建快照 indices 不能为空");
            for (Object one : list) {
                if (!(one instanceof String) || ((String) one).trim().isEmpty()) {
                    throw new IllegalArgumentException("创建快照 indices 元素必须是非空字符串");
                }
                guardPublicIndexPattern((String) one);
            }
        } else {
            throw new ControlPlaneGuardException("创建快照 indices 必须是字符串或字符串数组");
        }
    }

    /** JSON 布尔兼容字符串形态（"true"）——快照 body 的 include_global_state 两种写法都认。 */
    private static boolean truthy(Object v) {
        if (Boolean.TRUE.equals(v)) return true;
        return v instanceof String && "true".equalsIgnoreCase(((String) v).trim());
    }

    private static boolean rootContainsNonEmptyFeatureStates(String bodyJson) {
        if (bodyJson == null || bodyJson.trim().isEmpty()) return false;
        try {
            Map<?, ?> root = OBJECT_MAPPER.readValue(bodyJson, Map.class);
            Object fs = root.get("feature_states");
            return fs instanceof java.util.Collection && !((java.util.Collection<?>) fs).isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    /** 非 ADMIN 快照恢复：先过控制面/全量守卫，再走正常恢复。 */
    public Map<String, Object> restoreSnapshotGuarded(String repo, String name, String bodyJson) throws IOException {
        guardRestoreBody(bodyJson);
        guardSnapshotWildcardTargets(repo, name, bodyJson);
        return restoreSnapshot(repo, name, bodyJson);
    }

    /**
     * 快照恢复的通配目标解析：{@code logs-2026*} 在集群/快照里可能命中
     * {@code logs-2026_esquerystudio_lock}（后缀型控制索引），仅看请求字面量拦不住。
     * 非 ADMIN 恢复含通配时必须先读快照元数据，逐个匹配名过精确守卫；元数据读不到即拒绝。
     */
    void guardSnapshotWildcardTargets(String repo, String name, String bodyJson) throws IOException {
        if (bodyJson == null || bodyJson.trim().isEmpty()) return;
        final Object indices;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(bodyJson, Map.class);
            indices = root.get("indices");
        } catch (Exception e) {
            return; // guardRestoreBody 已拒绝非法 JSON
        }
        java.util.List<String> patterns = new java.util.ArrayList<>();
        if (indices instanceof String) {
            patterns.addAll(snapshotPatternParts((String) indices));
        } else if (indices instanceof java.util.List) {
            for (Object one : (java.util.List<?>) indices) {
                if (one instanceof String) patterns.addAll(snapshotPatternParts((String) one));
            }
        }
        boolean anyWildcard = false;
        for (String p : patterns) {
            if (p != null && (p.indexOf('*') >= 0 || p.indexOf('?') >= 0)) { anyWildcard = true; break; }
        }
        if (!anyWildcard) return;

        java.util.List<String> snapshotIndices = new java.util.ArrayList<>();
        try {
            Map<String, Object> meta = performJson("GET",
                    "/_snapshot/" + repo + "/" + name, null);
            Object snaps = meta.get("snapshots");
            if (snaps instanceof java.util.List && !((java.util.List<?>) snaps).isEmpty()) {
                Object idx = ((Map<?, ?>) ((java.util.List<?>) snaps).get(0)).get("indices");
                if (idx instanceof java.util.List) {
                    for (Object one : (java.util.List<?>) idx) {
                        if (one instanceof String) snapshotIndices.add((String) one);
                    }
                }
            }
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception e) {
            throw new ControlPlaneGuardException("无法读取快照索引清单，已拒绝通配恢复："
                    + repo + "/" + name + "（" + e.getMessage() + "）");
        }
        for (String pattern : patterns) {
            if (pattern == null || pattern.trim().isEmpty()) continue;
            String p = pattern.trim();
            if (p.startsWith("-")) continue; /* 排除项不增加目标 */
            java.util.regex.Pattern glob = sqlGlobToRegex(p);
            for (String concrete : snapshotIndices) {
                if (glob.matcher(concrete).matches()) {
                    guardIndexName(concrete);
                }
            }
        }
    }

    /**
     * 快照 indices 的逗号展开：ES 会把 {@code "logs*,-x"} 当两个模式，
     * 逐个模式才能让通配目标真正与快照索引清单对表（排除项不增加目标）。
     */
    static java.util.List<String> snapshotPatternParts(String value) {
        java.util.List<String> out = new java.util.ArrayList<>();
        if (value == null) return out;
        for (String raw : value.split(",")) {
            String p = stripBom(raw).trim();
            if (p.isEmpty() || p.startsWith("-")) continue;
            out.add(p);
        }
        return out;
    }

    private static java.util.regex.Pattern sqlGlobToRegex(String glob) {
        StringBuilder re = new StringBuilder("^");
        for (int i = 0; i < glob.length(); i++) {
            char c = glob.charAt(i);
            if (c == '*') re.append(".*");
            else if (c == '?') re.append('.');
            else re.append(java.util.regex.Pattern.quote(String.valueOf(c)));
        }
        return java.util.regex.Pattern.compile(re.append('$').toString());
    }

    /** 恢复 snapshot（非阻塞）。body 可传 indices/rename_pattern/rename_replacement/include_global_state 等。 */
    public Map<String, Object> restoreSnapshot(String repo, String name, String bodyJson) throws IOException {
        guardExactSnapshotToken(repo, "snapshot repo");
        guardExactSnapshotToken(name, "snapshot name");
        guardControlBody(bodyJson);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", "/_snapshot/" + repo + "/" + name + "/_restore?wait_for_completion=false");
        if (bodyJson != null && !bodyJson.trim().isEmpty()) req.setJsonEntity(bodyJson);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] restoreSnapshot repo={} name={} result={}", repo, name, result);
        return result;
    }

    /**
     * 非 ADMIN 删除快照：先解析快照真实索引，含控制面/系统索引或无法证明内容时一律拒绝——
     * snapshots 页写键不能顺手清掉管理员备份的控制面数据。
     */
    public Map<String, Object> deleteSnapshotGuarded(String repo, String name) throws IOException {
        guardExactSnapshotToken(repo, "snapshot repo");
        guardExactSnapshotToken(name, "snapshot name");
        guardSnapshotDeletion(listSnapshots(repo), name);
        return deleteSnapshot(repo, name);
    }

    /** 删除前的快照内容守卫（独立方法便于不触 ES 的单测）。 */
    void guardSnapshotDeletion(java.util.List<Map<String, Object>> snapshots, String name) {
        Map<String, Object> target = null;
        if (snapshots != null) {
            for (Map<String, Object> s : snapshots) {
                if (s != null && name.equals(String.valueOf(s.get("snapshot")))) {
                    target = s;
                    break;
                }
            }
        }
        if (target == null) {
            throw new ControlPlaneGuardException("无法确认快照内容，已拒绝删除：" + name);
        }
        Object indices = target.get("indices");
        if (!(indices instanceof java.util.List) || ((java.util.List<?>) indices).isEmpty()) {
            throw new ControlPlaneGuardException("快照未返回索引清单，已拒绝删除：" + name);
        }
        for (Object idx : (java.util.List<?>) indices) {
            guardIndexName(String.valueOf(idx));
        }
    }

    /** 删除 snapshot（过期快照清理）。ADMIN 专用；非 ADMIN 走 {@link #deleteSnapshotGuarded}。 */
    public Map<String, Object> deleteSnapshot(String repo, String name) throws IOException {
        guardExactSnapshotToken(repo, "snapshot repo");
        guardExactSnapshotToken(name, "snapshot name");
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("DELETE", "/_snapshot/" + repo + "/" + name);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String respBody = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        @SuppressWarnings("unchecked")
        Map<String, Object> result = OBJECT_MAPPER.readValue(respBody, Map.class);
        logger.info("[EsIndexAdmin] deleteSnapshot repo={} name={} result={}", repo, name, result);
        return result;
    }

    /**
     * 分片分布（{@code _cat/shards}）结构化返回。
     * <p>返回 {@code [{index,shard,prirep,state,docs,storeBytes,node,ip}]}，供前端分布式拓扑 SVG 渲染。</p>
     */
    @SuppressWarnings("unchecked")
    public java.util.List<Map<String, Object>> shardsDistribution(String indexPattern) throws IOException {
        guardIndexPattern(indexPattern);
        String path = "/_cat/shards" + (indexPattern != null && !indexPattern.trim().isEmpty()
                ? "/" + java.net.URLEncoder.encode(indexPattern.trim(), "UTF-8")
                : "") + "?format=json&bytes=b&h=index,shard,prirep,state,docs,store,node,ip";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        java.util.List<Map<String, Object>> raw = OBJECT_MAPPER.readValue(body, java.util.List.class);
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>(raw.size());
        for (Map<String, Object> row : raw) {
            String idx = String.valueOf(row.get("index"));
            if (idx == null || idx.startsWith(".")) continue;
            Map<String, Object> shard = new java.util.LinkedHashMap<>();
            shard.put("index", idx);
            shard.put("shard", parseIntSafe(row.get("shard")));
            shard.put("prirep", row.get("prirep"));
            shard.put("state", row.get("state"));
            shard.put("docs", parseLongSafe(row.get("docs")));
            shard.put("storeBytes", parseLongSafe(row.get("store")));
            shard.put("node", row.get("node"));
            shard.put("ip", row.get("ip"));
            out.add(shard);
        }
        return out;
    }

    private static Integer parseIntSafe(Object o) {
        if (o == null) return null;
        try { return Integer.parseInt(o.toString()); } catch (Exception e) { return null; }
    }
    private static Long parseLongSafe(Object o) {
        if (o == null) return null;
        try { return Long.parseLong(o.toString()); } catch (Exception e) { return null; }
    }

    /* =========================================================
     * 深度产品化 - 搜索沙盒/热Setting/Reroute/ILM
     * ========================================================= */

    /**
     * DSL 沙盒：执行 _search，可启 explain、profile、高亮。
     * <p>前端传入 body。后端透传到 {@code POST /{index}/_search}。</p>
     *
     * @param index    目标索引（可空=全局）
     * @param bodyJson DSL JSON
     * @param explain  是否带 explain
     * @param profile  是否带 profile
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> searchDsl(String index, String bodyJson, boolean explain, boolean profile) throws IOException {
        if (index != null && !index.trim().isEmpty()) guardIndexPattern(index.trim());
        String path = (index == null || index.trim().isEmpty() ? "" : "/" + java.net.URLEncoder.encode(index.trim(), "UTF-8"))
                + "/_search";
        java.util.List<String> qp = new java.util.ArrayList<>();
        if (explain) qp.add("explain=true");
        /* profile 绝不能进 URL —— ES 会报 unrecognized parameter: [profile]，
           这条路径下 Profile 火焰图从来没能用过。它必须进 body，见 withProfileFlag 的说明。
           explain 留在 URL 是对的：实测它是合法的 URL 参数。 */
        if (!qp.isEmpty()) path += "?" + String.join("&", qp);
        String effectiveBody = bodyJson == null || bodyJson.trim().isEmpty() ? "{\"query\":{\"match_all\":{}}}" : bodyJson;
        guardSearchBody(effectiveBody);
        if (profile) effectiveBody = withProfileFlag(effectiveBody);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", path);
        req.setJsonEntity(effectiveBody);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 获取索引当前 settings（结合默认值，include_defaults=true）。
     */
    @SuppressWarnings("unchecked")
    /** 含默认值的 settings 读取：精确索引名 + 编码后走 raw 信封，保持前端 {status,body} 契约。 */
    public Map<String, Object> getIndexSettingsWithDefaults(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        String name = index.trim();
        guardIndexName(name);
        return raw("GET", "/" + java.net.URLEncoder.encode(name, "UTF-8")
                + "/_settings?include_defaults=true&flat_settings=true", null);
    }

    public Map<String, Object> getIndexSettings(String index) throws IOException {
        guardIndexPattern(index);
        String path = "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_settings?include_defaults=true&flat_settings=false";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 热更新索引 settings（{@code PUT /{index}/_settings}）。
     * <p>仅支持可动态变更的参数（refresh_interval, number_of_replicas, blocks.*, routing.*）；
     * static setting 需 close-open 不在此接口范围内。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> updateIndexSettings(String index, String bodyJson) throws IOException {
        if (bodyJson == null || bodyJson.trim().isEmpty()) throw new IllegalArgumentException("settings body 为空");
        guardIndexName(index);
        String path = "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_settings";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT", path);
        req.setJsonEntity(bodyJson);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 集群 reroute（手工换盘分片）。
     * <p>body 样例：
     * <pre>{"commands":[{"move":{"index":"i","shard":0,"from_node":"A","to_node":"B"}}]}</pre>
     * 支持 dry_run=true 预览。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> clusterReroute(String bodyJson, boolean dryRun, boolean explain) throws IOException {
        return clusterReroute(bodyJson, dryRun, explain, false);
    }

    /** retry_failed 走同一结构化端点（DiagView 一键重试），避免页面按钮只能借 ADMIN raw。 */
    public Map<String, Object> clusterReroute(String bodyJson, boolean dryRun, boolean explain,
                                              boolean retryFailed) throws IOException {
        guardControlBody(bodyJson);
        java.util.List<String> qp = new java.util.ArrayList<>();
        if (dryRun) qp.add("dry_run=true");
        if (explain) qp.add("explain=true");
        if (retryFailed) qp.add("retry_failed=true");
        String path = "/_cluster/reroute" + (qp.isEmpty() ? "" : "?" + String.join("&", qp));
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", path);
        req.setJsonEntity(bodyJson == null || bodyJson.trim().isEmpty() ? "{\"commands\":[]}" : bodyJson);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * ILM 策略列表（{@code GET /_ilm/policy}）。
     * <p>返回 {@code [{name, policy, version, modified_date}]} 列表化。</p>
     */
    @SuppressWarnings("unchecked")
    public java.util.List<Map<String, Object>> listIlmPolicies() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_ilm/policy");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        Map<String, Object> map = OBJECT_MAPPER.readValue(body, Map.class);
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map.Entry<String, Object> e : map.entrySet()) {
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("name", e.getKey());
            if (e.getValue() instanceof Map) row.putAll((Map<String, Object>) e.getValue());
            out.add(row);
        }
        return out;
    }

    /** PUT /_ilm/policy/{name} 创建/更新 ILM 策略（此前策略变更只能去 REST 手写 JSON）。 */
    public Map<String, Object> putIlmPolicy(String name, String bodyJson) throws IOException {
        guardControlBody(bodyJson);
        return performJson("PUT", "/_ilm/policy/" + java.net.URLEncoder.encode(name, "UTF-8"), bodyJson);
    }

    /** DELETE /_ilm/policy/{name} 删除 ILM 策略。 */
    public Map<String, Object> deleteIlmPolicy(String name) throws IOException {
        return performJson("DELETE", "/_ilm/policy/" + java.net.URLEncoder.encode(name, "UTF-8"), null);
    }

    /**
     * 索引 ILM explain（{@code GET /{index}/_ilm/explain}）。
     * <p>列出当前 phase / action / step 以及 step_info。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> explainIlm(String index) throws IOException {
        guardIndexPattern(index);
        String path = "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_ilm/explain";
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /* ================================================================
     * 深度产品化 - Cluster Settings / Task Manager /
     *      Shard Stores / Snapshot Status / Reindex Preview
     * ================================================================ */

    /**
     * 集群级设置全景（{@code GET /_cluster/settings?include_defaults=true&flat_settings=false}）。
     * <p>返回三层：{@code persistent} / {@code transient} / {@code defaults}。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getClusterSettings() throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                "GET", "/_cluster/settings?include_defaults=true&flat_settings=false");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 集群级设置下发（{@code PUT /_cluster/settings}）。
     * <p>bodyJson 需包含 {@code persistent} 和/或 {@code transient} 两层。传 {@code null} 将重置到默认。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> putClusterSettings(String bodyJson) throws IOException {
        guardControlBody(bodyJson);
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("PUT", "/_cluster/settings");
        req.setJsonEntity(bodyJson == null || bodyJson.trim().isEmpty() ? "{}" : bodyJson);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 分片存储分布（{@code GET /{index}/_shard_stores}），支持 {@code status=red,yellow} 过滤。
     * <p>返回每个 shard 在哪些 node 上有副本及其健康状态，用于定位失联/丢失分片。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> shardStores(String index, String status) throws IOException {
        StringBuilder path = new StringBuilder();
        if (index != null && !index.trim().isEmpty()) {
            guardIndexPattern(index.trim());
            path.append('/').append(java.net.URLEncoder.encode(index.trim(), "UTF-8"));
        }
        path.append("/_shard_stores");
        if (status != null && !status.trim().isEmpty()) path.append("?status=").append(status.trim());
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path.toString());
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        Map<String, Object> parsed = OBJECT_MAPPER.readValue(body, Map.class);
        /* 全量视图按索引名脱敏：控制面索引分片信息不下发给通用数据面。 */
        Object indices = parsed.get("indices");
        if (indices instanceof Map) {
            Map<String, Object> filtered = new java.util.LinkedHashMap<>();
            for (Map.Entry<?, ?> e : ((Map<?, ?>) indices).entrySet()) {
                if (!isControlIndexName(String.valueOf(e.getKey()))) filtered.put(String.valueOf(e.getKey()), e.getValue());
            }
            parsed.put("indices", filtered);
        }
        return parsed;
    }

    /**
     * 快照进度详情（{@code GET /_snapshot/{repo}/{name}/_status}）。
     * <p>较 GET /_snapshot/{repo}/{name} 多出实时进度（started_at / stats / shards）。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> snapshotStatus(String repo, String name) throws IOException {
        String path;
        if (repo == null || repo.trim().isEmpty()) {
            path = "/_snapshot/_status";
        } else if (name == null || name.trim().isEmpty()) {
            path = "/_snapshot/" + java.net.URLEncoder.encode(repo.trim(), "UTF-8") + "/_current/_status";
        } else {
            path = "/_snapshot/" + java.net.URLEncoder.encode(repo.trim(), "UTF-8")
                    + "/" + java.net.URLEncoder.encode(name.trim(), "UTF-8") + "/_status";
        }
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", path);
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * 快照进度归一化摘要：与 {@link #snapshotStatus(String, String)} 同请求路径、同 client 通道，
     * 只是把原始深层体（{@code snapshots[0].indices.<name>.shards.<n>.stage}）压平成前端可直接渲染的
     * 聚合视图（见 {@link #normalizeSnapshotStatus(Map, String, String)}）。
     * <p>控制台经 {@code GET internal/es/index/cluster/snapshot/status?summary=true} 分派到本方法；
     * 缺省端点仍走 {@link #snapshotStatus(String, String)} 原始透传，零破坏兼容。</p>
     */
    public Map<String, Object> snapshotStatusSummary(String repo, String name) throws IOException {
        return normalizeSnapshotStatus(snapshotStatus(repo, name), repo, name);
    }

    /**
     * 快照 _status 归一化（纯静态、无 IO、容错优先——缺字段/类型不符/null 一律按 0/空集合兜底，不抛异常）。
     * <p>输出形状：</p>
     * <pre>{ repository, snapshot, state, startTimeMillis,
     *   shardsStats: { total, done, failed },   // 快照级：优先取体内 shards_stats，缺失时回退为逐索引聚合
     *   pct,                                    // done/total*100 四舍五入，total=0 记 0
     *   indices: [ { index, shardsTotal, shardsDone, shardsFailed,
     *                stageCounts: { INIT, STARTED, START, FINALIZE, DONE, FAILURE } } ] }</pre>
     * <p>indices 保持原始响应顺序；shardsTotal/Done/Failed 与 stageCounts 均按逐分片 stage 计数
     * （shards 为 ES 实际形状——按分片号 keyed 的对象，List 形状一并兼容）。六个 stage 键恒存在（0 兜底），
     * 未知 stage 按原样追加计数键；体内自带 repository/snapshot 时以体内为准。</p>
     *
     * @param raw        {@code GET /_snapshot/{repo}/{name}/_status} 原始响应（可为 null）
     * @param repository 请求参数仓库名；体内缺 repository 时兜底
     * @param snapshot   请求参数快照名；体内缺 snapshot 时兜底
     */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> normalizeSnapshotStatus(Map<String, Object> raw, String repository, String snapshot) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        String repoName = repository == null ? "" : repository.trim();
        String snapName = snapshot == null ? "" : snapshot.trim();
        String state = "";
        long startTimeMillis = 0L;
        long total = 0L;
        long done = 0L;
        long failed = 0L;
        java.util.List<Map<String, Object>> indices = new java.util.ArrayList<>();
        if (raw != null && raw.get("snapshots") instanceof java.util.List) {
            java.util.List<?> snapshots = (java.util.List<?>) raw.get("snapshots");
            if (!snapshots.isEmpty() && snapshots.get(0) instanceof Map) {
                Map<String, Object> snap = (Map<String, Object>) snapshots.get(0);
                repoName = firstNonBlank(stringOf(snap.get("repository")), repoName);
                snapName = firstNonBlank(stringOf(snap.get("snapshot")), snapName);
                state = stringOf(snap.get("state"));
                Long stm = asLong(snap.get("start_time_millis"));
                if (stm != null) startTimeMillis = stm;
                Map<String, Object> snapShardsStats = asObjectMap(snap.get("shards_stats"));
                if (snapShardsStats != null) {
                    total = orZero(asLong(snapShardsStats.get("total")));
                    done = orZero(asLong(snapShardsStats.get("done")));
                    failed = orZero(asLong(snapShardsStats.get("failed")));
                }
                Map<String, Object> idxMap = asObjectMap(snap.get("indices"));
                if (idxMap != null) {
                    for (Map.Entry<String, Object> e : idxMap.entrySet()) {
                        if (!(e.getValue() instanceof Map)) continue;
                        indices.add(normalizeSnapshotIndexStatus(e.getKey(), (Map<String, Object>) e.getValue()));
                    }
                }
                if (snapShardsStats == null && !indices.isEmpty()) {
                    /* 快照级 shards_stats 缺失：回退为逐索引聚合，保证 shardsStats 与 indices 自洽 */
                    for (Map<String, Object> idx : indices) {
                        total += orZero(asLong(idx.get("shardsTotal")));
                        done += orZero(asLong(idx.get("shardsDone")));
                        failed += orZero(asLong(idx.get("shardsFailed")));
                    }
                }
            }
        }
        out.put("repository", repoName);
        out.put("snapshot", snapName);
        out.put("state", state);
        out.put("startTimeMillis", startTimeMillis);
        Map<String, Object> shardsStats = new java.util.LinkedHashMap<>();
        shardsStats.put("total", total);
        shardsStats.put("done", done);
        shardsStats.put("failed", failed);
        out.put("shardsStats", shardsStats);
        out.put("pct", total <= 0L ? 0L : Math.round(done * 100.0d / total));
        out.put("indices", indices);
        return out;
    }

    /**
     * 单索引快照进度归一化：逐分片按 stage 计数（缺 shards / 缺 stage 按 0 兜底）。
     */
    private static Map<String, Object> normalizeSnapshotIndexStatus(String index, Map<String, Object> idx) {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("index", index);
        Map<String, Object> stageCounts = new java.util.LinkedHashMap<>();
        stageCounts.put("INIT", 0L);
        stageCounts.put("STARTED", 0L);
        stageCounts.put("START", 0L);
        stageCounts.put("FINALIZE", 0L);
        stageCounts.put("DONE", 0L);
        stageCounts.put("FAILURE", 0L);
        long shardsTotal = countShardsByStage(idx.get("shards"), stageCounts);
        out.put("shardsTotal", shardsTotal);
        out.put("shardsDone", stageCounts.get("DONE"));
        out.put("shardsFailed", stageCounts.get("FAILURE"));
        out.put("stageCounts", stageCounts);
        return out;
    }

    /**
     * 逐分片按 stage 计数并累计总数：shards 兼容对象（ES 实际形状，按分片号 keyed）与数组两种形状；
     * 未知 stage 按原样追加键，缺 stage 的分片只计入总数。返回分片总数。
     */
    private static long countShardsByStage(Object shardsObj, Map<String, Object> stageCounts) {
        java.util.Collection<?> shards = null;
        if (shardsObj instanceof Map) {
            shards = ((Map<?, ?>) shardsObj).values();
        } else if (shardsObj instanceof java.util.List) {
            shards = (java.util.List<?>) shardsObj;
        }
        if (shards == null) {
            return 0L;
        }
        long total = 0L;
        for (Object v : shards) {
            if (!(v instanceof Map)) continue;
            total++;
            String stage = stringOf(((Map<?, ?>) v).get("stage"));
            if (stage.isEmpty()) continue;
            Object prev = stageCounts.get(stage);
            stageCounts.put(stage, (prev instanceof Number ? ((Number) prev).longValue() : 0L) + 1L);
        }
        return total;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asObjectMap(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : null;
    }

    /** Object → 去空白 String，非 String 一律空串（缺字段兜底）。 */
    private static String stringOf(Object o) {
        return o instanceof String ? ((String) o).trim() : "";
    }

    /** 取第一个非空白串（体内值优先于请求参数兜底）。 */
    private static String firstNonBlank(String a, String b) {
        return a != null && !a.isEmpty() ? a : b;
    }

    private static long orZero(Long v) {
        return v == null ? 0L : v;
    }

    /**
     * 单任务详情（{@code GET /_tasks/{taskId}}），包含 description / status.total / running_time_in_nanos。
     * <p>{@code waitForCompletion=false} 即时返回，只看当前快照。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> taskDetail(String taskId) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(
                "GET", "/_tasks/" + java.net.URLEncoder.encode(taskId, "UTF-8") + "?wait_for_completion=false");
        org.elasticsearch.client.Response resp = performGuarded(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /**
     * Reindex 预估：对 source 跑 {@code POST /{src}/_count?body=query} 获 doc 数，再
     * 取 {@code GET /{src}/_stats/store} 获 primary size，经验公式估算目标索引将写入的 doc 数与 size。
     * <p>完全不写任何数据，安全。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> reindexPreview(String source, String queryJson) throws IOException {
        guardIndexPattern(source);
        guardSearchBody(queryJson);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        String enc = java.net.URLEncoder.encode(source, "UTF-8");
        /* 1) count with optional query */
        org.elasticsearch.client.Request cnt = new org.elasticsearch.client.Request("POST", "/" + enc + "/_count");
        cnt.setJsonEntity(queryJson == null || queryJson.trim().isEmpty() ? "{\"query\":{\"match_all\":{}}}" : queryJson);
        org.elasticsearch.client.Response cntResp = performGuarded(cnt);
        Map<String, Object> cntMap = OBJECT_MAPPER.readValue(
                org.apache.http.util.EntityUtils.toString(cntResp.getEntity()), Map.class);
        long docs = ((Number) cntMap.getOrDefault("count", 0)).longValue();
        out.put("docs", docs);

        /* 2) primary store size + total docs */
        org.elasticsearch.client.Request st = new org.elasticsearch.client.Request(
                "GET", "/" + enc + "/_stats/store,docs");
        org.elasticsearch.client.Response stResp = performGuarded(st);
        Map<String, Object> stMap = OBJECT_MAPPER.readValue(
                org.apache.http.util.EntityUtils.toString(stResp.getEntity()), Map.class);
        long totalDocs = 0L;
        long primaryBytes = 0L;
        Object indicesObj = stMap.get("indices");
        if (indicesObj instanceof Map) {
            for (Object v : ((Map<String, Object>) indicesObj).values()) {
                if (!(v instanceof Map)) continue;
                Map<String, Object> ent = (Map<String, Object>) v;
                Object primaries = ent.get("primaries");
                if (primaries instanceof Map) {
                    Map<String, Object> pri = (Map<String, Object>) primaries;
                    Object docsBlk = pri.get("docs");
                    if (docsBlk instanceof Map) {
                        Object c = ((Map<String, Object>) docsBlk).get("count");
                        if (c instanceof Number) totalDocs += ((Number) c).longValue();
                    }
                    Object storeBlk = pri.get("store");
                    if (storeBlk instanceof Map) {
                        Object sib = ((Map<String, Object>) storeBlk).get("size_in_bytes");
                        if (sib instanceof Number) primaryBytes += ((Number) sib).longValue();
                    }
                }
            }
        }
        out.put("sourceTotalDocs", totalDocs);
        out.put("sourcePrimaryBytes", primaryBytes);
        double avg = totalDocs > 0 ? (double) primaryBytes / (double) totalDocs : 0.0;
        out.put("avgDocBytes", avg);
        out.put("estimatedTargetBytes", Math.round(avg * docs));
        return out;
    }

    /* ================================================================
     * 一键综合体检 healthReport
     * ================================================================ */

    /**
     * 一键集群体检：聚合 cluster/health + 不健康索引 + pending tasks + 节点负载，
     * 打分并产出固定结构报告（前端可直接渲染 / 导出 Markdown）。
     * <p>评分规则：初始 100 分，每项 critical -25、warn -10、info 不扣，min 0。</p>
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> healthReport() throws IOException {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("generatedAt", java.time.OffsetDateTime.now().toString());
        java.util.List<Map<String, Object>> checks = new java.util.ArrayList<>();
        int score = 100;

        /* 1) cluster/health
            信噪比：按「根因」计罚一次，不再让同一件事（yellow=副本未分配）在
           cluster.status / shards.unassigned / indices.yellow 三处重复扣分把常态打成「严重问题」。
           且区分 red（主分片不可用=事故）与 yellow（副本未分配）：单数据节点集群任何 rep>=1
           的索引恒 yellow，属拓扑常态而非异常，只提示不扣分。 */
        Map<String, Object> ch = performJson("GET", "/_cluster/health", null);
        out.put("clusterHealth", ch);
        String status = String.valueOf(ch.getOrDefault("status", "unknown"));
        int dataNodes = intOf(ch.get("number_of_data_nodes"));
        boolean singleDataNode = dataNodes <= 1;
        boolean red = "red".equalsIgnoreCase(status);
        boolean yellow = "yellow".equalsIgnoreCase(status);
        if (red) {
            checks.add(check("critical", "cluster.status", "集群状态 RED，存在不可用主分片（数据面事故，立即处置）", null));
            score -= 40;
        } else if (yellow && !singleDataNode) {
            checks.add(check("warn", "cluster.status", "集群状态 YELLOW，副本分片未分配（多节点集群应排查：节点掉线/磁盘水位/分配规则）", null));
            score -= 20;
        } else if (yellow) {
            checks.add(check("info", "cluster.status",
                    "集群状态 YELLOW：单数据节点无法放置副本分片（拓扑常态，非异常）；如需 GREEN 可将索引副本数调为 0", null));
        } else {
            checks.add(check("info", "cluster.status", "集群状态 GREEN", null));
        }
        int unassigned = intOf(ch.get("unassigned_shards"));
        int initializing = intOf(ch.get("initializing_shards"));
        int relocating = intOf(ch.get("relocating_shards"));
        int pending = intOf(ch.get("number_of_pending_tasks"));
        long queueWaitMs = longOf(ch.get("task_max_waiting_in_queue_millis"));
        if (unassigned > 0) {
            /* 未分配数是 status 的细化说明，不再独立扣分（根因已计罚一次） */
            if (red) {
                checks.add(check("critical", "shards.unassigned", unassigned + " 个分片未分配（含主分片）", null));
            } else if (singleDataNode) {
                checks.add(check("info", "shards.unassigned", unassigned + " 个副本分片未分配（单数据节点无处放置副本，常态）", null));
            } else {
                checks.add(check("warn", "shards.unassigned", unassigned + " 个副本分片未分配", null));
            }
        }
        if (initializing > 0) {
            checks.add(check("info", "shards.initializing", initializing + " 个分片初始化中", null));
        }
        if (relocating > 0) {
            checks.add(check("info", "shards.relocating", relocating + " 个分片重定位中", null));
        }
        if (pending > 0) {
            String lvl = pending > 20 ? "critical" : "warn";
            checks.add(check(lvl, "pending.tasks", pending + " 个 pending task", null));
            score -= "critical".equals(lvl) ? 25 : 10;
        }
        if (queueWaitMs > 30_000L) {
            checks.add(check("warn", "queue.wait", "任务队列最大等待 " + (queueWaitMs / 1000) + "s", null));
            score -= 10;
        }

        /* 2) 不健康索引列表（部分发行版 _cat/indices 的 health 参数不支持逗号多值→拉全量后代码侧过滤） */
        java.util.List<Map<String, Object>> allIdx = performJsonArray(
                "GET", "/_cat/indices?format=json&h=index,health,pri,rep,docs.count,store.size");
        java.util.List<Map<String, Object>> unhealthy = new java.util.ArrayList<>();
        for (Map<String, Object> m : allIdx) {
            if (isControlIndexName(String.valueOf(m.get("index")))) continue;
            String h = String.valueOf(m.get("health"));
            if ("red".equalsIgnoreCase(h) || "yellow".equalsIgnoreCase(h)) unhealthy.add(m);
        }
        out.put("unhealthyIndices", unhealthy);
        if (!unhealthy.isEmpty()) {
            long reds = unhealthy.stream().filter(m -> "red".equalsIgnoreCase(String.valueOf(m.get("health")))).count();
            long yellows = unhealthy.size() - reds;
            /* 索引级红黄就是集群 status 的构成因子，列表供定位，不再叠加扣分 */
            if (reds > 0) {
                checks.add(check("critical", "indices.red", reds + " 个索引 RED（主分片不可用，见下方清单）", null));
            }
            if (yellows > 0) {
                checks.add(check(singleDataNode ? "info" : "warn", "indices.yellow",
                        yellows + " 个索引 YELLOW（副本未分配" + (singleDataNode ? "，单数据节点常态" : "") + "）", null));
            }
        } else {
            checks.add(check("info", "indices.health", "全部索引 GREEN", null));
        }

        /* 3) allocation explain（仅在有未分配时） */
        if (unassigned > 0) {
            try {
                Map<String, Object> exp = performJson("POST", "/_cluster/allocation/explain", "{}");
                out.put("allocationExplain", exp);
                Object canAlloc = exp.get("can_allocate");
                if (canAlloc != null) {
                    checks.add(check("info", "allocation.explain",
                            "can_allocate=" + canAlloc, null));
                }
            } catch (IOException | ControlPlaneGuardException ignored) {
                /* 无内容时 ES 会 400；选中控制面索引时守卫拒绝——体检报告跳过该项而不是整体失败 */
            }
        }

        /* 4) pending tasks 详情 */
        try {
            Map<String, Object> pt = performJson("GET", "/_cluster/pending_tasks", null);
            out.put("pendingTasks", pt.getOrDefault("tasks", java.util.Collections.emptyList()));
        } catch (IOException e) {
            // 原裸 ignored{} 整段静默——pending 面失明时报告只显示「没有
            // pending task」，与集群真没任务无法区分。错误键与同方法 mappingsError/
            // settingsError/docCountError/aliasesError 兄弟键齐平；报告照常返回契约不变
            out.put("pendingTasksError", e.getMessage());
        }

        /* 5) 节点负载 */
        java.util.List<Map<String, Object>> nodes = performJsonArray(
                "GET", "/_cat/nodes?format=json&h=name,heap.percent,cpu,load_1m,disk.used_percent,ram.percent");
        out.put("nodes", nodes);
        int hotHeap = 0, hotDisk = 0, hotCpu = 0;
        for (Map<String, Object> n : nodes) {
            if (intOf(n.get("heap.percent")) >= 85) hotHeap++;
            if (intOf(n.get("disk.used_percent")) >= 85) hotDisk++;
            if (intOf(n.get("cpu")) >= 90) hotCpu++;
        }
        if (hotHeap > 0) { checks.add(check("warn", "nodes.heap", hotHeap + " 个节点 heap>=85%", null)); score -= 10; }
        if (hotDisk > 0) { checks.add(check("critical", "nodes.disk", hotDisk + " 个节点磁盘>=85%", null)); score -= 25; }
        if (hotCpu > 0) { checks.add(check("warn", "nodes.cpu", hotCpu + " 个节点 CPU>=90%", null)); score -= 10; }

        out.put("score", Math.max(0, score));
        out.put("checks", checks);
        Map<String, Object> summary = new java.util.LinkedHashMap<>();
        summary.put("status", status);
        summary.put("unassigned", unassigned);
        summary.put("initializing", initializing);
        summary.put("relocating", relocating);
        summary.put("pending", pending);
        summary.put("unhealthyIndices", unhealthy.size());
        summary.put("nodes", nodes.size());
        summary.put("hotNodes", hotHeap + hotDisk + hotCpu);
        out.put("summary", summary);
        return out;
    }

    private Map<String, Object> check(String level, String name, String message, Map<String, Object> details) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("level", level);
        m.put("name", name);
        m.put("message", message);
        if (details != null) m.put("details", details);
        return m;
    }
    @SuppressWarnings("unchecked")
    private Map<String, Object> performJson(String method, String path, String body) throws IOException {
        return performJson(method, path, body, false);
    }
    /** trustedControl=true 仅限系统页专用读（锁索引由装配处注入）：走 ADMIN 逃生通道，通用守卫仍拒绝该名。 */
    private Map<String, Object> performJson(String method, String path, String body, boolean trustedControl) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(method, path);
        if (body != null) req.setJsonEntity(body);
        org.elasticsearch.client.Response resp = trustedControl ? performUnguarded(req) : performGuarded(req);
        return OBJECT_MAPPER.readValue(org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
    }
    @SuppressWarnings("unchecked")
    private java.util.List<Map<String, Object>> performJsonArray(String method, String path) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request(method, path);
        org.elasticsearch.client.Response resp = performGuarded(req);
        return OBJECT_MAPPER.readValue(org.apache.http.util.EntityUtils.toString(resp.getEntity()), java.util.List.class);
    }
    private int intOf(Object v) {
        if (v instanceof Number) return ((Number) v).intValue();
        if (v instanceof String) {
            try { return Integer.parseInt((String) v); }
            catch (Exception e) {
                // 伪 0 兜底此前与合法 0 静默合流（解析失败不可见）——debug 留痕，返回值语义零变
                logger.debug("[EsIndexAdmin] intOf 解析失败按 0 兜底：{}: {}", e.getClass().getSimpleName(), e.getMessage());
                return 0;
            }
        }
        return 0;
    }
    private long longOf(Object v) {
        if (v instanceof Number) return ((Number) v).longValue();
        if (v instanceof String) {
            try { return Long.parseLong((String) v); }
            catch (Exception e) {
                // 同 intOf——debug 留痕，伪 0 兜底语义零变
                logger.debug("[EsIndexAdmin] longOf 解析失败按 0 兜底：{}: {}", e.getClass().getSimpleName(), e.getMessage());
                return 0L;
            }
        }
        return 0L;
    }

    /* ======== ：分布式运维 - SLM / Watcher / Remote Clusters ======== */

    /** SLM 快照策略列表（含最近执行时间/下次执行时间/统计）。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> slmPolicies() throws IOException {
        try {
            return performJson("GET", "/_slm/policy", null);
        } catch (Exception ex) {
            Map<String, Object> fallback = new java.util.LinkedHashMap<>();
            fallback.put("available", false);
            fallback.put("reason", ex.getMessage());
            fallback.put("policies", java.util.Collections.emptyMap());
            return fallback;
        }
    }

    /** SLM 立即执行某策略（业务侧手动兜底）。 */
    public Map<String, Object> slmExecute(String policyId) throws IOException {
        guardPathToken(policyId, "SLM 策略");
        return performJson("POST", "/_slm/policy/" + encodePathSegment(policyId) + "/_execute", null);
    }

    /** SLM 汇总状态（运行/停用/统计）。 */
    public Map<String, Object> slmStatus() throws IOException {
        try {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("status", performJson("GET", "/_slm/status", null));
            out.put("stats", performJson("GET", "/_slm/stats", null));
            return out;
        } catch (Exception ex) {
            Map<String, Object> fallback = new java.util.LinkedHashMap<>();
            fallback.put("available", false);
            fallback.put("reason", ex.getMessage());
            return fallback;
        }
    }

    /** Watcher 列表（仅 Elastic 版本商业授权可用，未启用时返回 available=false）。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> watcherList() throws IOException {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        try {
            Map<String, Object> stats = performJson("GET", "/_watcher/stats", null);
            out.put("available", true);
            out.put("stats", stats);
            /* 尝试通过 .watches 索引读取列表，失败则忽略。 */
            try {
                Map<String, Object> body = new java.util.LinkedHashMap<>();
                body.put("size", 200);
                body.put("_source", new String[]{"metadata", "trigger", "actions"});
                Map<String, Object> hits = performJson("POST", "/.watches/_search", OBJECT_MAPPER.writeValueAsString(body));
                out.put("watches", hits);
            } catch (Exception ignore) {
                /* .watches 子查询失败升 WARN + 回填 reason（原静默置空）——
                 * 「没配任何 watch」与「.watches 索引读失败」须可分辨（.watches 不存在的 404
                 * 也走此路径，WARN 即「列表为空的原因留痕」）；低频（仅 Watcher 面板打开触发），
                 * 单条 WARN 不刷屏。字段名照抄本方法外层 catch 的 reason 形态。 */
                logger.warn("[EsIndexAdmin] .watches 列表读取失败，watches 置空（watcher 主体统计不受影响）: {}",
                        ignore.getMessage(), ignore);
                out.put("watches", java.util.Collections.emptyMap());
                out.put("reason", ignore.getMessage());
            }
        } catch (Exception ex) {
            out.put("available", false);
            out.put("reason", ex.getMessage());
        }
        return out;
    }

    /** 远程集群配置 + 连接状态（CCS/CCR 依赖）。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> remoteClusters() throws IOException {
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        try {
            Map<String, Object> info = performJson("GET", "/_remote/info", null);
            out.put("remotes", info);
            /* 若没有配置任何远端，也返回一个空 map 保证前端渲染 */
            if (info == null || info.isEmpty()) {
                out.put("count", 0);
            } else {
                out.put("count", info.size());
            }
        } catch (Exception ex) {
            out.put("remotes", java.util.Collections.emptyMap());
            out.put("count", 0);
            out.put("reason", ex.getMessage());
        }
        /* 附带集群自身 name，用于前端展示 local vs remote */
        try {
            Map<String, Object> self = performJson("GET", "/", null);
            out.put("localClusterName", self.get("cluster_name"));
            out.put("localVersion", self.get("version"));
        } catch (Exception ex) {
            /* 本端信息失败升 WARN 留痕（原 catch (ignored) 完全空体）——远端列表
             * 正常而本端 name/version 静默缺列时无从排查。只加日志、不动返回结构：
             * remotes/count/localClusterName 形态是前端 RemoteClustersView 消费面，禁改。 */
            logger.warn("[EsIndexAdmin] remoteClusters 本端信息（GET /）读取失败，localClusterName/localVersion 缺省: {}",
                    ex.getMessage(), ex);
        }
        return out;
    }

    /* ======== ➕ /  自定义化扩展 ======== */

    /**
     * 高级 Reindex——完全自定义。
     * body 自由（可含 source.remote / source.query / dest.pipeline / script / conflicts 等），opts 支持
     * slices / refresh / wait_for_completion / requests_per_second / scroll / timeout / wait_for_active_shards。
     * 不强制幂等、不预检、不校验存在性。高级用户模式。
     */
    public Map<String, Object> reindexAdvanced(String body, Map<String, String> opts) throws IOException {
        if (body == null || body.trim().isEmpty()) {
            throw new IllegalArgumentException("reindex body 不能为空，至少包含 source.index / dest.index");
        }
        guardReindexBody(body);
        /* 页面写键持有人也不能借 reindex 的 remote 源做 SSRF/读取内网凭据 */
        guardReindexRemote(body);
        Map<String, String> o = opts == null ? java.util.Collections.emptyMap() : opts;
        StringBuilder path = new StringBuilder("/_reindex");
        java.util.List<String> qs = new java.util.ArrayList<>();
        addQ(qs, "slices", o.get("slices"));
        addQ(qs, "refresh", o.get("refresh"));
        addQ(qs, "wait_for_completion", o.get("waitForCompletion"));
        addQ(qs, "requests_per_second", o.get("requestsPerSecond"));
        addQ(qs, "scroll", o.get("scroll"));
        addQ(qs, "timeout", o.get("timeout"));
        addQ(qs, "wait_for_active_shards", o.get("waitForActiveShards"));
        if (!qs.isEmpty()) path.append('?').append(String.join("&", qs));
        Map<String, Object> resp = performJson("POST", path.toString(), body);
        Map<String, Object> out = new java.util.LinkedHashMap<>(resp);
        Object t = resp.get("task");
        if (t != null) out.put("taskId", String.valueOf(t));
        out.put("finalPath", path.toString());
        return out;
    }

    /** _update_by_query —— 按 query 批量更新。body: {query, script?}。opts 同 reindex。 */
    public Map<String, Object> updateByQuery(String indexPattern, String body, Map<String, String> opts) throws IOException {
        if (indexPattern == null || indexPattern.trim().isEmpty()) throw new IllegalArgumentException("indexPattern 不能为空");
        guardDestructivePattern(indexPattern);
        guardSearchBody(body);
        guardUpdateByQueryScript(body);
        Map<String, String> o = opts == null ? java.util.Collections.emptyMap() : opts;
        guardPipelineRef(o.get("pipeline"));
        StringBuilder path = new StringBuilder("/").append(indexPattern).append("/_update_by_query");
        java.util.List<String> qs = new java.util.ArrayList<>();
        addQ(qs, "conflicts", o.get("conflicts"));
        addQ(qs, "slices", o.get("slices"));
        addQ(qs, "refresh", o.get("refresh"));
        addQ(qs, "wait_for_completion", o.get("waitForCompletion"));
        addQ(qs, "requests_per_second", o.get("requestsPerSecond"));
        addQ(qs, "scroll", o.get("scroll"));
        addQ(qs, "timeout", o.get("timeout"));
        addQ(qs, "wait_for_active_shards", o.get("waitForActiveShards"));
        addQ(qs, "max_docs", o.get("maxDocs"));
        if (!qs.isEmpty()) path.append('?').append(String.join("&", qs));
        Map<String, Object> resp = performJson("POST", path.toString(), body == null || body.trim().isEmpty() ? "{\"query\":{\"match_all\":{}}}" : body);
        Map<String, Object> out = new java.util.LinkedHashMap<>(resp);
        Object t = resp.get("task");
        if (t != null) out.put("taskId", String.valueOf(t));
        out.put("finalPath", path.toString());
        return out;
    }

    /** _delete_by_query —— 按 query 批量删除。 */
    public Map<String, Object> deleteByQuery(String indexPattern, String body, Map<String, String> opts) throws IOException {
        if (indexPattern == null || indexPattern.trim().isEmpty()) throw new IllegalArgumentException("indexPattern 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("delete_by_query body 不能为空，必须显式 query（防误删）");
        guardDestructivePattern(indexPattern);
        guardSearchBody(body);
        Map<String, String> o = opts == null ? java.util.Collections.emptyMap() : opts;
        guardPipelineRef(o.get("pipeline"));
        StringBuilder path = new StringBuilder("/").append(indexPattern).append("/_delete_by_query");
        java.util.List<String> qs = new java.util.ArrayList<>();
        addQ(qs, "conflicts", o.get("conflicts"));
        addQ(qs, "slices", o.get("slices"));
        addQ(qs, "refresh", o.get("refresh"));
        addQ(qs, "wait_for_completion", o.get("waitForCompletion"));
        addQ(qs, "requests_per_second", o.get("requestsPerSecond"));
        addQ(qs, "scroll", o.get("scroll"));
        addQ(qs, "timeout", o.get("timeout"));
        addQ(qs, "max_docs", o.get("maxDocs"));
        if (!qs.isEmpty()) path.append('?').append(String.join("&", qs));
        Map<String, Object> resp = performJson("POST", path.toString(), body);
        Map<String, Object> out = new java.util.LinkedHashMap<>(resp);
        Object t = resp.get("task");
        if (t != null) out.put("taskId", String.valueOf(t));
        out.put("finalPath", path.toString());
        return out;
    }

    /**
     * _bulk 直接下发，完全自定义。body 必须已经是 NDJSON（行尾换行）。
     * 前端已确保结尾添加换行，后端只作轻量健全。
     */
    public Map<String, Object> bulk(String indexOrNull, String ndjson, Map<String, String> opts) throws IOException {
        if (ndjson == null || ndjson.trim().isEmpty()) throw new IllegalArgumentException("bulk body 不能为空");
        if (indexOrNull != null && !indexOrNull.trim().isEmpty()) guardIndexPattern(indexOrNull);
        guardControlBody(ndjson);
        /* 逐行动作行的 _index 也要过守卫：仅靠字面扫描拦不住 .security/.watches/通配形态。 */
        guardBulkBody(ndjson);
        Map<String, String> o = opts == null ? java.util.Collections.emptyMap() : opts;
        guardPipelineRef(o.get("pipeline"));
        if (!ndjson.endsWith("\n")) ndjson = ndjson + "\n";
        StringBuilder path = new StringBuilder();
        if (indexOrNull != null && !indexOrNull.trim().isEmpty()) path.append('/').append(indexOrNull);
        path.append("/_bulk");
        java.util.List<String> qs = new java.util.ArrayList<>();
        addQ(qs, "refresh", o.get("refresh"));
        addQ(qs, "pipeline", o.get("pipeline"));
        addQ(qs, "timeout", o.get("timeout"));
        addQ(qs, "wait_for_active_shards", o.get("waitForActiveShards"));
        if (!qs.isEmpty()) path.append('?').append(String.join("&", qs));
        /* 6.x bulk action 行强制要求 _type，7.x 形态 NDJSON（无 _type）会整请求 400——版本感知注入；
         * 版本未探到时首发 400 type is missing 再注入重试一次兜底（400 表示整请求被拒未执行，重试安全） */
        io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter r = clientRouter;
        String version = r == null ? null : r.currentEsVersion();
        if (io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps.requiresMappingType(version)) {
            ndjson = legacyBulkNdjson(indexOrNull, ndjson, this::legacyMappingType);
        }
        Map<String, Object> raw;
        try {
            raw = doBulkRequest(path.toString(), ndjson);
        } catch (org.elasticsearch.client.ResponseException e) {
            boolean typeMissing = e.getResponse().getStatusLine().getStatusCode() == 400
                    && String.valueOf(e.getMessage()).contains("type is missing");
            if (!typeMissing) throw e;
            logger.info("[EsIndexAdmin] bulk typeless 400（目标疑似 6.x），action 行注入 _type 重试");
            raw = doBulkRequest(path.toString(), legacyBulkNdjson(indexOrNull, ndjson, this::legacyMappingType));
        }
        /* 提取概要，方便前端直接 toast */
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("took", raw.get("took"));
        out.put("errors", raw.get("errors"));
        java.util.List<Map<String,Object>> items = (java.util.List<Map<String,Object>>) raw.getOrDefault("items", java.util.Collections.emptyList());
        int ok = 0, err = 0;
        java.util.List<Map<String,Object>> failed = new java.util.ArrayList<>();
        for (Map<String,Object> it : items) {
            Map<String,Object> op = it.values().stream().findFirst().map(v -> (Map<String,Object>) v).orElse(null);
            if (op == null) continue;
            Integer status = op.get("status") instanceof Number ? ((Number) op.get("status")).intValue() : null;
            if (status != null && status < 300) ok++;
            else { err++; if (failed.size() < 20) failed.add(op); }
        }
        out.put("okCount", ok);
        out.put("errCount", err);
        out.put("total", items.size());
        out.put("failedSample", failed);
        out.put("finalPath", path.toString());
        return out;
    }

    private Map<String, Object> doBulkRequest(String path, String ndjson) throws IOException {
        org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("POST", path);
        /* ContentType 不能带 charset——6.x 严格校验拒收 "application/x-ndjson; charset=UTF-8"（406） */
        req.setEntity(new org.apache.http.entity.StringEntity(ndjson,
                org.apache.http.entity.ContentType.create("application/x-ndjson")));
        org.elasticsearch.client.Response resp = performGuarded(req);
        return OBJECT_MAPPER.readValue(org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
    }

    /**
     * 6.x bulk 兼容——逐行解析 NDJSON，action 行（index/create/update/delete）meta 缺 {@code _type}
     * 时注入（type 由 typeResolver 反查，按索引缓存）；source 行原样透传。
     * 解析失败的行原样透传留给 ES 报错，不在这里拦。
     * <p>-C1 抽静态 + type 反查函数注入：剥离 REST 依赖，单测直接锁 NDJSON 改写行为。</p>
     */
    @SuppressWarnings("unchecked")
    static String legacyBulkNdjson(String indexOrNull, String ndjson,
                                   java.util.function.Function<String, String> typeResolver) {
        StringBuilder out = new StringBuilder();
        Map<String, String> typeCache = new java.util.HashMap<>();
        boolean expectSource = false;
        for (String line : ndjson.split("\n")) {
            if (line.trim().isEmpty()) continue;
            if (expectSource) {
                out.append(line).append('\n');
                expectSource = false;
                continue;
            }
            try {
                Map<String, Object> action = OBJECT_MAPPER.readValue(line, Map.class);
                String op = action.keySet().stream().findFirst().orElse("");
                if (!"index".equals(op) && !"create".equals(op) && !"update".equals(op) && !"delete".equals(op)) {
                    out.append(line).append('\n');
                    continue;
                }
                Map<String, Object> meta = action.get(op) instanceof Map
                        ? (Map<String, Object>) action.get(op) : new java.util.LinkedHashMap<>();
                action.put(op, meta);
                if (!meta.containsKey("_type")) {
                    String idx = meta.get("_index") != null ? String.valueOf(meta.get("_index")) : indexOrNull;
                    meta.put("_type", idx == null || idx.trim().isEmpty()
                            ? "_doc" : typeCache.computeIfAbsent(idx, typeResolver));
                }
                out.append(OBJECT_MAPPER.writeValueAsString(action)).append('\n');
                expectSource = !"delete".equals(op);
            } catch (Exception parseErr) {
                out.append(line).append('\n');
            }
        }
        return out.toString();
    }

    /**
     * ES SQL / _sql?format=json —— 分布式 SQL。
     * body: {"query":"SELECT ...","fetch_size":100} 或 {"cursor":"xx"} 分页。
     * <p>：6.x 的 SQL 端点挂在 {@code /_xpack/sql} 前缀下（6.3+ 就有 SQL 能力），
     * 打 7.x 路径 {@code /_sql} 会 405/400——此前被当成「未启用 _sql」假降级，
     * 实际 ES 6.7 实测 {@code POST /_xpack/sql} 可用，经 {@link #performSqlVersionAware} 修复。
     */
    public Map<String, Object> sqlQuery(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("sql body 不能为空");
        guardSql(body);
        try {
            return performSqlVersionAware("?format=json", body);
        } catch (Exception ex) {
            /* 查询级失败（列名/语法错）说明端点健在，异常直传错误通道，不得冒充「接口不可用」 */
            if (isSqlQueryLevelFailure(ex)) throw ex;
            /* 商业版才有 SQL，降级不抛 500 */
            Map<String, Object> fallback = new java.util.LinkedHashMap<>();
            fallback.put("available", false);
            fallback.put("reason", ex.getMessage());
            fallback.put("hint", "当前集群未启用 _sql 接口（OSS/未授权），请使用 DSL 查询面板");
            return fallback;
        }
    }

    /**
     * ES SQL 查询级失败甄别——verification/parsing 形态的 400 说明 _sql 端点健在、
     * 是查询本身写错（列名不存在/语法错误），必须异常直传错误通道（前端错误面板可回看
     * 全文+重试），不得落「available=false + 未启用 _sql 提示」的能力降级误导。
     * 端点真不可用的形态（405 双路径 / 403 / 连接拒绝）不在此列，降级语义保留。
     */
    private static boolean isSqlQueryLevelFailure(Exception ex) {
        if (!(ex instanceof org.elasticsearch.client.ResponseException)) return false;
        int sc = ((org.elasticsearch.client.ResponseException) ex).getResponse().getStatusLine().getStatusCode();
        if (sc != 400) return false;
        String msg = String.valueOf(ex.getMessage());
        return msg.contains("verification_exception") || msg.contains("parsing_exception");
    }

    /**
     *  版本感知 SQL 请求：6.x 走 {@code /_xpack/sql}，7+ 走 {@code /_sql}；
     * 版本未探到时 {@code /_sql} 首发 405（或 400 invalid_index_name，6.x 把 /_sql/translate
     * 误解析成索引名）再用 xpack 前缀重试一次兜底，与 {@link #putMappingVersionAware} 同构。
     *
     * @param subPath 端点后缀，如 {@code ?format=json}、{@code /translate}、{@code /close}
     */
    private Map<String, Object> performSqlVersionAware(String subPath, String body) throws IOException {
        guardSql(body);
        io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter r = clientRouter;
        String version = r == null ? null : r.currentEsVersion();
        if (io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps.requiresMappingType(version)) {
            return performJson("POST", "/_xpack/sql" + subPath, body);
        }
        try {
            return performJson("POST", "/_sql" + subPath, body);
        } catch (org.elasticsearch.client.ResponseException e) {
            int sc = e.getResponse().getStatusLine().getStatusCode();
            boolean legacyShape = sc == 405
                    || (sc == 400 && String.valueOf(e.getMessage()).contains("invalid_index_name"));
            if (!legacyShape) throw e;
            logger.info("[EsIndexAdmin] /_sql{} 失败（目标疑似 6.x），/_xpack/sql 路径重试", subPath);
            return performJson("POST", "/_xpack/sql" + subPath, body);
        }
    }

    /** _sql/translate —— 把 SQL 转为 DSL，供前端一键“转为 DSL”。 */
    public Map<String, Object> sqlTranslate(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("sql body 不能为空");
        guardSql(body);
        try {
            return performSqlVersionAware("/translate", body);
        } catch (Exception ex) {
            Map<String, Object> fallback = new java.util.LinkedHashMap<>();
            fallback.put("available", false);
            fallback.put("reason", ex.getMessage());
            return fallback;
        }
    }

    /** 若已开 fetch_size，SQL 可能返回 cursor，分页取下一页。
     *  time_zone：cursor 续页时 ES 只认 columnar/time_zone（其余 body 参数被忽略），
     *  首查用了非 UTC 时区时续页必须原样带上，否则日期列格式/函数口径前后不一致。 */
    public Map<String, Object> sqlCursor(String cursor) throws IOException {
        return sqlCursor(cursor, null);
    }

    public Map<String, Object> sqlCursor(String cursor, String timeZone) throws IOException {
        return sqlCursor(cursor, timeZone, null);
    }

    /** 1075：cursor 续页的 columnar 必须与首查一致（ES cursor 只认 columnar/time_zone）。 */
    public Map<String, Object> sqlCursor(String cursor, String timeZone, Boolean columnar) throws IOException {
        return performSqlVersionAware("?format=json", sqlCursorBody(cursor, timeZone, columnar));
    }

    /** cursor 续页请求体（包内可见：1055 单测直验 time_zone 编码与注入防护）。 */
    static String sqlCursorBody(String cursor, String timeZone) throws IOException {
        return sqlCursorBody(cursor, timeZone, null);
    }

    static String sqlCursorBody(String cursor, String timeZone, Boolean columnar) throws IOException {
        if (cursor == null || cursor.isEmpty()) throw new IllegalArgumentException("cursor 不能为空");
        java.util.Map<String, Object> req = new java.util.LinkedHashMap<>();
        req.put("cursor", cursor);
        if (timeZone != null && !timeZone.trim().isEmpty()) {
            String tz = timeZone.trim();
            /* IANA 区域名或 ±HH:MM 偏移；拒绝空白/引号/反斜杠，JSON 编码兜底防注入 */
            if (tz.length() > 64 || !tz.matches("[A-Za-z0-9_+\\-/:]+")) {
                throw new IllegalArgumentException("time_zone 非法：" + tz);
            }
            req.put("time_zone", tz);
        }
        /* 只有 true 才写键：false/缺省沿用 ES 默认（与首查省略该键同形态） */
        if (Boolean.TRUE.equals(columnar)) req.put("columnar", true);
        return OBJECT_MAPPER.writeValueAsString(req);
    }

    /** 关闭 SQL cursor。 */
    public Map<String, Object> sqlClose(String cursor) throws IOException {
        if (cursor == null || cursor.isEmpty()) throw new IllegalArgumentException("cursor 不能为空");
        return performSqlVersionAware("/close", "{\"cursor\":\"" + cursor.replace("\"", "\\\"") + "\"}");
    }

    /** 单文档 GET，供前端 diff+patch 编辑器获取原文。 */
    public Map<String, Object> getDoc(String index, String id) throws IOException {
        guardIndexName(index);
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (id == null || id.isEmpty()) throw new IllegalArgumentException("id 不能为空");
        return performJson("GET", "/" + index + "/_doc/" + encodePathToken(id, "文档 ID"), null);
    }

    /** 单文档 PUT/index（幂等覆盖）。 */
    public Map<String, Object> putDoc(String index, String id, String body, String refresh) throws IOException {
        guardIndexName(index);
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (id == null || id.isEmpty()) throw new IllegalArgumentException("id 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        String p = "/" + index + "/_doc/" + encodePathToken(id, "文档 ID");
        if (refresh != null && !refresh.isEmpty()) p += "?refresh=" + refresh;
        return performJson("PUT", p, body);
    }

    /** _update partial doc —— 局部更新。body: {"doc":{...}} 或 {"script":{...}}。：版本感知路径兼容 6.x。 */
    public Map<String, Object> updateDoc(String index, String id, String body, String refresh) throws IOException {
        guardIndexName(index);
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (id == null || id.isEmpty()) throw new IllegalArgumentException("id 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        guardUpdateScript(body);
        String encodedId = encodePathToken(id, "文档 ID");
        String qs = refresh != null && !refresh.isEmpty() ? "?refresh=" + refresh : "";
        return performDocOpVersionAware("POST", index, encodedId, "_update", qs, body);
    }

    private static void addQ(java.util.List<String> qs, String k, String v) {
        if (v != null && !v.trim().isEmpty()) {
            try {
                qs.add(k + '=' + java.net.URLEncoder.encode(v, "UTF-8"));
            } catch (java.io.UnsupportedEncodingException e) {
                qs.add(k + '=' + v);
            }
        }
    }

    /* ============================================================
     *  深度产品化 —— painless / stored scripts / rollover / ILM ops / nodes stats brief
     * ============================================================ */

    /** POST /_scripts/painless/_execute —— 脚本沙盒试跑。 */
    public Map<String, Object> painlessExecute(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        guardPainlessBody(body);
        try {
            return performJson("POST", "/_scripts/painless/_execute", body);
        } catch (Exception ex) {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("available", false);
            out.put("reason", ex.getMessage());
            out.put("hint", "当前集群未启用 painless _execute（可能是 OSS 或权限不足）");
            return out;
        }
    }

    /** 已存储脚本列表——从 cluster state metadata 中取出 stored_scripts。 */
    @SuppressWarnings("unchecked")
    public Map<String, Object> listStoredScripts() throws IOException {
        Map<String, Object> resp = performJson("GET",
                "/_cluster/state/metadata?filter_path=metadata.stored_scripts", null);
        Map<String, Object> md = (Map<String, Object>) resp.getOrDefault("metadata", java.util.Collections.emptyMap());
        Object sc = md.get("stored_scripts");
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("scripts", sc == null ? java.util.Collections.emptyMap() : sc);
        int count = (sc instanceof Map) ? ((Map<?, ?>) sc).size() : 0;
        out.put("count", count);
        return out;
    }

    /** PUT /_scripts/{id} 保存脚本。body 形如 {"script":{"lang":"painless","source":"..."}} */
    public Map<String, Object> putStoredScript(String id, String body) throws IOException {
        if (id == null || id.trim().isEmpty()) throw new IllegalArgumentException("id 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        /* 已存脚本后续可能被脚本执行通道复用：写入时就拒绝控制面字面量与 _index 改写脚本。
           注意不能复用 guardUpdateScript：它按 update 语义只接受 painless，会把
           search-templates 页唯一合法的 mustache 模板一并拦掉（生产实测 403）。 */
        guardControlBody(body);
        guardStoredScript(body);
        return performJson("PUT", "/_scripts/" + encodePathToken(id, "脚本 ID"), body);
    }

    /**
     * 已存脚本守卫：painless（或缺省 lang=ES 默认 painless）按可静态审计的 update 脚本口径；
     * mustache 是静态模板（search-templates 页的唯一合法语言），不做 painless 的 ctx 检查，
     * 控制面字面量已由调用方的 {@link #guardControlBody(String)} 拦截。
     */
    void guardStoredScript(String body) {
        body = stripBom(body);
        if (body == null || body.trim().isEmpty()) return;
        final Object script;
        try {
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            script = root.get("script");
        } catch (Exception ignore) {
            return; // 非 JSON 交由 ES 原始报错
        }
        if (script == null) return;
        String lang = null;
        if (script instanceof Map) {
            Object l = ((Map<?, ?>) script).get("lang");
            lang = l == null ? null : String.valueOf(l).trim();
        }
        if (lang == null || lang.isEmpty() || "painless".equalsIgnoreCase(lang)) {
            guardScriptValue(script);
        }
        /* mustache：静态模板，无 painless 的 ctx/_index 语义；控制面字面量已在入口拦截。 */
    }

    /** DELETE /_scripts/{id} */
    public Map<String, Object> deleteStoredScript(String id) throws IOException {
        if (id == null || id.trim().isEmpty()) throw new IllegalArgumentException("id 不能为空");
        return performJson("DELETE", "/_scripts/" + encodePathToken(id, "脚本 ID"), null);
    }

    /** POST /{alias}/_rollover —— 手动滚动。body 可为 {"conditions":{...}} 或 null；dryRun 参数控制预检。 */
    public Map<String, Object> rolloverAlias(String alias, String body, boolean dryRun) throws IOException {
        if (alias == null || alias.trim().isEmpty()) throw new IllegalArgumentException("alias 不能为空");
        guardIndexName(alias);
        String enc = java.net.URLEncoder.encode(alias.trim(), "UTF-8");
        String path = "/" + enc + "/_rollover" + (dryRun ? "?dry_run" : "");
        return performJson("POST", path, body);
    }

    /** POST /_ilm/move/{index} 手动推进 ILM 到指定 step。 */
    public Map<String, Object> ilmMove(String index, String body) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        guardIndexName(index);
        try {
            return performJson("POST", "/_ilm/move/" + java.net.URLEncoder.encode(index, "UTF-8"), body);
        } catch (Exception ex) {
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("available", false);
            out.put("reason", ex.getMessage());
            return out;
        }
    }

    /** POST /_ilm/start */
    public Map<String, Object> ilmStart() throws IOException {
        try { return performJson("POST", "/_ilm/start", null); }
        catch (Exception ex) { Map<String, Object> o = new java.util.LinkedHashMap<>(); o.put("available", false); o.put("reason", ex.getMessage()); return o; }
    }

    /** POST /_ilm/stop */
    public Map<String, Object> ilmStop() throws IOException {
        try { return performJson("POST", "/_ilm/stop", null); }
        catch (Exception ex) { Map<String, Object> o = new java.util.LinkedHashMap<>(); o.put("available", false); o.put("reason", ex.getMessage()); return o; }
    }

    /** GET /_ilm/status */
    public Map<String, Object> ilmStatus() throws IOException {
        try { return performJson("GET", "/_ilm/status", null); }
        catch (Exception ex) { Map<String, Object> o = new java.util.LinkedHashMap<>(); o.put("available", false); o.put("reason", ex.getMessage()); return o; }
    }

    /** 实时监控大屏简化统计——只取 name/jvm.heap%/os.cpu.load/fs.total/indexing rate/search rate/线程池即时值（ 对标 Thread_pool Rows）。 */
    @SuppressWarnings("unchecked")
    public java.util.List<Map<String, Object>> nodesStatsBrief() throws IOException {
        Map<String, Object> resp = performJson("GET",
                "/_nodes/stats/jvm,os,fs,indices,thread_pool?filter_path=nodes.*.name,nodes.*.host,nodes.*.roles,"
                        + "nodes.*.jvm.mem.heap_used_percent,nodes.*.jvm.mem.heap_used_in_bytes,nodes.*.jvm.mem.heap_max_in_bytes,"
                        + "nodes.*.os.cpu.percent,nodes.*.os.cpu.load_average,"
                        + "nodes.*.fs.total.total_in_bytes,nodes.*.fs.total.free_in_bytes,nodes.*.fs.total.available_in_bytes,"
                        + "nodes.*.indices.docs.count,nodes.*.indices.store.size_in_bytes,"
                        + "nodes.*.indices.indexing.index_total,nodes.*.indices.search.query_total,"
                        + "nodes.*.thread_pool.search.active,nodes.*.thread_pool.search.queue", null);
        Map<String, Object> nodes = (Map<String, Object>) resp.getOrDefault("nodes", java.util.Collections.emptyMap());
        java.util.List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Map.Entry<String, Object> e : nodes.entrySet()) {
            Map<String, Object> n = (Map<String, Object>) e.getValue();
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("nodeId", e.getKey());
            row.put("name", n.get("name"));
            row.put("host", n.get("host"));
            row.put("roles", n.get("roles"));
            Map<String, Object> jvm = (Map<String, Object>) n.getOrDefault("jvm", java.util.Collections.emptyMap());
            Map<String, Object> mem = (Map<String, Object>) jvm.getOrDefault("mem", java.util.Collections.emptyMap());
            row.put("heapPct", mem.get("heap_used_percent"));
            row.put("heapUsed", mem.get("heap_used_in_bytes"));
            row.put("heapMax", mem.get("heap_max_in_bytes"));
            Map<String, Object> os = (Map<String, Object>) n.getOrDefault("os", java.util.Collections.emptyMap());
            Map<String, Object> cpu = (Map<String, Object>) os.getOrDefault("cpu", java.util.Collections.emptyMap());
            row.put("cpuPct", cpu.get("percent"));
            row.put("load", cpu.get("load_average"));
            Map<String, Object> fs = (Map<String, Object>) n.getOrDefault("fs", java.util.Collections.emptyMap());
            Map<String, Object> ft = (Map<String, Object>) fs.getOrDefault("total", java.util.Collections.emptyMap());
            row.put("diskTotal", ft.get("total_in_bytes"));
            row.put("diskFree", ft.get("free_in_bytes"));
            row.put("diskAvail", ft.get("available_in_bytes"));
            Map<String, Object> idx = (Map<String, Object>) n.getOrDefault("indices", java.util.Collections.emptyMap());
            Map<String, Object> docs = (Map<String, Object>) idx.getOrDefault("docs", java.util.Collections.emptyMap());
            Map<String, Object> store = (Map<String, Object>) idx.getOrDefault("store", java.util.Collections.emptyMap());
            Map<String, Object> indexing = (Map<String, Object>) idx.getOrDefault("indexing", java.util.Collections.emptyMap());
            Map<String, Object> search = (Map<String, Object>) idx.getOrDefault("search", java.util.Collections.emptyMap());
            row.put("docCount", docs.get("count"));
            row.put("storeSize", store.get("size_in_bytes"));
            row.put("indexTotal", indexing.get("index_total"));
            row.put("queryTotal", search.get("query_total"));
            /* 查询线程池即时值（对标阿里云 Thread_pool Rows；写入拒绝前兆，历史管道  同口径） */
            Map<String, Object> tp = (Map<String, Object>) n.getOrDefault("thread_pool", java.util.Collections.emptyMap());
            Map<String, Object> tpSearch = (Map<String, Object>) tp.getOrDefault("search", java.util.Collections.emptyMap());
            row.put("tpSearchActive", tpSearch.get("active"));
            row.put("tpSearchQueue", tpSearch.get("queue"));
            out.add(row);
        }
        return out;
    }

    /**
     * MCP 索引统计（非 ADMIN key）：只回聚合 docs/store/search/indexing/get，
     * 不含 indices[*] 分片与节点拓扑；ADMIN key 仍走完整 _stats。
     */
    public Map<String, Object> indexStatsSummary(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        String clean = index.trim();
        guardIndexName(clean);
        Map<String, Object> resp = performJson("GET",
                "/" + clean + "/_stats/docs,store,search,indexing,get", null);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        Object all = resp.get("_all");
        if (all instanceof Map) out.put("_all", all);
        Object shards = resp.get("_shards");
        if (shards instanceof Map) out.put("_shards", shards);
        out.put("trimmed", Boolean.TRUE);
        return out;
    }

    /* ============================================================
     *  查询能力全通道（Query Bridge）
     *   专治 ES-SQL 硬伤：数组字段报错 / nested 不支持 / text 禁 GROUP BY / 翻页上限。
     *   新增 6 个 low-level：
     *     1. sqlLenient    — SQL 宽容模式（自动包 field_multi_value_leniency + 可选 runtime_mappings 拍平数组）
     *     2. luceneSearch  — query_string 通用查询（对数组/nested/text 全部友好）
     *     3. pitOpen       — Point-in-Time 开射（距离 10000 限制）
     *     4. pitSearch     — PIT + search_after 分布式深度分页
     *     5. pitClose      — 关闭 PIT
     *     6. resolveSchema — 字段结构探测，前端提示（哪些多值/nested/text）
     * ============================================================ */

    /**
     * SQL 宽容执行：自动注入 field_multi_value_leniency=true，允许对数组字段 SELECT 不报错（取首值）。
     * 也欢迎传入 runtime_mappings 拍平中间的多值/对象字段。
     * body: 任意 _sql 支持的 body，方法会自动将 field_multi_value_leniency 合入（如未显式提供）。
     */
    public Map<String, Object> sqlLenient(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        String finalBody = body.trim();
        /* 小小的优雅注入：如果使用者未传 field_multi_value_leniency，帮他自动加。
         * 不依赖 Jackson，按字符串位置插入（普通 JSON 根为单层，可接受）。 */
        if (finalBody.startsWith("{") && !finalBody.contains("field_multi_value_leniency")) {
            finalBody = "{\"field_multi_value_leniency\":true," + finalBody.substring(1);
        }
        guardSql(finalBody);
        try {
            /* 经版本感知 SQL 路径（6.x 是 /_xpack/sql） */
            return performSqlVersionAware("?format=json", finalBody);
        } catch (Exception ex) {
            /* 查询级失败直传错误通道（同 sqlQuery 甄别），不得冒充「接口不可用」 */
            if (isSqlQueryLevelFailure(ex)) throw ex;
            Map<String, Object> out = new java.util.LinkedHashMap<>();
            out.put("available", false);
            out.put("reason", ex.getMessage());
            out.put("hint", "当前集群未启用 _sql，或该查询违反 SQL 限制；建议改用 Lucene / DSL 接口");
            return out;
        }
    }

    /**
     * Lucene query_string 通用查询——对数组、nested、text 全部友好，不受 ES-SQL 硬伤影响。
     * 支持全部 Lucene 语法（+field:val AND status:ACTIVE tags:(red OR blue) name:hello*）。
     */
    public Map<String, Object> luceneSearch(String index, String q, int size, int from,
                                            String sortField, String sortOrder) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        guardIndexPattern(index);
        if (q == null) q = "*";
        java.util.List<String> qs = new java.util.ArrayList<>();
        addQ(qs, "q", q);
        if (size > 0) qs.add("size=" + size);
        if (from > 0) qs.add("from=" + from);
        if (sortField != null && !sortField.trim().isEmpty()) {
            String order = (sortOrder != null && sortOrder.equalsIgnoreCase("asc")) ? "asc" : "desc";
            qs.add("sort=" + java.net.URLEncoder.encode(sortField + ":" + order, "UTF-8"));
        }
        qs.add("lenient=true");
        qs.add("analyze_wildcard=true");
        qs.add("track_total_hits=true");
        String path = "/" + index + "/_search?" + String.join("&", qs);
        return performJson("GET", path, null);
    }

    /** 开启 Point-in-Time——分布式深度分页基石，keepAlive 如 "5m"。 */
    public Map<String, Object> pitOpen(String index, String keepAlive) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        /* PIT 会锁定索引快照供后续搜索读取：通配必须解析真实索引名逐个判定，
           否则 logs-* 会把 *logs_esquerystudio_lock 等后缀控制索引一并锁进 PIT。 */
        guardDestructivePattern(index);
        String ka = (keepAlive == null || keepAlive.trim().isEmpty()) ? "5m" : keepAlive.trim();
        try {
            return performJson("POST", "/" + index + "/_pit?keep_alive="
                    + java.net.URLEncoder.encode(ka, "UTF-8"), null);
        } catch (Exception ex) {
            /* 请求级失败（keep_alive 解析 400/索引不存在 404）说明 _pit 端点健在，异常直传
             错误通道（前端错误面板可回看全文+重试），不得冒充「集群不支持 PIT」；
             端点缺失与连接类异常才落能力降级 */
            if (isPitCapabilityLevelFailure(ex)) {
                Map<String, Object> out = new java.util.LinkedHashMap<>();
                out.put("available", false);
                out.put("reason", ex.getMessage());
                out.put("hint", "当前集群不支持 Point-in-Time（需 ES 7.10+），可回退到 scroll");
                return out;
            }
            throw ex;
        }
    }

    /**
     * 非 ADMIN 的 PIT 开启：keep-alive 夹到资源上限。
     *
     * <p>PIT 是「锁定时间点搜索上下文」，每个 PIT 都在目标集群占堆外/段引用。只读身份可以
     * 合法使用深度分页，但不能用 {@code 999d} 这类超长值把上下文无限期钉住（低成本 DoS）。
     * 超限按上限下发而不是直接拒绝——有权限的人继续能用，只是资源占用有界；
     * 值本身不会被静默改写后不告知，响应里回填 {@code keepAliveApplied} 供前端提示。</p>
     */
    public Map<String, Object> pitOpenClamped(String index, String keepAlive) throws IOException {
        String requested = (keepAlive == null || keepAlive.trim().isEmpty()) ? "5m" : keepAlive.trim();
        long capMillis = pitKeepAliveCapMillis();
        long wantMillis = parseEsTimeMillis(requested);
        if (wantMillis < 0) {
            throw new IllegalArgumentException("keep_alive 格式非法（例：5m / 1h / 30s）：" + keepAlive);
        }
        String applied = requested;
        boolean clamped = false;
        if (wantMillis > capMillis) {
            applied = esTimeLiteral(capMillis);
            clamped = true;
        }
        Map<String, Object> out = pitOpen(index, applied);
        if (out != null) {
            out.put("keepAliveRequested", requested);
            out.put("keepAliveApplied", applied);
            out.put("keepAliveClamped", clamped);
        }
        return out;
    }

    /**
     * 非 ADMIN PIT keep-alive 上限（分钟）：默认 60。
     *
     * <p>用 JVM 系统属性而非 Spring 配置，是因为本类也被非 Spring 直调路径（单测/内部任务）
     * 使用；属性名沿用 {@code esquerystudio.elasticsearch.*} 命名域，便于运维在同一处检索。
     * 非正整数/解析失败一律回落默认 60 分钟（fail-closed 方向是「更小上限」）。</p>
     */
    private static long pitKeepAliveCapMillis() {
        String v = System.getProperty("esquerystudio.elasticsearch.console.pit.max-keep-alive-minutes", "60");
        try {
            long minutes = Long.parseLong(v.trim());
            return minutes > 0 ? minutes * 60_000L : 60 * 60_000L;
        } catch (Exception e) {
            return 60 * 60_000L;
        }
    }

    /** ES 时间字面量 → 毫秒；无法识别返回 -1（调用方 fail-closed）。 */
    static long parseEsTimeMillis(String value) {
        if (value == null) return -1;
        java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("^(\\d+)(nanos|micros|ms|s|m|h|d)$", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(value.trim());
        if (!m.matches()) return -1;
        long n;
        try {
            n = Long.parseLong(m.group(1));
        } catch (NumberFormatException e) {
            return -1;
        }
        switch (m.group(2).toLowerCase(Locale.ROOT)) {
            case "nanos": return n / 1_000_000L;
            case "micros": return n / 1_000L;
            case "ms": return n;
            case "s": return n * 1_000L;
            case "m": return n * 60_000L;
            case "h": return n * 3_600_000L;
            case "d": return n * 86_400_000L;
            default: return -1;
        }
    }

    /** 毫秒 → 最接近的整分/整时字面量（上限回填用，避免出现 "3600000ms" 这类噪音）。 */
    static String esTimeLiteral(long millis) {
        if (millis % 3_600_000L == 0) return (millis / 3_600_000L) + "h";
        if (millis % 60_000L == 0) return (millis / 60_000L) + "m";
        if (millis % 1_000L == 0) return (millis / 1_000L) + "s";
        return millis + "ms";
    }

    /**
     * PIT 能力级失败甄别——只有「端点真不在」（旧版本 ES 对未知路径回 400 no handler
     * found for uri）与连接类异常（非 ResponseException）维持 available=false 能力降级；
     * 其余 ResponseException（keep_alive 解析 400/索引不存在 404 等请求级形态）一律异常
     * 直传错误通道。甄别方向宁漏勿误——只把明确能力级形态留在降级，其余直传。
     */
    private static boolean isPitCapabilityLevelFailure(Exception ex) {
        if (!(ex instanceof org.elasticsearch.client.ResponseException)) return true;
        return String.valueOf(ex.getMessage()).contains("no handler found for uri");
    }

    /** PIT + search_after 分页：body 必须携带 pit.id、sort、可选 search_after 。
     *  只允许在已开启的 PIT 内搜索——裸 body（无 pit）会退化成全集群 _search，
     *  可读出控制面索引（账号/连接凭据/审计），必须在此结构性拒绝。 */
    public Map<String, Object> pitSearch(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        final Object pit;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            if (root.containsKey("index") || root.containsKey("indices")) {
                throw new IllegalArgumentException("PIT 搜索不允许指定 index/indices（目标由 PIT 锁定）");
            }
            pit = root.get("pit");
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("PIT 搜索 body 必须是包含 pit.id 的 JSON", e);
        }
        if (!(pit instanceof Map) || ((Map<?, ?>) pit).get("id") == null
                || String.valueOf(((Map<?, ?>) pit).get("id")).trim().isEmpty()) {
            throw new IllegalArgumentException("PIT 搜索必须携带非空 pit.id");
        }
        guardSearchBody(body);
        return performJson("POST", "/_search", body);
    }

    /**
     * 页面 PIT 搜索（非 ADMIN）：pit.keep_alive 也受资源上限约束。
     *
     * <p>raw 通道已限制根层/嵌套 keep_alive；页面端点如果只校验 pit.id，持查询页读权限的人
     * 可以用 body 里的 {@code pit.keep_alive:"9999d"} 无限延长已打开的 PIT——与 raw 同源的
     * 资源上限必须在这里也生效。无法识别的时长同样拒绝（fail-closed）。</p>
     */
    public Map<String, Object> pitSearchClamped(String body) throws IOException {
        if (body != null && body.indexOf("\"keep_alive\"") >= 0) {
            try {
                Map<?, ?> root = OBJECT_MAPPER.readValue(stripBom(body), Map.class);
                Object pit = root.get("pit");
                if (pit instanceof Map) {
                    Object ka = ((Map<?, ?>) pit).get("keep_alive");
                    if (ka instanceof String) {
                        long ms = parseEsTimeMillis((String) ka);
                        long cap = pitKeepAliveCapMillis();
                        if (ms < 0 || ms > cap) {
                            throw new IllegalArgumentException("PIT keep_alive 超上限 " + esTimeLiteral(cap)
                                    + "（请求 " + ka + "）：长时间占用搜索上下文会阻止段合并并耗尽堆外内存");
                        }
                    }
                }
            } catch (IllegalArgumentException e) {
                throw e;
            } catch (Exception ignore) {
                /* 非 JSON 交由 pitSearch 的原始报错 */
            }
        }
        return pitSearch(body);
    }

    /** 关闭 PIT：释放集群保留的搜索上下文。 */
    public Map<String, Object> pitClose(String pitId) throws IOException {
        if (pitId == null || pitId.trim().isEmpty()) throw new IllegalArgumentException("pitId 不能为空");
        String bodyStr = "{\"id\":\"" + pitId.replace("\"", "\\\"") + "\"}";
        return performJson("DELETE", "/_pit", bodyStr);
    }

    /**
     * 字段结构探测——从 mapping 抓类型，从一行样本只当前实际多值/nested，前端能鼓胁提示。
     * 返回: { index, fields:[{name,type,isArray,isText,isNested,isKeyword,supportsSql}], warnings:[...] }
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> resolveSchema(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        guardIndexPattern(index);
        /* 1. 拉 mapping */
        Map<String, Object> mResp = performJson("GET", "/" + index + "/_mapping", null);
        Map<String, Object> firstIdx = null;
        for (Map.Entry<String, Object> e : mResp.entrySet()) { firstIdx = (Map<String, Object>) e.getValue(); break; }
        Map<String, Object> mappings = firstIdx == null ? java.util.Collections.emptyMap()
                : unwrapTypeLayer((Map<String, Object>) firstIdx.getOrDefault("mappings", java.util.Collections.emptyMap()));
        Map<String, Object> props = (Map<String, Object>) mappings.getOrDefault("properties", java.util.Collections.emptyMap());

        /* 2. 拉一行样本探测实际多值 */
        java.util.Set<String> observedArrayFields = new java.util.HashSet<>();
        try {
            Map<String, Object> sample = performJson("POST", "/" + index + "/_search?size=1", "{\"query\":{\"match_all\":{}}}");
            Map<String, Object> hits = (Map<String, Object>) sample.getOrDefault("hits", java.util.Collections.emptyMap());
            java.util.List<Map<String, Object>> hitList = (java.util.List<Map<String, Object>>) hits.getOrDefault("hits", java.util.Collections.emptyList());
            if (!hitList.isEmpty()) {
                Map<String, Object> src = (Map<String, Object>) hitList.get(0).getOrDefault("_source", java.util.Collections.emptyMap());
                scanArrays(src, "", observedArrayFields);
            }
        } catch (Exception e) {
            // 裁决（三态之②冷路径 WARN）：样本行探测失败 → observedArrayFields 恒空
            // → isArray/isNested 判定降级 → supportsSql 启发式可能把「SQL 会破」的字段误报为
            // 安全，用户拿着错误结论去写 SQL 且无痕可查。冷路径（控制台显式触发 schema 解析
            // 才走到），直接 WARN 带 index 与堆栈；主流程返回契约不变（fields 仍按 mapping 给出，
            // Observability552Test 反锁）。
            logger.warn("[EsIndexAdmin] 样本行探测失败，数组/nested 识别降级"
                    + "（supportsSql 可能误判）: index={}", index, e);
        }

        /* 3. 展开字段 */
        java.util.List<Map<String, Object>> fields = new java.util.ArrayList<>();
        java.util.List<String> warnings = new java.util.ArrayList<>();
        walkFields(props, "", fields, warnings, observedArrayFields);

        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("index", index);
        out.put("fields", fields);
        out.put("warnings", warnings);
        out.put("arrayFieldCount", observedArrayFields.size());
        return out;
    }

    @SuppressWarnings("unchecked")
    private static void scanArrays(Map<String, Object> src, String prefix, java.util.Set<String> out) {
        for (Map.Entry<String, Object> e : src.entrySet()) {
            String name = prefix.isEmpty() ? e.getKey() : (prefix + "." + e.getKey());
            Object v = e.getValue();
            if (v instanceof java.util.List) {
                out.add(name);
            } else if (v instanceof Map) {
                scanArrays((Map<String, Object>) v, name, out);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static void walkFields(Map<String, Object> props, String prefix,
                                   java.util.List<Map<String, Object>> out,
                                   java.util.List<String> warnings,
                                   java.util.Set<String> arrayFields) {
        for (Map.Entry<String, Object> e : props.entrySet()) {
            String name = prefix.isEmpty() ? e.getKey() : (prefix + "." + e.getKey());
            Map<String, Object> def = (Map<String, Object>) e.getValue();
            String type = String.valueOf(def.getOrDefault("type", "object"));
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("name", name);
            row.put("type", type);
            boolean isText = "text".equals(type);
            boolean isNested = "nested".equals(type);
            boolean isKeyword = "keyword".equals(type);
            boolean isArray = arrayFields.contains(name);
            row.put("isText", isText);
            row.put("isNested", isNested);
            row.put("isKeyword", isKeyword);
            row.put("isArray", isArray);
            /* supportsSql 启发式判断：数组/nested 在 SQL 中会破。 */
            boolean sqlOk = !(isArray || isNested);
            row.put("supportsSql", sqlOk);
            if (!sqlOk) {
                warnings.add("字段 [" + name + "] 为 " + (isNested ? "nested" : "array") + "，ES-SQL SELECT 将报错，建议改用 Lucene / DSL / PIT");
            }
            /* subfields (multi-fields) */
            Map<String, Object> subs = (Map<String, Object>) def.get("fields");
            if (subs != null && !subs.isEmpty()) {
                for (Map.Entry<String, Object> se : subs.entrySet()) {
                    Map<String, Object> sd = (Map<String, Object>) se.getValue();
                    Map<String, Object> sub = new java.util.LinkedHashMap<>();
                    sub.put("name", name + "." + se.getKey());
                    sub.put("type", sd.get("type"));
                    sub.put("isSubField", true);
                    sub.put("supportsSql", true);
                    out.add(sub);
                }
            }
            /* nested 内层 properties */
            Map<String, Object> childProps = (Map<String, Object>) def.get("properties");
            out.add(row);
            if (childProps != null && !childProps.isEmpty()) {
                walkFields(childProps, name, out, warnings, arrayFields);
            }
        }
    }

    /* ============ ：索引运维中枢（mapping / analysis / synonyms / plugins） ============ */

    /**
     * Mapping 详情——结构化返回字段树。
     * 每个字段：name / type / analyzer / search_analyzer / format / isNested / isObject / isMultiField / children[]。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getMappingDetail(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        guardIndexPattern(index);
        Map<String, Object> raw = performJson("GET", "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_mapping", null);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("index", index);
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            Map<String, Object> body = (Map<String, Object>) e.getValue();
            Map<String, Object> mappings = body == null ? null : unwrapTypeLayer((Map<String, Object>) body.get("mappings"));
            Map<String, Object> props = mappings == null ? null : (Map<String, Object>) mappings.get("properties");
            java.util.List<Map<String, Object>> tree = new java.util.ArrayList<>();
            if (props != null) buildFieldTree(props, tree);
            out.put("tree", tree);
            out.put("raw", mappings);
            /* 快速统计 */
            int total = 0, nested = 0, text = 0, kw = 0, obj = 0;
            java.util.Deque<java.util.List<Map<String, Object>>> stk = new java.util.ArrayDeque<>();
            stk.push(tree);
            while (!stk.isEmpty()) {
                for (Map<String, Object> n : stk.pop()) {
                    total++;
                    String t = String.valueOf(n.get("type"));
                    if ("nested".equals(t)) nested++;
                    else if ("object".equals(t)) obj++;
                    else if ("text".equals(t)) text++;
                    else if ("keyword".equals(t)) kw++;
                    java.util.List<Map<String, Object>> ch = (java.util.List<Map<String, Object>>) n.get("children");
                    if (ch != null && !ch.isEmpty()) stk.push(ch);
                }
            }
            Map<String, Object> stats = new java.util.LinkedHashMap<>();
            stats.put("total", total); stats.put("nested", nested); stats.put("text", text); stats.put("keyword", kw); stats.put("object", obj);
            out.put("stats", stats);
            break;
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private static void buildFieldTree(Map<String, Object> props, java.util.List<Map<String, Object>> out) {
        for (Map.Entry<String, Object> e : props.entrySet()) {
            String name = e.getKey();
            Map<String, Object> def = (Map<String, Object>) e.getValue();
            if (def == null) continue;
            Map<String, Object> node = new java.util.LinkedHashMap<>();
            node.put("name", name);
            String type = String.valueOf(def.getOrDefault("type", def.get("properties") != null ? "object" : "unknown"));
            node.put("type", type);
            if (def.get("analyzer") != null)         node.put("analyzer", def.get("analyzer"));
            if (def.get("search_analyzer") != null)  node.put("searchAnalyzer", def.get("search_analyzer"));
            if (def.get("format") != null)           node.put("format", def.get("format"));
            if (def.get("index") != null)            node.put("indexed", def.get("index"));
            if (def.get("doc_values") != null)       node.put("docValues", def.get("doc_values"));
            if (def.get("copy_to") != null)          node.put("copyTo", def.get("copy_to"));
            if (def.get("null_value") != null)       node.put("nullValue", def.get("null_value"));
            node.put("isNested", "nested".equals(type));
            node.put("isObject", "object".equals(type) || def.get("properties") != null);
            /* multi-fields */
            Map<String, Object> subs = (Map<String, Object>) def.get("fields");
            if (subs != null && !subs.isEmpty()) {
                java.util.List<Map<String, Object>> subList = new java.util.ArrayList<>();
                for (Map.Entry<String, Object> se : subs.entrySet()) {
                    Map<String, Object> sd = (Map<String, Object>) se.getValue();
                    Map<String, Object> sn = new java.util.LinkedHashMap<>();
                    sn.put("name", se.getKey());
                    sn.put("type", sd.get("type"));
                    sn.put("isMultiField", true);
                    if (sd.get("analyzer") != null) sn.put("analyzer", sd.get("analyzer"));
                    subList.add(sn);
                }
                node.put("multiFields", subList);
            }
            /* nested / object 递归 */
            Map<String, Object> childProps = (Map<String, Object>) def.get("properties");
            if (childProps != null && !childProps.isEmpty()) {
                java.util.List<Map<String, Object>> children = new java.util.ArrayList<>();
                buildFieldTree(childProps, children);
                node.put("children", children);
            }
            out.add(node);
        }
    }

    /**
     * Mapping 增加字段（只允许 add，不允许改/删；ES 硬性约束）。
     * body 期望是标准 mapping 片段 {"properties":{"newField":{"type":"keyword"}}}
     */
    public Map<String, Object> putMappingField(String index, String body) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        guardIndexName(index);
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        // 与 putMapping 同走版本感知路径（6.x 必须 typed，否则 400 mapping type is missing）
        return putMappingVersionAware(java.net.URLEncoder.encode(index, "UTF-8"), body);
    }

    /**
     * 读取索引 analysis 全景——analyzer / tokenizer / filter / char_filter / normalizer。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> getAnalysisSettings(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        guardIndexPattern(index);
        Map<String, Object> raw = performJson("GET",
            "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_settings?include_defaults=false&flat_settings=false", null);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("index", index);
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            Map<String, Object> body = (Map<String, Object>) e.getValue();
            Map<String, Object> settings = body == null ? null : (Map<String, Object>) body.get("settings");
            Map<String, Object> idx = settings == null ? null : (Map<String, Object>) settings.get("index");
            Map<String, Object> analysis = idx == null ? null : (Map<String, Object>) idx.get("analysis");
            out.put("analysis", analysis == null ? new java.util.LinkedHashMap<>() : analysis);
            /* 摘要计数 */
            Map<String, Object> summary = new java.util.LinkedHashMap<>();
            summary.put("analyzers",   analysis == null ? 0 : sizeOf(analysis.get("analyzer")));
            summary.put("tokenizers",  analysis == null ? 0 : sizeOf(analysis.get("tokenizer")));
            summary.put("filters",     analysis == null ? 0 : sizeOf(analysis.get("filter")));
            summary.put("charFilters", analysis == null ? 0 : sizeOf(analysis.get("char_filter")));
            summary.put("normalizers", analysis == null ? 0 : sizeOf(analysis.get("normalizer")));
            out.put("summary", summary);
            break;
        }
        return out;
    }

    private static int sizeOf(Object m) { return (m instanceof Map) ? ((Map<?, ?>) m).size() : 0; }

    /**
     * 更新 analysis 配置——自动执行 close→PUT settings→open 三步曲。
     * body 示例：{"analysis":{"filter":{"my_syn":{"type":"synonym_graph","synonyms":["car,auto"]}}}}
     */
    public Map<String, Object> updateAnalysisSettings(String index, String body) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        guardIndexName(index);
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        Map<String, Object> log = new java.util.LinkedHashMap<>();
        java.util.List<String> steps = new java.util.ArrayList<>();
        try {
            performJson("POST", "/" + enc + "/_close", null); steps.add("close-ok");
            performJson("PUT",  "/" + enc + "/_settings", body); steps.add("put-settings-ok");
        } finally {
            try { performJson("POST", "/" + enc + "/_open", null); steps.add("open-ok"); }
            catch (Exception ex) { steps.add("open-FAILED: " + ex.getMessage()); }
        }
        log.put("steps", steps);
        log.put("ok", steps.contains("put-settings-ok") && steps.contains("open-ok"));
        return log;
    }

    /**
     * 分词 API 试跑。body 支持指定 analyzer 或即席组合（tokenizer + filter + char_filter）。
     * 若 index 为空则走 /_analyze（builtin analyzer 才有效）。
     */
    public Map<String, Object> analyzeText(String index, String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        String path = (index == null || index.trim().isEmpty())
            ? "/_analyze"
            : "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_analyze";
        return performJson("POST", path, body);
    }

    /**
     * 热重载搜索分词器（同义词/文件字典变更后无需 close-index）。
     * ES 7.3+ 支持；仅对 search_analyzer 生效，index_analyzer 变更仍需 close-open。
     */
    public Map<String, Object> reloadSearchAnalyzers(String index) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        guardIndexName(index);
        return performJson("POST", "/" + java.net.URLEncoder.encode(index, "UTF-8") + "/_reload_search_analyzers", null);
    }

    /**
     * 集群插件矩阵——`_cat/plugins?format=json`。
     * 返回：{ nodes:[{name, plugin, version, description}], summary:{pluginName:{installedOn:[node...], count}}, mismatches:[] }
     * mismatches 会标出"某插件未在所有节点上安装"这种脏 setup。
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> pluginsList() throws IOException {
        Object raw;
        try {
            org.elasticsearch.client.Request req = new org.elasticsearch.client.Request("GET", "/_cat/plugins?format=json&v=true");
            org.elasticsearch.client.Response resp = performGuarded(req);
            String txt = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            raw = OBJECT_MAPPER.readValue(txt, java.util.List.class);
        } catch (Exception ex) {
            Map<String, Object> err = new java.util.LinkedHashMap<>();
            err.put("available", false);
            err.put("reason", ex.getMessage());
            return err;
        }
        java.util.List<Map<String, Object>> nodes = (java.util.List<Map<String, Object>>) raw;
        /* 汇总：某插件安装在哪几个节点 */
        java.util.Map<String, java.util.Set<String>> byPlugin = new java.util.LinkedHashMap<>();
        java.util.Set<String> allNodes = new java.util.LinkedHashSet<>();
        for (Map<String, Object> r : nodes) {
            String nn = String.valueOf(r.get("name"));
            String pn = String.valueOf(r.get("component"));
            if (nn == null || pn == null) continue;
            allNodes.add(nn);
            byPlugin.computeIfAbsent(pn, k -> new java.util.LinkedHashSet<>()).add(nn);
        }
        java.util.List<Map<String, Object>> summary = new java.util.ArrayList<>();
        java.util.List<String> mismatches = new java.util.ArrayList<>();
        for (Map.Entry<String, java.util.Set<String>> en : byPlugin.entrySet()) {
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("plugin", en.getKey());
            row.put("installedOn", new java.util.ArrayList<>(en.getValue()));
            row.put("count", en.getValue().size());
            row.put("complete", en.getValue().size() == allNodes.size());
            summary.add(row);
            if (en.getValue().size() != allNodes.size()) {
                java.util.Set<String> miss = new java.util.LinkedHashSet<>(allNodes);
                miss.removeAll(en.getValue());
                mismatches.add(en.getKey() + " 缺少节点：" + String.join(",", miss));
            }
        }
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("available", true);
        out.put("nodes", nodes);
        out.put("summary", summary);
        out.put("mismatches", mismatches);
        out.put("nodeCount", allNodes.size());
        out.put("pluginCount", byPlugin.size());
        return out;
    }

    /**
     * 便捷方法——把同义词列表写入索引级 synonym_graph filter。
     * 自动执行 close→PUT→open。字典编辑器专用。
     */
    public Map<String, Object> synonymsGraphUpsert(String index, String filterName, java.util.List<String> entries, boolean expand) throws IOException {
        if (index == null || index.trim().isEmpty()) throw new IllegalArgumentException("index 不能为空");
        if (filterName == null || filterName.trim().isEmpty()) filterName = "custom_synonyms";
        if (entries == null) entries = java.util.Collections.emptyList();
        StringBuilder body = new StringBuilder();
        body.append("{\"analysis\":{\"filter\":{\"").append(filterName).append("\":{\"type\":\"synonym_graph\",\"expand\":")
            .append(expand ? "true" : "false").append(",\"synonyms\":[");
        boolean first = true;
        for (String s : entries) {
            if (s == null || s.trim().isEmpty()) continue;
            if (!first) body.append(',');
            body.append('"').append(s.replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
            first = false;
        }
        body.append("]}}}}");
        return updateAnalysisSettings(index, body.toString());
    }

    /* ==================== ：相关性打分实验室 ==================== */

    /**
     * 带 explain 的搜索透传。body 由前端自由控制（可含 explain:true / _name 命名子句）。
     */
    public Map<String, Object> searchRaw(String index, String body) throws IOException {
        guardIndexPattern(index);
        guardSearchBody(body);
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        return performJson("POST", "/" + enc + "/_search", body);
    }

    /**
     * 对指定文档问“为什么得这个分 / 为什么没命中”。
     * body 形如 {"query":{...}}，命中时返回完整 BM25 解释树，未命中时 matched=false。
     */
    public Map<String, Object> explainDoc(String index, String id, String body) throws IOException {
        guardIndexPattern(index);
        guardSearchBody(body);
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        String encId = encodePathToken(id, "文档 ID");
        /* typeless _explain 是 7.0 才有的路由，经版本感知路径兼容 6.x */
        return performDocOpVersionAware("POST", enc, encId, "_explain", "", body);
    }

    /**
     * 查询校验 + Lucene 改写透视。看“我写的 match 实际被改写成什么”。
     */
    public Map<String, Object> validateQuery(String index, String body) throws IOException {
        guardIndexPattern(index);
        guardSearchBody(body);
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        return performJson("POST", "/" + enc + "/_validate/query?explain=true&rewrite=true", body);
    }

    /**
     * 词频取证。指定文档指定字段的 term 统计（tf/ttf/doc_freq），打分调试的微观证据。
     */
    public Map<String, Object> termVectors(String index, String id, String fields) throws IOException {
        guardIndexPattern(index);
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        String encId = encodePathToken(id, "文档 ID");
        StringBuilder qs = new StringBuilder("?term_statistics=true&field_statistics=true&positions=false&offsets=false");
        if (fields != null && !fields.trim().isEmpty()) {
            qs.append("&fields=").append(java.net.URLEncoder.encode(fields.trim(), "UTF-8"));
        }
        /* typeless _termvectors 是 7.0 才有的路由，经版本感知路径兼容 6.x */
        return performDocOpVersionAware("GET", enc, encId, "_termvectors", qs.toString(), null);
    }

    /* ==================== ：搜索模板中心 + 别名管控台 ==================== */

    /**
     * mustache 模板渲染预览。body 形如 {"id":"tpl","params":{...}} 或 {"source":{...},"params":{...}}，
     * 返回渲染后的最终 DSL（template_output），不真正执行搜索。
     */
    public Map<String, Object> renderTemplate(String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        /* 只禁按已存 id 渲染（会回显更高权限写入的模板体）；内联 source 由调用者自持，
           render 不执行搜索，故不套用 search-body 的结构守卫（Mustache 段落语法并非合法 JSON）。 */
        guardStoredTemplateReference(body);
        return performJson("POST", "/_render/template", body);
    }

    /**
     * 执行搜索模板。POST /{index}/_search/template，body 同 _render/template。
     */
    public Map<String, Object> searchTemplate(String index, String body) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        guardIndexPattern(index);
        guardStoredTemplateReference(body);
        guardSearchBody(body);
        String enc = java.net.URLEncoder.encode(index, "UTF-8");
        return performJson("POST", "/" + enc + "/_search/template", body);
    }

    /** 搜索模板必须内联 source：按已存 id 执行会绕过请求体目标扫描（模板可能由更高权限写入）。 */
    private void guardStoredTemplateReference(String body) {
        body = stripBom(body);
        if (body == null || body.trim().isEmpty()) return;
        try {
            Map<?, ?> root = OBJECT_MAPPER.readValue(body, Map.class);
            /* ES 的 SearchTemplateRequest 对 source/inline/template/id 采用 last-field-wins：
               只要 id 在场，内联 source 也可能被覆盖为已存模板——一律拒绝按 id 执行。 */
            if (root.get("id") != null) {
                throw new ControlPlaneGuardException("搜索模板必须内联 source，不允许按已存 id 执行");
            }
            /* 嵌套形态 {"template":{"id":...}} 与根级 id 同权：last-field-wins 语义下
               id 一旦在场即可覆盖内联 source。 */
            Object nestedTemplate = root.get("template");
            if (nestedTemplate instanceof Map && ((Map<?, ?>) nestedTemplate).get("id") != null) {
                throw new ControlPlaneGuardException("搜索模板必须内联 source，不允许按已存 id 执行");
            }
            /* _rank_eval 等端点把已存模板引用放在 requests[].template_id：
               只查根 id 会让模板服务端执行通道漏网。 */
            if (containsKeyDeep(root, "template_id")) {
                throw new ControlPlaneGuardException("不允许按已存模板 id 执行（template_id）");
            }
        } catch (ControlPlaneGuardException e) {
            throw e;
        } catch (Exception e) {
            throw new ControlPlaneGuardException("搜索模板 body 不是合法 JSON，已拒绝");
        }
    }

    private static boolean containsKeyDeep(Object node, String key) {
        if (node instanceof Map) {
            for (Map.Entry<?, ?> e : ((Map<?, ?>) node).entrySet()) {
                if (e.getKey() instanceof String && key.equals(e.getKey())) return true;
                if (containsKeyDeep(e.getValue(), key)) return true;
            }
        } else if (node instanceof java.util.Collection) {
            for (Object one : (java.util.Collection<?>) node) {
                if (containsKeyDeep(one, key)) return true;
            }
        }
        return false;
    }

    /**
     * 别名原子操作。POST /_aliases，body 形如 {"actions":[{"add":{...}},{"remove":{...}}]}，
     * 所有 action 在 ES 内部一次元数据变更中完成——零停机切流量的根基。
     */
    public Map<String, Object> aliasActions(String body) throws IOException {
        return aliasActions(body, false);
    }

    /**
     * @param addOnly true 时仅允许单条 add（config-validator 页建索引后的别名挂载），
     *                拒绝 remove/remove_index——页面写权不能借共享端点扩大为别名删除权。
     */
    public Map<String, Object> aliasActions(String body, boolean addOnly) throws IOException {
        if (body == null || body.trim().isEmpty()) throw new IllegalArgumentException("body 不能为空");
        guardAliasActionsBody(body, addOnly);
        return performJson("POST", "/_aliases", body);
    }

    /**
     * 别名操作 body 守卫：actions 里 add/remove 的 index 字段逐个过通配守卫。
     * 字面 body 闸只认控制名子串，拦不住 {@code "esquerystudio*"} 这类无下划线字面的
     * 通配形态——别名一旦绑上控制索引，后续按名守卫对别名全部失明。
     */
    void guardAliasActionsBody(String body) {
        guardAliasActionsBody(body, false);
    }

    void guardAliasActionsBody(String body, boolean addOnly) {
        body = stripBom(body);
        guardControlBody(body);
        if (body == null || body.isEmpty()) return;
        final Object actions;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            actions = root.get("actions");
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            if (addOnly) throw new IllegalArgumentException("别名操作仅允许新增（add）");
            return; // 非 JSON 交由 ES 原始报错，字面控制索引已由 guardControlBody 拦截
        }
        if (addOnly) requireSingleAdd(actions);
        if (!(actions instanceof java.util.List)) return;
        for (Object one : (java.util.List<?>) actions) {
            if (!(one instanceof Map)) continue;
            for (Object op : ((java.util.Map<?, ?>) one).values()) {
                if (!(op instanceof Map)) continue;
                /* _aliases 动作同时接受 index 与 indices（复数）；只查单数会让
                   {"indices":["*"]} 的通配绑定绕过守卫。 */
                for (String field : new String[]{"index", "indices"}) {
                    Object index = ((java.util.Map<?, ?>) op).get(field);
                    if (index instanceof String) {
                        guardIndexPattern((String) index);
                    } else if (index instanceof java.util.List) {
                        for (Object n : (java.util.List<?>) index) {
                            if (n instanceof String) guardIndexPattern((String) n);
                        }
                    }
                }
            }
        }
    }

    private static void requireSingleAdd(Object actions) {
        if (!(actions instanceof java.util.List) || ((java.util.List<?>) actions).size() != 1) {
            throw new IllegalArgumentException("当前页面授权仅允许单条新增别名（add）");
        }
        Object one = ((java.util.List<?>) actions).get(0);
        if (!(one instanceof java.util.Map) || ((java.util.Map<?, ?>) one).size() != 1
                || !((java.util.Map<?, ?>) one).containsKey("add")) {
            throw new IllegalArgumentException("当前页面授权仅允许新增别名（add）");
        }
        Object add = ((java.util.Map<?, ?>) one).get("add");
        if (!(add instanceof java.util.Map)) {
            throw new IllegalArgumentException("别名 add 参数缺失");
        }
        java.util.Map<?, ?> a = (java.util.Map<?, ?>) add;
        /* 建索引后的挂载只允许 index+alias 两个键：is_write_index 可改写既有别名的
           写路由，routing/filter/indices 也会扩大动作面，一律拒绝。 */
        for (Object k : a.keySet()) {
            String key = String.valueOf(k);
            if (!"index".equals(key) && !"alias".equals(key)) {
                throw new IllegalArgumentException("当前页面授权不允许别名参数：" + key);
            }
        }
        Object index = a.get("index");
        Object alias = a.get("alias");
        if (!(index instanceof String) || ((String) index).trim().isEmpty()
                || !(alias instanceof String) || ((String) alias).trim().isEmpty()) {
            throw new IllegalArgumentException("别名 add 必须携带 index 与 alias");
        }
    }
}
