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
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 迁移作业事件环契约：{ts,stage,message,level} 结构、容量 200 截断最旧、随 toJobEs 快照持久化；
 * events 查询活句柄优先、无运行态回放持久化快照；REST 端点沿用作业源连接授权面。
 * 2026-11-21 兼容计划批。
 */
public class XmigrateEventsTest {

    /* ───────── 事件环本体 ───────── */

    @Test
    public void 事件结构与缺省level() {
        MigrationHandle handle = new MigrationHandle("j-1", null, null, new MigrateJobES(), 1500L);
        handle.addEvent("connect", "info", "源集群连通自检通过");
        handle.addEvent("conflict", "warn", "slice 0 首次遇到 409 冲突");
        handle.addEvent("final", null, "终态 DONE"); // level 缺省归一 info
        List<Map<String, Object>> events = handle.snapshotEvents();
        assertEquals(3, events.size());
        for (Map<String, Object> event : events) {
            assertTrue("恒含 ts", event.get("ts") instanceof Long);
        }
        assertEquals("connect", events.get(0).get("stage"));
        assertEquals("info", events.get(0).get("level"));
        assertEquals("warn", events.get(1).get("level"));
        assertEquals("level 缺省归一 info", "info", events.get(2).get("level"));
        assertEquals("ts 升序", true,
                ((Long) events.get(0).get("ts")) <= ((Long) events.get(1).get("ts")));
    }

    @Test
    public void 容量200截断最旧() {
        MigrationHandle handle = new MigrationHandle("j-2", null, null, new MigrateJobES(), 1500L);
        for (int i = 0; i < MigrationHandle.MAX_EVENTS + 5; i++) {
            handle.addEvent("stage-" + i, "info", "m-" + i);
        }
        List<Map<String, Object>> events = handle.snapshotEvents();
        assertEquals(MigrationHandle.MAX_EVENTS, events.size());
        assertEquals("最旧的 5 条被移除", "stage-5", events.get(0).get("stage"));
        assertEquals("stage-" + (MigrationHandle.MAX_EVENTS + 4),
                events.get(events.size() - 1).get("stage"));
    }

    @Test
    public void 事件随快照持久化与resume还原() {
        MigrationHandle handle = new MigrationHandle("j-3", null, null, new MigrateJobES(), 1500L);
        handle.addEvent("connect", "info", "a");
        handle.addEvent("start", "info", "b");
        List<Map<String, Object>> persisted = handle.toJobEs().getEvents();
        assertEquals("toJobEs 携带事件环快照", 2, persisted.size());

        MigrationHandle resumed = new MigrationHandle("j-3", null, null, new MigrateJobES(), 1500L);
        resumed.restoreEvents(persisted);
        resumed.addEvent("start", "info", "resume 续跑");
        assertEquals("resume 后历史事件跨轮保留", 3, resumed.snapshotEvents().size());
        assertEquals("a", resumed.snapshotEvents().get(0).get("message"));
    }

    /* ───────── 查询：活句柄优先 / 回放持久化快照 ───────── */

    @Test
    public void events活句柄优先_无运行态回放持久化() {
        RunningMigrations running = new RunningMigrations();
        MigrateJobES persisted = new MigrateJobES();
        persisted.setJobId("j-4");
        List<Map<String, Object>> stored = new ArrayList<>();
        Map<String, Object> storedEvent = new LinkedHashMap<>();
        storedEvent.put("ts", 1L);
        storedEvent.put("stage", "final");
        storedEvent.put("message", "终态 DONE");
        storedEvent.put("level", "info");
        stored.add(storedEvent);
        persisted.setEvents(stored);
        CrossClusterMigrateService svc = new CrossClusterMigrateService(null, null, null,
                new MigrateJobTracker(new MigrateJobStore(() -> null, "idx") {
                    @Override
                    public MigrateJobES findById(String jobId) {
                        return persisted;
                    }
                }), running, null, null, null, null);

        Map<String, Object> replay = svc.events("j-4");
        assertEquals("无运行态读持久化快照", 1, ((List<?>) replay.get("events")).size());

        MigrationHandle live = new MigrationHandle("j-4", null, null, new MigrateJobES(), 1500L);
        live.addEvent("slice-start", "info", "slice 0 开始搬运");
        running.register(live);
        Map<String, Object> liveView = svc.events("j-4");
        List<?> liveEvents = (List<?>) liveView.get("events");
        assertEquals("运行中读活句柄事件环", 1, liveEvents.size());
        assertEquals("slice-start", ((Map<?, ?>) liveEvents.get(0)).get("stage"));
        running.remove("j-4");
    }

    @Test
    public void events作业不存在报错() {
        CrossClusterMigrateService svc = new CrossClusterMigrateService(null, null, null,
                new MigrateJobTracker(new MigrateJobStore(() -> null, "idx") {
                    @Override
                    public MigrateJobES findById(String jobId) {
                        return null;
                    }
                }), new RunningMigrations(), null, null, null, null);
        try {
            svc.events("nope");
            fail("作业不存在必须报错");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("作业不存在"));
        }
    }

    /* ───────── REST 端点 ───────── */

    /** 桩服务：progress 按 id 回放作业，events 返回固定时间线（验证授权与透传）。 */
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

        @Override
        public Map<String, Object> events(String jobId) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("jobId", jobId);
            out.put("events", Collections.singletonList(event(9L, "final", "终态 DONE", "info")));
            return out;
        }
    }

    @Test
    @SuppressWarnings("unchecked")
    public void REST事件端点_源连接授权面与时间线透传() {
        FakeService service = new FakeService();
        MigrateJobES job = new MigrateJobES();
        job.setJobId("j-rest");
        job.setSrcConnId("c1");
        service.jobs.put("j-rest", job);
        CrossClusterMigrateController ctrl = controller(service);

        HttpServletRequest c1 = request(viewer("conn:c1:w:xmigrate"));
        Map<String, Object> out = ctrl.events("j-rest", c1);
        assertEquals("j-rest", out.get("jobId"));
        List<Map<String, Object>> events = (List<Map<String, Object>>) out.get("events");
        assertEquals(1, events.size());
        assertEquals("final", events.get(0).get("stage"));
        assertEquals("info", events.get(0).get("level"));

        try {
            ctrl.events("j-rest", request(viewer("conn:c2:w:xmigrate")));
            fail("非作业源连接写键持有人必须 403");
        } catch (org.springframework.web.server.ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }
    }

    private static Map<String, Object> event(long ts, String stage, String message, String level) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ts", ts);
        out.put("stage", stage);
        out.put("message", message);
        out.put("level", level);
        return out;
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
                XmigrateEventsTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsolePrincipal viewer(String... grants) {
        return new ConsolePrincipal("u-conn", ConsoleRole.VIEWER, false, true, "连接用户", null,
                new HashSet<>(Arrays.asList(grants)));
    }
}
