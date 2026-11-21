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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/**
 * sdes 4.0.x 与 4.4.x 的注解取值形态不同（单值 vs 数组），
 * SdesCompat 必须让两种形态在调用侧不可见。
 *
 * <p>本测试只锁形状归一逻辑与本机 sdes（4.0.9）下的真实取值；
 * 双版本兑现由  的 SdesContractMatrixTest 负责 ——
 * 「本机这版过了」不等于「另一版也过」，那正是本波要修的问题。</p>
 */
public class SdesCompatTest {

    @Test
    public void firstIfArray_单值原样返回() {
        assertEquals("x", SdesCompat.firstIfArray("x"));
    }

    @Test
    public void firstIfArray_数组取首元素() {
        assertEquals("a", SdesCompat.firstIfArray(new String[]{"a", "b"}));
    }

    @Test
    public void firstIfArray_空数组返回null() {
        assertNull(SdesCompat.firstIfArray(new String[0]));
    }

    @Test
    public void firstIfArray_null返回null() {
        assertNull(SdesCompat.firstIfArray(null));
    }

    /* ---- formatName / pattern： 真正消费的两个方法，必须有覆盖 ----
       只测 firstIfArray 是不够的：那只证明形状归一对，不证明这两个方法
       从真实注解上取到了值。用带 @Field 的样本类反射取注解实例来验。 */

    static class Sample {
        @org.springframework.data.elasticsearch.annotations.Field(
                type = org.springframework.data.elasticsearch.annotations.FieldType.Date,
                format = org.springframework.data.elasticsearch.annotations.DateFormat.basic_date)
        String withFormat;

        @org.springframework.data.elasticsearch.annotations.Field(
                type = org.springframework.data.elasticsearch.annotations.FieldType.Date,
                pattern = "yyyy-MM-dd")
        String withPattern;

        @org.springframework.data.elasticsearch.annotations.Field(
                type = org.springframework.data.elasticsearch.annotations.FieldType.Keyword)
        String plain;
    }

    private static org.springframework.data.elasticsearch.annotations.Field annOf(String field) throws Exception {
        return Sample.class.getDeclaredField(field)
                .getAnnotation(org.springframework.data.elasticsearch.annotations.Field.class);
    }

    @Test
    public void formatName_取到显式声明的枚举名() throws Exception {
        assertEquals("basic_date", SdesCompat.formatName(annOf("withFormat")));
    }

    @Test
    public void pattern_取到显式声明的字符串() throws Exception {
        assertEquals("yyyy-MM-dd", SdesCompat.pattern(annOf("withPattern")));
    }

    @Test
    public void pattern_未声明时为null_与没写注解同口径() throws Exception {
        assertNull(SdesCompat.pattern(annOf("plain")));
    }

    /* format 未显式声明时 sdes 返回枚举默认值（none）而非 null —— 刻意不规整成 null，
       「注解在但未指定」与「没写注解」必须可分辨（EntityFieldScanner 的既有口径）。 */
    @Test
    public void formatName_未声明时仍产出枚举默认名而非null() throws Exception {
        assertEquals("none", SdesCompat.formatName(annOf("plain")));
    }

    @Test
    public void formatName_对null注解不抛且返回null() {
        assertNull(SdesCompat.formatName(null));
        assertNull(SdesCompat.pattern(null));
    }

    /* ---- 形态归一的直接看守 ----
       实测教训：把 formatName 里的 firstIfArray 去掉，上面 9 条**全绿** ——
       因为本机 sdes 4.0.9 返回单值，firstIfArray 在这条路径上是 no-op，
       「在 4.0.9 上无论如何都测不出形态归一」。
       故直接喂数组给公开的 firstIfArray，绕开 sdes 版本来锁归一语义；
       跨版本的端到端兑现仍由 SdesContractMatrixTest 负责。 */

    /** 4.4.x 的 DateFormat[] 形态：取首元素后应能继续 .name()。 */
    @Test
    public void 形态归一_枚举数组取首元素后仍是枚举() {
        Object first = SdesCompat.firstIfArray(new org.springframework.data.elasticsearch.annotations.DateFormat[]{
                org.springframework.data.elasticsearch.annotations.DateFormat.basic_date,
                org.springframework.data.elasticsearch.annotations.DateFormat.date,
        });
        assertEquals(org.springframework.data.elasticsearch.annotations.DateFormat.basic_date, first);
        assertEquals("basic_date",
                ((org.springframework.data.elasticsearch.annotations.DateFormat) first).name());
    }

    /** 若归一被去掉，调用方拿到的会是数组对象本身 —— 这条钉死「不许返回数组」。 */
    @Test
    public void 形态归一_返回值绝不是数组() {
        Object r = SdesCompat.firstIfArray(new String[]{"a", "b"});
        org.junit.Assert.assertFalse("firstIfArray 的返回值不该还是数组", r.getClass().isArray());
    }

    /* ---- ：注解「写了但读不出」必须与「没写」可分辨 ----
       实测成因：实体 class 的编译期 sdes 与运行期跨 4.0/4.2 形态边界（单值 ↔ 数组）时，
       注解代理在调用 format()/pattern() 时抛 AnnotationTypeMismatchException。
       改动前 invoke 的 catch(Throwable) 把它吞成 null → desired-state 报「未声明」，
       而真正没写 format 的字段在 4.2+ 上返回 2 元默认值 → 报「已声明 date_optional_time」，
       **两种情形正好反了**。

       本机是 4.0.9，自然产生不出该异常，故用动态代理直接抛真实异常来锁分支 ——
       这与 firstIfArray 那组测试同一思路：不能因为「本机版本碰不到」就不测。 */

