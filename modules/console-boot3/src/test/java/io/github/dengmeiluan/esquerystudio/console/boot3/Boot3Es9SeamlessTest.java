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

package io.github.dengmeiluan.esquerystudio.console.boot3;

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

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pins the "9.x rides the same modern request path" claim: an ES 9.1 cluster is served by the
 * typeless REST path with no 6.x/7.x branch firing. The stub records every upstream path, so a
 * regression that reintroduces `_xpack/sql` or typed `{index}/_doc/_mapping` retries turns red
 * instead of silently passing.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "esquerystudio.boot.dev-bootstrap-auth=true",
                "esquerystudio.boot.allow-writes=true"
        })
class Boot3Es9SeamlessTest {

    private static final List<String> UPSTREAM = Collections.synchronizedList(new ArrayList<>());
    private static HttpServer stub;
    private static int port;

    @DynamicPropertySource
    static void esProperties(DynamicPropertyRegistry registry) throws IOException {
        if (stub == null) {
            stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            stub.createContext("/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                UPSTREAM.add(exchange.getRequestMethod() + " " + path);
                String json;
                if (path.endsWith("/_search")) {
                    json = "{\"hits\":{\"total\":{\"value\":1,\"relation\":\"eq\"},\"hits\":[{\"_id\":\"doc-9\"}]}}";
                } else if (path.endsWith("/_sql")) {
                    json = "{\"columns\":[{\"name\":\"n\",\"type\":\"long\"}],\"rows\":[[9]]}";
                } else if (path.contains("/_cat/indices")) {
                    json = "[{\"index\":\"orders\",\"health\":\"green\",\"status\":\"open\"}]";
                } else if (path.contains("/_cat/aliases")) {
                    json = "[{\"alias\":\"orders\",\"index\":\"orders\"}]";
                } else if (path.endsWith("/_mapping")) {
                    json = "{\"orders\":{\"mappings\":{\"properties\":{\"title\":{\"type\":\"text\"}}}}}";
                } else if (path.endsWith("/_settings")) {
                    json = "{\"orders\":{\"settings\":{\"index\":{\"number_of_shards\":\"1\"}}}}";
                } else if (path.endsWith("/_count")) {
                    json = "{\"count\":1}";
                } else if (path.endsWith("/_cluster/health")) {
                    json = "{\"status\":\"green\",\"number_of_nodes\":1}";
                } else {
                    json = "{\"cluster_name\":\"es9-stub\",\"version\":{\"number\":\"9.1.0\"}}";
                }
                byte[] body = json.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            stub.start();
            port = stub.getAddress().getPort();
        }
        registry.add("esquerystudio.elasticsearch.url", () -> "http://127.0.0.1:" + port);
    }

    @AfterAll
    static void stopStub() {
        if (stub != null) {
            stub.stop(0);
        }
    }

    @Autowired
    private TestRestTemplate rest;

    private static boolean upstreamTouched(String fragment) {
        synchronized (UPSTREAM) {
            return UPSTREAM.stream().anyMatch(p -> p.contains(fragment));
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    void healthReportsTheClustersOwnNineVersion() {
        ResponseEntity<Map> response = rest.getForEntity("/internal/es/index/boot/health", Map.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("9.1.0", response.getBody().get("version"));
        assertEquals("es9-stub", response.getBody().get("cluster"));
    }

    @Test
    void searchAndSqlUseTheModernPathOnly() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<String> search = rest.postForEntity(
                "/internal/es/index/boot/search?index=orders",
                new HttpEntity<>("{\"query\":{\"match_all\":{}}}", headers), String.class);
        assertEquals(HttpStatus.OK, search.getStatusCode(), "boot/search must answer on a 9.x cluster");
        assertTrue(search.getBody().contains("doc-9"), "search must return the stub hit");

        ResponseEntity<String> sql = rest.postForEntity(
                "/internal/es/index/cluster/sql",
                new HttpEntity<>("SELECT 1", headers), String.class);
        assertEquals(HttpStatus.OK, sql.getStatusCode(), "sql must answer on a 9.x cluster");
        assertTrue(sql.getBody().contains("\"rows\""), "sql must relay the modern _sql result");

        assertTrue(upstreamTouched("/_sql"), "9.x sql must call _sql");
        assertFalse(upstreamTouched("_xpack/sql"), "9.x must not fall back to the 6.7 _xpack/sql endpoint");
    }

    @Test
    void mappingAndQueryWorkbenchStayTypeless() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<String> mapping = rest.postForEntity(
                "/internal/es/index/cluster/put-mapping?index=orders",
                new HttpEntity<>("{\"properties\":{\"title\":{\"type\":\"text\"}}}", headers), String.class);
        assertEquals(HttpStatus.OK, mapping.getStatusCode(), "put-mapping must answer on a 9.x cluster");

        ResponseEntity<String> detail = rest.getForEntity(
                "/internal/es/index/cluster/mapping-detail?index=orders", String.class);
        assertEquals(HttpStatus.OK, detail.getStatusCode());
        assertTrue(detail.getBody().contains("title"), "mapping-detail must read the typeless mapping");

        ResponseEntity<String> query = rest.postForEntity(
                "/internal/es/index/cluster/query?index=orders&size=5",
                new HttpEntity<>("{\"query\":{\"match_all\":{}}}", headers), String.class);
        assertEquals(HttpStatus.OK, query.getStatusCode());
        assertTrue(query.getBody().contains("doc-9"));

        assertTrue(upstreamTouched("/_mapping"), "mapping writes must use the typeless _mapping route");
        assertFalse(upstreamTouched("/_doc/_mapping"), "9.x must not retry the typed 6.x mapping route");
    }
}
