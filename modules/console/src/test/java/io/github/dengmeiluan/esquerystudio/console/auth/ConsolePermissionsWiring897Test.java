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

package io.github.dengmeiluan.esquerystudio.console.auth;

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioConsoleAutoConfiguration;
import org.junit.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 权限自查端点的装配形态守卫：starter 的组件装配立法为「显式 {@code @Bean}，不用
 * {@code @ComponentScan}」——独立部署入口与标准宿主都不扫描本 starter 的包路径，类上的
 * {@code @Component} 注解在真实运行环境是死注解。{@code ConsolePermissionsController} 的
 * 装配条件锚定 {@code EnvPagesResolver} 类型，而该类型必须先有容器可见的注册来源，
 * 端点才可能装配；本切片以「只注册自动配置、零组件扫描」复刻独立部署/标准宿主的真实
 * 装配路径，断言端点与页面解析器双双在场——任何一环静默缺席，用户侧表现为
 * {@code /auth/permissions} 404。
 */
public class ConsolePermissionsWiring897Test {

    private ApplicationContextRunner runner() {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(ESQueryStudioConsoleAutoConfiguration.class))
                .withPropertyValues("esquerystudio.elasticsearch.mode=console");
    }

    @Test
    public void permissionsEndpointWiresWithoutComponentScanning() {
        runner().run(ctx -> {
            assertThat(ctx.getStartupFailure())
                    .as("无组件扫描装配（独立部署/标准宿主形态）必须启动成功").isNull();
            assertThat(ctx.getBean(EnvPagesResolver.class))
                    .as("页面解析器必须有容器注册来源（类注解不参与装配，须显式 @Bean）")
                    .isNotNull();
            assertThat(ctx.getBean(ConsolePermissionsController.class))
                    .as("权限自查端点在无组件扫描装配下必须在场（缺席=运行期 404）")
                    .isNotNull();
        });
    }
}
