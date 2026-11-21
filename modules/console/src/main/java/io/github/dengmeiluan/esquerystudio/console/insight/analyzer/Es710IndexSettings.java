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

package io.github.dengmeiluan.esquerystudio.console.insight.analyzer;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 *  ES 7.10 索引级 setting 动态/静态目录（静态常量类）。
 *
 * <p>依据 ES 7.10 官方 index modules 文档整理；代码库此前无该判定逻辑
 * （前端仅硬编码 8 个热键表单），此类为唯一权威来源。</p>
 *
 * <p>classify 语义：去 {@code index.} 前缀后——精确命中 DYNAMIC/STATIC →
 * 前缀命中 → 都不中返回 UNKNOWN（上层按 ILLEGAL 阻断，宁严勿松）。</p>
 *
 * @author aicoding
 */
public final class Es710IndexSettings {

    public static final String DYNAMIC = "DYNAMIC";
    public static final String STATIC = "STATIC";
    public static final String UNKNOWN = "UNKNOWN";

    /** 动态 setting（可热更），去 index. 前缀。 */
    private static final Set<String> DYNAMIC_KEYS = new HashSet<>(Arrays.asList(
            "number_of_replicas", "auto_expand_replicas", "refresh_interval",
            "max_result_window", "max_inner_result_window", "max_rescore_window",
            "max_docvalue_fields_search", "max_script_fields",
            "max_ngram_diff", "max_shingle_diff", "max_refresh_listeners",
            "max_terms_count", "max_regex_length", "max_slices_per_scroll",
            "priority", "gc_deletes", "default_pipeline", "final_pipeline",
            "hidden", "highlight.max_analyzed_offset",
            "write.wait_for_active_shards"));

    /** 动态 setting 前缀族。 */
    private static final String[] DYNAMIC_PREFIXES = {
            "blocks.", "routing.", "translog.", "search.slowlog.", "indexing.slowlog.",
            "unassigned.", "merge.", "mapping.", "search.idle.", "lifecycle."};

    /** 静态 setting（只能建索引时设置 / 关闭索引后改 / 零停机重建）。 */
    private static final Set<String> STATIC_KEYS = new HashSet<>(Arrays.asList(
            "number_of_shards", "codec", "routing_partition_size",
            "shard.check_on_startup", "load_fixed_bitset_filters_eagerly",
            "format", "queries.cache.enabled", "number_of_routing_shards"));

    /** 静态 setting 前缀族。 */
    private static final String[] STATIC_PREFIXES = {
            "analysis.", "sort.", "similarity.", "store.", "mapper.", "soft_deletes."};

    private Es710IndexSettings() {
    }

    /** 判定 setting key 的动态性：{@link #DYNAMIC} / {@link #STATIC} / {@link #UNKNOWN}。 */
    public static String classify(String key) {
        if (key == null || key.trim().isEmpty()) {
            return UNKNOWN;
        }
        String k = key.trim();
        if (k.startsWith("index.")) {
            k = k.substring("index.".length());
        }
        if (DYNAMIC_KEYS.contains(k)) {
            return DYNAMIC;
        }
        if (STATIC_KEYS.contains(k)) {
            return STATIC;
        }
        for (String p : DYNAMIC_PREFIXES) {
            if (k.startsWith(p)) {
                return DYNAMIC;
            }
        }
        for (String p : STATIC_PREFIXES) {
            if (k.startsWith(p)) {
                return STATIC;
            }
        }
        return UNKNOWN;
    }
}
