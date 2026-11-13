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

package io.github.dengmeiluan.esquerystudio.console.core;

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
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

/**
 *   复审 C1/I-2：{@link EsIndexRebuildService#dateForms} 的<b>CI 侧</b>判据。
 *
 * <p><b>为什么必须有本类</b>：修订一那条硬门（采样口径不许用 {@code match_all}，因为它在
 * 「形态发生过变化」这一被测场景下系统性假阴性）此前<b>只被一个 main 方法演练程序覆盖</b>
 * （{@code R94DateFormSamplingDrill}，需要活 ES、不在 CI 里跑）。于是把 DSL 改回
 * {@code match_all}、把 {@code sampling} 改成 {@code "doc_order"}，<b>全量测试照样全绿</b>——
 * 那道硬门形同虚设。<b>未执行的代码证明不了行为。</b></p>
 *
 * <p>故本类把判据落在<b>实际发给 ES 的那个 DSL 字符串</b>与<b>响应体里 sampling 的值</b>上：
 * 用桩 admin 截获 {@code queryDsl} 的入参，这是「代码真的发了随机采样」的唯一可执行证据。</p>
 *
 * <p>顺带覆盖 I-2 指出的零测试接线：{@code hits → _source} 抽取、{@code total} 透传、
 * {@code resolveToPhysical} 解析、{@code size} 钳制。</p>
 */
public class EsIndexRebuildServiceDateFormsTest {

    /** 截获 queryDsl 入参的桩——判据落在「发出去的 DSL」上，返回值看不见它。 */
    static class CapturingAdmin extends EsIndexAdmin {
        String capturedIndex;
        String capturedDsl;
        int capturedSize = -1;
        String mappingJson = "{\"properties\":{\"t\":{\"type\":\"date\"}}}";
        List<Map<String, Object>> hits = new ArrayList<>();
        Object total = 0;

        CapturingAdmin() {
            super(null);
        }

        @Override
        public Map<String, Object> queryDsl(String indexOrAlias, String dslJson, int size) {
            this.capturedIndex = indexOrAlias;
            this.capturedDsl = dslJson;
            this.capturedSize = size;
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("total", total);
            resp.put("hits", hits);
            return resp;
        }

        @Override
        public String getMapping(String index) {
            return mappingJson;
        }

        void addHit(Object tValue) {
            Map<String, Object> src = new LinkedHashMap<>();
            src.put("t", tValue);
            Map<String, Object> hit = new LinkedHashMap<>();
            hit.put("_id", "id" + hits.size());
            hit.put("_source", src);
            hits.add(hit);
        }
    }

    private static EsIndexRebuildService service(CapturingAdmin admin) {
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        IndexMetaRegistry registry = new IndexMetaRegistry(null, java.util.Collections.emptyList());
        return new EsIndexRebuildService(registry, admin, null,
                new IndexNameResolver(admin, props, null), props);
    }

    // ───────── C1：采样口径必须是随机采样，且响应体必须如实说明口径 ─────────

    /**
     * C1 硬门：发给 ES 的 DSL 必须是 {@code random_score} 随机采样。
     *
     * <p>判据落在<b>实际发出的 DSL 字符串</b>上：改回 {@code match_all} 这条必红。
     * 断言「不含裸 match_all 查询」用的是 {@code function_score} 与 {@code random_score}
     * 两个必需片段——只断言「含 match_all」会恒真（random_score 内层也有 match_all）。</p>
     */
    @Test
    public void dateFormsSamplesWithRandomScoreNotDocOrder() throws Exception {
        CapturingAdmin admin = new CapturingAdmin();
        service(admin).dateForms("idx", 50);
        assertNotNull("必须真的发出了查询", admin.capturedDsl);
        assertTrue("采样 DSL 必须用 function_score 包裹，实际=" + admin.capturedDsl,
                admin.capturedDsl.contains("function_score"));
        assertTrue("采样 DSL 必须带 random_score，实际=" + admin.capturedDsl,
                admin.capturedDsl.contains("random_score"));
    }

