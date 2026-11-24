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

package io.github.dengmeiluan.esquerystudio.console.core;

import com.sun.net.httpserver.HttpServer;
import io.github.dengmeiluan.esquerystudio.rest.EsClientContext;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * The engine must run on the shared {@link EsClientContext} (no console router, no
 * RestHighLevelClient handle): a Boot host injects its own low-level client and version, and
 * the version-aware layer still branches on {@code version.number}.
 */
public class EsIndexAdminContextTest {

    private static final List<String> UPSTREAM = Collections.synchronizedList(new ArrayList<>());
    private static final List<String> BODIES = Collections.synchronizedList(new ArrayList<>());
    private static HttpServer stub;
    private static RestClient client;

    @BeforeClass
    public static void startStub() throws IOException {
        stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        stub.createContext("/", exchange -> {
            String method = exchange.getRequestMethod();
            String path = exchange.getRequestURI().getPath();
            UPSTREAM.add(method + " " + path);
            BODIES.add(readBody(exchange.getRequestBody()));
            int status = 200;
            String json;
            if (method.equals("HEAD")) {
                json = "";
            } else if (path.endsWith("/_count")) {
                json = "{\"count\":3}";
            } else if (path.contains("/_mapping")) {
                json = "{\"acknowledged\":true}";
            } else if (path.endsWith("/_settings")) {
                json = "{\"orders\":{\"settings\":{}}}";
            } else {
                json = "{\"acknowledged\":true}";
            }
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
            if (bytes.length > 0) {
                exchange.getResponseBody().write(bytes);
            }
            exchange.close();
        });
        stub.start();
        client = RestClient.builder(new HttpHost("127.0.0.1", stub.getAddress().getPort(), "http")).build();
    }

    @AfterClass
    public static void stopStub() throws IOException {
        if (client != null) {
            client.close();
        }
        if (stub != null) {
            stub.stop(0);
        }
    }

    private static EsClientContext context(String version) {
        return new EsClientContext() {
            @Override
            public RestClient currentClient() {
                return client;
            }

            @Override
            public String currentEsVersion() {
                return version;
            }
        };
    }

    @Test
    public void engineRunsOnTheSharedContextWithoutAHighLevelClient() throws IOException {
        EsIndexAdmin admin = EsIndexAdmin.overContext(context("9.1.0"));
        assertTrue(admin.indexExists("orders"));
        Map<String, Object> counted = admin.count("orders", "");
        assertEquals(3L, ((Number) counted.get("count")).longValue());
    }

    @Test
    public void nineIsTypelessAndSixGetsTheTypeWrapper() throws IOException {
        BODIES.clear();
        UPSTREAM.clear();
        EsIndexAdmin.overContext(context("9.1.0"))
                .createIndex("orders", "{\"number_of_shards\":1}", "{\"properties\":{\"title\":{\"type\":\"text\"}}}");
        assertTrue("9.x create must be typeless", BODIES.stream().noneMatch(b -> b.contains("\"_doc\"")));

        BODIES.clear();
        UPSTREAM.clear();
        EsIndexAdmin.overContext(context("6.7.2"))
                .createIndex("orders", "{\"number_of_shards\":1}", "{\"properties\":{\"title\":{\"type\":\"text\"}}}");
        assertTrue("6.x create must wrap mappings with a type name", BODIES.stream().anyMatch(b -> b.contains("\"_doc\"")));
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
