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

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

public class DateFormSamplerTest {

    @Test
    public void classifiesEpochMillis() {
        assertEquals("epoch_millis", DateFormSampler.classify(1754000000000L));
        assertEquals("epoch_millis", DateFormSampler.classify(1_000_000_000_000L));      // 边界内侧
    }

    @Test
    public void classifiesEpochSeconds() {
        assertEquals("epoch_seconds", DateFormSampler.classify(1754000000));
        assertEquals("epoch_seconds", DateFormSampler.classify(1_000_000_000L));         // 边界内侧
        assertEquals("epoch_seconds", DateFormSampler.classify(999_999_999_999L));       // 上界外侧
    }

    /** < 1e9 一律不猜 —— 1970 年附近，秒/毫秒两种解释都成立。 */
    @Test
    public void classifiesAmbiguousSmall() {
        assertEquals("ambiguous_small", DateFormSampler.classify(999_999_999L));         // 下界外侧
        assertEquals("ambiguous_small", DateFormSampler.classify(0));
        assertEquals("ambiguous_small", DateFormSampler.classify(12345));
    }

    /** 负数按绝对值判（1970 前的时间戳），不许崩。 */
    @Test
    public void classifiesNegativeByAbsoluteValue() {
        assertEquals("epoch_millis", DateFormSampler.classify(-1754000000000L));
        assertEquals("epoch_seconds", DateFormSampler.classify(-1754000000L));
    }

    @Test
    public void classifiesStringForms() {
        assertEquals("iso8601", DateFormSampler.classify("2025-08-01T06:13:20Z"));
        assertEquals("iso8601", DateFormSampler.classify("2025-08-01T06:13:20.000+08:00"));
        assertEquals("space_sep", DateFormSampler.classify("2025-08-01 06:13:20"));
        assertEquals("space_sep", DateFormSampler.classify("2025-08-01 06:13:20.123"));
        assertEquals("date_only", DateFormSampler.classify("2025-08-01"));
    }

    @Test
    public void classifiesNullAndOther() {
        assertEquals("null_value", DateFormSampler.classify(null));
        assertEquals("other", DateFormSampler.classify("not a date"));
        assertEquals("other", DateFormSampler.classify(3.14));
        assertEquals("other", DateFormSampler.classify(Boolean.TRUE));
        assertEquals("other", DateFormSampler.classify(new LinkedHashMap<String, Object>()));
    }

    /** 数字型字符串也要按数字判 —— ES 的 _source 里 epoch 有时是字符串形态。 */
    @Test
    public void classifiesNumericStringAsEpoch() {
        assertEquals("epoch_millis", DateFormSampler.classify("1754000000000"));
        assertEquals("epoch_seconds", DateFormSampler.classify("1754000000"));
    }

    @Test
    public void tallyCountsPerFieldPerForm() {
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        docs.add(one("t", 1754000000000L));
        docs.add(one("t", 1754000000));
        docs.add(one("t", 1754000000));
        docs.add(new LinkedHashMap<String, Object>());   // 字段缺失
        Map<String, Map<String, Integer>> got = DateFormSampler.tally(docs, Arrays.asList("t")).getForms();
        Map<String, Integer> t = got.get("t");
        assertEquals(Integer.valueOf(1), t.get("epoch_millis"));
        assertEquals(Integer.valueOf(2), t.get("epoch_seconds"));
        assertEquals(Integer.valueOf(1), t.get("absent"));
    }

    /** 只统计传入的字段，不把整份 _source 都算进去。 */
    @Test
    public void tallyIgnoresFieldsNotAsked() {
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        Map<String, Object> d = one("t", 1754000000000L);
        d.put("other", "x");
        docs.add(d);
        Map<String, Map<String, Integer>> got = DateFormSampler.tally(docs, Arrays.asList("t")).getForms();
        assertEquals(1, got.size());
    }

    @Test
    public void tallyToleratesNullInputs() {
        assertEquals(0, DateFormSampler.tally(null, Arrays.asList("t")).getForms().size());
        assertEquals(0, DateFormSampler.tally(null, Arrays.asList("t")).getSamples().size());
        assertEquals(0, DateFormSampler.tally(new ArrayList<Map<String, Object>>(), null).getForms().size());
    }

