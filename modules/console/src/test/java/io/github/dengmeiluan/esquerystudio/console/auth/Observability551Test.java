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

package io.github.dengmeiluan.esquerystudio.console.auth;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.dengmeiluan.esquerystudio.console.control.BootstrapHomeStore;
import io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver;
import io.github.dengmeiluan.esquerystudio.console.multicluster.HostEsVersionProvider;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 可观测四点收口（Observability547/550 范式：ListAppender 直挂 logger +
 * 契约反锁双形态）。<b>吞异常契约逐字节不动</b>（返回值/降级语义零改动，只加日志），TDD 先红后绿。
 *
 * <ol>
 *   <li>{@link BuiltinConsoleAuthService#login} → verifyPassword {@code catch(Exception)}
 *       {@code return false} 全静默：用户档案要素损坏（坏 Base64 等）时登录失败与「密码错误」
 *       从外表无法分辨且零日志——升 WARN（username + 异常类名；<b>密码/哈希/salt 绝不打</b>）。
 *       反锁两条契约：密码不匹配（协议内否定，无异常）与合法登录路径必须零 WARN。</li>
 *   <li>{@link ControlClusterResolver#init} 自举档案建连失败臂 ERROR 只带
 *       {@code e.getMessage()} 无堆栈——ERROR 级带堆栈是本分，末参补 {@code e}，
 *       文案补 endpoint（脱敏 {@code scheme://host:port}，可安全入日志）。</li>
 *   <li>{@link HostEsVersionProvider} currentClient 异常臂 {@code LOG.debug}→null：
 *       与同文件探测失败三臂 WARN 档位不一致（宿主 client 拿不到=持续性状态，debug 对运营
 *       不可见）——升 <b>60s 节流 WARN</b>（复用  {@code WARN_THROTTLE_MS}+AtomicLong
 *       +CAS 范式；热路径硬前提：每个请求都可能摸到版本探测）。反锁：client 为 null
 *       （未绑定，预期态）与探测成功路径零 WARN。</li>
 *   <li>{@link DelegatingConsoleAuthorizer#authenticate} 委托鉴权异常降级 WARN 只带
 *       {@code e.getMessage()}——末参补 {@code e}；返回 fallback 契约不变。</li>
 * </ol>
 *
 * <p>桩：{@link EsFakeClients}（本仓测试基线：无 mockito，不联网 client 先例） +
 * 覆写 {@code load/build} 的匿名子类 + lambda 实现单方法 SPI 接口。</p>
 *
 * @author aicoding
 */
public class Observability551Test {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        Class<?>[] loggers = {BuiltinConsoleAuthService.class, ControlClusterResolver.class,
                HostEsVersionProvider.class, DelegatingConsoleAuthorizer.class};
        for (Class<?> c : loggers) {
            ((Logger) LoggerFactory.getLogger(c)).addAppender(appender);
        }
    }

    @After
    public void tearDown() {
        Class<?>[] loggers = {BuiltinConsoleAuthService.class, ControlClusterResolver.class,
                HostEsVersionProvider.class, DelegatingConsoleAuthorizer.class};
        for (Class<?> c : loggers) {
            ((Logger) LoggerFactory.getLogger(c)).detachAppender(appender);
        }
    }

    /* ══ 1. verifyPassword：档案损坏吞异常臂全静默 → WARN（username+异常类名，不打密码材料） ══ */

    /** 用户档案 salt 损坏（非法 Base64）：登录仍按凭证错误拒绝（吞异常契约不变），但必须落 WARN。 */
    @Test
    public void brokenUserDocSaltLeavesWarnAndStillRejectsLogin() throws Exception {
        AtomicReference<String> doc = new AtomicReference<>(goodUserDoc("right-pass"));
        BuiltinConsoleAuthService svc = svcWithDoc(doc);
        doc.set(goodUserDoc("right-pass").replace("\"salt\":\"", "\"salt\":\"!!!bad!!!x"));
        // !!!bad!!!x 非法 Base64：Base64.getDecoder().decode 抛 IllegalArgumentException

        Map<String, Object> out = svc.login("u1", "right-pass");

        assertNull("档案损坏契约不变：verifyPassword 仍吞异常按 false 处理（登录失败）", out);
        assertTrue("档案损坏被静默当「密码错误」=运营无从排查，必须落服务端 WARN",
                countLevel(Level.WARN, "密码校验失败") >= 1);
        List<ILoggingEvent> warns = events(Level.WARN, "密码校验失败");
        assertTrue("WARN 文案须带 username 上下文（哪个账号校验炸了）",
                warns.get(0).getFormattedMessage().contains("u1"));
        assertNotNull("WARN 须携带 throwable 堆栈（getThrowableProxy 非 null）",
                warns.get(0).getThrowableProxy());
        assertTrue("throwable 须是 Base64 解码 IllegalArgumentException（异常类名可辨）",
                warns.get(0).getThrowableProxy().getClassName().contains("IllegalArgumentException"));
        assertTrue("密码材料绝不入日志：WARN 全文案不得含密码明文",
                !warns.get(0).getFormattedMessage().contains("right-pass"));
    }

    /** 反锁：密码不匹配是协议内否定（无异常路径），不得因升档误伤产生 WARN。 */
    @Test
    public void wrongPasswordStaysSilent() throws Exception {
        AtomicReference<String> doc = new AtomicReference<>(goodUserDoc("right-pass"));
        BuiltinConsoleAuthService svc = svcWithDoc(doc);

        Map<String, Object> out = svc.login("u1", "wrong-pass");

        assertNull("错密码契约不变：登录失败返回 null", out);
        assertEquals("密码不匹配（无异常）不得产生 WARN", 0, countLevel(Level.WARN, "密码校验失败"));
    }

    /** 反锁：合法登录（好档案+对密码）零 WARN——签发 token 放行语义不变。 */
    @Test
    public void happyLoginStaysSilent() throws Exception {
        AtomicReference<String> doc = new AtomicReference<>(goodUserDoc("right-pass"));
        BuiltinConsoleAuthService svc = svcWithDoc(doc);

        Map<String, Object> out = svc.login("u1", "right-pass");

        assertNotNull("合法凭证必须放行并签发 token", out);
        assertEquals("u1", out.get("username"));
        assertEquals("合法登录路径不得产生任何 WARN", 0, countLevel(Level.WARN, "密码校验失败"));
    }

    /* ══ 2. ControlClusterResolver.init：自举建连失败 ERROR 补堆栈 + endpoint ══ */

    /** 档案在但建连失败：ERROR 必须带堆栈（getThrowableProxy 非 null）且文案含 endpoint。 */
    @Test
    public void bootstrapBuildFailureErrorCarriesStackAndEndpoint() {
        RemoteEsClientFactory factory = new RemoteEsClientFactory(1000, 1000) {
            @Override
            public RestHighLevelClient build(RemoteClusterConn conn) {
                throw new IllegalStateException("自举建连失败(桩)");
            }
        };
        BootstrapHomeStore homeStore = new BootstrapHomeStore(null, "obs551") {
            @Override
            public synchronized RemoteClusterConn load() {
                return new RemoteClusterConn("http", "stub-host", 9201, "", "");
            }
        };
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, homeStore, factory, null, "auto");

        resolver.init(); // 不抛即过：init 契约=解析失败不阻断启动

        List<ILoggingEvent> errors = events(Level.ERROR, "自举档案建连失败");
        assertTrue("自举档案建连失败必须落 ERROR", errors.size() >= 1);
        assertTrue("ERROR 文案须含脱敏 endpoint（哪台集群连不上一眼可辨）",
                errors.get(0).getFormattedMessage().contains("http://stub-host:9201"));
        assertNotNull("ERROR 级必须带堆栈（只有 e.getMessage() 无从定位根因）",
                errors.get(0).getThrowableProxy());
        assertTrue("throwable 须是桩抛的 IllegalStateException",
                errors.get(0).getThrowableProxy().getClassName().contains("IllegalStateException"));
        assertEquals("行为零变更：建连失败不回落 SETUP（防劫持语义），模式保持 NONE",
                ControlClusterResolver.Mode.NONE, resolver.mode());
    }

    /* ══ 3. HostEsVersionProvider.currentClient：异常臂 debug → 60s 节流 WARN ══ */

    /** supplier 抛异常（控制集群未就绪）：版本仍返回 null（未知契约不变），但必须落节流 WARN。 */
    @Test
    public void supplierFailureLeavesThrottledWarnAndStaysNull() {
        HostEsVersionProvider provider = new HostEsVersionProvider(() -> {
            throw new RuntimeException("控制集群未就绪(桩)");
        });

        assertNull("降级契约不变：client 拿不到时版本保持未知（null，绝不假装 7.x）",
                provider.currentVersion());
        assertTrue("debug 对运营不可见=持续性故障无痕，必须落服务端 WARN",
                countLevel(Level.WARN, "宿主 client 获取失败") >= 1);
        List<ILoggingEvent> warns = events(Level.WARN, "宿主 client 获取失败");
        assertNotNull("WARN 须携带 throwable 堆栈", warns.get(0).getThrowableProxy());
        assertTrue("throwable 须是桩抛的 RuntimeException",
                warns.get(0).getThrowableProxy().getClassName().contains("RuntimeException"));

        provider.currentVersion();
        provider.currentVersion();
        assertEquals("热路径硬前提：首条 WARN 后 60s 内必须静默（每请求都可能摸到，防刷屏）",
                1, countLevel(Level.WARN, "宿主 client 获取失败"));
    }

    /** 反锁：client 为 null（控制集群未绑定）是预期态，维持既有静默档不得升 WARN。 */
    @Test
    public void nullClientExpectedStateStaysSilent() {
        HostEsVersionProvider provider = new HostEsVersionProvider(() -> null);

        assertNull(provider.currentVersion());
        assertEquals("未绑定属预期态：不得产生 WARN（预期态告警=狼来了）",
                0, countLevel(Level.WARN, "宿主 client 获取失败"));
    }

    /** 反锁：探测成功（6.x 宿主）路径零 WARN，版本语义不变。 */
    @Test
    public void happyProbeStaysSilent() {
        RestHighLevelClient fake = EsFakeClients.respondingWith(
                "{\"version\":{\"number\":\"6.7.2\"}}", null);
        HostEsVersionProvider provider = new HostEsVersionProvider(() -> fake);

        assertEquals("6.7.2", provider.currentVersion());
        assertEquals("探测成功路径不得产生任何 WARN", 0, countLevel(Level.WARN, "宿主"));
    }

    /* ══ 4. DelegatingConsoleAuthorizer：委托异常降级 WARN 补堆栈 ══ */

    /** delegate 抛异常：仍降级返回 fallback 身份（契约不变），但 WARN 必须带堆栈。 */
    @Test
    public void delegateFailureKeepsFallbackAndWarnCarriesStack() {
        ConsoleAuthDelegate bad = request -> {
            throw new IllegalStateException("宿主鉴权炸了(桩)");
        };
        ConsolePrincipal fallbackPrincipal = new ConsolePrincipal("builtin-u", ConsoleRole.VIEWER, false);
        DelegatingConsoleAuthorizer authorizer = new DelegatingConsoleAuthorizer(
                bad, request -> fallbackPrincipal);

        ConsolePrincipal p = authorizer.authenticate(null);

        assertNotNull("降级契约不变：delegate 异常时回落内置鉴权身份", p);
        assertEquals("builtin-u", p.getUsername());
        List<ILoggingEvent> warns = events(Level.WARN, "宿主委托鉴权异常");
        assertTrue("委托鉴权异常必须落 WARN", warns.size() >= 1);
        assertNotNull("WARN 须携带 throwable 堆栈（只有 getMessage 无从定位宿主侧根因）",
                warns.get(0).getThrowableProxy());
        assertTrue("throwable 须是桩抛的 IllegalStateException",
                warns.get(0).getThrowableProxy().getClassName().contains("IllegalStateException"));
    }

    /** 反锁：delegate 正常认出身份（宿主凭证放行）路径零 WARN，直通语义不变。 */
    @Test
    public void delegateSuccessStaysSilent() {
        ConsolePrincipal hostPrincipal = new ConsolePrincipal("host-u", ConsoleRole.OPERATOR, true);
        DelegatingConsoleAuthorizer authorizer = new DelegatingConsoleAuthorizer(
                request -> hostPrincipal, request -> null);

        ConsolePrincipal p = authorizer.authenticate(null);

        assertNotNull(p);
        assertEquals("host-u", p.getUsername());
        assertTrue("宿主委托身份标记不变", p.isDelegated() || p.isFallback());
        assertEquals("委托成功路径不得产生任何 WARN", 0, countLevel(Level.WARN, "宿主委托鉴权异常"));
    }

    /* ── 桩与工具 ── */

    /** 档案桩：不联网 fake client 对任何请求回给定 body（findUser GET /_doc/u1 命中）。 */
    private BuiltinConsoleAuthService svcWithDoc(AtomicReference<String> docJson) {
        return new BuiltinConsoleAuthService(
                () -> EsFakeClients.scripted(req -> docJson.get()),
                "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "it-secret");
    }

    /**
     * 造一份合法用户档案 JSON（与主实现同款 PBKDF2WithHmacSHA256/31000/256 真算）：
     * 登录放行与「错密码」两形态共用，坏档案由调用方把 salt 改成非法 Base64。
     */
    private static String goodUserDoc(String password) throws Exception {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, 31_000, 256);
        byte[] hash = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(spec).getEncoded();
        return "{\"found\":true,\"_source\":{\"username\":\"u1\",\"role\":\"ADMIN\","
                + "\"salt\":\"" + Base64.getEncoder().encodeToString(salt) + "\","
                + "\"iterations\":31000,"
                + "\"passwordHash\":\"" + Base64.getEncoder().encodeToString(hash) + "\"}}";
    }

    private List<ILoggingEvent> events(Level level, String marker) {
        List<ILoggingEvent> out = new ArrayList<ILoggingEvent>();
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == level && e.getFormattedMessage().contains(marker)) {
                out.add(e);
            }
        }
        return out;
    }

    private int countLevel(Level level, String marker) {
        return events(level, marker).size();
    }
}
