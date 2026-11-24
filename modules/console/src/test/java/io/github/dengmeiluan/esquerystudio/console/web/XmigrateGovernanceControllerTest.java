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
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.junit.Test;

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
import java.util.function.Predicate;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 迁移作业治理端点（DELETE 单条/按天批量、reconcile 对账、conflicts 样本）的行为锁：
 * 终态边界、409 语义、olderThanDays 校验、连接模型清理范围与样本环口径。
 */
public class XmigrateGovernanceControllerTest {

    private static class FakeService extends CrossClusterMigrateService {
        final Map<String, MigrateJobES> jobs = new LinkedHashMap<>();
        final List<String> deleted = new ArrayList<>();
        Predicate<MigrateJobES> lastDeleteScope;
        RemoteClusterConn lastReconcileConn;
        String lastReconcileSource;
        String lastReconcileDest;

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
        public Map<String, Object> delete(String jobId) {
            MigrateJobES job = jobs.get(jobId);
            if (job == null) throw new IllegalArgumentException("作业不存在: " + jobId);
            if (!terminal(job.getStatus())) {
                throw new IllegalStateException("作业仍在运行中（状态 " + job.getStatus()
                        + "），不能删除；请先中止或等待完成: " + jobId);
            }
            deleted.add(jobId);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("jobId", jobId);
            out.put("deleted", true);
            return out;
        }

        @Override
        public Map<String, Object> deleteOlderThan(int days, Predicate<MigrateJobES> scope) {
            if (days <= 0) throw new IllegalArgumentException("olderThanDays 必须为正整数");
            lastDeleteScope = scope;
            long cutoff = System.currentTimeMillis() - days * 86_400_000L;
            int n = 0;
            for (MigrateJobES job : jobs.values()) {
                if (!terminal(job.getStatus())) {
                    continue;
                }
                Long fin = job.getFinishedAtMs();
                if (fin == null || fin >= cutoff) continue;
                if (scope != null && !scope.test(job)) continue;
                deleted.add(job.getJobId());
                n++;
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("deleted", n);
            return out;
        }

        /** 桩侧终态集合（与 MigrateJobTracker 四个终态常量一致）。 */
        private static boolean terminal(String status) {
            return MigrateJobTracker.STATUS_DONE.equals(status) || MigrateJobTracker.STATUS_FAILED.equals(status)
                    || MigrateJobTracker.STATUS_ABORTED.equals(status)
                    || MigrateJobTracker.STATUS_INTERRUPTED.equals(status);
        }

        @Override
        public Map<String, Object> reconcile(RemoteClusterConn sourceConn, String sourceIndex, String destIndex) {
            lastReconcileConn = sourceConn;
            lastReconcileSource = sourceIndex;
            lastReconcileDest = destIndex;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("sourceIndex", sourceIndex);
            out.put("destIndex", destIndex);
            out.put("sourceCount", 100L);
            out.put("destCount", 98L);
            out.put("diff", 2L);
            return out;
        }
    }

    private static MigrateJobES job(String id, String srcConnId, String status, Long finishedAtMs) {
        MigrateJobES job = new MigrateJobES();
        job.setJobId(id);
        job.setSourceIndex("src-1");
        job.setDestIndex("dest-1");
        job.setSrcConnId(srcConnId);
        job.setStatus(status);
        job.setFinishedAtMs(finishedAtMs);
        return job;
    }

    private static ConnStore connStore() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) {
                RemoteClusterConn conn = new RemoteClusterConn("http", "10.0.0.9", 9200, "legacy", "pw");
                conn.setMinRole("VIEWER");
                return conn;
            }
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
                XmigrateGovernanceControllerTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsolePrincipal viewer(String... grants) {
        return new ConsolePrincipal("u-conn", ConsoleRole.VIEWER, false, true, "连接用户", null,
                new HashSet<>(Arrays.asList(grants)));
    }

