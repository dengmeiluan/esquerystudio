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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * {@link AdhocJobStore} 的 ES 档（ 平台化底座）：作业落控制集群索引
 * {@value #DEFAULT_INDEX}（首次使用建索引），重启后仍可在列表页看历史。
 * 照 {@link io.github.dengmeiluan.esquerystudio.console.auth.EsConsoleOpsAuditStore} 范式：
 * 客户端 {@link Supplier} 懒解析 + 低层 REST + {@link ObjectMapper} 手工组 body。
 *
 * <p><b>与审计（append-only POST /_doc 由 ES 生成 id）不同，作业是 upsert 语义</b>：
 * 同 jobId 反复落状态变更。这里用 <b>{@code PUT /{index}/_doc/{jobId}}</b>——
 * 带文档 id 的 PUT 天然整篇覆盖，无需 {@code _update} 端点
 * （后者 6.x/7.x 路径形态有差异，与 {@code EsConnStore} 的取舍一致）。</p>
 *
 * <p><b>文档形态刻意与 Jdbc 档的表结构逐列同构</b>（job_id / status_name / index_name /
 * created_ts / updated_ts / payload_json），而<b>不是</b>把 {@link AdhocRebuildJob#toMap()}
 * 摊平进文档根。理由是 ES 特有的：toMap 含 {@code report}（任意嵌套 Map）与 {@code rounds}
 * （对象数组），摊平后由动态映射逐字段建 mapping——不同作业的同名字段类型一旦不一致
 * （如某作业 report.x 是数字、另一作业是字符串），后来的 index 请求<b>直接 400</b>，
 * 作业记录从此写不进去。整篇塞进 {@code payload_json}（{@code index:false}）
 * 换来 mapping 面积恒定，代价只是 payload 内部不可检索——而列表/详情只按
 * updated_ts 排序、按 jobId 直取，本就不需要。</p>
 *
 * <p><b>方案 A（查询视图）</b>：与 {@link JdbcAdhocJobStore} 同一套序列化/反序列化——
 * {@link AdhocRebuildJob} 大量字段 {@code final} 且无公共默认构造，无法被 Jackson 直接
 * 反序列化，故 {@code payload_json} 存 {@code toMap()} 快照，回读时以
 * {@link AdhocRebuildJob#minimal(String)} 重建骨架、只回填有 setter 的可查询字段。
 * 回读得到的是「查询视图」，非可继续跑的活作业——活作业永远命中 service 的内存一级缓存。</p>
 *
 * <p>契约红线：{@link #save} 失败（含建索引失败）只 {@code warn} 不上抛，
 * 持久化永不反噬正在跑的 reindex。{@link #find}/{@link #listRecent} 是查询路径，失败照
 * 审计档的做法抛 {@link IllegalStateException}，让调用方看见「查不到」而非静默空列表。</p>
 *
 * @author aicoding
 */
public class EsAdhocJobStore implements AdhocJobStore {

    /**
     * 默认索引名（仅当构造未指定时兜底；装配侧显式传名）。
     *
     * <p><b>刻意不带前导点</b>：本工程既有控制索引（{@code esquerystudio_ops_audit} /
     * {@code esquerystudio_user} / {@code esquerystudio_conn}）全部无点，且 ES 7.x 对
     * 「非系统索引却以 . 开头」发弃用告警。代价是本索引会出现在
     * {@code EsIndexAdmin} 的索引列表里（该处按 {@code startsWith(".")} 过滤系统索引）——
     * 但既有控制索引本就同样可见，一致性优先于藏起来。</p>
     */
    public static final String DEFAULT_INDEX = "esquerystudio_adhoc_job";

    private static final Logger logger = LoggerFactory.getLogger(EsAdhocJobStore.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String DOC_TYPE = "_doc";
    private static final String ALREADY_EXISTS_TYPE = "resource_already_exists_exception";

    /**
     * 最小 mapping：只显式声明<b>被查询/排序依赖</b>的字段，其余交给动态映射。
     *
     * <p>{@code updated_ts} 必须显式为 {@code long}——{@link #listRecent} 按它倒序排序，
     * 若被动态映射猜成 {@code text}，排序<b>直接 400</b>（text 默认不可 fielddata）。
     * 审计档没这个问题是因为它排序的 {@code timestamp} 字段第一篇文档就是数字、
     * 且它不承担「索引可能被别处先建出来」的风险；这里不赌动态映射的猜测结果。
     * {@code payload_json} 声明 {@code index:false}：只存不检索，省倒排开销。</p>
     */
    private static final String MAPPING_PROPERTIES =
            "{\"properties\":{"
                    + "\"job_id\":{\"type\":\"keyword\"},"
                    + "\"status_name\":{\"type\":\"keyword\"},"
                    + "\"index_name\":{\"type\":\"keyword\"},"
                    // target-aware adhoc：目标身份三列（keyword 供按集群过滤历史作业）。
                    // 存量索引未显式加列也无碍——mapping 未关 dynamic，首篇带新字段的文档自动补列。
                    + "\"target_id\":{\"type\":\"keyword\"},"
                    + "\"target_name\":{\"type\":\"keyword\"},"
                    + "\"target_es_version\":{\"type\":\"keyword\"},"
                    + "\"created_ts\":{\"type\":\"long\"},"
                    + "\"updated_ts\":{\"type\":\"long\"},"
                    + "\"payload_json\":{\"type\":\"text\",\"index\":false}"
                    + "}}";

    private final Supplier<RestHighLevelClient> client;
    private final String jobIndex;
    private volatile boolean indexReady;

    public EsAdhocJobStore(Supplier<RestHighLevelClient> client, String jobIndex) {
        this.client = client;
        this.jobIndex = jobIndex == null || jobIndex.trim().isEmpty() ? DEFAULT_INDEX : jobIndex.trim();
    }

    /**
     * 状态变更时 upsert（同 jobId 覆盖，不产生重复）。失败只记日志，不上抛（契约红线）。
     *
     * <p>{@code refresh=true}：状态刚变就点开列表页要能看见，与 {@code EsConnStore} 的
     * 保存路径同一取舍。作业状态变更是<b>低频</b>（一个作业数次），不是热写入路径。</p>
     */
    @Override
    public void save(AdhocRebuildJob job) {
        if (job == null) {
            return;
        }
        try {
            ensureIndex();
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("job_id", job.getJobId());
            doc.put("status_name", job.getStatus());
            doc.put("index_name", job.getLogicalName());
            doc.put("target_id", job.getTargetId());
            doc.put("target_name", job.getTargetNameSnapshot());
            doc.put("target_es_version", job.getTargetEsVersionSnapshot());
            doc.put("created_ts", job.getStartedAt());
            doc.put("updated_ts", System.currentTimeMillis());
            doc.put("payload_json", MAPPER.writeValueAsString(job.toMap()));
            Request req = new Request("PUT", "/" + jobIndex + "/" + DOC_TYPE + "/" + job.getJobId() + "?refresh=true");
            req.setJsonEntity(MAPPER.writeValueAsString(doc));
            client.get().getLowLevelClient().performRequest(req);
        } catch (Exception e) {
            logger.warn("[esquerystudio-adhoc-es] 落作业失败（忽略，不反噬重建）：jobId={} {}",
                    job.getJobId(), e.getMessage(), e);
        }
    }

    /** 按 jobId 查；未命中（404）返回 {@link Optional#empty()}。 */
    @Override
    public Optional<AdhocRebuildJob> find(String jobId) {
        if (jobId == null || jobId.trim().isEmpty()) {
            return Optional.empty();
        }
        ensureIndex();
        try {
            Response resp = client.get().getLowLevelClient().performRequest(
                    new Request("GET", "/" + jobIndex + "/" + DOC_TYPE + "/" + jobId.trim()));
            @SuppressWarnings("unchecked")
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            Object src = raw.get("_source");
            if (!(src instanceof Map)) {
                return Optional.empty();
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> source = (Map<String, Object>) src;
            return Optional.of(rehydrate(jobId.trim(), str(source.get("payload_json"))));
        } catch (ResponseException e) {
            // 文档不存在与索引不存在都是 404：都按「查无此作业」处理。
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return Optional.empty();
            }
            throw new IllegalStateException("查询作业失败(es): " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("查询作业失败(es): " + e.getMessage(), e);
        }
    }

    /**
     * 最近 {@code limit} 条（新的在前，按 updated_ts 倒序），供列表页。
     * 二级键 job_id 倒序：同毫秒 updated_ts 时给出确定顺序，消除排序 flaky（与 Jdbc 档一致）。
     */
    @Override
    @SuppressWarnings("unchecked")
    public List<AdhocRebuildJob> listRecent(int limit) {
        ensureIndex();
        int lim = Math.min(Math.max(limit, 1), 500);
        try {
            String body = "{\"size\":" + lim
                    + ",\"sort\":[{\"updated_ts\":{\"order\":\"desc\"}},{\"job_id\":{\"order\":\"desc\"}}]"
                    + ",\"query\":{\"match_all\":{}}}";
            Request req = new Request("POST", "/" + jobIndex + "/_search");
            req.setJsonEntity(body);
            Response resp = client.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            return parseHits(raw);
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return new ArrayList<>();
            }
            throw new IllegalStateException("列表查询作业失败(es): " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("列表查询作业失败(es): " + e.getMessage(), e);
        }
    }

    /** 删除指定作业（worker 提交失败等需彻底清除，不留 RUNNING 僵尸）。失败只 warn 不上抛。 */
    @Override
    public void remove(String jobId) {
        try {
            ensureIndex();
            Request req = new Request("DELETE", "/" + jobIndex + "/" + DOC_TYPE + "/" + jobId + "?refresh=true");
            client.get().getLowLevelClient().performRequest(req);
        } catch (Exception e) {
            logger.warn("[esquerystudio-adhoc-es] 删除作业失败（忽略）：jobId={} {}", jobId, e.getMessage(), e);
        }
    }

    /** {@code hits.hits[]} → 作业列表；结构不符的条目跳过（宁可少一条，不要整页崩）。 */
    private List<AdhocRebuildJob> parseHits(Map<String, Object> raw) {
        List<AdhocRebuildJob> out = new ArrayList<>();
        Object hits = raw == null ? null : raw.get("hits");
        if (!(hits instanceof Map)) {
            return out;
        }
        Object inner = ((Map<?, ?>) hits).get("hits");
        if (!(inner instanceof List)) {
            return out;
        }
        for (Object h : (List<?>) inner) {
            if (!(h instanceof Map)) {
                continue;
            }
            Map<?, ?> hit = (Map<?, ?>) h;
            Object src = hit.get("_source");
            Map<?, ?> source = src instanceof Map ? (Map<?, ?>) src : Collections.emptyMap();
            // jobId 优先取 _source.job_id，缺失回落文档 _id（两者本就同值）。
            String jobId = str(source.get("job_id"));
            if (jobId == null) {
                jobId = str(hit.get("_id"));
            }
            if (jobId == null) {
                continue;
            }
            out.add(rehydrate(jobId, str(source.get("payload_json"))));
        }
        return out;
    }

    /**
     * 方案 A 回读：payload（toMap 快照）反序列化成 Map，用 minimal 骨架 + setter 回填可查询字段。
     * final 字段（logicalName/strategy/...）灌不回骨架，是 A 的诚实边界——与 Jdbc 档同一取舍。
     */
    private AdhocRebuildJob rehydrate(String jobId, String payloadJson) {
        AdhocRebuildJob job = AdhocRebuildJob.minimal(jobId);
        if (payloadJson == null || payloadJson.isEmpty()) {
            return job;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = MAPPER.readValue(payloadJson, Map.class);
            setIfString(m.get("status"), job::setStatus);
            setIfString(m.get("stage"), job::setStage);
            setIfString(m.get("error"), job::setError);
            setIfString(m.get("currentTaskId"), job::setCurrentTaskId);
            // target-aware adhoc：旧 payload 无 targetId 字段 → getOrDefault 归一 host（迁移既定语义）
            job.restoreTarget(str(m.getOrDefault("targetId", AdhocRebuildJob.TARGET_HOST)),
                    str(m.get("targetName")), str(m.get("targetEsVersion")));
            job.restoreOwner(str(m.get("ownerUsername")), str(m.get("ownerRole")));
            Object lockActive = m.get("lockActive");
            if (lockActive instanceof Boolean) {
                job.setLockActive((Boolean) lockActive);
            }
        } catch (Exception e) {
            // 反序列化失败不致命：至少返回带 jobId 的骨架，列表/查看仍能显示 id。
            logger.warn("[esquerystudio-adhoc-es] payload 反序列化失败，返回骨架：jobId={} {}",
                    jobId, e.getMessage(), e);
        }
        return job;
    }

    private void setIfString(Object v, java.util.function.Consumer<String> setter) {
        if (v instanceof String) {
            setter.accept((String) v);
        }
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    /**
     * 首次使用建索引（幂等，双检锁）。
     *
     * <p>三处刻意照抄既有实证、不自己发明：</p>
     * <ol>
     *   <li><b>存在性判据落在状态码上</b>：低层 RestClient 对 HEAD 的 404 <b>不抛
     *   {@link ResponseException}</b>（HEAD 无响应体，被当作合法结果正常返回）。
     *   若按「抛异常=不存在」写，不存在的索引会被判成存在、直接跳过建索引——
     *   {@code VersionAwareLockDocPort} 在 6.7.2 上首跑即栽在这里。</li>
     *   <li><b>typeless 先行、400 再 typed 重试</b>：6.x 的 mappings 必须包 {@code _doc} 层，
     *   7.x 反过来拒绝 type 包层。此处无版本探测器可用（构造只收 client），
     *   照 {@code ControlIndexInitializer} 的「先 typeless、400 转 typed」兜底。</li>
     *   <li><b>「已存在」判据落在 {@code error.type} 值上，不落在异常消息文本上</b>：
     *   {@code contains} 会把「reason 文本里恰好提到该串」的<b>真失败</b>吞成幂等成功。</li>
     * </ol>
     *
     * <p>建索引失败<b>不置 {@code indexReady}</b>：下次调用重试。save 侧包在 try-catch 里
     * 只 warn（契约红线）；查询侧让异常上抛，与审计档一致。</p>
     */
    private void ensureIndex() {
        if (indexReady) {
            return;
        }
        synchronized (this) {
            if (indexReady) {
                return;
            }
            try {
                if (exists()) {
                    indexReady = true;
                    return;
                }
                try {
                    create(false);
                } catch (ResponseException e) {
                    if (e.getResponse().getStatusLine().getStatusCode() != 400 || alreadyExists(e)) {
                        throw e;
                    }
                    logger.info("[EsAdhocJobStore] typeless 建索引 400（目标疑似 6.x），typed 形态重试: {}", jobIndex);
                    create(true);
                }
                indexReady = true;
                logger.info("[EsAdhocJobStore] index ready: {}", jobIndex);
            } catch (Exception e) {
                if (alreadyExists(e)) {
                    // 并发实例抢先建出来了：幂等成功。
                    indexReady = true;
                    logger.info("[EsAdhocJobStore] index already exists (idempotent ok): {}", jobIndex);
                    return;
                }
                throw new IllegalStateException("初始化作业索引失败: " + jobIndex + " - " + e.getMessage(), e);
            }
        }
    }

    /** HEAD /{index}：判据是<b>状态码 200</b>，不是「有没有抛异常」。见 {@link #ensureIndex} 注释。 */
    private boolean exists() throws Exception {
        try {
            Response resp = client.get().getLowLevelClient().performRequest(
                    new Request("HEAD", "/" + jobIndex));
            return resp.getStatusLine().getStatusCode() == 200;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return false;
            }
            throw e;
        }
    }

    /** PUT /{index}：typed=true 时 mappings 包 {@code _doc} 层（6.x 必需）。 */
    private void create(boolean typed) throws Exception {
        @SuppressWarnings("unchecked")
        Map<String, Object> props = MAPPER.readValue(MAPPING_PROPERTIES, Map.class);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("mappings", typed ? Collections.singletonMap(DOC_TYPE, props) : props);
        Request req = new Request("PUT", "/" + jobIndex);
        req.setJsonEntity(MAPPER.writeValueAsString(body));
        client.get().getLowLevelClient().performRequest(req);
    }

    /** 「索引已存在」判据：{@code error.type} 这个<b>结构化位置上的值</b>，不是消息子串。 */
    private static boolean alreadyExists(Throwable e) {
        return ALREADY_EXISTS_TYPE.equals(errorType(e));
    }

    /** 从 {@link ResponseException} 响应体解析 {@code error.type}；解析不出返回 null。 */
    private static String errorType(Throwable e) {
        if (!(e instanceof ResponseException)) {
            return null;
        }
        try {
            String body = org.apache.http.util.EntityUtils.toString(
                    ((ResponseException) e).getResponse().getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> root = MAPPER.readValue(body, Map.class);
            Object error = root.get("error");
            if (!(error instanceof Map)) {
                return null;
            }
            Object type = ((Map<?, ?>) error).get("type");
            return type == null ? null : String.valueOf(type);
        } catch (Exception ignored) {
            // 裁决（三态之③刻意降级维持静默）：此臂只可能因「ResponseException 响应体
            // 不可读 / 非 ES 标准错误结构」触发，返回 null → alreadyExists=false → ensureIndex
            // 抛 IllegalStateException——save 侧按契约红线 WARN「落作业失败」、find/listRecent
            // 直接上抛，失败链全程响亮，此处再加日志只会双重告警。维持零 WARN，
            // 由 Observability552Test 契约反锁（save 恰 1 条 WARN 且只允许是「落作业失败」）。
            return null;
        }
    }
}
