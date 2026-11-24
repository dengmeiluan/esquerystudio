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

import io.github.dengmeiluan.esquerystudio.rest.EsRestClient;
import org.elasticsearch.client.RestClient;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

/**
 * One entry point for Boot 2.3 / 2.7 / 3.5 / 4.2 hosts: adding the dependency and pointing
 * {@code esquerystudio.elasticsearch.url} at a cluster mounts the console shell and the
 * read/write API. Hosts override behaviour by registering a {@code ConsoleAuthProvider}.
 *
 * <p>Registered twice on purpose: Boot 2.7+ reads
 * {@code META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports},
 * while Boot 2.3 (whose autoconfigure has no {@code @AutoConfiguration} annotation) reads
 * {@code META-INF/spring.factories}. Both entries point at this class; the plain
 * {@code @Configuration} is what Boot 2.3 actually needs, and Boot ignores the annotation it
 * does not know. Boot 2.7+ de-duplicates across the two files, Boot 3/4 ignore
 * {@code spring.factories} for auto-configuration.</p>
 */
@AutoConfiguration
@Configuration(proxyBeanMethods = false)
@ConditionalOnClass({RestClient.class, EsRestClient.class})
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@Import({EsRestClientConfiguration.class, BootHealthController.class,
        BootSearchController.class, BootSqlController.class, BootRootController.class,
        BootConsoleApiController.class, BootXmigrateController.class})
public class EsQueryStudioBootAutoConfiguration {

    /** Optional convenience bean: hosts may inject the shared contract directly. */
    @Bean
    @ConditionalOnBean(RestClient.class)
    @ConditionalOnMissingBean(EsRestClient.class)
    public EsRestClient esQueryStudioRestClient(RestClient restClient) {
        return EsRestClientConfiguration.lowLevel(restClient);
    }

    /** Shared engine context (low-level client + lazily probed server version). */
    @Bean
    @ConditionalOnBean(RestClient.class)
    @ConditionalOnMissingBean(io.github.dengmeiluan.esquerystudio.rest.EsClientContext.class)
    public io.github.dengmeiluan.esquerystudio.rest.EsClientContext esQueryStudioClientContext(RestClient restClient) {
        return new BootEsClientContext(restClient);
    }

    /** Index/alias/reindex engine on the shared context (same bytecode as the full console). */
    @Bean
    @ConditionalOnBean(io.github.dengmeiluan.esquerystudio.rest.EsClientContext.class)
    @ConditionalOnMissingBean(io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin.class)
    public io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin esQueryStudioIndexAdmin(
            io.github.dengmeiluan.esquerystudio.rest.EsClientContext context) {
        return io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin.overContext(context);
    }

    /**
     * Shared MCP endpoint (same 17-group surface as the full console). Enabled explicitly by
     * {@code esquerystudio.mcp.enabled=true}; the service Bearer token is mandatory. Console-only
     * actions (adhoc rebuild / cross-cluster migration / console stores) fail with an explicit
     * "not available in this deployment" tool error instead of silently degrading.
     */
    @Bean(destroyMethod = "shutdownTasks")
    @ConditionalOnMissingBean
    @ConditionalOnBean(io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin.class)
    @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(
            prefix = "esquerystudio.mcp", name = "enabled", havingValue = "true")
    public io.github.dengmeiluan.esquerystudio.console.mcp.McpServerCore esQueryStudioMcpServer(
            io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin esIndexAdmin,
            org.springframework.beans.factory.ObjectProvider<
                    io.github.dengmeiluan.esquerystudio.console.mcp.McpAccessService> accessProvider,
            @org.springframework.beans.factory.annotation.Value("${esquerystudio.mcp.token:}") String token,
            @org.springframework.beans.factory.annotation.Value(
                    "${esquerystudio.mcp.call-timeout-ms:180000}") long callTimeoutMs) {
        long budget = callTimeoutMs > 0 ? callTimeoutMs : 180_000L;
        /* A host that registers McpAccessService (its own key/quota/audit stores) gets API-key auth
           as well; otherwise the service Bearer token is the only credential. */
        return new io.github.dengmeiluan.esquerystudio.console.mcp.McpServerCore(
                esIndexAdmin, token, accessProvider.getIfAvailable(), new HostMcpTargetRouter(), null, budget);
    }
}