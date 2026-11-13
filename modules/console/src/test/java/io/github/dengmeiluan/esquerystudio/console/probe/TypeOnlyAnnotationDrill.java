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

package io.github.dengmeiluan.esquerystudio.console.probe;

import io.github.dengmeiluan.esquerystudio.console.compat.EpochDateConverters;
import org.apache.http.HttpHost;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;
import org.springframework.data.elasticsearch.core.ElasticsearchRestTemplate;
import org.springframework.data.elasticsearch.core.convert.ElasticsearchCustomConversions;
import org.springframework.data.elasticsearch.core.convert.MappingElasticsearchConverter;
import org.springframework.data.elasticsearch.core.mapping.SimpleElasticsearchMappingContext;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.util.Arrays;
import java.util.Collections;
import java.util.stream.Collectors;

/**
 *   / Q2 演练：<b>{@code @Field(type = FieldType.Date)} 但<u>不写</u> {@code format}</b>
 * 的字段，对 {@code esquerystudio.elasticsearch.compat.date-converters} 开关是否免疫。
 *
 * <h3>为什么必须实测这一格</h3>
 *
 * <p> 查明「带日期注解的字段对本开关免疫」，但它的实体用的是
 * {@code @Field(type = FieldType.Date, format = DateFormat.date_optional_time)}——<b>带 format</b>。
 * <b>「带 type=Date 但不带 format」这一格  从未测过</b>，而它恰恰是  的核心病例
 * （「无 format 的 date 字段」，见 {@code FormatlessDateFields}）。</p>
 *
 * <p>判定层 {@code dateRisk.ts#hasDateAnnotation} 要求 {@code annType} 与 {@code annFormat}
 * <b>同时</b>有值（{@code &&}），故这一格被判为「无日期注解」。
 * 这一格到底是什么行为，<b>是个经验问题，不许用推理代替。</b></p>
 *
 * <h3>实测结论（QA 6.7.2，2026-08-02）—— <b>第三种结果，非「免疫/不免疫」二选一</b></h3>
 * <pre>
 * 存储：10 位 epoch 秒 1754000000（无 format 的 date 字段，ES 按毫秒解释 =&gt; 1970-01-21）
 *
 * [R-OFF] 开关关 : READ THREW MappingException:
 *                  Property Doc.typeOnlyTime is annotated with FieldType.Date
 *                  but has no DateFormat defined
 * [R-ON ] 开关开 : <b>同一个 MappingException</b>
 * [CTRL ] 阳性对照（哨兵读转换器，hasCustomReadTarget=true）: <b>同一个 MappingException</b>
 * </pre>
 *
 * <p><b>⚠ 本演练的行为探测是「死仪器」，不可从它读出免疫结论。</b>
 * 阳性对照抛了<b>同样</b>的异常 ⇒ R-OFF ≡ R-ON <b>不构成</b>「开关无效」的证据，
 * 只证明三次读取<b>都没走到转换器</b>。若按「相同 ⇒ 免疫」下结论，会把一个
 * <b>构造期硬失败</b>误记成「运行正常但开关无效」——两者的处置完全相反。</p>
 *
 * <h3>确定答案来自字节码（行为探测被阻断时的唯一硬证据）</h3>
 *
 * <p>{@code SimpleElasticsearchPersistentProperty#initDateConverter()}，sdes 4.0.9：</p>
 * <pre>
 *  30: ifnull    280   // 没有 @Field                    -&gt; 整个跳过
 *  34-55: type() == Date || Date_Nanos，否则              -&gt; 跳过
 *  58-64: TemporalAccessor 或 Date 可赋值，否则            -&gt; 跳过   &lt;- javaType 合取项在此
 *  67-80: format() == DateFormat.none                    -&gt;
 *  83:    new MappingException("...but has no DateFormat defined")
 * </pre>
 *
 * <p>即 <b>{@code @Field(type = FieldType.Date)} 不写 {@code format} 在 sdes 4.0.9 上
 * 是构造期硬失败</b>：{@code DateFormat.none} 是注解默认值，实体在<b>首次构建</b>时即抛，
 * 早于任何读、写、转换器。开关与它无关，因为<b>实体根本装不起来</b>。</p>
 *
 * <p><b>注意 offsets 58-64 那个合取项</b>：判据是「javaType 为 TemporalAccessor 或 Date 可赋值」。
 * {@code @Field(type=Date)} 打在 {@code String} 字段上<b>不会</b>抛——
 * 判据必须落在完整条件上，不是落在最显眼的那部分。</p>
 *
 * <p><b>为什么这种应用还能产出 payload</b>：{@code EntityFieldScanner.scan()} 走<b>普通反射</b>，
 * 不构建 sdes 的 persistent entity；而 sdes 是<b>惰性</b>构建的（首次用到该类型才建）。
 * 故业务应用能正常启动、能上报 desired-state，然后在<b>第一次访问该实体的 ES 操作时</b>炸。
 * 这是一个<b>潜伏的硬失败</b>，也正是判定层规则 0 可达的原因 ——
 * 读的人否则会问「都装不起来了还报什么」。</p>
 *
 * <p><b>与  的关系</b>：不矛盾，是补上了它的射程。 测的是
 * {@code @Field(type=Date, format=...)}（<b>带</b> format）—— 那一格确实免疫。
 * 三档分界见 {@code EpochDateConverters} 类头的表。
 * 故 {@code hasDateAnnotation} 的 {@code &&} 是<b>对的</b>，不是笔误。</p>
 *
 * <p>只碰 {@code r93_} 前缀，清理在 {@code finally}。<b>故意没有 {@code @Test}、不进 CI</b>：
 * 它需要活的 QA 集群、且需要真的构建 persistent entity，在 CI 里必然红。
 * <b>CI 侧对应的看守</b>是 {@code dateRisk.spec.ts} 里 {@code INVALID_DATE_ANNOTATION}
 * 那组单测（规则 0：{@code annType ∈ {Date, Date_Nanos}} + {@code annFormat === 'none'}
 * + javaType 为时间类型 → error）—— 本演练的字节码结论若被改坏，那几条会红。
 * 同 {@code R94WriteShapeDrill} /  先例。</p>
 *
 * <pre>
 * mvn -o test-compile
 * mvn -o exec:java -Dexec.classpathScope=test \
 *     -Dexec.mainClass=io.github.dengmeiluan.esquerystudio.console.probe.TypeOnlyAnnotationDrill
 * </pre>
 */
