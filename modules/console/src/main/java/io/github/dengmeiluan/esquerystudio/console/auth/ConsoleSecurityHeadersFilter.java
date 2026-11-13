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

package io.github.dengmeiluan.esquerystudio.console.auth;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * 控制台 API 的基础安全响应头。
 *
 * <ul>
 *   <li>{@code X-Content-Type-Options: nosniff}——全量 API 响应，JSON 嗅探面收口；</li>
 *   <li>{@code Cache-Control: no-store}——auth 域响应（登录体内含 token、me 含身份档案），
 *       防共享缓存/浏览器磁盘缓存留存会话材料；</li>
 *   <li>{@code Content-Security-Policy: frame-ancestors ...}——仅显式配置时下发：
 *       宿主 iframe 嵌入是声明特性，默认不限制可嵌域，限制反而截断合法部署。</li>
 * </ul>
 *
 * @author aicoding
 */
public class ConsoleSecurityHeadersFilter implements Filter {

    private final String frameAncestors;

    public ConsoleSecurityHeadersFilter(String frameAncestors) {
        this.frameAncestors = frameAncestors;
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse resp, FilterChain chain)
            throws IOException, ServletException {
        if (req instanceof HttpServletRequest && resp instanceof HttpServletResponse) {
            HttpServletResponse r = (HttpServletResponse) resp;
            r.setHeader("X-Content-Type-Options", "nosniff");
            r.setHeader("Referrer-Policy", "no-referrer");
            String uri = ((HttpServletRequest) req).getRequestURI();
            if (uri.contains("/auth/")) {
                r.setHeader("Cache-Control", "no-store");
            }
            if (frameAncestors != null && !frameAncestors.trim().isEmpty()) {
                r.setHeader("Content-Security-Policy", "frame-ancestors " + frameAncestors.trim());
            }
        }
        chain.doFilter(req, resp);
    }
}
