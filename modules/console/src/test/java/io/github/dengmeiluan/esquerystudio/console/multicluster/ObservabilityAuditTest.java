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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.dengmeiluan.esquerystudio.console.auth.BuiltinConsoleAuthService;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.client.EntityFieldScanner;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.sql.DataSource;
import java.io.IOException;
import java.io.PrintWriter;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 可观测缺口 top5 <b>WARN 升档</b>——吞异常契约逐字节不动（返回值/控制流
 * 零改动，只加日志），失败路径从 debug/静默升 WARN 留痕。TDD 先红后绿。
 *
 * <ol>
 *   <li>{@link EsConnStore#updateVersion} catch→debug：只修了 Jdbc 店同名方法漏了
 *       ES 店——「探活到新版本但 ES 档案写不进」同样无痕，同一句式补齐。</li>
 *   <li>{@link JdbcConnStore#updateVersion} 的 ensureSchema 臂 catch→debug+return：schema
 *       建不出来是持续性失败（每轮探活回写都会再败），比单次失败更该留痕（审计裁决
 *       时明确暂缓本臂，本批收口）；升 WARN + 行注释记缘由。</li>
 *   <li>{@link ConnHealthProber#probeAll} connStore.list 失败→debug 跳整轮：升 AtomicLong
 *       节流 WARN（首条留痕后续仅累计，范式=审计双店 warnAuditDrop——探活周期调度
 *       高频可复现，逐条 WARN 会刷屏）；过时注释「如 NONE 模式未 Setup」一并修正——
 *       list 失败与存储模式无关（ES 未就绪/网络/权限皆可）。</li>
 *   <li>{@link BuiltinConsoleAuthService#verifyToken} fallback 臂 hasAnyUser IOException
 *       →return null：合法兜底 token 被 IO 失败<b>静默</b>拒绝=用户锁死零日志，升 WARN
 *       （文案带 username 上下文）；拒绝语义本身不回退（吞异常契约不变）。</li>
 *   <li>{@link EntityFieldScanner#scan} getDeclaredFields Throwable→emptyList：JVM 级异常
 *       （NoClassDefFoundError 等）致全字段扫描无痕归零，升 WARN（文案带类名）。
 *       <b>同族 null 返回点核查记档</b>：sdesVersion() 的 Throwable→null 是文档化正常路径
 *       （jar 无 Implementation-Version 常态，WARN 会常态刷屏）；parseProperties() 的
 *       catch→null 是契约内输入解析失败（javadoc 明载「其余一切情形返回 null」，调用方经
 *       mappingParsed=false 可辨）——两处维持静默，本批不动。</li>
 * </ol>
 *
 * <p>形态同 {@code JdbcConnStoreUpdateVersionWarnTest}/{@code ConsoleOpsAuditStoreObservabilityTest}：
 * ListAppender 直构造捕获 WARN 事件；源码锚（第 5 点）照 {@code ProfileFlagTest} 的
 * src/main/java 直读先例（本仓测试基线：无 mockito，直构造+反射+动态代理在案）。</p>
 *
 * @author aicoding
 */
public class ObservabilityAuditTest {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        Class<?>[] loggers = {EsConnStore.class, JdbcConnStore.class, ConnHealthProber.class,
                BuiltinConsoleAuthService.class};
        for (Class<?> c : loggers) {
            ((Logger) LoggerFactory.getLogger(c)).addAppender(appender);
        }
    }

    @After
    public void tearDown() {
        Class<?>[] loggers = {EsConnStore.class, JdbcConnStore.class, ConnHealthProber.class,
                BuiltinConsoleAuthService.class};
        for (Class<?> c : loggers) {
            ((Logger) LoggerFactory.getLogger(c)).detachAppender(appender);
        }
    }

    /* ══ 1. EsConnStore.updateVersion：ES 店失败路径补 WARN（ Jdbc 店同款句式） ══ */

    /** ES 档案版本回写失败必须落 WARN（控制 client 不可达时无痕=版本不刷新无从排查），且仍不抛。 */
    @Test
    public void esStoreUpdateVersionFailureLeavesWarn() {
        EsConnStore store = new EsConnStore(() -> null, "esquerystudio_conn", null);

        store.updateVersion("conn-1", "7.17.0");

        assertTrue("EsConnStore updateVersion 失败必须落服务端 WARN（只修了 Jdbc 店）",
                countWarn("[EsConnStore] updateVersion failed") >= 1);
    }

    /** 既有契约顺带锁：空 id/空版本早退零日志。 */
    @Test
    public void esStoreGuardClausesStaySilent() {
        EsConnStore store = new EsConnStore(() -> null, "esquerystudio_conn", null);

        store.updateVersion(null, "7.17.0");
        store.updateVersion("  ", "7.17.0");
        store.updateVersion("conn-1", " ");

        assertEquals("非法入参早退不得产生 WARN", 0, countWarn("updateVersion"));
    }

    /* ══ 2. JdbcConnStore.updateVersion 的 ensureSchema 臂：持续性失败升 WARN ══ */

    /** ensureSchema 失败（宿主库连不上）必须落 WARN——持续性失败比单次更该留痕。 */
    @Test
    public void jdbcStoreEnsureSchemaFailureLeavesWarn() {
        JdbcConnStore store = new JdbcConnStore(brokenDataSource());

        store.updateVersion("conn-1", "7.17.0");

        assertTrue("JdbcConnStore updateVersion 的 ensureSchema 臂必须落 WARN（持续性失败无痕不可排查）",
                countWarn("[JdbcConnStore] updateVersion ensureSchema failed") >= 1);
    }

    /** 既有契约锁：ensureSchema 失败仍吞异常早退（版本是增强信息，绝不影响探活主流程）。 */
    @Test
    public void jdbcStoreEnsureSchemaFailureStillSwallowed() {
        JdbcConnStore store = new JdbcConnStore(brokenDataSource());

        /* 不抛即过：void 返回、异常吞在店内 */
        store.updateVersion("conn-1", "7.17.0");
    }

    /* ══ 3. ConnHealthProber.probeAll：list 失败跳整轮升节流 WARN ══ */

    /** list 失败首轮必须落 WARN；次轮起仅累计静默（节流范式=审计双店 warnAuditDrop）。 */
    @Test
    public void proberListFailureLeavesFirstRoundWarnOnly() {
        ConnHealthProber prober = new ConnHealthProber(brokenConnStore(), null, 10);
        try {
            prober.probeAll();
            prober.probeAll();
            prober.probeAll();
        } finally {
            prober.shutdown();
        }
        assertEquals("首条 WARN 后必须静默（探活周期高频路径，防刷屏）",
                1, countWarn("[ConnHealthProber] skip round"));
    }

    /** 既有契约锁：list 失败不外溢（probeAll 正常返回，保持 UNKNOWN 语义）。 */
    @Test
    public void proberListFailureDoesNotThrow() {
        ConnHealthProber prober = new ConnHealthProber(brokenConnStore(), null, 10);
        try {
            prober.probeAll(); /* 不抛即过 */
        } finally {
            prober.shutdown();
        }
    }

    /* ══ 4. BuiltinConsoleAuthService.verifyToken：兜底 token IO 失败静默拒绝升 WARN ══ */

    /** 兜底 token 撞上 hasAnyUser IO 失败：仍拒绝（契约不变）但必须落带 username 的 WARN。 */
    @Test
    public void fallbackTokenIoFailureLeavesWarnAndStillRejects() throws Exception {
        BuiltinConsoleAuthService svc = new BuiltinConsoleAuthService(
                () -> null, "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "it-secret") {
            @Override
            public boolean hasAnyUser() throws IOException {
                throw new IOException("用户索引不可达(桩)");
            }
        };

        ConsolePrincipal p = svc.verifyToken(fallbackToken("admin", "ADMIN"));

        assertNull("吞异常契约不变：IO 失败时兜底 token 仍按无效拒绝（返回 null）", p);
        assertTrue("合法兜底 token 被静默拒绝=用户锁死零日志，必须落 WARN",
                countWarn("兜底 token") >= 1);
        assertTrue("WARN 文案须带 username 上下文（哪个 token 前缀形态被拒）",
                appender.list.stream().anyMatch(e -> e.getLevel() == Level.WARN
                        && e.getFormattedMessage().contains("admin")));
    }

    /** 既有契约锁：用户索引为空时兜底 token 照常放行（合法路径零 WARN）。 */
    @Test
    public void fallbackTokenStillWorksWhenIndexEmpty() throws Exception {
        BuiltinConsoleAuthService svc = new BuiltinConsoleAuthService(
                () -> null, "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "it-secret") {
            @Override
            public boolean hasAnyUser() {
                return false;
            }
        };

        ConsolePrincipal p = svc.verifyToken(fallbackToken("admin", "ADMIN"));

        assertNotNull("用户索引为空时合法兜底 token 必须放行（语义不回退）", p);
        assertEquals("ADMIN", p.getRole().name());
        assertTrue("兜底身份标记不变", p.isFallback());
        assertEquals("合法放行路径不得产生 WARN", 0, countWarn("兜底 token"));
    }

    /* ══ 5. EntityFieldScanner.scan：getDeclaredFields Throwable 臂升 WARN（源码契约锚） ══ */

    /**
     * 源码锚（ProfileFlagTest 直读 src/main/java 先例）：getDeclaredFields 的 catch(Throwable)
     * 臂内必须出现 LOG.warn，且在 emptyList 早退之前。行为锁不可行的原因：getDeclaredFields
     * 仅在 JVM 级异常（NoClassDefFoundError 等）下抛出，常规测试类无法自然触发。
     */
    @Test
    public void scannerGetDeclaredFieldsFailureLeavesWarnSourceAnchor() throws Exception {
        String src = new String(Files.readAllBytes(
                Paths.get("src/main/java/io/github/dengmeiluan/esquerystudio/console/client/EntityFieldScanner.java")),
                StandardCharsets.UTF_8);

        int gdf = src.indexOf("getDeclaredFields()");
        assertTrue("锚点失效：EntityFieldScanner#getDeclaredFields 调用点未找到", gdf > -1);
        int catchIdx = src.indexOf("catch (Throwable t)", gdf);
        assertTrue("锚点失效：getDeclaredFields 的 Throwable 臂未找到", catchIdx > -1);
        int warnIdx = src.indexOf("LOG.warn", catchIdx);
        int earlyReturn = src.indexOf("return Collections.emptyList();", catchIdx);
        assertTrue("getDeclaredFields Throwable 臂必须升 WARN（JVM 级异常致全字段归零不该无痕），"
                        + "且在 emptyList 早退之前",
                warnIdx > -1 && earlyReturn > -1 && warnIdx < earlyReturn);
        assertTrue("WARN 文案须带类名上下文",
                src.contains("[EntityFieldScanner] getDeclaredFields failed"));
    }

    /** 既有契约锁：scan 正常路径零 WARN、null 类早退契约不变。 */
    @Test
    public void scannerHappyPathStaysSilent() {
        assertEquals("null 实体类早退契约不变", 0,
                EntityFieldScanner.scan(null, "{\"properties\":{}}").size());
        EntityFieldScanner.scan(EntityFieldScanner.class, "{\"properties\":{}}");
        assertEquals("正常扫描路径不得产生 WARN", 0, countWarn("EntityFieldScanner"));
    }

    /* ── 桩与工具 ── */

    /** 永远连不上的宿主库桩：getConnection 即抛 SQLException（ensureSchema 必失败）。 */
    private static DataSource brokenDataSource() {
        return new DataSource() {
            @Override
            public Connection getConnection() throws SQLException {
                throw new SQLException("宿主库不可达(桩)");
            }

            @Override
            public Connection getConnection(String username, String password) throws SQLException {
                throw new SQLException("宿主库不可达(桩)");
            }

            @Override
            public <T> T unwrap(Class<T> iface) throws SQLException {
                throw new SQLException("桩不支持");
            }

            @Override
            public boolean isWrapperFor(Class<?> iface) {
                return false;
            }

            @Override
            public PrintWriter getLogWriter() {
                return null;
            }

            @Override
            public void setLogWriter(PrintWriter out) {
            }

            @Override
            public void setLoginTimeout(int seconds) {
            }

            @Override
            public int getLoginTimeout() {
                return 0;
            }

            @Override
            public java.util.logging.Logger getParentLogger() throws SQLFeatureNotSupportedException {
                throw new SQLFeatureNotSupportedException("桩不支持");
            }
        };
    }

    /** list 即抛的 ConnStore 桩（动态代理，本仓无 mockito 基线的标准替身）。 */
    private static ConnStore brokenConnStore() {
        ClassLoader cl = ObservabilityAuditTest.class.getClassLoader();
        InvocationHandler handler = (proxy, method, args) -> {
            if ("list".equals(method.getName())) {
                throw new RuntimeException("控制集群不可达(桩)");
            }
            Class<?> rt = method.getReturnType();
            if (rt == boolean.class) {
                return false;
            }
            return null;
        };
        return (ConnStore) Proxy.newProxyInstance(cl, new Class<?>[]{ConnStore.class}, handler);
    }

    /** 构造合法兜底 token：b64(username).ROLE.expires.F.b64url(HMAC-SHA256(payload))。 */
    private static String fallbackToken(String username, String role) throws Exception {
        String userB64 = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(username.getBytes(StandardCharsets.UTF_8));
        long expiresAt = System.currentTimeMillis() + 3_600_000L;
        String payload = userB64 + "." + role + "." + expiresAt + ".F";
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("it-secret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sig = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        return payload + "." + sig;
    }

    private int countWarn(String marker) {
        AtomicInteger n = new AtomicInteger();
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && e.getFormattedMessage().contains(marker)) {
                n.incrementAndGet();
            }
        }
        return n.get();
    }
}
