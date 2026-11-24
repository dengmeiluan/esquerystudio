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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 端点授权覆盖自检（启动期，只告警不阻断）。
 *
 * <p>页面契约 + 共享端点映射是「手写清单」，新增端点忘记登记时：</p>
 * <ul>
 *   <li><b>写端点</b>：连接模型下会被「未登记写默认拒绝」挡住——安全但会出现
 *       「按钮在、点了 403」的假入口（有权限的人被拦）；</li>
 *   <li><b>读端点</b>：pageOf=null 且未登记共享读 → 落到角色门 VIEWER，
 *       任何已认证的只读用户都能读到（真实越权读面）。</li>
 * </ul>
 *
 * <p>启动完成后扫描 {@link RequestMappingHandlerMapping} 的全部映射，把这两类端点
 * 打 WARN 汇总到日志——让「漏登记」在发布当天可见，而不是等安全审计发现。
 * 自举/系统管理域端点（登录、改密、setup、连接档案、用户库、健康探活）是设计上的
 * 共享端点，不参与告警。</p>
 *
 * @author aicoding
 */
public class ConsoleEndpointCoverageAuditor {

    private static final Logger LOG = LoggerFactory.getLogger(ConsoleEndpointCoverageAuditor.class);

    /** 设计上无页面归属的自举/系统管理端点（前缀或精确匹配，段边界由 startsWith 保证足够）。 */
    private static final List<String> INTENTIONAL_SHARED = Arrays.asList(
            "/internal/es/index/auth/login",
            "/internal/es/index/auth/logout",
            "/internal/es/index/auth/me",
            "/internal/es/index/auth/change-password",
            "/internal/es/index/auth/permissions",
            "/internal/es/index/auth/ops-audit",
            "/internal/es/index/auth/audit-facets",
            "/internal/es/index/auth/users",
            "/internal/es/index/setup/",
            "/internal/es/index/clusters",
            "/internal/es/index/cluster/health",
            "/internal/es/index/health",
            "/internal/es/index/keys",
            /* 运行时 UI 配置（品牌/功能包/停用页）：零敏感信息，空页集身份也要能读，
               否则前端无法区分「模块未启用」与「无权限」。 */
            "/internal/es/index/ui/",
            /* 全局索引选择器的基线读（服务端已按 ADMIN 过滤控制面索引名） */
            "/internal/es/index/cluster/indices",
            "/internal/es/xmigrate/jobs",
            "/internal/es/xmigrate/progress",
            "/internal/es/xmigrate/dest-indices",
            /* 护栏动作按 actionId 动态分派，风险由 GuardedActionExecutor 的 minRole + confirmToken
               逐动作裁决（不在契约里枚举 actionId）；已登记的 apply-index-settings 才吃页面写键。 */
            "/internal/es/index/insight/actions");

    private final ConsolePageCatalog catalog;

    public ConsoleEndpointCoverageAuditor(ConsolePageCatalog catalog) {
        this.catalog = catalog;
    }

    @EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public void audit(org.springframework.boot.context.event.ApplicationReadyEvent event) {
        RequestMappingHandlerMapping mapping;
        try {
            mapping = event.getApplicationContext().getBean(
                    "requestMappingHandlerMapping", RequestMappingHandlerMapping.class);
        } catch (Exception e) {
            LOG.debug("[console-auth] 端点覆盖自检跳过（无 RequestMappingHandlerMapping）: {}", e.getMessage());
            return;
        }
        Set<String> unclassifiedWrites = new TreeSet<>();
        Set<String> unclassifiedReads = new TreeSet<>();
        boolean degraded = false;
        for (Map.Entry<RequestMappingInfo, HandlerMethod> entry : mapping.getHandlerMethods().entrySet()) {
            RequestMappingInfo info = entry.getKey();
            Set<String> patterns = extractPatterns(info);
            if (patterns == null) {
                /* 反射失明=本宿主上自检不可用，不能让空结果汇成「覆盖完整」的假保证。 */
                degraded = true;
                continue;
            }
            if (patterns.isEmpty()) continue;
            Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
            for (String pattern : patterns) {
                if (!pattern.startsWith("/internal/es/")) continue;
                if (methods.isEmpty()) {
                    /* 未限定方法的映射按读写两面都检查（宁多报不漏报） */
                    classify(pattern, "GET", unclassifiedWrites, unclassifiedReads);
                    classify(pattern, "POST", unclassifiedWrites, unclassifiedReads);
                } else {
                    for (RequestMethod m : methods) {
                        classify(pattern, m.name(), unclassifiedWrites, unclassifiedReads);
                    }
                }
            }
        }
        if (!unclassifiedWrites.isEmpty()) {
            LOG.warn("[console-auth] 以下写端点没有页面归属，连接模型下会被默认拒绝（新增端点请登记"
                    + "页面契约 apiPrefixes 或 SHARED_WRITE_PAGES）: {}", unclassifiedWrites);
        }
        if (!unclassifiedReads.isEmpty()) {
            LOG.warn("[console-auth] 以下读端点没有页面归属，任意已认证 VIEWER 可读（越权读面，请登记"
                    + "页面契约 apiPrefixes 或 SHARED_READ_PAGES）: {}", unclassifiedReads);
        }
        if (unclassifiedWrites.isEmpty() && unclassifiedReads.isEmpty() && !degraded) {
            LOG.info("[console-auth] 端点授权覆盖自检通过：全部 /internal/es/** 端点均有页面或共享映射归属");
        }
    }