    /**
     * C1：{@code match_all} 若是<b>顶层</b>查询即为偏倚口径 —— 顶层必须是 function_score。
     * <p>与上一条互补：上一条防「删掉随机采样」，这条防「在 function_score 之外
     * 另起一个裸 match_all 顶层查询」。</p>
     */
    @Test
    public void dateFormsDslDoesNotStartWithBareMatchAll() throws Exception {
        CapturingAdmin admin = new CapturingAdmin();
        service(admin).dateForms("idx", 50);
        String dsl = admin.capturedDsl.replaceAll("\\s+", "");
        assertTrue("顶层查询必须是 function_score，实际=" + dsl,
                dsl.startsWith("{\"query\":{\"function_score\""));
    }

    /** C1：响应体必须带 sampling，且其值等于常量 —— 删掉该键或改值这条必红。 */
    @Test
    public void dateFormsReportsSamplingModeInResponse() throws Exception {
        CapturingAdmin admin = new CapturingAdmin();
        Map<String, Object> out = service(admin).dateForms("idx", 50);
        assertTrue("响应体必须含 sampling 键", out.containsKey("sampling"));
        assertEquals("sampling 必须如实等于实际采样口径常量",
                EsIndexRebuildService.SAMPLING_RANDOM_SCORE, out.get("sampling"));
        assertEquals("常量值本身不许被悄悄改成非随机口径", "random_score",
                EsIndexRebuildService.SAMPLING_RANDOM_SCORE);
    }

    // ───────── C2：forms 值域必须纯计数（TS 侧 reduce 求和不许被样例数组污染）─────────

    /**
     * C2：{@code forms} 的<b>每一个</b>值都必须是数字 —— 遍历断言，不是抽查一个。
     *
     * <p>规则一自问：什么样的错误实现能让它照样通过？——若 {@code forms} 为空，
     * 循环体一次都不执行，断言恒真。故先断言 {@code forms} 非空且计数总和等于样本数，
     * 把「空集合上恒真」这条路堵死。</p>
     */
    @Test
    public void formsValuesAreAllNumbersAndSamplesLiveInSeparateTree() throws Exception {
        CapturingAdmin admin = new CapturingAdmin();
        admin.addHit(1754000000000L);   // epoch_millis
        admin.addHit("not a date");     // other -> 会产生样例
        admin.addHit(0);                // ambiguous_small -> 会产生样例
        admin.total = 3;
        Map<String, Object> out = service(admin).dateForms("idx", 50);

        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> forms = (Map<String, Map<String, Object>>) out.get("forms");
        assertFalse("forms 不许为空，否则下面的遍历断言恒真", forms.isEmpty());

        int sum = 0;
        for (Map.Entry<String, Map<String, Object>> field : forms.entrySet()) {
            assertFalse("字段 " + field.getKey() + " 的形态分布不许为空", field.getValue().isEmpty());
            for (Map.Entry<String, Object> e : field.getValue().entrySet()) {
                assertTrue("forms." + field.getKey() + "." + e.getKey()
                                + " 必须是数字，实际类型=" + e.getValue().getClass().getSimpleName(),
                        e.getValue() instanceof Number);
                sum += ((Number) e.getValue()).intValue();
            }
        }
        assertEquals("计数总和必须等于样本数（证明遍历真的走到了每个计数）", 3, sum);

        // 样例仍必须存在，只是在另一棵树里 —— 否则「值域纯数字」可以靠删掉样例来满足
        @SuppressWarnings("unchecked")
        Map<String, Map<String, List<String>>> samples =
                (Map<String, Map<String, List<String>>>) out.get("samples");
        assertNotNull("samples 树必须存在", samples);
        Map<String, List<String>> tSamples = samples.get("t");
        assertNotNull("other/ambiguous_small 的样例必须仍被保留", tSamples);
        assertTrue("other 样例必须含真实值", tSamples.get("other").contains("not a date"));
        assertTrue("ambiguous_small 样例必须含真实值", tSamples.get("ambiguous_small").contains("0"));
    }

