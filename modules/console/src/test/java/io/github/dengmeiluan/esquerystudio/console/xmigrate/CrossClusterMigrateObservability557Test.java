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

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * {@link CrossClusterMigrateService} 两处静默臂补 WARN（Observability554
 * 同构：ListAppender 直挂 logger + 契约反锁双形态，断言风格对齐同包
 * SliceWorkerClearScrollWarnTest 先例）。<b>行为契约零改动</b>（预检照旧不阻断、
 * tuneMode 照旧回退 AGGRESSIVE），只把「失败被静默吞掉」的冷路径补上 WARN 留痕；
 * TDD 先红后绿（红=WARN 断言与 parseTune 带 jobId 签名，行为锁在改动前后同绿）。
 *
 * <ol>
 *   <li>{@link CrossClusterMigrateService#preflight} indexExists {@code IOException}
 *       吞臂：HTTP 照回 200 + destExists=false，前端把「预检失败」误读成「目标尚不存在」
 *       走警告分支，运维零痕。修：WARN 带 dest 索引名；destExists=false 契约不变。
 *       桩：admin 匿名子类（Observability554 physicalIndexAdminStub 同款先例）。
 *       反锁：indexExists 正常返回零 WARN。</li>
 *   <li>{@link CrossClusterMigrateService#parseTune} {@code catch(Exception)} →
 *       AGGRESSIVE：resume 读回持久化 tuneMode，损坏值静默升速跑高峰风险档。
 *       修：非 null 未命中枚举落 WARN（带原值与 jobId）；回退 AGGRESSIVE 契约不变；
 *       null（旧文档缺字段）属判据内常态，维持静默。
 *       private 方法经反射直调（SliceWorkerClearScrollWarnTest 同款先例，无 mockito 基线）。</li>
 * </ol>
 *
 * @author aicoding
 */
public class CrossClusterMigrateObservability557Test {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(CrossClusterMigrateService.class)).addAppender(appender);
    }

    @After
    public void tearDown() {
        ((Logger) LoggerFactory.getLogger(CrossClusterMigrateService.class)).detachAppender(appender);
    }

    /* ══ 1. preflight indexExists 吞臂 → 冷路径 WARN ══ */

    /**
     * admin.indexExists 抛 IOException → preflight 契约不变（destExists=false、不抛、
     * 照常返回），但必须落带 dest 索引名的 WARN——否则前端把「预检失败」误读成
     * 「目标尚不存在」，运维在日志里查不到任何痕迹。
     */
    @Test
    public void preflightIndexExistsFailureKeepsContractAndWarns() {
        CrossClusterMigrateService svc = service(poisonedAdmin());

        Map<String, Object> out = svc.preflight(request("obs557-src", "obs557-dst"));

        assertEquals("预检失败契约不变：destExists=false（前端警告分支语义不动）",
                Boolean.FALSE, out.get("destExists"));
        List<ILoggingEvent> warns = events(Level.WARN, "preflight");
        assertTrue("indexExists 失败静默降级必须落 WARN（运维留痕）", warns.size() >= 1);
        assertTrue("WARN 文案须带 dest 索引名（哪个索引没查成）",
                warns.get(0).getFormattedMessage().contains("obs557-dst"));
    }

    /** 反锁：indexExists 正常路径零 WARN（成功的预检不产生噪音）。 */
    @Test
    public void preflightHappyPathStaysSilent() {
        CrossClusterMigrateService svc = service(new EsIndexAdmin(null) {
            @Override
            public boolean indexExists(String index) {
                return true;
            }
        });

        Map<String, Object> out = svc.preflight(request("obs557-src", "obs557-dst"));

        assertEquals("正常预检契约不变", Boolean.TRUE, out.get("destExists"));
        assertEquals("indexExists 成功路径不得产生任何 WARN", 0, allWarnCount());
    }

    /* ══ 2. parseTune 未知值吞臂 → 冷路径 WARN ══ */

    /**
     * 持久化 tuneMode 损坏（非 null 未命中枚举）→ 契约不变（回退 AGGRESSIVE），
     * 但必须落带原值与 jobId 的 WARN——「静默升速」会把恢复的历史作业无声推进高峰风险档。
     * 经反射直调（同 SliceWorkerClearScrollWarnTest，本仓无 mockito）。
     */
    @Test
    public void parseTuneUnknownStringFallsBackAggressiveAndWarns() throws Exception {
        CrossClusterMigrateService svc = service(new EsIndexAdmin(null));

        TuneMode mode = invokeParseTune(svc, "bogus-tune", "job-557");

        assertEquals("回退契约不变：未知值仍落 AGGRESSIVE", TuneMode.AGGRESSIVE, mode);
        List<ILoggingEvent> warns = events(Level.WARN, "bogus-tune");
        assertEquals("未知 tuneMode 必须落 WARN 恰 1 条", 1, warns.size());
        assertTrue("WARN 文案须带 jobId（恢复的哪个作业在升速）",
                warns.get(0).getFormattedMessage().contains("job-557"));
    }

    /** 反锁：合法枚举原样返回；null（旧文档缺字段）静默回落——两者都零 WARN。 */
    @Test
    public void parseTuneKnownEnumAndNullStaySilent() throws Exception {
        CrossClusterMigrateService svc = service(new EsIndexAdmin(null));

        assertEquals("合法枚举契约不变：GENTLE 原样返回",
                TuneMode.GENTLE, invokeParseTune(svc, "GENTLE", "job-557"));
        assertEquals("合法枚举契约不变：AGGRESSIVE 原样返回",
                TuneMode.AGGRESSIVE, invokeParseTune(svc, "AGGRESSIVE", "job-557"));
        assertEquals("null（旧文档缺字段）契约不变：仍回落 AGGRESSIVE",
                TuneMode.AGGRESSIVE, invokeParseTune(svc, null, "job-557"));
        assertEquals("合法值与 null 均不得产生 WARN", 0, allWarnCount());
    }

    /* ── 桩与工具 ── */

    /** indexExists 必抛 IOException 的 admin 桩（匿名子类覆盖，EsIndexAdmin(null) 即可实例化）。 */
    private static EsIndexAdmin poisonedAdmin() {
        return new EsIndexAdmin(null) {
            @Override
            public boolean indexExists(String index) throws IOException {
                throw new IOException("obs557-poisoned-admin");
            }
        };
    }

    /**
     * 最小 service：preflight 只触 localAdmin、parseTune 只读入参，
     * 其余 8 个协作者传 null 即可（构造函数只赋值，不解析依赖）。
     */
    private static CrossClusterMigrateService service(EsIndexAdmin admin) {
        return new CrossClusterMigrateService(null, admin, null, null, null, null, null, null, null);
    }

    private static MigrateRequest request(String src, String dst) {
        MigrateRequest req = new MigrateRequest();
        req.setSourceIndex(src);
        req.setDestIndex(dst);
        return req;
    }

    private static TuneMode invokeParseTune(CrossClusterMigrateService svc, String s, String jobId)
            throws Exception {
        Method m = CrossClusterMigrateService.class.getDeclaredMethod("parseTune", String.class, String.class);
        m.setAccessible(true);
        return (TuneMode) m.invoke(svc, s, jobId);
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

    /** 全部 WARN 条数（零 WARN 契约反锁用：不看 marker，计数封死）。 */
    private int allWarnCount() {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN) {
                n++;
            }
        }
        return n;
    }
}
