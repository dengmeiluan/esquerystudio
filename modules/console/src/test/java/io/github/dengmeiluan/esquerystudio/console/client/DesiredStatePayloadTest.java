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

package io.github.dengmeiluan.esquerystudio.console.client;

import io.github.dengmeiluan.esquerystudio.console.control.EntityMappingDeriver;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.junit.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class DesiredStatePayloadTest {

    static class AssetBasicInfoES { }
    static class BondQuoteInfoES { }

    private static RebuildableIndexMeta meta(final Class<?> entity, String alias, String prefix,
                                            String settings, String mapping) {
        ManagedEsIndex decl = new ManagedEsIndex() {
            @Override
            public Class<?> entityClass() {
                return entity;
            }
        };
        return new RebuildableIndexMeta(decl, alias, prefix, settings, mapping);
    }

    @Test
    public void emptyInputYieldsEmptyList() {
        assertTrue(DesiredStatePayload.of(Collections.<RebuildableIndexMeta>emptyList(), null).isEmpty());
    }

    @Test
    public void nullInputYieldsEmptyList() {
        assertTrue(DesiredStatePayload.of(null, null).isEmpty());
    }

    @Test
    public void mapsAllSixFields() {
        List<Map<String, Object>> out = DesiredStatePayload.of(Collections.singletonList(
                meta(AssetBasicInfoES.class, "asset_basic_info_alias", "asset_basic_info", "{\"s\":1}", "{\"m\":2}")), null);
        assertEquals(1, out.size());
        Map<String, Object> row = out.get(0);
        assertEquals("assetBasicInfo", row.get("indexKey"));
        assertEquals(AssetBasicInfoES.class.getName(), row.get("entityClass"));
        // alias 与 prefix 必须取值不同：两者同值时无法证伪「取错 getter」的接线错误
        assertEquals("asset_basic_info_alias", row.get("alias"));
        assertEquals("asset_basic_info", row.get("physicalIndexPrefix"));
        assertEquals("{\"s\":1}", row.get("settingsJson"));
        assertEquals("{\"m\":2}", row.get("mappingJson"));
    }

    /** 实体无 @Mapping 时 mappingJson 为 null，必须原样透出（不能转成 "" 或 "{}"）——
        宿主侧要靠 null 判定「无 mapping，将由 ES 动态推断」并要求二次确认。 */
    @Test
    public void nullMappingJsonStaysNull() {
        List<Map<String, Object>> out = DesiredStatePayload.of(Collections.singletonList(
                meta(AssetBasicInfoES.class, "a", "a", "{}", null)), null);
        assertTrue(out.get(0).containsKey("mappingJson"));
        assertNull(out.get(0).get("mappingJson"));
    }

    /** 实体无 @Setting 时 settingsJson 同样为 null，必须原样透出。
        settingsJson 与 mappingJson 走 IndexMetaRegistry 里同一条路径
        （getSettingPath/getMappingPath 均在注解缺失时返回 null → readAnnotationPath 对 null/空路径返回 null），
        故两者可空性对称。独立成一个测试方法而非并入上一条：合并后若 mappingJson 先失败，
        settingsJson 的断言将不会被执行，等于失去独立证伪能力。 */
    @Test
    public void nullSettingsJsonStaysNull() {
        List<Map<String, Object>> out = DesiredStatePayload.of(Collections.singletonList(
                meta(AssetBasicInfoES.class, "a", "a", null, "{}")), null);
        assertTrue(out.get(0).containsKey("settingsJson"));
        assertNull(out.get(0).get("settingsJson"));
    }

    /** 键序固定：人复制出来的 JSON 要可读、可 diff，键序漂移会让两次复制产出不同文本。 */
    @Test
    public void keyOrderIsStable() {
        List<Map<String, Object>> out = DesiredStatePayload.of(Collections.singletonList(
                meta(AssetBasicInfoES.class, "a", "a", "{}", "{}")), null);
        assertEquals(Arrays.asList("indexKey", "entityClass", "alias",
                        "physicalIndexPrefix", "settingsJson", "mappingJson",
                        "mappingParsed", "derivedMappingJson", "sdesVersion", "fields"),
                new ArrayList<String>(out.get(0).keySet()));
    }

    /** fields 必须是列表且对无字段实体也不为 null —— 前端会直接遍历它。 */
    @Test
    public void fieldsIsAlwaysAList() {
        List<Map<String, Object>> out = DesiredStatePayload.of(Collections.singletonList(
                meta(AssetBasicInfoES.class, "a", "a", "{}", "{}")), null);
        assertTrue(out.get(0).get("fields") instanceof java.util.List);
    }

    // ----------------------------------------------------------------------------------------
    // 评审 I-2：mappingParsed 是 per-index 事实，须在 row 级且与字段列表解耦。
    // AssetBasicInfoES 是零字段实体 —— 旧的字段级实现在这里恰好无从取值（fields[0] 不存在）。
    // ----------------------------------------------------------------------------------------

    /** 合法 mapping：row 级 mappingParsed 为 true，且不受「该实体没有字段」影响。 */
    @Test
    public void mappingParsedIsTrueAtRowLevelEvenWhenEntityHasNoFields() {
        List<Map<String, Object>> out = DesiredStatePayload.of(Collections.singletonList(
                meta(AssetBasicInfoES.class, "a", "a", "{}", "{\"properties\":{\"x\":{\"type\":\"long\"}}}")), null);
        assertTrue("零字段实体的 fields 应为空列表",
                ((java.util.List<?>) out.get(0).get("fields")).isEmpty());
        assertEquals("mapping 合法即为 true，与实体有无字段无关",
                Boolean.TRUE, out.get(0).get("mappingParsed"));
    }

    /** 坏 JSON：row 级 mappingParsed 为 false —— 消费方据此禁止把 esType==null 读成 dynamic mapping。 */
    @Test
    public void mappingParsedIsFalseAtRowLevelForMalformedMappingJson() {
        List<Map<String, Object>> out = DesiredStatePayload.of(Collections.singletonList(
                meta(AssetBasicInfoES.class, "a", "a", "{}", "{not json")), null);
        assertEquals(Boolean.FALSE, out.get(0).get("mappingParsed"));
    }

    /** mappingJson 为 null（业务方没写 @Mapping，正常路径）：mappingParsed 同为 false，
        但与上一条的区别靠 row 级 mappingJson 是否为 null 判定 —— 二者不可合并。 */
    @Test
    public void mappingParsedIsFalseButMappingJsonNullDistinguishesUndeclaredFromUnparsable() {
        List<Map<String, Object>> out = DesiredStatePayload.of(Collections.singletonList(
                meta(AssetBasicInfoES.class, "a", "a", "{}", null)), null);
        assertEquals(Boolean.FALSE, out.get(0).get("mappingParsed"));
        assertNull("未声明 @Mapping 的标志是 mappingJson==null", out.get(0).get("mappingJson"));
    }

    /** 多索引时保持输入顺序（IndexMetaRegistry 用 LinkedHashMap，登记顺序有意义）。 */
    @Test
    public void preservesInputOrder() {
        List<Map<String, Object>> out = DesiredStatePayload.of(Arrays.asList(
                meta(BondQuoteInfoES.class, "b", "b", "{}", "{}"),
                meta(AssetBasicInfoES.class, "a", "a", "{}", "{}")), null);
        assertEquals("bondQuoteInfo", out.get(0).get("indexKey"));
        assertEquals("assetBasicInfo", out.get(1).get("indexKey"));
    }

    // ---------------- ：derivedMappingJson（重建实际会应用的那份 mapping）----------------

    /** 无 @Mapping 但有可映射属性的实体：推导得出内容。 */
    @Document(indexName = "payload_derived_alias")
    static class PayloadDerivedES {
        @Field(type = FieldType.Keyword)
        private String payloadProbeField;

        public String getPayloadProbeField() {
            return payloadProbeField;
        }

        public void setPayloadProbeField(String payloadProbeField) {
            this.payloadProbeField = payloadProbeField;
        }
    }

    /** 无 @Mapping 且无可映射属性：推导为空。 */
    @Document(indexName = "payload_empty_alias")
    static class PayloadEmptyES { }

    private static EntityMappingDeriver deriver() {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        ctx.refresh();
        return new EntityMappingDeriver(ctx);
    }

    private static Map<String, Object> rowOf(Class<?> entity, String mappingJson) {
        return DesiredStatePayload.of(Collections.singletonList(
                meta(entity, "a", "p", "{\"s\":1}", mappingJson)), deriver()).get(0);
    }

    /**
     * 有 @Mapping 时 derivedMappingJson 恒为 null —— 那时 mappingJson 才是权威，
     * 输出两份 mapping 会让 宿主 不知道该用哪份。
     */
    @Test
    public void derivedMappingIsNullWhenEntityDeclaresMapping() {
        Map<String, Object> row = rowOf(PayloadDerivedES.class, "{\"properties\":{\"declared\":{\"type\":\"keyword\"}}}");

        assertNotNull(row.get("mappingJson"));
        assertNull("有 @Mapping 时不得再输出推导结果", row.get("derivedMappingJson"));
    }

    /**
     * 无 @Mapping 且可推导 → payload 必须带上推导结果。
     *
     * <p><b>这条是本组的核心</b>：宿主 没有接入方的实体类、无法自己推导，
     * 只能用被复制过去的这份。少了它，复制过去的配置会丢掉代码声明的字段类型，
     * 索引被按 ES 动态推断重建。</p>
     */
    @Test
    public void derivedMappingIsCarriedWhenEntityHasNoMapping() {
        Map<String, Object> row = rowOf(PayloadDerivedES.class, null);

        assertNull(row.get("mappingJson"));
        assertEquals(Boolean.FALSE, row.get("mappingParsed"));
        String derived = (String) row.get("derivedMappingJson");
        assertNotNull("无 @Mapping 的实体，payload 必须带上重建会用的推导 mapping", derived);
        assertTrue("推导结果里应含实体 @Field 声明的字段", derived.contains("payloadProbeField"));
    }

    /** 无 @Mapping 且推导为空 → 两者皆 null，这才是真的「将由 ES 动态推断」。 */
    @Test
    public void bothNullMeansTrulyDynamicMapping() {
        Map<String, Object> row = rowOf(PayloadEmptyES.class, null);

        assertNull(row.get("mappingJson"));
        assertNull(row.get("derivedMappingJson"));
    }

    /** deriver 为 null（调用方无推导能力）→ 退化为  之前的行为，不抛异常。 */
    @Test
    public void nullDeriverDegradesInsteadOfThrowing() {
        Map<String, Object> row = DesiredStatePayload.of(Collections.singletonList(
                meta(PayloadDerivedES.class, "a", "p", "{\"s\":1}", null)), null).get(0);

        assertNull(row.get("derivedMappingJson"));
    }

}
