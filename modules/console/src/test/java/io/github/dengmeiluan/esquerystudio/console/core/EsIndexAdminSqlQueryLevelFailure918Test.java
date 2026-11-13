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
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * ES SQL 查询级失败甄别——{@code verification_exception}/{@code parsing_exception} 形态的
 * 400 说明 _sql 端点健在、是查询本身写错（列名不存在/语法错误），必须异常直传错误通道
 * （前端错误面板可回看全文+重试），不得落「available=false + 未启用 _sql 提示」的能力降级。
 *
 * <p>真矿场景：商业版集群（SQL 可用）上用户写错列名 → ES 回 400 verification_exception →
 * 此前 catch 一切异常统一降级 → 前端渲染「_sql 接口不可用（OSS/未授权）」大面板并引导改用
 * DSL——可修复的查询错误被误报成集群能力缺失。</p>
 *
 * <p>打点路径：本机 HttpServer 桩（本仓测试基线：无 mockito，直构造在案先例）——
 * 桩按模式回 400（verification/parsing）、405（双路径真不可用）、400 invalid_index_name
 * （legacyShape 对照，降级保留）。</p>
 *
 * @author aicoding
 */
public class EsIndexAdminSqlQueryLevelFailure918Test {

    private static final String VERIFY_400 = "verify400";
    private static final String PARSE_400 = "parse400";
    private static final String UNAVAIL_405 = "unavail405";
    private static final String LEGACY_400 = "legacy400";

    private HttpServer server;
    private RestHighLevelClient client;
    private final AtomicReference<String> mode = new AtomicReference<>(VERIFY_400);

    @Before
    public void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/", exchange -> {
            int status;
            String body;
            switch (mode.get()) {
                case PARSE_400:
                    status = 400;
                    body = "{\"error\":{\"root_cause\":[{\"type\":\"parsing_exception\",\"reason\":\"line 1:1: no viable alternative\"}],\"type\":\"parsing_exception\",\"status\":400}}";
                    break;
                case UNAVAIL_405:
                    status = 405;
                    body = "{\"error\":\"no handler found for uri [/_sql] and method [POST]\"}";
                    break;
                case LEGACY_400:
                    status = 400;
                    body = "{\"error\":{\"root_cause\":[{\"type\":\"invalid_index_name_exception\",\"reason\":\"Invalid index name [_sql]\"}],\"status\":400}}";
                    break;
                case VERIFY_400:
                default:
                    status = 400;
                    body = "{\"error\":{\"root_cause\":[{\"type\":\"verification_exception\",\"reason\":\"Found 1 problem\\nline 1:51: Unknown column [ts]\"}],\"type\":\"verification_exception\",\"reason\":\"Found 1 problem\",\"status\":400}}";
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

    /** 宽容模式：列名写错（verification 400）必须异常直传，不得误判「接口不可用」。 */
    @Test
    public void lenientVerificationFailurePropagates() throws Exception {
        mode.set(VERIFY_400);
        EsIndexAdmin admin = new EsIndexAdmin(client);
        try {
            Map<String, Object> out = admin.sqlLenient("{\"query\":\"SELECT * FROM \\\"i\\\" ORDER BY ts DESC LIMIT 100\"}");
            fail("verification 400 是查询级失败，必须异常直传错误通道；当前误判降级: " + out);
        } catch (ResponseException expected) {
            assertTrue("异常必须携带 ES 原文（verification_exception），供前端错误面板回看",
                    String.valueOf(expected.getMessage()).contains("verification_exception"));
        }
    }

    /** 标准查询：同甄别（sqlQuery 与 sqlLenient 同构）。 */
    @Test
    public void queryVerificationFailurePropagates() throws Exception {
        mode.set(VERIFY_400);
        EsIndexAdmin admin = new EsIndexAdmin(client);
        try {
            Map<String, Object> out = admin.sqlQuery("{\"query\":\"SELECT ts FROM \\\"i\\\" LIMIT 10\"}");
            fail("verification 400 是查询级失败，必须异常直传错误通道；当前误判降级: " + out);
        } catch (ResponseException expected) {
            assertTrue(String.valueOf(expected.getMessage()).contains("verification_exception"));
        }
    }

    /** 语法错误（parsing 400）同为查询级失败，直传错误通道。 */
    @Test
    public void lenientParsingFailurePropagates() throws Exception {
        mode.set(PARSE_400);
        EsIndexAdmin admin = new EsIndexAdmin(client);
        try {
            Map<String, Object> out = admin.sqlLenient("{\"query\":\"SELECT FROM WHERE\"}");
            fail("parsing 400 是查询级失败，必须异常直传错误通道；当前误判降级: " + out);
        } catch (ResponseException expected) {
            assertTrue(String.valueOf(expected.getMessage()).contains("parsing_exception"));
        }
    }

    /** 真不可用降级保留：/_sql 与 /_xpack/sql 双路径都 405 → available=false（OSS/未授权形态）。 */
    @Test
    public void genuineUnavailableStillDegrades() throws Exception {
        mode.set(UNAVAIL_405);
        EsIndexAdmin admin = new EsIndexAdmin(client);
        Map<String, Object> out = admin.sqlLenient("{\"query\":\"SELECT 1\"}");
        assertFalse("双路径 405 = 端点真不在，能力降级语义必须保留",
                Boolean.TRUE.equals(out.get("available")));
        assertTrue(out.get("reason") != null);
    }

    /** legacyShape 对照：400 invalid_index_name → xpack 前缀重试 → 仍 legacy 形态 → 降级保留（既有契约）。 */
    @Test
    public void legacyShapeStillDegrades() throws Exception {
        mode.set(LEGACY_400);
        EsIndexAdmin admin = new EsIndexAdmin(client);
        Map<String, Object> out = admin.sqlLenient("{\"query\":\"SELECT 1\"}");
        assertFalse("legacyShape（invalid_index_name）是 6.x 探测形态，降级语义保留",
                Boolean.TRUE.equals(out.get("available")));
    }
}
