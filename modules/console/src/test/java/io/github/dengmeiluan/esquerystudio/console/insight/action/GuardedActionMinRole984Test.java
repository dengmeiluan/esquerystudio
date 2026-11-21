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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.insight.InsightForbiddenException;
import org.junit.Test;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 批次 984：混合模型静态页回落不得跳过护栏动作 minRole，conn 写键直接授权才可跳过。 */
public class GuardedActionMinRole984Test {

    private static final String ACTION_ID = "apply-index-settings";

    private static GuardedAction action() {
        return new GuardedAction() {
            @Override public String id() { return ACTION_ID; }
            @Override public ConsoleRole minRole() { return ConsoleRole.REBUILD_OP; }
            @Override public String riskLevel() { return GuardedAction.RISK_LOW; }
            @Override public boolean supportsDryRun() { return false; }
            @Override public Map<String, Object> estimate(Map<String, Object> params) throws IOException {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("summary", "ok");
                return out;
            }
            @Override public Map<String, Object> dryRun(Map<String, Object> params) {
                throw new UnsupportedOperationException();
            }
            @Override public Map<String, Object> execute(Map<String, Object> params) {
                return new LinkedHashMap<>();
            }
        };
    }

    private static GuardedActionExecutor executor() {
        return new GuardedActionExecutor(new GuardedActionRegistry(
                Collections.singletonList(action())), new ConfirmTokenService(), null, true);
    }

    private static ConsolePrincipal mixedOperator() {
        return new ConsolePrincipal("u", ConsoleRole.OPERATOR, false, true, "用户", null,
                new HashSet<>(Arrays.asList("index-settings", "conn:c1:bulk")));
    }

    private static HttpServletRequest request(boolean connWriteGranted) {
        return (HttpServletRequest) Proxy.newProxyInstance(
                GuardedActionMinRole984Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (proxy, m, args) -> {
                    if ("getAttribute".equals(m.getName())) {
                        return ConsoleAuthInterceptor.ATTR_CONN_WRITE_GRANTED.equals(args[0])
                                ? connWriteGranted : null;
                    }
                    throw new UnsupportedOperationException(m.getName());
                });
    }

    @Test
    public void 混合静态页回落仍要求动作minRole() {
        try {
            executor().estimate(ACTION_ID, new LinkedHashMap<>(), mixedOperator());
            fail("OPERATOR + 静态 index-settings 不得跳过 REBUILD_OP 动作门槛");
        } catch (InsightForbiddenException expected) {
            // ok
        } catch (IOException e) {
            fail("不应为 IO 失败：" + e.getMessage());
        }
    }

    @Test
    public void 生产请求标记缺失时持其他conn写键也不跳过minRole() {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.OPERATOR, false, true, "用户", null,
                new HashSet<>(Arrays.asList("index-settings", "conn:c1:w:search")));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request(false)));
        try {
            executor().estimate(ACTION_ID, new LinkedHashMap<>(), p);
            fail("拦截器未标记 conn 写键时不得用其它连接的写键跳过 minRole");
        } catch (InsightForbiddenException expected) {
            // ok
        } catch (IOException e) {
            fail("不应为 IO 失败：" + e.getMessage());
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    @Test
    public void conn写键直接授权时跳过动作minRole() throws Exception {
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request(true)));
        try {
            Map<String, Object> out = executor().estimate(
                    ACTION_ID, new LinkedHashMap<>(), mixedOperator());
            assertTrue("conn 写键授权应可执行动作", out.containsKey("confirmToken"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }
}
