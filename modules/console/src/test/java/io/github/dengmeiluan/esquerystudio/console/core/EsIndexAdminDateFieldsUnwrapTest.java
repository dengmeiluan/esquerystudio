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

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.validate.DateFormSampler;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 *   复审 I-1：「6.x 原始 mapping → 既有剥离 → 挑 date 字段」<b>整链</b>验证。
 *
 * <p><b>为什么在 core 包</b>：{@code EsIndexAdmin.unwrapTypeLayer} 是包级可见（），
 * 只有同包测试能调。<b>不为了测试放宽生产可见性</b>——那是让测试反向污染生产 API。</p>
 *
 * <p><b>为什么需要整链</b>：{@code DateFormSampler.dateFieldsOf} 刻意不做剥离兜底，
 * 它依赖 {@code EsIndexAdmin.getMapping} 已剥好。这个依赖是<b>跨类的约定</b>——
 * 若某天 {@code unwrapTypeLayer} 改了行为，只测两端各自的单元测试都不会红，
 * 但产线上 6.7.2 的 dateFields 会变空、report 会说「没有 date 字段」。
 * 故必须有一条把两者接起来的判据。</p>
 */
public class EsIndexAdminDateFieldsUnwrapTest {

    private static final ObjectMapper OM = new ObjectMapper();

    /**
     * 6.x typed mapping 经 {@code unwrapTypeLayer} 后，date 字段必须仍被挑出。
     *
     * <p>断言落在<b>元素个数与具体字段名</b>上：链路任一环剥错都会得到空集，
     * 空集会让 {@code assertEquals(2, ...)} 红，不会「在空集合上恒真」。</p>
     */
    @Test
    @SuppressWarnings("unchecked")
    public void v6TypedMappingUnwrappedThenDateFieldsExtracted() throws Exception {
        String v6Raw = "{\"_doc\":{\"properties\":{"
                + "\"entry_time\":{\"type\":\"date\"},"
                + "\"name\":{\"type\":\"keyword\"},"
                + "\"upd_time\":{\"type\":\"date\",\"format\":\"epoch_millis\"}}}}";
        Map<String, Object> mappings = OM.readValue(v6Raw, Map.class);

        // 走仓库里唯一那份剥离实现（），不在测试里另写一份
        Map<String, Object> unwrapped = EsIndexAdmin.unwrapTypeLayer(mappings);
        List<String> got = new ArrayList<String>(
                DateFormSampler.dateFieldsOf(OM.writeValueAsString(unwrapped)));

        assertEquals("6.x 剥离后必须挑出 2 个 date 字段", 2, got.size());
        assertTrue(got.contains("entry_time"));
        assertTrue(got.contains("upd_time"));
        assertFalse("keyword 字段不算 date", got.contains("name"));
    }

    /** 7.x typeless mapping 走同一条链也必须正确（剥离对它是恒等变换）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void v7TypelessMappingUnwrappedThenDateFieldsExtracted() throws Exception {
        String v7Raw = "{\"properties\":{\"entry_time\":{\"type\":\"date\"},\"n\":{\"type\":\"long\"}}}";
        Map<String, Object> mappings = OM.readValue(v7Raw, Map.class);
        Map<String, Object> unwrapped = EsIndexAdmin.unwrapTypeLayer(mappings);
        List<String> got = new ArrayList<String>(
                DateFormSampler.dateFieldsOf(OM.writeValueAsString(unwrapped)));
        assertEquals(1, got.size());
        assertTrue(got.contains("entry_time"));
    }
}
