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

import org.junit.Test;

import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.ModelAndView;

import javax.servlet.ServletOutputStream;
import javax.servlet.WriteListener;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 1048：控制台方法/媒体类型不匹配不得返回 200/500。
 */
public class InternalEsMethodNotAllowedResolverTest {

    private final InternalEsMethodNotAllowedResolver resolver = new InternalEsMethodNotAllowedResolver();

    private static HttpServletRequest request(String uri) {
        return (HttpServletRequest) Proxy.newProxyInstance(
                InternalEsMethodNotAllowedResolverTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (p, m, a) -> {
                    switch (m.getName()) {
                        case "getRequestURI": return uri;
                        case "getContextPath": return "";
                        default: throw new UnsupportedOperationException(m.getName());
                    }
                });
    }

    private static final class Resp {
        int status = 200;
        final Map<String, String> headers = new HashMap<>();
        final ByteArrayOutputStream body = new ByteArrayOutputStream();
        final HttpServletResponse proxy;

        Resp() {
            proxy = (HttpServletResponse) Proxy.newProxyInstance(
                    InternalEsMethodNotAllowedResolverTest.class.getClassLoader(),
                    new Class<?>[]{HttpServletResponse.class},
                    (p, m, a) -> {
                        switch (m.getName()) {
                            case "setStatus": status = (Integer) a[0]; return null;
                            case "setContentType": return null;
                            case "setHeader": headers.put(String.valueOf(a[0]), String.valueOf(a[1])); return null;
                            case "getOutputStream": return new ServletOutputStream() {
                                @Override public void write(int b) { body.write(b); }
                                @Override public boolean isReady() { return true; }
                                @Override public void setWriteListener(WriteListener l) { }
                            };
                            default: throw new UnsupportedOperationException(m.getName());
                        }
                    });
        }

        String text() { return new String(body.toByteArray(), StandardCharsets.UTF_8); }
    }

    @Test
    public void 控制台方法不匹配_405并带Allow() {
        Resp resp = new Resp();
        ModelAndView mv = resolver.resolveException(request("/internal/es/index/cluster/ilm/policy"),
                resp.proxy, null, new HttpRequestMethodNotSupportedException(
                        "POST", Arrays.asList("PUT", "DELETE")));
        assertNotNull("控制台端点必须由本解析器收口", mv);
        assertEquals(405, resp.status);
        assertTrue(resp.headers.get("Allow").contains("PUT"));
        assertTrue(resp.headers.get("Allow").contains("DELETE"));
        assertTrue(resp.text().contains("METHOD_NOT_ALLOWED"));
        assertTrue(resp.text().contains("不允许") || resp.text().contains("不支持"));
    }

    @Test
    public void 非控制台路径不拦截_交还宿主() {
        Resp resp = new Resp();
        ModelAndView mv = resolver.resolveException(request("/api/other"),
                resp.proxy, null, new HttpRequestMethodNotSupportedException("POST"));
        assertNull("宿主端点语义不得被 starter 改变", mv);
    }

    @Test
    public void 控制台媒体类型错误_415() {
        Resp resp = new Resp();
        ModelAndView mv = resolver.resolveException(request("/internal/es/index/cluster/doc"),
                resp.proxy, null, new HttpMediaTypeNotSupportedException("text/plain"));
        assertNotNull(mv);
        assertEquals(415, resp.status);
        assertTrue(resp.text().contains("UNSUPPORTED_MEDIA_TYPE"));
    }
}
