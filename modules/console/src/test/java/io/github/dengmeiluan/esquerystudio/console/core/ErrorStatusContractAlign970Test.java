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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.platform.pages.ConsolePageCatalog;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePermissionsController;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController;
import io.github.dengmeiluan.esquerystudio.console.web.InternalEsRebuildExceptionAdvice;
import org.junit.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.method.annotation.ExceptionHandlerMethodResolver;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 错误面契约对齐：控制面守卫拒绝的 HTTP 语义升格 + 权限面兜底臂状态码。
 *
 * <p>守卫拒绝（控制索引不可触达/通配可能命中控制面/路径穿越/请求体引用控制索引/非管理员
 * 恢复全部）此前以 {@link IllegalArgumentException} 抛出，被业务 advice 映射为 400
 * BAD_REQUEST——但它们不是入参畸形而是保护策略拒绝，与 {@code ConsoleAuthInterceptor}
 * 的权限拒绝（403 {@code {code:"FORBIDDEN"}}）同族。契约：守卫方法抛
 * {@link ControlPlaneGuardException}（保持 IAE 兼容链），Rebuild advice 与控制器本地
 * handler 链（本地 handler 优先于 advice，缺专用臂则恒落 IAE 臂被映射 400）均把它升格为
 * 403；结构校验类 IAE（body 为空/DSL 非 JSON/index_patterns 形态错误）不换型维持 400。</p>
 *
 * <p>权限面「我的权限」端点在拦截器被旁路的部署形态下的兜底臂此前回 HTTP 200 包体带
 * UNAUTHORIZED 码——与拦截器未认证拒绝（401 {@code {code:"UNAUTHORIZED"}}）不一致，且
 * 前端 401 登录遮罩广播不触发；契约=兜底臂回 401 同形错误体、正常臂回 200 信封。</p>
 *
 * <p>handler 解析断言走 {@link ExceptionHandlerMethodResolver}（Spring MVC 选 handler 的
 * 真实最具体匹配算法，无需起容器）；request 桩为 JDK 动态代理（仓内无 mockito，
 * EsRebuildAdviceEndpointTest 同范式）。</p>
 */
public class ErrorStatusContractAlign970Test {

    private static final HttpServletRequest POST_REQ =
            stubRequest("POST", "/internal/es/index/cluster/search");

    /* ---------------- 守卫拒绝换型 ---------------- */

    @Test
    public void guardIndexName_throwsControlPlaneGuardException_forControlIndex() {
        EsIndexAdmin admin = new EsIndexAdmin(null);
        try {
            admin.guardIndexName("esquerystudio_user");
            fail("控制面索引应被守卫拒绝");
        } catch (ControlPlaneGuardException expected) {
            assertTrue(expected.getMessage().contains("esquerystudio_user"));
        }
    }

    @Test
    public void guardControlPath_throwsControlPlaneGuardException_forDoubleSlashControlPath() {
        EsIndexAdmin admin = new EsIndexAdmin(null);
        try {
            admin.guardControlPath("//esquerystudio_user/_search");
            fail("双斜杠穿透控制路径应被守卫拒绝");
        } catch (ControlPlaneGuardException expected) {
            // 拒绝文案由既有守卫锁面覆盖，此处只锁异常型别
        }
    }

    @Test
    public void guardControlBody_throwsControlPlaneGuardException_forControlIndexInBody() {
        EsIndexAdmin admin = new EsIndexAdmin(null);
        try {
            admin.guardControlBody("{\"dest\":{\"index\":\"esquerystudio_user\"}}");
            fail("请求体引用控制面索引应被守卫拒绝");
        } catch (ControlPlaneGuardException expected) {
            // 拒绝文案由既有守卫锁面覆盖，此处只锁异常型别
        }
    }

    /* ---------------- advice/控制器两级 403 映射 ---------------- */

