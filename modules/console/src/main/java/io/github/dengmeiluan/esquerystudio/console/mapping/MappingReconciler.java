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

package io.github.dengmeiluan.esquerystudio.console.mapping;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import org.apache.http.conn.ConnectTimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class MappingReconciler {

    private static final Logger LOG = LoggerFactory.getLogger(MappingReconciler.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String USE_ADHOC_REBUILD = "USE_ADHOC_REBUILD";

    private final MappingPort port;
    private final ESQueryStudioElasticsearchProperties.Mapping config;

    public MappingReconciler(MappingPort port, ESQueryStudioElasticsearchProperties properties) {
        this.port = Objects.requireNonNull(port, "port");
        ESQueryStudioElasticsearchProperties requiredProperties = Objects.requireNonNull(properties, "properties");
        this.config = Objects.requireNonNull(requiredProperties.getMapping(), "properties.mapping");
    }

    public MappingReconcileReport reconcile(RebuildableIndexMeta meta,
                                            String desiredMappingJson,
                                            MappingReconcileReport.Source source) {
        RebuildableIndexMeta requiredMeta = Objects.requireNonNull(meta, "meta");
        MappingReconcileReport.Source requiredSource = Objects.requireNonNull(source, "source");
        long startedAt = System.currentTimeMillis();
        String indexKey = requiredMeta.getIndexKey();
        String alias = requiredMeta.getAliasName();

        if (!"startup".equals(config.getAutoRegister())) {
            return report(indexKey, alias, Collections.<String>emptyList(), requiredSource,
                    Collections.<String>emptyList(), Collections.<String>emptyList(),
                    Collections.<MappingConflict>emptyList(), MappingReconcileReport.Status.DISABLED,
                    startedAt, "AUTO_REGISTER_OFF", null);
        }

        MappingSnapshot snapshot;
        try {
            snapshot = port.read(alias);
        } catch (IOException e) {
            MappingTargetResolutionException ambiguity = ambiguity(e);
            if (ambiguity != null) {
                return report(indexKey, alias, ambiguity.getObservedTargets(), requiredSource,
                        Collections.<String>emptyList(), Collections.<String>emptyList(),
                        Collections.<MappingConflict>emptyList(), MappingReconcileReport.Status.FAILED_ES,
                        startedAt, MappingTargetResolutionException.AMBIGUOUS_ALIAS_TARGET, null);
            }
            return failure(indexKey, alias, Collections.<String>emptyList(), requiredSource,
                    Collections.<String>emptyList(), Collections.<String>emptyList(),
                    Collections.<MappingConflict>emptyList(), startedAt, "READ_FAILED", null, e);
        }

        String logicalIndex = snapshot.getLogicalName();
        List<String> physicalIndices = snapshot.getIndexNames();
        if (physicalIndices.size() != 1) {
            return report(indexKey, logicalIndex, physicalIndices, requiredSource,
                    Collections.<String>emptyList(), Collections.<String>emptyList(),
                    Collections.<MappingConflict>emptyList(), MappingReconcileReport.Status.FAILED_ES,
                    startedAt, "AMBIGUOUS_ALIAS_TARGET", null);
        }
        String pinnedPhysicalIndex = physicalIndices.get(0);
        if (!snapshot.isIndexExists()) {
            MappingReconcileReport.Status status = "fail".equals(config.getMissingIndexPolicy())
                    ? MappingReconcileReport.Status.FAILED_INDEX_MISSING
                    : MappingReconcileReport.Status.SKIPPED_INDEX_MISSING;
            return report(indexKey, logicalIndex, physicalIndices, requiredSource,
                    Collections.<String>emptyList(), Collections.<String>emptyList(),
                    Collections.<MappingConflict>emptyList(), status, startedAt,
                    "INDEX_MISSING", null);
        }

        MappingDelta delta = MappingDeltaCalculator.calculate(desiredMappingJson, snapshot.getMappingJson());
        if (delta.isUnparsed()) {
            return report(indexKey, logicalIndex, physicalIndices, requiredSource,
                    Collections.<String>emptyList(), Collections.<String>emptyList(),
                    Collections.<MappingConflict>emptyList(), MappingReconcileReport.Status.MAPPING_UNPARSED,
                    startedAt, "DESIRED_OR_ACTUAL_MAPPING_UNPARSED", null);
        }

        List<String> addedFields = collectAddedFields(delta.getAdditions());
        List<MappingConflict> conflicts = reportConflicts(delta.getConflicts());
        String action = conflicts.isEmpty() ? null : USE_ADHOC_REBUILD;
        if (!conflicts.isEmpty() && !"warn".equals(config.getConflictPolicy())) {
            return report(indexKey, logicalIndex, physicalIndices, requiredSource,
                    addedFields, delta.getUnchanged(), conflicts, MappingReconcileReport.Status.CONFLICT,
                    startedAt, "MAPPING_CONFLICT", action);
        }

        if (delta.getAdditions().isEmpty()) {
            MappingReconcileReport.Status status = conflicts.isEmpty()
                    ? MappingReconcileReport.Status.NO_CHANGE
                    : MappingReconcileReport.Status.CONFLICT;
            return report(indexKey, logicalIndex, physicalIndices, requiredSource,
                    addedFields, delta.getUnchanged(), conflicts, status, startedAt,
                    conflicts.isEmpty() ? null : "MAPPING_CONFLICT", action);
        }

        final String additionsJson;
        try {
            additionsJson = JSON.writeValueAsString(delta.getAdditions());
        } catch (JsonProcessingException e) {
            return failure(indexKey, logicalIndex, physicalIndices, requiredSource,
                    addedFields, delta.getUnchanged(), conflicts, startedAt,
                    "ADDITIONS_SERIALIZATION_FAILED", action, e);
        }

        try {
            port.put(pinnedPhysicalIndex, additionsJson);
        } catch (IOException e) {
            /* ES 实证(2026-09-02): 索引缺实体引用的自定义分词器时 ES 拒增量(analyzer ... has not
               been configured)——语义是需要带 analyzer 配置的重建,归 CONFLICT 引导 adhoc,而非 FAILED_ES */
            if (String.valueOf(e.getMessage()).contains("has not been configured in mappings")) {
                return report(indexKey, logicalIndex, physicalIndices, requiredSource,
                        addedFields, delta.getUnchanged(), conflicts,
                        MappingReconcileReport.Status.CONFLICT, startedAt,
                        "PUT_FAILED: ANALYZER_NOT_CONFIGURED(目标索引缺分词器配置,需带 analyzer 的 adhoc 重建)",
                        USE_ADHOC_REBUILD);
            }
            return failure(indexKey, logicalIndex, physicalIndices, requiredSource,
                    addedFields, delta.getUnchanged(), conflicts, startedAt, "PUT_FAILED", action, e);
        }

        final MappingSnapshot verifiedSnapshot;
        try {
            verifiedSnapshot = port.read(alias);
        } catch (IOException e) {
            MappingTargetResolutionException ambiguity = ambiguity(e);
            if (ambiguity != null) {
                return report(indexKey, logicalIndex, ambiguity.getObservedTargets(), requiredSource,
                        addedFields, delta.getUnchanged(), conflicts, MappingReconcileReport.Status.FAILED_ES,
                        startedAt, "POST_WRITE_TARGET_CHANGED", action);
            }
            return failure(indexKey, logicalIndex, physicalIndices, requiredSource,
                    addedFields, delta.getUnchanged(), conflicts, startedAt,
                    "POST_WRITE_READ_FAILED", action, e);
        }
        String verifiedLogicalIndex = verifiedSnapshot.getLogicalName();
        List<String> verifiedPhysicalIndices = verifiedSnapshot.getIndexNames();

        if (!physicalIndices.equals(verifiedPhysicalIndices)) {
            return report(indexKey, verifiedLogicalIndex, verifiedPhysicalIndices, requiredSource,
                    addedFields, delta.getUnchanged(), conflicts, MappingReconcileReport.Status.FAILED_ES,
                    startedAt, "POST_WRITE_TARGET_CHANGED", action);
        }

        if (!verifiedSnapshot.isIndexExists()) {
            return report(indexKey, verifiedLogicalIndex, verifiedPhysicalIndices, requiredSource,
                    addedFields, delta.getUnchanged(), conflicts, MappingReconcileReport.Status.FAILED_ES,
                    startedAt, "POST_WRITE_INDEX_MISSING", action);
        }

        MappingDelta verification = MappingDeltaCalculator.calculate(
                additionsJson, verifiedSnapshot.getMappingJson());
        if (verification.isUnparsed()
                || !verification.getAdditions().isEmpty()
                || !verification.getConflicts().isEmpty()) {
            return report(indexKey, verifiedLogicalIndex, verifiedPhysicalIndices, requiredSource,
                    addedFields, delta.getUnchanged(), conflicts, MappingReconcileReport.Status.FAILED_ES,
                    startedAt, "POST_WRITE_VERIFICATION_FAILED", action);
        }

        return report(indexKey, verifiedLogicalIndex, verifiedPhysicalIndices, requiredSource,
                addedFields, delta.getUnchanged(), conflicts, MappingReconcileReport.Status.UPDATED,
                startedAt, null, action);
    }

    private MappingReconcileReport failure(String indexKey,
                                           String logicalIndex,
                                           List<String> physicalIndices,
                                           MappingReconcileReport.Source source,
                                           List<String> addedFields,
                                           List<String> unchangedFields,
                                           List<MappingConflict> conflicts,
                                           long startedAt,
                                           String detail,
                                           String action,
                                           IOException failure) {
        MappingReconcileReport.Status status = isConnectivityFailure(failure)
                ? MappingReconcileReport.Status.FAILED_CONNECTIVITY
                : MappingReconcileReport.Status.FAILED_ES;
        /* 底层 ES 异常 message 拼进 detail——只给 reason(PUT_FAILED)排障时不知道 ES 到底拒了什么 */
        String enriched = detail;
        if (failure.getMessage() != null && !failure.getMessage().isEmpty()) {
            enriched = (detail == null ? "" : detail + ": ") + failure.getMessage();
        }
        return report(indexKey, logicalIndex, physicalIndices, source, addedFields, unchangedFields,
                conflicts, status, startedAt, enriched, action);
    }

    private MappingReconcileReport report(String indexKey,
                                          String logicalIndex,
                                          List<String> physicalIndices,
                                          MappingReconcileReport.Source source,
                                          List<String> addedFields,
                                          List<String> unchangedFields,
                                          List<MappingConflict> conflicts,
                                          MappingReconcileReport.Status status,
                                          long startedAt,
                                          String detail,
                                          String action) {
        List<String> confirmedFields = status == MappingReconcileReport.Status.UPDATED
                ? addedFields : Collections.<String>emptyList();
        MappingReconcileReport result = new MappingReconcileReport(
                indexKey, logicalIndex, physicalIndices, source, confirmedFields, unchangedFields,
                conflicts, status, startedAt, Math.max(startedAt, System.currentTimeMillis()), detail, action);
        if (result.getDetail() == null) {
            LOG.info("[MappingReconcile] indexKey={} index={} source={} added={} unchanged={} conflicts={} status={}",
                    result.getIndexKey(), result.getLogicalIndex(), result.getSource(),
                    result.getAddedFields().size(), result.getUnchangedFields().size(),
                    result.getConflicts().size(), result.getStatus());
        } else {
            LOG.info("[MappingReconcile] indexKey={} index={} source={} added={} unchanged={} conflicts={} "
                            + "status={} reason={} targets={}",
                    result.getIndexKey(), result.getLogicalIndex(), result.getSource(),
                    result.getAddedFields().size(), result.getUnchangedFields().size(),
                    result.getConflicts().size(), result.getStatus(), result.getDetail(),
                    result.getPhysicalIndices().size());
        }
        for (MappingConflict conflict : result.getConflicts()) {
            LOG.warn("[MappingReconcile] indexKey={} index={} path={} actual={} desired={} "
                            + "status=CONFLICT action=USE_ADHOC_REBUILD",
                    result.getIndexKey(), result.getLogicalIndex(), conflict.getPath(),
                    conflict.getActualSummary(), conflict.getDesiredSummary());
        }
        return result;
    }

    private static boolean isConnectivityFailure(Throwable failure) {
        Throwable current = failure;
        for (int depth = 0; current != null && depth < 32; depth++) {
            if (current instanceof ConnectException
                    || current instanceof ConnectTimeoutException
                    || current instanceof SocketTimeoutException
                    || current instanceof NoRouteToHostException
                    || current instanceof UnknownHostException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private static MappingTargetResolutionException ambiguity(Throwable failure) {
        Throwable current = failure;
        for (int depth = 0; current != null && depth < 32; depth++) {
            if (current instanceof MappingTargetResolutionException) {
                MappingTargetResolutionException resolution =
                        (MappingTargetResolutionException) current;
                if (MappingTargetResolutionException.AMBIGUOUS_ALIAS_TARGET
                        .equals(resolution.getCode())) {
                    return resolution;
                }
            }
            current = current.getCause();
        }
        return null;
    }

    private static List<String> collectAddedFields(Map<String, Object> additions) {
        List<String> paths = new ArrayList<String>();
        Object properties = additions.get("properties");
        if (properties instanceof Map) {
            collectPropertyPaths(castMap(properties), "properties", paths);
        }
        for (String root : additions.keySet()) {
            if (!"properties".equals(root)) {
                paths.add(root);
            }
        }
        return paths;
    }

    private static List<MappingConflict> reportConflicts(List<MappingConflict> conflicts) {
        List<MappingConflict> reportConflicts = new ArrayList<MappingConflict>();
        for (MappingConflict conflict : conflicts) {
            if ("dynamic_templates".equals(conflict.getPath())) {
                reportConflicts.add(new MappingConflict(
                        conflict.getPath(),
                        dynamicTemplatesSummary(conflict.getActualSummary()),
                        dynamicTemplatesSummary(conflict.getDesiredSummary()),
                        conflict.getCode()));
            } else {
                reportConflicts.add(conflict);
            }
        }
        return reportConflicts;
    }

    private static String dynamicTemplatesSummary(String value) {
        if ("<missing>".equals(value)) {
            return value;
        }
        try {
            JsonNode templates = JSON.readTree(value);
            if (templates != null && templates.isArray()) {
                return "dynamic_templates(count=" + templates.size() + ")";
            }
        } catch (IOException ignored) {
            // Fall through to a non-sensitive summary.
        }
        return "dynamic_templates(different)";
    }

    private static void collectPropertyPaths(Map<String, Object> properties,
                                             String parent,
                                             List<String> paths) {
        for (Map.Entry<String, Object> field : properties.entrySet()) {
            String path = parent + "." + field.getKey();
            paths.add(path);
            if (field.getValue() instanceof Map) {
                Object children = castMap(field.getValue()).get("properties");
                if (children instanceof Map) {
                    collectPropertyPaths(castMap(children), path + ".properties", paths);
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> castMap(Object value) {
        return (Map<String, Object>) value;
    }
}