    /**
     * 兼容两种路径匹配策略取映射 pattern：老 AntPathMatcher（{@code getPatternsCondition()}）
     * 与 Spring Boot 2.6+ 默认的 PathPatternParser（{@code getPathPatternsCondition()}，
     * 此时前者恒 null）。后者是 5.3 才有的 API 而本工程编译基线是 5.2，只能反射取——
     * 失败返回 null（区别于空集）标记自检失明，否则会在 2.6+ 宿主上全量跳过
     * 还打出「覆盖完整」的假保证。
     */
    static Set<String> extractPatterns(RequestMappingInfo info) {
        Set<String> patterns = new TreeSet<>();
        if (info.getPatternsCondition() != null) {
            patterns.addAll(info.getPatternsCondition().getPatterns());
            return patterns;
        }
        try {
            Object cond = info.getClass().getMethod("getPathPatternsCondition").invoke(info);
            if (cond == null) return patterns;
            for (Object pp : (Iterable<?>) cond.getClass().getMethod("getPatterns").invoke(cond)) {
                patterns.add((String) pp.getClass().getMethod("getPatternString").invoke(pp));
            }
        } catch (Exception e) {
            LOG.warn("[console-auth] 端点覆盖自检无法读取路径映射——本宿主上自检不可用，"
                    + "请人工核对新增端点已登记页面契约或共享映射", e);
            return null;
        }
        return patterns;
    }

    private void classify(String pattern, String method,
                          Set<String> unclassifiedWrites, Set<String> unclassifiedReads) {
        String path = normalize(pattern);
        if (path == null || isIntentionalShared(path)) return;
        if (catalog.pageOf(path) != null) return;
        boolean write = !"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)
                && !"OPTIONS".equalsIgnoreCase(method)
                && !ConsoleAuthInterceptor.isReadonlyPost(path);
        if (write) {
            if (ConsoleAuthInterceptor.sharedWritePages(path) == null) unclassifiedWrites.add(pattern);
        } else if (ConsoleAuthInterceptor.sharedReadPages(path) == null) {
            unclassifiedReads.add(pattern);
        }
    }

    /** 与授权判定同口径：先剥末段扩展名，再按段边界比对（{@code {id}} 占位符不影响前缀归属）。 */
    private static String normalize(String pattern) {
        if (pattern == null || pattern.isEmpty()) return null;
        String p = pattern.replace("//", "/");
        String stripped = ConsoleAuthInterceptor.stripPathExtension(p);
        return stripped == null ? p : stripped;
    }

    private static boolean isIntentionalShared(String path) {
        for (String prefix : INTENTIONAL_SHARED) {
            /* 条目本身带尾斜杠=前缀条目（如 setup/）：裸 startsWith 匹配——此前统一拼
               prefix+"/" 会造出双斜杠失配，setup 三端点从清单引入起一直被误报噪声。 */
            if (prefix.endsWith("/")) {
                if (path.startsWith(prefix)) return true;
            } else if (path.equals(prefix) || path.startsWith(prefix + "/")) {
                return true;
            }
        }
        return false;
    }
}
