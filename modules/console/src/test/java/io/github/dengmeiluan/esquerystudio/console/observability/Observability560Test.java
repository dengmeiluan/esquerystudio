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
import io.github.dengmeiluan.esquerystudio.console.auth.JwtVerifier;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.mapping.MappingDelta;
import io.github.dengmeiluan.esquerystudio.console.mapping.MappingDeltaCalculator;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.FormatlessDateFields;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 轨5【Java 可观测】六件（Observability558 范式：Logback ListAppender 直挂
 * logger 断言 WARN/DEBUG 事件；PropertiesAuthDelegate lastEndpointWarnAt 首败节流为同款范式）。
 * <b>全部改动 = 补 WARN/DEBUG 留痕，返回值与控制流契约零变更、零签名变更</b>；TDD 先红后绿。
 *
 * <ol>
 *   <li>P1 JwtVerifier token 解析失败 catch 臂静默 → 节流 WARN（只记异常类+message 摘要，
 *       不落 token 内容；返回 null 交回内置鉴权契约不变；结构拒绝/验签不过臂不进 catch，维持静默）。</li>
 *   <li>P2 EsIndexAdmin intOf/longOf 解析失败伪 0 兜底 → debug 留痕（返回值语义零变，
 *       「伪 0 改 null」记档不做）；tryParseStatus catch → debug 带 reason 摘要。</li>
 *   <li>P1 MappingDeltaCalculator mapping 解析失败=delta 消失（漂移静默隐形）→ 节流 WARN，
 *       unparsed 契约不变。</li>
 *   <li>P2 EsVersionCaps majorOrNull/minor 解析失败静默降档 → debug 留痕（null/0 返回值不变）。</li>
 *   <li>P2 FormatlessDateFields scan 解析失败静默空清单 → debug 留痕（空清单契约不变）。</li>
 * </ol>
 *
 * @author aicoding
 */
public class Observability560Test {

    private static final String JWT_SECRET = "test-secret-560";

    /* ── 通用：ListAppender 挂/卸 ── */

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

    private static void setDebug(Class<?> loggerClass) {
        ((Logger) LoggerFactory.getLogger(loggerClass)).setLevel(Level.DEBUG);
    }

    private static void resetLevel(Class<?> loggerClass) {
        ((Logger) LoggerFactory.getLogger(loggerClass)).setLevel(null);
    }

    private static long count(ListAppender<ILoggingEvent> appender, Level level, String marker) {
        return appender.list.stream()
                .filter(e -> e.getLevel() == level)
                .filter(e -> e.getFormattedMessage().contains(marker))
                .count();
    }

    /* ══ 第 1 件：JwtVerifier 解析失败 catch 臂节流 WARN ══ */

    /** 确定性触发 catch 臂：签名段含非法 Base64URL 字符（'#'），decode 必抛 IAE 且 message 不含输入。 */
    private static final String BAD_TOKEN = "hdr.###.###";

