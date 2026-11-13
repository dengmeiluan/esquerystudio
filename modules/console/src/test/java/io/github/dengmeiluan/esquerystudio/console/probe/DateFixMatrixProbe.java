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

import org.junit.Test;
import org.springframework.core.convert.converter.Converter;
import org.springframework.data.annotation.Id;
import org.springframework.data.convert.ReadingConverter;
import org.springframework.data.convert.WritingConverter;
import org.springframework.data.elasticsearch.annotations.DateFormat;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;
import org.springframework.data.elasticsearch.core.convert.ElasticsearchCustomConversions;
import org.springframework.data.elasticsearch.core.convert.MappingElasticsearchConverter;
import org.springframework.data.elasticsearch.core.mapping.SimpleElasticsearchMappingContext;

import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 *  机制实测第二问（修正版）：sdes 4.0.9 上到底什么能救 epoch 数字存储的 date 字段。
 *
 * <p>第一次尝试用 {@code DateFormat.epoch_millis} 写探针，<b>编译失败</b> ——
 * 实测 4.0.9 的 DateFormat 枚举里没有 epoch_millis / epoch_second（它们是 4.2+ 才加的）。
 * 这条事实本身就是平台该告诉使用者的：网上流传的注解方案在本版本上不存在。</p>
 *
 * <p>本类因此测三件事：注解路线救不了数字存储、Converter 路线能救、注解对 ISO 存储有效。
 * 只打印不断言，ASCII 输出。</p>
 */
public class DateFixMatrixProbe {

    private static final long MILLIS = 1754000000000L;
    private static final String ISO = "2026-08-01T12:00:00.000Z";

    /** A：注解给了 custom pattern，但数据是数字 —— 注解救不了。 */
    @Document(indexName = "fix_a")
    static class A_TsCustomPattern {
        @Id
        String id;
        @Field(type = FieldType.Date, format = DateFormat.custom, pattern = "yyyy-MM-dd HH:mm:ss")
        java.sql.Timestamp t;
    }

    /** B：无注解，靠注册 Converter。 */
    @Document(indexName = "fix_b")
    static class B_TsWithConverter {
        @Id
        String id;
        java.sql.Timestamp t;
    }

    /** C：Instant + date_optional_time，数据是 ISO。 */
    @Document(indexName = "fix_c")
    static class C_InstantIso {
        @Id
        String id;
        @Field(type = FieldType.Date, format = DateFormat.date_optional_time)
        Instant t;
    }

    /** D：Instant + date_optional_time，但数据是 epoch 数字。 */
    @Document(indexName = "fix_d")
    static class D_InstantMillis {
        @Id
        String id;
        @Field(type = FieldType.Date, format = DateFormat.date_optional_time)
        Instant t;
    }

    @ReadingConverter
    static class LongToTimestamp implements Converter<Long, java.sql.Timestamp> {
        @Override
        public java.sql.Timestamp convert(Long source) {
            return source == null ? null : new java.sql.Timestamp(source);
        }
    }

    @WritingConverter
    static class TimestampToLong implements Converter<java.sql.Timestamp, Long> {
        @Override
        public Long convert(java.sql.Timestamp source) {
            return source == null ? null : source.getTime();
        }
    }

    private static MappingElasticsearchConverter converter(boolean withCustomConversions) {
        SimpleElasticsearchMappingContext ctx = new SimpleElasticsearchMappingContext();
        ctx.initialize();
        MappingElasticsearchConverter c = new MappingElasticsearchConverter(ctx);
        if (withCustomConversions) {
            c.setConversions(new ElasticsearchCustomConversions(
                    Arrays.asList(new LongToTimestamp(), new TimestampToLong())));
        }
        c.afterPropertiesSet();
        return c;
    }

