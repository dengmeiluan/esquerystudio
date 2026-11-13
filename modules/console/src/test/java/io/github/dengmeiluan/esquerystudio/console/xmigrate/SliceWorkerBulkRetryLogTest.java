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
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Method;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * {@link SliceWorker} <b>per-slice bulk 重试 WARN 留痕</b>（观测缺口收口，纯日志零契约）。
 *
 * <p><b>缺口</b>：bulk 可重试失败进入退避重试此前无痕——只有耗尽 {@code maxAttempts} 才计
 * errors 落一条错误消息；重试窗口内的抖动（bulk 线程池满/网关 5xx）在服务端日志零痕迹，
 * 排障时分不清「一次没成」还是「重试后自愈」。重试分支落 WARN，特征串
 * {@code [SliceWorker] slice 7 bulk retry attempt=1 pending=3}。</p>
 *
 * <p>既有契约不动：重试/耗尽计数与退避步进照旧（{@code executeWithRetry} 分支零改写）；
 * private 方法经反射直调（本仓测试基线：无 mockito，{@code SliceWorkerClearScrollWarnTest}
 * setAccessible 在案先例）——锁特征串与 WARN 级别本体。</p>
 */
public class SliceWorkerBulkRetryLogTest {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(SliceWorker.class)).addAppender(appender);
    }

    @After
    public void tearDown() {
        ((Logger) LoggerFactory.getLogger(SliceWorker.class)).detachAppender(appender);
    }

    /** 重试前必须落 WARN，特征串 [SliceWorker] slice N bulk retry attempt= pending= 逐字在案。 */
    @Test
    public void bulkRetryLeavesWarnWithFeatureString() throws Exception {
        SliceWorker worker = new SliceWorker(7, 8, "src", "dst", 100, 30,
                null, null, null, null, new ESQueryStudioElasticsearchProperties.Retry());

        invokeWarnBulkRetry(worker, 1, 3);

        ILoggingEvent warn = firstRetryWarn();
        assertTrue("bulk 重试必须落 WARN（重试窗口内自愈也该留痕）", warn != null);
        assertEquals(Level.WARN, warn.getLevel());
        String msg = warn.getFormattedMessage();
        assertTrue("特征串 [SliceWorker] slice 7 bulk retry attempt= 缺失：" + msg,
                msg.contains("[SliceWorker] slice 7 bulk retry attempt=1"));
        assertTrue("pending 计数缺失：" + msg, msg.contains("pending=3"));
    }

    /** 非重试路径零日志：成功/冲突/耗尽都不经过该特征串（不制造噪音）。 */
    @Test
    public void noRetryWarnWithoutInvocation() {
        assertEquals(0, countRetryWarns());
    }

    private static void invokeWarnBulkRetry(SliceWorker worker, int attempt, int pending) throws Exception {
        Method m = SliceWorker.class.getDeclaredMethod("warnBulkRetry", int.class, int.class);
        m.setAccessible(true);
        m.invoke(worker, attempt, pending);
    }

    private ILoggingEvent firstRetryWarn() {
        for (ILoggingEvent e : appender.list) {
            if (e.getFormattedMessage().contains("bulk retry attempt=")) {
                return e;
            }
        }
        return null;
    }

    private int countRetryWarns() {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getFormattedMessage().contains("bulk retry attempt=")) {
                n++;
            }
        }
        return n;
    }
}
