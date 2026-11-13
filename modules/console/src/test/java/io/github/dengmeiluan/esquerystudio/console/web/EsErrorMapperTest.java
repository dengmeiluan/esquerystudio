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

package io.github.dengmeiluan.esquerystudio.console.web;

import org.elasticsearch.ElasticsearchStatusException;
import org.elasticsearch.rest.RestStatus;
import org.junit.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.ConnectException;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * -C2：ES 错误透传口径的守门测试——状态码映射、原始报错体（含 root_cause）不被吞、超长截断、
 * 以及全包兜底 advice 的产出体形态。前端 {@code friendlyEsError} 依赖 message 里的 reason，
 * 这里一旦松动，控制台就会退回「内部错误」黑洞。
 *
 * @author aicoding
 */
public class EsErrorMapperTest {

    /** 真实 ES 404 报错体（RHLC 的 ResponseException#getMessage 就是这个形状）。 */
    private static final String ES_404_BODY = "method [GET], host [http://127.0.0.1:9200], URI [/nope/_mapping], "
            + "status line [HTTP/1.1 404 Not Found]\n"
            + "{\"error\":{\"root_cause\":[{\"type\":\"index_not_found_exception\",\"reason\":\"no such index [nope]\","
            + "\"index\":\"nope\"}],\"type\":\"index_not_found_exception\",\"reason\":\"no such index [nope]\"},"
            + "\"status\":404}";

    // ---------------- 状态码映射 ----------------

    @Test
    public void esStatus4xx_isPassedThrough() {
        assertEquals("ES 端 404 应原样透传，不拉平成 500 误导成本服务故障",
                404, EsErrorMapper.httpStatusOf(new ElasticsearchStatusException("nope", RestStatus.NOT_FOUND)));
        assertEquals(400, EsErrorMapper.httpStatusOf(new ElasticsearchStatusException("bad dsl", RestStatus.BAD_REQUEST)));
    }

    @Test
    public void esStatus5xx_mapsTo502() {
        assertEquals("ES 端 5xx 是上游故障，映射 502",
                502, EsErrorMapper.httpStatusOf(new ElasticsearchStatusException("down", RestStatus.SERVICE_UNAVAILABLE)));
    }

    @Test
    public void responseStatusException_preservesBusinessStatusAndReason() {
        ResponseStatusException denied = new ResponseStatusException(
                HttpStatus.FORBIDDEN, "PIT id 由他人开启：仅开启者本人或 ADMIN 可使用");
        assertEquals("控制器主动判定的 403 不得被兜底拉平成 500", 403, EsErrorMapper.httpStatusOf(denied));
        assertEquals("错误体只保留业务文案，不暴露 ResponseStatusException 框架串",
                "PIT id 由他人开启：仅开启者本人或 ADMIN 可使用", EsErrorMapper.describe(denied));
        assertEquals("PIT id 由他人开启：仅开启者本人或 ADMIN 可使用",
                EsErrorMapper.esErrorBody(denied).get("message"));
    }

    @Test
    public void ioException_mapsTo502() {
        assertEquals(502, EsErrorMapper.httpStatusOf(new IOException("read timed out")));
        assertEquals(502, EsErrorMapper.httpStatusOf(new ConnectException("Connection refused")));
    }

    @Test
    public void nonEsException_mapsTo500() {
        assertEquals(500, EsErrorMapper.httpStatusOf(new IllegalStateException("boom")));
    }

    // ---------------- message 透传 ----------------

    @Test
    public void describe_keepsRootCauseReason() {
        String msg = EsErrorMapper.describe(new IOException(ES_404_BODY));
        assertTrue("必须保留 root_cause 供前端 friendlyEsError 提取", msg.contains("root_cause"));
        assertTrue(msg.contains("index_not_found_exception"));
        assertTrue(msg.contains("no such index [nope]"));
        assertTrue("前缀带异常类名，便于运维定位", msg.startsWith("IOException: "));
    }

    @Test
    public void describe_nullMessage_usesClassNameOnly() {
        assertEquals("IOException", EsErrorMapper.describe(new IOException()));
    }

