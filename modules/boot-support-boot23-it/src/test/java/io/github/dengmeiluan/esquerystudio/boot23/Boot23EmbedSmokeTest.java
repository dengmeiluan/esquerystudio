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

package io.github.dengmeiluan.esquerystudio.boot23;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.SpringBootApplication;
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
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Boot 2.3 (QuoteHub's baseline) embedding proof: the host app has no {@code @Import}; the
 * shared boot-support jar is discovered through {@code META-INF/spring.factories} (the only
 * auto-configuration channel Boot 2.3 knows), the console shell comes from the library's
 * classpath assets, and an ES 6.7-shaped cluster is served with the 6.7 fallbacks (numeric
 * {@code hits.total}, {@code _xpack/sql}).
 *
 * <p>Runs on Java 8 (the Boot 2.3 / Spring 5.2 baseline), so a regression that reintroduces
 * Java 9+ bytecode or a Boot 2.7-only API fails here before QuoteHub hits it.</p>
 */
@SpringBootTest(classes = Boot23EmbedSmokeTest.HostApp.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "esquerystudio.boot.dev-bootstrap-auth=true",
                "esquerystudio.boot.allow-writes=true"
        })
class Boot23EmbedSmokeTest {

    @SpringBootApplication
    static class HostApp {
    }

    private static HttpServer stub;
    private static int port;

    @DynamicPropertySource
    static void esProperties(DynamicPropertyRegistry registry) throws IOException {
        if (stub == null) {
            stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            stub.createContext("/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                String json;
                int status = 200;
                if (path.startsWith("/_sql")) {
                    /* ES 6.7 has no _sql: the console must fall back to _xpack/sql. */
                    status = 404;
                    json = "{\"error\":\"no handler found for uri [/_sql]\"}";
                } else if (path.startsWith("/_xpack/sql")) {
                    json = "{\"columns\":[{\"name\":\"n\",\"type\":\"long\"}],\"rows\":[[67]]}";
                } else if (path.endsWith("/_search")) {
                    /* 6.x hits.total is a number, not an object. */
                    json = "{\"hits\":{\"total\":1,\"hits\":[{\"_id\":\"doc-67\"}]}}";
                } else if (path.contains("/_cat/indices")) {
                    json = "[{\"index\":\"orders\",\"health\":\"green\",\"status\":\"open\"}]";
                } else if (path.endsWith("/_count")) {
                    json = "{\"count\":1}";
                } else if (path.endsWith("/_cluster/health")) {
                    json = "{\"status\":\"green\",\"number_of_nodes\":1}";
                } else {
                    json = "{\"cluster_name\":\"quotehub-67\",\"version\":{\"number\":\"6.7.2\"}}";
                }
                byte[] body = json.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, body.length);
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

    @Autowired
    private io.github.dengmeiluan.esquerystudio.rest.EsClientContext esClientContext;
    @Autowired
    private io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin esIndexAdmin;

    @Test
    void engineBeansRunOnThisBaseline() throws Exception {
        org.junit.jupiter.api.Assertions.assertEquals("6.7.2", esClientContext.currentEsVersion());
        org.junit.jupiter.api.Assertions.assertTrue(esIndexAdmin.indexExists("orders"));
        org.junit.jupiter.api.Assertions.assertEquals(1L,
                ((Number) esIndexAdmin.count("orders", "").get("count")).longValue());
    }

    @Test
    @SuppressWarnings("unchecked")
    void autoConfigurationMountsAgainstA67Cluster() {
        ResponseEntity<Map> response = rest.getForEntity("/internal/es/index/boot/health", Map.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("6.7.2", response.getBody().get("version"),
                "Boot 2.3 host must read the 6.7 cluster version");
        assertEquals("quotehub-67", response.getBody().get("cluster"));
    }

    @Test
    void libraryJarCarriesTheConsoleShell() {
        ResponseEntity<String> response = rest.getForEntity("/esquerystudio.html", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("ESQueryStudio"),
                "the boot-support jar must serve the console shell from classpath static assets");
    }

    @Test
    void pageContractIsServedFromTheLibrary() {
        ResponseEntity<String> response = rest.getForEntity("/internal/es/index/pages", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("\"pages\""), "page contract must be mounted");
        assertTrue(response.getBody().contains("\"mcp\""), "53-page contract must include the mcp page");
    }

    @Test
    void searchKeepsTheNumericHitsTotalOf67() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> response = rest.postForEntity(
                "/internal/es/index/boot/search?index=orders",
                new HttpEntity<>("{\"query\":{\"match_all\":{}}}", headers), String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("\"total\":1"),
                "6.x numeric hits.total must pass through untouched");
        assertTrue(response.getBody().contains("doc-67"));
    }

    @Test
    void sqlFallsBackToXpackOn67() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> response = rest.postForEntity(
                "/internal/es/index/boot/sql",
                new HttpEntity<>("SHOW TABLES", headers), String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("rows"),
                "6.7 must answer through the _xpack/sql fallback");
    }
}
