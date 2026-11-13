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

package io.github.dengmeiluan.esquerystudio.console.core;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.sun.net.httpserver.HttpServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.apache.http.HttpHost;
import org.slf4j.LoggerFactory;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertFalse;

/**
 * {@link EsIndexAdmin#watcherList()} 的 {@code .watches} 子查询失败 <b>WARN 留痕 + reason 回填</b>
 * （观测缺口收口，模板：JdbcConnStoreUpdateVersionWarnTest 的 ListAppender 范式）。
 *
 * <p><b>缺口</b>：内层 catch 此前静默 {@code out.put("watches", emptyMap())}——「watcher 主体统计在、
 * 列表为空」无任何留痕，排查时无法分辨「没配任何 watch」与「.watches 索引读失败」；外层 catch 既有
 * {@code reason} 回填形态，内层照抄字段名补齐。低频路径（仅 Watcher 面板打开时触发），单条 WARN 不刷屏。</p>
 *
 * <p>打点路径：本机 HttpServer 桩（本仓测试基线：无 mockito，直构造在案先例）——
 * {@code GET /_watcher/stats} 放行 200（保证走<b>内层</b>而非外层 catch），{@code POST /.watches/_search}
 * 回 500（低层客户端抛 ResponseException 落内层 catch）。既有契约顺带锁：available 仍为 true、
 * watches 仍为空 map（返回结构不变），且全程不抛。</p>
 *
 * @author aicoding
 */
public class EsIndexAdminWatcherListWarn548Test {

    private HttpServer server;
    private RestHighLevelClient client;
    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() throws Exception {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(EsIndexAdmin.class)).addAppender(appender);

        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/", exchange -> {
            boolean statsOk = "/_watcher/stats".equals(exchange.getRequestURI().getPath());
            byte[] body = statsOk ? "{\"nodes\":{}}".getBytes(StandardCharsets.UTF_8)
                    : "{\"error\":\".watches 桩拒绝(548)\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(statsOk ? 200 : 500, body.length);
            OutputStream os = exchange.getResponseBody();
            os.write(body);
            os.close();
        });
        server.start();
        client = new RestHighLevelClient(
                RestClient.builder(new HttpHost("localhost", server.getAddress().getPort())));
    }

    @After
    public void tearDown() {
        ((Logger) LoggerFactory.getLogger(EsIndexAdmin.class)).detachAppender(appender);
        try {
            client.close();
        } catch (Exception ignore) {
        }
        server.stop(0);
    }

    /** .watches 子查询失败必须落 WARN（列表为空的原因要可分辨），且 watcher 主体结果不受影响、不抛。 */
    @Test
    public void watchesSubQueryFailureLeavesWarnAndReasonWithoutThrowing() throws Exception {
        EsIndexAdmin admin = new EsIndexAdmin(client);

        Map<String, Object> out = admin.watcherList();

        assertTrue("stats 放行 200 才能证明走的是内层 catch（available 必须 true）",
                Boolean.TRUE.equals(out.get("available")));
        assertTrue("watches 仍须置空 map（返回结构不变）",
                out.get("watches") instanceof Map && ((Map<?, ?>) out.get("watches")).isEmpty());
        assertTrue(".watches 读取失败必须回填 reason 字段（照抄外层 catch 形态）",
                out.get("reason") != null);
        assertTrue(".watches 读取失败必须落服务端 WARN（含索引名 .watches），此前静默",
                countWarn() >= 1);
    }

    /** 既有契约锁：全程不抛（列表是增强信息，绝不影响 watcher 主体统计返回）。 */
    @Test
    public void noThrowContractHolds() throws Exception {
        EsIndexAdmin admin = new EsIndexAdmin(client);

        Map<String, Object> out = admin.watcherList();

        assertFalse("watcherList 必须正常返回（不向调用方抛异常）", out == null);
        assertTrue(countWarn() >= 1);
    }

    private int countWarn() {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && e.getFormattedMessage().contains(".watches")) {
                n++;
            }
        }
        return n;
    }
}
