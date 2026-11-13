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

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLockStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * target-aware adhoc 轮：异步执行、abort 与锁全部按 job 目标运转的端到端矩阵。
 *
 * <p>路由观测：RecordingRouter 覆写 {@code clientFor} 记录「谁在哪个线程被路由到哪」——
 * worker 线程（池化，无 HTTP 上下文）上仍出现 {@code conn-a} 即证明 job 目标贯穿异步执行；
 * 低层 perform 在目标 client 上拿到桩（无 lowLevelClient）会 NPE 让作业 FAILED，
 * 该失败<b>是预期的观测终点</b>：到达它必然先经过正确的路由。</p>
 */
public class AdhocTargetExecutionTest {

    private RecordingRouter router;
    private Map<String, RemoteClusterConn> conns;
    private RecordingAdmin admin;
    private RecordingLockStore locks;
    private InMemoryAdhocJobStore store;

    @Before
    public void setUp() {
        conns = new HashMap<>();
        conns.put("conn-a", conn());
        conns.put("conn-b", conn());
        router = new RecordingRouter(conns);
        admin = new RecordingAdmin();
        locks = new RecordingLockStore();
        store = new InMemoryAdhocJobStore();
        router.clear();
    }

    @After
    public void tearDown() {
        router.clear();
    }

    /* ---------------- 桩设施 ---------------- */

    private static RemoteClusterConn conn() {
        RemoteClusterConn c = new RemoteClusterConn();
        c.setHost("es.example.com");
        c.setPort(9200);
        c.setMinRole("VIEWER");
        return c;
    }

    /** 记录 clientFor 调用（目标 + 线程名）的路由器。 */
    private static class RecordingRouter extends EsClientRouter {
        final List<String> routed = new CopyOnWriteArrayList<>();

        RecordingRouter(Map<String, RemoteClusterConn> conns) {
            super(() -> stubClient(), fakeConns(conns), new RemoteEsClientFactory(100, 100) {
                @Override
                public RestHighLevelClient build(RemoteClusterConn c) {
                    return stubClient();
                }
            });
        }

        @Override
        public RestHighLevelClient clientFor(String connId) {
            routed.add("clientFor:" + connId + "@" + Thread.currentThread().getName());
            return super.clientFor(connId);
        }

        @Override
        public RestHighLevelClient current() {
            routed.add("current:" + currentTarget() + "@" + Thread.currentThread().getName());
            return super.current();
        }
    }

    /** 指向必拒端口的桩 client：任何真实 REST 都会即刻连接失败（观测终点，见类注释）。 */
    private static RestHighLevelClient stubClient() {
        return new RestHighLevelClient(
                org.elasticsearch.client.RestClient.builder(new org.apache.http.HttpHost("localhost", 1))) {
        };
    }

