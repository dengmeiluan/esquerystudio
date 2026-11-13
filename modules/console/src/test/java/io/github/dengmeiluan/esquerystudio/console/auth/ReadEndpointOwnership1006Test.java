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

import org.junit.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.assertTrue;

/**
 * 批次 1006：**读侧**端点归属完整性（与 976 的写侧扫描对等）。
 *
 * <p>976 只保证「每个写端点都有页面/共享归属」；读侧一直没人守。而读侧的失败模式更隐蔽：
 * 连接模型下 {@code pageOf=null} 且未登记 {@code SHARED_READ_PAGES} 的读端点会跳过页面门，
 * 直接落到角色门（VIEWER 即可）——只要持<b>任意一页</b>授权就能读。新增一个诊断/统计类 GET
 * 时忘了登记，就等于给所有页面持有人开了新数据面。</p>
 *
 * <p>本测试用同一套反射扫描：每个 GET 端点必须满足其一——① 归属某个页面（契约 apiPrefixes）；
 * ② 登记在 {@code SHARED_READ_PAGES}（跨页复用读）；③ 落在
 * {@code ConsoleEndpointCoverageAuditor.INTENTIONAL_SHARED}（自举/系统管理/全局选择器基线读，
 * 运行时审计器同样认这张表——读它的私有常量，保证单源）。</p>
 */
public class ReadEndpointOwnership1006Test {

    @SuppressWarnings("unchecked")
    private static List<String> intentionalShared() throws Exception {
        Field f = ConsoleEndpointCoverageAuditor.class.getDeclaredField("INTENTIONAL_SHARED");
        f.setAccessible(true);
        return (List<String>) f.get(null);
    }

    private static boolean intentional(String path, List<String> list) {
        for (String one : list) {
            if (one.endsWith("/")) {
                if (path.startsWith(one)) return true;
            } else if (path.equals(one) || path.startsWith(one + "/")) {
                return true;
            }
        }
        return false;
    }

    /** 读语义端点 = GET + 只读 POST（后端 isReadonlyPost 与 GET 同权，同样跳过角色门）。 */
    private static List<String> readPaths(Method m) {
        List<String> out = new ArrayList<>();
        GetMapping get = m.getAnnotation(GetMapping.class);
        if (get == null) {
            /* 只读 POST（DSL/SQL/analyze/预估等）按读端点同权：归属检查必须同口径，
               否则新增一个只读 POST 未登记共享读时，任意页面持有人都能直调。 */
            for (Object ann : new Object[]{m.getAnnotation(PostMapping.class),
                    m.getAnnotation(PutMapping.class), m.getAnnotation(DeleteMapping.class)}) {
                if (ann == null) continue;
                try {
                    Method value = ann.getClass().getMethod("value");
                    Object v = value.invoke(ann);
                    List<String> cand = new ArrayList<>();
                    if (v instanceof String[]) Collections.addAll(cand, (String[]) v);
                    Method pathM = ann.getClass().getMethod("path");
                    Object pp = pathM.invoke(ann);
                    if (pp instanceof String[]) Collections.addAll(cand, (String[]) pp);
                    for (String one : cand) {
                        /* 注解里的 value 常不带前导斜杠，isReadonlyPost 的关键词带斜杠——
                           补斜杠再判，否则只读 POST 会被静默漏检（本测试就曾漏）。 */
                        String probe = one.startsWith("/") ? one : "/" + one;
                        if (ConsoleAuthInterceptor.isReadonlyPost(probe)) out.add(one);
                    }
                } catch (Exception ignore) {
                    /* 注解形态变化：由编译期兜底 */
                }
            }
            if (!out.isEmpty()) return out;
        }
        if (get != null) {
            Collections.addAll(out, get.value());
            Collections.addAll(out, get.path());
            return out;
        }
        RequestMapping rm = m.getAnnotation(RequestMapping.class);
        if (rm != null) {
            boolean hasGet = false;
            for (RequestMethod method : rm.method()) {
                if (method == RequestMethod.GET) hasGet = true;
            }
            if (hasGet) {
                Collections.addAll(out, rm.value());
                Collections.addAll(out, rm.path());
            }
        }
        return out;
    }

    private static List<String> mappingPaths(RequestMapping mapping) {
        List<String> out = new ArrayList<>();
        if (mapping == null) return out;
        Collections.addAll(out, mapping.value());
        Collections.addAll(out, mapping.path());
        return out;
    }

    private static String joinPath(String base, String path) {
        String b = base == null ? "" : base.trim();
        String p = path == null ? "" : path.trim();
        String full = ("/" + b + "/" + p).replaceAll("/+", "/");
        if (full.length() > 1 && full.endsWith("/")) full = full.substring(0, full.length() - 1);
        return full;
    }

    @Test
    public void 所有控制器读端点必须有页面或共享读归属或显式白名单() throws Exception {
        ConsolePageCatalog catalog = ConsolePageCatalog.load();
        List<String> intent = intentionalShared();
        Set<String> discovered = new HashSet<>();
        List<String> unowned = new ArrayList<>();
        List<String> unownedGlobalFallback = new ArrayList<>();

        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        for (BeanDefinition bd : scanner.findCandidateComponents("io.github.dengmeiluan.esquerystudio.console")) {
            Class<?> clazz = Class.forName(bd.getBeanClassName(), false,
                    ReadEndpointOwnership1006Test.class.getClassLoader());
            List<String> bases = mappingPaths(clazz.getAnnotation(RequestMapping.class));
            if (bases.isEmpty()) bases = Collections.singletonList("");
            for (Method m : clazz.getDeclaredMethods()) {
                for (String path : readPaths(m)) {
                    for (String base : bases) {
                        String full = joinPath(base, path);
                        if (full.endsWith("/probe")) continue;
                        /* 动态段按占位符归一（归属按前缀裁决，动态 id 本身就是逐请求校验） */
                        full = full.replaceAll("\\{[^}]+\\}", "placeholder");
                        discovered.add(full);
                        boolean owned = catalog.pageOf(full) != null
                                || ConsoleAuthInterceptor.sharedReadPages(full) != null
                                || intentional(full, intent);
                        if (!owned) {
                            unowned.add(full);
                            /* 不是 /auth、/setup、/monitor 这类自举/宿主面却无归属 → 直接回落角色门 */
                            if (full.startsWith("/internal/es/index/")) unownedGlobalFallback.add(full);
                        }
                    }
                }
            }
        }
        assertTrue("扫描器未发现读端点（类路径扫描失效）: " + discovered.size(), discovered.size() >= 55);
        /* 证明只读 POST 也被纳入（否则本测试只覆盖 GET，新增只读 POST 会漏检） */
        assertTrue("只读 POST 未被扫描（isReadonlyPost 分支失效）",
                discovered.contains("/internal/es/index/cluster/query"));
        assertTrue("读端点未登记页面/共享读/白名单（会跳过页面门回落角色门，任意页面持有人可读）: "
                + unowned, unowned.isEmpty());
        assertTrue("控制台读端点不得依赖角色门兜底: " + unownedGlobalFallback,
                unownedGlobalFallback.isEmpty());
    }
}
