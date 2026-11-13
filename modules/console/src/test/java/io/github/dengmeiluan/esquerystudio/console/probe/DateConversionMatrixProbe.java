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
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.core.convert.MappingElasticsearchConverter;
import org.springframework.data.elasticsearch.core.mapping.SimpleElasticsearchMappingContext;

import java.lang.reflect.Field;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 *  机制实测：ES6→ES7 迁移时「date 字段 + Java 时间类型」到底哪些组合会炸、炸在读还是写。
 *
 * <p>刻意<b>不连 ES</b>：待验证的机制在 spring-data-elasticsearch 4.0.9 的
 * {@link MappingElasticsearchConverter} 客户端转换层，与服务端版本无关。
 * 直接对 Document map 做 read/write，结论确定、可复跑。</p>
 *
 * <p>本类只打印矩阵、不断言 —— 它是取事实的探针，不是守门测试。
 * 拿到矩阵后由 lint 规则去断言。</p>
 */
public class DateConversionMatrixProbe {

    // ---- 实体变体：每个只有一个时间字段 t ----

    @Document(indexName = "probe_ts")
    static class WithSqlTimestamp {
        @Id
        String id;
        java.sql.Timestamp t;
    }

    @Document(indexName = "probe_sqldate")
    static class WithSqlDate {
        @Id
        String id;
        java.sql.Date t;
    }

    @Document(indexName = "probe_utildate")
    static class WithUtilDate {
        @Id
        String id;
        java.util.Date t;
    }

    @Document(indexName = "probe_long")
    static class WithLong {
        @Id
        String id;
        Long t;
    }

    @Document(indexName = "probe_instant")
    static class WithInstant {
        @Id
        String id;
        Instant t;
    }

    @Document(indexName = "probe_ldt")
    static class WithLocalDateTime {
        @Id
        String id;
        LocalDateTime t;
    }

    private static MappingElasticsearchConverter converter() {
        SimpleElasticsearchMappingContext ctx = new SimpleElasticsearchMappingContext();
        ctx.initialize();
        MappingElasticsearchConverter c = new MappingElasticsearchConverter(ctx);
        c.afterPropertiesSet();
        return c;
    }

    private static Map<String, Object> doc(Object tValue) {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        m.put("id", "1");
        m.put("t", tValue);
        return m;
    }

    private static String describe(Object v) {
        if (v == null) {
            return "null";
        }
        return v.getClass().getSimpleName() + "(" + v + ")";
    }

    @Test
    public void printReadMatrix() {
        MappingElasticsearchConverter c = converter();

        Object[][] values = {
                {"epoch_millis(Long)", 1754000000000L},
                {"epoch_seconds(Integer)", 1754000000},
                {"ISO_8601(String)", "2026-08-01T12:00:00.000Z"},
                {"space_sep(String)", "2026-08-01 12:00:00"},
                {"date_only(String)", "2026-08-01"},
        };
        Class<?>[] types = {
                WithSqlTimestamp.class, WithSqlDate.class, WithUtilDate.class,
                WithLong.class, WithInstant.class, WithLocalDateTime.class,
        };

        System.out.println();
        System.out.println("======== READ 矩阵（Document -> 实体）spring-data-elasticsearch 4.0.9 ========");
        System.out.printf("%-24s | %-20s | %s%n", "存储形态", "Java 字段类型", "结果");
        System.out.println("-------------------------+----------------------+--------------------------------------");
        for (Object[] v : values) {
            for (Class<?> type : types) {
                String result;
                try {
                    Object entity = c.read(type, org.springframework.data.elasticsearch.core.document.Document
                            .from(doc(v[1])));
                    Field f = type.getDeclaredField("t");
                    f.setAccessible(true);
                    result = "OK  -> " + describe(f.get(entity));
                } catch (Throwable e) {
                    Throwable root = e;
                    while (root.getCause() != null && root.getCause() != root) {
                        root = root.getCause();
                    }
                    result = "FAIL " + root.getClass().getSimpleName() + ": "
                            + String.valueOf(root.getMessage()).replaceAll("\\s+", " ").trim();
                    if (result.length() > 150) {
                        result = result.substring(0, 150) + "...";
                    }
                }
                System.out.printf("%-24s | %-20s | %s%n", v[0], type.getSimpleName(), result);
            }
            System.out.println("-------------------------+----------------------+--------------------------------------");
        }
    }

    @Test
    public void printWriteMatrix() throws Exception {
        MappingElasticsearchConverter c = converter();
        long millis = 1754000000000L;

        System.out.println();
        System.out.println("======== WRITE 矩阵（实体 -> Document）spring-data-elasticsearch 4.0.9 ========");
        System.out.printf("%-22s | %s%n", "Java 字段类型", "落进 Document 的值（类型与内容）");
        System.out.println("-----------------------+--------------------------------------------------------");

        Object[][] cases = {
                {WithSqlTimestamp.class, new java.sql.Timestamp(millis)},
                {WithSqlDate.class, new java.sql.Date(millis)},
                {WithUtilDate.class, new java.util.Date(millis)},
                {WithLong.class, millis},
                {WithInstant.class, Instant.ofEpochMilli(millis)},
                {WithLocalDateTime.class, LocalDateTime.ofInstant(Instant.ofEpochMilli(millis),
                        java.time.ZoneId.of("UTC"))},
        };

        for (Object[] cs : cases) {
            Class<?> type = (Class<?>) cs[0];
            String out;
            try {
                Object entity = type.getDeclaredConstructor().newInstance();
                Field idF = type.getDeclaredField("id");
                idF.setAccessible(true);
                idF.set(entity, "1");
                Field tF = type.getDeclaredField("t");
                tF.setAccessible(true);
                tF.set(entity, cs[1]);
                org.springframework.data.elasticsearch.core.document.Document sink =
                        org.springframework.data.elasticsearch.core.document.Document.create();
                c.write(entity, sink);
                Object written = sink.get("t");
                out = describe(written) + "   | 整份 json: " + sink.toJson();
            } catch (Throwable e) {
                Throwable root = e;
                while (root.getCause() != null && root.getCause() != root) {
                    root = root.getCause();
                }
                out = "FAIL " + root.getClass().getSimpleName() + ": "
                        + String.valueOf(root.getMessage()).replaceAll("\\s+", " ").trim();
            }
            System.out.printf("%-22s | %s%n", type.getSimpleName(), out);
        }
        System.out.println("-----------------------+--------------------------------------------------------");
    }
}
