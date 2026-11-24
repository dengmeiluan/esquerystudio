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

import org.springframework.data.elasticsearch.annotations.Field;

import java.lang.reflect.Array;
import java.lang.reflect.Method;

/**
 * spring-data-elasticsearch 跨小版本的注解取值兼容层。
 *
 * <p>实测签名差异（javap + JVM 反射双重确认）：
 * <pre>
 *   Field.format()   4.0.9: DateFormat     4.4.18: DateFormat[]
 *   Field.pattern()  4.0.9: String         4.4.18: String[]
 * </pre>
 *
 * <p>直接编译期调用 {@code ann.format()} 会把返回类型钉进字节码，
 * 换成另一个大小版本的 sdes 就抛 {@code NoSuchMethodError} ——
 * 而它<b>只在真正访问该字段时才炸</b>，启动期不报，
 * 于是「业务应用打开 desired-state 页」成为第一个撞见的人。
 * 故此处一律走反射 + 形状归一，让调用侧看不见形态差异。</p>
 */
public final class SdesCompat {

    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(SdesCompat.class);

    /**
     *  哨兵：注解<b>确实写了该项</b>，但当前 runtime 读不出它的值（实体 class 的编译期
     * sdes 与运行期 sdes 跨了 4.0/4.2 形态边界）。
     *
     * <p><b>为什么必须区别于 null</b>：本类文档约定 {@code null} = 「没写注解」、
     * {@code "none"}/{@code "Auto"} = 「注解在但未指定」，两者必须可分辨
     * （{@code EntityFieldScanner} 类注释亦如此声明）。类型不匹配时若回落成 null，
     * 「显式声明了 format」就与「压根没写注解」不可分辨 —— 而实测这两种情形的报告<b>正好反了</b>：
     * 显式 {@code format=basic_date} 读成 null（看着像未声明），
     * 而真正没写 format 的字段在 4.2+ 上返回 2 元默认值 {@code [date_optional_time, epoch_millis]}
     * （看着像显式声明）。desired-state 页是人据以发起索引重建的依据，这个反转不能留。</p>
     *
     * <p>控制台 {@code dateRisk.ts} 判 {@code annFormat != null && !== 'none'} 为「有显式 format」——
     * 哨兵落在该分支内，与事实一致（它确有显式 format，只是读不出是哪个），
     * 故<b>无需前端改动</b>；同时哨兵会原样显示出来，让版本错配对人可见。</p>
     */
    public static final String UNREADABLE = "<unreadable>";

    /** {@link #invoke} 的内部标记：与「取不到（null）」区分开。 */
    private static final Object MISMATCH = new Object();

    /** 同一个注解成员只告警一次，避免逐字段刷屏。 */
    private static final java.util.Set<String> WARNED =
            java.util.Collections.synchronizedSet(new java.util.HashSet<String>());

    private SdesCompat() {
    }

    /** 数组形态取首元素（长度 0 视为无值）；非数组原样返回。 */
    public static Object firstIfArray(Object v) {
        if (v == null) {
            return null;
        }
        if (v.getClass().isArray()) {
            return Array.getLength(v) > 0 ? Array.get(v, 0) : null;
        }
        return v;
    }

    /**
     * {@code @Field(format=...)} 的枚举名。
     *
     * <p>三态：{@code null} = 注解没写该项可读地缺失；枚举名 = 读到了；
     * {@link #UNREADABLE} = 写了但因版本错配读不出（见该常量说明）。</p>
     */
    public static String formatName(Field ann) {
        Object raw = invoke(ann, "format");
        if (raw == MISMATCH) {
            return UNREADABLE;
        }
        Object v = firstIfArray(raw);
        if (v == null) {
            return null;
        }
        Object name = invoke(v, "name");
        return name == null ? null : String.valueOf(name);
    }

    /** {@code @Field(pattern=...)}；空串按无值处理（与原实现一致）。三态同 {@link #formatName}。 */
    public static String pattern(Field ann) {
        Object raw = invoke(ann, "pattern");
        if (raw == MISMATCH) {
            return UNREADABLE;
        }
        Object v = firstIfArray(raw);
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v);
        return s.isEmpty() ? null : s;
    }

    /**
     * 反射调 {@code withPageable} 并<b>丢弃返回值</b>。
     *
     * <p>4.0.9 返回 {@code NativeSearchQueryBuilder}，4.4.x 把该方法上移到
     * {@code BaseQueryBuilder} 并返回父类型 —— 编译期写成链式
     * （{@code b.withPageable(p).withSort(s)}）会在 4.4.x 上因返回类型不符而
     * 抛 {@code NoSuchMethodError}。builder 是可变对象，调用即生效，不需要接返回值。</p>
     *
     * <p>找不到该方法时<b>静默跳过</b>：分页丢失退化成 ES 默认 size，
     * 而作业列表读不出来会让整个迁移页 500 —— 两害相权取轻。</p>
     */
    public static void withPageable(Object builder, org.springframework.data.domain.Pageable pageable) {
        if (builder == null || pageable == null) {
            return;
        }
        for (Method m : builder.getClass().getMethods()) {
            if (!"withPageable".equals(m.getName()) || m.getParameterTypes().length != 1) {
                continue;
            }
            if (!m.getParameterTypes()[0].isAssignableFrom(pageable.getClass())) {
                continue;
            }
            try {
                m.invoke(builder, pageable);
            } catch (Throwable ignored) {
                /* 见上：分页失效可接受，抛异常不可接受 */
            }
            return;
        }
    }

    private static Object invoke(Object target, String method) {
        if (target == null) {
            return null;
        }
        try {
            Method m = target.getClass().getMethod(method);
            return m.invoke(target);
        } catch (java.lang.reflect.InvocationTargetException e) {
            /* 注解成员「写了但类型对不上」与「取不到」是两件事，必须分开。
               实体 class 编译期 sdes 与运行期跨 4.0/4.2 形态边界时（单值 ↔ 数组），
               注解代理在调用该成员时抛 AnnotationTypeMismatchException ——
               注解值确实在 class 文件里，只是当前 runtime 的成员类型与之不符。
               实测报文：Incorrectly typed data found for annotation element
                        ...DateFormat[] Field.format() (Found data of type ...DateFormat;.basic_date) */
            if (e.getCause() instanceof java.lang.annotation.AnnotationTypeMismatchException) {
                warnMismatchOnce(target, method, (java.lang.annotation.AnnotationTypeMismatchException) e.getCause());
                return MISMATCH;
            }
            return null;
        } catch (Throwable t) {
            /* 取不到就是取不到：返回 null 让调用侧按「未声明」处理。
               这里刻意不抛 —— desired-state 是只读展示，
               一个注解读不出来不该让整页 500。 */
            return null;
        }
    }

    /** 同一注解成员只打一次 WARN；报文直接给出成因与修法，不让人自己猜。 */
    private static void warnMismatchOnce(Object target, String method,
                                         java.lang.annotation.AnnotationTypeMismatchException cause) {
        String key = target.getClass().getName() + '#' + method;
        if (!WARNED.add(key)) {
            return;
        }
        LOG.warn("[SdesCompat] 注解成员 {}() 的值读不出：实体 class 的编译期 spring-data-elasticsearch "
                        + "与运行期形态不一致（4.0.x 单值 ↔ 4.2.x+ 数组）。该项按 \"{}\" 上报，"
                        + "不会被误报成「未声明」。修法：用与运行期同一 sdes 版本重新编译实体所在模块。原始报文：{}",
                method, UNREADABLE, cause.getMessage(), cause);
    }
}
