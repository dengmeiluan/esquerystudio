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

/**
 * {@link EsIndexAdmin#remoteClusters()} 本端信息 {@code GET /} 失败 <b>WARN 留痕</b>
 * （观测缺口收口，模板：JdbcConnStoreUpdateVersionWarnTest 的 ListAppender 范式）。
 *
 * <p><b>缺口</b>：末段 {@code catch (Exception ignored) {}} 完全空体——远端列表正常而本端
 * name/version 探测失败时零痕迹，前端 localClusterName/localVersion 静默缺列，无从排查。
 * <b>只加日志、不动返回结构</b>：remotes/count/reason 形态是 RemoteClustersView 的消费面，
 * 本批禁改（任务裁决在案）。</p>
 *
 * <p>打点路径：本机 HttpServer 桩——{@code GET /_remote/info} 放行 200（保证越过外层 catch），
 * {@code GET /} 回 500（落本批目标 catch）。既有契约顺带锁：remotes/count 键仍在、全程不抛。</p>
 *
 * @author aicoding
 */
public class EsIndexAdminRemoteClustersWarn548Test {

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
            boolean infoOk = "/_remote/info".equals(exchange.getRequestURI().getPath());
            byte[] body = infoOk ? "{}".getBytes(StandardCharsets.UTF_8)
                    : "{\"error\":\"本端信息桩拒绝(548)\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(infoOk ? 200 : 500, body.length);
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

    /** 本端信息（GET /）失败必须落 WARN 留痕；返回结构不变（remotes/count 键仍在），且不抛。 */
    @Test
    public void localInfoFailureLeavesWarnWithoutThrowingAndKeepsShape() throws Exception {
        EsIndexAdmin admin = new EsIndexAdmin(client);

        Map<String, Object> out = admin.remoteClusters();

        assertTrue("remoteClusters 必须正常返回（不向调用方抛异常）", out != null);
        assertTrue("remotes 键必须仍在（返回结构不变——RemoteClustersView 消费面禁改）",
                out.get("remotes") instanceof Map);
        assertTrue("count 键必须仍在（返回结构不变）", out.get("count") instanceof Number);
        assertTrue("本端信息读取失败必须落服务端 WARN（含 remoteClusters 标识），此前完全空体",
                countWarn() >= 1);
    }

    private int countWarn() {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && e.getFormattedMessage().contains("remoteClusters")) {
                n++;
            }
        }
        return n;
    }
}
