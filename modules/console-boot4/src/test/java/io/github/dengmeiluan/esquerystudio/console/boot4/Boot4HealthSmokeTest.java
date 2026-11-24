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

package io.github.dengmeiluan.esquerystudio.console.boot4;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class Boot4HealthSmokeTest {

    private static HttpServer stub;
    private static int stubPort;

    private final HttpClient http = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private io.github.dengmeiluan.esquerystudio.rest.EsClientContext esClientContext;
    @Autowired
    private io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin esIndexAdmin;

    @Test
    void engineBeansRunOnThisBaseline() throws Exception {
        org.junit.jupiter.api.Assertions.assertEquals("9.5.7", esClientContext.currentEsVersion());
        org.junit.jupiter.api.Assertions.assertTrue(esIndexAdmin.indexExists("orders"));
        org.junit.jupiter.api.Assertions.assertEquals(1L,
                ((Number) esIndexAdmin.count("orders", "").get("count")).longValue());
    }

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
                        : "{\"cluster_name\":\"boot4-stub\",\"version\":{\"number\":\"9.5.7\"}}";
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

    @Test
    void healthReportsTheClustersOwnVersion() throws Exception {
        HttpResponse<String> response = get("/internal/es/index/boot/health");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"version\":\"9.5.7\""));
        assertTrue(response.body().contains("\"cluster\":\"boot4-stub\""));
        assertTrue(response.body().contains("\"artifact\":\"esquerystudio-console-boot4\""));
        assertTrue(response.body().contains("\"ok\":true"));
    }

    @Test
    void servesTheExistingVueConsoleShell() throws Exception {
        HttpResponse<String> response = get("/esquerystudio.html");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("ESQueryStudio"));
    }

    @Test
    void searchProxyExecutesDslAgainstTheCluster() throws Exception {
        HttpResponse<String> response = postJson(
                "/internal/es/index/boot/search?index=boot4-test",
                "{\"query\":{\"match_all\":{}}}");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("doc-1"));
    }

    @Test
    void sqlUsesTheModernSqlEndpoint() throws Exception {
        HttpResponse<String> response = postJson(
                "/internal/es/index/boot/sql",
                "{\"query\":\"SELECT 1\"}");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"rows\""));
    }

    private HttpResponse<String> get(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(uri(path)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> postJson(String path, String body) throws Exception {
        return http.send(HttpRequest.newBuilder(uri(path))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }
}