    @Test
    public void rebuildAdvice_resolvesGuardDenial_toDedicatedForbiddenHandler() throws Exception {
        ExceptionHandlerMethodResolver resolver =
                new ExceptionHandlerMethodResolver(InternalEsRebuildExceptionAdvice.class);
        ControlPlaneGuardException e = new ControlPlaneGuardException("控制面索引不对通用数据接口开放：esquerystudio_user");
        Method m = resolver.resolveMethod(e);
        assertEquals("advice 必须以专用 handler（而非 IAE 通用臂）接住守卫拒绝", "controlPlaneGuard", m.getName());
        @SuppressWarnings("unchecked")
        ResponseEntity<Map<String, Object>> resp =
                (ResponseEntity<Map<String, Object>>) m.invoke(new InternalEsRebuildExceptionAdvice(), e, POST_REQ);
        assertEquals(403, resp.getStatusCodeValue());
        assertEquals("FORBIDDEN", resp.getBody().get("code"));
        assertEquals("守卫拒绝错误体保留原文与 endpoint 上下文", "POST /internal/es/index/cluster/search",
                resp.getBody().get("endpoint"));
        assertEquals("控制面索引不对通用数据接口开放：esquerystudio_user", resp.getBody().get("message"));
    }

    @Test
    public void rebuildController_localHandlerChain_resolvesGuardDenial_beforeIllegalArg() {
        ExceptionHandlerMethodResolver resolver =
                new ExceptionHandlerMethodResolver(InternalEsIndexRebuildController.class);
        Method m = resolver.resolveMethod(
                new ControlPlaneGuardException("控制面索引不对通用数据接口开放：esquerystudio_user"));
        assertEquals("控制器本地 handler 优先于 advice：守卫拒绝必须由专用本地 handler 接住委派 advice，"
                + "否则恒落本地 IAE 臂被映射 400", "handleControlPlaneGuard", m.getName());
    }

    /* ---------------- 权限面兜底臂 401 ---------------- */

    @Test
    public void permissions_fallbackArm_returns401UnauthorizedShape() {
        Object resp = ctrl().permissions(stubAuthRequest(null), null);
        assertTrue("拦截器被旁路的兜底臂必须回 ResponseEntity（401），而非 200 包体带错误码",
                resp instanceof ResponseEntity);
        ResponseEntity<?> r = (ResponseEntity<?>) resp;
        assertEquals(401, r.getStatusCodeValue());
        assertEquals("UNAUTHORIZED", ((Map<?, ?>) r.getBody()).get("code"));
        assertEquals("请先登录 ES 控制台", ((Map<?, ?>) r.getBody()).get("message"));
    }

    /* ---------------- 守恒锚：不换型面与正常路径 ---------------- */

    @Test
    public void rebuildAdvice_plainIllegalArgument_staysBadRequest() throws Exception {
        ExceptionHandlerMethodResolver resolver =
                new ExceptionHandlerMethodResolver(InternalEsRebuildExceptionAdvice.class);
        assertEquals("结构校验类 IAE 不换型：仍走 400 通用臂", "illegalArg",
                resolver.resolveMethod(new IllegalArgumentException("jobId 不能为空")).getName());
        ResponseEntity<Map<String, Object>> resp = new InternalEsRebuildExceptionAdvice()
                .illegalArg(new IllegalArgumentException("jobId 不能为空"), POST_REQ);
        assertEquals(400, resp.getStatusCodeValue());
        assertEquals("BAD_REQUEST", resp.getBody().get("code"));
    }

    @Test
    public void permissions_withPrincipal_staysOkEnvelope() {
        ResponseEntity<?> r = (ResponseEntity<?>) ctrl().permissions(
                stubAuthRequest(new ConsolePrincipal("local-u1", ConsoleRole.VIEWER, false)), null);
        assertEquals(200, r.getStatusCodeValue());
        assertTrue(((Map<?, ?>) r.getBody()).containsKey("role"));
    }

    /* ---------------- 桩设施（ConsolePermissionsEndpoint888Test / EsRebuildAdviceEndpointTest 同范式） ---------------- */

    private static ConsolePermissionsController ctrl() {
        ConnStore store = emptyConnStore();
        return new ConsolePermissionsController(ConsolePageCatalog.load(),
                new EnvPagesResolver(store, new ESQueryStudioElasticsearchProperties()), store, true);
    }

    private static ConnStore emptyConnStore() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return null; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static HttpServletRequest stubAuthRequest(ConsolePrincipal principal) {
        Map<String, Object> attrs = new HashMap<>();
        if (principal != null) {
            attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        }
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getAttribute": return attrs.get(args[0]);
                case "getMethod": return "GET";
                case "getRequestURI": return "/internal/es/index/auth/permissions";
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ErrorStatusContractAlign970Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static HttpServletRequest stubRequest(String method, String uri) {
        InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getMethod": return method;
                case "getRequestURI": return uri;
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                ErrorStatusContractAlign970Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }
}
