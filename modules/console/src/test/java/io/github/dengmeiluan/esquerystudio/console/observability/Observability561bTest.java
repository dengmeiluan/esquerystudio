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
import io.github.dengmeiluan.esquerystudio.console.auth.JdbcConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.console.config.EsStackContractValidator;
import io.github.dengmeiluan.esquerystudio.console.control.ConsoleSetupController;
import io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClusterConnController;
import io.github.dengmeiluan.esquerystudio.console.web.InternalEsErrorFallbackAdvice;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.servlet.http.HttpServletRequest;
import javax.sql.DataSource;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 轨5【Java 可观测六件】（Observability560/558 范式：Logback ListAppender
 * 直挂 logger 断言事件；JwtVerifier/MappingDeltaCalculator lastXxxAt AtomicLong 节流范式）。
 * ⚠ 命名记档：{@code Observability561Test} 已被并行在途工作占用（untracked，legacyBulkNdjson
 * 等 debug 三件），本文件另起 561b 简名共存于同包——互不触碰。
 *
 * <ol>
 *   <li>P1 MigrateJobTracker.save failed WARN 带全栈无节流 → AtomicLong 60s 节流：首条带栈，
 *       窗口内仅累计，窗口尾汇总「save failed xN」一条无栈（追踪是旁路，存储故障时逐条全栈
 *       WARN 刷屏会淹没业务日志）。</li>
 *   <li>P1 InternalEsErrorFallbackAdvice 每失败请求 log.error 全栈未节流 → 同款 60s 节流
 *       （全局单键；首条仍 ERROR 带栈，告警职责保留）；HTTP 响应体零改动。</li>
 *   <li>P2 JdbcConsoleOpsAuditStore 富列 ALTER 循环：全败（无 ALTER 权限）WARN 恰一次
 *       「审计富列补齐失败,永久 9 列(检查 DB 账号 ALTER 权限)」；部分成功（列已存在）维持 debug。</li>
 *   <li>P2 EsStackContractValidator.detectedSdesVersion Throwable→"unknown" 静默 → debug 留痕
 *       （异常类名+message），返回契约不变。</li>
 *   <li>P2 EsIndexAdmin.rewriteSqlExcludingArrays catch→null 静默 → debug 留痕，返回 null 契约不变。</li>
 *   <li>P2 ConsoleSetupController / EsClusterConnController 两处 PROBE_FAILED 错误体补 endpoint 键
 *       （additive；EsErrorMapper.body/endpointOf 同口径 method+" "+requestURI；无请求上下文
 *       （单测/非 web 线程）宁缺勿炸不输出该键）。</li>
 * </ol>
 *
 * @author aicoding
 */
public class Observability561bTest {

    /* ── 通用：ListAppender 挂/卸（Observability560 同款） ── */

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

    private static long count(ListAppender<ILoggingEvent> appender, Level level, String marker) {
        return appender.list.stream()
                .filter(e -> e.getLevel() == level)
                .filter(e -> e.getFormattedMessage().contains(marker))
                .count();
    }

    private static long countAll(ListAppender<ILoggingEvent> appender, Level level) {
        return appender.list.stream().filter(e -> e.getLevel() == level).count();
    }

    private static AtomicLong atomicOf(Class<?> owner, String name, Object instance) throws Exception {
        Field f = owner.getDeclaredField(name);
        f.setAccessible(true);
        return (AtomicLong) f.get(instance);
    }

    private static Object invoke(EsIndexAdmin admin, String name, Class<?>[] sig, Object[] args) throws Exception {
        Method m = EsIndexAdmin.class.getDeclaredMethod(name, sig);
        m.setAccessible(true);
        return m.invoke(admin, args);
    }

    /* ══ 第 1 件：MigrateJobTracker save failed 节流 WARN ══ */

    /** 故障 store 桩：save 必抛（MigrateJobStore 非 final，匿名子类覆写——558 范式）。 */
    private MigrateJobStore failingStore() {
        return new MigrateJobStore(null, "migrate_job_561") {
            @Override public void save(MigrateJobES job) {
                throw new IllegalStateException("es down for 561");
            }
        };
    }

    private static MigrateJobES job(String jobId) {
        MigrateJobES job = new MigrateJobES();
        job.setJobId(jobId);
        return job;
    }