    /** 连接模型控制器（pageAuthEnabled=true + conn 授权页集）。 */
    private static CrossClusterMigrateController connModelController(FakeService service) {
        return new CrossClusterMigrateController(service, connStore(),
                new EnvPagesResolver(connStore(), new ESQueryStudioElasticsearchProperties()), true);
    }

    /** 静态模型控制器（pageAuthEnabled=false，全部作业全局可见/可治理）。 */
    private static CrossClusterMigrateController staticController(FakeService service) {
        return new CrossClusterMigrateController(service, connStore(), null, false);
    }

    @Test
    public void 终态作业可删除_返回204() {
        FakeService service = new FakeService();
        service.jobs.put("done-1", job("done-1", "c1", MigrateJobTracker.STATUS_DONE, 1L));
        CrossClusterMigrateController ctrl = staticController(service);
        HttpServletRequest admin = request(new ConsolePrincipal("local", ConsoleRole.ADMIN, false));

        org.springframework.http.ResponseEntity<Void> resp = ctrl.deleteJob("done-1", admin);
        assertEquals(204, resp.getStatusCodeValue());
        assertTrue(service.deleted.contains("done-1"));
    }

    @Test
    public void 运行中作业删除被拒_409语义() {
        FakeService service = new FakeService();
        service.jobs.put("run-1", job("run-1", "c1", MigrateJobTracker.STATUS_RUNNING, null));
        CrossClusterMigrateController ctrl = staticController(service);
        HttpServletRequest admin = request(new ConsolePrincipal("local", ConsoleRole.ADMIN, false));

        try {
            ctrl.deleteJob("run-1", admin);
            fail("运行中作业应拒绝删除");
        } catch (IllegalStateException e) {
            // InternalEsMigrateExceptionAdvice 把 IllegalState 映射为 409 {code,message}
            assertTrue(e.getMessage().contains("仍在运行"));
        }
        assertFalse(service.deleted.contains("run-1"));
    }

