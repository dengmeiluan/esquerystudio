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

package io.github.dengmeiluan.esquerystudio.console.boot;

import org.apache.http.HttpHost;
import org.apache.http.auth.AuthScope;
import org.apache.http.auth.UsernamePasswordCredentials;
import org.apache.http.impl.client.BasicCredentialsProvider;
import io.github.dengmeiluan.esquerystudio.rest.EsRestClient;
import io.github.dengmeiluan.esquerystudio.rest.LowLevelEsRestClient;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestClientBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Shared low-level Elasticsearch client for the Boot 3/4 artifacts. The low-level
 * REST API is stable across ES 8.x/9.x; the Boot version only supplies the server
 * and Spring baseline.
 */
@Configuration
public class EsRestClientConfiguration {

    @Bean(destroyMethod = "close")
    public RestClient restClient(
            @Value("${esquerystudio.elasticsearch.url:http://localhost:9200}") String url,
            @Value("${esquerystudio.elasticsearch.username:}") String username,
            @Value("${esquerystudio.elasticsearch.password:}") String password) {
        RestClientBuilder builder = RestClient.builder(HttpHost.create(url));
        if (!username.trim().isEmpty()) {
            BasicCredentialsProvider credentials = new BasicCredentialsProvider();
            credentials.setCredentials(AuthScope.ANY,
                    new UsernamePasswordCredentials(username, password));
            builder.setHttpClientConfigCallback(client -> client.setDefaultCredentialsProvider(credentials));
        }
        return builder.build();
    }

    @Bean
    public EsRestClient esRestClient(RestClient restClient) {
        return lowLevel(restClient);
    }

    static EsRestClient lowLevel(RestClient restClient) {
        return new LowLevelEsRestClient(restClient);
    }
}
