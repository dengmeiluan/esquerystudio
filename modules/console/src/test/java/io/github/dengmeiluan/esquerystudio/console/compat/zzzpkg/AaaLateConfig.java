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

package io.github.dengmeiluan.esquerystudio.console.compat.zzzpkg;

import io.github.dengmeiluan.esquerystudio.console.compat.OrderMarker;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 简单名排<b>前</b>、FQN 排<b>后</b>。与 {@code ZzzEarlyConfig} 构成方向相反的一对。 */
@Configuration
public class AaaLateConfig {

    @Bean
    @ConditionalOnMissingBean
    public OrderMarker marker() {
        return new OrderMarker("AAA-LATE-SIMPLE-FIRST");
    }
}
