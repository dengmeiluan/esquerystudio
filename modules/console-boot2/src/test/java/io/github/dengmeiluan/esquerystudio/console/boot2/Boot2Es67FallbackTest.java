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

package io.github.dengmeiluan.esquerystudio.console.boot2;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ES 6.7-shaped cluster: typeless create-index / put-mapping are rejected with 400 and must be
 * retried with the typed {@code _doc} form; {@code hits.total} stays numeric. No version branch —
 * the fallback is generic.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "esquerystudio.boot.dev-bootstrap-auth=true",
                "esquerystudio.boot.allow-writes=true"
        })
class Boot2Es67FallbackTest {

    private static HttpServer stub;
    private static int stubPort;
    private static final Map<String, AtomicInteger> INDEX_PUTS = new ConcurrentHashMap<>();
    private static final Map<String, AtomicInteger> MAPPING_PUTS = new ConcurrentHashMap<>();

    @DynamicPropertySource
    static void esProperties(DynamicPropertyRegistry registry) throws IOException {
        if (stub == null) {
            stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            stub.createContext("/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                String method = exchange.getRequestMethod();
                String requestBody = readBody(exchange.getRequestBody());
                int status = 200;
                String json;

                if ("PUT".equals(method) && INDEX_PUTS.containsKey(path) || ("PUT".equals(method) && path.matches("/[a-z0-9_.-]+"))) {
                    AtomicInteger puts = INDEX_PUTS.computeIfAbsent(path, k -> new AtomicInteger());
                    puts.incrementAndGet();
                    if (!requestBody.contains("\"_doc\"")) {
                        status = 400;
                        json = "{\"error\":{\"type\":\"mapper_parsing_exception\","
                                + "\"reason\":\"mapping type is missing\"},\"status\":400}";
                    } else {
                        json = "{\"acknowledged\":true,\"index\":\"" + path.substring(1) + "\"}";
                    }
                } else if ("PUT".equals(method) && path.endsWith("/_doc/_mapping")) {
                    MAPPING_PUTS.computeIfAbsent(path, k -> new AtomicInteger()).incrementAndGet();
                    json = "{\"acknowledged\":true}";
                } else if ("PUT".equals(method) && path.endsWith("/_mapping")) {
                    AtomicInteger puts = MAPPING_PUTS.computeIfAbsent(path, k -> new AtomicInteger());
                    puts.incrementAndGet();
                    status = 400;
                    json = "{\"error\":{\"type\":\"action_request_validation_exception\","
                            + "\"reason\":\"mapping type is missing\"},\"status\":400}";
                } else if (path.endsWith("/_search")) {
                    // 6.x: hits.total is a number, not an object.
                    json = "{\"hits\":{\"total\":1,\"hits\":[{\"_id\":\"doc-1\",\"_index\":\"orders\",\"_source\":{}}]}}";
                } else if (path.contains("/_count")) {
                    json = "{\"count\":1}";
                } else if (path.contains("/_cat/indices")) {
                    json = "[{\"index\":\"orders\",\"health\":\"green\",\"status\":\"open\"}]";
                } else if (path.endsWith("/_cluster/health")) {
                    json = "{\"status\":\"green\",\"number_of_nodes\":1}";
                } else if (path.endsWith("/_settings")) {
                    json = "{\"orders\":{\"settings\":{\"index\":{\"number_of_shards\":\"1\"}}}}";
                } else if (path.endsWith("/_mapping")) {
                    json = "{\"orders\":{\"mappings\":{\"_doc\":{\"properties\":{\"title\":{\"type\":\"text\"}}}}}}";
                } else if (path.endsWith("/_alias") || path.contains("/_cat/")) {
                    json = path.contains("/_cat/") ? "[]" : "{\"orders\":{\"aliases\":{\"orders\":{}}}}";
                } else {
                    json = "{\"cluster_name\":\"es67-stub\",\"version\":{\"number\":\"6.7.2\"}}";
                }

                byte[] body = json.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            stub.start();
            stubPort = stub.getAddress().getPort();
        }
        registry.add("esquerystudio.elasticsearch.url", () -> "http://127.0.0.1:" + stubPort);
    }

    @AfterAll
    static void stopStub() {
        if (stub != null) {
            stub.stop(0);
        }
    }

    @Autowired
    private TestRestTemplate rest;

    @Test
    void createIndexRetriesWithTypedMapping() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> created = rest.postForEntity(
                "/internal/es/index/cluster/create-index?index=orders",
                new HttpEntity<>("{\"settings\":\"{}\",\"mapping\":\"{\\\"properties\\\":{}}\"}", headers),
                String.class);
        assertEquals(HttpStatus.OK, created.getStatusCode());
        assertTrue(created.getBody().contains("\"ok\":true"));
        assertEquals(2, INDEX_PUTS.get("/orders").get());
    }

    @Test
    void putMappingRetriesWithTypedRoute() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> mapping = rest.postForEntity(
                "/internal/es/index/cluster/put-mapping?index=orders",
                new HttpEntity<>("{\"properties\":{\"title\":{\"type\":\"text\"}}}", headers),
                String.class);
        assertEquals(HttpStatus.OK, mapping.getStatusCode());
        assertTrue(MAPPING_PUTS.containsKey("/orders/_doc/_mapping"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void numericHitsTotalPassesThroughUnchanged() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<Map> query = rest.postForEntity(
                "/internal/es/index/cluster/query?index=orders&size=5",
                new HttpEntity<>("{\"query\":{\"match_all\":{}}}", headers), Map.class);
        assertEquals(HttpStatus.OK, query.getStatusCode());
        Map<String, Object> hits = (Map<String, Object>) query.getBody().get("hits");
        assertEquals(1, hits.get("total"));
    }

    @Test
    void inspectReadsDocCountOnLegacyCluster() {
        ResponseEntity<String> inspect = rest.getForEntity(
                "/internal/es/index/cluster/inspect?index=orders&sampleSize=1", String.class);
        assertEquals(HttpStatus.OK, inspect.getStatusCode());
        assertTrue(inspect.getBody().contains("\"docCount\":1"));
        assertTrue(inspect.getBody().contains("title"));
    }

    private static String readBody(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[1024];
        int read;
        while ((read = in.read(buffer)) >= 0) {
            out.write(buffer, 0, read);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
}