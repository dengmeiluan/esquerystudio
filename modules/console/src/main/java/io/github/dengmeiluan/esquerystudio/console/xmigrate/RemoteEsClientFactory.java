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

import org.apache.http.Header;
import org.apache.http.HttpHost;
import org.apache.http.message.BasicHeader;
import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.client.CredentialsProvider;
import org.apache.http.impl.client.BasicCredentialsProvider;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestClientBuilder;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 由 {@link RemoteClusterConn} 构建连旧集群的临时 {@link RestHighLevelClient}。
 *
 * <p>返回的 client 是 {@link AutoCloseable}，编排层用 try-with-resources / finally 关闭——
 * 连接与凭据「用完即弃」，不做 bean、不进 Spring 容器。connect/socket 超时由 starter 配置注入。</p>
 */
public class RemoteEsClientFactory {

    private static final Logger logger = LoggerFactory.getLogger(RemoteEsClientFactory.class);

    private final int connectTimeoutMs;
    private final int socketTimeoutMs;

    public RemoteEsClientFactory(int connectTimeoutMs, int socketTimeoutMs) {
        this.connectTimeoutMs = connectTimeoutMs;
        this.socketTimeoutMs = socketTimeoutMs;
    }

    /**
     * 构建临时 client。调用方负责 {@code close()}。
     */
    public RestHighLevelClient build(RemoteClusterConn conn) {
        conn.validate();
        RestClientBuilder builder = RestClient.builder(
                new HttpHost(conn.getHost(), conn.getPort(), conn.getScheme()));

        if (conn.isApiKeyAuth()) {
            // API Key 形态（连接中心自动同步批）：secret 走 Authorization: ApiKey 头，
            // 不经 Apache 凭据方案——版本无关，探活/数据面/迁移全链路自动生效
            builder.setDefaultHeaders(new Header[]{
                    new BasicHeader("Authorization", "ApiKey " + conn.getPassword())});
        } else if (conn.hasCredentials()) {
            final CredentialsProvider credentialsProvider = new BasicCredentialsProvider();
            credentialsProvider.setCredentials(AuthScope.ANY,
                    new UsernamePasswordCredentials(conn.getUsername(), conn.getPassword()));
            builder.setHttpClientConfigCallback(hc -> hc.setDefaultCredentialsProvider(credentialsProvider));
        }
        // 档案带独立超时则覆盖全局默认（慢集群调大 / 探活调小互不干扰）
        final int connectMs = conn.getConnectTimeoutMs() != null ? conn.getConnectTimeoutMs() : connectTimeoutMs;
        final int socketMs = conn.getSocketTimeoutMs() != null ? conn.getSocketTimeoutMs() : socketTimeoutMs;
        builder.setRequestConfigCallback(rc -> rc
                .setConnectTimeout(connectMs)
                .setSocketTimeout(socketMs));

        // 脱敏日志：仅 endpoint，不含密码
        logger.info("[RemoteEsClientFactory] build remote client -> {}", conn);
        return new RestHighLevelClient(builder);
    }
}
