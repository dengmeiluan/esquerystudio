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

package io.github.dengmeiluan.esquerystudio.console.compat;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 简单名排<b>后</b>、FQN 排<b>前</b>（{@code compat.Z} < {@code compat.zzzpkg.A}，
 * 大写 'Z'(90) 小于小写 'z'(122)）。无任何排序注解 —— 谁赢完全由兜底口径决定。
 */
@Configuration
public class ZzzEarlyConfig {

    @Bean
    @ConditionalOnMissingBean
    public OrderMarker marker() {
        return new OrderMarker("ZZZ-EARLY-FQN-FIRST");
    }
}