public final class TypeOnlyAnnotationDrill {

    private static final String ES_HOST = "10.64.10.74";
    private static final int ES_PORT = 9200;
    private static final String INDEX = "r93__typeonly_drill";

    /** 10 位 epoch <b>秒</b>。无 format 的 date 字段会把它当毫秒 =&gt; 1970-01-21 附近。 */
    private static final long EPOCH_SECONDS_10 = 1754000000L;

    @Document(indexName = INDEX, createIndex = false)
    public static class Doc {
        @Id
        private String id;

        /** <b>本演练的被测格</b>：有 type=Date，<b>没有</b> format。 */
        @Field(type = FieldType.Date)
        private Timestamp typeOnlyTime;

        /** 对照：完全无 @Field， 已证明它走 CustomConversions。 */
        private Timestamp plainTime;

        public Doc() {
        }

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public Timestamp getTypeOnlyTime() {
            return typeOnlyTime;
        }

        public void setTypeOnlyTime(Timestamp typeOnlyTime) {
            this.typeOnlyTime = typeOnlyTime;
        }

        public Timestamp getPlainTime() {
            return plainTime;
        }

        public void setPlainTime(Timestamp plainTime) {
            this.plainTime = plainTime;
        }
    }

    public static void main(String[] args) throws Exception {
        RestHighLevelClient client = new RestHighLevelClient(
                RestClient.builder(new HttpHost(ES_HOST, ES_PORT, "http")));
        RestClient ll = client.getLowLevelClient();
        try {
            System.out.println("=== type-only-annotation drill (QA " + ES_HOST + ") ===");
            System.out.println("server version : " + get(ll, "/"));

            drop(ll);
            create(ll);

            /* 用原始 REST 写入 10 位秒值，绕开 sdes 的写路径——
               本演练要测的是**读**方向，写侧必须是一个我们完全掌握的已知量。 */
            Request idx = new Request("PUT", "/" + INDEX + "/_doc/sec-1");
            idx.setJsonEntity("{\"typeOnlyTime\":" + EPOCH_SECONDS_10
                    + ",\"plainTime\":" + EPOCH_SECONDS_10 + "}");
            ll.performRequest(idx);
            refresh(ll);
            System.out.println("\n[setup] raw _source written by REST (bypasses sdes write path):");
            System.out.println(get(ll, "/" + INDEX + "/_doc/sec-1"));

            // ---- R-OFF：开关关，读回 ----
            System.out.println("\n--- [R-OFF] converters OFF, read sec-1 ---");
            readAndReport(template(client, false));

            // ---- R-ON：开关开，读回。被测格是否被转换？ ----
            System.out.println("\n--- [R-ON ] converters ON, read sec-1 ---");
            readAndReport(template(client, true));

            /* ---- 阳性对照（新增甲）：先证明本演练的**读**通路是活的 ----
                前两次测量就是死通路。若哨兵读转换器也不生效，
               说明整条 ReadingConverter 通路在本演练里根本没被调用，
               R-OFF/R-ON 的差异（或无差异）都不可解释。 */
            System.out.println("\n--- [CTRL] POSITIVE CONTROL (sentinel reading converter) ---");
            SimpleElasticsearchMappingContext sctx = new SimpleElasticsearchMappingContext();
            ElasticsearchCustomConversions sconv = new ElasticsearchCustomConversions(
                    Arrays.asList(new LongToSentinelTimestamp()));
            sctx.setSimpleTypeHolder(sconv.getSimpleTypeHolder());
            sctx.afterPropertiesSet();
            MappingElasticsearchConverter mc = new MappingElasticsearchConverter(sctx);
            mc.setConversions(sconv);
            mc.afterPropertiesSet();
            System.out.println("[CTRL] hasCustomReadTarget(Long->Timestamp) = "
                    + sconv.hasCustomReadTarget(Long.class, Timestamp.class));
            readAndReport(new ElasticsearchRestTemplate(client, mc));
            System.out.println("[CTRL] 期望：typeOnlyTime 若被读转换器接管，会显示哨兵时刻 "
                    + SENTINEL_MILLIS + "（1970-01-01T00:00:42.000Z）");
        } finally {
            try {
                drop(ll);
                System.out.println("\n[cleanup] dropped " + INDEX);
            } catch (Exception e) {
                System.out.println("[cleanup] FAILED: " + e);
            }
            client.close();
        }
    }

