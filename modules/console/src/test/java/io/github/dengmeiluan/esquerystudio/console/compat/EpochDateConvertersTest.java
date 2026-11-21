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
import org.junit.Test;

import java.sql.Timestamp;
import java.time.Instant;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class EpochDateConvertersTest {

    /**
     * 阈值必须与 {@link DateFormSampler} 共用同一套常量 —— 两处各写一份就会漂。
     *
     * <p><b>这条只钉住"值相等"，钉不住"是同一个常量"</b>：{@code EpochDateConverters}
     * 完全可以本地定义一份同值常量，本条照样绿。真正的看守是
     * {@link #thresholdBehaviourFollowsSamplerNotALocalCopy()}。</p>
     */
    @Test
    public void thresholdsComeFromSampler() {
        assertEquals(1_000_000_000_000L, DateFormSampler.MILLIS_FLOOR);
        assertEquals(1_000_000_000L, DateFormSampler.SECONDS_FLOOR);
    }

    /**
     * 修订四的看守：验证 {@code toMillis} 的<b>分界点行为</b>与
     * {@link DateFormSampler#classify(Object)} 的分桶<b>逐点一致</b>。
     *
     * <p><b>为什么这不是恒真</b>：本条不比较两个常量的字面值（那种写法在
     * "本地抄一份同值常量"下照样绿），而是拿 {@code DateFormSampler} 的<b>分类结果</b>
     * 当作预言机，逐点核对 {@code toMillis} 是否在<b>同一个</b>分界点上改变行为。
     * 若把 {@code EpochDateConverters} 改成本地定义一份<b>不同值</b>的常量，
     * 两者分界点错位，本条立刻红。</p>
     *
     * <p>局限（如实说明）：若本地那份副本的值<b>恰好相同</b>，本条测不出来 ——
     * 但那种情况下两处行为完全一致，"漂"这件事尚未发生；本条看守的正是
     * <b>漂了之后</b>的那一刻，而这正是它要防的失败模式。</p>
     */
    @Test
    public void thresholdBehaviourFollowsSamplerNotALocalCopy() {
        long[] probes = {
                0L, 1L, 999_999_999L,
                DateFormSampler.SECONDS_FLOOR - 1, DateFormSampler.SECONDS_FLOOR,
                DateFormSampler.SECONDS_FLOOR + 1, 1_754_000_000L,
                DateFormSampler.MILLIS_FLOOR - 1, DateFormSampler.MILLIS_FLOOR,
                DateFormSampler.MILLIS_FLOOR + 1, 1_754_000_000_000L
        };
        for (long raw : probes) {
            String bucket = DateFormSampler.classify(raw);
            long actual = EpochDateConverters.toMillis(raw);
            if (DateFormSampler.EPOCH_SECONDS.equals(bucket)) {
                assertEquals("被 sampler 判为秒的值必须放大 1000 倍：raw=" + raw,
                        raw * 1000L, actual);
            } else {
                assertEquals("未被 sampler 判为秒的值必须原样透出：raw=" + raw + " bucket=" + bucket,
                        raw, actual);
            }
        }
    }

    /** 分界点两侧行为必须真的不同，否则上一条会退化成"怎么实现都行"。 */
    @Test
    public void secondsFloorIsAnActualBoundary() {
        assertEquals(DateFormSampler.SECONDS_FLOOR - 1,
                EpochDateConverters.toMillis(DateFormSampler.SECONDS_FLOOR - 1));
        assertEquals(DateFormSampler.SECONDS_FLOOR * 1000L,
                EpochDateConverters.toMillis(DateFormSampler.SECONDS_FLOOR));
        assertTrue("分界点两侧必须给出不同的换算行为",
                EpochDateConverters.toMillis(DateFormSampler.SECONDS_FLOOR)
                        != EpochDateConverters.toMillis(DateFormSampler.SECONDS_FLOOR - 1) * 1000L);
    }

    @Test
    public void thirteenDigitsTreatedAsMillis() {
        assertEquals(1754000000000L, EpochDateConverters.toMillis(1754000000000L));
    }

    @Test
    public void tenDigitsTreatedAsSecondsAndScaledUp() {
        assertEquals(1754000000000L, EpochDateConverters.toMillis(1754000000L));
    }

    /** &lt; 1e9 无法判定：一律按毫秒原样透出，绝不乘 1000 —— 乘错会把 1970 年附近的值放大 1000 倍。 */
    @Test
    public void smallValuesPassThroughAsMillis() {
        assertEquals(0L, EpochDateConverters.toMillis(0L));
        assertEquals(999_999_999L, EpochDateConverters.toMillis(999_999_999L));
    }

    @Test
    public void negativeValuesKeepSign() {
        assertEquals(-1754000000000L, EpochDateConverters.toMillis(-1754000000000L));
        assertEquals(-1754000000000L, EpochDateConverters.toMillis(-1754000000L));
    }

    @Test
    public void longToTimestamp() {
        Timestamp t = new EpochDateConverters.LongToTimestamp().convert(1754000000000L);
        assertEquals(1754000000000L, t.getTime());
        assertNull(new EpochDateConverters.LongToTimestamp().convert(null));
    }

    @Test
    public void integerSecondsToTimestamp() {
        Timestamp t = new EpochDateConverters.IntegerToTimestamp().convert(1754000000);
        assertEquals(1754000000000L, t.getTime());
    }

    @Test
    public void longToInstant() {
        Instant i = new EpochDateConverters.LongToInstant().convert(1754000000L);
        assertEquals(1754000000000L, i.toEpochMilli());
    }

    @Test
    public void longToUtilDateAndIntegerVariants() {
        assertEquals(1754000000000L,
                new EpochDateConverters.LongToUtilDate().convert(1754000000L).getTime());
        assertEquals(1754000000000L,
                new EpochDateConverters.IntegerToUtilDate().convert(1754000000).getTime());
        assertEquals(1754000000000L,
                new EpochDateConverters.IntegerToInstant().convert(1754000000).toEpochMilli());
    }

    /** 写方向统一毫秒（spec §9.7）：与历史毫秒数据同形态，且 ES 默认 format 认它。 */
    @Test
    public void timestampToLongIsMillis() {
        assertEquals(Long.valueOf(1754000000000L),
                new EpochDateConverters.TimestampToLong().convert(new Timestamp(1754000000000L)));
    }

    /** 读写往返：秒进 -&gt; Timestamp -&gt; 写回毫秒。形态被改变是刻意的，且必须被断言钉住。 */
    @Test
    public void roundTripConvertsSecondsToMillis() {
        Timestamp t = new EpochDateConverters.IntegerToTimestamp().convert(1754000000);
        assertEquals(Long.valueOf(1754000000000L), new EpochDateConverters.TimestampToLong().convert(t));
    }
}
