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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import java.lang.reflect.Method;

/**
 * Servlet-neutral request view backed by Spring's {@link org.springframework.web.context.request.RequestAttributes}.
 * The same bytecode runs on Spring 5 (javax.servlet) and Spring 6/7 (jakarta.servlet): the native
 * request/response objects are reached reflectively, so no servlet API is compiled in and no filter
 * registration is needed in host forms.
 */
final class ReflectiveMcpRequestContext implements McpRequestContext {

    /** Same value as {@code HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE} (spring-webmvc, not a dependency here). */
    private static final String BEST_MATCHING_PATTERN =
            "org.springframework.web.servlet.HandlerMapping.bestMatchingPattern";

    private final Object request;
    private final Object response;

    private ReflectiveMcpRequestContext(Object request, Object response) {
        this.request = request;
        this.response = response;
    }

    static McpRequestContext from(Object requestAttributes) {
        if (requestAttributes == null) return null;
        try {
            Object request = call(requestAttributes, "getRequest");
            if (request == null) return null;
            Object response = null;
            try {
                response = call(requestAttributes, "getResponse");
            } catch (Throwable ignored) {
                // request-only contexts (e.g. unit tests) still expose headers/parameters
            }
            return new ReflectiveMcpRequestContext(request, response);
        } catch (Throwable ignored) {
            return null;
        }
    }

    @Override
    public String header(String name) {
        return string(callQuietly(request, "getHeader", name));
    }

    @Override
    public String parameter(String name) {
        return string(callQuietly(request, "getParameter", name));
    }

    @Override
    public String remoteAddr() {
        return string(callQuietly(request, "getRemoteAddr"));
    }

    @Override
    public String method() {
        return string(callQuietly(request, "getMethod"));
    }

    @Override
    public String requestUri() {
        return string(callQuietly(request, "getRequestURI"));
    }

    @Override
    public boolean isResponseCommitted() {
        if (response == null) return true;
        Object committed = callQuietly(response, "isCommitted");
        return !(committed instanceof Boolean) || (Boolean) committed;
    }

    @Override
    public void setResponseHeader(String name, String value) {
        if (response == null || isResponseCommitted()) return;
        callQuietly(response, "setHeader", name, value);
    }

    @Override
    public String matchedPattern() {
        Object pattern = callQuietly(request, "getAttribute", BEST_MATCHING_PATTERN);
        return string(pattern);
    }

    private static Object call(Object target, String method) {
        return call(target, method, new Object[0]);
    }

    private static Object callQuietly(Object target, String method, Object... args) {
        try {
            return call(target, method, args);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static Object call(Object target, String method, Object... args) {
        if (target == null) return null;
        Method found = null;
        for (Method candidate : target.getClass().getMethods()) {
            if (candidate.getName().equals(method) && candidate.getParameterCount() == args.length) {
                found = candidate;
                break;
            }
        }
        if (found == null) return null;
        try {
            return found.invoke(target, args);
        } catch (Exception e) {
            return null;
        }
    }

    private static String string(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
