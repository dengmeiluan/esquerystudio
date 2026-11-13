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

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.dengmeiluan.esquerystudio.console.config.EsStackContractValidator;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.insight.analyzer.SettingsChangeAnalyzer;
import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 静默臂治理续批（Observability550/551/552 范式：ListAppender 直挂 logger +
 * 契约反锁双形态）。<b>返回值契约零改动</b>（吞异常照旧、仍返回 null/空列表），只把
 * 「回退误导/语义变更」类冷路径从静默升为 WARN；TDD 先红后绿。
 *
 * <ol>
 *   <li>{@link SettingsChangeAnalyzer} lintChanges（原 :126）{@code catch(Exception)}
 *       → 空列表：lint 失败伪装「零问题」绿灯，analyze 直接采纳 = 假绿灯放行非法
 *       settings。<b>②回退误导冷路径 WARN</b>（带键名摘要与堆栈，不记值）；空列表契约
 *       不变。触发手法：{@code new Object()} 值令 {@code writeValueAsString} 抛
 *       {@code InvalidDefinitionException}（Map 直接自引用触发的是 StackOverflowError，
 *       是 Error 不是 Exception，打不进 catch 臂，不可用）。反锁：合法 lint 路径零 WARN。</li>
 *   <li>{@link AdhocRebuildService#prepare} 经 {@code docCount}（原 :980）
 *       {@code catch(Exception)} → null：索引不可达/权限不足等真异常与「待数」不可区分。
 *       <b>②冷路径 WARN 恰一条</b>（每索引仅首次，prepare 轮询不刷屏）；null 契约不变。
 *       注意 404 走 {@code perform} 的判据臂返回 null 不进本臂——「索引不存在」属判据内
 *       静默（552 三态立法）。桩：admin 匿名子类（AdhocRebuildHostProbeWarn548Test 同款
 *       先例）走物理索引路径——EsFakeClients 实体是 text/plain，高层 RHLC existsAlias
 *       的 404 分支会解析响应体直接炸，故探测方法必须桩掉、只留低层 REST 走假 client。
 *       反锁：合法 _count 零 WARN。</li>
 *   <li>{@link EsStackContractValidator} sdesExpectedXContentType（原 :200）
 *       {@code catch(Throwable)} → null：探测失败 = 宿主栈错配检测整段 fail-open 跳过，
 *       「检测跳过」被误读为「检测通过」。<b>②冷路径 WARN</b> 注明「栈契约检测跳过」；
 *       null 契约不变（probe 对 null 维持「无法判定≠错配」原语义）。本类为启动期
 *       {@code @PostConstruct} 诊断件（同 {@code report()} 既有 WARN 风格），适宜 log。
 *       失败臂经 package-private 测试接缝注入毒流触发（无 mockito 基线，同
 *       {@code AdhocRebuildService#resolveFieldType} 接缝先例；测试跨包故走反射）。
 *       反锁：真实 classpath 上 probe 全程零 WARN。</li>
 *   <li>{@code ConfirmTokenService.verify} 两处 {@code catch → return false}：
 *       fail-closed 安全臂，拒绝经 HTTP 4xx 响应对用户响亮，静默属 552 立法内——
 *       仅 javadoc 记档，零代码行为变更，无测试（无可观测面变化）。</li>
 * </ol>
 *
 * @author aicoding
 */
public class Observability554Test {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        Class<?>[] loggers = {SettingsChangeAnalyzer.class, AdhocRebuildService.class,
                EsStackContractValidator.class};
        for (Class<?> c : loggers) {
            ((Logger) LoggerFactory.getLogger(c)).addAppender(appender);
        }
    }

    @After
    public void tearDown() {
        Class<?>[] loggers = {SettingsChangeAnalyzer.class, AdhocRebuildService.class,
                EsStackContractValidator.class};
        for (Class<?> c : loggers) {
            ((Logger) LoggerFactory.getLogger(c)).detachAppender(appender);
        }
    }

    /* ══ 1. SettingsChangeAnalyzer.lintChanges：lint 失败吞臂 → 冷路径 WARN ══ */

    /**
     * settings 序列化失败（Object 值无可序列化属性）→ lint 被跳过，若静默返回空列表则
     * L1 门禁假绿灯。断言：analyze 返回契约不变，但必须落带键名摘要与堆栈的 WARN
     * （不记值——settings 值可能带敏感语义）。
     */
    @Test
    public void lintFailureWarnsAndStillReturnsEmptyIssues() {
        SettingsChangeAnalyzer analyzer = new SettingsChangeAnalyzer(null);

        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("refresh_interval", "30s");
        changes.put("mystery", new Object()); // 无可序列化属性 → writeValueAsString 抛 InvalidDefinitionException

        Map<String, Object> out = analyzer.analyze("obs554", changes);

        assertNotNull("lint 失败契约不变：analyze 仍正常返回", out);
        List<ILoggingEvent> warns = events(Level.WARN, "lint");
        assertTrue("lint 失败伪装零问题=假绿灯放行非法 settings，必须落 WARN", warns.size() >= 1);
        assertTrue("WARN 文案须带 settings 键名摘要（哪组变更没过成门禁）",
                warns.get(0).getFormattedMessage().contains("refresh_interval"));
        assertNotNull("WARN 须携带 throwable 堆栈", warns.get(0).getThrowableProxy());
    }

    /** 反锁：合法 changes（lint 正常执行）路径零 WARN（全 logger 封死）。 */
    @Test
    public void lintHappyStaysSilent() {
        SettingsChangeAnalyzer analyzer = new SettingsChangeAnalyzer(null);

        Map<String, Object> changes = new LinkedHashMap<>();
        changes.put("refresh_interval", "30s"); // 已知 DYNAMIC 键，lint 无 issues，不触 rebuildEstimate

        Map<String, Object> out = analyzer.analyze("obs554", changes);

        assertNotNull(out);
        assertEquals("lint 正常路径不得产生任何 WARN", 0, warnCountFrom(SettingsChangeAnalyzer.class));
    }

    /* ══ 2. AdhocRebuildService.docCount（经 prepare 公共路径）：真异常吞臂 → 冷路径 WARN 恰一条 ══ */

    /**
     * _count 不可达（503，非 404 —— 404 走 perform 判据臂属判据内静默）→ docCount 吞成
     * null。断言：prepare 契约不变（docCount=null），但恰落 1 条带索引名与堆栈的 WARN；
     * 重复 prepare（前端轮询形态）不追加——每索引仅记首次。
     */
    @Test
    public void docCountFailureWarnsExactlyOncePerIndex() throws Exception {
        final RestHighLevelClient fake = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod()) && "/obs554/_settings".equals(req.getEndpoint())) {
                return "{}";
            }
            // 503（非 404）→ perform 判据臂不吞 → 进 docCount 的 catch 臂
            throw EsFakeClients.responseException(503, "{\"error\":{}}");
        });
        AdhocRebuildService svc = new AdhocRebuildService(physicalIndexAdminStub(), () -> fake, 0L);

        Map<String, Object> first = svc.prepare("obs554");
        Map<String, Object> second = svc.prepare("obs554"); // 前端轮询：同索引重复失败

        assertNull("docCount 契约不变：失败仍按 null 处理（前端「待数」语义）", first.get("docCount"));
        List<ILoggingEvent> warns = events(Level.WARN, "docCount");
        assertEquals("同索引重复失败只记首次（WARN 恰 1 条，轮询不刷屏）", 1, warns.size());
        assertTrue("WARN 文案须带索引名", warns.get(0).getFormattedMessage().contains("obs554"));
        assertNotNull("WARN 须携带 throwable 堆栈", warns.get(0).getThrowableProxy());
        assertNull("第二次 prepare 契约不变", second.get("docCount"));
    }

    /** 反锁：合法 _count（正常回 count）路径零 WARN（全 logger 封死）。 */
    @Test
    public void docCountHappyStaysSilent() throws Exception {
        final RestHighLevelClient fake = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod()) && "/obs554/_settings".equals(req.getEndpoint())) {
                return "{}";
            }
            if ("GET".equals(req.getMethod()) && "/obs554/_count".equals(req.getEndpoint())) {
                return "{\"count\":5}";
            }
            throw EsFakeClients.responseException(503, "{\"error\":{}}");
        });
        AdhocRebuildService svc = new AdhocRebuildService(physicalIndexAdminStub(), () -> fake, 0L);

        Map<String, Object> out = svc.prepare("obs554");

        assertEquals("合法 _count：docCount 正常取值", 5L, out.get("docCount"));
        assertEquals("_count 成功路径不得产生任何 WARN", 0, warnCountFrom(AdhocRebuildService.class));
    }

    /**
     * 物理索引最小 admin 桩（AdhocRebuildHostProbeWarn548Test 同款匿名子类先例）：
     * 非别名 + 索引存在 + mapping 给定，让 prepare 走到 docCount——探测方法不走高层
     * RHLC（EsFakeClients 的 text/plain 实体过不了 existsAlias 的异常解析），低层
     * _settings/_count 留给假 client 按脚本应答。
     */
    private static EsIndexAdmin physicalIndexAdminStub() {
        return new EsIndexAdmin(null) {
            @Override
            public boolean aliasExists(String alias) {
                return false;
            }

            @Override
            public boolean indexExists(String index) {
                return true;
            }

            @Override
            public String getMapping(String index) {
                return "{\"properties\":{\"created_at\":{\"type\":\"date\"}}}";
            }
        };
    }

    /* ══ 3. EsStackContractValidator.sdesExpectedXContentType：字节流读取失败臂 → 冷路径 WARN ══ */

    /**
     * 注入毒流（read 即抛）触发 {@code catch(Throwable)} 臂：断言返回 null 契约不变
     * （probe 维持「无法判定≠错配」），但必须落注明「栈契约检测跳过」的 WARN。
     * 经 package-private 接缝 + 反射调用（跨包，无 mockito 基线）。
     */
    @Test
    public void stackContractProbeFailureWarnsAndStillReturnsNull() throws Exception {
        Method seam = EsStackContractValidator.class
                .getDeclaredMethod("sdesExpectedXContentType", InputStream.class);
        seam.setAccessible(true);
        InputStream poison = new InputStream() {
            @Override
            public int read() throws IOException {
                throw new IOException("obs554-poisoned-stream");
            }
        };

        Object result = seam.invoke(null, poison);

        assertNull("探测失败契约不变：返回 null（无法判定≠错配，fail-open 语义保留）", result);
        List<ILoggingEvent> warns = events(Level.WARN, "栈契约检测跳过");
        assertTrue("栈契约检测整段被跳过若静默，会被误读为「检测通过」，必须落 WARN", warns.size() >= 1);
        assertNotNull("WARN 须携带 throwable 堆栈", warns.get(0).getThrowableProxy());
    }

    /** 反锁：真实 classpath 上 probe（含字节流正常读取）零 WARN，配套时返回空错配表。 */
    @Test
    public void stackContractProbeHappyStaysSilent() {
        assertTrue("BOM 对齐的测试 classpath 上宿主栈不错配（前置自检）",
                EsStackContractValidator.probeHostStackMismatch().isEmpty());
        assertEquals("probe 正常路径不得产生任何 WARN", 0,
                warnCountFrom(EsStackContractValidator.class));
    }

    /* ── 工具（Observability552Test 同款） ── */

    private List<ILoggingEvent> events(Level level, String marker) {
        List<ILoggingEvent> out = new ArrayList<ILoggingEvent>();
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == level && e.getFormattedMessage().contains(marker)) {
                out.add(e);
            }
        }
        return out;
    }

    /** 某 logger 名下的全部 WARN 条数（零 WARN 契约反锁用：不看 marker，计数封死）。 */
    private int warnCountFrom(Class<?> loggerOwner) {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && loggerOwner.getName().equals(e.getLoggerName())) {
                n++;
            }
        }
        return n;
    }
}
