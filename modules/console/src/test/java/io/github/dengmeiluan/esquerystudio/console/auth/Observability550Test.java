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
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import javax.servlet.http.HttpServletRequest;
import java.io.OutputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * endpoint 模式<b>非 2xx 臂 debug→节流 WARN</b>（观测缺口收口，Observability547
 * 范式 +  HttpServer 桩先例）。
 *
 * <p><b>缺口</b>：{@link PropertiesAuthDelegate#callVerifyEndpoint} 非 2xx 臂此前只落
 * {@code LOG.debug}——401/5xx/网关异常时请求被静默交回内置鉴权，运营侧「为什么配了宿主鉴权
 * 还在用内置登录」无从排查。升节流 WARN（复用 exception 臂既有 {@code WARN_THROTTLE_MS=60s}
 * + {@code lastEndpointWarnAt} 节流器）：401 高频回退（无效 token 探测）靠节流防刷屏，
 * 首条留痕后续静默。</p>
 *
 * <p><b>裁决记档（username 空臂不随本批升级）</b>：2xx 但 body 无 username 是宿主校验接口的
 * <b>协议内否定裁决</b>（接口正常应答、语义=「此凭据不通过」，负结果按缓存契约入
 * {@code verdictCache}），与「接口本身不可用/拒答」的基础设施故障（非 2xx/异常臂）不同档
 * ——高频场景下 WARN 只会制造噪音，维持静默（本测试第三用例反锁该裁决）。</p>
 *
 * <p>打点路径：本机 HttpServer 桩（本仓测试基线：无 mockito，动态代理在案先例）——
 * 桩可切 401/200；{@link HttpServletRequest} 用动态代理桩（仅 {@code getHeader} 有语义，
 * 返回可切换 token，换 token 绕过 30s 负结果缓存直打两次校验）。</p>
 *
 * @author aicoding
 */
public class Observability550Test {

    private static final String NON_2XX_WARN_MARKER = "endpoint 校验未通过";

    private HttpServer server;
    private ListAppender<ILoggingEvent> appender;
    private ESQueryStudioElasticsearchProperties.Delegate props;
    /** 桩状态：HTTP 状态码与下发的 token（换 token 绕过负结果缓存，直打校验路径）。 */
    private final AtomicReference<String> stubToken = new AtomicReference<>("token-1");
    private volatile int stubStatus = 401;

    @Before
    public void setUp() throws Exception {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(PropertiesAuthDelegate.class)).addAppender(appender);

        stubStatus = 401;
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/", exchange -> {
            boolean ok = stubStatus == 200;
            byte[] body = (ok ? "{\"username\":\"u1\",\"roles\":[\"OPERATOR\"]}"
                    : "{\"error\":\"stub reject\"}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(stubStatus, body.length);
            OutputStream os = exchange.getResponseBody();
            os.write(body);
            os.close();
        });
        server.start();

        props = new ESQueryStudioElasticsearchProperties.Delegate();
        props.setMode("endpoint");
        props.getEndpoint().setVerifyUrl(
                "http://localhost:" + server.getAddress().getPort() + "/auth/verify");
    }

    @After
    public void tearDown() {
        ((Logger) LoggerFactory.getLogger(PropertiesAuthDelegate.class)).detachAppender(appender);
        server.stop(0);
    }

    /* ══ 非 2xx 臂：升节流 WARN（失败路径留痕，60s 内第二次不再增） ══ */

    /** 桩回 401：必须落服务端 WARN（此前 debug 级无痕），且返回 null 交回内置鉴权（契约不变）。 */
    @Test
    public void non2xxLeavesWarnAndStillFallsBack() {
        PropertiesAuthDelegate delegate = new PropertiesAuthDelegate(props);

        ConsolePrincipal p = delegate.authenticate(stubRequest());

        assertNull("非 2xx 契约不变：仍返回 null 交回内置鉴权", p);
        assertTrue("非 2xx 必须落服务端 WARN（debug 级对运营不可见=无痕），此前静默",
                countWarn(NON_2XX_WARN_MARKER) >= 1);
        assertTrue("WARN 文案须带 http 状态码（哪类故障一眼可辨）",
                appender.list.stream().anyMatch(e -> e.getLevel() == Level.WARN
                        && e.getFormattedMessage().contains("401")));
    }

    /** 60s 节流：换 token 绕过负结果缓存再打一次（真实打到校验端点），WARN 不得增条（防刷屏）。 */
    @Test
    public void non2xxThrottledWithin60s() {
        PropertiesAuthDelegate delegate = new PropertiesAuthDelegate(props);

        stubToken.set("token-1");
        delegate.authenticate(stubRequest());
        stubToken.set("token-2");
        delegate.authenticate(stubRequest());

        assertEquals("首条 WARN 后 60s 内必须静默（401 高频回退场景靠节流防刷屏）",
                1, countWarn(NON_2XX_WARN_MARKER));
    }

    /* ══ 合法路径与协议内否定：零 WARN ══ */

    /** 桩回 200+username：正常放行路径零 WARN（升档不得误伤合法链路）。 */
    @Test
    public void happyPathStaysSilent() {
        stubStatus = 200;
        PropertiesAuthDelegate delegate = new PropertiesAuthDelegate(props);

        ConsolePrincipal p = delegate.authenticate(stubRequest());

        assertNotNull("200+username 必须放行（宿主身份语义不变）", p);
        assertEquals("u1", p.getUsername());
        assertEquals("升档只动失败臂：合法路径不得产生任何 WARN", 0, countWarn(NON_2XX_WARN_MARKER));
    }

    /**
     * 2xx 但 body 无 username：协议内否定裁决（接口正常应答=凭据不通过），维持静默——
     * 反锁本批裁决：该臂与基础设施故障（非 2xx/异常）不同档，不升 WARN。
     */
    @Test
    public void protocolNegativeStaysSilent() {
        stubStatus = 200;
        props.getEndpoint().setUsernamePath("missing.path");
        PropertiesAuthDelegate delegate = new PropertiesAuthDelegate(props);

        ConsolePrincipal p = delegate.authenticate(stubRequest());

        assertNull("协议内否定契约不变：仍返回 null 交回内置鉴权", p);
        assertEquals("2xx 否定裁决不得升 WARN（合法缺省静默，负面结果按契约入缓存）",
                0, countWarn(NON_2XX_WARN_MARKER));
    }

    /* ── 桩与工具 ── */

    /** HttpServletRequest 动态代理桩：getHeader(tokenHeader) 返回可切换 token，其余一律 null。 */
    private HttpServletRequest stubRequest() {
        final String tokenHeader = props.getTokenHeader();
        ClassLoader cl = Observability550Test.class.getClassLoader();
        InvocationHandler handler = (proxy, method, args) -> {
            if ("getHeader".equals(method.getName()) && tokenHeader.equals(args[0])) {
                return stubToken.get();
            }
            Class<?> rt = method.getReturnType();
            if (rt == boolean.class) {
                return false;
            }
            return null;
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                cl, new Class<?>[]{HttpServletRequest.class}, handler);
    }

    private int countWarn(String marker) {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && e.getFormattedMessage().contains(marker)) {
                n++;
            }
        }
        return n;
    }
}
