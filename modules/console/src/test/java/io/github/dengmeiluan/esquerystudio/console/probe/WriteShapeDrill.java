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
import org.springframework.data.elasticsearch.annotations.DateFormat;
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
 *   修订二演练：开启 epoch 转换器后，<b>写侧 {@code _source} 形态是否改变</b>。
 *
 * <p><b>这是个经验问题，不许用推理代替</b>：sdes 4.0.9 的写路径是否真的会走
 * {@code Timestamp -> Long} 这个 WritingConverter，只能在真实 ES 上写一条再读回来看。</p>
 *
 * <h3>实测结论（QA 6.7.2，2026-08-02）</h3>
 * <pre>
 * [A] 开关关："plainTime":1754000000000
 * [B] 开关开："plainTime":1754000000000     &lt;- 逐字节相同，TimestampToLong 是 no-op
 * [D] 阳性对照：Timestamp-&gt;String 哨兵被 ES 拒绝
 *     mapper_parsing_exception ... Invalid format: "SENTINEL-CONVERTER-RAN"
 *     =&gt; 写侧 CustomConversions 通路<b>确实是活的</b>，A≡B 是真阴性而非仪器坏掉
 * </pre>
 *
 * <p>故打开开关<b>不会</b>把字段变成「多形态并存」（规则 2 error），
 * 读写<b>不需要</b>拆成两个开关。</p>
 *
 * <p><b>另一个更重要的发现</b>：{@code eventTime} 带
 * {@code @Field(type = FieldType.Date, format = ...)}，它在 A/B/D 三种情况下<b>全都</b>
 * 写成 ISO 串 —— 属性级日期转换器抢在 CustomConversions 之前，
 * <b>带日期注解的字段对本特性完全免疫</b>。这是整个开关的射程限制。</p>
 *
 * <p>只碰 {@code r93_} 前缀，清理在 {@code finally}。非 JUnit，不进 CI。</p>
 *
 * <pre>
 * mvn -o test-compile
 * mvn -o exec:java -Dexec.classpathScope=test \
 *     -Dexec.mainClass=io.github.dengmeiluan.esquerystudio.console.probe.WriteShapeDrill
 * </pre>
 */
public final class WriteShapeDrill {

    private static final String ES_HOST = "10.64.10.74";
    private static final int ES_PORT = 9200;
    private static final String INDEX = "r93__writeshape_drill";

    /** 固定值：2025-08-01T00:53:20Z = 1754000000000 毫秒。 */
    private static final long FIXED_MILLIS = 1754000000000L;

    @Document(indexName = INDEX, createIndex = false)
    public static class Doc {
        @Id
        private String id;
        @Field(type = FieldType.Date, format = DateFormat.date_optional_time)
        private Timestamp eventTime;
        /** 无 @Field 注解：不会安装 property 级 date 转换器，走 CustomConversions 通路。 */
        private Timestamp plainTime;

        public Doc() {
        }

        public Doc(String id, Timestamp eventTime) {
            this.id = id;
            this.eventTime = eventTime;
            this.plainTime = eventTime;
        }

        public Timestamp getPlainTime() {
            return plainTime;
        }

        public void setPlainTime(Timestamp plainTime) {
            this.plainTime = plainTime;
        }

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public Timestamp getEventTime() {
            return eventTime;
        }

        public void setEventTime(Timestamp eventTime) {
            this.eventTime = eventTime;
        }
    }

    public static void main(String[] args) throws Exception {
        RestHighLevelClient client = new RestHighLevelClient(
                RestClient.builder(new HttpHost(ES_HOST, ES_PORT, "http")));
        RestClient ll = client.getLowLevelClient();
        try {
            System.out.println("=== write-shape drill (QA " + ES_HOST + ") ===");
            System.out.println("server version : " + get(ll, "/"));

            drop(ll);
            create(ll);

            // ---- A: 开关关（无自定义 conversions） ----
            ElasticsearchRestTemplate offTpl = template(client, false);
            offTpl.save(new Doc("off-1", new Timestamp(FIXED_MILLIS)));
            refresh(ll);
            System.out.println("\n--- [A] converters OFF, _source of off-1 ---");
            System.out.println(get(ll, "/" + INDEX + "/_doc/off-1"));

            // ---- B: 开关开（注册 TimestampToLong 写侧转换器） ----
            ElasticsearchRestTemplate onTpl = template(client, true);
            onTpl.save(new Doc("on-1", new Timestamp(FIXED_MILLIS)));
            refresh(ll);
            System.out.println("\n--- [B] converters ON, _source of on-1 ---");
            System.out.println(get(ll, "/" + INDEX + "/_doc/on-1"));

            System.out.println("\n--- [C] both docs side by side ---");
            System.out.println(get(ll, "/" + INDEX + "/_search?q=*:*&size=10"));

            // ---- D: 阳性对照，证明本演练的 WritingConverter 通路是活的 ----
            SimpleElasticsearchMappingContext sctx = new SimpleElasticsearchMappingContext();
            ElasticsearchCustomConversions sconv = new ElasticsearchCustomConversions(
                    Arrays.asList(new TimestampToSentinel()));
            sctx.setSimpleTypeHolder(sconv.getSimpleTypeHolder());
            sctx.afterPropertiesSet();
            MappingElasticsearchConverter mc = new MappingElasticsearchConverter(sctx);
            mc.setConversions(sconv);
            mc.afterPropertiesSet();
            System.out.println("\n--- [D] POSITIVE CONTROL (sentinel writing converter) ---");
            System.out.println("[D] hasCustomWriteTarget(Timestamp) = "
                    + sconv.hasCustomWriteTarget(Timestamp.class));
            System.out.println("[D] getCustomWriteTarget(Timestamp) = "
                    + sconv.getCustomWriteTarget(Timestamp.class));
            try {
                new ElasticsearchRestTemplate(client, mc)
                        .save(new Doc("sentinel-1", new Timestamp(FIXED_MILLIS)));
                refresh(ll);
                System.out.println("[D] sentinel WROTE: " + get(ll, "/" + INDEX + "/_doc/sentinel-1"));
            } catch (Exception e) {
                String m = String.valueOf(e.getMessage());
                System.out.println("[D] sentinel 被 ES 拒绝 -> 写侧 CustomConversions 通路确实是活的（装置非死）");
                System.out.println("[D] " + m.substring(0, Math.min(260, m.length())));
            }
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

    /** 阳性对照：把 Timestamp 写成一个绝不可能与 ISO 混淆的字符串。若这个也不生效，
     *  说明整条 WritingConverter 通路在本演练里根本没被调用（装置死了），而不是 TimestampToLong 的问题。 */
    @org.springframework.data.convert.WritingConverter
    public static class TimestampToSentinel implements org.springframework.core.convert.converter.Converter<Timestamp, String> {
        @Override
        public String convert(Timestamp source) {
            return source == null ? null : "SENTINEL-CONVERTER-RAN";
        }
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

    private static void create(RestClient ll) throws Exception {
        Request r = new Request("PUT", "/" + INDEX);
        r.setJsonEntity("{\"settings\":{\"number_of_shards\":1,\"number_of_replicas\":0},"
                + "\"mappings\":{\"_doc\":{\"properties\":{"
                + "\"eventTime\":{\"type\":\"date\",\"format\":\"date_optional_time||epoch_millis\"},\"plainTime\":{\"type\":\"date\",\"format\":\"date_optional_time||epoch_millis\"}}}}}");
        ll.performRequest(r);
        System.out.println("[setup] created " + INDEX);
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