    @Test
    public void 按天清理_只删终态且早于截点_olderThanDays非正拒绝() {
        FakeService service = new FakeService();
        long now = System.currentTimeMillis();
        long twoDaysAgo = now - 2L * 86_400_000L;
        service.jobs.put("old-done", job("old-done", "c1", MigrateJobTracker.STATUS_DONE, twoDaysAgo));
        service.jobs.put("old-interrupted", job("old-interrupted", "c1", MigrateJobTracker.STATUS_INTERRUPTED, twoDaysAgo));
        service.jobs.put("fresh-done", job("fresh-done", "c1", MigrateJobTracker.STATUS_DONE, now));
        service.jobs.put("old-running", job("old-running", "c1", MigrateJobTracker.STATUS_RUNNING, twoDaysAgo));
        CrossClusterMigrateController ctrl = staticController(service);
        HttpServletRequest admin = request(new ConsolePrincipal("local", ConsoleRole.ADMIN, false));

        Map<String, Object> out = ctrl.deleteJobs(1, admin);
        assertEquals(2, ((Number) out.get("deleted")).intValue());
        assertTrue(service.deleted.contains("old-done"));
        assertTrue(service.deleted.contains("old-interrupted"));
        assertFalse("近窗口终态不清", service.deleted.contains("fresh-done"));
        assertFalse("非终态不清（即使早于截点）", service.deleted.contains("old-running"));
        assertNull("静态模型不设源连接过滤", service.lastDeleteScope);

        try {
            ctrl.deleteJobs(0, admin);
            fail("olderThanDays<=0 应拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("olderThanDays"));
        }
    }

    @Test
    public void 连接模型按天清理_只清持源连接写键的作业() {
        FakeService service = new FakeService();
        long old = System.currentTimeMillis() - 5L * 86_400_000L;
        service.jobs.put("mine", job("mine", "c1", MigrateJobTracker.STATUS_DONE, old));
        service.jobs.put("others", job("others", "c2", MigrateJobTracker.STATUS_DONE, old));
        CrossClusterMigrateController ctrl = connModelController(service);
        HttpServletRequest c1 = request(viewer("conn:c1:w:xmigrate", "conn:host:w:xmigrate"));

        Map<String, Object> out = ctrl.deleteJobs(1, c1);
        assertEquals(1, ((Number) out.get("deleted")).intValue());
        assertTrue(service.deleted.contains("mine"));
        assertFalse("跨连接作业不可见即不可清", service.deleted.contains("others"));
        assertNotNull(service.lastDeleteScope);
    }

    @Test
    public void reconcile_源档案取密走storedConn_手输旧作业拒绝() {
        FakeService service = new FakeService();
        MigrateJobES withConn = job("rc-1", "c1", MigrateJobTracker.STATUS_DONE, 1L);
        service.jobs.put("rc-1", withConn);
        CrossClusterMigrateController ctrl = connModelController(service);
        HttpServletRequest c1 = request(viewer("conn:c1:w:xmigrate"));

        Map<String, Object> out = ctrl.reconcile("rc-1", c1);
        assertEquals("src-1", out.get("sourceIndex"));
        assertEquals("dest-1", out.get("destIndex"));
        assertEquals(2L, ((Number) out.get("diff")).longValue());
        assertNotNull("源侧必须经档案取密建连", service.lastReconcileConn);
        assertEquals("src-1", service.lastReconcileSource);
        assertEquals("dest-1", service.lastReconcileDest);

        /* 手输连接的旧作业：连接模型 403（requireJobSource 先拦），静态模型 400（显式文案） */
        FakeService manualService = new FakeService();
        manualService.jobs.put("rc-2", job("rc-2", null, MigrateJobTracker.STATUS_DONE, 1L));
        CrossClusterMigrateController connCtrl = connModelController(manualService);
        try {
            connCtrl.reconcile("rc-2", c1);
            fail("连接模型下手输旧作业应 403");
        } catch (org.springframework.web.server.ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }
        CrossClusterMigrateController staticCtrl = staticController(manualService);
        HttpServletRequest admin = request(new ConsolePrincipal("local", ConsoleRole.ADMIN, false));
        try {
            staticCtrl.reconcile("rc-2", admin);
            fail("无源连接档案的旧作业应拒绝对账");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("未记录源连接档案"));
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void conflicts_结构化样本分页_旧文档纯id清单兜底() {
        FakeService service = new FakeService();
        MigrateJobES partial = job("cf-1", "c1", MigrateJobTracker.STATUS_DONE, 1L);
        partial.setConflicts(1200L);
        partial.setConflictSamples(new ArrayList<>(Arrays.asList("id-1", "id-2", "id-3")));
        service.jobs.put("cf-1", partial);
        MigrateJobES none = job("cf-2", "c1", MigrateJobTracker.STATUS_DONE, 1L);
        service.jobs.put("cf-2", none);
        CrossClusterMigrateController ctrl = connModelController(service);
        HttpServletRequest c1 = request(viewer("conn:c1:w:xmigrate"));

        Map<String, Object> out = ctrl.conflicts("cf-1", null, 2, c1);
        assertEquals("cf-1", out.get("jobId"));
        List<Map<String, Object>> page = (List<Map<String, Object>>) out.get("samples");
        assertEquals("旧版纯 _id 清单兜底（无时间戳键）", 2, page.size());
        assertEquals("id-1", page.get(0).get("_id"));
        assertEquals("2", out.get("nextCursor"));
        assertEquals("total 为冲突全量计数（环上限外的如实计数）",
                1200L, ((Number) out.get("total")).longValue());

        Map<String, Object> tail = ctrl.conflicts("cf-1", "2", 100, c1);
        assertEquals(1, ((List<?>) tail.get("samples")).size());
        assertNull("翻完即 null", tail.get("nextCursor"));

        Map<String, Object> clean = ctrl.conflicts("cf-2", null, 100, c1);
        assertEquals(0, ((List<?>) clean.get("samples")).size());
        assertNull(clean.get("nextCursor"));
        assertEquals("无冲突如实 0", 0L, ((Number) clean.get("total")).longValue());
    }
}
