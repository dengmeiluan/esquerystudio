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

import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.stream.Collectors;

/**
 * 控制台端点的「方法/媒体类型不匹配」语义（1048）。
 *
 * <p>Spring MVC 在找不到匹配 handler 时不会执行拦截器，宿主的全局错误包装会把
 * {@link HttpRequestMethodNotSupportedException} 包成 HTTP 200 + {@code code:500}
 * （前端误判为服务端故障，且掩盖了「方法用错」这一确定性原因）。这里在异常解析链
 * 最前面把它还原为 405 + {@code Allow}，媒体类型错误还原为 415；只作用于
 * {@code /internal/es/**}，不影响宿主其它端点。</p>
 *
 * <p>安全语义不变：没有 handler 意味着没有任何业务动作执行；写请求仍由拦截器在
 * 匹配到 handler 时逐端点裁决。</p>
 */
public class InternalEsMethodNotAllowedResolver implements HandlerExceptionResolver, Ordered {

    private static final String CONSOLE_PATH = "/internal/es/";

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    @Override
    public ModelAndView resolveException(HttpServletRequest request, HttpServletResponse response,
                                         Object handler, Exception ex) {
        String path = request == null ? null : request.getRequestURI();
        String ctx = request == null ? null : request.getContextPath();
        String normalized = path == null ? "" : path;
        if (ctx != null && !ctx.isEmpty() && normalized.startsWith(ctx)) {
            normalized = normalized.substring(ctx.length());
        }
        if (!normalized.contains(CONSOLE_PATH)) {
            return null;
        }
        if (ex instanceof HttpRequestMethodNotSupportedException) {
            HttpRequestMethodNotSupportedException e = (HttpRequestMethodNotSupportedException) ex;
            String[] methods = e.getSupportedMethods();
            Collection<String> supported = methods == null
                    ? java.util.Collections.emptyList()
                    : java.util.Arrays.stream(methods).sorted().collect(Collectors.toList());
            if (!supported.isEmpty()) {
                response.setHeader(HttpHeaders.ALLOW, String.join(", ", supported));
            }
            String allow = supported.isEmpty() ? "" : "；允许: " + String.join("/", supported);
            write(response, HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED",
                    "该端点不支持 " + e.getMethod() + " 方法" + allow);
            return new ModelAndView();
        }
        if (ex instanceof HttpMediaTypeNotSupportedException) {
            HttpMediaTypeNotSupportedException e = (HttpMediaTypeNotSupportedException) ex;
            write(response, HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE",
                    "不支持的 Content-Type：" + (e.getContentType() == null ? "（缺失）" : e.getContentType()));
            return new ModelAndView();
        }
        return null;
    }

    private static void write(HttpServletResponse response, HttpStatus status, String code, String message) {
        try {
            response.setStatus(status.value());
            response.setContentType("application/json;charset=UTF-8");
            String body = "{\"code\":\"" + code + "\",\"message\":\"" + jsonEscape(message) + "\"}";
            response.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignore) {
            /* 写响应失败不改判定：解析器返回 ModelAndView 后容器仍按已设状态码收口 */
        }
    }

    private static String jsonEscape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ");
    }
}
