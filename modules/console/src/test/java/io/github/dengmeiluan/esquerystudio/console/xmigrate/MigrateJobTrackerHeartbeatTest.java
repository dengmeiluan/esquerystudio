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
 * 迁移作业<b>周期心跳日志</b>（观测缺口收口，纯日志零契约）。
 *
 * <p><b>缺口</b>：迁移进度此前只落存储（{@code save}）不留服务端日志——长作业（小时级 slice
 * 搬运）在控制台日志里全程静默，排障时无法从日志侧回答「作业还活着吗、搬到哪了」。
 * {@code save} 是进度刷新的必经收口（SliceWorker 持久化槽位驱动），在它上面挂 60s 节流心跳
 * INFO：特征串 {@code [Xmigrate] heartbeat jobId=... done=100/total=1000}。</p>
 *
 * <p>既有契约不动：save 仍吞异常、消息截断与更新时间戳照旧；节流同  save-failed
 * WARN 同款 AtomicLong 范式——心跳纯观测，绝不反噬主逻辑。测试桩用 supplier 返回 null 的
 * 真实 MigrateJobStore（store 落库 NPE 走 tracker 既有 catch，心跳在 try 之前不受影响）。</p>
 */
public class MigrateJobTrackerHeartbeatTest {

    private ListAppender<ILoggingEvent> appender;
    private MigrateJobTracker tracker;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(MigrateJobTracker.class)).addAppender(appender);
        tracker = new MigrateJobTracker(new MigrateJobStore(() -> null, "idx"));
    }

    @After
    public void tearDown() {
        ((Logger) LoggerFactory.getLogger(MigrateJobTracker.class)).detachAppender(appender);
    }

    private static MigrateJobES runningJob(String jobId, Long total, Long migrated) {
        MigrateJobES job = new MigrateJobES();
        job.setJobId(jobId);
        job.setStatus(MigrateJobTracker.STATUS_RUNNING);
        job.setTotal(total);
        job.setMigrated(migrated);
        return job;
    }

    /** RUNNING 作业进度刷新必须落心跳 INFO，特征串 [Xmigrate] jobId=... done=/total= 逐字在案。 */
    @Test
    public void runningSaveEmitsHeartbeatWithFeatureString() {
        tracker.save(runningJob("mig-1", 1000L, 100L));

        ILoggingEvent hb = firstHeartbeat();
        assertTrue("心跳必须落 INFO（排障时从日志侧回答作业还活着吗）", hb != null);
        assertEquals(Level.INFO, hb.getLevel());
        String msg = hb.getFormattedMessage();
        assertTrue("特征串 [Xmigrate] heartbeat jobId= 缺失：" + msg, msg.contains("[Xmigrate] heartbeat jobId=mig-1"));
        assertTrue("done/total 计数形态缺失（done=/total=）：" + msg, msg.contains("done=100/total=1000"));
    }

    /** 60s 节流：窗口内重复 save 不重复出心跳（高频进度刷新不刷屏）。 */
    @Test
    public void heartbeatThrottledWithinWindow() {
        tracker.save(runningJob("mig-2", 1000L, 100L));
        tracker.save(runningJob("mig-2", 1000L, 400L));
        tracker.save(runningJob("mig-2", 1000L, 700L));

        assertEquals("60s 窗口内只允许 1 条心跳", 1, countHeartbeats());
    }

    /** 终态 save 不出心跳（终态自有结果语义，心跳只描述 RUNNING 存活）。 */
    @Test
    public void terminalSaveStaysSilent() {
        MigrateJobES done = runningJob("mig-3", 1000L, 1000L);
        done.setStatus(MigrateJobTracker.STATUS_DONE);
        tracker.save(done);
        assertEquals(0, countHeartbeats());
    }

    /** total/migrated 未知不冒充（凑不出 done=/total= 语义，静默跳过）。 */
    @Test
    public void unknownCountsStaySilent() {
        tracker.save(runningJob("mig-4", null, 100L));
        tracker.save(runningJob("mig-4b", 1000L, null));
        assertEquals(0, countHeartbeats());
    }

    /** 既有契约锁：save 失败仍吞异常不反噬（心跳链路不得引入抛出路径）。 */
    @Test
    public void storeFailureStillSwallowed() {
        MigrateJobTracker failing = new MigrateJobTracker(new MigrateJobStore(() -> null, "idx") {
            @Override public void save(MigrateJobES job) { throw new IllegalStateException("es down"); }
        });
        failing.save(runningJob("mig-5", 10L, 1L)); /* 不抛 = 契约在 */
    }

    private ILoggingEvent firstHeartbeat() {
        for (ILoggingEvent e : appender.list) {
            if (e.getFormattedMessage().contains("[Xmigrate] heartbeat jobId=")) {
                return e;
            }
        }
        return null;
    }

    private int countHeartbeats() {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getFormattedMessage().contains("[Xmigrate] heartbeat jobId=")) {
                n++;
            }
        }
        return n;
    }
}