    /** 抛 AnnotationTypeMismatchException 的 Field 代理；其余成员返回 null（本测试不关心）。 */
    private static org.springframework.data.elasticsearch.annotations.Field mismatchProxy() {
        final Class<org.springframework.data.elasticsearch.annotations.Field> t =
                org.springframework.data.elasticsearch.annotations.Field.class;
        return (org.springframework.data.elasticsearch.annotations.Field)
                java.lang.reflect.Proxy.newProxyInstance(t.getClassLoader(), new Class<?>[]{t},
                        new java.lang.reflect.InvocationHandler() {
                            @Override
                            public Object invoke(Object p, java.lang.reflect.Method m, Object[] a)
                                    throws Throwable {
                                String n = m.getName();
                                if ("format".equals(n) || "pattern".equals(n)) {
                                    /* 报文形态照抄实测：Incorrectly typed data found for annotation
                                       element ...DateFormat[] Field.format() (Found data of type ...basic_date) */
                                    throw new java.lang.annotation.AnnotationTypeMismatchException(
                                            t.getMethod(n), "DateFormat;.basic_date");
                                }
                                return null;
                            }
                        });
    }

    @Test
    public void r98_注解类型不匹配必须报哨兵而不是null() {
        org.springframework.data.elasticsearch.annotations.Field ann = mismatchProxy();
        assertEquals("写了 format 但读不出时必须报哨兵 —— 回落成 null 会与「没写注解」不可分辨",
                SdesCompat.UNREADABLE, SdesCompat.formatName(ann));
        assertEquals("pattern 同理",
                SdesCompat.UNREADABLE, SdesCompat.pattern(ann));
    }

    /**
     * 反向对照：哨兵只对 AnnotationTypeMismatchException 生效。
     *
     * <p>没有这条，上面那条可能只是因为「任何异常都返回哨兵」——
     * 那会把真正的「取不到」也误报成「写了但读不出」，方向反过来错一遍。</p>
     */
    @Test
    public void r98_其它异常仍回落null而不是哨兵() {
        final Class<org.springframework.data.elasticsearch.annotations.Field> t =
                org.springframework.data.elasticsearch.annotations.Field.class;
        org.springframework.data.elasticsearch.annotations.Field ann =
                (org.springframework.data.elasticsearch.annotations.Field)
                        java.lang.reflect.Proxy.newProxyInstance(t.getClassLoader(), new Class<?>[]{t},
                                new java.lang.reflect.InvocationHandler() {
                                    @Override
                                    public Object invoke(Object p, java.lang.reflect.Method m, Object[] a) {
                                        String n = m.getName();
                                        if ("format".equals(n) || "pattern".equals(n)) {
                                            throw new IllegalStateException("some other failure");
                                        }
                                        return null;
                                    }
                                });
        assertNull("非类型不匹配的异常应回落 null，不该报哨兵", SdesCompat.formatName(ann));
        assertNull("非类型不匹配的异常应回落 null，不该报哨兵", SdesCompat.pattern(ann));
    }

    /** 哨兵必须与「注解在但未指定」的枚举默认名可分辨，否则等于没区分。 */
    @Test
    public void r98_哨兵与枚举默认名及null三者互不相同() throws Exception {
        org.junit.Assert.assertNotNull(SdesCompat.UNREADABLE);
        org.junit.Assert.assertNotEquals("哨兵不能等于 none", "none", SdesCompat.UNREADABLE);
        org.junit.Assert.assertNotEquals("哨兵不能等于 4.2+ 的默认 format",
                "date_optional_time", SdesCompat.UNREADABLE);
        /* 三态齐全：真·未声明产出「某个枚举默认名」、真·没注解是 null、读不出是哨兵。
           这里刻意**不**断言默认名的具体值 —— 它随 sdes 版本变
           （4.0.x = none，4.2+ = date_optional_time）。本条要锁的是「三者互不相同」，
           把版本相关的具体值写进来会让这条断言变成又一个版本闸门，
           掩盖它真正要保护的性质。 */
        String unspecified = SdesCompat.formatName(annOf("plain"));
        org.junit.Assert.assertNotNull("「注解在但未指定」必须产出枚举默认名而非 null", unspecified);
        org.junit.Assert.assertNotEquals("「未指定」不能与「读不出」同值",
                SdesCompat.UNREADABLE, unspecified);
        assertNull("没写注解仍必须是 null", SdesCompat.formatName(null));
    }

    /* ---- withPageable：判据落在「分页真的写进 query」上，不落在「没抛异常」上 ---- */

    @Test
    public void withPageable_在本机sdes上真的生效() {
        org.springframework.data.elasticsearch.core.query.NativeSearchQueryBuilder b =
                new org.springframework.data.elasticsearch.core.query.NativeSearchQueryBuilder();
        SdesCompat.withPageable(b, org.springframework.data.domain.PageRequest.of(0, 7));
        org.springframework.data.elasticsearch.core.query.NativeSearchQuery q = b.build();
        org.junit.Assert.assertNotNull("build() 不该为 null", q);
        org.junit.Assert.assertNotNull("分页应被写进 query", q.getPageable());
        assertEquals("页大小必须真的是 7", 7, q.getPageable().getPageSize());
    }

    @Test
    public void withPageable_对null入参不抛() {
        SdesCompat.withPageable(null, org.springframework.data.domain.PageRequest.of(0, 1));
        SdesCompat.withPageable(
                new org.springframework.data.elasticsearch.core.query.NativeSearchQueryBuilder(), null);
    }

    /** 目标对象没有该方法时静默跳过（分页退化），不抛 —— 迁移页不该因分页失败整页 500。 */
    @Test
    public void withPageable_目标无该方法时静默跳过不抛() {
        SdesCompat.withPageable(new Object(), org.springframework.data.domain.PageRequest.of(0, 3));
    }
}
