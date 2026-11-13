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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * mapping 级「无 format 的 date 字段」告知的测试。
 *
 * <p><b>被守的性质</b>：迁移要如实告知<b>哪些</b> date 字段没有 format（那正是有  风险的字段），
 * 且文案必须说清<b>迁移没做什么</b>——不许暗示已处理/已兼容/已加宽。</p>
 *
 * @author aicoding
 */
public class FormatlessDateFieldsTest {

    // ------------------------------------------------------------ 正向：清单内容

    /** 2 个无 format 的 date → 清单恰好 2 项，且就是那两个（判据落在值上，不是 size 上）。 */
    @Test
    public void listsExactlyTheFormatlessDateFields() {
        List<String> got = FormatlessDateFields.scan(
                "{\"properties\":{"
                        + "\"a\":{\"type\":\"date\"},"
                        + "\"b\":{\"type\":\"date\",\"format\":\"yyyy-MM-dd\"},"
                        + "\"c\":{\"type\":\"date\"},"
                        + "\"d\":{\"type\":\"keyword\"}}}");
        assertEquals(Arrays.asList("a", "c"), got);
    }

    @Test
    public void coversDateNanosAndDateRange() {
        List<String> got = FormatlessDateFields.scan(
                "{\"properties\":{\"a\":{\"type\":\"date_nanos\"},\"b\":{\"type\":\"date_range\"}}}");
        assertEquals(Arrays.asList("a", "b"), got);
    }

    @Test
    public void reportsNestedFieldsWithDottedPath() {
        List<String> got = FormatlessDateFields.scan(
                "{\"properties\":{\"o\":{\"properties\":{\"t\":{\"type\":\"date\"}}}}}");
        assertEquals(Collections.singletonList("o.t"), got);
    }

    /** 6.x 单 type 包装：type 名<b>不</b>进字段路径。 */
    @Test
    public void handlesSixDotXTypeWrapperWithoutLeakingTypeNameIntoPath() {
        List<String> got = FormatlessDateFields.scan(
                "{\"_doc\":{\"properties\":{\"t\":{\"type\":\"date\"}}}}");
        assertEquals(Collections.singletonList("t"), got);
    }

    // ------------------------------------------------------------ 反向：空清单 + 正向对照

    /**
     * 全都有 format → 清单为空。
     *
     * <p>⚠「空」是反向结论，单独看毫无说服力：一个恒返回空清单的实现照样通过。
     * 故本条<b>必须</b>与 {@link #listsExactlyTheFormatlessDateFields()} 合看；
     * 而那条对照是否「活着」，由 {@link #controlIsAliveRemovingFormatFlipsTheSameInputToNonEmpty()} 证明。</p>
     */
    @Test
    public void emptyWhenEveryDateFieldHasFormat() {
        assertEquals(Collections.emptyList(), FormatlessDateFields.scan(
                "{\"properties\":{"
                        + "\"a\":{\"type\":\"date\",\"format\":\"epoch_millis\"},"
                        + "\"b\":{\"type\":\"date\",\"format\":\"yyyy-MM-dd\"}}}"));
    }

    /**
     * ★<b>反向变异：证明上面那条空清单对照是活的</b>★
     *
     * <p>取 {@link #emptyWhenEveryDateFieldHasFormat()} 用的<b>同一份输入</b>，
     * 只把两个 {@code format} 键去掉，清单就必须从「空」翻成「恰好这两个」。
     * 若这条不成立，说明扫描器对 {@code format} 键根本不敏感，
     * 那么「全有 format → 空」的绿就是死的绿，不构成证据。</p>
     */
    @Test
    public void controlIsAliveRemovingFormatFlipsTheSameInputToNonEmpty() {
        String withFormat = "{\"properties\":{"
                + "\"a\":{\"type\":\"date\",\"format\":\"epoch_millis\"},"
                + "\"b\":{\"type\":\"date\",\"format\":\"yyyy-MM-dd\"}}}";
        String withoutFormat = "{\"properties\":{"
                + "\"a\":{\"type\":\"date\"},"
                + "\"b\":{\"type\":\"date\"}}}";
        assertEquals(Collections.emptyList(), FormatlessDateFields.scan(withFormat));
        assertEquals("同一输入去掉 format 后必须翻成非空——否则上面的空清单是死绿",
                Arrays.asList("a", "b"), FormatlessDateFields.scan(withoutFormat));
    }

    @Test
    public void ignoresNonDateFieldsEvenWithoutFormat() {
        assertEquals(Collections.emptyList(), FormatlessDateFields.scan(
                "{\"properties\":{\"n\":{\"type\":\"long\"},\"s\":{\"type\":\"keyword\"},"
                        + "\"o\":{\"type\":\"object\",\"properties\":{}}}}"));
    }

    // ------------------------------------------------------------ 健壮性

    @Test
    public void badInputYieldsEmptyListNeverThrows() {
        assertEquals(Collections.emptyList(), FormatlessDateFields.scan("{bad"));
        assertEquals(Collections.emptyList(), FormatlessDateFields.scan(null));
        assertEquals(Collections.emptyList(), FormatlessDateFields.scan(""));
    }

    @Test
    public void isIdempotentAndPure() {
        String m = "{\"properties\":{\"a\":{\"type\":\"date\"}}}";
        assertEquals(FormatlessDateFields.scan(m), FormatlessDateFields.scan(m));
    }

    // ------------------------------------------------------------ 文案三要素

    @Test
    public void describeIsNullWhenNothingToSay() {
        assertNull(FormatlessDateFields.describe(Collections.<String>emptyList()));
        assertNull(FormatlessDateFields.describe(null));
    }

    /** 三要素：①事实 ②后果 ③迁移做了什么/没做什么。缺一不可。 */
    @Test
    public void describeStatesFactConsequenceAndWhatMigrationDidNotDo() {
        String msg = FormatlessDateFields.describe(Arrays.asList("createTime", "o.updateTime"));
        assertNotNull(msg);
        // ① 事实：点名字段 + 说明是「没有 format」
        assertTrue("要点名字段: " + msg, msg.contains("createTime") && msg.contains("o.updateTime"));
        assertTrue("要陈述事实: " + msg, msg.contains("没有声明 format"));
        // ② 后果：10 位 epoch 秒会被按毫秒解释成 1970
        assertTrue("要陈述后果: " + msg, msg.contains("1970"));
        assertTrue("要点明是 10 位 epoch: " + msg, msg.contains("10 位"));
        // ③ 迁移做了什么、没做什么
        assertTrue("必须说清迁移不造成也不修复: " + msg, msg.contains("既不会造成这个问题，也不会修复它"));
        assertTrue("必须说清源什么样目标什么样: " + msg, msg.contains("源索引什么样，目标索引就什么样"));
    }

    /**
     * ★文案<b>不得</b>暗示「已处理」★——那正是被实测推翻的加宽方案留下的谎。
     * 判据落在具体措辞上，逐个禁用词核对。
     */
    @Test
    public void describeNeverClaimsItHandledOrFixedAnything() {
        String msg = FormatlessDateFields.describe(Arrays.asList("t"));
        for (String forbidden : new String[]{"已处理", "已兼容", "已加宽", "已修复", "已自动", "已转换"}) {
            assertFalse("文案不得暗示迁移处理过什么，命中禁用词「" + forbidden + "」: " + msg,
                    msg.contains(forbidden));
        }
    }

    @Test
    public void describeReportsTheCount() {
        assertTrue(FormatlessDateFields.describe(Arrays.asList("a", "b", "c")).contains("3 个"));
    }
}
