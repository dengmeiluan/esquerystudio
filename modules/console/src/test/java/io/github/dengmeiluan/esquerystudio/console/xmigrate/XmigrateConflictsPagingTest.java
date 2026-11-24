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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.web.CrossClusterMigrateController;
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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 冲突样本分页契约：{_id,ts} 结构样本、cursor 末位偏移翻页、nextCursor 终点 null、
 * total 为冲突全量计数、limit 缺省 100；旧版作业（纯 _id 清单）无时间戳兜底分页。
 * 2026-11-21 兼容计划批。
 */
public class XmigrateConflictsPagingTest {

    private static List<Map<String, Object>> ring(int n) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            Map<String, Object> sample = new LinkedHashMap<>();
            sample.put("_id", "doc-" + i);
            sample.put("ts", 1_000L + i);
            out.add(sample);
        }
        return out;
    }

    /* ───────── 纯分页函数 ───────── */

    @Test
    @SuppressWarnings("unchecked")
    public void 首页与续页_游标为末位偏移() {
        Map<String, Object> page1 = CrossClusterMigrateService.conflictsPage(ring(5), 42L, "", 2);
        List<Map<String, Object>> samples1 = (List<Map<String, Object>>) page1.get("samples");
        assertEquals(2, samples1.size());
        assertEquals("doc-0", samples1.get(0).get("_id"));
        assertEquals(1000L, ((Number) samples1.get(0).get("ts")).longValue());
        assertEquals("nextCursor=本页末位偏移", "2", page1.get("nextCursor"));
        assertEquals("total=冲突全量计数", 42L, ((Number) page1.get("total")).longValue());

        Map<String, Object> page3 = CrossClusterMigrateService.conflictsPage(ring(5), 42L, "4", 100);
        List<Map<String, Object>> samples3 = (List<Map<String, Object>>) page3.get("samples");
        assertEquals(1, samples3.size());
        assertEquals("doc-4", samples3.get(0).get("_id"));
        assertNull("翻完即 null", page3.get("nextCursor"));
    }

    @Test
    public void limit缺省与越界钳制() {
        assertEquals("limit<=0 取 100", 100,
                ((List<?>) CrossClusterMigrateService.conflictsPage(ring(200), 500L, "", 0)
                        .get("samples")).size());
        assertEquals("limit 上限 1000", 1000,
                ((List<?>) CrossClusterMigrateService.conflictsPage(ring(1200), 5000L, "", 5000)
                        .get("samples")).size());
    }

    @Test
    public void 游标越过环尾时如实空页() {
        Map<String, Object> page = CrossClusterMigrateService.conflictsPage(ring(3), 9L, "99", 100);
        assertTrue(((List<?>) page.get("samples")).isEmpty());
        assertNull(page.get("nextCursor"));
        assertEquals(9L, ((Number) page.get("total")).longValue());
    }

    @Test
    public void 空环与null环安全() {
        Map<String, Object> empty = CrossClusterMigrateService.conflictsPage(null, 0L, "", 100);
        assertTrue(((List<?>) empty.get("samples")).isEmpty());
        assertNull(empty.get("nextCursor"));
        assertEquals(0L, ((Number) empty.get("total")).longValue());
    }

    /* ───────── REST 端点（结构化样本 + 旧文档兜底 + 授权） ───────── */

    private static class FakeService extends CrossClusterMigrateService {
        final Map<String, MigrateJobES> jobs = new LinkedHashMap<>();

        FakeService() {
            super(null, null, null, null, null, null, null, null, null);
        }

        @Override
        public MigrateJobES progress(String jobId) {
            MigrateJobES job = jobs.get(jobId);
            if (job == null) {
                throw new IllegalArgumentException("作业不存在: " + jobId);
            }
            return job;
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void REST分页端点_结构化样本与旧文档兜底() {
        FakeService service = new FakeService();
        MigrateJobES job = new MigrateJobES();
        job.setJobId("j-cf");
        job.setSrcConnId("c1");
        job.setConflicts(7L);
        job.setConflictEvents(ring(3));
        service.jobs.put("j-cf", job);

        MigrateJobES legacy = new MigrateJobES();
        legacy.setJobId("j-legacy");
        legacy.setSrcConnId("c1");
        legacy.setConflicts(2L);
        legacy.setConflictSamples(new ArrayList<>(Arrays.asList("old-1", "old-2")));
        service.jobs.put("j-legacy", legacy);

        CrossClusterMigrateController ctrl = controller(service);
        HttpServletRequest c1 = request(viewer("conn:c1:w:xmigrate"));

        Map<String, Object> page = ctrl.conflicts("j-cf", "", 2, c1);
        assertEquals("j-cf", page.get("jobId"));
        List<Map<String, Object>> samples = (List<Map<String, Object>>) page.get("samples");
        assertEquals(2, samples.size());
        assertEquals("doc-0", samples.get(0).get("_id"));
        assertEquals("2", page.get("nextCursor"));
        assertEquals(7L, ((Number) page.get("total")).longValue());

        Map<String, Object> tail = ctrl.conflicts("j-cf", "2", 100, c1);
        assertEquals(1, ((List<?>) tail.get("samples")).size());
        assertNull(tail.get("nextCursor"));

        Map<String, Object> legacyPage = ctrl.conflicts("j-legacy", "", 100, c1);
        List<Map<String, Object>> legacySamples = (List<Map<String, Object>>) legacyPage.get("samples");
        assertEquals("旧版纯 _id 清单兜底分页", 2, legacySamples.size());
        assertEquals("old-1", legacySamples.get(0).get("_id"));
        assertTrue("旧样本无时间戳（键缺席）", !legacySamples.get(0).containsKey("ts"));

        try {
            ctrl.conflicts("j-cf", "", 100, request(viewer("conn:c2:w:xmigrate")));
            fail("非源连接写键持有人必须 403");
        } catch (org.springframework.web.server.ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }
    }

    /* ───────── 桩与工具 ───────── */

    private static CrossClusterMigrateController controller(FakeService service) {
        return new CrossClusterMigrateController(service, connStore(),
                new EnvPagesResolver(connStore(), new ESQueryStudioElasticsearchProperties()), true);
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
                XmigrateConflictsPagingTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsolePrincipal viewer(String... grants) {
        return new ConsolePrincipal("u-conn", ConsoleRole.VIEWER, false, true, "连接用户", null,
                new HashSet<>(Arrays.asList(grants)));
    }
}
