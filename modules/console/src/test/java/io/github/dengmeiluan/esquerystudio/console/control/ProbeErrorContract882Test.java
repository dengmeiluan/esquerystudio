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

package io.github.dengmeiluan.esquerystudio.console.control;

import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClusterConnController;
import org.junit.After;
import org.junit.Test;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * /setup/test 与 /clusters/test 的 URL 解析失败臂错误体契约。
 *
 * <p>解析失败（坏 URL/空连接串/连接不存在）在两个方法内被本地 catch（HTTP 200 体
 * {@code {ok:false, message}}），不走 advice——而同方法外层探测臂与 advice 路径
 * （对 IAE 恒产出 {@code {code:"BAD_REQUEST", message, endpoint}}）均已带结构化
 * code。本契约锁：解析臂错误体与它们同轨——{@code code=BAD_REQUEST}（同 advice
 * 对 IAE 的口径）+ {@code endpoint} 失败端点键（带 web 上下文时输出，无上下文宁缺
 * 勿炸）；{@code ok}/{@code message} 既有键保留、HTTP 200 形态不变。</p>
 */
public class ProbeErrorContract882Test {

    @After
    public void clearRequestContext() {
        RequestContextHolder.resetRequestAttributes();
    }

    /** setup 侧：端口非法的坏 URL → 200 体带 code=BAD_REQUEST，ok/message 既有键保留。 */
    @Test
    public void setupTestBadUrlCarriesBadRequestCode() {
        ConsoleSetupController c = new ConsoleSetupController(
                new ControlClusterResolver(null, null, null, null, null, "auto"),
                null, null, null, "test-app", false);
        Map<String, Object> r = c.test(body("http://127.0.0.1:abc")).getBody();
        assertNotNull(r);
        assertEquals(Boolean.FALSE, r.get("ok"));
        assertEquals("解析失败臂错误体必须带 code=BAD_REQUEST（与 advice 对 IAE 同码）",
                "BAD_REQUEST", r.get("code"));
        assertNotNull("message 既有键保留且可读", r.get("message"));
    }

    /** clusters 侧：端口非法的坏 URL → 同契约。 */
    @Test
    public void clustersTestBadUrlCarriesBadRequestCode() {
        EsClusterConnController c = new EsClusterConnController(null, null, null, null);
        Map<String, Object> r = c.test(body("http://127.0.0.1:abc"));
        assertEquals(Boolean.FALSE, r.get("ok"));
        assertEquals("解析失败臂错误体必须带 code=BAD_REQUEST（与 advice 对 IAE 同码）",
                "BAD_REQUEST", r.get("code"));
        assertNotNull("message 既有键保留且可读", r.get("message"));
    }

    /** 空白连接串同为解析失败（连接串为空臂）→ 同契约。 */
    @Test
    public void blankUrlCarriesBadRequestCode() {
        EsClusterConnController c = new EsClusterConnController(null, null, null, null);
        Map<String, Object> r = c.test(body("   "));
        assertEquals("BAD_REQUEST", r.get("code"));
        assertEquals(Boolean.FALSE, r.get("ok"));
    }

    /** 带 web 上下文时解析臂错误体带 endpoint 键（method + URI，与外层臂/advice 同口径）。 */
    @Test
    public void parseErrorBodyCarriesEndpointUnderWebContext() {
        final HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(
                getClass().getClassLoader(), new Class<?>[]{HttpServletRequest.class},
                (p, m, a) -> {
                    if ("getRequestURI".equals(m.getName())) return "/internal/es/index/clusters/test";
                    if ("getMethod".equals(m.getName())) return "POST";
                    if ("equals".equals(m.getName())) return p == a[0];
                    if ("hashCode".equals(m.getName())) return System.identityHashCode(p);
                    if ("toString".equals(m.getName())) return "stub-request";
                    return null;
                });
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
        try {
            EsClusterConnController c = new EsClusterConnController(null, null, null, null);
            Map<String, Object> r = c.test(body("http://127.0.0.1:abc"));
            assertEquals("BAD_REQUEST", r.get("code"));
            assertEquals("解析臂 endpoint 键与外层臂同口径（POST + 请求 URI）",
                    "POST /internal/es/index/clusters/test", r.get("endpoint"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    /** 无 web 上下文（直调/非 web 线程）：endpoint 宁缺勿炸不输出该键。 */
    @Test
    public void parseErrorBodyOmitsEndpointWithoutWebContext() {
        assertNull(RequestContextHolder.getRequestAttributes());
        ConsoleSetupController c = new ConsoleSetupController(
                new ControlClusterResolver(null, null, null, null, null, "auto"),
                null, null, null, "test-app", false);
        Map<String, Object> r = c.test(body("http://127.0.0.1:abc")).getBody();
        assertNotNull(r);
        assertTrue("endpoint 键缺席（宁缺勿炸）", !r.containsKey("endpoint"));
        assertEquals("BAD_REQUEST", r.get("code"));
    }

    private static Map<String, String> body(String url) {
        Map<String, String> b = new LinkedHashMap<>();
        b.put("url", url);
        return b;
    }
}