    private static Map<String, Object> doc(Object tValue) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("id", "1");
        m.put("t", tValue);
        return m;
    }

    private static String read(MappingElasticsearchConverter c, Class<?> type, Object stored) {
        try {
            Object e = c.read(type,
                    org.springframework.data.elasticsearch.core.document.Document.from(doc(stored)));
            java.lang.reflect.Field f = type.getDeclaredField("t");
            f.setAccessible(true);
            Object v = f.get(e);
            return "OK   " + (v == null ? "null" : v.getClass().getSimpleName() + "(" + v + ")");
        } catch (Throwable e) {
            Throwable r = e;
            while (r.getCause() != null && r.getCause() != r) {
                r = r.getCause();
            }
            String m = "FAIL " + r.getClass().getSimpleName() + ": "
                    + String.valueOf(r.getMessage()).replaceAll("\\s+", " ").trim();
            return m.length() > 105 ? m.substring(0, 105) + "..." : m;
        }
    }

    private static String write(MappingElasticsearchConverter c, Class<?> type, Object value) {
        try {
            Object e = type.getDeclaredConstructor().newInstance();
            java.lang.reflect.Field idF = type.getDeclaredField("id");
            idF.setAccessible(true);
            idF.set(e, "1");
            java.lang.reflect.Field tF = type.getDeclaredField("t");
            tF.setAccessible(true);
            tF.set(e, value);
            org.springframework.data.elasticsearch.core.document.Document sink =
                    org.springframework.data.elasticsearch.core.document.Document.create();
            c.write(e, sink);
            Object w = sink.get("t");
            return "OK   " + (w == null ? "null" : w.getClass().getSimpleName() + "(" + w + ")");
        } catch (Throwable e) {
            Throwable r = e;
            while (r.getCause() != null && r.getCause() != r) {
                r = r.getCause();
            }
            return "FAIL " + r.getClass().getSimpleName() + ": " + r.getMessage();
        }
    }

    @Test
    public void printFixMatrix() {
        MappingElasticsearchConverter plain = converter(false);
        MappingElasticsearchConverter withConv = converter(true);

        System.out.println();
        System.out.println("==== FIX MATRIX (spring-data-elasticsearch 4.0.9) ====");
        System.out.println("FACT: DateFormat enum in 4.0.9 has NO epoch_millis / epoch_second (added in 4.2+).");
        System.out.println();
        System.out.printf("%-34s | %-22s | %s%n", "case", "stored form", "READ");
        System.out.println("-----------------------------------+------------------------+--------------------------------");
        System.out.printf("%-34s | %-22s | %s%n", "A Timestamp + custom pattern", "epoch_millis(Long)",
                read(plain, A_TsCustomPattern.class, MILLIS));
        System.out.printf("%-34s | %-22s | %s%n", "B Timestamp + Converter registered", "epoch_millis(Long)",
                read(withConv, B_TsWithConverter.class, MILLIS));
        System.out.printf("%-34s | %-22s | %s%n", "C Instant + date_optional_time", "ISO_8601(String)",
                read(plain, C_InstantIso.class, ISO));
        System.out.printf("%-34s | %-22s | %s%n", "D Instant + date_optional_time", "epoch_millis(Long)",
                read(plain, D_InstantMillis.class, MILLIS));
        System.out.printf("%-34s | %-22s | %s%n", "B' Timestamp WITHOUT Converter", "epoch_millis(Long)",
                read(plain, B_TsWithConverter.class, MILLIS));
        System.out.println("-----------------------------------+------------------------+--------------------------------");
        System.out.println();
        System.out.println("-- WRITE side --");
        System.out.printf("%-34s | %s%n", "B Timestamp + Converter registered",
                write(withConv, B_TsWithConverter.class, new java.sql.Timestamp(MILLIS)));
        System.out.printf("%-34s | %s%n", "B' Timestamp WITHOUT Converter",
                write(plain, B_TsWithConverter.class, new java.sql.Timestamp(MILLIS)));
        System.out.printf("%-34s | %s%n", "C Instant + date_optional_time",
                write(plain, C_InstantIso.class, Instant.ofEpochMilli(MILLIS)));
        System.out.println("-----------------------------------+------------------------------------------------------");
    }
}
