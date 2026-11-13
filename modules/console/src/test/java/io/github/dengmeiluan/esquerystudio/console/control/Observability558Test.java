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

package io.github.dengmeiluan.esquerystudio.console.control;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 轨5 自适应+Java 可观测三件（Observability552/557 范式：ListAppender
 * 直挂 logger + 契约锚双形态，源码锚照 Observability547Test 直读 src/main/java 先例）。
 * <b>降级/返回值契约零改动</b>（false 仍 false、报告照常返回、raw 照常执行），只把静默臂
 * 补上留痕；TDD 先红后绿。
 *
 * <ol>
 *   <li>io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin 健康报告组装（源码契约锚）：
 *       GET /_cluster/pending_tasks 的 {@code catch (IOException ignored) { }} 整段静默 →
 *       必须写 {@code pendingTasksError} 键（与同方法 mappingsError/settingsError/
 *       docCountError/aliasesError 兄弟键齐平），且全文件不再有裸 ignored 空吞。
 *       行为锁不可行的原因：该臂在健康报告深处，触发需前置 5 类聚合请求全部打通，
 *       键写入语义与兄弟键逐字同构——源码锚即契约。</li>
 *   <li>{@link ControlClusterResolver} ping 吞臂（经包内可见节流器真实单测三态断言）：
 *       {@code catch (Exception e) { return false; }} 静默 → 首败节流 WARN（控制集群探活
 *       失败(第 n 次) + 根因 + 控制面维持 NONE 降级）；连败仅累计静默（探活是 NONE 10s
 *       惰性重探的高频路径，逐条 WARN 刷屏）；恢复成功重臂后下次失败再 WARN（三态语义
 *       与  ConnHealthProber.skipRoundCount 对齐）。返回 false 契约不变。</li>
 *   <li>io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController clusterRaw
 *       审计摘要回填 {@code catch (Exception ignore)} 静默（源码契约锚）：必须直接 WARN
 *       （低频用户路径不节流），文案带 [esquerystudio-raw] 前缀与「本次高危审计缺执行摘要」
 *       语义；回填失败不影响执行契约不变。</li>
 * </ol>
 *
 * @author aicoding
 */
