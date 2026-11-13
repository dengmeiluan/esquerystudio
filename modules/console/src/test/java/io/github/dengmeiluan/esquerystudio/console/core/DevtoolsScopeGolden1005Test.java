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

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.io.File;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 批次 1005：透传内核 × 前端作用域门的**同一份金标准**校验（后端侧）。
 *
 * <p>问题：DevTools/REST 的能力边界由两处各自维护——后端 {@code guardRawGuarded}（真边界）与
 * 前端 {@code nonAdminDataPlaneWriteAllowed}（提前暴露）。两者只要有一处漂移，就是
 * 「有权限的人点不了」或「点得下去 403」。单侧测试锁不住这种漂移。</p>
 *
 * <p>做法：仓库里放一份 {@code ui/src/__tests__/fixtures/devtoolsScope.golden.json}，
 * 后端断言内核裁决与 {@code allow} 逐条一致，前端断言 UI 态与 {@code ui} 逐条一致。
 * 改任何一侧而未同步样例 → 该侧红。</p>
 */
public class DevtoolsScopeGolden1005Test {

    /** 与 console/src/utils/devtoolsScope.ts 的路径/方法入口校验同序（raw 入口先于 I/O 拒绝）。 */
    private static final List<String> ALLOWED_METHODS = java.util.Arrays.asList(
            "GET", "POST", "PUT", "DELETE", "HEAD");

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> goldenCases() throws Exception {
        File f = new File(System.getProperty("esquerystudio.root", ".."), "ui/src/__tests__/fixtures/devtoolsScope.golden.json");
        assertTrue("金标准样例缺失（前后端共用，勿移动）: " + f.getAbsolutePath(), f.isFile());
        Map<String, Object> root = new ObjectMapper().readValue(f, Map.class);
        Object cases = root.get("cases");
        assertNotNull("样例必须包含 cases 数组", cases);
        return (List<Map<String, Object>>) cases;
    }

    /** 与控制器同序的入口校验 + 内核守卫；不触网（拒绝在守卫层抛出）。 */
    private boolean kernelAllows(String method, String path) {
        String m = method == null ? "GET" : method.trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_METHODS.contains(m)) return false;
        if (path == null || !path.startsWith("/") || path.contains("..") || path.indexOf('#') >= 0) {
            return false;
        }
        return true;
    }

    @Test
    public void 内核裁决必须与金标准逐条一致() throws Exception {
        int checked = 0;
        java.util.List<String> mismatched = new java.util.ArrayList<>();
        for (Map<String, Object> c : goldenCases()) {
            String id = String.valueOf(c.get("id"));
            String method = String.valueOf(c.get("method"));
            String path = String.valueOf(c.get("path"));
            Object bodyObj = c.get("body");
            String body = bodyObj == null ? null : String.valueOf(bodyObj);
            boolean expectAllow = Boolean.TRUE.equals(c.get("allow"));
            boolean allowed;
            if (!kernelAllows(method, path)) {
                allowed = false;
            } else {
                try {
                    admin.guardRawGuarded(method, path, body);
                    allowed = true;
                } catch (Exception e) {
                    allowed = false;
                }
            }
            checked++;
            if (allowed != expectAllow) {
                mismatched.add(id + " " + method + " " + path + " 期望 allow=" + expectAllow
                        + " 实际=" + allowed);
            }
        }
        assertTrue("金标准至少要覆盖 30 条向量（当前 " + checked + "）", checked >= 30);
        assertTrue("内核裁决与金标准不一致（改守卫请同步样例与前端）:\n  "
                + String.join("\n  ", mismatched), mismatched.isEmpty());
    }

    @Test
    public void 样例自身字段完整且取值合法() throws Exception {
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (Map<String, Object> c : goldenCases()) {
            String id = String.valueOf(c.get("id"));
            assertTrue("id 重复: " + id, ids.add(id));
            String ui = String.valueOf(c.get("ui"));
            assertTrue("ui 取值非法: " + id + " " + ui,
                    "allow".equals(ui) || "deny".equals(ui) || "any".equals(ui));
            assertTrue("每条必须写明 why: " + id,
                    c.get("why") != null && !String.valueOf(c.get("why")).trim().isEmpty());
            assertNotNull("allow 必须显式: " + id, c.get("allow"));
            /* 允许的用例不允许带 ui=deny（自相矛盾） */
            if (Boolean.TRUE.equals(c.get("allow"))) {
                assertFalse("allow=true 的用例不应要求 UI 禁用: " + id, "deny".equals(ui));
            }
        }
    }
}
