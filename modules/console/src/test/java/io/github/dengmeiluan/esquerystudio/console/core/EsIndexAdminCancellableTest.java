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
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

/**
 * 1127：同步 REST 透传取消必须是**线级** abort——不是只停 MCP 侧状态。
 * 用一个 4s 才响应的本地 HTTP 桩验证三件事：
 *  ① 取消后阻塞调用立即返回（远早于服务端响应）；
 *  ② 返回必须是异常（取消语义，不伪装成功）；
 *  ③ 服务端在连接断开后写响应失败（连接真被 abort，而非客户端单方面放弃）。
 */
public class EsIndexAdminCancellableTest {

    @Test
    public void rawCancellableAbortsInFlightHttpConnection() throws Exception {
        AtomicBoolean serverSawBrokenConnection = new AtomicBoolean(false);
        CountDownLatch requestStarted = new CountDownLatch(1);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/slow", exchange -> {
            requestStarted.countDown();
            try {
                Thread.sleep(4_000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            try {
                byte[] body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("content-type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            } catch (IOException e) {
                /* 客户端 abort 后连接已断：写响应失败即线级取消的直接证据。 */
                serverSawBrokenConnection.set(true);
            }
        });
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();

        RestHighLevelClient client = new RestHighLevelClient(RestClient.builder(
                new HttpHost("127.0.0.1", server.getAddress().getPort(), "http")));
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            EsIndexAdmin admin = new EsIndexAdmin(client.getLowLevelClient());
            AtomicReference<org.elasticsearch.client.Cancellable> cancellable = new AtomicReference<>();
            CountDownLatch attached = new CountDownLatch(1);
            Future<Object> call = pool.submit(() -> {
                try {
                    return admin.rawCancellable("GET", "/slow", null, false, c -> {
                        cancellable.set(c);
                        attached.countDown();
                    });
                } catch (Exception e) {
                    return e;
                }
            });

            assertTrue("请求必须真的到达服务端", requestStarted.await(3, TimeUnit.SECONDS));
            assertTrue("MCP 侧必须拿到 Cancellable 登记口", attached.await(3, TimeUnit.SECONDS));
            long startedAt = System.currentTimeMillis();
            cancellable.get().cancel();
            Object outcome = call.get(3, TimeUnit.SECONDS);
            long elapsed = System.currentTimeMillis() - startedAt;

            assertTrue("取消必须在连接 abort 后立即返回，而不是等满服务端 4s 响应（实际 " + elapsed + "ms）",
                    elapsed < 3_000);
            assertTrue("取消必须以异常结束，绝不伪装成功: " + outcome, outcome instanceof Exception);

            long deadline = System.currentTimeMillis() + 8_000;
            while (!serverSawBrokenConnection.get() && System.currentTimeMillis() < deadline) {
                Thread.sleep(50);
            }
            assertTrue("连接必须真被 abort（服务端写响应应失败）", serverSawBrokenConnection.get());
        } finally {
            pool.shutdownNow();
            try {
                client.close();
            } catch (IOException ignored) {
                /* 关闭期连接已 abort，忽略 */
            }
            server.stop(0);
        }
    }
}
