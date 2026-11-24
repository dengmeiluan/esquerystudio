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

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
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
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Boot 4.2 host form must serve the shared 17-group MCP endpoint (Spring 7 / Java 21). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "esquerystudio.boot.dev-bootstrap-auth=true",
                "esquerystudio.mcp.enabled=true",
                "esquerystudio.mcp.token=host-mcp-token"
        })
class Boot4McpHostTest {

    private static final String TOKEN = "host-mcp-token";
    private static final ObjectMapper JSON = new ObjectMapper();
    private static HttpServer stub;
    private static int stubPort;

    private final HttpClient http = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    private int port;

    @DynamicPropertySource
    static void esProperties(DynamicPropertyRegistry registry) throws IOException {
        if (stub == null) {
            stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            stub.createContext("/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                String json = path.endsWith("/_search")
                        ? "{\"hits\":{\"total\":{\"value\":1,\"relation\":\"eq\"},\"hits\":[{\"_id\":\"doc-1\",\"_source\":{\"title\":\"hello\"}}]}}"
                        : path.endsWith("/_count")
                        ? "{\"count\":1}"
                        : "{\"cluster_name\":\"boot4-host-stub\",\"version\":{\"number\":\"9.5.7\"}}";
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

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private HttpResponse<String> get(String path, boolean auth) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri(path)).GET();
        if (auth) builder.header("Authorization", "Bearer " + TOKEN);
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private Map<?, ?> rpc(int id, String method, String paramsJson) throws Exception {
        String payload = "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"method\":\"" + method + "\""
                + (paramsJson == null ? "" : ",\"params\":" + paramsJson) + "}";
        HttpResponse<String> response = http.send(HttpRequest.newBuilder(uri("/esmcp"))
                        .header("Authorization", "Bearer " + TOKEN)
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(payload))
                        .build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        return JSON.readValue(response.body(), Map.class);
    }

    @Test
    void endpointRequiresServiceToken() throws Exception {
        assertEquals(401, get("/esmcp", false).statusCode());
    }

    @Test
    void discoveryExposesTheSeventeenGroupSurface() throws Exception {
        HttpResponse<String> response = get("/esmcp", true);
        assertEquals(200, response.statusCode());
        Map<?, ?> body = JSON.readValue(response.body(), Map.class);
        assertNotNull(body);
        assertEquals("/esmcp", body.get("endpoint"));
        assertEquals(17, ((List<?>) body.get("tools")).size());
    }

    @Test
    void toolsListAndReadToolRunAgainstTheHostCluster() throws Exception {
        Map<?, ?> listResult = (Map<?, ?>) rpc(2, "tools/list", null).get("result");
        assertEquals(17, ((List<?>) listResult.get("tools")).size());

        Map<?, ?> search = (Map<?, ?>) rpc(4, "tools/call",
                "{\"name\":\"es_search\",\"arguments\":{\"action\":\"search\",\"connection\":\"host\","
                        + "\"index\":\"orders\",\"body\":{\"query\":{\"match_all\":{}}}}}")
                .get("result");
        assertEquals(Boolean.FALSE, search.get("isError"), String.valueOf(search));
    }

    @Test
    void consoleOnlyActionsFailHonestly() throws Exception {
        Map<?, ?> result = (Map<?, ?>) rpc(5, "tools/call",
                "{\"name\":\"es_adhoc_rebuild\",\"arguments\":{\"action\":\"jobs\"}}").get("result");
        assertEquals(Boolean.TRUE, result.get("isError"));
        String text = String.valueOf(((List<?>) result.get("content")).get(0));
        assertTrue(text.contains("not available"), text);
        assertFalse(text.contains("available=false"), "host errors must not claim the endpoint is missing: " + text);
    }
}
