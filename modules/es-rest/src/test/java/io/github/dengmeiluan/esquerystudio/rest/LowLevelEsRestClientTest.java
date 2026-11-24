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

package io.github.dengmeiluan.esquerystudio.rest;

import com.sun.net.httpserver.HttpServer;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class LowLevelEsRestClientTest {

    private static HttpServer server;
    private static RestClient client;

    private LowLevelEsRestClient rest;

    @BeforeClass
    public static void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        // /slow must not block the other cases while it sleeps: handlers run on daemon threads.
        server.setExecutor(Executors.newCachedThreadPool(r -> {
            Thread thread = new Thread(r, "es-rest-stub");
            thread.setDaemon(true);
            return thread;
        }));
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String body;
            int status = 200;
            if ("/slow".equals(path)) {
                try {
                    Thread.sleep(8000);
                    byte[] late = "{\"late\":true}".getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(200, late.length);
                    exchange.getResponseBody().write(late);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                } catch (IOException ignored) {
                    // the cancelled client closed the socket; expected for this case
                } finally {
                    exchange.close();
                }
                return;
            }
            if ("/error".equals(path)) {
                status = 500;
                body = "{\"error\":\"boom\"}";
            } else if ("/echo".equals(path)) {
                body = readBody(exchange.getRequestBody());
            } else {
                body = "{\"ok\":true}";
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        client = RestClient.builder(
                new HttpHost("127.0.0.1", server.getAddress().getPort(), "http")).build();
    }

    @AfterClass
    public static void stopStub() throws IOException {
        if (client != null) {
            client.close();
        }
        if (server != null) {
            server.stop(0);
        }
    }

    @Before
    public void setUp() {
        rest = new LowLevelEsRestClient(client);
    }

    @Test
    public void getPreservesStatusAndBody() throws IOException {
        EsRestResponse response = rest.perform("GET", "/", null);
        assertEquals(200, response.status());
        assertTrue(response.body().contains("\"ok\":true"));
    }

    @Test
    public void postForwardsTheBody() throws IOException {
        String dsl = "{\"query\":{\"match_all\":{}}}";
        EsRestResponse response = rest.perform("POST", "/echo", dsl);
        assertEquals(200, response.status());
        assertEquals(dsl, response.body());
    }

    @Test
    public void errorPreservesStatusAndBody() throws IOException {
        EsRestResponse response = rest.perform("GET", "/error", null);
        assertEquals(500, response.status());
        assertTrue(response.body().contains("boom"));
    }

    @Test
    public void asyncDeliversSuccessResponse() throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<EsRestResponse> ok = new AtomicReference<>();
        AtomicReference<IOException> err = new AtomicReference<>();
        rest.performAsync("POST", "/echo", "{\"q\":1}",
                response -> {
                    ok.set(response);
                    done.countDown();
                },
                failure -> {
                    err.set(failure);
                    done.countDown();
                });
        assertTrue("async call must complete", done.await(5, TimeUnit.SECONDS));
        assertNull("async success must not report a transport failure", err.get());
        assertEquals(200, ok.get().status());
        assertEquals("{\"q\":1}", ok.get().body());
    }

    @Test
    public void asyncPreservesErrorStatusAndBody() throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<EsRestResponse> ok = new AtomicReference<>();
        AtomicReference<IOException> err = new AtomicReference<>();
        rest.performAsync("GET", "/error", null,
                response -> {
                    ok.set(response);
                    done.countDown();
                },
                failure -> {
                    err.set(failure);
                    done.countDown();
                });
        assertTrue("async call must complete", done.await(5, TimeUnit.SECONDS));
        assertNull("a 5xx is an answer, not a transport failure", err.get());
        assertEquals(500, ok.get().status());
        assertTrue(ok.get().body().contains("boom"));
    }

    @Test
    public void cancelAbortsTheExchangeInsteadOfWaiting() throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<EsRestResponse> ok = new AtomicReference<>();
        AtomicReference<IOException> err = new AtomicReference<>();
        long started = System.nanoTime();
        EsRestCancellable handle = rest.performAsync("GET", "/slow", null,
                response -> {
                    ok.set(response);
                    done.countDown();
                },
                failure -> {
                    err.set(failure);
                    done.countDown();
                });
        Thread.sleep(200);
        assertNull("the 8s stub cannot have answered yet", ok.get());
        assertNull("no transport failure before cancel", err.get());
        handle.cancel();
        assertTrue("cancel must abort the in-flight exchange", done.await(5, TimeUnit.SECONDS));
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
        assertNull("a cancelled call must not report success", ok.get());
        assertNotNull("cancel is surfaced as a transport failure", err.get());
        assertTrue("cancel must land well before the 8s stub reply, elapsed=" + elapsedMs + "ms",
                elapsedMs < 4000);
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
