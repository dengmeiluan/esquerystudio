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
import org.apache.http.message.BasicRequestLine;

/**
 * 测试工具：构造 {@link Response} 实例。
 *
 * <p>{@code Response} 的构造器是<b>包私有</b>的（见 rest-client 7.6.2 源码），
 * 外部包无法直接 new。本类刻意放在 {@code org.elasticsearch.client} 包下的<b>测试源码</b>里，
 * 借同包可见性开一个构造入口，供 {@code RestClientEsProbeTest} 仿真 ES 的非 2xx 回包
 * （{@link ResponseException} 的构造需要一个 {@code Response}）。</p>
 *
 * <p><b>为什么不用 mock 框架</b>：本工程硬约束「零新增依赖，含测试依赖」，
 * Mockito 等一律不许加。同包工具类是 Java 8 下不加依赖就能拿到包私有构造器的唯一办法。</p>
 *
 * @author aicoding
 */
public final class EsResponses {

    private EsResponses() {
    }

    /** 用给定的 HTTP 回包构造 {@link Response}；requestLine / host 只是占位，断言不依赖它们。 */
    public static Response of(HttpResponse httpResponse) {
        return new Response(
                new BasicRequestLine("GET", "/_test", httpResponse.getStatusLine().getProtocolVersion()),
                new HttpHost("localhost", 9200),
                httpResponse);
    }
}
