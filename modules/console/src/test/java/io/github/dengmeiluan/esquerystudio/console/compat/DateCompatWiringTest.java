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

import org.junit.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.data.elasticsearch.ElasticsearchDataAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.convert.support.DefaultConversionService;
import org.springframework.core.convert.support.GenericConversionService;
import org.springframework.data.elasticsearch.core.convert.ElasticsearchCustomConversions;

import java.sql.Timestamp;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 *  D13 守门：自动适配的装配顺序。
 *
 * <p>断言的不是「Bean 存在」而是「转换器<b>确实进了</b> conversions」——
 * 天真写法（放进 {@code @AutoConfigureAfter} 的主配置里）会让 Boot 先建空的 conversions，
 * 我们的 {@code @ConditionalOnMissingBean} 永远轮不到，Bean 看着在、实际是空的。</p>
 *
 * <p><b>sdes 4.0.9 API 说明</b>：{@code ElasticsearchCustomConversions} 只继承到
 * {@code hasCustomWriteTarget} / {@code getCustomWriteTarget} / {@code registerConvertersIn}，
 * <b>没有</b> {@code getConversionService()}（javap 实测）。故读侧可用性改用
 * {@code registerConvertersIn(GenericConversionService)} 后再问 {@code canConvert} ——
 * 这仍然是「转换器真的在里面」的直接证据，不是「Bean 存在」的弱化替代。</p>
 *
 * <p><b>字母序兜底与注解同向，务必注意</b>：{@code AutoConfigurationSorter} 先按
 * <b>FQN</b> 字母序排序再应用排序注解（Boot 2.3.12 源码
 * {@code AutoConfigurations.sort} → {@code Class::getName} → {@code Collections.sort}；
 * 另见 {@code SorterBasisProbeTest} 的跨包实测）。本 starter 的 FQN
 * {@code io.github.dengmeiluan...} <b>小于</b> {@code org.springframework...}，
 * 即兜底顺序与 {@code @AutoConfigureBefore} <b>同向</b>。
 * 后果：删掉注解后本测试可能<b>仍然绿</b>（兜底恰好维持了正确顺序），
 * 这<b>不代表</b>断言是假的。若将来有人把本 starter 挪到 {@code org.*} 包下或重命名，
 * 兜底方向会翻转，届时注解是唯一保障。</p>
 */
public class DateCompatWiringTest {

    private ApplicationContextRunner runner() {
        // 顺序刻意按 Boot 的真实装配序：两个自动配置类一起给，由注解决定先后
        return new ApplicationContextRunner().withConfiguration(AutoConfigurations.of(
                EsDateCompatAutoConfiguration.class, ElasticsearchDataAutoConfiguration.class));
    }

    /**
     * 前提断言（修订一第 3 点）：测试上下文里 {@link ElasticsearchDataAutoConfiguration}
     * <b>确实到场</b>。没有这条，将来有人从 runner 里删掉它，
     * 排序相关的断言会<b>静默退化成永远绿</b> —— 被排序的两个对象只剩一个，无事可排。
     */
    @Test
    public void elasticsearchDataAutoConfigurationIsActuallyPresent() {
        runner().run(ctx -> {
            assertTrue("ElasticsearchDataAutoConfiguration 必须在上下文里，否则排序断言无意义",
                    ctx.getBeanNamesForType(ElasticsearchCustomConversions.class).length > 0);
            assertTrue("该 conversions 必须由 ElasticsearchDataAutoConfiguration 贡献（开关关时我们不贡献）",
                    ctx.containsBean("elasticsearchCustomConversions"));
        });
    }

    /** 默认关：conversions 里不该有我们的转换器。 */
    @Test
    public void defaultOffMeansNoEpochConverters() {
        runner().run(ctx -> {
            ElasticsearchCustomConversions c = ctx.getBean(ElasticsearchCustomConversions.class);
            assertFalse("默认关时不该注册 Long->Timestamp",
                    c.hasCustomWriteTarget(Timestamp.class));
            assertFalse("默认关时读侧也不该可用", canConvertLongToTimestamp(c));
        });
    }

    /** 打开开关：转换器必须真的在 conversions 里，不是只有 Bean 在。 */
    @Test
    public void switchOnRegistersEpochConverters() {
        runner().withPropertyValues("esquerystudio.elasticsearch.compat.date-converters=true").run(ctx -> {
            ElasticsearchCustomConversions c = ctx.getBean(ElasticsearchCustomConversions.class);
            assertTrue("打开开关后 Timestamp 必须有自定义写目标（说明转换器进来了）",
                    c.hasCustomWriteTarget(Timestamp.class));
            assertTrue("并且 Long -> Timestamp 的读转换必须可用",
                    canConvertLongToTimestamp(c));
        });
    }

    /** 宿主自己定义了 conversions 时我们必须让位（@ConditionalOnMissingBean）。 */
    @Test
    public void hostOwnConversionsWin() {
        runner().withPropertyValues("esquerystudio.elasticsearch.compat.date-converters=true")
                .withBean(ElasticsearchCustomConversions.class,
                        () -> new ElasticsearchCustomConversions(java.util.Collections.emptyList()))
                .run(ctx -> {
                    ElasticsearchCustomConversions c = ctx.getBean(ElasticsearchCustomConversions.class);
                    assertFalse("宿主自己的 conversions 必须优先，我们不许覆盖",
                            c.hasCustomWriteTarget(Timestamp.class));
                });
    }

    /**
     * 用 {@code registerConvertersIn} 把 conversions 里的转换器灌进一个干净的
     * ConversionService，再问它能不能转 —— 直接观测「转换器是否真的在里面」。
     */
    private static boolean canConvertLongToTimestamp(ElasticsearchCustomConversions c) {
        GenericConversionService svc = new DefaultConversionService();
        c.registerConvertersIn(svc);
        return svc.canConvert(Long.class, Timestamp.class);
    }
}
