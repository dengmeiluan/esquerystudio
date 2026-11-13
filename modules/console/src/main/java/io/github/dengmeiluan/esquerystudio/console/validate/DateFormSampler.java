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

package io.github.dengmeiluan.esquerystudio.console.validate;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 判定 date 字段在 {@code _source} 里的<b>实际存储形态</b>。
 *
 * <p>为什么需要它：ES6→ES7 的 date 兼容风险是「存储形态 x Java 类型」这对组合决定的
 * （ 实测 30 格只有 6 格可读通），而存储形态只能从数据里采样得到 —— mapping 上看不出来。</p>
 *
 * <p><b>逐值判定，不按字段判定</b>：同一字段既有秒又有毫秒是真实存在的情况，
 * 逐值判定天然把它暴露成两种形态并存，而按字段判定只会给出一个错的结论。</p>
 *
 * <p><b>{@code other} / {@code ambiguous_small} 必带样例</b>：这两个桶是「需要人工判读」的，
 * 只给计数（{@code other: 500}）对使用者<b>没有任何行动价值</b>——他无从判断那 500 条是不是风险。
 * 故额外挂最多 {@value #SAMPLE_LIMIT} 个<b>去重且截断</b>的样例值，
 * 放在与计数<b>结构分离</b>的另一棵树里（见 {@link DateFormTally}）。</p>
 *
 * <p>纯静态、无 IO、无 Spring 依赖，可穷举单测。</p>
 *
 * @author aicoding
 */
public final class DateFormSampler {

    /** >= 1e12 判毫秒：1e12 ms = 2001-09-09。 */
    public static final long MILLIS_FLOOR = 1_000_000_000_000L;
    /** >= 1e9 且 < 1e12 判秒：1e9 s = 2001-09-09，1e12 s = 33658 年。 */
    public static final long SECONDS_FLOOR = 1_000_000_000L;

    /** 需人工判读的桶最多带几个样例值。 */
    public static final int SAMPLE_LIMIT = 3;
    /** 单个样例值的最大长度，防止大文本灌进响应。 */
    public static final int SAMPLE_MAX_LEN = 64;

    public static final String EPOCH_MILLIS = "epoch_millis";
    public static final String EPOCH_SECONDS = "epoch_seconds";
    public static final String AMBIGUOUS_SMALL = "ambiguous_small";
    public static final String ISO8601 = "iso8601";
    public static final String SPACE_SEP = "space_sep";
    public static final String DATE_ONLY = "date_only";
    public static final String NULL_VALUE = "null_value";
    public static final String ABSENT = "absent";
    public static final String OTHER = "other";

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private static final Pattern ISO = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.*$");
    private static final Pattern SPACE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}.*$");
    private static final Pattern DAY = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final Pattern INT = Pattern.compile("^-?\\d+$");

    private DateFormSampler() {
    }

    public static String classify(Object value) {
        if (value == null) {
            return NULL_VALUE;
        }
        if (value instanceof Integer || value instanceof Long || value instanceof Short
                || value instanceof java.math.BigInteger) {
            return byMagnitude(Math.abs(((Number) value).longValue()));
        }
        if (value instanceof String) {
            String s = ((String) value).trim();
            if (INT.matcher(s).matches()) {
                try {
                    return byMagnitude(Math.abs(Long.parseLong(s)));
                } catch (NumberFormatException e) {
                    return OTHER;
                }
            }
            if (ISO.matcher(s).matches()) {
                return ISO8601;
            }
            if (SPACE.matcher(s).matches()) {
                return SPACE_SEP;
            }
            if (DAY.matcher(s).matches()) {
                return DATE_ONLY;
            }
            return OTHER;
        }
        return OTHER;
    }

    private static String byMagnitude(long abs) {
        if (abs >= MILLIS_FLOOR) {
            return EPOCH_MILLIS;
        }
        if (abs >= SECONDS_FLOOR) {
            return EPOCH_SECONDS;
        }
        return AMBIGUOUS_SMALL;
    }

    /**
     * 统计每个字段的形态分布。字段在某文档里不存在时计入 {@link #ABSENT} ——
     * 它与 {@link #NULL_VALUE} 必须分开：前者是没写过，后者是显式写了 null。
     *
     * <p><b>计数与样例分两棵树返回</b>（{@link DateFormTally#getForms()} /
     * {@link DateFormTally#getSamples()}），<b>不是</b>混在同一个 map 里靠 {@code _} 前缀区分。
     * 原因：下游消费方是 TypeScript，混装时 {@code Object.entries(forms[f])} 求和会把样例数组
     * 加进计数，<b>静默算错</b>；而「遍历时跳过 _ 前缀键」这条约定必须跨
     * Java → JSON → TypeScript 三层被人记住才成立。分成两棵树后
     * {@code forms} 的值域纯计数，<b>结构上不可能混进样例</b>，没有人需要记住任何事。</p>
     *
     * @param fields 字段名，支持点路径（如 {@code meta.created}）以命中嵌套 {@code _source}
     */
    public static DateFormTally tally(List<Map<String, Object>> sources,
                                      Collection<String> fields) {
        Map<String, Map<String, Integer>> forms = new LinkedHashMap<String, Map<String, Integer>>();
        Map<String, Map<String, List<String>>> samples =
                new LinkedHashMap<String, Map<String, List<String>>>();
        if (sources == null || fields == null || fields.isEmpty()) {
            return new DateFormTally(forms, samples);
        }
        Map<String, Set<String>> otherSamples = new LinkedHashMap<String, Set<String>>();
        Map<String, Set<String>> smallSamples = new LinkedHashMap<String, Set<String>>();
        for (String f : fields) {
            forms.put(f, new LinkedHashMap<String, Integer>());
            otherSamples.put(f, new LinkedHashSet<String>());
            smallSamples.put(f, new LinkedHashSet<String>());
        }
        for (Map<String, Object> src : sources) {
            for (String f : fields) {
                Object raw = null;
                boolean present = false;
                if (src != null) {
                    Object[] hit = resolvePath(src, f);
                    if (hit != null) {
                        present = true;
                        raw = hit[0];
                    }
                }
                String form = present ? classify(raw) : ABSENT;
                Map<String, Integer> m = forms.get(f);
                Integer c = m.get(form);
                m.put(form, c == null ? Integer.valueOf(1) : Integer.valueOf(c.intValue() + 1));
                if (OTHER.equals(form)) {
                    collect(otherSamples.get(f), raw);
                } else if (AMBIGUOUS_SMALL.equals(form)) {
                    collect(smallSamples.get(f), raw);
                }
            }
        }
        for (String f : fields) {
            Map<String, List<String>> perField = new LinkedHashMap<String, List<String>>();
            attach(perField, OTHER, otherSamples.get(f));
            attach(perField, AMBIGUOUS_SMALL, smallSamples.get(f));
            if (!perField.isEmpty()) {
                samples.put(f, perField);
            }
        }
        return new DateFormTally(forms, samples);
    }

    /** 去重收集样例；到达上限后不再收，避免为一个大索引攒下无用字符串。 */
    private static void collect(Set<String> bucket, Object raw) {
        if (bucket.size() >= SAMPLE_LIMIT) {
            return;
        }
        String s = String.valueOf(raw);
        bucket.add(s.length() > SAMPLE_MAX_LEN ? s.substring(0, SAMPLE_MAX_LEN) : s);
    }

    private static void attach(Map<String, List<String>> target, String key, Set<String> samples) {
        if (samples != null && !samples.isEmpty()) {
            target.put(key, new ArrayList<String>(samples));
        }
    }

    /**
     * 按点路径取值。返回 {@code null} 表示<b>键不存在</b>（记 {@code absent}）；
     * 返回长度 1 的数组表示键存在，元素即值（可能为 null，记 {@code null_value}）。
     * <p>用「返回 null」与「返回 [null]」区分缺席与显式 null —— 直接返回值无法区分二者。</p>
     */
    @SuppressWarnings("unchecked")
    private static Object[] resolvePath(Map<String, Object> src, String path) {
        if (path == null) {
            return null;
        }
        if (src.containsKey(path)) {
            return new Object[]{src.get(path)};
        }
        if (path.indexOf('.') < 0) {
            return null;
        }
        Map<String, Object> cur = src;
        String[] parts = path.split("\\.");
        for (int i = 0; i < parts.length - 1; i++) {
            Object next = cur.get(parts[i]);
            if (!(next instanceof Map)) {
                return null;
            }
            cur = (Map<String, Object>) next;
        }
        String last = parts[parts.length - 1];
        return cur.containsKey(last) ? new Object[]{cur.get(last)} : null;
    }

    /**
     * 从 mapping JSON 里挑出所有 {@code type == "date"} 的字段名（嵌套用点路径）。
     *
     * <p><b>入参必须是「已剥 type 包层」的无类型形态</b>（{@code {"properties":...}}），
     * 由 {@code EsIndexAdmin.getMapping()} 保证——它在返回前已调用
     * {@code EsIndexAdmin.unwrapTypeLayer}（行为由 {@code EsResponseShapeTest} 锁定）
     * 剥掉 6.x 的单 type 包层。</p>
     *
     * <p><b>本方法刻意不做任何剥离兜底。</b> 曾有过一个 {@code root.size()==1} 的兜底分支，
     * 评审实测它与 {@code unwrapTypeLayer} <b>行为不一致</b>：6.x 多 type（{@code size != 1}）
     * 时放弃返回空集，而 7.x 原始形态 {@code {"mappings":{"properties":...}}} 会被<b>多剥一层</b>
     * 从而意外「命中」。一份会在 7.x 上多剥一层的兜底<b>比没有兜底更糟</b>——它在主路径之外
     * 悄悄给出错误答案。{@code root.size()==1} 是启发式，不是 {@code unwrapTypeLayer} 的语义，
     * 两份各自演化最终没人知道哪份对。故删除：<b>剥离只有一份实现，在 {@code EsIndexAdmin}。</b></p>
     *
     * @return 有序字段名集合；输入为空/非法/无 date 字段时返回空集，不抛异常
     */
    @SuppressWarnings("unchecked")
    public static Set<String> dateFieldsOf(String mappingJson) {
        if (mappingJson == null || mappingJson.trim().isEmpty()) {
            return Collections.emptySet();
        }
        Map<String, Object> root;
        try {
            root = OBJECT_MAPPER.readValue(mappingJson, Map.class);
        } catch (Exception e) {
            return Collections.emptySet();
        }
        Set<String> out = new LinkedHashSet<String>();
        walk((Map<String, Object>) root.get("properties"), "", out);
        return out;
    }

    @SuppressWarnings("unchecked")
    private static void walk(Map<String, Object> props, String prefix, Set<String> out) {
        if (props == null) {
            return;
        }
        for (Map.Entry<String, Object> e : props.entrySet()) {
            if (!(e.getValue() instanceof Map)) {
                continue;
            }
            Map<String, Object> def = (Map<String, Object>) e.getValue();
            String name = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
            if ("date".equals(def.get("type"))) {
                out.add(name);
            }
            Object nested = def.get("properties");
            if (nested instanceof Map) {
                walk((Map<String, Object>) nested, name, out);
            }
        }
    }
}
