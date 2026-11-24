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
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 批量失败落账（{@code addErrors} n&gt;0）的<b>服务端 WARN 留痕</b>（观测缺口收口）。
 *
 * <p><b>缺口</b>：迁移 bulk 级失败重试耗尽时只 {@code addErrors}（全局 errors 计数 + errorSamples
 * 快照字段一条，全仓唯一 n&gt;0 调用点 = {@code SliceWorker#executeWithRetry} 耗尽分支），slice
 * 仍标 DONE、服务端日志面<b>完全无声</b>——slice 致命异常有 WARN（SliceWorker run 的 catch），
 * finalize 只有 jobId 级汇总数字，运维从日志定位不到「哪个 job/slice 丢了多少条」，只能翻
 * progress API 的 errorSamples 滚动快照（上限 20 条）。本测试锁：真实丢数据落账必落 WARN
 * （jobId + 丢失条数在案）；n=0（slice 致命异常的零计数样本登记）不重复打——那条路径
 * SliceWorker 已有自己的 WARN，handle 层再打就是双条噪音。</p>
 *
 * <p>形态同 {@link MigrationHandleObservabilityTest}：纯 JUnit 直构造（MigrationHandle 无 ES
 * 依赖，bulk 桩不需要——high-level client 的 bulk 为 final 本就不可覆写）。</p>
 *
 * @author aicoding
 */
public class MigrationHandleErrorObservabilityTest {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(MigrationHandle.class)).addAppender(appender);
    }

    @After
    public void tearDown() {
        ((Logger) LoggerFactory.getLogger(MigrationHandle.class)).detachAppender(appender);
    }

    private static MigrationHandle handle() {
        MigrateJobES meta = new MigrateJobES();
        meta.setJobId("job-log-1");
        meta.setSourceIndex("src");
        meta.setDestIndex("dst");
        return new MigrationHandle("job-log-1", new RemoteClusterConn(), null, meta, 0L);
    }

    /** n&gt;0（bulk 重试耗尽落账）：既有计数/样本不回退，新增 WARN 含 jobId 与丢失条数。 */
    @Test
    public void bulkErrorLedgerLeavesServerSideWarn() {
        MigrationHandle h = handle();
        h.addErrors(2L, "slice 3 bulk 失败 2 条，已重试 2 次");

        /* 既有行为顺带锁：耗尽即计全局 errors、errorSamples 收一条样本 */
        assertEquals(2L, h.toJobEs().getErrors().longValue());
        assertEquals(1, h.toJobEs().getErrorSamples().size());

        /* 新行为（本批收口）：服务端 WARN 留痕，jobId + 丢失条数可检索 */
        assertTrue("bulk 失败落账必须落服务端 WARN（jobId+条数在案），此前只进 errorSamples 快照字段",
                hasWarnContaining("job-log-1") && hasWarnContaining("2 条"));
    }

    /** n=0（slice 致命异常的零计数样本登记）：不打 WARN——该路径 SliceWorker 已有自己的 WARN。 */
    @Test
    public void zeroCountSampleDoesNotDuplicateWarn() {
        MigrationHandle h = handle();
        h.addErrors(0L, "slice 0 异常: boom");

        assertEquals("零计数样本不计 errors", 0L, h.toJobEs().getErrors().longValue());
        assertEquals(1, h.toJobEs().getErrorSamples().size());
        assertEquals("样本登记（n=0）不得产生 WARN（防与 SliceWorker catch 的 WARN 双条噪音）",
                0, countWarn());
    }

    private boolean hasWarnContaining(String fragment) {
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && e.getFormattedMessage().contains(fragment)) {
                return true;
            }
        }
        return false;
    }

    private int countWarn() {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN) {
                n++;
            }
        }
        return n;
    }
}
