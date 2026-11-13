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

package io.github.dengmeiluan.esquerystudio.console.observability;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.dengmeiluan.esquerystudio.console.adhoc.AdhocRebuildJob;
import io.github.dengmeiluan.esquerystudio.console.adhoc.AdhocRebuildService;
import io.github.dengmeiluan.esquerystudio.console.client.EsWriteRetryTemplate;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexRebuildService;
import io.github.dengmeiluan.esquerystudio.console.lock.EsRebuildLockStore;
import io.github.dengmeiluan.esquerystudio.console.lock.LockDocPort;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLock;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLockStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClusterConnController;
import io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 轨5【错误码四件 + 高频日志节流三件】（Observability561b 范式：Logback
 * ListAppender 直挂 logger 断言事件；AtomicLong 节流窗口经反射倒拨驱动窗口尾汇总）。
 *
 * <ol>
 *   <li>P1 InternalEsIndexRebuildController 四处 200-with-{error:true,message} 错误体补
 *       code（INDEX_EXISTS / INDEX_NOT_FOUND x2 / BAD_REQUEST）+ endpoint 键——additive：
 *       error:true 既有键保留（前端 api.ts 200-with-error 分支零破坏），走 EsErrorMapper.body
 *       同口径；签名零改动（ClusterForceMergeWiringTest 反射锁 clusterForceMerge 两参），
 *       endpoint 经 RequestContextHolder 取当前请求，无上下文（单测/非 web 线程）宁缺勿炸。</li>
 *   <li>P1 EsClusterConnController.probe 探活禁用体补 code="PROBE_DISABLED"+endpoint。
 *       裁决：{@code error} 字段保留 string 只 additive——前端 ConnHealth.error 契约是
 *       {@code string | null}，ClusterSwitcher.probeConn 直接渲染「探活失败：${h.error}」，
 *       改 boolean 信封会破前端消费。</li>
 *   <li>P1 EsWriteRetryTemplate 每次 attempt WARN 按 action 键 60s 节流（MigrateJobTracker.save
 *       范式平移：窗口首条全量，窗口内仅累计，窗口尾汇总「xN」一条）；不同 action 键不共享窗口。</li>
 *   <li>P1 AdhocRebuildService renewLockOrLose 两处 ERROR（renew 失败/续约校验异常）60s
 *       单键节流：首条带栈保留，窗口内静默，窗口尾先汇总再落本窗首条。</li>
 *   <li>P1 EsRebuildLockStore renew I/O 失败 WARN 60s 单键节流（同范式）；renew 返回
 *       false 契约不受节流影响。</li>
 * </ol>
 *
 * @author aicoding
 */
public class Observability562Test {

    /* ── 通用：ListAppender 挂/卸（Observability561b 同款） ── */

    private static ListAppender<ILoggingEvent> attach(Class<?> loggerClass) {
        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        appender.start();
        Logger l = (Logger) LoggerFactory.getLogger(loggerClass);
        l.addAppender(appender);
        return appender;
    }

    private static void detach(Class<?> loggerClass, ListAppender<ILoggingEvent> appender) {
        ((Logger) LoggerFactory.getLogger(loggerClass)).detachAppender(appender);
    }

    private static long countAll(ListAppender<ILoggingEvent> appender, Level level) {
        return appender.list.stream().filter(e -> e.getLevel() == level).count();
    }

