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

import java.lang.reflect.Method;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * {@link SliceWorker#clearScrollQuietly} 失败的 <b>WARN 留痕</b>（观测缺口收口）。
 *
 * <p><b>缺口</b>：clearScroll 失败此前仅 {@code logger.debug("clearScroll ignore")}——该路径
 * 是低频真异常（远端集群断连/网关 4xx），失败即意味着 scroll 上下文在远端残留到 keep-alive
 * 到期，资源泄漏无痕可查。debug 级在常态日志级别下不可见，升级 WARN 留痕。</p>
 *
 * <p>既有契约不动：方法仍吞异常（清尾路径绝不反噬迁移主流程）、null scrollId 仍早退零日志。
 * private 方法经反射直调（本仓测试基线：无 mockito，setAccessible 在案先例），
 * remoteLowLevel 传 null 使 performRequest 处 NPE 落 catch——与真实 IO 异常同一 catch 出口。</p>
 *
 * @author aicoding
 */
public class SliceWorkerClearScrollWarnTest {

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

    /** clearScroll 失败必须落 WARN（scroll 上下文资源泄漏留痕），不再只进 debug。 */
    @Test
    public void clearScrollFailureLeavesWarn() throws Exception {
        SliceWorker worker = new SliceWorker(0, 1, "src", "dst", 100, 30,
                null, null, null, null, null);

        invokeClearScroll(worker, "scroll-abc");

        assertTrue("clearScroll 失败必须落服务端 WARN（scroll 上下文泄漏留痕），此前只有 debug",
                countWarnContaining("clearScroll") >= 1);
    }

    /** 既有契约锁：null scrollId 早退，零日志（清尾无从谈起时不产生噪音）。 */
    @Test
    public void nullScrollIdStaysSilent() throws Exception {
        SliceWorker worker = new SliceWorker(0, 1, "src", "dst", 100, 30,
                null, null, null, null, null);

        invokeClearScroll(worker, null);

        assertEquals("null scrollId 早退不得产生 WARN", 0, countWarnContaining("clearScroll"));
    }

    private static void invokeClearScroll(SliceWorker worker, String scrollId) throws Exception {
        Method m = SliceWorker.class.getDeclaredMethod("clearScrollQuietly", String.class);
        m.setAccessible(true);
        m.invoke(worker, scrollId);
    }

    private int countWarnContaining(String fragment) {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && e.getFormattedMessage().contains(fragment)) {
                n++;
            }
        }
        return n;
    }
}
