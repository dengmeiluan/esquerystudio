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

import org.junit.Test;

import static org.junit.Assert.assertEquals;

/**
 * 批次 988：已绑定后 setup/apply|test 与 rebind 同档（控制面归属切换/凭据流转）——
 * 拦截器层即 ADMIN，不再依赖控制器 alreadyBound 兜底；未绑定 bootstrap 走 SETUP 短路
 * （早于角色门），不受提档影响。
 */
public class PermMapHarden988Test {

    private static final String BASE = "/internal/es/index";

    @Test
    public void 已绑定后Setup应用与测试是管理员档() {
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/setup/apply"));
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/setup/test"));
    }

    @Test
    public void 重绑维持管理员档() {
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/setup/rebind"));
    }

    @Test
    public void 只读POST清单段边界匹配() {
        /* 既有只读端点照旧命中（段精确 / 段前缀 / query 串 / 矩阵参数） */
        org.junit.Assert.assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/query"));
        org.junit.Assert.assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/sql"));
        org.junit.Assert.assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/sql/close"));
        org.junit.Assert.assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/pit/open"));
        org.junit.Assert.assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/count?a=b"));
        /* 前缀内的新形态（counter-reset/counterX）不得被 contains 静默认成只读 */
        org.junit.Assert.assertFalse(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/counter-reset"));
        org.junit.Assert.assertFalse(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/counterX"));
        org.junit.Assert.assertFalse(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/query-admin"));
    }
}
