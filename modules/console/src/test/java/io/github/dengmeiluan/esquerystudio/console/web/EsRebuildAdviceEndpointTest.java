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

import io.github.dengmeiluan.esquerystudio.console.adhoc.InternalAdhocRebuildController;
import org.junit.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 批 534：两个业务 advice 的 endpoint 上下文 + adhoc 托管的守门测试。
 *
 * <p>P0 断层修复的回归锚：{@link InternalEsRebuildExceptionAdvice} 的 assignableTypes 此前
 * <b>漏了</b> {@link InternalAdhocRebuildController}——adhoc 十余处业务拒绝（别名无法确定 write
 * 索引 / 需 confirmDirectSwap / 目标物理索引已存在等）一路落到宿主全局处理器被拍平 500，
 * 前端拿不到结构化 {@code code}。三锚：</p>
 * <ol>
 *   <li>assignableTypes 必须含 adhoc 控制器（反射读注解，无需起 Spring 容器）；</li>
 *   <li>handler 带 {@code HttpServletRequest} 形参时错误体补 {@code endpoint}（空白不输出），
 *       与 {@code InternalEsErrorFallbackAdvice} / 控制器本地 {@code handleError} 同口径；</li>
 *   <li>旧形状兼容：无 request（或本地 handler 委派旧口径入口）时响应仍是 {@code {code,message}}，
 *       不含 endpoint 键、code 分流语义不变。</li>
 * </ol>
 *
 * <p>HttpServletRequest 桩：JDK 动态代理（仓内无 mockito/spring-test，
 * 与 {@code EsErrorMapperTest#stubRequest} 同范式）。</p>
 *
 * @author aicoding
 */
public class EsRebuildAdviceEndpointTest {

    /* ---------------- 锚① assignableTypes 含 adhoc 控制器 ---------------- */

    @Test
    public void rebuildAdvice_assignableTypes_containsAdhocController() {
        RestControllerAdvice anno = InternalEsRebuildExceptionAdvice.class.getAnnotation(RestControllerAdvice.class);
        assertTrue("advice 必须带 @RestControllerAdvice", anno != null);
        assertTrue("assignableTypes 必须补入 InternalAdhocRebuildController（否则 adhoc 业务拒绝落到宿主全局处理器被拍平 500）",
                Arrays.asList(anno.assignableTypes()).contains(InternalAdhocRebuildController.class));
    }

    @Test
    public void migrateAdvice_assignableTypes_keepsMigrateController() {
        RestControllerAdvice anno = InternalEsMigrateExceptionAdvice.class.getAnnotation(RestControllerAdvice.class);
        assertTrue(anno != null);
        assertTrue("migrate advice 托底范围不得回归",
                Arrays.asList(anno.assignableTypes())
                        .contains(io.github.dengmeiluan.esquerystudio.console.web.CrossClusterMigrateController.class));
    }

    @Test
    public void rebuildAdvice_handlers_takeRequestParameter() throws Exception {
        Method illegalState = InternalEsRebuildExceptionAdvice.class.getMethod("illegalState",
                IllegalStateException.class, javax.servlet.http.HttpServletRequest.class);
        Method illegalArg = InternalEsRebuildExceptionAdvice.class.getMethod("illegalArg",
                IllegalArgumentException.class, javax.servlet.http.HttpServletRequest.class);
        assertTrue("illegalState handler 必须带 request 形参（Spring MVC 原生支持，供 endpointOf 组装）",
                illegalState.getParameterCount() == 2);
        assertTrue(illegalArg.getParameterCount() == 2);
    }

    /* ---------------- 锚② endpoint 条件输出 ---------------- */

    @Test
    public void rebuildAdvice_illegalState_withRequest_carriesEndpointAndStageGuardCode() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsRebuildExceptionAdvice().illegalState(
                new IllegalStateException("目标物理索引 orders_v2 已存在，禁止二次重建"),
                stubRequest("POST", "/internal/es/index/adhoc-rebuild/start"));
        assertEquals(409, resp.getStatusCodeValue());
        assertEquals("STAGE_GUARD", resp.getBody().get("code"));
        assertEquals("POST /internal/es/index/adhoc-rebuild/start", resp.getBody().get("endpoint"));
        assertTrue(String.valueOf(resp.getBody().get("message")).contains("orders_v2"));
    }

    @Test
    public void rebuildAdvice_illegalArg_withRequest_carriesEndpointAndBadRequest() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsRebuildExceptionAdvice().illegalArg(
                new IllegalArgumentException("别名无法确定 write 索引"),
                stubRequest("POST", "/internal/es/index/adhoc-rebuild/start"));
        assertEquals(400, resp.getStatusCodeValue());
        assertEquals("BAD_REQUEST", resp.getBody().get("code"));
        assertEquals("POST /internal/es/index/adhoc-rebuild/start", resp.getBody().get("endpoint"));
    }

    @Test
    public void migrateAdvice_illegalState_withRequest_carriesEndpoint() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsMigrateExceptionAdvice().illegalState(
                new IllegalStateException("目标索引 orders 已存在"),
                stubRequest("POST", "/internal/es/xmigrate/create"));
        assertEquals(409, resp.getStatusCodeValue());
        assertEquals("DEST_INDEX", resp.getBody().get("code"));
        assertEquals("POST /internal/es/xmigrate/create", resp.getBody().get("endpoint"));
    }

    @Test
    public void insightController_badRequest_withRequest_carriesEndpoint() {
        io.github.dengmeiluan.esquerystudio.console.insight.InsightController controller =
                new io.github.dengmeiluan.esquerystudio.console.insight.InsightController(null, null);
        ResponseEntity<Map<String, Object>> resp = controller.badRequest(
                new IllegalArgumentException("未知动作"), stubRequest("POST", "/internal/es/index/insight/settings-impact"));
        assertEquals(400, resp.getStatusCodeValue());
        assertEquals("INSIGHT_BAD_REQUEST", resp.getBody().get("code"));
        assertEquals("POST /internal/es/index/insight/settings-impact", resp.getBody().get("endpoint"));
    }

    /* ---------------- 锚③ 旧形状兼容 ---------------- */

    @Test
    public void rebuildAdvice_nullRequest_omitsEndpoint_keepsLegacyShape() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsRebuildExceptionAdvice()
                .illegalArg(new IllegalArgumentException("jobId 不能为空"), null);
        assertEquals(400, resp.getStatusCodeValue());
        assertTrue("无 request 时宁缺勿炸：不含 endpoint 键（旧形状 {code,message} 逐字节不变）",
                !resp.getBody().containsKey("endpoint"));
        assertEquals("BAD_REQUEST", resp.getBody().get("code"));
        assertEquals("jobId 不能为空", resp.getBody().get("message"));
        assertEquals("旧口径仅 code+message 两键", 2, resp.getBody().size());
    }

    @Test
    public void migrateAdvice_nullRequest_omitsEndpoint_keepsLegacyShape() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsMigrateExceptionAdvice()
                .illegalState(new IllegalStateException("作业仍在运行"), null);
        assertEquals(409, resp.getStatusCodeValue());
        assertEquals("JOB_STATE", resp.getBody().get("code"));
        assertTrue(!resp.getBody().containsKey("endpoint"));
        assertEquals(2, resp.getBody().size());
    }

    @Test
    public void controllerLocalHandler_delegation_keepsCodeMapping() {
        /* InternalEsIndexRebuildController 本地 handler 委派旧口径入口（无 request）：
           code 分流语义不得因签名扩展而变化 */
        InternalEsRebuildExceptionAdvice advice = new InternalEsRebuildExceptionAdvice();
        ResponseEntity<Map<String, Object>> lock = advice.illegalState(
                new IllegalStateException("orders 正被 owner=node-1 重建中"));
        assertEquals("LOCK_CONFLICT", lock.getBody().get("code"));
        assertTrue(!lock.getBody().containsKey("endpoint"));

        ResponseEntity<Map<String, Object>> setup = advice.setupRequired(
                new io.github.dengmeiluan.esquerystudio.console.control.SetupRequiredException(), null);
        assertEquals(409, setup.getStatusCodeValue());
        assertEquals("SETUP_REQUIRED", setup.getBody().get("code"));
        assertTrue(!setup.getBody().containsKey("endpoint"));
    }

    @Test
    public void rebuildAdvice_setupRequired_withRequest_carriesEndpoint() {
        ResponseEntity<Map<String, Object>> resp = new InternalEsRebuildExceptionAdvice().setupRequired(
                new io.github.dengmeiluan.esquerystudio.console.control.SetupRequiredException(),
                stubRequest("GET", "/internal/es/index/keys"));
        assertEquals("SETUP_REQUIRED", resp.getBody().get("code"));
        assertEquals("GET /internal/es/index/keys", resp.getBody().get("endpoint"));
    }

    /* ---------------- request 桩 ---------------- */

    private static javax.servlet.http.HttpServletRequest stubRequest(final String method, final String uri) {
        InvocationHandler h = new InvocationHandler() {
            @Override
            public Object invoke(Object proxy, Method m, Object[] args) {
                String name = m.getName();
                if ("getMethod".equals(name)) {
                    return method;
                }
                if ("getRequestURI".equals(name)) {
                    return uri;
                }
                throw new UnsupportedOperationException(name);
            }
        };
        return (javax.servlet.http.HttpServletRequest) Proxy.newProxyInstance(
                EsRebuildAdviceEndpointTest.class.getClassLoader(),
                new Class<?>[]{javax.servlet.http.HttpServletRequest.class}, h);
    }
}
