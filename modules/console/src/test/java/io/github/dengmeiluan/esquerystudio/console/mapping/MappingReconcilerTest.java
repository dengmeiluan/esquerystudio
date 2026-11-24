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

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.apache.http.conn.ConnectTimeoutException;
import org.apache.http.conn.ConnectionPoolTimeoutException;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Deque;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class MappingReconcilerTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String ALIAS = "orders_alias";
    private static final String EMPTY_MAPPING = "{\"properties\":{}}";
    private static final String EXISTING_CODE = "{\"properties\":{\"code\":{\"type\":\"keyword\"}}}";

    @Test
    public void noAdditionsReturnsNoChangeAfterOneReadAndNoPut() {
        RecordingPort port = new RecordingPort().read(snapshot(EXISTING_CODE));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.NO_CHANGE, report.getStatus());
        assertEquals(1, port.readCalls);
        assertEquals(0, port.putCalls);
        assertEquals(Collections.singletonList("properties.code"), report.getUnchangedFields());
        assertTrue(report.getAddedFields().isEmpty());
        assertTrue(report.getConflicts().isEmpty());
        assertOnlyAliasWasAddressed(port);
    }

    @Test
    public void threeAdditionsArePutToPinnedPhysicalThenVerifiedThroughAlias() throws Exception {
        String desired = "{\"properties\":{" +
                "\"code\":{\"type\":\"keyword\"}," +
                "\"name\":{\"type\":\"keyword\"}," +
                "\"legs\":{\"type\":\"nested\",\"properties\":{\"id\":{\"type\":\"keyword\"}}}}}";
        RecordingPort port = new RecordingPort()
                .read(snapshot(EXISTING_CODE))
                .read(snapshot(ALIAS, Collections.singletonList("orders-000001"), desired));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), desired, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.UPDATED, report.getStatus());
        assertEquals(2, port.readCalls);
        assertEquals(1, port.putCalls);
        assertEquals(Arrays.asList(
                "properties.name",
                "properties.legs",
                "properties.legs.properties.id"), report.getAddedFields());
        assertEquals(ALIAS, report.getLogicalIndex());
        assertEquals(Collections.singletonList("orders-000001"), report.getPhysicalIndices());
        assertJsonEquals("{\"properties\":{" +
                "\"name\":{\"type\":\"keyword\"}," +
                "\"legs\":{\"type\":\"nested\",\"properties\":{\"id\":{\"type\":\"keyword\"}}}}}",
                port.putJsons.get(0));
        assertEquals(Arrays.asList(ALIAS, "orders-000001", ALIAS), port.coordinates);
    }

    @Test
    public void failPolicyRejectsWholeIndexWhenConflictHasSafeAddition() {
        String actual = "{\"properties\":{\"code\":{\"type\":\"text\"}}}";
        String desired = "{\"properties\":{" +
                "\"code\":{\"type\":\"keyword\"}," +
                "\"safe\":{\"type\":\"long\"}}}";
        RecordingPort port = new RecordingPort().read(snapshot(actual));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), desired, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.CONFLICT, report.getStatus());
        assertEquals("USE_ADHOC_REBUILD", report.getAction());
        assertEquals(1, report.getConflicts().size());
        assertEquals("properties.code", report.getConflicts().get(0).getPath());
        assertTrue(report.getAddedFields().isEmpty());
        assertEquals(1, port.readCalls);
        assertEquals(0, port.putCalls);
    }

    @Test
    public void warnPolicyPutsOnlySafeAdditionAndRetainsOriginalConflict() throws Exception {
        String actual = "{\"properties\":{\"code\":{\"type\":\"text\"}}}";
        String desired = "{\"properties\":{" +
                "\"code\":{\"type\":\"keyword\"}," +
                "\"safe\":{\"type\":\"long\"}}}";
        String verified = "{\"properties\":{" +
                "\"code\":{\"type\":\"text\"}," +
                "\"safe\":{\"type\":\"long\"}}}";
        RecordingPort port = new RecordingPort().read(snapshot(actual)).read(snapshot(verified));

        MappingReconcileReport report = reconciler(port, "warn", "skip")
                .reconcile(meta(), desired, MappingReconcileReport.Source.ANNOTATION_DERIVED);

        assertEquals(MappingReconcileReport.Status.UPDATED, report.getStatus());
        assertEquals(MappingReconcileReport.Source.ANNOTATION_DERIVED, report.getSource());
        assertEquals("USE_ADHOC_REBUILD", report.getAction());
        assertEquals(Collections.singletonList("properties.safe"), report.getAddedFields());
        assertEquals(1, report.getConflicts().size());
        assertJsonEquals("{\"properties\":{\"safe\":{\"type\":\"long\"}}}", port.putJsons.get(0));
        assertEquals(2, port.readCalls);
        assertEquals(1, port.putCalls);
    }

    @Test
    public void warnPolicyWithOnlyConflictDoesNotSendEmptyPut() {
        String actual = "{\"properties\":{\"code\":{\"type\":\"text\"}}}";
        String desired = "{\"properties\":{\"code\":{\"type\":\"keyword\"}}}";
        RecordingPort port = new RecordingPort().read(snapshot(actual));

        MappingReconcileReport report = reconciler(port, "warn", "skip")
                .reconcile(meta(), desired, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.CONFLICT, report.getStatus());
        assertEquals("USE_ADHOC_REBUILD", report.getAction());
        assertTrue(report.getAddedFields().isEmpty());
        assertEquals(0, port.putCalls);
        assertEquals(1, port.readCalls);
    }

    @Test
    public void dynamicTemplateConflictStoresOnlyCountSummaries() {
        String actual = "{\"properties\":{},\"dynamic_templates\":["
                + "{\"old_template\":{\"match\":\"old_*\",\"mapping\":{\"type\":\"keyword\"}}}]}";
        String desired = "{\"properties\":{},\"dynamic_templates\":["
                + "{\"new_template\":{\"match\":\"new_*\",\"mapping\":{\"type\":\"keyword\"}}},"
                + "{\"number_template\":{\"match_mapping_type\":\"long\",\"mapping\":{\"type\":\"long\"}}}]}";
        RecordingPort port = new RecordingPort().read(snapshot(actual));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), desired, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.CONFLICT, report.getStatus());
        assertEquals(1, report.getConflicts().size());
        MappingConflict conflict = report.getConflicts().get(0);
        assertEquals("dynamic_templates", conflict.getPath());
        assertEquals("dynamic_templates(count=1)", conflict.getActualSummary());
        assertEquals("dynamic_templates(count=2)", conflict.getDesiredSummary());
        assertFalse(conflict.getActualSummary().contains("old_template"));
        assertFalse(conflict.getDesiredSummary().contains("new_template"));
        assertEquals(0, port.putCalls);
    }

    @Test
    public void failPolicyNeverPutsMissingDynamicTemplates() {
        String desired = "{\"properties\":{\"safe\":{\"type\":\"keyword\"}},\"dynamic_templates\":["
                + "{\"strings\":{\"match_mapping_type\":\"string\","
                + "\"mapping\":{\"type\":\"keyword\"}}}]}";
        RecordingPort port = new RecordingPort()
                .read(snapshot(EMPTY_MAPPING))
                .read(snapshot(desired));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), desired, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.CONFLICT, report.getStatus());
        assertEquals("USE_ADHOC_REBUILD", report.getAction());
        assertEquals(1, report.getConflicts().size());
        MappingConflict conflict = report.getConflicts().get(0);
        assertEquals("dynamic_templates", conflict.getPath());
        assertEquals("<missing>", conflict.getActualSummary());
        assertEquals("dynamic_templates(count=1)", conflict.getDesiredSummary());
        assertFalse(conflict.getDesiredSummary().contains("strings"));
        assertTrue(report.getAddedFields().isEmpty());
        assertEquals(0, port.putCalls);
        assertEquals(1, port.readCalls);
    }

    @Test
    public void warnPolicyPutsSafePropertiesButNeverMissingDynamicTemplates() throws Exception {
        String desired = "{\"properties\":{\"safe\":{\"type\":\"keyword\"}},\"dynamic_templates\":["
                + "{\"strings\":{\"match_mapping_type\":\"string\","
                + "\"mapping\":{\"type\":\"keyword\"}}}]}";
        String verified = "{\"properties\":{\"safe\":{\"type\":\"keyword\"}}}";
        RecordingPort port = new RecordingPort()
                .read(snapshot(EMPTY_MAPPING))
                .read(snapshot(verified));

        MappingReconcileReport report = reconciler(port, "warn", "skip")
                .reconcile(meta(), desired, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.UPDATED, report.getStatus());
        assertEquals("USE_ADHOC_REBUILD", report.getAction());
        assertEquals(Collections.singletonList("properties.safe"), report.getAddedFields());
        assertEquals(1, report.getConflicts().size());
        MappingConflict conflict = report.getConflicts().get(0);
        assertEquals("dynamic_templates", conflict.getPath());
        assertEquals("<missing>", conflict.getActualSummary());
        assertEquals("dynamic_templates(count=1)", conflict.getDesiredSummary());
        assertFalse(conflict.getDesiredSummary().contains("strings"));
        assertJsonEquals("{\"properties\":{\"safe\":{\"type\":\"keyword\"}}}",
                port.putJsons.get(0));
        assertEquals(1, port.putCalls);
        assertEquals(2, port.readCalls);
    }

    @Test
    public void missingIndexHonorsSkipAndFailWithoutAnyCreateOrPut() {
        for (String policy : Arrays.asList("skip", "fail")) {
            RecordingPort port = new RecordingPort().read(missingSnapshot());

            MappingReconcileReport report = reconciler(port, "fail", policy)
                    .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

            MappingReconcileReport.Status expected = "skip".equals(policy)
                    ? MappingReconcileReport.Status.SKIPPED_INDEX_MISSING
                    : MappingReconcileReport.Status.FAILED_INDEX_MISSING;
            assertEquals(expected, report.getStatus());
            assertEquals(1, port.readCalls);
            assertEquals(0, port.putCalls);
        }
    }

    @Test
    public void invalidDesiredAndAmbiguousActualMappingsAreUnparsedWithoutPut() {
        RecordingPort invalidDesired = new RecordingPort().read(snapshot(EMPTY_MAPPING));
        MappingReconcileReport desiredReport = reconciler(invalidDesired, "fail", "skip")
                .reconcile(meta(), "{invalid", MappingReconcileReport.Source.MAPPING_FILE);
        assertEquals(MappingReconcileReport.Status.MAPPING_UNPARSED, desiredReport.getStatus());
        assertEquals(0, invalidDesired.putCalls);

        for (String actual : Arrays.asList(null, "{\"ambiguous\":true}")) {
            RecordingPort invalidActual = new RecordingPort().read(snapshot(actual));
            MappingReconcileReport actualReport = reconciler(invalidActual, "fail", "skip")
                    .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);
            assertEquals(MappingReconcileReport.Status.MAPPING_UNPARSED, actualReport.getStatus());
            assertEquals(0, invalidActual.putCalls);
        }
    }

    @Test
    public void firstReadNetworkCauseIsReturnedAsConnectivityFailure() {
        IOException wrapped = new IOException("read failed",
                new IllegalStateException("transport", new ConnectException("refused")));
        RecordingPort port = new RecordingPort().readFailure(wrapped);

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.FAILED_CONNECTIVITY, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("READ_FAILED"));
        assertEquals(0, port.putCalls);
    }

    @Test
    public void firstReadApacheConnectTimeoutCauseIsConnectivityFailure() {
        RecordingPort port = new RecordingPort().readFailure(
                wrapped(new ConnectTimeoutException("connect timed out")));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.FAILED_CONNECTIVITY, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("READ_FAILED"));
    }

    @Test
    public void analyzerMissingPutFailureIsConflictWithAdhocGuidance() {
        // ES 实证(2026-09-02): 索引缺实体引用的自定义分词器(my_wildcard_analyzer)时
        // 增量 PUT 被 ES 拒——语义上是「需要带 analyzer 配置的 adhoc 重建」而非环境故障
        String desired = "{\"properties\":{\"code\":{\"type\":\"keyword\"},\"name\":{\"type\":\"keyword\"},\"legs\":{\"type\":\"nested\",\"properties\":{\"id\":{\"type\":\"keyword\"}}}}}";
        RecordingPort port = new RecordingPort()
                .read(snapshot(EXISTING_CODE))
                .read(snapshot(ALIAS, Collections.singletonList("orders-000001"), desired))
                .putFailure(new IOException("mapper_parsing_exception: Failed to parse mapping: "
                        + "analyzer [my_wildcard_analyzer] has not been configured in mappings"));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), desired, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.CONFLICT, report.getStatus());
        assertTrue("detail=" + report.getDetail(),
                report.getDetail().startsWith("PUT_FAILED: ANALYZER_NOT_CONFIGURED"));
        assertEquals("USE_ADHOC_REBUILD", report.getAction());
        assertEquals(1, port.putCalls);
    }

    @Test
    public void putFailureDetailCarriesUnderlyingEsMessage() {
        String desired = "{\"properties\":{\"code\":{\"type\":\"keyword\"},\"name\":{\"type\":\"keyword\"},\"legs\":{\"type\":\"nested\",\"properties\":{\"id\":{\"type\":\"keyword\"}}}}}";
        RecordingPort port = new RecordingPort()
                .read(snapshot(EXISTING_CODE))
                .read(snapshot(ALIAS, Collections.singletonList("orders-000001"), desired))
                .putFailure(new IOException("Validation Failed: 1: mapping type is missing;"));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), desired, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.FAILED_ES, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("PUT_FAILED"));
        assertTrue("detail 应携带底层 ES 异常 message,实际=" + report.getDetail(),
                report.getDetail().contains("mapping type is missing"));
    }

    @Test
    public void arbitraryInterruptedIOExceptionIsNotConnectivityFailure() {
        RecordingPort port = new RecordingPort().readFailure(
                wrapped(new InterruptedIOException("interrupted without connect timeout")));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.FAILED_ES, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("READ_FAILED"));
    }

    @Test
    public void firstReadGenericIOExceptionIsReturnedAsEsFailure() {
        RecordingPort port = new RecordingPort().readFailure(new IOException("invalid response"));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.FAILED_ES, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("READ_FAILED"));
    }

    @Test
    public void initialTypedAmbiguityReportsObservedTargetsWithoutPut() {
        List<String> targets = Arrays.asList("physical-target-A", "physical-target-B");
        RecordingPort port = new RecordingPort().readFailure(
                new MappingTargetResolutionException(ALIAS, targets));
        ListAppender<ILoggingEvent> appender = attachReconcilerAppender();

        MappingReconcileReport report;
        try {
            report = reconciler(port, "fail", "skip")
                    .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);
        } finally {
            detachReconcilerAppender(appender);
        }

        assertEquals(MappingReconcileReport.Status.FAILED_ES, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("AMBIGUOUS_ALIAS_TARGET"));
        assertEquals(targets, report.getPhysicalIndices());
        assertTrue(report.getAddedFields().isEmpty());
        assertEquals(0, port.putCalls);
        assertEquals(Collections.singletonList(ALIAS), port.coordinates);
        String log = formattedLog(appender);
        assertTrue(log.contains("index=" + ALIAS));
        assertTrue(log.contains("status=FAILED_ES"));
        assertTrue(log.contains("reason=AMBIGUOUS_ALIAS_TARGET"));
        assertTrue(log.contains("targets=2"));
        assertFalse(log.contains("physical-target-A"));
        assertFalse(log.contains("physical-target-B"));
        assertFalse(log.contains(EXISTING_CODE));
    }

    @Test
    public void putFailuresAreClassifiedWithoutEscaping() {
        for (IOException failure : Arrays.asList(
                new IOException("timeout", new SocketTimeoutException("slow")),
                new IOException("ack false"))) {
            RecordingPort port = new RecordingPort()
                    .read(snapshot(EMPTY_MAPPING))
                    .putFailure(failure);

            MappingReconcileReport report = reconciler(port, "fail", "skip")
                    .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

            MappingReconcileReport.Status expected = failure.getCause() instanceof SocketTimeoutException
                    ? MappingReconcileReport.Status.FAILED_CONNECTIVITY
                    : MappingReconcileReport.Status.FAILED_ES;
            assertEquals(expected, report.getStatus());
            assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("PUT_FAILED"));
            assertTrue(report.getAddedFields().isEmpty());
            assertEquals(1, port.putCalls);
            assertEquals(1, port.readCalls);
        }
    }

    @Test
    public void putConnectionPoolTimeoutCauseIsConnectivityFailure() {
        RecordingPort port = new RecordingPort()
                .read(snapshot(EMPTY_MAPPING))
                .putFailure(wrapped(new ConnectionPoolTimeoutException("pool exhausted")));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.FAILED_CONNECTIVITY, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("PUT_FAILED"));
    }

    @Test
    public void secondReadFailuresAreClassifiedWithoutEscaping() {
        for (IOException failure : Arrays.asList(
                new IOException("host", new java.net.UnknownHostException("unknown")),
                new IOException("validation"))) {
            RecordingPort port = new RecordingPort()
                    .read(snapshot(EMPTY_MAPPING))
                    .readFailure(failure);

            MappingReconcileReport report = reconciler(port, "fail", "skip")
                    .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

            MappingReconcileReport.Status expected = failure.getCause() instanceof java.net.UnknownHostException
                    ? MappingReconcileReport.Status.FAILED_CONNECTIVITY
                    : MappingReconcileReport.Status.FAILED_ES;
            assertEquals(expected, report.getStatus());
            assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("POST_WRITE_READ_FAILED"));
            assertTrue(report.getAddedFields().isEmpty());
            assertEquals(1, port.putCalls);
            assertEquals(2, port.readCalls);
        }
    }

    @Test
    public void postWriteReadApacheConnectTimeoutCauseIsConnectivityFailure() {
        RecordingPort port = new RecordingPort()
                .read(snapshot(EMPTY_MAPPING))
                .readFailure(wrapped(new ConnectTimeoutException("verification read timed out")));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.FAILED_CONNECTIVITY, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("POST_WRITE_READ_FAILED"));
    }

    @Test
    public void postWriteTypedAmbiguityReportsChangedTargetsAfterPinnedPut() {
        List<String> ambiguousTargets = Arrays.asList("physical-target-A", "physical-target-B");
        RecordingPort port = new RecordingPort()
                .read(snapshot(ALIAS, Collections.singletonList("orders-000001"), EMPTY_MAPPING))
                .readFailure(new MappingTargetResolutionException(ALIAS, ambiguousTargets));
        ListAppender<ILoggingEvent> appender = attachReconcilerAppender();

        MappingReconcileReport report;
        try {
            report = reconciler(port, "fail", "skip")
                    .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);
        } finally {
            detachReconcilerAppender(appender);
        }

        assertEquals(MappingReconcileReport.Status.FAILED_ES, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("POST_WRITE_TARGET_CHANGED"));
        assertEquals(ambiguousTargets, report.getPhysicalIndices());
        assertTrue(report.getAddedFields().isEmpty());
        assertEquals(1, port.putCalls);
        assertEquals(Arrays.asList(ALIAS, "orders-000001", ALIAS), port.coordinates);
        String log = formattedLog(appender);
        assertTrue(log.contains("index=" + ALIAS));
        assertTrue(log.contains("status=FAILED_ES"));
        assertTrue(log.contains("reason=POST_WRITE_TARGET_CHANGED"));
        assertTrue(log.contains("targets=2"));
        assertFalse(log.contains("physical-target-A"));
        assertFalse(log.contains("physical-target-B"));
        assertFalse(log.contains(EMPTY_MAPPING));
        assertFalse(log.contains(EXISTING_CODE));
    }

    @Test
    public void postWriteMissingIndexIsAnEsFailure() {
        RecordingPort port = new RecordingPort()
                .read(snapshot(EMPTY_MAPPING))
                .read(missingSnapshot(ALIAS, Collections.singletonList("orders-000001")));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.FAILED_ES, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("POST_WRITE_INDEX_MISSING"));
        assertTrue(report.getAddedFields().isEmpty());
        assertEquals(ALIAS, report.getLogicalIndex());
        assertEquals(Collections.singletonList("orders-000001"), report.getPhysicalIndices());
    }

    @Test
    public void postWriteMissingOrMismatchedSubmittedFieldFailsVerification() {
        for (String secondActual : Arrays.asList(
                EMPTY_MAPPING,
                "{\"properties\":{\"code\":{\"type\":\"text\"}}}")) {
            RecordingPort port = new RecordingPort()
                    .read(snapshot(EMPTY_MAPPING))
                    .read(snapshot(ALIAS, Collections.singletonList("orders-000001"), secondActual));

            MappingReconcileReport report = reconciler(port, "fail", "skip")
                    .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

            assertEquals(MappingReconcileReport.Status.FAILED_ES, report.getStatus());
            assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("POST_WRITE_VERIFICATION_FAILED"));
            assertTrue(report.getAddedFields().isEmpty());
            assertEquals(ALIAS, report.getLogicalIndex());
            assertEquals(Collections.singletonList("orders-000001"), report.getPhysicalIndices());
            assertEquals(1, port.putCalls);
            assertEquals(2, port.readCalls);
        }
    }

    @Test
    public void initialSnapshotMustContainExactlyOnePhysicalTarget() {
        for (List<String> targets : Arrays.asList(
                Collections.<String>emptyList(),
                Arrays.asList("orders-000001", "orders-000002"))) {
            RecordingPort port = new RecordingPort().read(
                    new MappingSnapshot(true, ALIAS, targets, EMPTY_MAPPING));

            MappingReconcileReport report = reconciler(port, "fail", "skip")
                    .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.ANNOTATION_DERIVED);

            assertEquals(MappingReconcileReport.Status.FAILED_ES, report.getStatus());
            assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("AMBIGUOUS_ALIAS_TARGET"));
            assertEquals(targets, report.getPhysicalIndices());
            assertTrue(report.getAddedFields().isEmpty());
            assertEquals(0, port.putCalls);
            assertEquals(1, port.readCalls);
        }
    }

    @Test
    public void aliasFlipAfterPinnedPutFailsWithoutConfirmedAdditions() {
        RecordingPort port = new RecordingPort()
                .read(snapshot(ALIAS, Collections.singletonList("orders-000001"), EMPTY_MAPPING))
                .read(snapshot(ALIAS, Collections.singletonList("orders-000002"), EXISTING_CODE));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.FAILED_ES, report.getStatus());
        assertTrue("detail=" + report.getDetail(), report.getDetail().startsWith("POST_WRITE_TARGET_CHANGED"));
        assertEquals(Collections.singletonList("orders-000002"), report.getPhysicalIndices());
        assertTrue(report.getAddedFields().isEmpty());
        assertEquals(1, port.putCalls);
        assertEquals(Arrays.asList(ALIAS, "orders-000001", ALIAS), port.coordinates);
    }

    @Test
    public void reportTimestampsSerializeAsIntegralEpochMilliseconds() throws Exception {
        RecordingPort port = new RecordingPort().read(snapshot(EXISTING_CODE));
        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        JsonNode json = JSON.readTree(JSON.writeValueAsString(report));

        assertTrue(json.get("startedAt").isIntegralNumber());
        assertTrue(json.get("finishedAt").isIntegralNumber());
        assertTrue(json.get("finishedAt").longValue() >= json.get("startedAt").longValue());
    }

    @Test
    public void mappingFileSourceIsPreservedExactly() {
        RecordingPort port = new RecordingPort().read(snapshot(EXISTING_CODE));

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Source.MAPPING_FILE, report.getSource());
    }

    @Test
    public void disabledConfigurationDoesNotReadOrWrite() {
        RecordingPort port = new RecordingPort();
        ESQueryStudioElasticsearchProperties properties = properties("fail", "skip");
        properties.getMapping().setAutoRegister("off");

        MappingReconcileReport report = new MappingReconciler(port, properties)
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertEquals(MappingReconcileReport.Status.DISABLED, report.getStatus());
        assertEquals(0, port.readCalls);
        assertEquals(0, port.putCalls);
    }

    @Test
    public void constructorsAndRequiredArgumentsRejectNull() {
        assertNullRejected(() -> new MappingReconciler(null, new ESQueryStudioElasticsearchProperties()));
        assertNullRejected(() -> new MappingReconciler(new RecordingPort(), null));

        MappingReconciler reconciler = new MappingReconciler(new RecordingPort(), new ESQueryStudioElasticsearchProperties());
        assertNullRejected(() -> reconciler.reconcile(null, EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE));
        assertNullRejected(() -> reconciler.reconcile(meta(), EXISTING_CODE, null));
    }

    @Test
    public void successfulReportHasNoFailureDetailAndRecordsFinishTime() {
        RecordingPort port = new RecordingPort().read(snapshot(EXISTING_CODE));
        long before = System.currentTimeMillis();

        MappingReconcileReport report = reconciler(port, "fail", "skip")
                .reconcile(meta(), EXISTING_CODE, MappingReconcileReport.Source.MAPPING_FILE);

        assertNull(report.getDetail());
        assertNull(report.getAction());
        assertTrue(report.getStartedAt() >= before);
        assertTrue(report.getFinishedAt() >= report.getStartedAt());
    }

    private static MappingReconciler reconciler(RecordingPort port,
                                                 String conflictPolicy,
                                                 String missingPolicy) {
        return new MappingReconciler(port, properties(conflictPolicy, missingPolicy));
    }

    private static ESQueryStudioElasticsearchProperties properties(String conflictPolicy, String missingPolicy) {
        ESQueryStudioElasticsearchProperties properties = new ESQueryStudioElasticsearchProperties();
        properties.getMapping().setConflictPolicy(conflictPolicy);
        properties.getMapping().setMissingIndexPolicy(missingPolicy);
        return properties;
    }

    private static RebuildableIndexMeta meta() {
        ManagedEsIndex provider = new ManagedEsIndex() {
            @Override
            public String indexKey() {
                return "orders";
            }

            @Override
            public Class<?> entityClass() {
                return OrderEntity.class;
            }
        };
        return new RebuildableIndexMeta(provider, ALIAS, "orders", null, null);
    }

    private static MappingSnapshot snapshot(String mappingJson) {
        return snapshot(ALIAS, Collections.singletonList("orders-000001"), mappingJson);
    }

    private static MappingSnapshot snapshot(String logicalName,
                                            List<String> indexNames,
                                            String mappingJson) {
        return new MappingSnapshot(true, logicalName, indexNames, mappingJson);
    }

    private static MappingSnapshot missingSnapshot() {
        return new MappingSnapshot(false, ALIAS,
                Collections.singletonList("orders-000001"), null);
    }

    private static MappingSnapshot missingSnapshot(String logicalName, List<String> indexNames) {
        return new MappingSnapshot(false, logicalName, indexNames, null);
    }

    private static void assertOnlyAliasWasAddressed(RecordingPort port) {
        assertFalse(port.coordinates.isEmpty());
        for (String coordinate : port.coordinates) {
            assertEquals(ALIAS, coordinate);
        }
    }

    private static void assertJsonEquals(String expected, String actual) throws Exception {
        JsonNode expectedJson = JSON.readTree(expected);
        JsonNode actualJson = JSON.readTree(actual);
        assertEquals(expectedJson, actualJson);
    }

    private static IOException wrapped(IOException cause) {
        return new IOException("outer", new IllegalStateException("transport", cause));
    }

    private static ListAppender<ILoggingEvent> attachReconcilerAppender() {
        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(MappingReconciler.class)).addAppender(appender);
        return appender;
    }

    private static void detachReconcilerAppender(ListAppender<ILoggingEvent> appender) {
        ((Logger) LoggerFactory.getLogger(MappingReconciler.class)).detachAppender(appender);
    }

    private static String formattedLog(ListAppender<ILoggingEvent> appender) {
        StringBuilder log = new StringBuilder();
        for (ILoggingEvent event : appender.list) {
            log.append(event.getFormattedMessage()).append('\n');
        }
        return log.toString();
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private static void assertImmutable(List<?> list) {
        try {
            ((List) list).add(new Object());
            fail("list must be immutable");
        } catch (UnsupportedOperationException expected) {
            // expected
        }
    }

    private static void assertNullRejected(CheckedRunnable runnable) {
        try {
            runnable.run();
            fail("expected NullPointerException");
        } catch (NullPointerException expected) {
            assertNotNull(expected.getMessage());
        } catch (Exception unexpected) {
            throw new AssertionError(unexpected);
        }
    }

    private interface CheckedRunnable {
        void run() throws Exception;
    }

    private static final class OrderEntity {
    }

    private static final class RecordingPort implements MappingPort {
        private final Deque<Object> reads = new ArrayDeque<Object>();
        private final List<String> coordinates = new ArrayList<String>();
        private final List<String> putJsons = new ArrayList<String>();
        private IOException putFailure;
        private int readCalls;
        private int putCalls;

        private RecordingPort read(MappingSnapshot snapshot) {
            reads.addLast(snapshot);
            return this;
        }

        private RecordingPort readFailure(IOException failure) {
            reads.addLast(failure);
            return this;
        }

        private RecordingPort putFailure(IOException failure) {
            this.putFailure = failure;
            return this;
        }

        @Override
        public MappingSnapshot read(String indexOrAlias) throws IOException {
            readCalls++;
            coordinates.add(indexOrAlias);
            Object next = reads.removeFirst();
            if (next instanceof IOException) {
                throw (IOException) next;
            }
            return (MappingSnapshot) next;
        }

        @Override
        public void put(String indexOrAlias, String mappingJson) throws IOException {
            putCalls++;
            coordinates.add(indexOrAlias);
            putJsons.add(mappingJson);
            if (putFailure != null) {
                throw putFailure;
            }
        }
    }
}
