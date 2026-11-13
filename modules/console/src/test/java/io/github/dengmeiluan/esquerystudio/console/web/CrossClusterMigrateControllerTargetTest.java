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

package io.github.dengmeiluan.esquerystudio.console.web;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateRequest;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 跨集群迁移的源连接隔离：连接模型下，发起/预检/进度/中止/续跑/列表都必须绑定作业的
 * srcConnId 写键，防止持 A 连接 xmigrate 写键的用户读取或操作 B 连接的迁移（源码凭据/数据面越权）。
 */
public class CrossClusterMigrateControllerTargetTest {

    private static class FakeService extends CrossClusterMigrateService {
        final Map<String, MigrateJobES> jobs = new LinkedHashMap<>();
        String lastStartSource;
        String lastStartOwner;
        String lastStartOwnerRole;

        FakeService() {
            super(null, null, null, null, null, null, null, null, null);
        }

        @Override
        public MigrateJobES progress(String jobId) {
            MigrateJobES job = jobs.get(jobId);
            if (job == null) throw new IllegalArgumentException("作业不存在: " + jobId);
            return job;
        }

        @Override
        public List<MigrateJobES> jobs(int limit) {
            return new ArrayList<>(jobs.values());
        }

        @Override
        public void abort(String jobId) {
        }

        @Override
        public String resume(String jobId, RemoteClusterConn conn) {
            return jobId;
        }

        @Override
        public String start(MigrateRequest request) {
            return start(request, null, null);
        }

        @Override
        public String start(MigrateRequest request, String ownerUsername, String ownerRole) {
            lastStartSource = request.getSrcConnId();
            lastStartOwner = ownerUsername;
            lastStartOwnerRole = ownerRole;
            return "job-" + request.getDestIndex();
        }

        @Override
        public Map<String, Object> preflight(MigrateRequest request) {
            return Collections.emptyMap();
        }
    }

    private static MigrateJobES job(String id, String srcConnId) {
        MigrateJobES job = new MigrateJobES();
        job.setJobId(id);
        job.setSourceIndex("src-1");
        job.setDestIndex("dest-1");
        job.setSrcConnId(srcConnId);
        return job;
    }

    private static MigrateJobES job(String id, String srcConnId, String owner) {
        MigrateJobES job = job(id, srcConnId);
        job.setOwnerUsername(owner);
        job.setOwnerRole("VIEWER");
        return job;
    }

