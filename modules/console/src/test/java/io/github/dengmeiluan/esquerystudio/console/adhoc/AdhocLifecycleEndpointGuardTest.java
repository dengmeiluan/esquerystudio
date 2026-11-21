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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import org.junit.Test;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * retry / delete / throttle 三个新端点的控制器守卫测试：
 * 目标一致性（跨目标 403）、归属（retry 照 abort——创建者本人或 ADMIN）、
 * throttle 参数校验与 deleteOlderThan 的连接过滤入参。
 */
public class AdhocLifecycleEndpointGuardTest {

    private static class FakeService extends AdhocRebuildService {
        final Map<String, Map<String, Object>> jobs = new LinkedHashMap<>();
        final AtomicInteger retryCalls = new AtomicInteger();
        final AtomicInteger deleteOlderThanCalls = new AtomicInteger();
        volatile String lastDeleteTarget;

        FakeService() {
            super(null, null, 0L, null, 0L);
        }

        @Override
        public Map<String, Object> status(String jobId) {
            Map<String, Object> job = jobs.get(jobId);
            if (job == null) {
                throw new IllegalArgumentException("作业不存在: " + jobId);
            }
            return job;
        }

        @Override
        public Map<String, Object> retry(String jobId) {
            retryCalls.incrementAndGet();
            return status(jobId);
        }

        /* retry 新增 overrides 双参形态（2026-11-21 对账批）后 Controller 走本入口；
            随迁覆写转发旧桩以维持守卫断言语义（AdhocServiceStorePersistTest 4 参先例） */
        @Override
        public Map<String, Object> retry(String jobId, Map<String, Object> overrides) {
            return retry(jobId);
        }

        @Override
        public Map<String, Object> delete(String jobId) {
            return status(jobId);
        }

        @Override
        public Map<String, Object> deleteOlderThan(int days, String targetId) {
            deleteOlderThanCalls.incrementAndGet();
            lastDeleteTarget = targetId;
            Map<String, Object> out = new HashMap<>();
            out.put("deleted", 2);
            return out;
        }

        @Override
        public Map<String, Object> throttle(String jobId, double requestsPerSecond) {
            return status(jobId);
        }
    }

    private static Map<String, Object> job(String id, String targetId, String owner) {
        Map<String, Object> m = new HashMap<>();
        m.put("jobId", id);
        m.put("targetId", targetId);
        if (owner != null) {
            m.put("ownerUsername", owner);
        }
        return m;
    }

    private static HttpServletRequest request(ConsolePrincipal principal, String target) {
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        InvocationHandler h = (proxy, method, args) -> {
            switch (method.getName()) {
                case "getAttribute": return attrs.get(args[0]);
                case "getHeader": return "X-Es-Target".equals(args[0]) ? target : null;
                default: throw new UnsupportedOperationException(method.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                AdhocLifecycleEndpointGuardTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsolePrincipal member(String username, String... grants) {
        return new ConsolePrincipal(username, ConsoleRole.VIEWER, false, true, "连接用户", null,
                new HashSet<>(Arrays.asList(grants)));
    }

    private static InternalAdhocRebuildController controller(FakeService service) {
        return new InternalAdhocRebuildController(service,
                new EnvPagesResolver(null, new ESQueryStudioElasticsearchProperties()), true);
    }

    private static void expectForbidden(Runnable r) {
        try {
            r.run();
            fail("应拒绝跨目标/非创建者操作");
        } catch (ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }
    }

    private static Map<String, Object> body(String jobId) {
        Map<String, Object> m = new HashMap<>();
        m.put("jobId", jobId);
        return m;
    }

    /** retry 照 abort：跨目标作业 403（持 A 连接写键不得重启 B 连接的重建）。 */
    @Test
    public void retry_crossTargetJob_isForbidden() {
        FakeService service = new FakeService();
        service.jobs.put("j2", job("j2", "c2", "alice"));
        HttpServletRequest c1 = request(member("bob", "conn:c1:w:adhoc-rebuild"), "c1");

        expectForbidden(() -> controller(service).retry(body("j2"), c1));
        assertEquals("守卫必须先于 service 调用（不得产生副作用）", 0, service.retryCalls.get());
    }

    /** retry 照 abort：同连接非创建者 403；创建者本人放行。 */
    @Test
    public void retry_sameConnectionNonOwner_isForbidden_ownerAllowed() {
        FakeService service = new FakeService();
        service.jobs.put("j1", job("j1", "c1", "alice"));
        HttpServletRequest bob = request(member("bob", "conn:c1:w:adhoc-rebuild"), "c1");
        HttpServletRequest alice = request(member("alice", "conn:c1:w:adhoc-rebuild"), "c1");

        expectForbidden(() -> controller(service).retry(body("j1"), bob));
        assertEquals("j1", controller(service).retry(body("j1"), alice).get("jobId"));
    }

    /** retry 缺 jobId：400 语义的非法参数（IllegalArgument 由 advice 转 {code,message}）。 */
    @Test
    public void retry_missingJobId_isRejected() {
        try {
            controller(new FakeService()).retry(new HashMap<>(), request(null, null));
            fail("jobId 缺失应拒绝");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("jobId"));
        }
    }

    /** throttle 参数必须是数字（防字符串速率静默转成 NaN 类事故）。 */
    @Test
    public void throttle_nonNumericRate_isRejected() throws java.io.IOException {
        FakeService service = new FakeService();
        service.jobs.put("j1", job("j1", "c1", null));
        Map<String, Object> req = new HashMap<>();
        req.put("requestsPerSecond", "fast");
        try {
            controller(service).throttle("j1", req, request(null, null));
            fail("非数字 requestsPerSecond 应拒绝");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("requestsPerSecond"));
        }
    }

    /** 连接模型下批量清理只作用于当前目标连接（service 收到 targetId）；静态模型全局（null）。 */
    @Test
    public void deleteOlderThan_scopesTargetInConnectionModel_only() {
        FakeService service = new FakeService();
        InternalAdhocRebuildController controller = controller(service);

        Map<String, Object> out = controller.deleteJobs(7, request(member("bob", "conn:c1:w:adhoc-rebuild"), "c1"));
        assertEquals(2, ((Number) out.get("deleted")).intValue());
        assertEquals("批量清理须收到当前目标连接 id（job targetId 的同一约定值）", "c1", service.lastDeleteTarget);

        ConsolePrincipal builtin = new ConsolePrincipal("local-admin", ConsoleRole.ADMIN, false);
        controller.deleteJobs(7, request(builtin, null));
        assertEquals("静态/内置模型全局清理（targetId=null）", null, service.lastDeleteTarget);
    }

    /** olderThanDays 非正数直接拒绝，防误传 0 清掉全部终态。 */
    @Test
    public void deleteOlderThan_nonPositiveDays_isRejected() {
        FakeService service = new FakeService();
        try {
            controller(service).deleteJobs(0, request(null, null));
            fail("olderThanDays=0 应拒绝");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("olderThanDays"));
        }
        assertEquals(0, service.deleteOlderThanCalls.get());
    }
}
