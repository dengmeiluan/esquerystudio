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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import org.elasticsearch.action.DocWriteRequest;
import org.elasticsearch.action.bulk.BulkItemResponse;
import org.elasticsearch.action.bulk.BulkRequest;
import org.elasticsearch.action.bulk.BulkResponse;
import org.elasticsearch.action.index.IndexRequest;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RequestOptions;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.elasticsearch.rest.RestStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 单 slice 搬运 worker。
 *
 * <p><b>跨大版本兼容关键</b>：读旧集群一律走 <b>low-level REST + 自解析 JSON</b>（{@link RestClient}），
 * 绕开 high-level {@code SearchResponse} 的版本耦合——6.x 的 {@code hits.total} 是数字、7.x 是对象，
 * 用 RHLC high-level 解析 6.x scroll 响应会炸。写新集群（同大版本）仍用 high-level {@link RestHighLevelClient} bulk。</p>
 *
 * <p>背压：拉一批写一批、不预取；响应 {@link MigrationHandle#isAborted()} 随时停。
 * 去重：目标已存在同 _id 返回 409 CONFLICT，计 conflicts 不报错（可重放、续传重跑整 slice 安全）。</p>
 */
public class SliceWorker implements Runnable {

    private static final Logger logger = LoggerFactory.getLogger(SliceWorker.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final int sliceId;
    private final int totalSlices;
    private final String sourceIndex;
    private final String destIndex;
    private final int batchSize;
    private final int scrollKeepAliveSec;
    private final RestClient remoteLowLevel;
    private final RestHighLevelClient localClient;
    private final MigrationHandle handle;
    private final MigrateJobTracker tracker;
    private final ESQueryStudioElasticsearchProperties.Retry retry;

    public SliceWorker(int sliceId, int totalSlices, String sourceIndex, String destIndex,
                       int batchSize, int scrollKeepAliveSec,
                       RestClient remoteLowLevel, RestHighLevelClient localClient,
                       MigrationHandle handle, MigrateJobTracker tracker, ESQueryStudioElasticsearchProperties.Retry retry) {
        this.sliceId = sliceId;
        this.totalSlices = totalSlices;
        this.sourceIndex = sourceIndex;
        this.destIndex = destIndex;
        this.batchSize = batchSize;
        this.scrollKeepAliveSec = scrollKeepAliveSec;
        this.remoteLowLevel = remoteLowLevel;
        this.localClient = localClient;
        this.handle = handle;
        this.tracker = tracker;
        this.retry = retry;
    }

    @Override
    public void run() {
        handle.markSlice(sliceId, MigrateJobTracker.SLICE_RUNNING);
        String scrollId = null;
        try {
            Map<String, Object> page = firstPage();
            scrollId = (String) page.get("_scroll_id");
            List<Doc> docs = extractDocs(page);

            while (!docs.isEmpty()) {
                if (handle.isAborted()) {
                    break;
                }
                writeBatch(docs);
                if (handle.tryPersistSlot()) {
                    tracker.save(handle.toJobEs());
                }
                if (handle.isAborted()) {
                    break;
                }
                page = nextPage(scrollId);
                scrollId = (String) page.get("_scroll_id");
                docs = extractDocs(page);
            }

            if (handle.isAborted()) {
                handle.markSlice(sliceId, MigrateJobTracker.SLICE_PENDING); // resume 重跑整 slice（create 幂等）
            } else {
                handle.markSlice(sliceId, MigrateJobTracker.SLICE_DONE);
            }
        } catch (Exception e) {
            handle.markSlice(sliceId, MigrateJobTracker.SLICE_FAILED);
            handle.addErrors(0, "slice " + sliceId + " 异常: " + e.getMessage());
            // slice 级失败观测——catch 兜底致命异常计 1 次（bulk 级可重试失败已计全局 errors），
            // 前端进度列据此渲染失败切片红 chip；与 sliceStatus 并存，向后兼容只加不改
            handle.addSliceError(sliceId, 1L);
            logger.warn("[SliceWorker] slice {} failed: {}", sliceId, e.getMessage(), e);
        } finally {
            clearScrollQuietly(scrollId);
            handle.forcePersistSlot();
            tracker.save(handle.toJobEs());
        }
    }

    // ---------------------------------------------------------------- 远端读取（low-level）

    /** 首页：sliced scroll 起始查询。 */
    private Map<String, Object> firstPage() throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("size", batchSize);
        body.put("_source", true);
        body.put("sort", new String[]{"_doc"});
        if (totalSlices > 1) {
            Map<String, Object> slice = new LinkedHashMap<>();
            slice.put("id", sliceId);
            slice.put("max", totalSlices);
            body.put("slice", slice);
        }
        Request req = new Request("POST", "/" + sourceIndex + "/_search");
        req.addParameter("scroll", scrollKeepAliveSec + "s");
        req.setJsonEntity(OBJECT_MAPPER.writeValueAsString(body));
        return perform(req);
    }

    /** 续页：滚动游标。 */
    private Map<String, Object> nextPage(String scrollId) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("scroll", scrollKeepAliveSec + "s");
        body.put("scroll_id", scrollId);
        Request req = new Request("POST", "/_search/scroll");
        req.setJsonEntity(OBJECT_MAPPER.writeValueAsString(body));
        return perform(req);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> perform(Request req) throws Exception {
        Response resp = remoteLowLevel.performRequest(req);
        String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
        return OBJECT_MAPPER.readValue(body, Map.class);
    }

    /** 从响应解析出 {@code hits.hits[]} → (_id, _source)。 */
    @SuppressWarnings("unchecked")
    private List<Doc> extractDocs(Map<String, Object> page) {
        List<Doc> out = new ArrayList<>();
        Object hitsWrap = page.get("hits");
        if (!(hitsWrap instanceof Map)) {
            return out;
        }
        Object hitsArr = ((Map<String, Object>) hitsWrap).get("hits");
        if (!(hitsArr instanceof List)) {
            return out;
        }
        for (Object o : (List<Object>) hitsArr) {
            if (!(o instanceof Map)) {
                continue;
            }
            Map<String, Object> hit = (Map<String, Object>) o;
            String id = hit.get("_id") == null ? null : String.valueOf(hit.get("_id"));
            Object src = hit.get("_source");
            if (id != null && src instanceof Map) {
                out.add(new Doc(id, (Map<String, Object>) src));
            }
        }
        return out;
    }

    // ---------------------------------------------------------------- 本地写入（high-level bulk）

    private void writeBatch(List<Doc> docs) throws Exception {
        List<IndexRequest> requests = new ArrayList<>(docs.size());
        for (Doc d : docs) {
            requests.add(new IndexRequest(destIndex)
                    .id(d.id)
                    .source(d.source)
                    .opType(DocWriteRequest.OpType.CREATE));
        }
        executeWithRetry(requests);
    }

    /** 逐项归类：created→migrated；409 CONFLICT→conflicts；其它失败→收集重试，耗尽计 errors。 */
    private void executeWithRetry(List<IndexRequest> requests) throws Exception {
        List<IndexRequest> pending = requests;
        long backoff = retry.getInitBackoffMs();
        int attempt = 0;
        while (true) {
            attempt++;
            BulkRequest bulk = new BulkRequest();
            for (IndexRequest ir : pending) {
                bulk.add(ir);
            }
            BulkResponse br = localClient.bulk(bulk, RequestOptions.DEFAULT);

            long created = 0;
            long conflict = 0;
            List<IndexRequest> retryable = new ArrayList<>();
            int idx = 0;
            for (BulkItemResponse item : br.getItems()) {
                IndexRequest src = pending.get(idx++);
                if (!item.isFailed()) {
                    created++;
                } else if (item.getFailure() != null && item.getFailure().getStatus() == RestStatus.CONFLICT) {
                    conflict++;
                } else {
                    retryable.add(src);
                }
            }
            if (created > 0) {
                handle.addMigrated(sliceId, created);
            }
            if (conflict > 0) {
                handle.addConflicts(conflict);
            }

            if (retryable.isEmpty()) {
                return;
            }
            if (attempt >= retry.getMaxAttempts() || handle.isAborted()) {
                handle.addErrors(retryable.size(), "slice " + sliceId + " bulk 失败 " + retryable.size()
                        + " 条，已重试 " + attempt + " 次");
                return;
            }
            warnBulkRetry(attempt, retryable.size());
            Thread.sleep(Math.min(backoff, retry.getMaxBackoffMs()));
            backoff = Math.min(backoff * 2, retry.getMaxBackoffMs());
            pending = retryable;
        }
    }

    /**
     * bulk 可重试失败进入退避重试前的 WARN 留痕（观测缺口收口，纯日志零契约）。
     *
     * <p>缺口：重试窗口内的抖动（bulk 线程池满/网关 5xx）此前服务端日志零痕迹——只有耗尽
     * {@code maxAttempts} 才计 errors 落一条错误消息，排障时分不清「一次没成」还是
     * 「重试后自愈」。特征串 {@code [SliceWorker] slice 7 bulk retry attempt=1 pending=3}。
     * 契约不动：重试/耗尽计数与退避步进照旧（调用点仅插日志）。</p>
     */
    private void warnBulkRetry(int attempt, int pending) {
        logger.warn("[SliceWorker] slice {} bulk retry attempt={} pending={}（退避后重试，上限 {} 次）",
                sliceId, attempt, pending, retry.getMaxAttempts());
    }

    private void clearScrollQuietly(String scrollId) {
        if (scrollId == null) {
            return;
        }
        try {
            Request req = new Request("DELETE", "/_search/scroll");
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("scroll_id", new String[]{scrollId});
            req.setJsonEntity(OBJECT_MAPPER.writeValueAsString(body));
            remoteLowLevel.performRequest(req);
        } catch (Exception e) {
            /* debug→WARN——低频真异常路径（远端断连/网关 4xx），失败即 scroll
               上下文在远端残留到 keep-alive 到期（资源泄漏），留痕可查；吞异常契约不变 */
            logger.warn("[SliceWorker] clearScroll 失败（scroll 上下文残留，远端 keep-alive 到期后自清）: {}", e.getMessage(), e);
        }
    }

    /** 单条待迁移文档。 */
    private static final class Doc {
        final String id;
        final Map<String, Object> source;

        Doc(String id, Map<String, Object> source) {
            this.id = id;
            this.source = source;
        }
    }
}
