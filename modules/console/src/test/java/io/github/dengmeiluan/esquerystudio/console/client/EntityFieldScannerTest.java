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

import org.junit.Test;
import org.springframework.data.annotation.Transient;
import org.springframework.data.elasticsearch.annotations.DateFormat;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class EntityFieldScannerTest {

    static class Sample {
        /** 有 @Field 但 type/format 都没写 —— 修订二的中间态：注解在、该项未指定。 */
        @Field("entry_time")
        Timestamp entryTime;
        /** 驼峰 @Field 名 + mapping 里定义的是下划线 —— spec §9.3 的信号⑤ */
        @Field("updateTime")
        Timestamp updateTime;
        @Field(value = "iso_at", type = FieldType.Date, format = DateFormat.date_optional_time)
        java.time.Instant isoAt;
        @Field(value = "pat_at", type = FieldType.Date, format = DateFormat.custom, pattern = "yyyy-MM-dd HH:mm:ss")
        Timestamp patAt;
        /** 无 @Field：name 应回落到 Java 字段名 */
        Long plainLong;
        @Transient
        String ignored;
    }

    /** 零字段实体：合法但 scan 产出空列表 —— 评审 I-2 指出的「空列表被误判成未解析」的证人。 */
    static class NoFields {
    }

    /** Sample 的非 transient / 非 static / 非 synthetic 字段数：
        entryTime / updateTime / isoAt / patAt / plainLong = 5（ignored 被 @Transient 排除）。 */
    private static final int SAMPLE_FIELD_COUNT = 5;

    private static final String MAPPING = "{\"properties\":{"
            + "\"entry_time\":{\"type\":\"date\"},"
            + "\"update_time\":{\"type\":\"date\"},"
            + "\"iso_at\":{\"type\":\"date\",\"format\":\"date_optional_time\"},"
            + "\"pat_at\":{\"type\":\"date\"},"
            + "\"plainLong\":{\"type\":\"long\"}}}";

    private static Map<String, Object> byName(List<Map<String, Object>> rows, String name) {
        for (Map<String, Object> r : rows) {
            if (name.equals(r.get("name"))) {
                return r;
            }
        }
        throw new AssertionError("未找到字段 " + name + "，实际=" + rows);
    }

    @Test
    public void skipsTransientFields() {
        List<Map<String, Object>> rows = EntityFieldScanner.scan(Sample.class, MAPPING);
        for (Map<String, Object> r : rows) {
            assertTrue("@Transient 字段不该出现: " + r, !"ignored".equals(r.get("declaredName")));
        }
    }

    /** 修订一第 3 步：断言确切条数。size() > 0 会让「只扫出 1 个字段」也过。 */
    @Test
    public void scansExactlyEveryNonTransientField() {
        assertEquals(SAMPLE_FIELD_COUNT, EntityFieldScanner.scan(Sample.class, MAPPING).size());
    }

    @Test
    public void mapsFieldNameAndDeclaredNameSeparately() {
        Map<String, Object> r = byName(EntityFieldScanner.scan(Sample.class, MAPPING), "entry_time");
        assertEquals("entry_time", r.get("name"));
        assertEquals("entryTime", r.get("declaredName"));
    }

    @Test
    public void nameFallsBackToDeclaredNameWhenNoFieldAnnotation() {
        Map<String, Object> r = byName(EntityFieldScanner.scan(Sample.class, MAPPING), "plainLong");
        assertEquals("plainLong", r.get("name"));
        assertEquals("plainLong", r.get("declaredName"));
    }

    @Test
    public void recordsFullyQualifiedJavaType() {
        assertEquals("java.sql.Timestamp",
                byName(EntityFieldScanner.scan(Sample.class, MAPPING), "entry_time").get("javaType"));
        assertEquals("java.time.Instant",
                byName(EntityFieldScanner.scan(Sample.class, MAPPING), "iso_at").get("javaType"));
    }

    /** esType 从 mapping 按 name 查；查不到 -> null（走 dynamic mapping）。
        updateTime 正是 spec §9.3 的信号⑤：mapping 里只有 update_time，没有 updateTime。 */
    @Test
    public void esTypeIsNullWhenMappingHasNoSuchKey() {
        List<Map<String, Object>> rows = EntityFieldScanner.scan(Sample.class, MAPPING);
        assertEquals("date", byName(rows, "entry_time").get("esType"));
        assertNull("mapping 里没有 updateTime 这个键，必须是 null 而不是 date",
                byName(rows, "updateTime").get("esType"));
    }

    @Test
    public void recordsFieldAnnotationTypeFormatPattern() {
        Map<String, Object> iso = byName(EntityFieldScanner.scan(Sample.class, MAPPING), "iso_at");
        assertEquals("Date", iso.get("annType"));
        assertEquals("date_optional_time", iso.get("annFormat"));
        Map<String, Object> pat = byName(EntityFieldScanner.scan(Sample.class, MAPPING), "pat_at");
        assertEquals("custom", pat.get("annFormat"));
        assertEquals("yyyy-MM-dd HH:mm:ss", pat.get("annPattern"));
    }

    /**
     * 修订二：`@Field` 在、但 type/format 未指定的中间态。
     *
     * <p>sdes 4.0.9 的 `javap -v` 实测默认值为 `FieldType.Auto` / `DateFormat.none`
     * （常量池 #14=Auto、#21=none）。所以这两列拿到的是<b>哨兵字符串</b>而不是 null。
     * 一个「未显式指定就返回 null」的错误实现能通过 recordsFieldAnnotationTypeFormatPattern
     * 与 annotationColumnsAreNullWhenNoFieldAnnotation 两条 —— 本条专门钉死这个中间态。</p>
     */
    @Test
    public void fieldAnnotationPresentButTypeAndFormatUnspecifiedYieldsEnumDefaults() {
        Map<String, Object> r = byName(EntityFieldScanner.scan(Sample.class, MAPPING), "entry_time");
        assertEquals("注解在但未指定 type，应为枚举默认值而非 null", "Auto", r.get("annType"));
        assertEquals("注解在但未指定 format，应为枚举默认值而非 null", "none", r.get("annFormat"));
        assertNull("pattern 未指定时是空串，规整为 null", r.get("annPattern"));
    }

    /** 无 @Field 时三个注解列全 null，不能给空串（前端要靠 null 判断"没写注解"）。 */
    @Test
    public void annotationColumnsAreNullWhenNoFieldAnnotation() {
        Map<String, Object> r = byName(EntityFieldScanner.scan(Sample.class, MAPPING), "plainLong");
        assertNull(r.get("annType"));
        assertNull(r.get("annFormat"));
        assertNull(r.get("annPattern"));
    }

    @Test
    public void nullMappingJsonYieldsNullEsTypeForAll() {
        List<Map<String, Object>> rows = EntityFieldScanner.scan(Sample.class, null);
        for (Map<String, Object> r : rows) {
            assertNull("mappingJson 为 null 时 esType 必须全为 null: " + r, r.get("esType"));
        }
    }

    // ------------------------------------------------------------------------------------------
    // 修订一：区分 (a)「mapping 解析成功、但没有这个键」与 (b)「mapping 根本没解析成功」。
    // 两者在 esType 上同为 null，靠 mappingParsed 判别。
    // 评审 I-2：mappingParsed 是 per-index 事实，已从字段行提到 payload row 级，
    // 故此处直接测 mappingParsed(String) 谓词，不再逐字段断言。
    // ------------------------------------------------------------------------------------------

    /** (a) 解析成功：mappingParsed=true，此时 esType==null 才真的意味着「走 dynamic mapping」。 */
    @Test
    public void mappingParsedIsTrueWhenMappingJsonIsWellFormed() {
        assertTrue("合法 mapping 必须判为已解析", EntityFieldScanner.mappingParsed(MAPPING));
    }

    /** (b) 坏 JSON：scan 不抛，且 mappingParsed 必须为 false —— 否则前端会把「我们不知道」当成「走 dynamic mapping」。 */
    @Test
    public void malformedMappingJsonIsReportedAsUnparsedNotAsAbsentField() {
        List<Map<String, Object>> rows = EntityFieldScanner.scan(Sample.class, "{not json");
        assertEquals(SAMPLE_FIELD_COUNT, rows.size());
        for (Map<String, Object> r : rows) {
            assertNull("坏 JSON 下 esType 仍为 null: " + r, r.get("esType"));
        }
        assertFalse("坏 JSON 必须判为未解析", EntityFieldScanner.mappingParsed("{not json"));
    }

    /** mappingJson 为 null 是「业务方没写 @Mapping」的正常路径，同样不算解析成功。 */
    @Test
    public void mappingParsedIsFalseWhenMappingJsonIsNull() {
        assertFalse("mappingJson 为 null 时必须判为未解析", EntityFieldScanner.mappingParsed(null));
    }

    /** properties 键缺失同样是「解析不出字段信息」，不能伪装成「所有字段都走 dynamic mapping」。 */
    @Test
    public void mappingParsedIsFalseWhenPropertiesKeyIsMissing() {
        assertFalse("没有 properties 键时不得判为已解析",
                EntityFieldScanner.mappingParsed("{\"settings\":{}}"));
    }

    /** 空白 / properties 非对象同样为 false（补齐 mappingParsed 的五种 false 输入）。 */
    @Test
    public void mappingParsedIsFalseWhenBlankOrPropertiesNotObject() {
        assertFalse("空串必须判为未解析", EntityFieldScanner.mappingParsed(""));
        assertFalse("纯空白必须判为未解析", EntityFieldScanner.mappingParsed("   "));
        assertFalse("properties 非对象必须判为未解析",
                EntityFieldScanner.mappingParsed("{\"properties\":\"nope\"}"));
    }

    /**
     * 评审 I-2 的核心回归：{@code mappingParsed} 与字段列表<b>解耦</b>。
     *
     * <p>旧实现把 mappingParsed 塞在字段行里，消费方只能靠 {@code fields[0]} 取值；
     * 于是「合法 mapping + 零字段实体」这一组合会因列表为空而无从取值、被误判成「未解析」——
     * 又一次「缺席与合法值同形」。提到 row 级后，两者互不影响：本条钉住这一点。</p>
     */
    @Test
    public void mappingParsedIsIndependentOfWhetherEntityHasAnyFields() {
        assertTrue("零字段实体不影响 mapping 是否解析成功",
                EntityFieldScanner.mappingParsed(MAPPING));
        assertTrue("零字段实体的 scan 结果应为空列表",
                EntityFieldScanner.scan(NoFields.class, MAPPING).isEmpty());
    }

    /** 字段行<b>不得</b>再携带 mappingParsed —— 它是 per-index 事实，重复 N 份即是 I-2 的病根。 */
    @Test
    public void fieldRowsDoNotCarryPerIndexMappingParsedKey() {
        for (Map<String, Object> r : EntityFieldScanner.scan(Sample.class, MAPPING)) {
            assertFalse("字段行不该有 mappingParsed 键（应在 payload row 级）: " + r,
                    r.containsKey("mappingParsed"));
        }
    }

    @Test
    public void keyOrderIsStable() {
        Map<String, Object> r = byName(EntityFieldScanner.scan(Sample.class, MAPPING), "entry_time");
        assertEquals(java.util.Arrays.asList("name", "declaredName", "javaType",
                        "esType", "esFormat", "annType", "annFormat", "annPattern"),
                new java.util.ArrayList<String>(r.keySet()));
    }

    // ------------------------------------------------------------------------------------------
    //   裁定四：esFormat —— mapping 里该字段的 format 键。
    //
    // 为何在后端而非前端现取：前端若为了 spec §9.5 规则 1 的 hasExplicitFormat 自行解析一次
    // mappingJson，仓库里就有了两个 mapping 解析器。它们此刻一致，从此各自演化。
    // 更糟的是语义可以错位——「后端说 mappingParsed=false、前端却解析成功读出了 format」
    // 在类型上完全合法。esFormat 与 esType 是同一类元信息、同一个提取动作，必须同址。
    // 附带好处：mappingParsed==false 时 esFormat 与 esType 一同为 null，降级行为天然一致。
    // ------------------------------------------------------------------------------------------

    /**
     * mapping 里写了 format 就必须读得出来 —— spec §9.5 规则 1
     * （{@code SECONDS_IN_FORMATLESS_DATE}）唯一的 mapping 侧输入。
     *
     * <p>锚为字面量 {@code "date_optional_time"}，不是从 MAPPING 里再解析一遍取值：
     * 两端派生自同一个源等于常量比自己，没有看守（本波规则三）。</p>
     */
    @Test
    public void esFormatIsReadFromMappingWhenPresent() {
        Map<String, Object> r = byName(EntityFieldScanner.scan(Sample.class, MAPPING), "iso_at");
        assertEquals("mapping 里 iso_at 写了 format，必须读出来",
                "date_optional_time", r.get("esFormat"));
    }

    /**
     * 字段在 mapping 里、但没写 format -> null。
     *
     * <p>这一格正是规则 1 报 ERROR 的前提：epoch_seconds 存进<b>无 format</b> 的 date 字段，
     * ES 默认 format 不含 epoch_second，排序/范围/聚合从第一天就是错的（ §5b）。
     * 若实现把「没写 format」误报成某个默认值，规则 1 会全线哑火。</p>
     */
    @Test
    public void esFormatIsNullWhenFieldExistsButHasNoFormat() {
        List<Map<String, Object>> rows = EntityFieldScanner.scan(Sample.class, MAPPING);
        assertEquals("前提：entry_time 确实在 mapping 里且是 date",
                "date", byName(rows, "entry_time").get("esType"));
        assertNull("entry_time 在 mapping 里但没写 format，必须是 null",
                byName(rows, "entry_time").get("esFormat"));
    }

    /** mapping 里没这个键 -> esType 与 esFormat 同为 null（updateTime 走 dynamic）。 */
    @Test
    public void esFormatIsNullWhenMappingHasNoSuchKey() {
        Map<String, Object> r = byName(EntityFieldScanner.scan(Sample.class, MAPPING), "updateTime");
        assertNull(r.get("esType"));
        assertNull("mapping 里没有 updateTime 这个键，esFormat 同样为 null", r.get("esFormat"));
    }

    /**
     * {@code mappingParsed==false} 时 esFormat 与 esType <b>一同</b>为 null。
     *
     * <p>这是选择「esFormat 走后端」的关键收益：前端拿到的两列在未解析场景下同步缺席，
     * 降级判定不会出现「esType 不可用但 esFormat 可用」这种半信半疑的中间态。</p>
     */
    @Test
    public void esFormatIsNullForAllFieldsWhenMappingIsUnparsed() {
        assertFalse("前提：坏 JSON 必须判为未解析", EntityFieldScanner.mappingParsed("{not json"));
        List<Map<String, Object>> rows = EntityFieldScanner.scan(Sample.class, "{not json");
        assertEquals(SAMPLE_FIELD_COUNT, rows.size());
        for (Map<String, Object> r : rows) {
            assertNull("未解析时 esType 必为 null: " + r, r.get("esType"));
            assertNull("未解析时 esFormat 必为 null: " + r, r.get("esFormat"));
        }
    }

    /** format 不是字符串（写成对象/数组）时按缺席处理，不得把 JSON 片段当 format 吐出去。 */
    @Test
    public void esFormatIsNullWhenFormatIsNotTextual() {
        String weird = "{\"properties\":{\"entry_time\":{\"type\":\"date\",\"format\":{\"a\":1}}}}";
        Map<String, Object> r = byName(EntityFieldScanner.scan(Sample.class, weird), "entry_time");
        assertEquals("前提：该字段本身仍解析得出 type", "date", r.get("esType"));
        assertNull("format 非字符串时按缺席处理", r.get("esFormat"));
    }

    /**
     * 多 format 用 {@code ||} 连写时必须<b>原样</b>保留 —— 规则 1 要在其中找 epoch_second。
     *
     * <p>断言用 {@code assertEquals} 全等而非 {@code contains}：若实现做了任何切分/规整，
     * 前端拿到的就不再是 mapping 的原文，规则 1 的子串判定会失准。</p>
     */
    @Test
    public void esFormatPreservesMultiFormatStringVerbatim() {
        String multi = "{\"properties\":{\"entry_time\":{\"type\":\"date\","
                + "\"format\":\"strict_date_optional_time||epoch_millis||epoch_second\"}}}";
        Map<String, Object> r = byName(EntityFieldScanner.scan(Sample.class, multi), "entry_time");
        assertEquals("strict_date_optional_time||epoch_millis||epoch_second", r.get("esFormat"));
    }

    /**
     * 评审 C-1：{@code sdesVersion()} 必须有<b>全链锚点</b>。
     *
     * <p>此前 sdesVersion 在测试里三处出现全无鉴别力：键序测试只看键、两条格式测试的期望值
     * 就是 {@code sdesVersion()} 自身（两端等量平移）、探测测试是恒真式。
     * 把实现改成 {@code return "banana"} 可以全绿 —— 修订三实测到的 {@code 4.0.9.RELEASE}
     * 只活在报告文本里，没落进任何断言。</p>
     *
     * <p><b>锚源必须独立于实现</b>：{@code sdesVersion()} 内部就是
     * {@code Field.class.getPackage().getImplementationVersion()}，用同一句做锚只能挡住
     * 「键没接上」，挡不住「这个读法本身坏了」。故本条<b>绕开 Package API</b>，
     * 经 {@code ProtectionDomain} 拿到 sdes jar 的物理路径，用 {@link JarFile} 直接读
     * {@code META-INF/MANIFEST.MF} 的 {@code Implementation-Version}。</p>
     *
     * <p>断言用 {@code startsWith("4.0.")} 而非全等：sdes 升到 4.0.10 时不该假红，
     * 但换大版本（4.1 / 5.x）必须红 —— 那时 date 兼容矩阵本身需要重测。</p>
     */
    @Test
    public void sdesVersionMatchesVersionReadDirectlyFromJarManifest() throws Exception {
        java.security.CodeSource cs = Field.class.getProtectionDomain().getCodeSource();
        assertNotNull("sdes CodeSource 必须存在（否则无法锚定 manifest）", cs);
        java.io.File jar = new java.io.File(cs.getLocation().toURI());
        assertTrue("sdes 必须是 jar 形态才能锚定 manifest，实际: " + jar, jar.isFile());

        String fromManifest;
        java.util.jar.JarFile jf = new java.util.jar.JarFile(jar);
        try {
            fromManifest = jf.getManifest().getMainAttributes().getValue("Implementation-Version");
        } finally {
            jf.close();
        }
        System.out.println("[anchor] jar=" + jar.getName() + " Implementation-Version=" + fromManifest);

        assertNotNull("sdes jar 的 manifest 必须有 Implementation-Version", fromManifest);
        /* 已验证区间从 4.0.x 扩到 4.0.x / 4.4.x ——  做的正是「换大版本必须重测」这件事
           （4 个签名断裂点已由 SdesCompat 反射化，双版本兑现见 SdesContractMatrixTest）。
           闸门语义不变：换到 4.1 / 4.2 / 5.x 仍然会红，那时 date 兼容矩阵仍需重测。
           区间的单一来源是 EsStackContractValidator.VERIFIED_SDES，改动时两处必须同步。 */
        assertTrue("已将已验证区间扩到 4.0.x / 4.4.x（参见 EsStackContractValidator.VERIFIED_SDES）；"
                        + "其它大版本必须重测。实际=" + fromManifest,
                fromManifest.startsWith("4.0.") || fromManifest.startsWith("4.4."));
        assertEquals("sdesVersion() 必须与 jar manifest 实际值一致",
                fromManifest, EntityFieldScanner.sdesVersion());
    }

    /* 改用 SdesCompat 反射取值后，annFormat/annPattern 的口径必须与改动前一致 ——
       「注解在但未指定」产出枚举默认名（不是 null），「没写注解」才是 null。
       这条防的是「为了跨版本兼容而顺手把默认值规整成 null」，那会让两种情形不可分辨。 */
    @Test
    public void r96AnnFormatKeepsEnumDefaultWhenUnspecified() {
        List<Map<String, Object>> rows = EntityFieldScanner.scan(R96Plain.class, null);
        Map<String, Object> annotated = null;
        Map<String, Object> bare = null;
        for (Map<String, Object> r : rows) {
            if ("annotated".equals(r.get("declaredName"))) {
                annotated = r;
            } else if ("bare".equals(r.get("declaredName"))) {
                bare = r;
            }
        }
        assertNotNull("应扫到 annotated 字段", annotated);
        assertNotNull("应扫到 bare 字段", bare);
        /* 注解在但未指定 format → 枚举默认名，不是 null */
        assertEquals("注解在但未指定 format 时应产出枚举默认名 none", "none", annotated.get("annFormat"));
        /* 没写注解 → null，与上一条必须可分辨 */
        assertNull("没写 @Field 时 annFormat 必须是 null", bare.get("annFormat"));
        /* pattern 未指定是空串 → 归一为 null（与改动前一致） */
        assertNull("未指定 pattern 应归一为 null", annotated.get("annPattern"));
    }

    /**  口径测试用的最小实体：一个带 @Field 未指定 format、一个完全没注解。 */
    static class R96Plain {
        @Field(type = org.springframework.data.elasticsearch.annotations.FieldType.Keyword)
        String annotated;
        String bare;
    }

    /** sdesVersion 读不到时返 null 而非抛（jar 无 manifest 的业务方老包场景）。 */
    @Test
    public void sdesVersionDoesNotThrow() {
        String v = EntityFieldScanner.sdesVersion();
        System.out.println("[probe] sdesVersion=" + v);
        assertTrue(v == null || v.length() > 0);
    }
}
