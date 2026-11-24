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
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Boot host form must serve the same 17-group MCP endpoint as the full console. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "esquerystudio.boot.dev-bootstrap-auth=true",
                "esquerystudio.mcp.enabled=true",
                "esquerystudio.mcp.token=host-mcp-token"
        })
class Boot2McpHostTest {

    private static final String TOKEN = "host-mcp-token";
    private static HttpServer stub;
    private static int port;

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
                        : "{\"cluster_name\":\"boot3-host-stub\",\"version\":{\"number\":\"8.18.1\"}}";
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

    private HttpHeaders authHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(TOKEN);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private Map<String, Object> rpc(int id, String method, Map<String, Object> params) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("jsonrpc", "2.0");
        payload.put("id", id);
        payload.put("method", method);
        if (params != null) payload.put("params", params);
        ResponseEntity<Map> response = rest.exchange("/esmcp", HttpMethod.POST,
                new HttpEntity<>(payload, authHeaders()), Map.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        return response.getBody();
    }

    @Test
    void endpointRequiresServiceToken() {
        ResponseEntity<String> denied = rest.getForEntity("/esmcp", String.class);
        assertEquals(HttpStatus.UNAUTHORIZED, denied.getStatusCode());
    }

    @Test
    void discoveryExposesTheSeventeenGroupSurface() {
        ResponseEntity<Map> response = rest.exchange("/esmcp", HttpMethod.GET,
                new HttpEntity<>(authHeaders()), Map.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = response.getBody();
        assertNotNull(body);
        assertEquals("/esmcp", body.get("endpoint"));
        List<?> tools = (List<?>) body.get("tools");
        assertEquals(17, tools.size());
        assertEquals("json-rpc-over-http", body.get("transport"));
    }

    @Test
    void toolsListAndReadToolRunAgainstTheHostCluster() {
        Map<String, Object> list = rpc(2, "tools/list", null);
        Map<?, ?> listResult = (Map<?, ?>) list.get("result");
        assertEquals(17, ((List<?>) listResult.get("tools")).size());

        Map<String, Object> connectionParams = new LinkedHashMap<>();
        connectionParams.put("name", "es_connections");
        Map<String, Object> connectionArgs = new LinkedHashMap<>();
        connectionArgs.put("action", "list");
        connectionParams.put("arguments", connectionArgs);
        Map<?, ?> connections = (Map<?, ?>) rpc(3, "tools/call", connectionParams).get("result");
        assertEquals(Boolean.FALSE, connections.get("isError"), String.valueOf(connections));

        Map<String, Object> searchParams = new LinkedHashMap<>();
        searchParams.put("name", "es_search");
        Map<String, Object> searchArgs = new LinkedHashMap<>();
        searchArgs.put("action", "search");
        searchArgs.put("connection", "host");
        searchArgs.put("index", "orders");
        searchArgs.put("body", java.util.Collections.singletonMap("query",
                java.util.Collections.singletonMap("match_all", java.util.Collections.emptyMap())));
        searchParams.put("arguments", searchArgs);
        Map<?, ?> search = (Map<?, ?>) rpc(4, "tools/call", searchParams).get("result");
        assertEquals(Boolean.FALSE, search.get("isError"), String.valueOf(search));
    }

    @Test
    void consoleOnlyActionsFailHonestly() {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_adhoc_rebuild");
        Map<String, Object> args = new LinkedHashMap<>();
        args.put("action", "jobs");
        params.put("arguments", args);
        Map<?, ?> result = (Map<?, ?>) rpc(5, "tools/call", params).get("result");
        assertEquals(Boolean.TRUE, result.get("isError"));
        String text = String.valueOf(((List<?>) result.get("content")).get(0));
        assertTrue(text.contains("not available"), text);
        assertFalse(text.contains("available=false"), "host errors must not claim the endpoint is missing: " + text);
    }
}
