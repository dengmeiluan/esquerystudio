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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertTrue;

/**
 * 权限矩阵完整性锚：每个共享写/读端点引用的页面 key 必须在契约里真实存在；
 * 面板登记的每个写端点必须有归属页、共享写映射，或明确属于系统管理域。
 * 新增写端点忘了登记页面时，本测试直接失败（而不是默默回落角色门）。
 */
public class PermissionMatrixParity976Test {

    private static final Set<String> SYSTEM_ADMIN_WRITE_PATHS = new HashSet<>(Arrays.asList(
            "/internal/es/index/setup/rebind",
            "/internal/es/index/clusters/save",
            "/internal/es/index/clusters/delete",
            "/internal/es/index/clusters/test",
            "/internal/es/index/clusters/sync/run"));

    @SuppressWarnings("unchecked")
    private static Map<String, List<String>> sharedWritePages() throws Exception {
        Field f = ConsoleAuthInterceptor.class.getDeclaredField("SHARED_WRITE_PAGES");
        f.setAccessible(true);
        return (Map<String, List<String>>) f.get(null);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, List<String>> sharedReadPages() throws Exception {
        Field f = ConsoleAuthInterceptor.class.getDeclaredField("SHARED_READ_PAGES");
        f.setAccessible(true);
        return (Map<String, List<String>>) f.get(null);
    }

    @SuppressWarnings("unchecked")
    private static List<String> writeEndpointPaths() throws Exception {
        Field f = ConsolePermissionsController.class.getDeclaredField("WRITE_ENDPOINT_PATHS");
        f.setAccessible(true);
        return (List<String>) f.get(null);
    }

    private static Set<String> pageKeys(ConsolePageCatalog catalog) {
        Set<String> keys = new HashSet<>();
        for (ConsolePageCatalog.Page p : catalog.getPages()) keys.add(p.getKey());
        return keys;
    }

    @Test
    public void 共享写读映射引用的页面key必须存在于契约() throws Exception {
        ConsolePageCatalog catalog = ConsolePageCatalog.load();
        Set<String> keys = pageKeys(catalog);
        for (Map.Entry<String, List<String>> e : sharedWritePages().entrySet()) {
            for (String page : e.getValue()) {
                assertTrue("共享写端点 " + e.getKey() + " 引用未知页面 " + page, keys.contains(page));
            }
        }
        for (Map.Entry<String, List<String>> e : sharedReadPages().entrySet()) {
            for (String page : e.getValue()) {
                assertTrue("共享读端点 " + e.getKey() + " 引用未知页面 " + page, keys.contains(page));
            }
        }
    }

    @Test
    public void 面板写端点必须有页面或共享归属或系统管理白名单() throws Exception {
        ConsolePageCatalog catalog = ConsolePageCatalog.load();
        for (String path : writeEndpointPaths()) {
            if (SYSTEM_ADMIN_WRITE_PATHS.contains(path)) continue;
            boolean owned = catalog.pageOf(path) != null
                    || ConsoleAuthInterceptor.sharedWritePages(path) != null;
            assertTrue("写端点未登记页面/共享归属: " + path, owned);
        }
    }

    @Test
    public void 建索引与DevTools端点保持共享授权() throws Exception {
        Map<String, List<String>> shared = sharedWritePages();
        assertTrue(shared.get("/cluster/create-index").containsAll(Arrays.asList("config-validator", "indices")));
        assertTrue(shared.get("/cluster/devtools/execute").containsAll(Arrays.asList("rest", "devtools")));
        assertTrue("devtools 页必须在契约中",
                pageKeys(ConsolePageCatalog.load()).contains("devtools"));
    }

    /**
     * 代码级兜底：扫描所有 @RestController 的写映射，逐个要求登记到权限面板（或自助白名单）。
     * 新增写接口忘记登记页面归属时，本测试直接失败，而不是默默回落角色门。
     */
    @Test
    public void 所有控制器写端点必须登记权限面板或自助白名单() throws Exception {
        Set<String> registered = new HashSet<>(writeEndpointPaths());
        Set<String> selfService = new HashSet<>(Arrays.asList(
                "/internal/es/index/auth/login",
                "/internal/es/index/auth/change-password",
                "/internal/es/index/auth/logout",
                "/internal/es/index/setup/test",
                "/internal/es/index/setup/apply"));
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        List<String> missing = new ArrayList<>();
        Set<String> discovered = new HashSet<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("io.github.dengmeiluan.esquerystudio.console")) {
            Class<?> clazz = Class.forName(bd.getBeanClassName(), false,
                    PermissionMatrixParity976Test.class.getClassLoader());
            List<String> bases = mappingPaths(clazz.getAnnotation(RequestMapping.class));
            if (bases.isEmpty()) bases = Collections.singletonList("");
            for (Method m : clazz.getDeclaredMethods()) {
                for (String path : writePaths(m)) {
                    for (String base : bases) {
                        String full = joinPath(base, path);
                        if (full.contains("{") || full.endsWith("/probe")) continue;
                        if (ConsoleAuthInterceptor.isReadonlyPost(full)) continue;
                        discovered.add(full);
                        if (!registered.contains(full) && !selfService.contains(full)) missing.add(full);
                    }
                }
            }
        }
        assertTrue("扫描器未发现写端点（类路径扫描失效，守卫将形同虚设）", discovered.size() > 20);
        assertTrue("写端点未登记权限面板/自助白名单: " + missing, missing.isEmpty());
    }

    private static List<String> writePaths(Method m) {
        List<String> out = new ArrayList<>();
        for (Object ann : new Object[]{m.getAnnotation(PostMapping.class), m.getAnnotation(PutMapping.class),
                m.getAnnotation(DeleteMapping.class), m.getAnnotation(PatchMapping.class)}) {
            if (ann == null) continue;
            try {
                Method value = ann.getClass().getMethod("value");
                Object v = value.invoke(ann);
                if (v instanceof String[]) Collections.addAll(out, (String[]) v);
                Method path = ann.getClass().getMethod("path");
                Object p = path.invoke(ann);
                if (p instanceof String[]) Collections.addAll(out, (String[]) p);
            } catch (Exception ignore) {
                // 注解形态变化：由编译期兜底
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
}
