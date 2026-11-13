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

import io.github.dengmeiluan.esquerystudio.console.compat.zzzpkg.AaaLateConfig;
import org.junit.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.junit.Assert.assertEquals;

/**
 * 钉住 Boot 2.3.12 的一条<b>事实</b>：{@code AutoConfigurationSorter} 的字母序兜底按
 * <b>FQN</b>（而非简单类名）排序。
 *
 * <p><b>为什么这条要长期留着</b>：{@link DateCompatWiringTest} 里
 * 「删掉 {@code @AutoConfigureBefore} 仍然绿」<b>不代表</b>断言是假的 ——
 * 因为本 starter 的 FQN {@code io.github.dengmeiluan...} 小于
 * {@code org.springframework...}，兜底顺序与注解<b>同向</b>，会替注解把顺序顶对。
 * 这个解释<b>只在「兜底按 FQN」成立时才成立</b>。若哪天 Boot 改成按简单类名排
 * （{@code El} < {@code Es}，方向仍同向）或改成别的口径，本条会红，
 * 提醒后来者重新评估那段推理，而不是让它静默地继续被引用。</p>
 *
 * <p>两个探针类<b>跨包</b>且两种口径方向相反，故可分辨：
 * FQN 序 {@code compat.ZzzEarlyConfig} < {@code compat.zzzpkg.AaaLateConfig}；
 * 简单名序 {@code AaaLateConfig} < {@code ZzzEarlyConfig}。两者都无排序注解。</p>
 */
public class SorterBasisProbeTest {

    @Test
    public void alphabeticalFallbackIsByFullyQualifiedName() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(AaaLateConfig.class, ZzzEarlyConfig.class))
                .run(ctx -> assertEquals(
                        "字母序兜底应按 FQN：compat.ZzzEarlyConfig 先于 compat.zzzpkg.AaaLateConfig",
                        "ZZZ-EARLY-FQN-FIRST", ctx.getBean(OrderMarker.class).who));
    }
}