    @Test
    public void describe_truncatesOverlongBody() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 500; i++) {
            sb.append("bulk failure item ").append(i).append("; ");
        }
        String msg = EsErrorMapper.describe(new IOException(sb.toString()));
        assertTrue("超长报错体必须截断，防前端弹层与日志爆量", msg.length() <= EsErrorMapper.MAX_MESSAGE_LEN + 32);
        assertTrue(msg.endsWith("...(truncated)"));
    }

    // ---------------- 错误体形态 ----------------

    @Test
    public void esErrorBody_hasErrorFlagAndCode() {
        Map<String, Object> body = EsErrorMapper.esErrorBody(new IOException(ES_404_BODY));
        assertEquals(Boolean.TRUE, body.get("error"));
        assertEquals("ES_ERROR", body.get("code"));
        assertTrue(String.valueOf(body.get("message")).contains("no such index [nope]"));
    }

    // ---------------- 全包兜底 advice ----------------

    @Test
    public void fallbackAdvice_propagatesReasonWithEsStatus() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsErrorFallbackAdvice()
                .esError(new ElasticsearchStatusException(ES_404_BODY, RestStatus.NOT_FOUND), null);
        assertEquals(404, resp.getStatusCodeValue());
        assertEquals("ES_ERROR", resp.getBody().get("code"));
        assertTrue("advice 产出体必须含 ES reason（此前 xmigrate/连接管理等端点在宿主 handler 被拍平成「内部错误」）",
                String.valueOf(resp.getBody().get("message")).contains("index_not_found_exception"));
    }

    @Test
    public void fallbackAdvice_networkFailureIs502() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsErrorFallbackAdvice()
                .esError(new ConnectException("Connection refused: 10.0.0.9:9200"), null);
        assertEquals(502, resp.getStatusCodeValue());
        assertTrue(String.valueOf(resp.getBody().get("message")).contains("10.0.0.9:9200"));
    }

    // ---------------- endpoint 上下文（错误体补 endpoint = METHOD + " " + requestURI） ----------------

    /** HttpServletRequest 桩：JDK 动态代理（仓内无 mockito/spring-test，与 ConsoleAuthInterceptorPageAuthTest 同范式）。 */
    private static javax.servlet.http.HttpServletRequest stubRequest(final String method, final String uri) {
        java.lang.reflect.InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getMethod": return method;
                case "getRequestURI": return uri;
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (javax.servlet.http.HttpServletRequest) java.lang.reflect.Proxy.newProxyInstance(
                EsErrorMapperTest.class.getClassLoader(),
                new Class<?>[]{javax.servlet.http.HttpServletRequest.class}, h);
    }

    @Test
    public void body_withEndpoint_containsEndpointField() {
        Map<String, Object> body = EsErrorMapper.body("ES_ERROR", "boom", "GET /internal/es/index/keys");
        assertEquals("GET /internal/es/index/keys", body.get("endpoint"));
        assertEquals(Boolean.TRUE, body.get("error"));
        assertEquals("ES_ERROR", body.get("code"));
    }

    @Test
    public void body_withoutEndpoint_keepsLegacyShape() {
        assertTrue("两参旧口径不得新增 endpoint 键（既有响应形状逐字节不变）",
                !EsErrorMapper.body("ES_ERROR", "boom").containsKey("endpoint"));
    }

    @Test
    public void esErrorBody_withEndpoint_carriesEndpoint() {
        Map<String, Object> body = EsErrorMapper.esErrorBody(
                new IOException(ES_404_BODY), "GET /internal/es/index/inspect");
        assertEquals("GET /internal/es/index/inspect", body.get("endpoint"));
        assertTrue("message 透传不受影响", String.valueOf(body.get("message")).contains("no such index [nope]"));
    }

    @Test
    public void fallbackAdvice_carriesEndpointFromRequest() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsErrorFallbackAdvice()
                .esError(new ElasticsearchStatusException(ES_404_BODY, RestStatus.NOT_FOUND),
                        stubRequest("GET", "/internal/es/index/keys"));
        assertEquals(404, resp.getStatusCodeValue());
        assertEquals("GET /internal/es/index/keys", resp.getBody().get("endpoint"));
    }

    @Test
    public void fallbackAdvice_nullRequest_omitsEndpointWithoutThrowing() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsErrorFallbackAdvice()
                .esError(new ConnectException("Connection refused"), null);
        assertEquals(502, resp.getStatusCodeValue());
        assertTrue("request 缺失时宁缺勿炸：不含 endpoint 键", !resp.getBody().containsKey("endpoint"));
    }

    @Test
    public void controllerLocalHandler_carriesEndpointToo() throws Exception {
        /* 构造器仅赋值字段，传 null 安全；覆盖主控制台控制器本地 handler 的 endpoint 补字段 */
        InternalEsIndexRebuildController controller = new InternalEsIndexRebuildController(null, null);
        ResponseEntity<Map<String, Object>> resp = controller.handleError(
                new IOException(ES_404_BODY), stubRequest("GET", "/internal/es/index/cluster/snapshot/status"));
        assertEquals(502, resp.getStatusCodeValue());
        assertEquals("GET /internal/es/index/cluster/snapshot/status", resp.getBody().get("endpoint"));
    }
}