    // ---------------------------------------------------------------
    // 修订三：other / ambiguous_small 必须带样例，否则 other:500 无行动价值
    // ---------------------------------------------------------------

    /**
     * 修订三 / C2：`other` 必须带去重样例，且样例住在<b>与计数分离的另一棵树</b>里。
     * <p>断言落在<b>样例内容</b>上而非「有该键」——后者用空列表也能满足。</p>
     */
    @Test
    public void tallyCarriesOtherSamples() {
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        docs.add(one("t", "not a date"));
        docs.add(one("t", "garbage-value"));
        docs.add(one("t", "not a date"));      // 重复，必须去重
        DateFormTally got = DateFormSampler.tally(docs, Arrays.asList("t"));
        assertEquals(Integer.valueOf(3), got.getForms().get("t").get("other"));
        List<String> samples = got.getSamples().get("t").get("other");
        assertEquals("重复值必须去重", 2, samples.size());
        assertTrue("样例必须是真实出现过的值", samples.contains("not a date"));
        assertTrue("样例必须是真实出现过的值", samples.contains("garbage-value"));
    }

    /**
     * C2：计数树的值域<b>纯 Integer</b>——样例绝不许混进 forms。
     * <p>这是前端 {@code Object.entries(forms[f]).reduce(sum)} 求和正确的前提：
     * 混装时数组会被加进计数，静默算错。遍历断言（不是抽查），并先断言非空以免恒真。</p>
     */
    @Test
    public void formsTreeContainsCountsOnlyNeverSamples() {
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        docs.add(one("t", "not a date"));
        docs.add(one("t", 0));
        docs.add(one("t", 1754000000000L));
        DateFormTally got = DateFormSampler.tally(docs, Arrays.asList("t"));
        Map<String, Integer> forms = got.getForms().get("t");
        assertFalse("forms 不许为空，否则下面的遍历恒真", forms.isEmpty());
        int sum = 0;
        for (Map.Entry<String, Integer> e : forms.entrySet()) {
            assertNotNull("forms." + e.getKey() + " 不许为 null", e.getValue());
            sum += e.getValue().intValue();
        }
        assertEquals("计数总和必须等于文档数（证明遍历到了每个计数）", 3, sum);
        // 样例确实存在，只是在另一棵树 —— 否则「纯计数」可以靠删掉样例来满足
        assertFalse("样例必须仍然存在于 samples 树", got.getSamples().get("t").isEmpty());
    }

    /** 修订三：ambiguous_small 同样要带样例 —— 使用者要看到是 0 还是 12345。 */
    @Test
    public void tallyCarriesAmbiguousSmallSamples() {
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        docs.add(one("t", 0));
        docs.add(one("t", 12345));
        DateFormTally got = DateFormSampler.tally(docs, Arrays.asList("t"));
        assertEquals(Integer.valueOf(2), got.getForms().get("t").get("ambiguous_small"));
        List<String> samples = got.getSamples().get("t").get("ambiguous_small");
        assertTrue("必须含真实值 0", samples.contains("0"));
        assertTrue("必须含真实值 12345", samples.contains("12345"));
    }

