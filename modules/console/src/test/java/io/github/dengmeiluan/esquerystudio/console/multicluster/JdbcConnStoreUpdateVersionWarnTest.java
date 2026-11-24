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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.io.PrintWriter;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.sql.Statement;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * {@link JdbcConnStore#updateVersion} 失败的 <b>WARN 留痕</b>（观测缺口收口）。
 *
 * <p><b>缺口</b>：UPDATE 失败此前仅 {@code LOG.debug("updateVersion failed")}——es_version
 * 回填是探活链路的增强信息，写失败意味着「探活到了新版本但档案不更新」，排查版本不刷新
 * 问题时 debug 级常态不可见。低频真异常路径，升级 WARN 留痕（ensureSchema 失败的早退分支
 * 有自身语义——schema 建不出来是更上层问题，且探活主流程继续，本批不动其 debug）。</p>
 *
 * <p>既有契约顺带锁：updateVersion 仍永不抛（版本是增强信息，绝不影响探活主流程）；
 * 空 id/空版本早退零日志。打点路径：ensureSchema 成功后 UPDATE 阶段断连——桩 DataSource
 * 首次 getConnection（建表）放行，其后（UPDATE）抛 SQLException；Connection/Statement 用
 * 动态代理桩（本仓测试基线：无 mockito，直构造+反射在案先例）。</p>
 *
 * @author aicoding
 */
public class JdbcConnStoreUpdateVersionWarnTest {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(JdbcConnStore.class)).addAppender(appender);
    }

    @After
    public void tearDown() {
        ((Logger) LoggerFactory.getLogger(JdbcConnStore.class)).detachAppender(appender);
    }

    /** UPDATE 阶段失败必须落 WARN（探活到版本但档案写不进，不可无痕），且仍不向探活链路抛异常。 */
    @Test
    public void updateVersionFailureLeavesWarnWithoutThrowing() {
        JdbcConnStore store = new JdbcConnStore(schemaOnceThenBrokenDataSource());

        store.updateVersion("conn-1", "7.17.0");

        assertTrue("updateVersion UPDATE 失败必须落服务端 WARN（id 在案），此前只有 debug",
                countUpdateVersionWarn() >= 1);
    }

    /** 既有契约锁：空 id 早退零日志；正常入参失败也不抛（增强信息不反噬探活主流程）。 */
    @Test
    public void guardClauseAndNoThrowContractHold() {
        JdbcConnStore store = new JdbcConnStore(schemaOnceThenBrokenDataSource());

        store.updateVersion(null, "7.17.0");
        store.updateVersion("  ", "7.17.0");
        store.updateVersion("conn-1", " ");
        assertEquals("非法入参早退不得产生 WARN", 0, countUpdateVersionWarn());

        /* 失败路径不抛——void 返回、异常吞在店内 */
        store.updateVersion("conn-1", "7.17.0");
        assertTrue(countUpdateVersionWarn() >= 1);
    }

    /* ── 桩：ensureSchema 放行一次，其后断连 ── */

    /** 首次 getConnection（ensureSchema 建表）返回可用的代理 Connection，其后抛 SQLException。 */
    private static DataSource schemaOnceThenBrokenDataSource() {
        final AtomicInteger calls = new AtomicInteger();
        return new DataSource() {
            @Override
            public Connection getConnection() throws SQLException {
                if (calls.incrementAndGet() == 1) {
                    return workingConnectionStub();
                }
                throw new SQLException("UPDATE 阶段断连(桩)");
            }

            @Override
            public Connection getConnection(String username, String password) throws SQLException {
                return getConnection();
            }

            @Override
            public <T> T unwrap(Class<T> iface) throws SQLException {
                throw new SQLException("桩不支持");
            }

            @Override
            public boolean isWrapperFor(Class<?> iface) {
                return false;
            }

            @Override
            public PrintWriter getLogWriter() {
                return null;
            }

            @Override
            public void setLogWriter(PrintWriter out) {
            }

            @Override
            public void setLoginTimeout(int seconds) {
            }

            @Override
            public int getLoginTimeout() {
                return 0;
            }

            @Override
            public java.util.logging.Logger getParentLogger() throws SQLFeatureNotSupportedException {
                throw new SQLFeatureNotSupportedException("桩不支持");
            }
        };
    }

    /** 最小可用 Connection/Statement 代理：createStatement().execute(ddl) 放行，其余默认空。 */
    private static Connection workingConnectionStub() {
        ClassLoader cl = JdbcConnStoreUpdateVersionWarnTest.class.getClassLoader();
        InvocationHandler statementHandler = (proxy, method, args) -> defaultStub(method);
        InvocationHandler connectionHandler = (proxy, method, args) -> {
            if ("createStatement".equals(method.getName())) {
                return Proxy.newProxyInstance(cl, new Class<?>[]{Statement.class}, statementHandler);
            }
            return defaultStub(method);
        };
        return (Connection) Proxy.newProxyInstance(cl, new Class<?>[]{Connection.class}, connectionHandler);
    }

    /** Object 默认方法与无返回桩：toString 给个可读值，hashCode/equals 走系统默认即可。 */
    private static Object defaultStub(Method method) throws Throwable {
        String name = method.getName();
        if ("toString".equals(name)) {
            return "stub";
        }
        if ("hashCode".equals(name)) {
            return System.identityHashCode(method.getDeclaringClass());
        }
        Class<?> rt = method.getReturnType();
        if (rt == boolean.class) {
            return false;
        }
        if (rt == int.class) {
            return 0;
        }
        return null;
    }

    private int countUpdateVersionWarn() {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && e.getFormattedMessage().contains("updateVersion")) {
                n++;
            }
        }
        return n;
    }
}