    /** 同窗口连续失败 N 次：WARN 恰一条、带栈（首条全栈职责保留）、带 jobId。 */
    @Test
    public void migrateSaveFailureThrottledToOneStackedWarnPerWindow() {
        Class<?> owner = io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker.class;
        io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker tracker =
                new io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker(failingStore());
        ListAppender<ILoggingEvent> appender = attach(owner);
        try {
            for (int i = 0; i < 5; i++) {
                tracker.save(job("job-561-" + i)); // 不抛：追踪是旁路，失败仅告警
            }
            assertEquals("同窗口 5 次失败恰 1 条 WARN（60s 节流，逐条全栈刷屏根治）",
                    1, countAll(appender, Level.WARN));
            ILoggingEvent warn = appender.list.get(0);
            assertTrue("首条 WARN 带栈（告警职责保留）", warn.getThrowableProxy() != null);
            assertTrue("WARN 带 jobId 定位", warn.getFormattedMessage().contains("job-561-0"));
        } finally {
            detach(owner, appender);
        }
    }

    /** 窗口尾汇总：新窗口首败先汇总上一窗口累计「save failed xN」一条无栈，再落本窗首条带栈。 */
    @Test
    public void migrateSaveWindowCloseSummarizesSuppressedCountWithoutStack() throws Exception {
        io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker tracker =
                new io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker(failingStore());
        Class<?> owner = io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobTracker.class;
        Logger log = (Logger) LoggerFactory.getLogger(owner);
        log.setLevel(Level.DEBUG);
        ListAppender<ILoggingEvent> appender = attach(owner);
        try {
            atomicOf(owner, "lastSaveWarnAt", tracker).set(System.currentTimeMillis() - 61_000);
            tracker.save(job("job-561-a")); // 窗口 1 首条（带栈）
            for (int i = 0; i < 4; i++) {
                tracker.save(job("job-561-b" + i)); // 窗口内累计（静默）
            }
            atomicOf(owner, "lastSaveWarnAt", tracker).set(System.currentTimeMillis() - 61_000);
            tracker.save(job("job-561-c")); // 窗口 2 首败：先汇总 x5 再首条

            assertEquals("总 3 条：窗口1首条 + 窗口尾汇总 + 窗口2首条",
                    3, countAll(appender, Level.WARN));
            ILoggingEvent summary = appender.list.get(1);
            assertTrue("汇总条带累计数", summary.getFormattedMessage().contains("save failed x5"));
            assertNull("汇总条无栈（首条已带，重复全栈只会刷屏）", summary.getThrowableProxy());
            assertTrue("窗口2首条仍带栈", appender.list.get(2).getThrowableProxy() != null);
        } finally {
            detach(owner, appender);
            log.setLevel(null);
        }
    }

    /* ══ 第 2 件：InternalEsErrorFallbackAdvice ERROR 节流（响应体零改动） ══ */

    private static void resetAdviceThrottle() throws Exception {
        atomicOf(InternalEsErrorFallbackAdvice.class, "lastErrorLogAt", null).set(0);
    }

    /** 同因异常连续处理：ERROR 恰 1 条带栈；HTTP 响应体三次逐字节等值（节流只动日志）。 */
    @Test
    public void adviceErrorLogThrottledAndResponseBodyUnchanged() throws Exception {
        resetAdviceThrottle();
        InternalEsErrorFallbackAdvice advice = new InternalEsErrorFallbackAdvice();
        ListAppender<ILoggingEvent> appender = attach(InternalEsErrorFallbackAdvice.class);
        try {
            java.io.IOException boom = new java.io.IOException("conn reset by 561");
            ResponseEntity<Map<String, Object>> r1 = advice.esError(boom, null);
            advice.esError(boom, null);
            ResponseEntity<Map<String, Object>> r3 = advice.esError(boom, null);

            assertEquals("同因 3 次失败 ERROR 恰 1 条（60s 全局单键节流）",
                    1, countAll(appender, Level.ERROR));
            assertTrue("首条 ERROR 带栈（告警职责保留）",
                    appender.list.get(0).getThrowableProxy() != null);

            assertEquals(502, r1.getStatusCodeValue());
            assertEquals("ES_ERROR", r1.getBody().get("code"));
            assertTrue(r1.getBody().get("message").toString().contains("conn reset by 561"));
            assertEquals("节流不触碰响应体：第 1/3 次逐键等值", r1.getBody(), r3.getBody());
            assertEquals(r1.getStatusCodeValue(), r3.getStatusCodeValue());
        } finally {
            detach(InternalEsErrorFallbackAdvice.class, appender);
        }
    }

    /* ══ 第 3 件：JdbcConsoleOpsAuditStore 富列 ALTER 全败 WARN 恰一次 ══ */