public class Observability558Test {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(ControlClusterResolver.class)).addAppender(appender);
    }

    @After
    public void tearDown() {
        ((Logger) LoggerFactory.getLogger(ControlClusterResolver.class)).detachAppender(appender);
    }

    /* ══ 1. EsIndexAdmin 健康报告 pending_tasks 吞臂 → pendingTasksError（源码契约锚） ══ */

    /**
     * 源码锚（Observability547Test 直读 src/main/java 先例）：pending_tasks 的吞臂必须
     * 具名 catch (IOException e) 并写 pendingTasksError 键——pending 面失明时运维看到的
     * 健康报告只是「没有 pending task」，与集群真没任务无法区分。
     */
    @Test
    public void healthPendingTasksFailureWritesErrorKeySourceAnchor() throws Exception {
        String src = new String(Files.readAllBytes(
                Paths.get("src/main/java/io/github/dengmeiluan/esquerystudio/console/core/EsIndexAdmin.java")),
                StandardCharsets.UTF_8);

        int pt = src.indexOf("performJson(\"GET\", \"/_cluster/pending_tasks\"");
        assertTrue("锚点失效：健康报告 pending_tasks 调用点未找到", pt > -1);
        int end = src.indexOf("/* 5) 节点负载 */", pt);
        assertTrue("锚点失效：健康报告第 5) 段未找到（结构漂移需改锚）", end > -1);
        int catchIdx = src.indexOf("catch (IOException e)", pt);
        assertTrue("pending_tasks 吞臂必须具名 catch (IOException e)（裸 ignored{} 已禁）",
                catchIdx > -1 && catchIdx < end);
        int putIdx = src.indexOf("out.put(\"pendingTasksError\", e.getMessage())", catchIdx);
        assertTrue("pending_tasks 失败必须写 pendingTasksError 键（与 mappingsError/settingsError/"
                + "docCountError/aliasesError 兄弟键齐平，静默=健康报告 pending 面失明）",
                putIdx > -1 && putIdx < end);
        assertTrue("全文件不得再有裸空吞 catch (IOException ignored) { }（空体无注释=完全无痕）",
                !Pattern.compile("catch \\(IOException ignored\\) \\{\\s*\\}").matcher(src).find());
    }

    /* ══ 2. ControlClusterResolver.ping 吞臂 → 首败节流 WARN 三态（真实单测） ══ */

    /** 首败：恰 1 条 WARN，文案带次数、根因与控制面 NONE 降级语义。 */
    @Test
    public void firstPingFailureWarnsOnceWithCountRootCauseAndNoneSemantic() {
        ControlClusterResolver r = new ControlClusterResolver(null, null, null, null, null, "auto");

        r.warnPingFailureThrottled(new RuntimeException("连接超时(桩)"));

        List<ILoggingEvent> warns = events(Level.WARN, "控制集群探活失败");
        assertEquals("首败必须落恰 1 条节流 WARN", 1, warns.size());
        String msg = warns.get(0).getFormattedMessage();
        assertTrue("WARN 文案须带次数（第 n 次）", msg.contains("第 1 次"));
        assertTrue("WARN 文案须带根因（哪台集群为何连不上）", msg.contains("连接超时(桩)"));
        assertTrue("WARN 文案须带降级语义（控制面维持 NONE）", msg.contains("NONE"));
    }

    /** 连败：连续失败只累计不打（高频探活路径防刷屏，范式=ConnHealthProber 首条节流）。 */
    @Test
    public void consecutivePingFailuresStaySilent() {
        ControlClusterResolver r = new ControlClusterResolver(null, null, null, null, null, "auto");

        r.warnPingFailureThrottled(new RuntimeException("e1"));
        r.warnPingFailureThrottled(new RuntimeException("e2"));
        r.warnPingFailureThrottled(new RuntimeException("e3"));

        assertEquals("连败静默：仍只有首条 WARN", 1, allWarnCount());
    }

    /** 恢复重臂：成功路径归零计数，下次失败再 WARN（恰 2 条，三态闭合）。 */
    @Test
    public void successRearmsAndNextFailureWarnsAgain() {
        ControlClusterResolver r = new ControlClusterResolver(null, null, null, null, null, "auto");

        r.warnPingFailureThrottled(new RuntimeException("e1"));
        r.rearmPingWarn(); // ping 成功路径调用（恢复重臂）
        r.warnPingFailureThrottled(new RuntimeException("e2"));

        assertEquals("恢复重臂后下次失败必须再 WARN（恰 2 条）", 2, allWarnCount());
    }

    /* ══ 3. clusterRaw 审计摘要回填吞臂 → 直接 WARN（源码契约锚） ══ */

    /**
     * 源码锚：回填臂必须具名 catch (Exception e) 并落带 [esquerystudio-raw] 前缀的
     * WARN——「谁执行了什么」的执行摘要缺失且无痕 = 高危审计链断点。低频用户路径，
     * 不节流（与 ping 高频路径的节流策略刻意相反）。
     */
    @Test
    public void clusterRawAuditBackfillFailureWarnsSourceAnchor() throws Exception {
        String src = new String(Files.readAllBytes(
                Paths.get("src/main/java/io/github/dengmeiluan/esquerystudio/console/web/"
                        + "InternalEsIndexRebuildController.java")),
                StandardCharsets.UTF_8);

        int raw = src.indexOf("\"cluster/raw\"");
        assertTrue("锚点失效：cluster/raw 端点未找到", raw > -1);
        int exec = src.indexOf("esIndexAdmin.raw(", raw);
        assertTrue("锚点失效：raw 透传调用点未找到", exec > -1);
        int catchIdx = src.indexOf("catch (Exception e)", raw);
        assertTrue("审计摘要回填吞臂必须具名 catch (Exception e)（裸 ignore 已禁）",
                catchIdx > -1 && catchIdx < exec);
        int warnIdx = src.indexOf("审计摘要回填失败", catchIdx);
        assertTrue("回填失败必须落 WARN（本次高危审计缺执行摘要，静默=审计链断点无痕）",
                warnIdx > -1 && warnIdx < exec);
        assertTrue("WARN 文案须带 [esquerystudio-raw] 前缀与「本次高危审计缺执行摘要」语义",
                src.contains("[esquerystudio-raw] 审计摘要回填失败(本次高危审计缺执行摘要)"));
        assertTrue("不得再有无日志的空吞 catch (Exception ignore)",
                !Pattern.compile("catch \\(Exception ignore\\)").matcher(src).find());
    }

    /* ── 工具（Observability552/557 同款） ── */

    private List<ILoggingEvent> events(Level level, String marker) {
        List<ILoggingEvent> out = new ArrayList<ILoggingEvent>();
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == level && e.getFormattedMessage().contains(marker)) {
                out.add(e);
            }
        }
        return out;
    }

    /** 全部 WARN 条数（不看 marker，计数封死）。 */
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
