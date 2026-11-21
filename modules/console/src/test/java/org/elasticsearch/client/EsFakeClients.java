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

package org.elasticsearch.client;

import org.apache.http.HttpHost;
import org.apache.http.HttpResponse;
import org.apache.http.ProtocolVersion;
import org.apache.http.entity.StringEntity;
import org.apache.http.message.BasicHttpResponse;
import org.apache.http.message.BasicStatusLine;

import java.io.IOException;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 测试工具：构造<b>不联网</b>的 {@link RestHighLevelClient}。
 *
 * <p>{@link RestHighLevelClient} 接收 {@link RestClient} 的构造器是 {@code protected}，
 * 而 {@link RestClient} 的构造器是<b>包私有</b>的（rest-client 7.6.2）。本类刻意放在
 * {@code org.elasticsearch.client} 包下的<b>测试源码</b>里，借同包可见性开一个构造入口
 * ——与既有的 {@link EsResponses} 同一手法。</p>
 *
 * <p><b>为什么需要真的 client 而不是覆写被测方法</b>：
 * {@code HostEsVersionProvider} 的缓存键是「client 实例身份」，
 * 若测试覆写 {@code currentVersion()} 直接给值，缓存逻辑本身就<b>整段不被执行</b>，
 * 「重绑后是否重探」也就无从断言。必须让被测代码走真实的 {@code GET /} 路径。</p>
 *
 * <p><b>零新增依赖</b>：本工程硬约束不许加 mock 框架，同包 + 继承是 Java 8 下唯一办法。</p>
 *
 * @author aicoding
 */
public final class EsFakeClients {

    private EsFakeClients() {
    }

    /**
     * 造一个对<b>任何</b>请求都回 {@code 200 + 给定 body} 的 client。
     *
     * @param body   响应体 JSON
     * @param counter 每收到一个请求 +1（可为 null）；用来断言「同一 client 只探一次」
     */
    public static RestHighLevelClient respondingWith(String body, AtomicInteger counter) {
        return new RestHighLevelClient(new StubRestClient(body, counter), c -> {
        }, Collections.emptyList());
    }

    /**
     * 造一个由 {@code handler} 决定每个请求如何回应的 client。
     *
     * <p>handler 收到 {@link Request}，返回响应体字符串表示 200；
     * 需要仿真非 2xx 时直接抛 {@link ResponseException}（用 {@link #responseException} 造）。</p>
     */
    public static RestHighLevelClient scripted(Handler handler) {
        return new RestHighLevelClient(new ScriptedRestClient(handler), c -> {
        }, Collections.emptyList());
    }

    /** 请求处理器：返回 200 响应体，或抛异常仿真错误回包。 */
    public interface Handler {
        String handle(Request request) throws IOException;
    }

    /** 造一个带真实 ES 错误结构响应体的 {@link ResponseException}。 */
    public static ResponseException responseException(int status, String body) throws IOException {
        HttpResponse http = new BasicHttpResponse(
                new BasicStatusLine(new ProtocolVersion("HTTP", 1, 1), status, "reason"));
        http.setEntity(new StringEntity(body, "UTF-8"));
        return new ResponseException(EsResponses.of(http));
    }

    /** 按 handler 合成回包的 {@link RestClient}。 */
    private static final class ScriptedRestClient extends RestClient {
        private final Handler handler;

        ScriptedRestClient(Handler handler) {
            super(org.apache.http.impl.nio.client.HttpAsyncClients.createDefault(),
                    new org.apache.http.Header[0],
                    Collections.singletonList(new Node(new HttpHost("localhost", 9200))),
                    null, null, null, false);
            this.handler = handler;
        }

        @Override
        public Response performRequest(Request request) throws IOException {
            String body = handler.handle(request);
            HttpResponse http = new BasicHttpResponse(
                    new BasicStatusLine(new ProtocolVersion("HTTP", 1, 1), 200, "OK"));
            http.setEntity(new StringEntity(body == null ? "{}" : body, "UTF-8"));
            return EsResponses.of(http);
        }
    }

    /** 不发网络请求的 {@link RestClient}：直接合成回包。 */
    private static final class StubRestClient extends RestClient {
        private final String body;
        private final AtomicInteger counter;

        StubRestClient(String body, AtomicInteger counter) {
            super(org.apache.http.impl.nio.client.HttpAsyncClients.createDefault(),
                    new org.apache.http.Header[0],
                    Collections.singletonList(new Node(new HttpHost("localhost", 9200))),
                    null, null, null, false);
            this.body = body;
            this.counter = counter;
        }

        @Override
        public Response performRequest(Request request) throws IOException {
            if (counter != null) {
                counter.incrementAndGet();
            }
            HttpResponse http = new BasicHttpResponse(
                    new BasicStatusLine(new ProtocolVersion("HTTP", 1, 1), 200, "OK"));
            http.setEntity(new StringEntity(body, "UTF-8"));
            return EsResponses.of(http);
        }
    }
}
