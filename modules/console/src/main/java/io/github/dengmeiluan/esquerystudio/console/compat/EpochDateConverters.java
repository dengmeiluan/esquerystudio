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

import io.github.dengmeiluan.esquerystudio.console.validate.DateFormSampler;
import org.springframework.core.convert.converter.Converter;
import org.springframework.data.convert.ReadingConverter;
import org.springframework.data.convert.WritingConverter;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Date;

/**
 * epoch 数值 → 日期类型的可选转换器（<b>默认不装</b>，见
 * {@link EsDateCompatAutoConfiguration}）。
 *
 * <h3>⚠ 这个开关救不了哪些字段（先读这段）</h3>
 *
 * <p><b>带 {@code @Field(type = FieldType.Date, format = ...)} 注解的字段，本开关对它们完全无效。</b>
 * sdes 4.0.9 会为这类属性安装<b>属性级</b>日期转换器，它<b>抢在</b>
 * {@code ElasticsearchCustomConversions} 之前生效，本类的转换器<b>根本不会被调用</b>。
 * ES 6.7.2 实测（带注解字段在开关关 / 开两种情况下 {@code _source}
 * <b>完全一致</b>；同一实体上<b>不带</b>注解的字段才走本类。</p>
 *
 * <p><b>后果</b>：若你的故障字段带日期注解，打开本开关<b>什么也不会发生，而且不报错</b> ——
 * 你会以为已经修好了。<b>而不是</b>打开本开关，正确做法见下面「三档」与「两条路的边界」。</p>
 *
 * <h3>三档（  补上了中间那档）</h3>
 *
 * <p>免疫的触发条件是 <b>{@code format} 有显式值</b>，不是「写了 {@code @Field}」。
 * 少了中间那档会以为「带注解 = 免疫」，而它其实<b>连实体都构建不起来</b>：</p>
 *
 * <table border="1">
 *   <caption>写法 × 实际行为</caption>
 *   <tr><th>写法</th><th>实际行为</th></tr>
 *   <tr><td>{@code @Field(type=Date, format=…)}</td>
 *       <td><b>免疫</b>（属性级转换器抢先）——  实测</td></tr>
 *   <tr><td>{@code @Field(type=Date)} 无 format，
 *           且 javaType 为 {@code TemporalAccessor}/{@code Date} 可赋值</td>
 *       <td><b>构造即抛 {@code MappingException}</b>（"...but has no DateFormat defined"），
 *           谈不上免不免疫 ——  实测 + {@code initDateConverter()} 字节码</td></tr>
 *   <tr><td>无 {@code @Field} / {@code @Field} 非日期类型</td>
 *       <td>本类的转换器<b>生效</b></td></tr>
 * </table>
 *
 * <p>第二档的复现程序：{@code R94TypeOnlyAnnotationDrill}。注意它的<b>行为</b>探测是死仪器
 * （阳性对照抛同样的异常），确定答案来自字节码。另注意 javaType 那个合取项：
 * {@code @Field(type=Date)} 打在 {@code String} 字段上<b>不会</b>抛。</p>
 *
 * <h3>两条修复路径的边界（不要当成可互换）</h3>
 *
 * <p>本段原先写作「改 {@code @Field(format=…)} <b>或</b>换 {@code Long} 自行转换」，
 * 那个「或」<b>暗示两者等价，而它们不等价</b>（  之后）：</p>
 *
 * <ul>
 *   <li><b>Path A（改 {@code @Field(format=…)}）</b>：只在<b>存量宽度单一</b>时成立，
 *       且需 sdes ≥ 4.2 才有 epoch 相关枚举（4.0.9 <b>没有</b>，见下节 3.2 与
 *       {@code DateFixMatrixProbe}）。<b>混合宽度下结构上不可能</b>：10 位与 13 位
 *       在数值上不可区分，{@code epoch_second} 前置则 13 位值飞到公元 57000 年、
 *       后置则 10 位值掉回 1970（{@code FormatlessDateFields} 类头有实测）。
 *       它还隐含「存量宽度从此不再变化」这个前提。</li>
 *   <li><b>Path B（换 {@code Long} 自行转换）</b>：把歧义搬到 <b>Java 读侧</b>，
 *       那里 {@code abs(v) >= 1e12} 可判定（{@link #toMillis(long)} 做的正是这件事）。
 *       <b>混合宽度下这是唯一结构上成立的路。</b></li>
 *   <li><b>两条路共同的盲区</b>：{@code abs(v) < 1e9} 的值（{@code ambiguous_small} 桶）
 *       秒/毫秒两种解释都成立，{@link #toMillis(long)} 对该区间<b>一律原样透出、不猜</b>，
 *       故 Path B 也判不了。这批数据的语义只能人工确定。</li>
 * </ul>
 *
 * <h3>它能救什么</h3>
 *
 * <p>ES6 时代大量索引把 date 字段存成 epoch 数值（秒或毫秒），而 sdes 4.0.9 读到裸数值时
 * 并不会自动填进<b>无日期注解</b>的 {@link Timestamp} / {@link Date} / {@link Instant} 字段。
 *  实测的「存储形态 × Java 类型」30 格里只有 6 格天然可读通，本类补其中若干格。</p>
 *
 * <h3>写方向</h3>
 *
 * <p>{@link TimestampToLong} 把 {@link Timestamp} 写成 epoch <b>毫秒</b>（spec ）。</p>
 *
 * <p><b>实测（ES 6.7.2）：它是个 no-op</b> —— sdes 4.0.9 本就把 {@link Timestamp}
 * 原生写成 epoch 毫秒，开关关 / 开写出的 {@code _source} 逐字节相同。
 * 故<b>开启本开关不会改变已有的写出形态</b>，也就<b>不会</b>把某字段变成「多形态并存」
 * （ 规则 2 {@code MIXED_STORED_FORMS}，判 error）。保留这个转换器是为了把
 * 「写侧统一毫秒」这条口径<b>显式钉住</b>，使其不随 sdes 版本升级而静默漂移。</p>
 *
 * <h3>阈值口径</h3>
 *
 * <p>秒/毫秒的判定阈值<b>直接引用</b> {@link DateFormSampler#MILLIS_FLOOR} 与
 * {@link DateFormSampler#SECONDS_FLOOR}，不在本类另写一份 —— 采样端点报出的形态
 * 与转换器实际采用的口径必须是<b>同一套</b>，否则「端点说是秒、转换器按毫秒读」
 * 这种错位无人能发现。</p>
 *
 * @author aicoding
 */
