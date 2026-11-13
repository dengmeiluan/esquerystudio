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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioConsoleAutoConfiguration;
import org.junit.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * MCP 端点的装配守卫。starter 明确「显式 @Bean，不用 @ComponentScan」，
 * 所以类上的 @RestController 不参与真实宿主装配；漏掉自动配置里的 @Bean，
 * 单测可以全绿而运行期 /mcp 是 404。本切片只注册自动配置、零组件扫描，
 * 分别验证 mcp.enabled 与 web-enabled 两个开关的真实装配结果。
 */
public class McpWiringTest {

    private ApplicationContextRunner runner(String... extra) {
        String[] base = {
                "esquerystudio.elasticsearch.mode=console",
                "esquerystudio.mcp.token=secret",
        };
        String[] all = new String[base.length + extra.length];
        System.arraycopy(base, 0, all, 0, base.length);
        System.arraycopy(extra, 0, all, base.length, extra.length);
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(ESQueryStudioConsoleAutoConfiguration.class))
                .withPropertyValues(all);
    }

    @Test
    public void endpointWiresOnlyWhenExplicitlyEnabled() {
        runner("esquerystudio.mcp.enabled=true").run(ctx -> {
            assertThat(ctx.getStartupFailure()).as("无组件扫描装配必须启动成功").isNull();
            assertThat(ctx.getBean(McpController.class))
                    .as("mcp.enabled=true 时端点必须在场（缺席=运行期 404）")
                    .isNotNull();
            assertThat(ctx.getBean(McpKeyController.class)).isNotNull();
            assertThat(ctx.getBean(McpKeyStore.class)).isNotNull();
            assertThat(ctx.getBean(McpAccessService.class)).isNotNull();
        });
        runner("esquerystudio.mcp.enabled=false").run(ctx -> {
            assertThat(ctx.getStartupFailure()).isNull();
            assertThat(ctx).doesNotHaveBean(McpController.class);
        });
    }

    @Test
    public void webDisabledKeepsTheEndpointOff() {
        runner("esquerystudio.mcp.enabled=true", "esquerystudio.elasticsearch.web-enabled=false").run(ctx -> {
            assertThat(ctx.getStartupFailure()).isNull();
            assertThat(ctx)
                    .as("web-enabled=false 承诺关闭 Web 面，MCP 不得单独留一个 HTTP 端点")
                    .doesNotHaveBean(McpController.class);
        });
    }
}
