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

package io.github.dengmeiluan.esquerystudio.console.config;

import org.junit.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 宿主冲突面守卫装配测试：starter 被第三方宿主引入时的「零冲突退出」语义。
 *
 * <p>覆盖三类守卫：① 非 Servlet 宿主（纯后端/WebFlux）下全部 Web 装配整体退出，
 * 引擎侧 Bean 不受影响、上下文不因缺 Web 类而启动失败；② 写重试切面（会代理宿主
 * {@code ElasticsearchOperations}）具备配置级一票否决权；③ ES 栈契约校验（fail-fast 件）
 * 同样可被宿主显式关闭。三个开关默认值均保持既有行为不变。</p>
 */
public class HostConflictGuardWiringTest {

    private ApplicationContextRunner nonWebRunner() {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(ESQueryStudioConsoleAutoConfiguration.class));
    }

    private WebApplicationContextRunner webRunner(String... props) {
        return new WebApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(ESQueryStudioConsoleAutoConfiguration.class))
                .withPropertyValues(props);
    }

    /** 非 Servlet 宿主（默认 client 模式）：Web 件整体退出，引擎件照常装配，上下文健康。 */
    @Test
    public void webBeansAbsentInNonServletEnvironment() {
        nonWebRunner().run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean("consoleAssetGuard");
            assertThat(context).doesNotHaveBean("desiredStateController");
            // 非 Web 引擎件不受环境影响
            assertThat(context).hasBean("esWriteRetryAspect");
            assertThat(context).hasBean("esStackContractValidator");
            assertThat(context).hasBean("indexMetaRegistry");
            assertThat(context).hasBean("esWriteRetryTemplate");
        });
    }

    /** 非 Servlet 宿主显式配置 mode=console（矛盾形态）：console 块静默退出而非启动失败。 */
    @Test
    public void consoleModeBlockSkippedInNonServletEnvironment() {
        nonWebRunner()
                .withPropertyValues("esquerystudio.elasticsearch.mode=console")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean("consoleCacheConfigurer");
                    assertThat(context).doesNotHaveBean("connStore");
                });
    }

    /** write-retry-aspect-enabled=false：切面 Bean 整体退出；重试模板保留（编程式使用不受影响）。 */
    @Test
    public void writeRetryAspectCanBeDisabled() {
        webRunner("esquerystudio.elasticsearch.write-retry-aspect-enabled=false").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean("esWriteRetryAspect");
            assertThat(context).hasBean("esWriteRetryTemplate");
        });
    }

    /** 默认不配置：切面照常装配——强侵入特性的既有默认行为不变。 */
    @Test
    public void writeRetryAspectOnByDefault() {
        webRunner().run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasBean("esWriteRetryAspect");
        });
    }

    /** stack-contract-enabled=false：栈契约校验退出，宿主以配置明示接受风险。 */
    @Test
    public void stackContractValidatorCanBeDisabled() {
        webRunner("esquerystudio.elasticsearch.stack-contract-enabled=false").run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean("esStackContractValidator");
            assertThat(context).hasBean("indexMetaRegistry");
        });
    }
}