    /** 修订三：样例最多 3 个 —— 500 条 other 不能把 500 个值全灌进响应。 */
    @Test
    public void tallyCapsSamplesAtThree() {
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < 50; i++) {
            docs.add(one("t", "junk-" + i));
        }
        DateFormTally got = DateFormSampler.tally(docs, Arrays.asList("t"));
        assertEquals(Integer.valueOf(50), got.getForms().get("t").get("other"));
        assertEquals("样例上限 3", 3, got.getSamples().get("t").get("other").size());
    }

    /** 修订三：长值必须截断到 64 字符，防止大文本灌进响应。 */
    @Test
    public void tallyTruncatesLongSamples() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 300; i++) {
            sb.append('x');
        }
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        docs.add(one("t", sb.toString()));
        DateFormTally got = DateFormSampler.tally(docs, Arrays.asList("t"));
        String sample = got.getSamples().get("t").get("other").get(0);
        assertEquals("截断到 64 字符", 64, sample.length());
    }

    /** 形态正常的字段不产生 samples 条目 —— 只有需要人工判读的桶才带。 */
    @Test
    public void tallyOmitsSamplesForCleanForms() {
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        docs.add(one("t", 1754000000000L));
        DateFormTally got = DateFormSampler.tally(docs, Arrays.asList("t"));
        assertEquals(Integer.valueOf(1), got.getForms().get("t").get("epoch_millis"));
        assertTrue("干净形态不产生 samples 条目", got.getSamples().isEmpty());
    }

    /**
     * I-3：{@code null_value} 与 {@code absent} 必须在<b>同一次 tally</b> 里各自成立。
     *
     * <p>此前 {@code null_value} 只在 {@code classify} 层被断言，tally 层零断言 ——
     * 于是若 {@code resolvePath} 退化成「把显式 null 也当缺席」，<b>没有任何测试会红</b>
     * （反方向才会红，不对称）。本条把两者放进同一次调用，各为 1，堵住这个方向。</p>
     */
    @Test
    public void tallyDistinguishesExplicitNullFromAbsent() {
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        docs.add(one("t", null));                        // 显式写了 null
        docs.add(new LinkedHashMap<String, Object>());   // 根本没这个键
        Map<String, Integer> t = DateFormSampler.tally(docs, Arrays.asList("t")).getForms().get("t");
        assertEquals("显式 null 必须记 null_value", Integer.valueOf(1), t.get("null_value"));
        assertEquals("键缺失必须记 absent", Integer.valueOf(1), t.get("absent"));
    }

    // ---------------------------------------------------------------
    // 修订二 / I-1：6.x mapping 的 date 字段提取（入参是已剥形态）
    // ---------------------------------------------------------------

    /**
     * 修订二 / I-1：<b>6.x 索引的 mapping 经既有剥离后</b>仍必须挑出 date 字段。
     *
     * <p>此处直接给出 {@code EsIndexAdmin.unwrapTypeLayer} 对 6.x 形态的<b>输出</b>形态
     * ——这才是主路径喂给 {@code dateFieldsOf} 的东西（{@code getMapping} 内部已剥）。
     * 「6.x 原始 mapping → 既有剥离 → 本方法」这条<b>整链</b>的验证在
     * {@code EsIndexAdminDateFieldsUnwrapTest}（在 core 包内，那里才能访问包级可见的
     * {@code unwrapTypeLayer}，不为测试放宽生产可见性）。</p>
     *
     * <p>剥错会让 dateFields 为空 → forms 全空 → 报告说「没有 date 字段」，
     * 即「缺席伪装成合法结论」。断言落在<b>元素个数与具体字段名</b>上，空集合会红。</p>
     */
    @Test
    public void dateFieldsOfHandlesV6TypedMappingAfterUnwrap() {
        // 6.x 的 {"_doc":{"properties":{...}}} 经 unwrapTypeLayer 后即为下面这个形态
        String unwrapped = "{\"properties\":{"
                + "\"entry_time\":{\"type\":\"date\"},"
                + "\"name\":{\"type\":\"keyword\"},"
                + "\"upd_time\":{\"type\":\"date\",\"format\":\"epoch_millis\"}}}";
        List<String> got = new ArrayList<String>(DateFormSampler.dateFieldsOf(unwrapped));
        assertEquals(2, got.size());
        assertTrue(got.contains("entry_time"));
        assertTrue(got.contains("upd_time"));
        assertFalse("keyword 字段不算 date", got.contains("name"));
    }

    /**
     * I-1：{@code dateFieldsOf} <b>刻意不做剥离兜底</b>——未剥的 6.x 原始形态给空集。
     *
     * <p>这不是缺陷而是契约：曾有过一个 {@code root.size()==1} 的兜底，它与
     * {@code unwrapTypeLayer} 行为不一致（6.x 多 type 时放弃、7.x 原始形态会多剥一层而
     * 意外命中），<b>比没有兜底更糟</b>。剥离只有一份实现，在 {@code EsIndexAdmin}。
     * 本条钉住「这里不会悄悄长出第二份」。</p>
     */
    @Test
    public void dateFieldsOfDoesNotSecondGuessUnstrippedInput() {
        String v6Raw = "{\"_doc\":{\"properties\":{\"entry_time\":{\"type\":\"date\"}}}}";
        assertEquals("未剥形态不许被本方法猜着剥", 0, DateFormSampler.dateFieldsOf(v6Raw).size());
        String v7Raw = "{\"mappings\":{\"properties\":{\"entry_time\":{\"type\":\"date\"}}}}";
        assertEquals("7.x 原始形态更不许被多剥一层", 0, DateFormSampler.dateFieldsOf(v7Raw).size());
    }

    /** 7.x 无类型 mapping 同样要挑得出来。 */
    @Test
    public void dateFieldsOfHandlesV7TypelessMapping() {
        String v7 = "{\"properties\":{\"entry_time\":{\"type\":\"date\"},\"n\":{\"type\":\"long\"}}}";
        List<String> got = new ArrayList<String>(DateFormSampler.dateFieldsOf(v7));
        assertEquals(1, got.size());
        assertTrue(got.contains("entry_time"));
    }

    /** 嵌套 object 下的 date 字段用点路径表示，且能被 tally 消费。 */
    @Test
    public void dateFieldsOfWalksNestedProperties() {
        String m = "{\"properties\":{\"meta\":{\"properties\":{\"created\":{\"type\":\"date\"}}}}}";
        List<String> got = new ArrayList<String>(DateFormSampler.dateFieldsOf(m));
        assertEquals(1, got.size());
        assertTrue(got.contains("meta.created"));
    }

    /** 无 date 字段 / 空 / 非法 mapping 一律空集，不许崩。 */
    @Test
    public void dateFieldsOfToleratesBadInput() {
        assertEquals(0, DateFormSampler.dateFieldsOf(null).size());
        assertEquals(0, DateFormSampler.dateFieldsOf("").size());
        assertEquals(0, DateFormSampler.dateFieldsOf("not json").size());
        assertEquals(0, DateFormSampler.dateFieldsOf("{\"properties\":{\"n\":{\"type\":\"long\"}}}").size());
    }

    /** 点路径字段能从嵌套 _source 里取到值 —— 否则嵌套 date 全被记成 absent。 */
    @Test
    public void tallyResolvesDottedPathIntoNestedSource() {
        Map<String, Object> inner = new LinkedHashMap<String, Object>();
        inner.put("created", 1754000000000L);
        Map<String, Object> doc = new LinkedHashMap<String, Object>();
        doc.put("meta", inner);
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        docs.add(doc);
        Map<String, Integer> t = DateFormSampler.tally(docs, Arrays.asList("meta.created"))
                .getForms().get("meta.created");
        assertEquals(Integer.valueOf(1), t.get("epoch_millis"));
    }

    /**
     * M1：{@code _source} 里存在<b>字面含点的扁平键</b>时优先按扁平取，不去拆点路径。
     *
     * <p>加这条的理由：ES 的 {@code _source} 两种形态都真实存在——嵌套 object 会得到
     * {@code {"meta":{"created":…}}}，而某些写入方（如扁平化后直接写入）会得到字面键
     * {@code {"meta.created":…}}。两者的 mapping 都长成 {@code meta.created}，
     * 即<b>同一个字段名对应两种 _source 形态</b>。此前只有嵌套那条有测试，
     * 扁平优先这条分支零覆盖——若它被改掉，含点键的字段会全部记成 {@code absent}，
     * 又是一次「缺席伪装成合法结论」。</p>
     */
    @Test
    public void tallyPrefersLiteralDottedKeyOverNestedPath() {
        Map<String, Object> flat = new LinkedHashMap<String, Object>();
        flat.put("meta.created", 1754000000000L);
        List<Map<String, Object>> docs = new ArrayList<Map<String, Object>>();
        docs.add(flat);
        Map<String, Integer> t = DateFormSampler.tally(docs, Arrays.asList("meta.created"))
                .getForms().get("meta.created");
        assertEquals("字面含点键必须命中，不能记成 absent",
                Integer.valueOf(1), t.get("epoch_millis"));
    }

    private static Map<String, Object> one(String k, Object v) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put(k, v);
        return m;
    }
}
