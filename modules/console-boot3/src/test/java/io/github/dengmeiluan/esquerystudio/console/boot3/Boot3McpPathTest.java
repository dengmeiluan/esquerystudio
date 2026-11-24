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
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** The host form must honour {@code esquerystudio.mcp.path} instead of hardcoding /esmcp. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "esquerystudio.boot.dev-bootstrap-auth=true",
                "esquerystudio.mcp.enabled=true",
                "esquerystudio.mcp.token=host-mcp-token",
                "esquerystudio.mcp.path=/mcp"
        })
class Boot3McpPathTest {

    private static HttpServer stub;
    private static int port;

    @DynamicPropertySource
    static void esProperties(DynamicPropertyRegistry registry) throws IOException {
        if (stub == null) {
            stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            stub.createContext("/", exchange -> {
                byte[] body = "{\"cluster_name\":\"boot3-path-stub\",\"version\":{\"number\":\"8.18.1\"}}"
                        .getBytes(StandardCharsets.UTF_8);
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
        headers.setBearerAuth("host-mcp-token");
        return headers;
    }

    @Test
    void customPathMountsAndDefaultEndpointIsFree() {
        ResponseEntity<Map> custom = rest.exchange("/mcp", HttpMethod.GET,
                new HttpEntity<>(authHeaders()), Map.class);
        assertEquals(HttpStatus.OK, custom.getStatusCode());
        assertEquals("/mcp", custom.getBody().get("endpoint"));

        ResponseEntity<String> defaultPath = rest.getForEntity("/esmcp", String.class);
        assertEquals(HttpStatus.NOT_FOUND, defaultPath.getStatusCode(),
                "default /esmcp must stay free when the host configured /mcp");
    }
}