public final class EpochDateConverters {

    private EpochDateConverters() {
    }

    /**
     * 把 epoch 原始值归一成<b>毫秒</b>。
     *
     * <p>口径与 {@link DateFormSampler#classify(Object)} 一致：
     * {@code |v| >=} {@link DateFormSampler#MILLIS_FLOOR} 判毫秒原样返回；
     * {@code |v| >=} {@link DateFormSampler#SECONDS_FLOOR} 判秒并放大 1000 倍。</p>
     *
     * <p><b>{@code |v| < 1e9} 一律按毫秒原样透出，绝不乘 1000</b>：这个区间无法区分
     * 「1970 年附近的毫秒值」与「很小的秒值」，猜错方向会把值放大 1000 倍，
     * 造成静默的错误日期。原样透出至少是可解释的。</p>
     *
     * <p>取绝对值判断量级，故<b>负值保号</b>：-1754000000（秒）→ -1754000000000（毫秒）。</p>
     */
    public static long toMillis(long raw) {
        long abs = Math.abs(raw);
        if (abs >= DateFormSampler.MILLIS_FLOOR) {
            return raw;
        }
        if (abs >= DateFormSampler.SECONDS_FLOOR) {
            return raw * 1000L;
        }
        return raw;
    }

    /** {@code Long} → {@link Timestamp}，按 {@link #toMillis(long)} 归一。 */
    @ReadingConverter
    public static class LongToTimestamp implements Converter<Long, Timestamp> {
        @Override
        public Timestamp convert(Long source) {
            return source == null ? null : new Timestamp(toMillis(source));
        }
    }

    /** {@code Integer} → {@link Timestamp}。Integer 上限 2^31 决定它只可能是秒。 */
    @ReadingConverter
    public static class IntegerToTimestamp implements Converter<Integer, Timestamp> {
        @Override
        public Timestamp convert(Integer source) {
            return source == null ? null : new Timestamp(toMillis(source.longValue()));
        }
    }

    /** {@code Long} → {@link Date}。 */
    @ReadingConverter
    public static class LongToUtilDate implements Converter<Long, Date> {
        @Override
        public Date convert(Long source) {
            return source == null ? null : new Date(toMillis(source));
        }
    }

    /** {@code Integer} → {@link Date}。 */
    @ReadingConverter
    public static class IntegerToUtilDate implements Converter<Integer, Date> {
        @Override
        public Date convert(Integer source) {
            return source == null ? null : new Date(toMillis(source.longValue()));
        }
    }

    /** {@code Long} → {@link Instant}。 */
    @ReadingConverter
    public static class LongToInstant implements Converter<Long, Instant> {
        @Override
        public Instant convert(Long source) {
            return source == null ? null : Instant.ofEpochMilli(toMillis(source));
        }
    }

    /** {@code Integer} → {@link Instant}。 */
    @ReadingConverter
    public static class IntegerToInstant implements Converter<Integer, Instant> {
        @Override
        public Instant convert(Integer source) {
            return source == null ? null : Instant.ofEpochMilli(toMillis(source.longValue()));
        }
    }

    /**
     * {@link Timestamp} → {@code Long}（<b>毫秒</b>）。
     *
     * <p><b>实测是 no-op</b>：sdes 4.0.9 本就把 {@link Timestamp} 写成 epoch 毫秒
     * （ES 6.7.2 实测，开关关 / 开的 {@code _source} 相同）。
     * 保留它是为把该口径显式钉住，不使其随版本升级静默漂移。详见本类头部「写方向」。</p>
     */
    @WritingConverter
    public static class TimestampToLong implements Converter<Timestamp, Long> {
        @Override
        public Long convert(Timestamp source) {
            return source == null ? null : source.getTime();
        }
    }
}
