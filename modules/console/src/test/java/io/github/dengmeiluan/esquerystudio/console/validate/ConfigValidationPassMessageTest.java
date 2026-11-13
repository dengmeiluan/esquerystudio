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

package io.github.dengmeiluan.esquerystudio.console.validate;

import org.junit.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 启动期配置校验「通过」措辞的三态判别力。
 *
 * <p><b>这条测试防的是两种相反的误导</b>：
 * ① 对根本没校验 mapping 的索引说「配置校验通过」（空头承诺）；
 * ② 对已经按注解推导 mapping 校验过的索引说「未覆盖 mapping」（自我贬低，会让人以为还有活要干）。</p>
 *
 * <p> 起校验器与重建共用 {@code EntityMappingDeriver.declaredOrDerived}，
 * 所以无 {@code @Mapping} 的实体校验的已经是<b>重建实际会应用的那份</b>推导 mapping ——
 * 只有「注解推导也为空」时才真的没有 mapping 可校验（那时重建会走复制旧索引 / ES 动态映射，
 * 启动期无从预判）。</p>
 */
public class ConfigValidationPassMessageTest {

    /** 有 @Mapping：点明 mapping 来自 @Mapping，不许出现任何「未参与校验」的字样。 */
    @Test
    public void withExplicitMappingSaysSourceIsMappingAnnotation() {
        String msg = ConfigValidationStartupRunner.passMessage(true, true);

        assertThat(msg).contains("配置校验通过");
        assertThat(msg).contains("mapping 来自 @Mapping");
        assertThat(msg).doesNotContain("未参与校验");
    }

    /**
     * 无 @Mapping 但推导出了 mapping：<b>是</b>校验通过，且必须点明校验的是注解推导那份。
     *
     * <p>`doesNotContain("未参与校验")` 承重：这正是同源改造之前的旧措辞，
     * 若实现回退到「只校验 settings」，这条会红。</p>
     */
    @Test
    public void withDerivedMappingSaysItWasActuallyChecked() {
        String msg = ConfigValidationStartupRunner.passMessage(false, true);

        assertThat(msg).contains("配置校验通过");
        assertThat(msg).contains("注解推导");
        assertThat(msg).doesNotContain("未参与校验");
    }

    /**
     * 无 @Mapping 且推导也为空：<b>不许</b>出现无限定的「配置校验通过」。
     *
     * <p>`doesNotContain("配置校验通过")` 承重：少了它，实现只要在原措辞后追加一句补充说明
     * 就能让其余断言全绿，而那个无限定的「通过」仍摆在日志里误导人。</p>
     */
    @Test
    public void withNothingToCheckRefusesUnqualifiedPass() {
        String msg = ConfigValidationStartupRunner.passMessage(false, false);

        assertThat(msg).doesNotContain("配置校验通过");
        assertThat(msg).contains("settings 校验通过");
        assertThat(msg).contains("mapping 未参与校验");
    }

    /** 三态必须两两不同——同一句话说多种情况就等于没区分。 */
    @Test
    public void threeStatesAreAllDistinct() {
        String explicit = ConfigValidationStartupRunner.passMessage(true, true);
        String derived = ConfigValidationStartupRunner.passMessage(false, true);
        String nothing = ConfigValidationStartupRunner.passMessage(false, false);

        assertThat(explicit).isNotEqualTo(derived);
        assertThat(derived).isNotEqualTo(nothing);
        assertThat(explicit).isNotEqualTo(nothing);
    }
}