    private static AtomicLong atomicOf(Class<?> owner, String name, Object instance) throws Exception {
        Field f = owner.getDeclaredField(name);
        f.setAccessible(true);
        return (AtomicLong) f.get(instance);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, AtomicLong> throttleMapOf(Class<?> owner, String name, Object instance) throws Exception {
        Field f = owner.getDeclaredField(name);
        f.setAccessible(true);
        return (Map<String, AtomicLong>) f.get(instance);
    }

    /** 绑定伪请求上下文（561b bindRequest 同款：只回 method/requestURI）。 */
    private static void bindRequest(final String method, final String uri) {
        HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(
                Observability562Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (p, m, a) -> {
                    String name = m.getName();
                    if ("getMethod".equals(name)) return method;
                    if ("getRequestURI".equals(name)) return uri;
                    return null;
                });
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
    }

    /* ══ 第 1 件：InternalEsIndexRebuildController 四处错误体补 code+endpoint ══ */

    /** resolveToPhysical 直通桩（registry=null → 解析未命中按原名返回），controller 只需它不抛。 */
    private static EsIndexRebuildService passthroughService() {
        return new EsIndexRebuildService(null, null, null, null, null);
    }

    /** indexExists 可编排的 admin 桩（EsIndexAdmin 方法可覆写，AdhocRebuildLockTest 同款 super(null)）。 */
    private static EsIndexAdmin admin(final boolean exists) {
        return new EsIndexAdmin(null) {
            @Override public boolean indexExists(String index) { return exists; }
            @Override public void createIndex(String index, String settingsJson, String mappingJson) { }
            @Override public void deleteIndex(String index) { }
            @Override public Map<String, Object> forceMerge(String index, int maxNumSegments) {
                Map<String, Object> r = new java.util.HashMap<String, Object>();
                r.put("task", "task-562");
                return r;
            }
        };
    }

    /** create-index 已存在：错误体补 code=INDEX_EXISTS + endpoint（error:true 既有键保留）。 */
    @Test
    public void createIndexExistsCarriesIndexExistsCodeAndEndpoint() throws IOException {
        bindRequest("POST", "/internal/es/index/cluster/create-index");
        try {
            InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(passthroughService(), admin(true));
            Map<String, Object> out = c.createIndex("idx562", null);
            assertEquals(Boolean.TRUE, out.get("error"));
            assertEquals("INDEX_EXISTS", out.get("code"));
            assertTrue(out.get("message").toString().contains("idx562"));
            assertEquals("POST /internal/es/index/cluster/create-index", out.get("endpoint"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    /** delete-index 不存在：code=INDEX_NOT_FOUND。 */
    @Test
    public void deleteIndexMissingCarriesIndexNotFoundCode() throws IOException {
        bindRequest("POST", "/internal/es/index/cluster/delete-index");
        try {
            InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(passthroughService(), admin(false));
            Map<String, Object> out = c.deleteIndex("nope562");
            assertEquals(Boolean.TRUE, out.get("error"));
            assertEquals("INDEX_NOT_FOUND", out.get("code"));
            assertEquals("POST /internal/es/index/cluster/delete-index", out.get("endpoint"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    /** force-merge 索引不存在：code=INDEX_NOT_FOUND。 */
    @Test
    public void forceMergeMissingIndexCarriesIndexNotFoundCode() throws IOException {
        bindRequest("POST", "/internal/es/index/cluster/force-merge");
        try {
            InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(passthroughService(), admin(false));
            Map<String, Object> out = c.clusterForceMerge("nope562", 3);
            assertEquals(Boolean.TRUE, out.get("error"));
            assertEquals("INDEX_NOT_FOUND", out.get("code"));
            assertEquals("POST /internal/es/index/cluster/force-merge", out.get("endpoint"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    /** force-merge maxSegments 非法：code=BAD_REQUEST。 */
    @Test
    public void forceMergeIllegalMaxSegmentsCarriesBadRequestCode() throws IOException {
        bindRequest("POST", "/internal/es/index/cluster/force-merge");
        try {
            InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(passthroughService(), admin(true));
            Map<String, Object> out = c.clusterForceMerge("idx562", 0);
            assertEquals(Boolean.TRUE, out.get("error"));
            assertEquals("BAD_REQUEST", out.get("code"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    /** 无请求上下文（单测/非 web 线程）：宁缺勿炸，endpoint 键不输出（561b 同款零破坏）。 */
    @Test
    public void errorBodyWithoutRequestContextOmitsEndpointKey() throws IOException {
        assertTrue("前置：确无残留请求上下文", RequestContextHolder.getRequestAttributes() == null);
        InternalEsIndexRebuildController c = new InternalEsIndexRebuildController(passthroughService(), admin(true));
        Map<String, Object> out = c.createIndex("idx562", null);
        assertEquals("INDEX_EXISTS", out.get("code"));
        assertFalse("无上下文时不得输出 endpoint 键（null 值键也不留）", out.containsKey("endpoint"));
    }

    /* ══ 第 2 件：probe 探活禁用体补 PROBE_DISABLED（error 保 string 的裁决钉住） ══ */

    /** 禁用体：status=UNKNOWN 既有键保留，补 code=PROBE_DISABLED + endpoint。 */
    @Test
    public void probeDisabledCarriesProbeDisabledCodeAndEndpoint() {
        bindRequest("POST", "/internal/es/index/clusters/c562/probe");
        try {
            EsClusterConnController c = new EsClusterConnController(null, null, null, null);
            Map<String, Object> out = c.probe("c562");
            assertEquals("UNKNOWN", out.get("status"));
            assertEquals("PROBE_DISABLED", out.get("code"));
            assertEquals("POST /internal/es/index/clusters/c562/probe", out.get("endpoint"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    /** 裁决钉子：error 字段保留 string——前端 ConnHealth.error: string|null 与
     *  ClusterSwitcher.probeConn「探活失败：${h.error}」直接消费该文案，改 boolean 信封会破展示。 */
    @Test
    public void probeDisabledErrorStaysStringMessage() {
        EsClusterConnController c = new EsClusterConnController(null, null, null, null);
        Map<String, Object> out = c.probe("c562");
        assertTrue("error 必须仍是 string 文案（前端直接渲染）", out.get("error") instanceof String);
        assertEquals("PROBE_DISABLED", out.get("code"));
    }

    /* ══ 第 3 件：EsWriteRetryTemplate 重试 WARN 按 action 键 60s 节流 ══ */

    private static EsWriteRetryTemplate retryTemplate() {
        ESQueryStudioElasticsearchProperties.Retry retry = new ESQueryStudioElasticsearchProperties.Retry();
        retry.setMaxAttempts(6);        // 6 次总尝试 = 每次调用 5 条重试 WARN（节流前）
        retry.setInitBackoffMs(1L);     // 退避压到 1ms，测试毫秒级
        retry.setMaxBackoffMs(1L);
        return new EsWriteRetryTemplate(retry);
    }

    /** 一次 execute 全程可重试失败（ConnectException 命中网络抖动臂），重试耗尽照常抛。 */
    private static void failingExecute(EsWriteRetryTemplate tpl, String action) {
        try {
            tpl.execute(action, () -> { throw new java.net.ConnectException("conn refused 562"); });
        } catch (RuntimeException expected) {
            /* 节流只动日志，重试耗尽抛出契约不变 */
        }
    }

    /** 同窗口连续失败（5 次调用 x 5 次重试 WARN = 25 条）只落 1 条；窗口尾先汇总 x25 再落本窗首条。 */
    @Test
    public void retryWarnThrottledPerWindowAndAggregatesOnClose() throws Exception {
        Class<?> owner = EsWriteRetryTemplate.class;
        EsWriteRetryTemplate tpl = retryTemplate();
        ListAppender<ILoggingEvent> appender = attach(owner);
        try {
            for (int i = 0; i < 5; i++) {
                failingExecute(tpl, "bulk562");
            }
            assertEquals("同窗口 25 次可重试失败只落 1 条 WARN（逐条刷屏根治）",
                    1, countAll(appender, Level.WARN));
            assertTrue("首条全量（带 action 定位）",
                    appender.list.get(0).getFormattedMessage().contains("action=bulk562"));

            throttleMapOf(owner, "lastRetryWarnAt", tpl).get("bulk562").set(System.currentTimeMillis() - 61_000);
            failingExecute(tpl, "bulk562"); // 窗口 2 首败：先汇总上一窗累计再落首条

            assertEquals("总 3 条：窗口1首条 + 窗口尾汇总 + 窗口2首条", 3, countAll(appender, Level.WARN));
            assertTrue("汇总条带累计数", appender.list.get(1).getFormattedMessage().contains("x25"));
            assertTrue("窗口2首条仍全量", appender.list.get(2).getFormattedMessage().contains("action=bulk562"));
        } finally {
            detach(owner, appender);
        }
    }

    /** 不同 action 键不共享窗口：A 键开窗不吞 B 键首条。 */
    @Test
    public void retryWarnKeysArePerAction() throws Exception {
        Class<?> owner = EsWriteRetryTemplate.class;
        EsWriteRetryTemplate tpl = retryTemplate();
        ListAppender<ILoggingEvent> appender = attach(owner);
        try {
            failingExecute(tpl, "act-a");
            failingExecute(tpl, "act-b");
            assertEquals("两个 action 各落 1 条（A 的窗口不吞 B 首条）", 2, countAll(appender, Level.WARN));
            assertTrue(appender.list.get(1).getFormattedMessage().contains("action=act-b"));
        } finally {
            detach(owner, appender);
        }
    }

    /* ══ 第 4 件：AdhocRebuildService renewLockOrLose 两处 ERROR 60s 单键节流 ══ */

    /** 锁 store 桩：get 回本人持锁、renew 恒 false → 精确驱动 :263「renew 失败」ERROR 臂。 */
    private static RebuildLockStore renewFailingStore() {
        final String self = "pid1@hostA562";
        final long now = System.currentTimeMillis();
        return new RebuildLockStore() {
            @Override public boolean tryAcquire(String indexKey, long leaseMs) { return true; }
            @Override public boolean renew(String indexKey, long leaseMs) { return false; }
            @Override public void release(String indexKey) { }
            @Override public void forceRelease(String indexKey) { }
            @Override public RebuildLock get(String indexKey) {
                return new RebuildLock(self, now, now + 60_000L, 0L, 1L);
            }
            @Override public String owner() { return self; }
            @Override public boolean isEnabled() { return true; }
        };
    }

    /** 锁 store 桩：get 必抛 → 精确驱动 :271「续约/校验锁异常」ERROR 臂（带栈）。 */
    private static RebuildLockStore getThrowingStore() {
        return new RebuildLockStore() {
            @Override public boolean tryAcquire(String indexKey, long leaseMs) { return true; }
            @Override public boolean renew(String indexKey, long leaseMs) { return false; }
            @Override public void release(String indexKey) { }
            @Override public void forceRelease(String indexKey) { }
            @Override public RebuildLock get(String indexKey) { throw new IllegalStateException("lock get boom 562"); }
            @Override public String owner() { return "pid1@hostA562"; }
            @Override public boolean isEnabled() { return true; }
        };
    }

    private static AdhocRebuildJob job562() {
        AdhocRebuildJob job = new AdhocRebuildJob("job-562", "logical562", AdhocRebuildJob.Strategy.WRITE_BLOCK,
                true, "src562", "dest562", "updateTime", 120_000L, false, true);
        job.setLockActive(true);
        return job;
    }

    private static boolean invokeRenewLockOrLose(AdhocRebuildService service, AdhocRebuildJob job) throws Exception {
        Method m = AdhocRebuildService.class.getDeclaredMethod("renewLockOrLose", AdhocRebuildJob.class);
        m.setAccessible(true);
        return (Boolean) m.invoke(service, job);
    }

    /** 同窗口 5 次 renew 失败 ERROR 恰 1 条；窗口尾汇总 x5 一条再落本窗首条（单键）。 */
    @Test
    public void adhocRenewLostErrorThrottledAndAggregates() throws Exception {
        Class<?> owner = AdhocRebuildService.class;
        AdhocRebuildService service = new AdhocRebuildService(new EsIndexAdmin(null) { }, () -> null, 5_000L,
                renewFailingStore(), 3_000L);
        AdhocRebuildJob job = job562();
        ListAppender<ILoggingEvent> appender = attach(owner);
        try {
            for (int i = 0; i < 5; i++) {
                assertFalse("renew 失败=失锁判定契约不变", invokeRenewLockOrLose(service, job));
            }
            assertEquals("同窗口 5 次 ERROR 恰 1 条（逐条刷屏根治）", 1, countAll(appender, Level.ERROR));
            assertTrue("首条全量带 jobId 定位",
                    appender.list.get(0).getFormattedMessage().contains("job-562"));

            atomicOf(owner, "lastRenewErrAt", service).set(System.currentTimeMillis() - 61_000);
            assertFalse(invokeRenewLockOrLose(service, job)); // 窗口 2 首败

            assertEquals("总 3 条：窗口1首条 + 窗口尾汇总 + 窗口2首条", 3, countAll(appender, Level.ERROR));
            assertTrue("汇总条带累计数", appender.list.get(1).getFormattedMessage().contains("x5"));
        } finally {
            detach(owner, appender);
        }
    }

    /** 异常臂（:271）首条带栈保留，且与 renew 失败臂共享同一节流键（单键语义）。 */
    @Test
    public void adhocRenewExceptionArmKeepsStackAndSharesSingleKey() throws Exception {
        Class<?> owner = AdhocRebuildService.class;
        AdhocRebuildService service = new AdhocRebuildService(new EsIndexAdmin(null) { }, () -> null, 5_000L,
                getThrowingStore(), 3_000L);
        AdhocRebuildJob job = job562();
        ListAppender<ILoggingEvent> appender = attach(owner);
        try {
            assertFalse(invokeRenewLockOrLose(service, job));
            assertFalse(invokeRenewLockOrLose(service, job)); // 同窗口第二次：静默（单键两臂共享）
            assertEquals("同窗口两臂合计恰 1 条（单键）", 1, countAll(appender, Level.ERROR));
            assertTrue("首条带栈（告警职责保留）", appender.list.get(0).getThrowableProxy() != null);

            atomicOf(owner, "lastRenewErrAt", service).set(System.currentTimeMillis() - 61_000);
            assertFalse(invokeRenewLockOrLose(service, job));

            assertEquals("总 3 条：首条 + 汇总 + 本窗首条", 3, countAll(appender, Level.ERROR));
            assertNull("汇总条无栈（首条已带）", appender.list.get(1).getThrowableProxy());
            assertTrue("本窗首条仍带栈", appender.list.get(2).getThrowableProxy() != null);
        } finally {
            detach(owner, appender);
        }
    }

    /* ══ 第 5 件：EsRebuildLockStore renew I/O 失败 WARN 60s 单键节流 ══ */

    /** 端口桩：get 必抛 IOException → 精确驱动 renew 的 catch(I/O) WARN 臂。 */
    private static LockDocPort failingPort() {
        return new LockDocPort() {
            @Override public boolean indexExists(String index) { return false; }
            @Override public void createIndex(String index, String propertiesJson) { }
            @Override public boolean createIfAbsent(String index, String id, Map<String, Object> source) { return false; }
            @Override public boolean replaceIfUnchanged(String index, String id, Map<String, Object> source,
                                                        long seqNo, long primaryTerm) { return false; }
            @Override public LockDoc get(String index, String id) throws IOException {
                throw new IOException("es down 562");
            }
            @Override public boolean deleteIfUnchanged(String index, String id, long seqNo, long primaryTerm) { return false; }
            @Override public void deleteAny(String index, String id) { }
        };
    }

    /** 同窗口 5 次 I/O 失败 WARN 恰 1 条；窗口尾汇总 x5；renew=false 契约不受节流影响。 */
    @Test
    public void lockStoreRenewIoWarnThrottledAndAggregates() throws Exception {
        Class<?> owner = EsRebuildLockStore.class;
        EsRebuildLockStore store = new EsRebuildLockStore(failingPort(), "lock_idx_562", true);
        ListAppender<ILoggingEvent> appender = attach(owner);
        try {
            for (int i = 0; i < 5; i++) {
                assertFalse("renew I/O 失败返回 false 契约不变（节流只动日志）", store.renew("k562", 1_000L));
            }
            assertEquals("同窗口 5 次 WARN 恰 1 条", 1, countAll(appender, Level.WARN));
            assertTrue(appender.list.get(0).getFormattedMessage().contains("renew I/O 失败"));

            atomicOf(owner, "lastRenewIoWarnAt", store).set(System.currentTimeMillis() - 61_000);
            assertFalse(store.renew("k562", 1_000L));

            assertEquals("总 3 条：窗口1首条 + 窗口尾汇总 + 窗口2首条", 3, countAll(appender, Level.WARN));
            assertTrue("汇总条带累计数", appender.list.get(1).getFormattedMessage().contains("x5"));
        } finally {
            detach(owner, appender);
        }
    }
}
