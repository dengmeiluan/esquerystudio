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

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class Boot2HealthSmokeTest {

    private static HttpServer stub;
    private static int stubPort;

    @DynamicPropertySource
    static void esProperties(DynamicPropertyRegistry registry) throws IOException {
        if (stub == null) {
            stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            stub.createContext("/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                String json = path.endsWith("/_search")
                        ? "{\"hits\":{\"total\":{\"value\":1,\"relation\":\"eq\"},\"hits\":[{\"_id\":\"doc-1\"}]}}"
                        : path.endsWith("/_sql")
                        ? "{\"columns\":[{\"name\":\"n\",\"type\":\"long\"}],\"rows\":[[1]]}"
                        : path.endsWith("/_count")
                        ? "{\"count\":1}"
                        : "{\"cluster_name\":\"boot2-stub\",\"version\":{\"number\":\"8.18.1\"}}";
                byte[] body = json.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
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

    @Autowired
    private io.github.dengmeiluan.esquerystudio.rest.EsClientContext esClientContext;
    @Autowired
    private io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin esIndexAdmin;

    @Test
    void engineBeansRunOnThisBaseline() throws Exception {
        org.junit.jupiter.api.Assertions.assertEquals("8.18.1", esClientContext.currentEsVersion());
        org.junit.jupiter.api.Assertions.assertTrue(esIndexAdmin.indexExists("orders"));
        org.junit.jupiter.api.Assertions.assertEquals(1L,
                ((Number) esIndexAdmin.count("orders", "").get("count")).longValue());
    }

    @Test
    @SuppressWarnings("unchecked")
    void healthReportsTheClustersOwnVersion() {
        ResponseEntity<Map> response = rest.getForEntity("/internal/es/index/boot/health", Map.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("8.18.1", response.getBody().get("version"));
        assertEquals("boot2-stub", response.getBody().get("cluster"));
        assertEquals("esquerystudio-console-boot2", response.getBody().get("artifact"));
    }

    @Test
    void servesTheExistingVueConsoleShell() {
        ResponseEntity<String> response = rest.getForEntity("/esquerystudio.html", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("ESQueryStudio"));
    }

    @Test
    void searchProxyExecutesDslAgainstTheCluster() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> response = rest.postForEntity(
                "/internal/es/index/boot/search?index=boot2-test",
                new HttpEntity<>("{\"query\":{\"match_all\":{}}}", headers), String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("doc-1"));
    }

    @Test
    void sqlUsesTheModernSqlEndpoint() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> response = rest.postForEntity(
                "/internal/es/index/boot/sql",
                new HttpEntity<>("{\"query\":\"SELECT 1\"}", headers), String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("\"rows\""));
    }
}
