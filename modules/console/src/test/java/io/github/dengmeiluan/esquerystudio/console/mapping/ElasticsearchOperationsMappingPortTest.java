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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.ElasticsearchRestTemplate;
import org.springframework.data.elasticsearch.core.IndexOperations;
import org.springframework.data.elasticsearch.core.document.Document;
import org.springframework.data.elasticsearch.core.mapping.IndexCoordinates;

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class ElasticsearchOperationsMappingPortTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    public void missingIndexReturnsExplicitSnapshotWithoutReadingMapping() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        recording.exists = false;

        MappingSnapshot snapshot = port(recording).read("orders_alias");

        assertFalse(snapshot.isIndexExists());
        assertEquals("orders_alias", snapshot.getLogicalName());
        assertEquals(Collections.singletonList("orders_alias"), snapshot.getIndexNames());
        assertNull(snapshot.getMappingJson());
        assertEquals(0, recording.getMappingCalls);
        assertEquals(Collections.singletonList("orders_alias"), recording.lastCoordinates);
    }

    @Test
    public void typelessMappingIsSerializedWithoutMutatingSourceMap() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        Map<String, Object> properties = map("id", map("type", "keyword"));
        Map<String, Object> source = map("properties", properties);
        Map<String, Object> before = deepCopy(source);
        recording.mapping = source;

        MappingSnapshot snapshot = port(recording).read("orders");

        assertTrue(snapshot.isIndexExists());
        assertJsonEquals("{\"properties\":{\"id\":{\"type\":\"keyword\"}}}", snapshot.getMappingJson());
        assertEquals(before, source);
        assertSame(properties, source.get("properties"));
    }

    @Test
    public void existingEmptyMappingSerializesEmptyObjectAndSupportsFirstFieldAddition() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        recording.mapping = Collections.emptyMap();

        MappingSnapshot snapshot = port(recording).read("orders");

        assertTrue(snapshot.isIndexExists());
        assertJsonEquals("{}", snapshot.getMappingJson());
        MappingDelta delta = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"new_field\":{\"type\":\"keyword\"}}}",
                snapshot.getMappingJson());
        assertFalse(delta.isUnparsed());
        assertHasPropertyAddition(delta, "new_field");
        assertTrue(delta.getConflicts().isEmpty());
    }

    @Test
    public void existingNullMappingKeepsNullMappingJson() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        recording.mapping = null;

        MappingSnapshot snapshot = port(recording).read("orders");

        assertTrue(snapshot.isIndexExists());
        assertNull(snapshot.getMappingJson());
    }

    @Test
    public void singleSixXTypeWrapperIsNormalizedToRootProperties() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        recording.mapping = map("_doc", map("properties", map("id", map("type", "keyword"))));

        MappingSnapshot snapshot = port(recording).read("orders");

        assertJsonEquals("{\"properties\":{\"id\":{\"type\":\"keyword\"}}}", snapshot.getMappingJson());
    }

    @Test
    public void singleSixXTypeWrapperWithDynamicTemplatesIsNormalized() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        List<Object> templates = Collections.<Object>singletonList(
                map("strings", map("match_mapping_type", "string", "mapping", map("type", "keyword"))));
        recording.mapping = map("legacy_type", map("dynamic_templates", templates));

        MappingSnapshot snapshot = port(recording).read("orders");

        assertJsonEquals("{\"dynamic_templates\":[{\"strings\":{\"match_mapping_type\":\"string\","
                + "\"mapping\":{\"type\":\"keyword\"}}}]}", snapshot.getMappingJson());
    }

    @Test
    public void singleSixXDynamicOnlyWrapperReconcilesMatchingAndConflictingDynamic() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        recording.mapping = map("legacy_type", map("dynamic", "strict"));

        MappingSnapshot snapshot = port(recording).read("orders");

        assertJsonEquals("{\"dynamic\":\"strict\"}", snapshot.getMappingJson());
        MappingDelta matching = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"new_field\":{\"type\":\"keyword\"}},\"dynamic\":\"strict\"}",
                snapshot.getMappingJson());
        assertFalse(matching.isUnparsed());
        assertEquals(Collections.singletonList("dynamic"), matching.getUnchanged());
        assertHasPropertyAddition(matching, "new_field");
        assertTrue(matching.getConflicts().isEmpty());

        MappingDelta conflicting = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"new_field\":{\"type\":\"keyword\"}},\"dynamic\":true}",
                snapshot.getMappingJson());
        assertFalse(conflicting.isUnparsed());
        assertHasPropertyAddition(conflicting, "new_field");
        assertEquals(1, conflicting.getConflicts().size());
        assertEquals("dynamic", conflicting.getConflicts().get(0).getPath());
        assertEquals("PARAMETER_CONFLICT", conflicting.getConflicts().get(0).getCode());
    }

    @Test
    public void ambiguousMultiTypeMappingIsNotFlattened() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        recording.mapping = map(
                "type_a", map("properties", map("a", map("type", "keyword"))),
                "type_b", map("properties", map("b", map("type", "long"))));

        MappingSnapshot snapshot = port(recording).read("orders");

        JsonNode actual = JSON.readTree(snapshot.getMappingJson());
        assertTrue(actual.has("type_a"));
        assertTrue(actual.has("type_b"));
        assertFalse(actual.has("properties"));

        MappingDelta delta = MappingDeltaCalculator.calculate(
                "{\"properties\":{\"new_field\":{\"type\":\"keyword\"}}}",
                snapshot.getMappingJson());
        assertTrue(delta.isUnparsed());
        assertTrue(delta.getAdditions().isEmpty());
        assertTrue(delta.getConflicts().isEmpty());
    }

    @Test
    public void aliasResponseParserReturnsFaithfulPhysicalTargetKeys() throws Exception {
        assertEquals(Collections.singletonList("orders-000001"),
                ElasticsearchOperationsMappingPort.parseAliasTargets(
                        "{\"orders-000001\":{\"aliases\":{\"orders_alias\":{}}}}"));
        assertEquals(Arrays.asList("orders-000001", "orders-000002"),
                ElasticsearchOperationsMappingPort.parseAliasTargets(
                        "{\"orders-000001\":{\"aliases\":{}},"
                                + "\"orders-000002\":{\"aliases\":{}}}"));
    }

    @Test
    public void aliasResponseParserRejectsEmptyAndMalformedBodies() throws Exception {
        for (String body : Arrays.asList(
                null, "", "   ", "{}", "[]", "{invalid", "{\"orders-000001\":1}")) {
            IOException thrown = expectIOException(() ->
                    ElasticsearchOperationsMappingPort.parseAliasTargets(body));
            assertContains(thrown.getMessage(), "TARGET_RESOLUTION_INVALID_RESPONSE");
        }
    }

    @Test
    public void aliasEndpointUsesStrictUtf8PathSegmentEncoding() throws Exception {
        assertEquals("orders%20alias%2F%25%2A%E4%B8%AD",
                ElasticsearchOperationsMappingPort.encodePathSegment("orders alias/%*中"));
    }

    @Test
    public void injectedResolverReadsAliasThroughSinglePhysicalCoordinate() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        ElasticsearchOperationsMappingPort port = port(recording,
                name -> Collections.singletonList("orders-000001"));

        MappingSnapshot snapshot = port.read("orders_alias");

        assertEquals("orders_alias", snapshot.getLogicalName());
        assertEquals(Collections.singletonList("orders-000001"), snapshot.getIndexNames());
        assertEquals(Collections.singletonList("orders-000001"), recording.lastCoordinates);
        assertEquals(1, recording.getMappingCalls);
    }

    @Test
    public void injectedResolverTreatsDirectIndexAsItsOwnPhysicalCoordinate() throws Exception {
        RecordingOperations recording = new RecordingOperations();

        MappingSnapshot snapshot = port(recording).read("orders-000001");

        assertEquals("orders-000001", snapshot.getLogicalName());
        assertEquals(Collections.singletonList("orders-000001"), snapshot.getIndexNames());
        assertEquals(Collections.singletonList("orders-000001"), recording.lastCoordinates);
    }

    @Test
    public void multiTargetResolutionFailsBeforeAnyMappingOperation() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        ElasticsearchOperationsMappingPort port = port(recording,
                name -> Arrays.asList("orders-000001", "orders-000002"));

        IOException thrown = expectIOException(() -> port.read("orders_alias"));

        assertTrue(thrown instanceof MappingTargetResolutionException);
        MappingTargetResolutionException resolution = (MappingTargetResolutionException) thrown;
        assertEquals(MappingTargetResolutionException.AMBIGUOUS_ALIAS_TARGET, resolution.getCode());
        assertEquals(Arrays.asList("orders-000001", "orders-000002"),
                resolution.getObservedTargets());
        assertImmutable(resolution.getObservedTargets());
        assertContains(thrown.getMessage(), "AMBIGUOUS_ALIAS_TARGET", "orders_alias");
        assertEquals(0, recording.indexOpsCalls);
        assertEquals(0, recording.getMappingCalls);
        assertEquals(0, recording.putMappingCalls);
    }

    @Test
    public void publicConstructorFailsClosedForUnsupportedOperationsProxy() throws Exception {
        RecordingOperations recording = new RecordingOperations();

        IOException thrown = expectIOException(() ->
                new ElasticsearchOperationsMappingPort(recording.operations()).read("orders_alias"));

        assertContains(thrown.getMessage(), "TARGET_RESOLUTION_UNAVAILABLE", "orders_alias");
        assertEquals(0, recording.indexOpsCalls);
        assertEquals(0, recording.getMappingCalls);
    }

    @Test
    public void publicConstructorResolvesUniqueAliasAndReadsOnlyPhysicalMapping() throws Exception {
        HttpEsFixture fixture = new HttpEsFixture();
        try {
            fixture.respond("GET", "/_alias/orders_alias", 200,
                    "{\"orders-000001\":{\"aliases\":{\"orders_alias\":{}}}}");
            fixture.respond("HEAD", "/orders-000001", 200, null);
            fixture.respond("GET", "/orders-000001/_mapping", 200,
                    mappingResponse("orders-000001"));

            MappingSnapshot snapshot = new ElasticsearchOperationsMappingPort(fixture.template())
                    .read("orders_alias");

            assertEquals("orders_alias", snapshot.getLogicalName());
            assertEquals(Collections.singletonList("orders-000001"), snapshot.getIndexNames());
            assertJsonEquals("{\"properties\":{\"code\":{\"type\":\"keyword\"}}}",
                    snapshot.getMappingJson());
            assertEquals(Arrays.asList(
                    "GET /_alias/orders_alias",
                    "HEAD /orders-000001",
                    "GET /orders-000001/_mapping"), fixture.requests());
            assertFalse(fixture.requests().contains("GET /orders_alias/_mapping"));
        } finally {
            fixture.close();
        }
    }

    @Test
    public void publicConstructorFallsBackFromAlias404ToDirectIndex() throws Exception {
        HttpEsFixture fixture = new HttpEsFixture();
        try {
            fixture.respond("GET", "/_alias/orders", 404,
                    "{\"error\":{\"type\":\"alias_missing_exception\"},\"status\":404}");
            fixture.respond("HEAD", "/orders", 200, null);
            fixture.respond("GET", "/orders/_mapping", 200, mappingResponse("orders"));

            MappingSnapshot snapshot = new ElasticsearchOperationsMappingPort(fixture.template())
                    .read("orders");

            assertEquals("orders", snapshot.getLogicalName());
            assertEquals(Collections.singletonList("orders"), snapshot.getIndexNames());
            assertJsonEquals("{\"properties\":{\"code\":{\"type\":\"keyword\"}}}",
                    snapshot.getMappingJson());
            assertEquals(Arrays.asList(
                    "GET /_alias/orders",
                    "HEAD /orders",
                    "GET /orders/_mapping"), fixture.requests());
        } finally {
            fixture.close();
        }
    }

    @Test
    public void publicConstructorStopsAfterNon404AliasLookupFailure() throws Exception {
        for (int status : Arrays.asList(403, 500)) {
            HttpEsFixture fixture = new HttpEsFixture();
            try {
                fixture.respond("GET", "/_alias/orders_alias", status,
                        "{\"error\":{\"type\":\"security_exception\"},\"status\":" + status + "}");

                IOException thrown = expectIOException(() ->
                        new ElasticsearchOperationsMappingPort(fixture.template()).read("orders_alias"));

                assertContains(thrown.getMessage(), "resolve alias target", "orders_alias");
                assertEquals(Collections.singletonList("GET /_alias/orders_alias"), fixture.requests());
            } finally {
                fixture.close();
            }
        }
    }

    @Test
    public void publicConstructorRejectsMultiTargetAliasBeforeIndexOperations() throws Exception {
        HttpEsFixture fixture = new HttpEsFixture();
        try {
            fixture.respond("GET", "/_alias/orders_alias", 200,
                    "{\"orders-000001\":{\"aliases\":{}},"
                            + "\"orders-000002\":{\"aliases\":{}}}");

            IOException thrown = expectIOException(() ->
                    new ElasticsearchOperationsMappingPort(fixture.template()).read("orders_alias"));

            assertTrue(thrown instanceof MappingTargetResolutionException);
            MappingTargetResolutionException resolution = (MappingTargetResolutionException) thrown;
            assertEquals(MappingTargetResolutionException.AMBIGUOUS_ALIAS_TARGET,
                    resolution.getCode());
            assertEquals(Arrays.asList("orders-000001", "orders-000002"),
                    resolution.getObservedTargets());
            assertContains(thrown.getMessage(), "AMBIGUOUS_ALIAS_TARGET", "orders_alias");
            assertEquals(Collections.singletonList("GET /_alias/orders_alias"), fixture.requests());
        } finally {
            fixture.close();
        }
    }

    @Test
    public void publicConstructorUnwrapsJdkAopProxyToSameRestTemplate() throws Exception {
        HttpEsFixture fixture = new HttpEsFixture();
        try {
            fixture.respond("GET", "/_alias/orders_alias", 200,
                    "{\"orders-000001\":{\"aliases\":{\"orders_alias\":{}}}}");
            fixture.respond("HEAD", "/orders-000001", 200, null);
            fixture.respond("GET", "/orders-000001/_mapping", 200,
                    mappingResponse("orders-000001"));
            ProxyFactory proxyFactory = new ProxyFactory();
            proxyFactory.setTarget(fixture.template());
            proxyFactory.setInterfaces(ElasticsearchOperations.class);
            ElasticsearchOperations proxy = (ElasticsearchOperations) proxyFactory.getProxy();

            MappingSnapshot snapshot = new ElasticsearchOperationsMappingPort(proxy)
                    .read("orders_alias");

            assertEquals("orders_alias", snapshot.getLogicalName());
            assertEquals(Collections.singletonList("orders-000001"), snapshot.getIndexNames());
            assertJsonEquals("{\"properties\":{\"code\":{\"type\":\"keyword\"}}}",
                    snapshot.getMappingJson());
            assertEquals(Arrays.asList(
                    "GET /_alias/orders_alias",
                    "HEAD /orders-000001",
                    "GET /orders-000001/_mapping"), fixture.requests());
        } finally {
            fixture.close();
        }
    }

    @Test
    public void readRejectsNullEmptyAndWhitespaceCoordinatesWithoutCallingOperations() throws Exception {
        for (String coordinate : Arrays.asList(null, "", "   ")) {
            RecordingOperations recording = new RecordingOperations();

            IOException thrown = expectIOException(() ->
                    new ElasticsearchOperationsMappingPort(recording.operations()).read(coordinate));

            assertContains(thrown.getMessage(), "read mapping", "index");
            assertEquals(0, recording.indexOpsCalls);
        }
    }

    @Test
    public void putRejectsNullEmptyAndWhitespaceCoordinatesBeforeParsingOrOperations() throws Exception {
        for (String coordinate : Arrays.asList(null, "", "   ")) {
            RecordingOperations recording = new RecordingOperations();

            IOException thrown = expectIOException(() ->
                    new ElasticsearchOperationsMappingPort(recording.operations())
                            .put(coordinate, "{invalid"));

            assertContains(thrown.getMessage(), "put mapping", "index");
            assertEquals(0, recording.indexOpsCalls);
            assertEquals(0, recording.putMappingCalls);
        }
    }

    @Test
    public void putPassesOnlyMappingDocumentToExactCallerCoordinate() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        String mapping = "{\"properties\":{\"id\":{\"type\":\"keyword\"}},"
                + "\"dynamic_templates\":[]}";

        new ElasticsearchOperationsMappingPort(recording.operations()).put("orders_alias", mapping);

        assertEquals(1, recording.indexOpsCalls);
        assertEquals(1, recording.putMappingCalls);
        assertEquals(Collections.singletonList("orders_alias"), recording.lastCoordinates);
        assertNotNull(recording.putDocument);
        assertJsonEquals(mapping, recording.putDocument.toJson());
        assertEquals(Arrays.asList("properties", "dynamic_templates"),
                new ArrayList<String>(recording.putDocument.keySet()));
    }

    @Test
    public void putRejectsPayloadRootsOutsideMappingUpdateWithoutCallingOperations() throws Exception {
        assertRejectedWithoutCalls("{\"settings\":{},\"mappings\":{}}", "settings");
        assertRejectedWithoutCalls("{\"mappings\":{\"properties\":{}}}", "mappings");
        assertRejectedWithoutCalls("{\"properties\":{},\"unexpected\":true}", "unexpected");
        assertRejectedWithoutCalls("{\"settings\":{},\"mappings\":{},\"aliases\":{}}", "settings");
    }

    @Test
    public void putRejectsBlankInvalidAndNonObjectBodiesWithoutCallingOperations() throws Exception {
        assertRejectedWithoutCalls(null, "mapping");
        assertRejectedWithoutCalls("   ", "mapping");
        assertRejectedWithoutCalls("{invalid", "orders_alias");
        assertRejectedWithoutCalls("[]", "object");
        assertRejectedWithoutCalls("\"mapping\"", "object");
    }

    @Test
    public void putRejectsInvalidDynamicTemplateEntriesWithoutCallingOperations() throws Exception {
        for (String invalidEntry : Arrays.asList("null", "1", "\"template\"", "{}")) {
            assertRejectedWithoutCalls(
                    "{\"dynamic_templates\":[" + invalidEntry + "]}", "dynamic_templates");
        }
    }

    @Test
    public void putMappingFalseIsReportedAsIOException() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        recording.putResult = false;

        IOException thrown = expectIOException(() ->
                new ElasticsearchOperationsMappingPort(recording.operations())
                        .put("orders_alias", "{\"properties\":{}}"));

        assertContains(thrown.getMessage(), "put mapping", "orders_alias");
        assertEquals(1, recording.putMappingCalls);
    }

    @Test
    public void readRuntimeFailuresAreWrappedWithOperationIndexAndCause() throws Exception {
        RuntimeException indexOpsFailure = new IllegalStateException("index ops failed");
        RecordingOperations indexOpsRecording = new RecordingOperations();
        indexOpsRecording.indexOpsFailure = indexOpsFailure;
        assertWrappedReadFailure(indexOpsRecording, indexOpsFailure, "index operations");

        RuntimeException existsFailure = new IllegalStateException("exists failed");
        RecordingOperations existsRecording = new RecordingOperations();
        existsRecording.existsFailure = existsFailure;
        assertWrappedReadFailure(existsRecording, existsFailure, "read mapping");

        RuntimeException mappingFailure = new IllegalStateException("mapping failed");
        RecordingOperations mappingRecording = new RecordingOperations();
        mappingRecording.getMappingFailure = mappingFailure;
        assertWrappedReadFailure(mappingRecording, mappingFailure, "read mapping");
    }

    @Test
    public void readSerializationFailureIsWrappedWithOperationIndexAndCause() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        recording.mapping = map("properties", map("broken", new UnserializableValue()));

        IOException thrown = expectIOException(() ->
                port(recording).read("orders_alias"));

        assertContains(thrown.getMessage(), "read mapping", "orders_alias");
        assertNotNull(thrown.getCause());
        assertTrue(thrown.getCause() instanceof IOException);
    }

    @Test
    public void putRuntimeFailureIsWrappedWithOperationIndexAndCause() throws Exception {
        RecordingOperations recording = new RecordingOperations();
        RuntimeException failure = new IllegalStateException("put failed");
        recording.putMappingFailure = failure;

        IOException thrown = expectIOException(() ->
                new ElasticsearchOperationsMappingPort(recording.operations())
                        .put("orders_alias", "{\"properties\":{}}"));

        assertContains(thrown.getMessage(), "put mapping", "orders_alias");
        assertSame(failure, thrown.getCause());
    }

    @Test
    public void snapshotDefensivelyCopiesAndExposesUnmodifiableIndexNames() {
        List<String> indexNames = new ArrayList<String>(Arrays.asList("orders-000001", "orders-000002"));
        MappingSnapshot snapshot = new MappingSnapshot(
                true, "orders_alias", indexNames, "{\"properties\":{}}");
        indexNames.clear();

        assertEquals(Arrays.asList("orders-000001", "orders-000002"), snapshot.getIndexNames());
        try {
            snapshot.getIndexNames().add("orders-000003");
            fail("index names must be unmodifiable");
        } catch (UnsupportedOperationException expected) {
            // expected
        }
    }

    @Test(expected = NullPointerException.class)
    public void constructorRejectsNullOperations() {
        new ElasticsearchOperationsMappingPort(null);
    }

    private static void assertWrappedReadFailure(RecordingOperations recording,
                                                 RuntimeException cause,
                                                 String operation) throws Exception {
        IOException thrown = expectIOException(() ->
                port(recording).read("orders_alias"));
        assertContains(thrown.getMessage(), operation, "orders_alias");
        assertSame(cause, thrown.getCause());
    }

    private static void assertRejectedWithoutCalls(String mappingJson, String messageFragment) throws Exception {
        RecordingOperations recording = new RecordingOperations();

        IOException thrown = expectIOException(() ->
                new ElasticsearchOperationsMappingPort(recording.operations()).put("orders_alias", mappingJson));

        assertTrue("message should contain " + messageFragment + ": " + thrown.getMessage(),
                thrown.getMessage().contains(messageFragment));
        assertEquals(0, recording.indexOpsCalls);
        assertEquals(0, recording.putMappingCalls);
    }

    private static ElasticsearchOperationsMappingPort port(RecordingOperations recording) {
        return port(recording, name -> Collections.singletonList(name));
    }

    private static ElasticsearchOperationsMappingPort port(
            RecordingOperations recording,
            ElasticsearchOperationsMappingPort.TargetResolver resolver) {
        return new ElasticsearchOperationsMappingPort(recording.operations(), resolver);
    }

    private static IOException expectIOException(CheckedRunnable runnable) throws Exception {
        try {
            runnable.run();
            fail("expected IOException");
            return null;
        } catch (IOException expected) {
            return expected;
        }
    }

    private static void assertContains(String value, String... fragments) {
        for (String fragment : fragments) {
            assertTrue("expected <" + value + "> to contain <" + fragment + ">", value.contains(fragment));
        }
    }

    private static void assertJsonEquals(String expected, String actual) throws Exception {
        assertEquals(JSON.readTree(expected), JSON.readTree(actual));
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private static void assertImmutable(List<?> values) {
        try {
            ((List) values).add("unexpected");
            fail("list must be immutable");
        } catch (UnsupportedOperationException expected) {
            // expected
        }
    }

    private static String mappingResponse(String index) {
        return "{\"" + index + "\":{\"mappings\":{\"properties\":{"
                + "\"code\":{\"type\":\"keyword\"}}}}}";
    }

    @SuppressWarnings("unchecked")
    private static void assertHasPropertyAddition(MappingDelta delta, String fieldName) {
        Map<String, Object> properties = (Map<String, Object>) delta.getAdditions().get("properties");
        assertNotNull(properties);
        assertTrue(properties.containsKey(fieldName));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> deepCopy(Map<String, Object> source) throws Exception {
        return JSON.readValue(JSON.writeValueAsBytes(source), LinkedHashMap.class);
    }

    private static Map<String, Object> map(Object... entries) {
        Map<String, Object> result = new LinkedHashMap<String, Object>();
        for (int i = 0; i < entries.length; i += 2) {
            result.put((String) entries[i], entries[i + 1]);
        }
        return result;
    }

    private interface CheckedRunnable {
        void run() throws Exception;
    }

    private static final class UnserializableValue {
        public String getValue() throws IOException {
            throw new IOException("cannot serialize mapping value");
        }
    }

    private static final class RecordingOperations {
        private boolean exists = true;
        private Map<String, Object> mapping = Collections.emptyMap();
        private boolean putResult = true;
        private RuntimeException indexOpsFailure;
        private RuntimeException existsFailure;
        private RuntimeException getMappingFailure;
        private RuntimeException putMappingFailure;
        private int indexOpsCalls;
        private int getMappingCalls;
        private int putMappingCalls;
        private List<String> lastCoordinates;
        private Document putDocument;

        private ElasticsearchOperations operations() {
            IndexOperations indexOperations = (IndexOperations) Proxy.newProxyInstance(
                    IndexOperations.class.getClassLoader(),
                    new Class<?>[]{IndexOperations.class},
                    (proxy, method, args) -> {
                        if ("exists".equals(method.getName())) {
                            if (existsFailure != null) {
                                throw existsFailure;
                            }
                            return exists;
                        }
                        if ("getMapping".equals(method.getName())) {
                            getMappingCalls++;
                            if (getMappingFailure != null) {
                                throw getMappingFailure;
                            }
                            return mapping;
                        }
                        if ("putMapping".equals(method.getName())) {
                            putMappingCalls++;
                            putDocument = (Document) args[0];
                            if (putMappingFailure != null) {
                                throw putMappingFailure;
                            }
                            return putResult;
                        }
                        throw new UnsupportedOperationException("unexpected IndexOperations call: " + method.getName());
                    });

            return (ElasticsearchOperations) Proxy.newProxyInstance(
                    ElasticsearchOperations.class.getClassLoader(),
                    new Class<?>[]{ElasticsearchOperations.class},
                    (proxy, method, args) -> {
                        if (!"indexOps".equals(method.getName()) || args == null || args.length != 1
                                || !(args[0] instanceof IndexCoordinates)) {
                            throw new UnsupportedOperationException(
                                    "unexpected ElasticsearchOperations call: " + method.getName());
                        }
                        indexOpsCalls++;
                        IndexCoordinates coordinates = (IndexCoordinates) args[0];
                        lastCoordinates = Arrays.asList(coordinates.getIndexNames().clone());
                        if (indexOpsFailure != null) {
                            throw indexOpsFailure;
                        }
                        return indexOperations;
                    });
        }
    }

    private static final class HttpEsFixture implements AutoCloseable {
        private final HttpServer server;
        private final RestHighLevelClient client;
        private final ElasticsearchRestTemplate template;
        private final Map<String, ScriptedResponse> responses =
                new ConcurrentHashMap<String, ScriptedResponse>();
        private final List<String> requests =
                Collections.synchronizedList(new ArrayList<String>());

        private HttpEsFixture() throws IOException {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", this::handle);
            server.start();
            respond("GET", "/", 200, mainResponse());
            client = new RestHighLevelClient(RestClient.builder(
                    new HttpHost("127.0.0.1", server.getAddress().getPort(), "http")));
            template = new ElasticsearchRestTemplate(client);
            requests.clear();
            responses.remove("GET /");
        }

        private ElasticsearchRestTemplate template() {
            return template;
        }

        private void respond(String method, String path, int status, String body) {
            responses.put(method + " " + path, new ScriptedResponse(status, body));
        }

        private List<String> requests() {
            synchronized (requests) {
                return new ArrayList<String>(requests);
            }
        }

        private void handle(HttpExchange exchange) throws IOException {
            String request = exchange.getRequestMethod() + " " + exchange.getRequestURI().getRawPath();
            requests.add(request);
            ScriptedResponse response = responses.get(request);
            if (response == null) {
                response = new ScriptedResponse(500,
                        "{\"error\":{\"type\":\"unexpected_request\",\"reason\":\""
                                + request + "\"},\"status\":500}");
            }
            /* 2026-10-31：CI 上这个类偶发 `Connection reset by peer`（本地连跑 12 次 32/32 复现不出），
               每次换一个方法失败，说明是 socket 竞态而不是业务断言。两处加固：
               ① body 写完后**显式 close 输出流**——`exchange.close()` 在部分实现里只释放连接，
                  不保证已写字节被提交；客户端（RestHighLevelClient）读到半截就 reset。
               ② `sendResponseHeaders` 之前先设 Content-Type，`-1L` 分支（HEAD 无 body）
                  显式 `endExchange` 语义由 close 承担，这里不动（JDK 对 HEAD 会自行丢弃 body）。 */
            try {
                /* 连接生命周期显式收口：HEAD/空体分支此前用 -1L，JDK HttpServer 会直接断开
                   TCP；RestClient 复用池中连接发下一请求时偶发 Connection is closed（CI 实报）。
                   对每个响应声明 Connection: close，客户端读完即弃用，下一请求新建连接——
                   夹具上多一次握手换确定性，消除 socket 竞态。 */
                exchange.getResponseHeaders().set("Connection", "close");
                if (response.body == null) {
                    exchange.sendResponseHeaders(response.status, -1L);
                    return;
                }
                byte[] body = response.body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
                exchange.sendResponseHeaders(response.status, body.length);
                OutputStream out = exchange.getResponseBody();
                out.write(body);
                out.flush();
                out.close();
            } finally {
                exchange.close();
            }
        }

        @Override
        public void close() throws IOException {
            try {
                client.close();
            } finally {
                server.stop(0);
            }
        }

        private static String mainResponse() {
            return "{\"name\":\"test-node\",\"cluster_name\":\"test-cluster\","
                    + "\"cluster_uuid\":\"test-cluster-uuid\",\"version\":{"
                    + "\"number\":\"7.6.2\",\"build_flavor\":\"default\","
                    + "\"build_type\":\"tar\",\"build_hash\":\"unknown\","
                    + "\"build_date\":\"2020-03-26T06:34:37.794943Z\","
                    + "\"build_snapshot\":false,\"lucene_version\":\"8.4.0\","
                    + "\"minimum_wire_compatibility_version\":\"6.8.0\","
                    + "\"minimum_index_compatibility_version\":\"6.0.0-beta1\"},"
                    + "\"tagline\":\"You Know, for Search\"}";
        }
    }

    private static final class ScriptedResponse {
        private final int status;
        private final String body;

        private ScriptedResponse(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }
}
