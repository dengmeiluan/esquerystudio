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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Adhoc 作业目标隔离：连接模型下列表/状态/中止/确认切换只能作用于当前目标连接的作业，
 * 防止持连接 A 写键的用户接管连接 B 上运行中的重建作业。静态/内置模型保持全局管理语义。
 */
public class InternalAdhocRebuildControllerTargetTest {

    private static class FakeService extends AdhocRebuildService {
        final Map<String, Map<String, Object>> jobs = new LinkedHashMap<>();

        FakeService() {
            super(null, null, 0L, null, 0L);
        }

        @Override
        public Map<String, Object> status(String jobId) {
            Map<String, Object> job = jobs.get(jobId);
            if (job == null) throw new IllegalArgumentException("作业不存在: " + jobId);
            return job;
        }

        @Override
        public List<Map<String, Object>> listJobs() {
            return new ArrayList<>(jobs.values());
        }

        @Override
        public Map<String, Object> abort(String jobId) {
            return status(jobId);
        }

        @Override
        public Map<String, Object> confirmSwitch(String jobId) {
            return status(jobId);
        }
    }

    private static Map<String, Object> job(String id, String targetId) {
        Map<String, Object> m = new HashMap<>();
        m.put("jobId", id);
        m.put("targetId", targetId);
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
                InternalAdhocRebuildControllerTargetTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsolePrincipal delegatedViewer(String... grants) {
        return new ConsolePrincipal("u-conn", ConsoleRole.VIEWER, false, true, "连接用户", null,
                new HashSet<>(Arrays.asList(grants)));
    }

    private static InternalAdhocRebuildController controller(FakeService service) {
        return new InternalAdhocRebuildController(service,
                new EnvPagesResolver(null, new ESQueryStudioElasticsearchProperties()), true);
    }

    private static ResponseStatusException expectForbidden(Runnable r) {
        try {
            r.run();
            fail("应拒绝跨目标作业操作");
            return null;
        } catch (ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
            return e;
        }
    }

    @Test
    public void 连接模型_作业列表只含当前目标() {
        FakeService service = new FakeService();
        service.jobs.put("j1", job("j1", "c1"));
        service.jobs.put("j2", job("j2", "c2"));
        HttpServletRequest req = request(delegatedViewer("conn:c1:w:adhoc-rebuild"), "c1");
        List<Map<String, Object>> jobs = controller(service).jobs(req);
        assertEquals(1, jobs.size());
        assertEquals("j1", jobs.get(0).get("jobId"));
    }

    @Test
    public void 连接模型_跨目标状态中止确认切换均403() {
        FakeService service = new FakeService();
        service.jobs.put("j1", job("j1", "c1"));
        service.jobs.put("j2", job("j2", "c2"));
        InternalAdhocRebuildController controller = controller(service);
        HttpServletRequest c1 = request(delegatedViewer("conn:c1:w:adhoc-rebuild"), "c1");
        assertEquals("j1", controller.status("j1", c1).get("jobId"));
        assertFalse(controller.jobs(c1).isEmpty());
        expectForbidden(() -> controller.status("j2", c1));
        expectForbidden(() -> controller.abort("j2", c1));
        expectForbidden(() -> controller.confirmSwitch("j2", c1));
    }

    @Test
    public void 静态模型_保持全局作业管理() {
        FakeService service = new FakeService();
        service.jobs.put("j1", job("j1", "c1"));
        service.jobs.put("j2", job("j2", "host"));
        ConsolePrincipal builtin = new ConsolePrincipal("local-admin", ConsoleRole.ADMIN, false);
        HttpServletRequest host = request(builtin, null);
        InternalAdhocRebuildController controller = controller(service);
        assertTrue(controller.jobs(host).size() == 2);
        assertEquals("j2", controller.status("j2", host).get("jobId"));
    }

    @Test
    public void 连接模型ADMIN_不受目标过滤_可操作跨目标作业() {
        FakeService service = new FakeService();
        service.jobs.put("j1", job("j1", "c1"));
        service.jobs.put("j2", job("j2", "c2"));
        ConsolePrincipal admin = new ConsolePrincipal("delegated-admin", ConsoleRole.ADMIN,
                false, true, "超管", null, new HashSet<>(Arrays.asList("conn:c1:rest")));
        HttpServletRequest c1 = request(admin, "c1");
        InternalAdhocRebuildController controller = controller(service);
        assertEquals(2, controller.jobs(c1).size());
        assertEquals("j2", controller.status("j2", c1).get("jobId"));
        assertEquals("j2", controller.abort("j2", c1).get("jobId"));
    }

    /**
     * 1124：同一连接内的**作业归属**隔离。目标一致性只回答「这条作业属于当前集群」，
     * 不回答「你是谁」——同连接的同事可以看进度，但不能代替创建者中止/放行切换。
     * 这两条守卫必须同时成立，否则持同连接写键的人能接管别人的不可逆动作。
     */
    @Test
    public void 连接模型_同连接非创建者不能中止或确认切换_但可观测() {
        FakeService service = new FakeService();
        Map<String, Object> j1 = job("j1", "c1");
        j1.put("ownerUsername", "alice");
        service.jobs.put("j1", j1);
        HttpServletRequest bob = request(new ConsolePrincipal("bob", ConsoleRole.VIEWER,
                false, true, "同事", null, new HashSet<>(Arrays.asList("conn:c1:w:adhoc-rebuild"))), "c1");
        InternalAdhocRebuildController controller = controller(service);

        assertEquals("同连接同事仍可观测进度", "j1", controller.status("j1", bob).get("jobId"));
        expectForbidden(() -> controller.abort("j1", bob));
        expectForbidden(() -> controller.confirmSwitch("j1", bob));

        HttpServletRequest alice = request(new ConsolePrincipal("alice", ConsoleRole.VIEWER,
                false, true, "创建者", null, new HashSet<>(Arrays.asList("conn:c1:w:adhoc-rebuild"))), "c1");
        assertEquals("创建者本人可中止自己的作业", "j1", controller.abort("j1", alice).get("jobId"));
    }

    @Test
    public void 连接模型_无归属记录的旧作业维持连接级语义() {
        FakeService service = new FakeService();
        service.jobs.put("legacy", job("legacy", "c1")); /* 升级前作业没有 ownerUsername */
        HttpServletRequest bob = request(new ConsolePrincipal("bob", ConsoleRole.VIEWER,
                false, true, "同事", null, new HashSet<>(Arrays.asList("conn:c1:w:adhoc-rebuild"))), "c1");
        assertEquals("旧作业无归属时按连接级放行（便于收尾）", "legacy",
                controller(service).abort("legacy", bob).get("jobId"));
    }
}
