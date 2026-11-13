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

import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

/** 批次 987：任务取消提档与 abort 族对齐、连接同步只读豁免、desired-state.html 按页收口。 */
public class PermMapHarden987Test {

    private static final String BASE = "/internal/es/index";

    @Test
    public void 任务取消与重建中止同档() {
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/cluster/tasks/cancel?taskId=t1"));
    }

    @Test
    public void 任务观测读面维持全角色() {
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", BASE + "/cluster/tasks"));
    }

    @Test
    public void 连接同步状态GET豁免到观测档() {
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", BASE + "/clusters/sync"));
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/clusters/sync/run"));
    }

    @Test
    public void 连接保存删除仍是管理员档() {
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/clusters/save"));
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/clusters/delete"));
    }

    @Test
    public void desiredStateHtml变体按页收口() {
        List<String> pages = ConsoleAuthInterceptor.sharedReadPages(BASE + "/desired-state.html");
        assertNotNull("html 变体必须登记共享读页面，不能因段边界匹配漏收口", pages);
        assertEquals(Arrays.asList("config-drift", "adhoc-rebuild", "indices", "mapping"), pages);
    }
}
