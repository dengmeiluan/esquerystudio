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
import org.apache.http.util.EntityUtils;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.springframework.aop.framework.AopProxyUtils;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.ElasticsearchRestTemplate;
import org.springframework.data.elasticsearch.core.IndexOperations;
import org.springframework.data.elasticsearch.core.document.Document;
import org.springframework.data.elasticsearch.core.mapping.IndexCoordinates;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class ElasticsearchOperationsMappingPort implements MappingPort {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final char[] HEX = "0123456789ABCDEF".toCharArray();

    private final ElasticsearchOperations operations;
    private final TargetResolver targetResolver;

    public ElasticsearchOperationsMappingPort(ElasticsearchOperations operations) {
        this.operations = Objects.requireNonNull(operations, "operations");
        this.targetResolver = resolverFor(this.operations);
    }

    ElasticsearchOperationsMappingPort(ElasticsearchOperations operations,
                                       TargetResolver targetResolver) {
        this.operations = Objects.requireNonNull(operations, "operations");
        this.targetResolver = Objects.requireNonNull(targetResolver, "targetResolver");
    }

    @Override
    public MappingSnapshot read(String indexOrAlias) throws IOException {
        validateIndexOrAlias(indexOrAlias, "read mapping");
        List<String> physicalTargets = targetResolver.resolve(indexOrAlias);
        if (physicalTargets == null || physicalTargets.isEmpty()) {
            throw failure("resolve alias target", indexOrAlias,
                    new IllegalStateException("TARGET_RESOLUTION_INVALID_RESPONSE"));
        }
        if (physicalTargets.size() > 1) {
            throw new MappingTargetResolutionException(indexOrAlias, physicalTargets);
        }
        String physicalIndex = physicalTargets.get(0);
        if (physicalIndex == null || physicalIndex.trim().isEmpty()) {
            throw failure("resolve alias target", indexOrAlias,
                    new IllegalStateException("TARGET_RESOLUTION_INVALID_RESPONSE"));
        }
        IndexOperations indexOperations = indexOperations(physicalIndex, "read mapping");
        try {
            if (!indexOperations.exists()) {
                return snapshot(false, indexOrAlias, physicalTargets, null);
            }
            Map<String, Object> mapping = indexOperations.getMapping();
            Map<String, Object> normalized = normalizeSingleTypeWrapper(mapping);
            String mappingJson = normalized == null ? null : JSON.writeValueAsString(normalized);
            return snapshot(true, indexOrAlias, physicalTargets, mappingJson);
        } catch (IOException e) {
            throw failure("read mapping", indexOrAlias, e);
        } catch (RuntimeException e) {
            throw failure("read mapping", indexOrAlias, e);
        }
    }

    @Override
    public void put(String indexOrAlias, String mappingJson) throws IOException {
        validateIndexOrAlias(indexOrAlias, "put mapping");
        validateMappingBody(indexOrAlias, mappingJson);
        IndexOperations indexOperations = indexOperations(indexOrAlias, "put mapping");
        try {
            Document mapping = Document.parse(mappingJson);
            if (!indexOperations.putMapping(mapping)) {
                throw failure("put mapping", indexOrAlias, null);
            }
        } catch (IOException e) {
            throw e;
        } catch (RuntimeException e) {
            throw failure("put mapping", indexOrAlias, e);
        }
    }

    private IndexOperations indexOperations(String indexOrAlias, String operation) throws IOException {
        try {
            return operations.indexOps(IndexCoordinates.of(indexOrAlias));
        } catch (RuntimeException e) {
            throw failure(operation + " index operations", indexOrAlias, e);
        }
    }

    private static MappingSnapshot snapshot(boolean exists,
                                            String indexOrAlias,
                                            List<String> physicalTargets,
                                            String mappingJson) {
        return new MappingSnapshot(exists, indexOrAlias, physicalTargets, mappingJson);
    }

    static List<String> parseAliasTargets(String responseBody) throws IOException {
        if (responseBody == null || responseBody.trim().isEmpty()) {
            throw invalidAliasResponse(null);
        }
        final JsonNode root;
        try {
            root = JSON.readTree(responseBody);
        } catch (IOException e) {
            throw invalidAliasResponse(e);
        }
        if (root == null || !root.isObject() || root.size() == 0) {
            throw invalidAliasResponse(null);
        }
        List<String> targets = new ArrayList<String>();
        java.util.Iterator<Map.Entry<String, JsonNode>> fields = root.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            String name = field.getKey();
            if (name == null || name.trim().isEmpty() || !field.getValue().isObject()) {
                throw invalidAliasResponse(null);
            }
            targets.add(name);
        }
        return Collections.unmodifiableList(targets);
    }

    static String encodePathSegment(String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        StringBuilder encoded = new StringBuilder(bytes.length);
        for (byte current : bytes) {
            int valueByte = current & 0xff;
            if ((valueByte >= 'a' && valueByte <= 'z')
                    || (valueByte >= 'A' && valueByte <= 'Z')
                    || (valueByte >= '0' && valueByte <= '9')
                    || valueByte == '-' || valueByte == '.'
                    || valueByte == '_' || valueByte == '~') {
                encoded.append((char) valueByte);
            } else {
                encoded.append('%')
                        .append(HEX[valueByte >>> 4])
                        .append(HEX[valueByte & 0x0f]);
            }
        }
        return encoded.toString();
    }

    private static TargetResolver resolverFor(ElasticsearchOperations operations) {
        ElasticsearchRestTemplate template = findRestTemplate(operations);
        if (template == null) {
            return indexOrAlias -> {
                throw failure("resolve alias target", indexOrAlias,
                        new IllegalStateException("TARGET_RESOLUTION_UNAVAILABLE"));
            };
        }
        return new RestTemplateTargetResolver(template);
    }

    private static ElasticsearchRestTemplate findRestTemplate(ElasticsearchOperations operations) {
        Object candidate = operations;
        for (int depth = 0; depth < 8 && candidate != null; depth++) {
            if (candidate instanceof ElasticsearchRestTemplate) {
                return (ElasticsearchRestTemplate) candidate;
            }
            Object target;
            try {
                target = AopProxyUtils.getSingletonTarget(candidate);
            } catch (RuntimeException e) {
                return null;
            }
            if (target == null || target == candidate) {
                return null;
            }
            candidate = target;
        }
        return null;
    }

    private static IOException invalidAliasResponse(Throwable cause) {
        return cause == null
                ? new IOException("TARGET_RESOLUTION_INVALID_RESPONSE")
                : new IOException("TARGET_RESOLUTION_INVALID_RESPONSE", cause);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> normalizeSingleTypeWrapper(Map<String, Object> mapping) {
        if (mapping == null || mapping.isEmpty()
                || mapping.containsKey("properties") || mapping.containsKey("dynamic_templates")
                || mapping.containsKey("dynamic")
                || mapping.size() != 1) {
            return mapping;
        }
        Object candidate = mapping.values().iterator().next();
        if (candidate instanceof Map) {
            Map<String, Object> typedMapping = (Map<String, Object>) candidate;
            if (typedMapping.containsKey("properties") || typedMapping.containsKey("dynamic_templates")
                    || typedMapping.containsKey("dynamic")) {
                return typedMapping;
            }
        }
        return mapping;
    }

    private static void validateMappingBody(String indexOrAlias, String mappingJson) throws IOException {
        if (mappingJson == null || mappingJson.trim().isEmpty()) {
            throw failure("validate mapping", indexOrAlias,
                    new IllegalArgumentException("mapping body must not be blank"));
        }

        final JsonNode root;
        try {
            root = JSON.readTree(mappingJson);
        } catch (IOException e) {
            throw new IOException("Failed to validate mapping for index [" + indexOrAlias + "]", e);
        }
        if (root == null || !root.isObject()) {
            throw failure("validate mapping", indexOrAlias,
                    new IllegalArgumentException("mapping body must be a JSON object"));
        }
        if (root.size() == 0) {
            throw failure("validate mapping", indexOrAlias,
                    new IllegalArgumentException("mapping body must contain properties or dynamic_templates"));
        }
        for (java.util.Iterator<String> names = root.fieldNames(); names.hasNext(); ) {
            String name = names.next();
            if (!Arrays.asList("properties", "dynamic_templates").contains(name)) {
                throw failure("validate mapping", indexOrAlias,
                        new IllegalArgumentException("unsupported mapping root: " + name));
            }
        }
        if (root.has("properties") && !root.get("properties").isObject()) {
            throw failure("validate mapping", indexOrAlias,
                    new IllegalArgumentException("properties must be a JSON object"));
        }
        if (root.has("dynamic_templates") && !root.get("dynamic_templates").isArray()) {
            throw failure("validate mapping", indexOrAlias,
                    new IllegalArgumentException("dynamic_templates must be a JSON array"));
        }
        if (root.has("dynamic_templates")) {
            for (JsonNode template : root.get("dynamic_templates")) {
                if (!template.isObject() || template.size() == 0) {
                    throw failure("validate mapping", indexOrAlias,
                            new IllegalArgumentException(
                                    "dynamic_templates entries must be non-empty JSON objects"));
                }
            }
        }
    }

    private static void validateIndexOrAlias(String indexOrAlias, String operation) throws IOException {
        if (indexOrAlias == null || indexOrAlias.trim().isEmpty()) {
            throw failure(operation, indexOrAlias,
                    new IllegalArgumentException("index or alias must not be blank"));
        }
    }

    private static IOException failure(String operation, String indexOrAlias, Throwable cause) {
        String message = "Failed to " + operation + " for index [" + indexOrAlias + "]";
        if (cause != null && cause.getMessage() != null) {
            message += ": " + cause.getMessage();
        }
        return cause == null ? new IOException(message) : new IOException(message, cause);
    }

    interface TargetResolver {
        List<String> resolve(String indexOrAlias) throws IOException;
    }

    private static final class RestTemplateTargetResolver implements TargetResolver {
        private final ElasticsearchRestTemplate template;

        private RestTemplateTargetResolver(ElasticsearchRestTemplate template) {
            this.template = template;
        }

        @Override
        public List<String> resolve(String indexOrAlias) throws IOException {
            final AliasLookup lookup;
            try {
                lookup = template.execute(client -> {
                    Request request = new Request("GET", "/_alias/" + encodePathSegment(indexOrAlias));
                    try {
                        Response response = client.getLowLevelClient().performRequest(request);
                        String body = response.getEntity() == null ? null
                                : EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);
                        return AliasLookup.alias(body);
                    } catch (ResponseException e) {
                        if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                            return AliasLookup.direct();
                        }
                        throw e;
                    }
                });
            } catch (RuntimeException e) {
                throw failure("resolve alias target", indexOrAlias, e);
            }
            if (lookup.directIndex) {
                return Collections.singletonList(indexOrAlias);
            }
            try {
                return parseAliasTargets(lookup.responseBody);
            } catch (IOException e) {
                throw failure("resolve alias target", indexOrAlias, e);
            }
        }
    }

    private static final class AliasLookup {
        private final boolean directIndex;
        private final String responseBody;

        private AliasLookup(boolean directIndex, String responseBody) {
            this.directIndex = directIndex;
            this.responseBody = responseBody;
        }

        private static AliasLookup direct() {
            return new AliasLookup(true, null);
        }

        private static AliasLookup alias(String responseBody) {
            return new AliasLookup(false, responseBody);
        }
    }
}