    private static ConnStore fakeConns(Map<String, RemoteClusterConn> conns) {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return conns.get(id); }
            @Override public String getName(String id) { return conns.containsKey(id) ? "conn-" + id : null; }
            @Override public String getVersion(String id) { return conns.containsKey(id) ? "6.7.2" : null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                                                     String password, String minRole, Integer connectTimeoutMs,
                                                     Integer socketTimeoutMs, String env) {
                return new HashMap<>();
            }
            @Override public void updateVersion(String id, String esVersion) { }
            @Override public void delete(String id) { conns.remove(id); }
        };
    }

    /** 别名模式可走通的最小 admin；记录被调方法以便断言「未执行任何 ES 操作」。 */
    private static class RecordingAdmin extends EsIndexAdmin {
        final List<String> calls = new CopyOnWriteArrayList<>();

        RecordingAdmin() {
            super(null);
        }

        private void rec(String m) {
            calls.add(m + "@" + Thread.currentThread().getName());
        }

        @Override
        public boolean aliasExists(String alias) throws IOException {
            rec("aliasExists");
            return true;
        }

        @Override
        public String getWriteIndex(String alias) throws IOException {
            rec("getWriteIndex");
            return "src_idx";
        }

        @Override
        public boolean indexExists(String index) throws IOException {
            rec("indexExists");
            return false;
        }

        @Override
        public String getMapping(String index) throws IOException {
            rec("getMapping");
            return "{\"properties\":{}}";
        }

        @Override
        public void createIndex(String index, String settingsJson, String mappingJson) throws IOException {
            rec("createIndex:" + index);
        }
    }

    /** 只记 key 的锁桩：tryAcquire 恒成功（host 拒绝场景单独构造）。 */
    private static class RecordingLockStore implements RebuildLockStore {
        final List<String> acquired = new CopyOnWriteArrayList<>();
        final List<String> released = new CopyOnWriteArrayList<>();
        volatile String rejectKey;

        @Override
        public boolean tryAcquire(String indexKey, long leaseMs) {
            acquired.add(indexKey);
            return !indexKey.equals(rejectKey);
        }

        @Override
        public boolean renew(String indexKey, long leaseMs) {
            return true;
        }

        @Override
        public void release(String indexKey) {
            released.add(indexKey);
        }

        @Override
        public void forceRelease(String indexKey) {
        }

        @Override
        public io.github.dengmeiluan.esquerystudio.console.lock.RebuildLock get(String indexKey) {
            return null;
        }

        @Override
        public String owner() {
            return "pid1@hostA";
        }
    }

    private AdhocRebuildService service() {
        return new AdhocRebuildService(admin, () -> null, 60_000L, locks, 60_000L, store, router, fakeConns(conns));
    }

    private static Map<String, Object> manualReq() {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("index", "logical");
        req.put("strategy", "MANUAL");
        req.put("settingsJson", "{\"index\":{}}");
        req.put("mappingJson", "{\"properties\":{}}");
        return req;
    }

    private static Map<String, Object> awaitDone(AdhocRebuildService svc, String jobId) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 15_000L;
        while (System.currentTimeMillis() < deadline) {
            Map<String, Object> m = svc.status(jobId);
            if (!"RUNNING".equals(m.get("status"))) {
                return m;
            }
            Thread.sleep(50L);
        }
        throw new AssertionError("job 未在 15s 内结束: " + jobId);
    }

    /* ---------------- 矩阵 ---------------- */

    @Test
    public void startCapturesTargetAndWorkerRunsOnIt() throws Exception {
        router.bind("conn-a"); // 模拟 interceptor 的数据面绑定
        AdhocRebuildService svc = service();
        Map<String, Object> out = svc.start(manualReq());
        String jobId = String.valueOf(out.get("jobId"));
        Map<String, Object> job = (Map<String, Object>) out.get("job");
        assertThat(job.get("targetId")).isEqualTo("conn-a");
        assertThat(job.get("targetName")).isEqualTo("conn-conn-a");
        assertThat(job.get("targetEsVersion")).isEqualTo("6.7.2");

        Map<String, Object> done = awaitDone(svc, jobId);
        assertThat(done.get("targetId")).isEqualTo("conn-a");
        // worker 线程上仍出现 conn-a：异步执行真正贯穿 job 目标（而非仅请求线程）
        assertThat(router.routed.stream().anyMatch(e -> e.startsWith("clientFor:conn-a@es-adhoc-rebuild")))
                .as("worker 线程必须路由到 job 目标: %s", router.routed).isTrue();
        // 锁按 target::logical 隔离且收尾释放
        assertThat(locks.acquired).contains("conn-a::logical");
        assertThat(locks.released).contains("conn-a::logical");
        // start 后任意切换当前绑定不影响已捕获目标
        router.bind("conn-b");
        assertThat(svc.status(jobId).get("targetId")).isEqualTo("conn-a");
        assertThat(router.routed.stream().noneMatch(e -> e.contains("conn-b@es-adhoc-rebuild"))).isTrue();
    }

    @Test
    public void differentTargetSameIndexDoesNotConflictOnLock() throws Exception {
        // conn-a 的同名索引锁被他人持有：拒绝
        locks.rejectKey = "conn-a::logical";
        router.bind("conn-a");
        AdhocRebuildService svc = service();
        Throwable t1 = catchThrowable(() -> svc.start(manualReq()));
        assertThat(t1).isInstanceOf(IllegalStateException.class).hasMessageContaining("conn-a");

        // conn-b 的同名索引是另一个重建对象：放行
        router.bind("conn-b");
        Map<String, Object> out = svc.start(manualReq());
        assertThat(((Map<String, Object>) out.get("job")).get("targetId")).isEqualTo("conn-b");
        assertThat(locks.acquired).containsExactly("conn-a::logical", "conn-b::logical");
        awaitDone(svc, String.valueOf(out.get("jobId")));
    }

    @Test
    public void missingTargetFailsClosedWithoutAnyEsOp() throws Exception {
        router.bind("conn-gone"); // connStore 里没有 conn-gone
        AdhocRebuildService svc = service();
        Map<String, Object> out = svc.start(manualReq());
        String jobId = String.valueOf(out.get("jobId"));
        Map<String, Object> done = awaitDone(svc, jobId);
        assertThat(done.get("status")).isEqualTo("FAILED");
        assertThat(String.valueOf(done.get("error"))).contains("TARGET_UNAVAILABLE").contains("conn-gone");
        // fail closed：worker 线程上零路由、零 admin 调用（start 阶段的探测除外）
        assertThat(router.routed.stream().noneMatch(e -> e.contains("@es-adhoc-rebuild"))).isTrue();
        assertThat(admin.calls.stream().noneMatch(c -> c.endsWith("@es-adhoc-rebuild"))).isTrue();
        // 锁已还，不留死锁
        assertThat(locks.released).contains("conn-gone::logical");
    }

    @Test
    public void abortCancelsTaskOnJobTargetNotCurrentThread() throws Exception {
        // 预置一个历史作业（模拟重启后从 store 回读）：目标 conn-a、带运行中 task
        AdhocRebuildJob j = AdhocRebuildJob.minimal("job-ab");
        j.restoreTarget("conn-a", "QA", "6.7.2");
        j.setStatus("RUNNING");
        j.setCurrentTaskId("task-9");
        store.save(j);
        // 当前线程绑定另一个目标——abort 仍必须按 job 目标路由
        router.bind("conn-b");
        AdhocRebuildService svc = service();
        Map<String, Object> m = svc.abort("job-ab");
        assertThat(m.get("targetId")).isEqualTo("conn-a");
        assertThat(router.routed.stream()
                .anyMatch(e -> e.startsWith("clientFor:conn-a@" + Thread.currentThread().getName())))
                .as("abort 的 task cancel 必须路由到 job 目标 conn-a: %s", router.routed).isTrue();
        assertThat(router.routed.stream().noneMatch(e -> e.contains("clientFor:conn-b"))).isTrue();
    }
}
