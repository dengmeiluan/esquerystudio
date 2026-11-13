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

import org.elasticsearch.index.query.QueryBuilders;
import org.elasticsearch.search.sort.SortBuilders;
import org.elasticsearch.search.sort.SortOrder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import io.github.dengmeiluan.esquerystudio.console.client.SdesCompat;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.IndexOperations;
import org.springframework.data.elasticsearch.core.SearchHit;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.data.elasticsearch.core.mapping.IndexCoordinates;
import org.springframework.data.elasticsearch.core.query.NativeSearchQueryBuilder;
import org.springframework.data.elasticsearch.core.query.Query;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 跨集群迁移作业存储（spring-data-es / {@link ElasticsearchOperations}，与 {@code EsRebuildJobStore} 同范式）。
 *
 * <p>两点关键同 {@code EsRebuildJobStore}：① {@code ensureIndex()} 主动建索引（去 repository bootstrap 后须显式建）；
 * ② {@link #save} 后显式 {@code refresh} 保读己写一致（面板 save 后立即读最新进度）。</p>
 */
public class MigrateJobStore {

    private static final Logger logger = LoggerFactory.getLogger(MigrateJobStore.class);

    private final java.util.function.Supplier<ElasticsearchOperations> elasticsearchOperations;
    private final IndexCoordinates coordinates;

    public MigrateJobStore(java.util.function.Supplier<ElasticsearchOperations> elasticsearchOperations, String fullIndexName) {
        this.elasticsearchOperations = elasticsearchOperations;
        this.coordinates = IndexCoordinates.of(fullIndexName);
    }

    /** 主动建迁移作业索引（启动后异步调用，失败仅告警、不阻断启动）。 */
    public void ensureIndex() {
        try {
            IndexOperations io = elasticsearchOperations.get().indexOps(coordinates);
            if (!io.exists()) {
                io.create();
                io.putMapping(io.createMapping(MigrateJobES.class));
                logger.info("[MigrateJobStore] migrate job index created: {}", coordinates.getIndexName());
            }
        } catch (Exception e) {
            logger.warn("[MigrateJobStore] ensureIndex failed (rely on auto-create on first write): {}", e.getMessage(), e);
        }
    }

    public void save(MigrateJobES job) {
        elasticsearchOperations.get().save(job, coordinates);
        /* ElasticsearchOperations.refresh(IndexCoordinates) 在 sdes 4.4.x 已移除，
           而 indexOps(coordinates).refresh() 在 4.0.9 与 4.4.18 上签名相同（javap 实测），
           故改走这条共存路径 —— 能用共存 API 消掉的差异不引入反射。 */
        elasticsearchOperations.get().indexOps(coordinates).refresh();
    }

    public MigrateJobES findById(String jobId) {
        return elasticsearchOperations.get().get(jobId, MigrateJobES.class, coordinates);
    }

    /** 近期作业列表（按 createTime 倒序，最多 limit 条）。 */
    public List<MigrateJobES> listRecent(int limit) {
        /* withPageable 在 sdes 4.4.x 上移到 BaseQueryBuilder 并返回父类型，
           链式接返回值会因返回类型不符而抛 NoSuchMethodError。builder 可变，
           调用即生效，故拆成分步。withQuery/withSort 两版签名相同（反射实测），保持链式。 */
        NativeSearchQueryBuilder builder = new NativeSearchQueryBuilder()
                .withQuery(QueryBuilders.matchAllQuery())
                .withSort(SortBuilders.fieldSort("createTime").order(SortOrder.DESC));
        SdesCompat.withPageable(builder, PageRequest.of(0, Math.max(1, limit)));
        Query query = builder.build();
        SearchHits<MigrateJobES> hits = elasticsearchOperations.get().search(query, MigrateJobES.class, coordinates);
        return hits.getSearchHits().stream()
                .map(SearchHit::getContent)
                .collect(Collectors.toList());
    }

    /** 列出指定状态的作业（启动期清扫 INTERRUPTED 用）。 */
    public List<MigrateJobES> listByStatus(String status, int limit) {
        /* 同 listRecent —— withPageable 摘出来走 SdesCompat，其余保持链式。 */
        NativeSearchQueryBuilder builder = new NativeSearchQueryBuilder()
                .withQuery(QueryBuilders.termQuery("status", status))
                .withSort(SortBuilders.fieldSort("createTime").order(SortOrder.DESC));
        SdesCompat.withPageable(builder, PageRequest.of(0, Math.max(1, limit)));
        Query query = builder.build();
        SearchHits<MigrateJobES> hits = elasticsearchOperations.get().search(query, MigrateJobES.class, coordinates);
        return hits.getSearchHits().stream()
                .map(SearchHit::getContent)
                .collect(Collectors.toList());
    }
}