    /** 绝不可能与真实换算结果混淆的哨兵时刻。 */
    private static final long SENTINEL_MILLIS = 42000L;

    /** 阳性对照：任何 Long 都读成固定哨兵时刻。生效则说明读通路是活的。 */
    @org.springframework.data.convert.ReadingConverter
    public static class LongToSentinelTimestamp
            implements org.springframework.core.convert.converter.Converter<Long, Timestamp> {
        @Override
        public Timestamp convert(Long source) {
            return new Timestamp(SENTINEL_MILLIS);
        }
    }

    private static void readAndReport(ElasticsearchRestTemplate tpl) {
        try {
            Doc d = tpl.queryForObject(
                    org.springframework.data.elasticsearch.core.query.GetQuery.getById("sec-1"), Doc.class);
            System.out.println("  typeOnlyTime = " + fmt(d == null ? null : d.getTypeOnlyTime()));
            System.out.println("  plainTime    = " + fmt(d == null ? null : d.getPlainTime()));
        } catch (Exception e) {
            String m = String.valueOf(e.getMessage());
            System.out.println("  READ THREW " + e.getClass().getSimpleName()
                    + ": " + m.substring(0, Math.min(300, m.length())));
        }
    }

    private static String fmt(Timestamp t) {
        return t == null ? "null" : t.getTime() + " (" + t.toInstant() + ")";
    }

    private static void create(RestClient ll) throws Exception {
        Request r = new Request("PUT", "/" + INDEX);
        /* 两个字段都是**无 format** 的 date —— 正是  的核心病例形态。 */
        r.setJsonEntity("{\"settings\":{\"number_of_shards\":1,\"number_of_replicas\":0},"
                + "\"mappings\":{\"_doc\":{\"properties\":{"
                + "\"typeOnlyTime\":{\"type\":\"date\"},"
                + "\"plainTime\":{\"type\":\"date\"}}}}}");
        ll.performRequest(r);
        System.out.println("[setup] created " + INDEX + " (both date fields have NO format)");
    }

    private static ElasticsearchRestTemplate template(RestHighLevelClient client, boolean withConverters) {
        SimpleElasticsearchMappingContext ctx = new SimpleElasticsearchMappingContext();
        ElasticsearchCustomConversions conversions = withConverters
                ? new ElasticsearchCustomConversions(Arrays.asList(
                        new EpochDateConverters.TimestampToLong(),
                        new EpochDateConverters.LongToTimestamp(),
                        new EpochDateConverters.IntegerToTimestamp()))
                : new ElasticsearchCustomConversions(Collections.emptyList());
        ctx.setSimpleTypeHolder(conversions.getSimpleTypeHolder());
        ctx.afterPropertiesSet();
        MappingElasticsearchConverter conv = new MappingElasticsearchConverter(ctx);
        conv.setConversions(conversions);
        conv.afterPropertiesSet();
        return new ElasticsearchRestTemplate(client, conv);
    }

    private static void drop(RestClient ll) {
        try {
            ll.performRequest(new Request("DELETE", "/" + INDEX));
        } catch (Exception ignored) {
            // 不存在时忽略
        }
    }

    private static void refresh(RestClient ll) throws Exception {
        ll.performRequest(new Request("POST", "/" + INDEX + "/_refresh"));
    }

    private static String get(RestClient ll, String path) throws Exception {
        Response resp = ll.performRequest(new Request("GET", path));
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(resp.getEntity().getContent(), StandardCharsets.UTF_8))) {
            return br.lines().collect(Collectors.joining("\n"));
        }
    }
}
