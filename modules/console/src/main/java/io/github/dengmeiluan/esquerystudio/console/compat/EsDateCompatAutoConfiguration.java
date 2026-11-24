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

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import org.springframework.boot.autoconfigure.AutoConfigureBefore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.data.elasticsearch.ElasticsearchDataAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.elasticsearch.core.convert.ElasticsearchCustomConversions;

import java.util.Arrays;

/**
 * epoch 日期兼容转换器的自动配置。<b>默认不装</b>
 * （{@code esquerystudio.elasticsearch.compat.date-converters} 默认 {@code false}）。
 *
 * <h3>⚠ 开启前必读：它救不了带日期注解的字段</h3>
 *
 * <p>带 {@code @Field(type = FieldType.Date, format = ...)} 的属性有<b>属性级</b>转换器，
 * 抢在本配置注册的 {@link ElasticsearchCustomConversions} 之前生效 ——
 * 对这类字段<b>打开开关什么也不会发生，且不报错</b>。详见 {@link EpochDateConverters} 头部。</p>
 *
 * <h3>为什么<b>必须</b>是 {@code @AutoConfigureBefore}（spec  D13）</h3>
 *
 * <p>{@link ElasticsearchDataAutoConfiguration} 自己会以 {@code @ConditionalOnMissingBean}
 * 建一个<b>空的</b> {@link ElasticsearchCustomConversions}。若本配置晚于它装配，
 * 那个空 Bean 已经在容器里，本配置的 {@code @ConditionalOnMissingBean}
 * <b>永远轮不到</b>：Bean 看着在、实际是空的，<b>静默失效</b>。
 * 故本类<b>不能</b>并入 {@code ESQueryStudioConsoleAutoConfiguration}（那个是
 * {@code @AutoConfigureAfter(...)}），必须作为 {@code spring.factories} 的<b>独立条目</b>。</p>
 *
 * <p><b>注意 Boot 的排序兜底</b>：{@code AutoConfigurationSorter} 先按 <b>FQN 字母序</b>
 * 排序（{@code AutoConfigurations.sort} → {@code Class::getName} → {@code Collections.sort}），
 * 再按 {@code @AutoConfigureBefore/After} 调整。本类 FQN
 * {@code io.github.dengmeiluan...} 恰好<b>小于</b> {@code org.springframework...}，
 * 即字母序兜底与本注解<b>同向</b>。这意味着：删掉本注解后，兜底可能<b>恰好</b>维持正确顺序，
 * 使装配断言看起来仍然绿。若将来有人重命名本类或改包名（例如挪到 {@code org.*} 之下），
 * 兜底方向会<b>翻转</b>，届时本注解是唯一的保障。<b>不要因为「删了还是绿」就删掉它。</b></p>
 *
 * @author aicoding
 */
@Configuration
@ConditionalOnClass(ElasticsearchCustomConversions.class)
@AutoConfigureBefore(ElasticsearchDataAutoConfiguration.class)
@EnableConfigurationProperties(ESQueryStudioElasticsearchProperties.class)
@ConditionalOnProperty(prefix = "esquerystudio.elasticsearch.compat", name = "date-converters", havingValue = "true")
public class EsDateCompatAutoConfiguration {

    /**
     * 只在宿主<b>没有</b>自己的 {@link ElasticsearchCustomConversions} 时才注册。
     * 宿主自己定义了就必须让位 —— 覆盖宿主的转换器配置会造成他无法解释的行为变化。
     */
    @Bean
    @ConditionalOnMissingBean
    public ElasticsearchCustomConversions esRebuildEpochDateConversions() {
        return new ElasticsearchCustomConversions(Arrays.asList(
                new EpochDateConverters.LongToTimestamp(),
                new EpochDateConverters.IntegerToTimestamp(),
                new EpochDateConverters.LongToUtilDate(),
                new EpochDateConverters.IntegerToUtilDate(),
                new EpochDateConverters.LongToInstant(),
                new EpochDateConverters.IntegerToInstant(),
                new EpochDateConverters.TimestampToLong()));
    }
}