    /** C2：无 other/ambiguous_small 时 samples 不产生空壳键。 */
    @Test
    public void samplesOmitsFieldsWithNothingToShow() throws Exception {
        CapturingAdmin admin = new CapturingAdmin();
        admin.addHit(1754000000000L);
        Map<String, Object> out = service(admin).dateForms("idx", 50);
        @SuppressWarnings("unchecked")
        Map<String, Map<String, List<String>>> samples =
                (Map<String, Map<String, List<String>>>) out.get("samples");
        assertTrue("干净形态不该产生 samples 条目", samples.isEmpty());
    }

    // ───────── I-2：dateForms 的接线（此前零覆盖）─────────

    /** I-2：hits → _source 抽取，且 sampled 等于真实抽出的条数。 */
    @Test
    public void dateFormsExtractsSourcesAndCountsSampled() throws Exception {
        CapturingAdmin admin = new CapturingAdmin();
        admin.addHit(1754000000000L);
        admin.addHit(1754000000L);
        admin.total = 99;
        Map<String, Object> out = service(admin).dateForms("idx", 50);
        assertEquals("sampled 必须是真实抽出的 _source 条数", 2, out.get("sampled"));
        assertEquals("total 必须透传 ES 的命中总数", 99, out.get("total"));
        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> forms = (Map<String, Map<String, Object>>) out.get("forms");
        assertEquals(Integer.valueOf(1), forms.get("t").get("epoch_millis"));
        assertEquals(Integer.valueOf(1), forms.get("t").get("epoch_seconds"));
    }

    /** I-2：hits 缺失/异形时不炸，sampled 为 0（而不是抛异常或给出假数）。 */
    @Test
    public void dateFormsToleratesMissingHits() throws Exception {
        CapturingAdmin admin = new CapturingAdmin() {
            @Override
            public Map<String, Object> queryDsl(String i, String d, int s) {
                return new LinkedHashMap<>();   // 无 hits 无 total
            }
        };
        Map<String, Object> out = service(admin).dateForms("idx", 50);
        assertEquals(0, out.get("sampled"));
        // api.ts 声明 total 为非可选 number。原先该保证来自 EsIndexAdmin.queryDsl 的内部实现
        // （另一个类），现由 dateForms 自己兜底，故此处钉住兜底值。
        assertEquals("total 缺失必须兜底为 0，不能是 null", 0, out.get("total"));
    }

    /** I-2：size 钳制 —— 0/负数走默认 50，超限钳到 500（并非 service.queryDsl 那个 100）。 */
    @Test
    public void dateFormsClampsSize() throws Exception {
        CapturingAdmin a1 = new CapturingAdmin();
        service(a1).dateForms("idx", 0);
        assertEquals("size<=0 走默认 50", 50, a1.capturedSize);

        CapturingAdmin a2 = new CapturingAdmin();
        service(a2).dateForms("idx", 100000);
        assertEquals("上限 500", 500, a2.capturedSize);

        CapturingAdmin a3 = new CapturingAdmin();
        service(a3).dateForms("idx", 250);
        assertEquals("范围内原样透传", 250, a3.capturedSize);
    }

    /** I-2：未登记的索引名原样直传给 ES（集群级只读端点的既定行为）。 */
    @Test
    public void dateFormsPassesUnregisteredNameThrough() throws Exception {
        CapturingAdmin admin = new CapturingAdmin();
        Map<String, Object> out = service(admin).dateForms("r93_raw_index", 50);
        assertEquals("r93_raw_index", admin.capturedIndex);
        assertEquals("r93_raw_index", out.get("physicalIndex"));
    }

    /** I-2：mapping 无 date 字段时 dateFields/forms 为空，但仍如实给出 sampled/sampling。 */
    @Test
    public void dateFormsWithNoDateFieldsStillReportsSampling() throws Exception {
        CapturingAdmin admin = new CapturingAdmin();
        admin.mappingJson = "{\"properties\":{\"n\":{\"type\":\"long\"}}}";
        admin.addHit(1754000000000L);
        Map<String, Object> out = service(admin).dateForms("idx", 50);
        assertEquals(Arrays.asList(), out.get("dateFields"));
        assertEquals(1, out.get("sampled"));
        assertEquals(EsIndexRebuildService.SAMPLING_RANDOM_SCORE, out.get("sampling"));
    }
}