    private static ConnStore connStore() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return new RemoteClusterConn(); }
            @Override public String getName(String id) { return id; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static HttpServletRequest request(ConsolePrincipal principal) {
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        InvocationHandler h = (proxy, method, args) -> {
            switch (method.getName()) {
                case "getAttribute": return attrs.get(args[0]);
                case "getHeader": return null;
                default: throw new UnsupportedOperationException(method.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                CrossClusterMigrateControllerTargetTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsolePrincipal viewer(String... grants) {
        return new ConsolePrincipal("u-conn", ConsoleRole.VIEWER, false, true, "连接用户", null,
                new HashSet<>(Arrays.asList(grants)));
    }

    private static CrossClusterMigrateController controller(FakeService service, ConnStore connStore) {
        return new CrossClusterMigrateController(service, connStore,
                new EnvPagesResolver(connStore, new ESQueryStudioElasticsearchProperties()), true);
    }

    private static void expectForbidden(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }
    }

    @Test
    public void 发起与预检_源连接必须有写键() {
        FakeService service = new FakeService();
        MigrateRequest req = new MigrateRequest();
        req.setSrcConnId("c2");
        req.setSourceIndex("src-1");
        req.setDestIndex("dest-1");
        HttpServletRequest c1 = request(viewer("conn:c1:w:xmigrate"));
        CrossClusterMigrateController ctrl = controller(service, connStore());
        expectForbidden(() -> ctrl.start(req, c1), "持 c1 写键从 c2 发起迁移");
        expectForbidden(() -> ctrl.preflight(req, c1), "持 c1 写键预检 c2");

        HttpServletRequest c2 = request(viewer("conn:c2:w:xmigrate"));
        expectForbidden(() -> ctrl.start(req, c2), "仅有源写键、无宿主目标写键不得发起迁移");

        HttpServletRequest c2WithDest = request(viewer("conn:c2:w:xmigrate", "conn:host:w:xmigrate"));
        assertEquals("job-dest-1", ctrl.start(req, c2WithDest).get("jobId"));
        assertTrue(ctrl.preflight(req, c2WithDest).isEmpty());
    }

    @Test
    public void 连接模型_手输源连接被拒绝() {
        FakeService service = new FakeService();
        MigrateRequest req = new MigrateRequest();
        req.setSourceIndex("src-1");
        req.setDestIndex("dest-1");
        HttpServletRequest c1 = request(viewer("conn:c1:w:xmigrate"));
        CrossClusterMigrateController ctrl = controller(service, connStore());
        expectForbidden(() -> ctrl.start(req, c1), "空 srcConnId 手输源发起");
        expectForbidden(() -> ctrl.preflight(req, c1), "空 srcConnId 手输源预检");
        expectForbidden(() -> ctrl.connectCheck(new RemoteClusterConn(), null, c1), "空 connId 手输源连接检查");
        expectForbidden(() -> ctrl.fetchConfig(new RemoteClusterConn(), "src-1", null, c1), "空 connId 手输源取配置");
    }

    @Test
    public void 进度中止续跑_按作业源连接写键裁决() {
        FakeService service = new FakeService();
        service.jobs.put("j1", job("j1", "c1"));
        service.jobs.put("j2", job("j2", "c2"));
        CrossClusterMigrateController ctrl = controller(service, connStore());
        HttpServletRequest c1 = request(viewer("conn:c1:w:xmigrate"));
        assertEquals("j1", ctrl.progress("j1", c1).getJobId());
        expectForbidden(() -> ctrl.progress("j2", c1), "读 c2 作业进度");
        expectForbidden(() -> ctrl.abort("j2", c1), "中止 c2 作业");
        expectForbidden(() -> ctrl.resume("j2", new RemoteClusterConn(), null, c1), "续跑 c2 作业");

        // 作业列表也只列 c1 源作业
        List<MigrateJobES> visible = ctrl.jobs(20, c1);
        assertEquals(1, visible.size());
        assertEquals("j1", visible.get(0).getJobId());
    }

    @Test
    public void 作业归属_中止与续跑仅限创建者本人或ADMIN() {
        FakeService service = new FakeService();
        service.jobs.put("j-owned", job("j-owned", "c1", "u-owner"));
        HttpServletRequest teammate = request(viewer("conn:c1:w:xmigrate"));
        HttpServletRequest owner = request(new ConsolePrincipal("u-owner", ConsoleRole.VIEWER, false, true,
                "创建者", null, new HashSet<>(Arrays.asList("conn:c1:w:xmigrate", "conn:host:w:xmigrate"))));
        CrossClusterMigrateController ctrl = controller(service, connStore());

        /* 同连接同事可观测（团队排障），但不可替代创建者执行不可逆动作 */
        assertEquals("j-owned", ctrl.progress("j-owned", teammate).getJobId());
        expectForbidden(() -> ctrl.abort("j-owned", teammate), "非创建者中止他人作业");
        expectForbidden(() -> ctrl.resume("j-owned", new RemoteClusterConn(), "c1", teammate),
                "非创建者续跑他人作业");

        ctrl.abort("j-owned", owner);
        assertEquals("j-owned", ctrl.resume("j-owned", new RemoteClusterConn(), "c1", owner).get("jobId"));

        /* ADMIN 是全局超管：即使不是创建者也必须能收尾（连接模型对 ADMIN 整体短路） */
        HttpServletRequest admin = request(new ConsolePrincipal("admin-x", ConsoleRole.ADMIN,
                false, true, "超管", null, new HashSet<>(Arrays.asList("conn:c1:rest"))));
        ctrl.abort("j-owned", admin);
    }

    @Test
    public void 发起迁移_记录创建者身份() {
        FakeService service = new FakeService();
        MigrateRequest req = new MigrateRequest();
        req.setSrcConnId("c2");
        req.setSourceIndex("src-1");
        req.setDestIndex("dest-1");
        CrossClusterMigrateController ctrl = controller(service, connStore());
        HttpServletRequest c2WithDest = request(viewer("conn:c2:w:xmigrate", "conn:host:w:xmigrate"));
        ctrl.start(req, c2WithDest);
        assertEquals("u-conn", service.lastStartOwner);
        assertEquals("VIEWER", service.lastStartOwnerRole);
    }

    @Test
    public void 续跑_必须使用同一源连接档案() {
        FakeService service = new FakeService();
        service.jobs.put("j2", job("j2", "c2"));
        CrossClusterMigrateController ctrl = controller(service, connStore());
        HttpServletRequest c2 = request(viewer("conn:c2:w:xmigrate"));
        expectForbidden(() -> ctrl.resume("j2", new RemoteClusterConn(), "c1", c2), "用 c1 档案续跑 c2");
        expectForbidden(() -> ctrl.resume("j2", new RemoteClusterConn(), "c2", c2), "无宿主写键续跑");
        HttpServletRequest c2WithDest = request(viewer("conn:c2:w:xmigrate", "conn:host:w:xmigrate"));
        assertEquals("j2", ctrl.resume("j2", new RemoteClusterConn(), "c2", c2WithDest).get("jobId"));
    }

    @Test
    public void 混合模型_静态xmigrate写档角色可发起迁移() {
        FakeService service = new FakeService();
        MigrateRequest req = new MigrateRequest();
        req.setSrcConnId("c1");
        req.setSourceIndex("src-1");
        req.setDestIndex("dest-1");
        CrossClusterMigrateController ctrl = controller(service, connStore());
        ConsolePrincipal op = new ConsolePrincipal("u", ConsoleRole.REBUILD_OP, false, true, "ops", null,
                new HashSet<>(Arrays.asList("xmigrate", "conn:c1:overview")));
        HttpServletRequest reqp = request(op);
        assertEquals("job-dest-1", ctrl.start(req, reqp).get("jobId"));

        ConsolePrincipal viewer = new ConsolePrincipal("v", ConsoleRole.VIEWER, false, true, "viewer", null,
                new HashSet<>(Arrays.asList("xmigrate", "conn:c1:overview")));
        expectForbidden(() -> ctrl.start(req, request(viewer)), "静态 xmigrate 低角色不得发起迁移");
    }

    @Test
    public void 静态模型_保持全局作业可见() {
        FakeService service = new FakeService();
        service.jobs.put("j1", job("j1", "c1"));
        service.jobs.put("j2", job("j2", "c2"));
        ConsolePrincipal admin = new ConsolePrincipal("local", ConsoleRole.ADMIN, false);
        HttpServletRequest req = request(admin);
        CrossClusterMigrateController ctrl = controller(service, connStore());
        assertEquals(2, ctrl.jobs(20, req).size());
        assertEquals("j2", ctrl.progress("j2", req).getJobId());
    }

    @Test
    public void 连接模型ADMIN_不受源连接写键限制() {
        FakeService service = new FakeService();
        service.jobs.put("j1", job("j1", "c1"));
        service.jobs.put("j2", job("j2", "c2"));
        ConsolePrincipal admin = new ConsolePrincipal("delegated-admin", ConsoleRole.ADMIN,
                false, true, "超管", null, new HashSet<>(Arrays.asList("conn:c1:rest")));
        HttpServletRequest req = request(admin);
        CrossClusterMigrateController ctrl = controller(service, connStore());
        assertEquals(2, ctrl.jobs(20, req).size());
        assertEquals("j2", ctrl.progress("j2", req).getJobId());
        ctrl.abort("j2", req);

        MigrateRequest start = new MigrateRequest();
        start.setSrcConnId("c2");
        start.setSourceIndex("src-1");
        start.setDestIndex("dest-1");
        assertEquals("job-dest-1", ctrl.start(start, req).get("jobId"));
    }
}
