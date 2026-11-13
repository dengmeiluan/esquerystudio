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
import io.github.dengmeiluan.esquerystudio.platform.pages.ConsolePageCatalog;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 自定义 {@link EsConsoleAuthorizer} 部署的 /auth/me 兜底端点。
 *
 * <p>宿主用自己的授权器替换内置账号服务时，{@link ConsoleAuthController} 不装配，
 * 前端探测 /auth/me 会 404；此前只能靠 setup/status.authEnabled=false 判成「无鉴权」，
 * 导致菜单/按钮全开而后端仍按自定义授权器 403（体验与执法分叉）。本端点只回显拦截器
 * 已认证的 principal（角色/页面授权/契约/env 模板），不引入新的登录通道。</p>
 */
@RestController
@RequestMapping("internal/es/index/auth")
public class ConsoleMeFallbackController {

    private final Map<String, Object> pagesPayload;
    private final boolean pageAuthEnabled;
    private final EnvPagesResolver envPagesResolver;

    public ConsoleMeFallbackController(ConsolePageCatalog pageCatalog, boolean pageAuthEnabled,
                                       EnvPagesResolver envPagesResolver) {
        this.pagesPayload = ConsoleAuthController.buildPagesPayload(pageCatalog);
        this.pageAuthEnabled = pageAuthEnabled;
        this.envPagesResolver = envPagesResolver;
    }

    @GetMapping("me")
    public ResponseEntity<Map<String, Object>> me(HttpServletRequest request) {
        Object attr = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (!(attr instanceof ConsolePrincipal)) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("code", "UNAUTHORIZED");
            err.put("message", "请先登录 ES 控制台");
            return ResponseEntity.status(401).body(err);
        }
        ConsolePrincipal p = (ConsolePrincipal) attr;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("username", p.getUsername());
        out.put("role", p.getRole().name());
        out.put("fallback", p.isFallback());
        out.put("delegated", p.isDelegated());
        out.put("displayName", p.getDisplayName());
        out.put("authSource", p.isDelegated() ? "delegate" : "custom");
        Set<String> gp = pageAuthEnabled && p.getGrantedPages() != null ? p.getGrantedPages() : null;
        out.put("grantedPages", gp == null ? null : new ArrayList<>(new TreeSet<>(gp)));
        out.put("pages", pagesPayload);
        if (gp != null && envPagesResolver != null) {
            Map<String, Set<String>> templates = envPagesResolver.configuredTemplates();
            if (!templates.isEmpty()) {
                Map<String, Object> payload = new LinkedHashMap<>();
                for (Map.Entry<String, Set<String>> e : templates.entrySet()) {
                    payload.put(e.getKey(), new ArrayList<>(new TreeSet<>(e.getValue())));
                }
                out.put("envPages", payload);
            }
        }
        if (!p.getAttributes().isEmpty()) {
            out.put("attributes", p.getAttributes());
        }
        return ResponseEntity.ok(out);
    }
}
