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

package io.github.dengmeiluan.esquerystudio.console.insight.action;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.insight.InsightForbiddenException;
import org.junit.Test;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 连接模型页面写键是动作最终裁决：w:index-settings 的 VIEWER 不应被动作 minRole 二次拦截；
 * 静态角色模型仍按 minRole。
 */
public class GuardedActionConnPrincipal972Test {

    private static class FakeAction implements GuardedAction {
        @Override public String id() { return "fake-action"; }
        @Override public ConsoleRole minRole() { return ConsoleRole.REBUILD_OP; }
        @Override public String riskLevel() { return RISK_LOW; }
        @Override public boolean supportsDryRun() { return false; }
        @Override public Map<String, Object> estimate(Map<String, Object> params) {
            return new LinkedHashMap<>(Collections.singletonMap("summary", "ok"));
        }
        @Override public Map<String, Object> dryRun(Map<String, Object> params) {
            return Collections.emptyMap();
        }
        @Override public Map<String, Object> execute(Map<String, Object> params) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("applied", true);
            return out;
        }
    }

    private static GuardedActionExecutor executor() {
        return new GuardedActionExecutor(
                new GuardedActionRegistry(Collections.<GuardedAction>singletonList(new FakeAction())),
                new ConfirmTokenService(), null, true);
    }

    @Test
    public void 连接模型VIEWER持页面写键可预估与执行() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("delegated", ConsoleRole.VIEWER, false, true,
                "委派写者", null,
                new java.util.LinkedHashSet<>(java.util.Arrays.asList(
                        "conn:c1:index-settings", "conn:c1:w:index-settings")));
        GuardedActionExecutor exec = executor();
        Map<String, Object> est = exec.estimate("fake-action", Collections.emptyMap(), p);
        String token = String.valueOf(est.get("confirmToken"));
        assertTrue("应签发 token", token.length() > 0);
        Map<String, Object> receipt = exec.execute("fake-action", Collections.emptyMap(), token, p);
        assertTrue(String.valueOf(receipt).contains("applied"));
    }

    @Test
    public void 静态角色模型仍要求minRole() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("local-viewer", ConsoleRole.VIEWER, false);
        try {
            executor().estimate("fake-action", Collections.emptyMap(), p);
            fail("静态 VIEWER 不应通过 rank3 动作");
        } catch (InsightForbiddenException expected) {
            assertTrue(expected.getMessage().contains("角色"));
        }
    }

    @Test
    public void 页面门关闭时连接VIEWER不得跳过动作minRole() throws Exception {
        ConsolePrincipal p = new ConsolePrincipal("delegated", ConsoleRole.VIEWER, false, true,
                "委派写者", null,
                new java.util.LinkedHashSet<>(java.util.Arrays.asList(
                        "conn:c1:index-settings", "conn:c1:w:index-settings")));
        GuardedActionExecutor exec = new GuardedActionExecutor(
                new GuardedActionRegistry(Collections.<GuardedAction>singletonList(new FakeAction())),
                new ConfirmTokenService(), null, false);
        try {
            exec.estimate("fake-action", Collections.emptyMap(), p);
            fail("页面门关闭时 VIEWER 不得执行 rank3 动作");
        } catch (InsightForbiddenException expected) {
            assertTrue(expected.getMessage().contains("角色"));
        }
    }
}