    /** Statement 桩：DDL/ALTER 按模式分流（全败=ALTER 必抛；部分=首列已存在其余成功）。 */
    private DataSource stubDs(final boolean allFail) {
        try {
            ResultSet okRs = (ResultSet) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{ResultSet.class},
                    (p, m, a) -> "next".equals(m.getName()) ? Boolean.FALSE : null);
            Statement st = (Statement) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{Statement.class},
                    (p, m, a) -> {
                        String sql = m.getName().equals("execute") || m.getName().equals("executeQuery")
                                ? String.valueOf(a[0]) : "";
                        if (sql.contains("SELECT conn_id")) {
                            if (allFail) throw new SQLException("SELECT denied");
                            return okRs;
                        }
                        if (sql.contains("ADD COLUMN")) {
                            if (allFail || sql.contains("conn_id")) {
                                throw new SQLException(allFail ? "ALTER command denied"
                                        : "Duplicate column name 'conn_id'");
                            }
                            return Boolean.TRUE;
                        }
                        return Boolean.TRUE; // CREATE TABLE / CREATE INDEX 照常成功
                    });
            Connection conn = (Connection) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{Connection.class},
                    (p, m, a) -> "createStatement".equals(m.getName()) ? st : null);
            return (DataSource) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{DataSource.class},
                    (p, m, a) -> "getConnection".equals(m.getName()) ? conn : null);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private void ensureSchema(Object store) throws Exception {
        Method m = JdbcConsoleOpsAuditStore.class.getDeclaredMethod("ensureSchema");
        m.setAccessible(true);
        m.invoke(store);
    }

    @Test
    public void richColumnAlterAllFailWarnsExactlyOnceWithPermissionHint() throws Exception {
        JdbcConsoleOpsAuditStore store = new JdbcConsoleOpsAuditStore(stubDs(true));
        ListAppender<ILoggingEvent> appender = attach(JdbcConsoleOpsAuditStore.class);
        try {
            ensureSchema(store);
            assertEquals("ALTER 全败（无权限）恰 1 条 WARN——逐条刷屏根治",
                    1, count(appender, Level.WARN, "富列"));
            assertTrue("WARN 必须带永久降级事实与权限指引（任务立法文案）",
                    count(appender, Level.WARN, "审计富列补齐失败") >= 1
                            && count(appender, Level.WARN, "9 列") >= 1
                            && count(appender, Level.WARN, "ALTER") >= 1);
        } finally {
            detach(JdbcConsoleOpsAuditStore.class, appender);
        }
    }

    @Test
    public void richColumnPartialExistsStaysQuietAtWarnLevel() throws Exception {
        JdbcConsoleOpsAuditStore store = new JdbcConsoleOpsAuditStore(stubDs(false));
        ListAppender<ILoggingEvent> appender = attach(JdbcConsoleOpsAuditStore.class);
        try {
            ensureSchema(store);
            assertEquals("单列已存在=部分成功：WARN 级零条（维持 debug 语义）",
                    0, countAll(appender, Level.WARN));
        } finally {
            detach(JdbcConsoleOpsAuditStore.class, appender);
        }
    }

    /* ══ 第 4 件：EsStackContractValidator.detectedSdesVersion 契约锁 ══ */

    /** catch(Throwable) 臂无法确定性触发（Class.forName 硬编码 sdes 类，测试 classpath 恒可见
     *  且 jar manifest 带版本）——退而锁返回值契约：本仓依赖树实测 4.0.9.RELEASE，debug 留痕
     *  改动不得改变返回值；sdes 升级时本断言随迁。 */
    @Test
    public void detectedSdesVersionKeepsContract() {
        assertEquals("4.0.9.RELEASE", EsStackContractValidator.detectedSdesVersion());
    }

    /* ══ 第 5 件：EsIndexAdmin.rewriteSqlExcludingArrays catch→debug→null 契约不变 ══ */

    /** scripted_metric 探测成功（非空数组字段）+ _mapping 必败：debug 留痕带异常类名，返回 null 契约不变。 */
    @Test
    public void rewriteSqlMappingFailureLeavesDebugAndKeepsNull() throws Exception {
        setDebug(EsIndexAdmin.class);
        ListAppender<ILoggingEvent> appender = attach(EsIndexAdmin.class);
        try {
            RestHighLevelClient client = EsFakeClients.scripted(req -> {
                String ep = req.getEndpoint();
                if ("/i561/_search".equals(ep)) {
                    return "{\"aggregations\":{\"_array_detect\":{\"value\":[\"tags\",\"arr_field\"]}}}";
                }
                if ("/i561/_mapping".equals(ep)) {
                    throw EsFakeClients.responseException(400,
                            "{\"error\":{\"reason\":\"mapping boom 561\"}}");
                }
                return "{}";
            });
            EsIndexAdmin admin = new EsIndexAdmin(client);
            Object out = invoke(admin, "rewriteSqlExcludingArrays",
                    new Class<?>[]{String.class, String.class},
                    new Object[]{"SELECT * FROM \"i561\" LIMIT 20", "fields are not supported"});

            assertNull("_mapping 失败返回 null（契约不变：SQL 重写放弃，错误原样透传）", out);
            assertTrue("catch 臂必须 debug 留痕（带方法锚点）",
                    count(appender, Level.DEBUG, "rewriteSqlExcludingArrays") >= 1);
            assertTrue("debug 带异常类名摘要",
                    count(appender, Level.DEBUG, "ResponseException") >= 1);
        } finally {
            detach(EsIndexAdmin.class, appender);
            resetLevel(EsIndexAdmin.class);
        }
    }

    private static void setDebug(Class<?> loggerClass) {
        ((Logger) LoggerFactory.getLogger(loggerClass)).setLevel(Level.DEBUG);
    }

    private static void resetLevel(Class<?> loggerClass) {
        ((Logger) LoggerFactory.getLogger(loggerClass)).setLevel(null);
    }

    /* ══ 第 6 件：两处 PROBE_FAILED 错误体补 endpoint 键（additive） ══ */

    private RemoteEsClientFactory factoryThrowing(final RuntimeException boom) {
        return new RemoteEsClientFactory(1000, 1000) {
            @Override public RestHighLevelClient build(RemoteClusterConn conn) {
                throw boom;
            }
        };
    }

    private static Map<String, String> probeBody() {
        java.util.HashMap<String, String> body = new java.util.HashMap<String, String>();
        body.put("url", "http://127.0.0.1:9200");
        return body;
    }

    private static void bindRequest(final String method, final String uri) {
        HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(
                Observability561bTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (p, m, a) -> {
                    String name = m.getName();
                    if ("getMethod".equals(name)) return method;
                    if ("getRequestURI".equals(name)) return uri;
                    return null;
                });
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
    }

    /** 探测失败 + 请求上下文在场：错误体补 endpoint 键（method + " " + requestURI）。 */
    @Test
    public void clusterTestProbeFailureCarriesEndpointKey() {
        bindRequest("POST", "/internal/es/index/clusters/test");
        try {
            EsClusterConnController controller = new EsClusterConnController(
                    null, null, factoryThrowing(new IllegalStateException("i/o boom 561")), null);

            Map<String, Object> out = controller.test(probeBody());

            assertEquals(Boolean.FALSE, out.get("ok"));
            assertEquals("PROBE_FAILED", out.get("code"));
            assertEquals("endpoint 与 advice 路径 EsErrorMapper.endpointOf 同口径",
                    "POST /internal/es/index/clusters/test", out.get("endpoint"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    /** ConsoleSetupController.test 同款：endpoint 键 additive（ok/code/message 既有键零破坏）。 */
    @Test
    public void setupTestProbeFailureCarriesEndpointKey() {
        bindRequest("POST", "/internal/es/index/setup/test");
        try {
            ControlClusterResolver unbound = new ControlClusterResolver(null, null, null, null, null, null) {
                @Override public boolean bound() { return false; }
            };
            ConsoleSetupController controller = new ConsoleSetupController(
                    unbound, factoryThrowing(new RuntimeException()), null, null, "test-app", true);

            ResponseEntity<Map<String, Object>> resp = controller.test(probeBody());

            assertEquals(HttpStatus.OK.value(), resp.getStatusCodeValue());
            assertEquals(Boolean.FALSE, resp.getBody().get("ok"));
            assertEquals("PROBE_FAILED", resp.getBody().get("code"));
            assertEquals("POST /internal/es/index/setup/test", resp.getBody().get("endpoint"));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    /** 无请求上下文（单测/非 web 线程）：宁缺勿炸，endpoint 键不输出（558 既有断言零破坏）。 */
    @Test
    public void probeFailureWithoutRequestContextOmitsEndpointKey() {
        assertTrue("前置：确无残留请求上下文", RequestContextHolder.getRequestAttributes() == null);
        EsClusterConnController controller = new EsClusterConnController(
                null, null, factoryThrowing(new IllegalStateException("i/o boom 561")), null);

        Map<String, Object> out = controller.test(probeBody());

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertEquals("PROBE_FAILED", out.get("code"));
        assertFalse("无上下文时不得输出 endpoint 键（null 值键也不留）", out.containsKey("endpoint"));
    }
}
