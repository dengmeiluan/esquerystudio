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
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * PIT 开启通道的错误语义甄别——{@code keep_alive} 解析失败（400）与索引不存在（404）
 * 是请求级失败：{@code /_pit} 端点健在，异常必须直传错误通道（前端错误面板可回看全文
 * +重试），不得落「available=false + 集群不支持 PIT」的能力降级误导。真矿场景：用户在
 * keepAlive 输入框写错格式（输入 lint 只提醒不阻断、可照常提交）或所选索引刚被删除，
 * ES 回 400/404，此前 catch 一切异常统一降级 → 用户得到「当前集群不支持 Point-in-Time
 * （需 ES 7.10+）」——可修正的输入错误被误报成集群能力缺失。
 *
 * <p>打点路径：本机 HttpServer 桩（本仓测试基线：无 mockito，直构造在案先例）——桩按
 * 模式回 400（keep_alive 解析）、404（索引不存在）、400 no handler found（旧版本 ES 对
 * 未知路径的能力级签名，降级语义保留对照）。</p>
 *
 * @author aicoding
 */
public class EsIndexAdminPitOpenChannel921Test {

    private static final String KA_PARSE_400 = "kaParse400";
    private static final String IDX_MISSING_404 = "idxMissing404";
    private static final String NO_HANDLER_400 = "noHandler400";

    private HttpServer server;
    private RestHighLevelClient client;
    private final AtomicReference<String> mode = new AtomicReference<>(KA_PARSE_400);

    @Before
    public void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/", exchange -> {
            int status;
            String body;
            switch (mode.get()) {
                case IDX_MISSING_404:
                    status = 404;
                    body = "{\"error\":{\"root_cause\":[{\"type\":\"index_not_found_exception\",\"reason\":\"no such index [gone]\"}],\"type\":\"index_not_found_exception\",\"index\":\"gone\",\"status\":404}}";
                    break;
                case NO_HANDLER_400:
                    status = 400;
                    body = "{\"error\":\"no handler found for uri [/i/_pit] and method [POST]\"}";
                    break;
                case KA_PARSE_400:
                default:
                    status = 400;
                    body = "{\"error\":{\"root_cause\":[{\"type\":\"illegal_argument_exception\",\"reason\":\"failed to parse keep_alive [5x]\"}],\"type\":\"illegal_argument_exception\",\"status\":400}}";
                    break;
            }
            byte[] payload = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, payload.length);
            OutputStream os = exchange.getResponseBody();
            os.write(payload);
            os.close();
        });
        server.start();
        client = new RestHighLevelClient(
                RestClient.builder(new HttpHost("localhost", server.getAddress().getPort())));
    }

    @After
    public void tearDown() {
        try {
            client.close();
        } catch (Exception ignore) {
        }
        server.stop(0);
    }

    /** 宽容通道：keep_alive 格式写错（400 解析失败）必须异常直传，不得误判「集群不支持 PIT」。 */
    @Test
    public void keepAliveParseFailurePropagates() throws Exception {
        mode.set(KA_PARSE_400);
        EsIndexAdmin admin = new EsIndexAdmin(client);
        try {
            Map<String, Object> out = admin.pitOpen("i", "5x");
            fail("keep_alive 400 是请求级失败，必须异常直传错误通道；当前误判降级: " + out);
        } catch (ResponseException expected) {
            assertTrue("异常必须携带 ES 原文（keep_alive 解析语义），供前端错误面板回看",
                    String.valueOf(expected.getMessage()).contains("failed to parse keep_alive"));
        }
    }

    /** 请求级通道：索引不存在（404）同为请求失败，直传错误通道。 */
    @Test
    public void indexMissingFailurePropagates() throws Exception {
        mode.set(IDX_MISSING_404);
        EsIndexAdmin admin = new EsIndexAdmin(client);
        try {
            Map<String, Object> out = admin.pitOpen("gone", "5m");
            fail("索引不存在 404 是请求级失败，必须异常直传错误通道；当前误判降级: " + out);
        } catch (ResponseException expected) {
            assertTrue(String.valueOf(expected.getMessage()).contains("index_not_found_exception"));
        }
    }

    /** 能力级降级保留：旧版本 ES 对未知路径回 400 no handler found → available=false（既有契约）。 */
    @Test
    public void endpointMissingStillDegrades() throws Exception {
        mode.set(NO_HANDLER_400);
        EsIndexAdmin admin = new EsIndexAdmin(client);
        Map<String, Object> out = admin.pitOpen("i", "5m");
        assertFalse("no handler found = 端点真不在，能力降级语义必须保留",
                Boolean.TRUE.equals(out.get("available")));
        assertNotNull(out.get("reason"));
        assertNotNull(out.get("hint"));
    }
}
