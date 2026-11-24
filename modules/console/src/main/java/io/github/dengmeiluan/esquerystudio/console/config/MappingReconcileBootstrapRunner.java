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

package io.github.dengmeiluan.esquerystudio.console.config;

import io.github.dengmeiluan.esquerystudio.console.control.EntityMappingDeriver;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import io.github.dengmeiluan.esquerystudio.console.mapping.ElasticsearchOperationsMappingPort;
import io.github.dengmeiluan.esquerystudio.console.mapping.MappingReconcileReport;
import io.github.dengmeiluan.esquerystudio.console.mapping.MappingReconciler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

public final class MappingReconcileBootstrapRunner {

    private static final Logger LOG = LoggerFactory.getLogger(MappingReconcileBootstrapRunner.class);

    private final ListableBeanFactory beanFactory;
    private final IndexMetaRegistry registry;
    private final EntityMappingDeriver entityMappingDeriver;
    private final ESQueryStudioElasticsearchProperties properties;
    private final AtomicBoolean started = new AtomicBoolean();

    /** 最近一次启动对账的报告快照(ESQueryStudio「启动对账」抽屉的数据源;容量上限 200 条)。 */
    private static final AtomicReference<List<Map<String, Object>>> LAST_REPORTS =
            new AtomicReference<>(Collections.emptyList());

    /** Console 端点读取:最近一轮对账的逐索引报告(仅 client 模式 runner 执行后有内容)。 */
    public static List<Map<String, Object>> latestReportsSnapshot() {
        return LAST_REPORTS.get();
    }

    public MappingReconcileBootstrapRunner(ListableBeanFactory beanFactory,
                                           IndexMetaRegistry registry,
                                           EntityMappingDeriver entityMappingDeriver,
                                           ESQueryStudioElasticsearchProperties properties) {
        this.beanFactory = Objects.requireNonNull(beanFactory, "beanFactory");
        this.registry = Objects.requireNonNull(registry, "registry");
        this.entityMappingDeriver = Objects.requireNonNull(entityMappingDeriver, "entityMappingDeriver");
        this.properties = Objects.requireNonNull(properties, "properties");
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        if (!started.compareAndSet(false, true)) {
            return;
        }
        ExecutorService executor = Executors.newSingleThreadExecutor(task -> {
            Thread thread = new Thread(task, "es-mapping-reconcile");
            thread.setDaemon(true);
            return thread;
        });
        executor.submit(() -> {
            try {
                runOnce();
            } finally {
                executor.shutdown();
            }
        });
    }

    List<MappingReconcileReport.Status> runOnce() {
        try {
            return doRunOnce();
        } catch (RuntimeException e) {
            LOG.error("[MappingReconcile] status=FAILED_ES reason=RUNNER_FAILED", e);
            return Collections.singletonList(MappingReconcileReport.Status.FAILED_ES);
        }
    }

    private List<MappingReconcileReport.Status> doRunOnce() {
        String[] candidateNames = beanFactory.getBeanNamesForType(
                ElasticsearchOperations.class, true, false);
        if (candidateNames.length == 0) {
            LOG.info("[MappingReconcile] status=SKIPPED_NO_CLIENT");
            return Collections.singletonList(MappingReconcileReport.Status.SKIPPED_NO_CLIENT);
        }
        if (candidateNames.length > 1) {
            LOG.error("[MappingReconcile] status=FAILED_ES reason=AMBIGUOUS_CLIENT candidates={}",
                    candidateNames.length);
            return Collections.singletonList(MappingReconcileReport.Status.FAILED_ES);
        }
        ElasticsearchOperations operations = beanFactory.getBean(
                candidateNames[0], ElasticsearchOperations.class);

        ElasticsearchOperationsMappingPort port = new ElasticsearchOperationsMappingPort(operations);
        MappingReconciler reconciler = new MappingReconciler(port, properties);
        List<MappingReconcileReport.Status> statuses = new ArrayList<MappingReconcileReport.Status>();
        List<Map<String, Object>> reports = new ArrayList<Map<String, Object>>();
        for (RebuildableIndexMeta meta : registry.listMetas()) {
            try {
                String desiredMapping = entityMappingDeriver.declaredOrDerived(
                        meta.getMappingJson(), meta.getEntityClass());
                if (desiredMapping == null || desiredMapping.trim().isEmpty()) {
                    LOG.info("[MappingReconcile] indexKey={} index={} reason=NO_MAPPING_SOURCE",
                            meta.getIndexKey(), meta.getAliasName());
                    continue;
                }
                MappingReconcileReport report = reconciler.reconcile(
                        meta, desiredMapping, sourceFor(meta));
                statuses.add(report.getStatus());
                reports.add(reportSnapshot(report));
            } catch (RuntimeException e) {
                statuses.add(MappingReconcileReport.Status.FAILED_ES);
                reports.add(reportEntry(meta.getIndexKey(), meta.getAliasName(),
                        MappingReconcileReport.Status.FAILED_ES.name(), "RUNNER_EXCEPTION", null, 0, 0));
                LOG.error("[MappingReconcile] indexKey={} index={} status=FAILED_ES",
                        meta.getIndexKey(), meta.getAliasName(), e);
            }
        }
        LAST_REPORTS.set(Collections.unmodifiableList(reports));
        return Collections.unmodifiableList(statuses);
    }

    private static Map<String, Object> reportEntry(String indexKey, String index, String status,
                                                   String reason, String action, int added, int conflicts) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("indexKey", indexKey);
        m.put("index", index);
        m.put("status", status);
        m.put("reason", reason);
        m.put("action", action);
        m.put("addedCount", added);
        m.put("conflictCount", conflicts);
        return m;
    }

    private static Map<String, Object> reportSnapshot(MappingReconcileReport r) {
        Map<String, Object> m = reportEntry(r.getIndexKey(), r.getLogicalIndex(),
                r.getStatus().name(), r.getDetail(), r.getAction(),
                r.getAddedFields().size(), r.getConflicts().size());
        m.put("addedFields", r.getAddedFields());
        return m;
    }

    static MappingReconcileReport.Source sourceFor(RebuildableIndexMeta meta) {
        return meta.hasMapping()
                ? MappingReconcileReport.Source.MAPPING_FILE
                : MappingReconcileReport.Source.ANNOTATION_DERIVED;
    }
}
