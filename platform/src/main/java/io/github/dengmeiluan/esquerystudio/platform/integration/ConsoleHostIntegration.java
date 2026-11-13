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

package io.github.dengmeiluan.esquerystudio.platform.integration;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 宿主集成 SPI：宿主注册一个 Spring Bean 即声明「我是谁、默认开哪些功能包」。
 *
 * <p>与细粒度 SPI（{@code ConsoleAuthDelegate}、{@code ConsoleAuditContributor}、
 * {@code ConnStore}）分工：本接口只承载<b>产品目录与品牌</b>，避免每个宿主都要在
 * 启动配置里重复写 product/integration 文案。显式 {@code esquerystudio.console.*}
 * 配置优先级更高，便于宿主运维临时覆盖。</p>
 *
 * <p>宿主侧实现并注册自己的 {@code ConsoleHostIntegration} Bean；本接口不绑定任何具体宿主，
 * starter 也不反向依赖宿主业务类。</p>
 *
 * @author aicoding
 */
public interface ConsoleHostIntegration {

    /** 集成标识（小写字母/数字/连字符），如 {@code acme}。 */
    String id();

    /** 展示名，如 {@code Acme}；控制台品牌副标题使用。 */
    String displayName();

    /** 可选副标语；为空时回落到平台默认 tagline。 */
    default String tagline() {
        return null;
    }

    /**
     * 默认启用的功能包；空 = 不干预（平台配置为空时启用全部包）。
     * 仅在 {@code esquerystudio.console.features.packs} 未显式配置时生效。
     */
    default List<String> preferredPacks() {
        return Collections.emptyList();
    }

    /** 透传给前端的只读元数据（如宿主版本、帮助链接）；不参与授权判定。 */
    default Map<String, String> metadata() {
        return Collections.emptyMap();
    }
}