    /** 合法 HS256（手签）：合法链路零 WARN 的确定性正向样本。 */
    private static String hs256(String secret, String payload) throws Exception {
        String header = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("{\"alg\":\"HS256\"}".getBytes(StandardCharsets.UTF_8));
        String body = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sig = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal((header + "." + body).getBytes(StandardCharsets.UTF_8)));
        return header + "." + body + "." + sig;
    }

    /** 解析异常臂：返回 null 交回内置鉴权（契约不变）+ 落节流 WARN + 不泄漏 token 内容。 */
    @Test
    public void jwtParseFailureLeavesThrottledWarnWithoutTokenLeak() {
        JwtVerifier verifier = new JwtVerifier(JWT_SECRET, null);
        ListAppender<ILoggingEvent> appender = attach(JwtVerifier.class);
        try {
            assertNull("解析失败契约不变：仍返回 null 交回内置鉴权", verifier.verify(BAD_TOKEN));
            assertNull(verifier.verify(BAD_TOKEN));

            assertEquals("解析失败必须落服务端 WARN（catch 臂静默=认证故障零留痕）",
                    1, count(appender, Level.WARN, "token 解析失败"));
            String text = appender.list.get(0).getFormattedMessage();
            assertTrue("WARN 必须带异常类名摘要", text.contains("IllegalArgumentException"));
            assertTrue("WARN 不得泄漏 token 内容", !text.contains(BAD_TOKEN) && !text.contains("###"));
        } finally {
            detach(JwtVerifier.class, appender);
        }
    }

    /** 60s 节流：同实例连续解析失败只落一条；合法 token 与结构拒绝臂维持静默（不误伤）。 */
    @Test
    public void jwtHappyPathAndStructuralRejectStaySilent() throws Exception {
        JwtVerifier verifier = new JwtVerifier(JWT_SECRET, null);
        ListAppender<ILoggingEvent> appender = attach(JwtVerifier.class);
        try {
            assertNotNull("合法 token 照常验出 claims（契约不变）", verifier.verify(hs256(JWT_SECRET, "{\"sub\":\"u1\"}")));
            assertNull("非三段结构拒绝契约不变", verifier.verify("not-a-jwt"));
            assertEquals("合法链路与结构拒绝臂不得产生 WARN（升档只动 catch 臂）",
                    0, count(appender, Level.WARN, "token 解析失败"));
        } finally {
            detach(JwtVerifier.class, appender);
        }
    }

    /* ══ 第 2 件：EsIndexAdmin intOf/longOf/tryParseStatus debug 留痕 ══ */

    private static Object invoke(EsIndexAdmin admin, String name, Class<?>[] sig, Object[] args) throws Exception {
        Method m = EsIndexAdmin.class.getDeclaredMethod(name, sig);
        m.setAccessible(true);
        return m.invoke(admin, args);
    }

    /** intOf/longOf 解析失败伪 0 兜底：返回值零变 + debug 带异常摘要（此前与合法 0 静默合流）。 */
    @Test
    public void intOfLongOfParseFailureLeavesDebugAndKeepsZero() throws Exception {
        setDebug(EsIndexAdmin.class);
        ListAppender<ILoggingEvent> appender = attach(EsIndexAdmin.class);
        try {
            EsIndexAdmin admin = new EsIndexAdmin(null);
            assertEquals("intOf 伪 0 兜底语义零变", 0, invoke(admin, "intOf",
                    new Class<?>[]{Object.class}, new Object[]{"abc"}));
            assertEquals("longOf 伪 0 兜底语义零变", 0L, invoke(admin, "longOf",
                    new Class<?>[]{Object.class}, new Object[]{"abc"}));
            assertEquals("合法数值路径语义零变", 7, invoke(admin, "intOf",
                    new Class<?>[]{Object.class}, new Object[]{"7"}));

            assertTrue("intOf 解析失败必须 debug 留痕",
                    count(appender, Level.DEBUG, "intOf") >= 1);
            assertTrue("longOf 解析失败必须 debug 留痕",
                    count(appender, Level.DEBUG, "longOf") >= 1);
            assertTrue("debug 带异常类名摘要",
                    count(appender, Level.DEBUG, "NumberFormatException") >= 2);
        } finally {
            detach(EsIndexAdmin.class, appender);
            resetLevel(EsIndexAdmin.class);
        }
    }

    /** tryParseStatus 解析失败回 null：契约不变 + debug 带 reason 摘要。 */
    @Test
    public void tryParseStatusParseFailureLeavesDebugAndKeepsNull() throws Exception {
        setDebug(EsIndexAdmin.class);
        ListAppender<ILoggingEvent> appender = attach(EsIndexAdmin.class);
        try {
            assertNull("tryParseStatus 失败回 null 契约不变", invoke(null, "tryParseStatus",
                    new Class<?>[]{String.class}, new Object[]{"{bad json"}));
            assertTrue("解析失败必须 debug 留痕（带 reason 摘要）",
                    count(appender, Level.DEBUG, "tryParseStatus") >= 1);
        } finally {
            detach(EsIndexAdmin.class, appender);
            resetLevel(EsIndexAdmin.class);
        }
    }

    /* ══ 第 3 件：MappingDeltaCalculator 解析失败节流 WARN ══ */

    /** mapping 解析失败=delta 消失：unparsed 契约不变 + 节流 WARN（漂移不再静默隐形）。
     *  静态节流器：本测试类内仅此用例触发，先反射清零保证确定性。 */
    @Test
    public void mappingParseFailureLeavesThrottledWarnAndStaysUnparsed() throws Exception {
        Field f = MappingDeltaCalculator.class.getDeclaredField("lastParseWarnAt");
        f.setAccessible(true);
        ((AtomicLong) f.get(null)).set(0);

        ListAppender<ILoggingEvent> appender = attach(MappingDeltaCalculator.class);
        try {
            MappingDelta d1 = MappingDeltaCalculator.calculate("###", "{\"properties\":{}}");
            MappingDelta d2 = MappingDeltaCalculator.calculate("###", "{\"properties\":{}}");
            assertTrue("解析失败=delta 记 unparsed（契约不变）", d1.isUnparsed() && d2.isUnparsed());
            assertEquals("节流 WARN：两次失败恰一条（首败留痕，60s 内不再重复）",
                    1, count(appender, Level.WARN, "mapping JSON 解析失败"));
        } finally {
            detach(MappingDeltaCalculator.class, appender);
        }
    }

    /* ══ 第 4 件：EsVersionCaps 解析失败 debug 留痕 ══ */

    /** majorOrNull/minor 静默降档：null/0 返回值零变 + debug 留痕（版本能力降档可追）。 */
    @Test
    public void esVersionCapsUnparsableLeavesDebugAndKeepsValues() {
        setDebug(EsVersionCaps.class);
        ListAppender<ILoggingEvent> appender = attach(EsVersionCaps.class);
        try {
            assertNull("majorOrNull 无法确定返回 null（绝不返回兜底数字，契约不变）",
                    EsVersionCaps.majorOrNull("abc"));
            assertEquals("minor 非法返回 0（契约不变）", 0, EsVersionCaps.minor("1.xyz"));
            assertEquals("合法版本路径语义零变", 10, EsVersionCaps.minor("7.10.2"));

            assertTrue("majorOrNull 解析失败必须 debug 留痕",
                    count(appender, Level.DEBUG, "major") >= 1);
            assertTrue("minor 解析失败必须 debug 留痕",
                    count(appender, Level.DEBUG, "minor") >= 1);
        } finally {
            detach(EsVersionCaps.class, appender);
            resetLevel(EsVersionCaps.class);
        }
    }

    /* ══ 第 5 件：FormatlessDateFields scan 解析失败 debug 留痕 ══ */

    /** 非法 JSON 返回空清单：契约不变 + debug 留痕（「静默空」与「确认无」合流处可追）。 */
    @Test
    public void formatlessScanUnparsableLeavesDebugAndKeepsEmpty() {
        setDebug(FormatlessDateFields.class);
        ListAppender<ILoggingEvent> appender = attach(FormatlessDateFields.class);
        try {
            List<String> out = FormatlessDateFields.scan("###");
            assertNotNull(out);
            assertTrue("非法 JSON 返回空清单（契约不变）", out.isEmpty());
            assertEquals("解析失败必须 debug 留痕",
                    1, count(appender, Level.DEBUG, "日期字段扫描"));
        } finally {
            detach(FormatlessDateFields.class, appender);
            resetLevel(FormatlessDateFields.class);
        }
    }
}
