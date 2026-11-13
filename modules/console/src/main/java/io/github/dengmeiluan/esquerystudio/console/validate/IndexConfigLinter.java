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

import com.fasterxml.jackson.core.JsonLocation;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static io.github.dengmeiluan.esquerystudio.console.validate.ConfigIssue.LAYER_ADVISOR;
import static io.github.dengmeiluan.esquerystudio.console.validate.ConfigIssue.LAYER_LINT;

/**
 *  配置门禁 L1 静态 Lint + L3 最佳实践 Advisor（纯内存，不碰 ES）。
 *
 * <p>专治「代码里写错索引配置、发到服务上建索引才炸」的高频错型（按 ES 7.10 语义）：</p>
 * <ul>
 *   <li>结构错位：settings 外层多包一层 {@code settings}、mappings 混进 settings、6.x type 名包裹</li>
 *   <li>legacy 写法：{@code string} 类型、{@code index: not_analyzed}、{@code _all} 等 7.x 已移除语法</li>
 *   <li>类型白名单：7.10 内置 field type 全集比对 + did-you-mean 拼写提示</li>
 *   <li>引用完整性：mapping 引用的 analyzer/normalizer 必须内置或在 {@code settings.analysis} 定义；
 *       自定义 analyzer 引用的 tokenizer/filter/char_filter 同理</li>
 *   <li>参数配对：keyword 配 analyzer、text 配 ignore_above、scaled_float 缺 scaling_factor 等非法组合</li>
 * </ul>
 *
 * <p>裁决哲学：<b>确定必炸的报 ERROR，插件可能救的报 WARN</b>（如未知 analyzer 名可能由 ik 等插件提供），
 * WARN 的最终裁决交给 L2 Dry-run。</p>
 *
 * @author aicoding
 */
public class IndexConfigLinter {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** ES 7.10 内置 field type 全集（含 x-pack；不含 mapper 插件类型） */
    private static final Set<String> FIELD_TYPES = setOf(
            "text", "keyword", "wildcard", "constant_keyword",
            "long", "integer", "short", "byte", "double", "float", "half_float", "scaled_float", "unsigned_long",
            "date", "date_nanos", "boolean", "binary", "ip",
            "integer_range", "float_range", "long_range", "double_range", "date_range", "ip_range",
            "object", "nested", "flattened", "join", "alias",
            "geo_point", "geo_shape", "point", "shape",
            "completion", "token_count", "murmur3", "percolator",
            "rank_feature", "rank_features", "dense_vector", "sparse_vector", "search_as_you_type", "histogram");

    /** 7.x 已移除 / 从不存在的 legacy 类型 → 修复建议 */
    private static final Map<String, String> LEGACY_TYPES = mapOf(
            "string", "7.x 已移除，改用 text（分词检索）或 keyword（精确匹配）",
            "attachment", "改用 ingest attachment processor",
            "geo_shape_legacy", "改用 geo_shape");

    /** mapping 顶层合法键（7.10；runtime 是 7.11+ 特性单独报） */
    private static final Set<String> MAPPING_TOP_KEYS = setOf(
            "properties", "dynamic", "dynamic_templates", "_source", "_meta", "_routing",
            "_field_names", "_size", "date_detection", "numeric_detection", "dynamic_date_formats");

    /** 所有类型通用的字段参数 */
    private static final Set<String> COMMON_FIELD_PARAMS = setOf(
            "type", "fields", "copy_to", "store", "doc_values", "index", "null_value", "boost", "meta");

    private static final Set<String> TEXT_PARAMS = setOf(
            "analyzer", "search_analyzer", "search_quote_analyzer", "norms", "index_options",
            "index_prefixes", "index_phrases", "position_increment_gap", "term_vector", "similarity",
            "eager_global_ordinals", "fielddata", "fielddata_frequency_filter");

    private static final Set<String> KEYWORD_PARAMS = setOf(
            "ignore_above", "normalizer", "norms", "index_options", "similarity",
            "eager_global_ordinals", "split_queries_on_whitespace");

    private static final Set<String> NUMBER_TYPES = setOf(
            "long", "integer", "short", "byte", "double", "float", "half_float", "scaled_float", "unsigned_long");

    /** 内置 analyzer（含语言分析器）；插件 analyzer（ik/smartcn 等）不在内 → 未定义时报 WARN 交 dry-run */
    private static final Set<String> BUILTIN_ANALYZERS = setOf(
            "standard", "simple", "whitespace", "stop", "keyword", "pattern", "fingerprint",
            "arabic", "armenian", "basque", "bengali", "brazilian", "bulgarian", "catalan", "cjk",
            "czech", "danish", "dutch", "english", "estonian", "finnish", "french", "galician",
            "german", "greek", "hindi", "hungarian", "indonesian", "irish", "italian", "latvian",
            "lithuanian", "norwegian", "persian", "portuguese", "romanian", "russian", "sorani",
            "spanish", "swedish", "turkish", "thai");

    private static final Set<String> BUILTIN_TOKENIZERS = setOf(
            "standard", "letter", "lowercase", "whitespace", "uax_url_email", "classic", "thai",
            "ngram", "edge_ngram", "keyword", "pattern", "simple_pattern", "simple_pattern_split",
            "char_group", "path_hierarchy");

    private static final Set<String> BUILTIN_TOKEN_FILTERS = setOf(
            "lowercase", "uppercase", "asciifolding", "stop", "synonym", "synonym_graph", "stemmer",
            "ngram", "edge_ngram", "shingle", "unique", "trim", "truncate", "length", "reverse",
            "elision", "keyword_marker", "snowball", "porter_stem", "kstem", "word_delimiter",
            "word_delimiter_graph", "pattern_replace", "pattern_capture", "limit", "common_grams",
            "cjk_bigram", "cjk_width", "decimal_digit", "delimited_payload", "dictionary_decompounder",
            "hyphenation_decompounder", "fingerprint", "flatten_graph", "hunspell", "keep", "keep_types",
            "min_hash", "multiplexer", "condition", "predicate_token_filter", "remove_duplicates",
            "stemmer_override", "apostrophe", "classic", "scandinavian_normalization", "scandinavian_folding",
            "arabic_normalization", "german_normalization", "hindi_normalization", "indic_normalization",
            "sorani_normalization", "persian_normalization", "serbian_normalization", "bengali_normalization");

    private static final Set<String> BUILTIN_CHAR_FILTERS = setOf("html_strip", "mapping", "pattern_replace");

    /** 常用 index 级 settings 键（去 index. 前缀后的相对键；用于拼写提示，不完备 → 未知只 WARN） */
    private static final Set<String> KNOWN_SETTING_KEYS = setOf(
            "number_of_shards", "number_of_replicas", "number_of_routing_shards", "auto_expand_replicas",
            "refresh_interval", "max_result_window", "max_inner_result_window", "max_rescore_window",
            "max_docvalue_fields_search", "max_script_fields", "max_ngram_diff", "max_shingle_diff",
            "max_refresh_listeners", "max_terms_count", "max_regex_length", "routing_partition_size",
            "gc_deletes", "default_pipeline", "final_pipeline", "hidden", "codec", "priority",
            "load_fixed_bitset_filters_eagerly", "analysis", "similarity", "sort.field", "sort.order",
            "sort.mode", "sort.missing", "mapping.total_fields.limit", "mapping.depth.limit",
            "mapping.nested_fields.limit", "mapping.nested_objects.limit", "mapping.field_name_length.limit",
            "mapping.coerce", "mapping.ignore_malformed", "analyze.max_token_count",
            "highlight.max_analyzed_offset", "write.wait_for_active_shards", "shard.check_on_startup");

    /** 未知 settings 键中允许的前缀段（这些子树键太多，不做逐键校验） */
    private static final Set<String> SETTING_PREFIX_PASS = setOf(
            "blocks", "routing", "merge", "translog", "search", "store", "unassigned", "queries",
            "lifecycle", "soft_deletes", "indexing", "recovery", "allocation");

    /**
     * L1 + L3 全量静态检查。
     *
     * @param settingsJson settings JSON（可空——纯 mapping 校验）
     * @param mappingJson  mapping JSON（可空——纯 settings 校验）
     */
    public List<ConfigIssue> lint(String settingsJson, String mappingJson) {
        List<ConfigIssue> issues = new ArrayList<>();
        JsonNode settings = parse(settingsJson, "settings", issues);
        JsonNode mapping = parse(mappingJson, "mappings", issues);
        Analysis analysis = new Analysis();
        if (settings != null) {
            lintSettings(settings, issues, analysis);
        }
        if (mapping != null) {
            lintMapping(mapping, issues, analysis);
        }
        return issues;
    }

    // ==================== JSON 解析 ====================

    private JsonNode parse(String json, String tag, List<ConfigIssue> issues) {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        try {
            JsonNode node = MAPPER.readTree(json);
            if (!node.isObject()) {
                issues.add(ConfigIssue.error(LAYER_LINT, "NOT_JSON_OBJECT", tag,
                        tag + " 必须是 JSON object，实际是 " + node.getNodeType(), null));
                return null;
            }
            return node;
        } catch (JsonProcessingException e) {
            JsonLocation loc = e.getLocation();
            String pos = loc == null ? "" : "（第 " + loc.getLineNr() + " 行第 " + loc.getColumnNr() + " 列）";
            issues.add(ConfigIssue.error(LAYER_LINT, "JSON_SYNTAX", tag,
                    tag + " JSON 语法错误" + pos + ": " + e.getOriginalMessage(), null));
            return null;
        }
    }

    // ==================== settings 检查 ====================

    private void lintSettings(JsonNode settings, List<ConfigIssue> issues, Analysis analysis) {
        // 高频结构错位
        if (settings.has("settings")) {
            issues.add(ConfigIssue.error(LAYER_LINT, "SETTINGS_WRAPPER", "settings.settings",
                    "settings 外层多包了一层 \"settings\"，ES 会把它当成未知配置项拒绝", "去掉外层 settings 包裹，顶层直接写 index/analysis/number_of_shards 等"));
        }
        if (settings.has("mappings")) {
            issues.add(ConfigIssue.error(LAYER_LINT, "MAPPINGS_IN_SETTINGS", "settings.mappings",
                    "mappings 写进了 settings 文件，ES 建索引会报 unknown setting [index.mappings]", "把 mappings 移到 @Mapping 的 json 文件"));
        }
        // index 嵌套 / 顶层扁平 两种形态统一收集相对键
        JsonNode idx = settings.get("index");
        JsonNode effective = idx != null && idx.isObject() ? idx : settings;
        Iterator<String> it = effective.fieldNames();
        while (it.hasNext()) {
            String key = it.next();
            if ("settings".equals(key) || "mappings".equals(key) || "index".equals(key)) {
                continue;
            }
            String rel = key.startsWith("index.") ? key.substring("index.".length()) : key;
            checkSettingKey(rel, effective.get(key), issues);
        }
        // analysis 段：登记自定义组件 + 引用完整性
        JsonNode analysisNode = firstNonNull(effective.get("analysis"), settings.get("analysis"));
        if (analysisNode != null && analysisNode.isObject()) {
            lintAnalysis(analysisNode, issues, analysis);
        }
        // L3：分片/副本建议
        adviseSettings(effective, issues);
    }

    private void checkSettingKey(String rel, JsonNode value, List<ConfigIssue> issues) {
        String head = rel.contains(".") ? rel.substring(0, rel.indexOf('.')) : rel;
        if (KNOWN_SETTING_KEYS.contains(rel) || SETTING_PREFIX_PASS.contains(head)) {
            checkSettingValue(rel, value, issues);
            return;
        }
        String near = nearest(rel, KNOWN_SETTING_KEYS);
        issues.add(ConfigIssue.warn(LAYER_LINT, "UNKNOWN_SETTING_KEY", "settings." + rel,
                "未识别的 settings 键 \"" + rel + "\"（若拼写有误建索引会失败，以 Dry-run 为准）",
                near == null ? null : "是否想写 \"" + near + "\"？"));
    }

    private void checkSettingValue(String rel, JsonNode value, List<ConfigIssue> issues) {
        if (("number_of_shards".equals(rel) || "number_of_replicas".equals(rel)) && value != null) {
            boolean nonNegInt = (value.isInt() && value.asInt() >= 0)
                    || (value.isTextual() && value.asText().matches("\\d+"));
            if (!nonNegInt) {
                issues.add(ConfigIssue.error(LAYER_LINT, "SETTING_VALUE_TYPE", "settings." + rel,
                        rel + " 必须是非负整数，实际=" + value, null));
            }
        }
    }

    private void lintAnalysis(JsonNode analysisNode, List<ConfigIssue> issues, Analysis analysis) {
        analysis.analyzers.addAll(fieldNames(analysisNode.get("analyzer")));
        analysis.normalizers.addAll(fieldNames(analysisNode.get("normalizer")));
        Set<String> customTokenizers = fieldNames(analysisNode.get("tokenizer"));
        Set<String> customFilters = fieldNames(analysisNode.get("filter"));
        Set<String> customCharFilters = fieldNames(analysisNode.get("char_filter"));

        JsonNode analyzers = analysisNode.get("analyzer");
        if (analyzers != null && analyzers.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = analyzers.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                String path = "settings.analysis.analyzer." + e.getKey();
                JsonNode def = e.getValue();
                String type = text(def, "type");
                boolean custom = type == null || "custom".equals(type);
                if (custom && !def.has("tokenizer")) {
                    issues.add(ConfigIssue.error(LAYER_LINT, "ANALYZER_NO_TOKENIZER", path,
                            "自定义 analyzer \"" + e.getKey() + "\" 缺少 tokenizer（custom 类型必填）", null));
                }
                String tk = text(def, "tokenizer");
                if (tk != null && !BUILTIN_TOKENIZERS.contains(tk) && !customTokenizers.contains(tk)) {
                    issues.add(ConfigIssue.warn(LAYER_LINT, "TOKENIZER_UNDEFINED", path + ".tokenizer",
                            "tokenizer \"" + tk + "\" 非内置且未在 analysis.tokenizer 定义（若非插件提供则建索引失败）",
                            suggest(tk, BUILTIN_TOKENIZERS)));
                }
                checkRefs(def.get("filter"), BUILTIN_TOKEN_FILTERS, customFilters, path + ".filter", "token filter", issues);
                checkRefs(def.get("char_filter"), BUILTIN_CHAR_FILTERS, customCharFilters, path + ".char_filter", "char filter", issues);
            }
        }
        JsonNode normalizers = analysisNode.get("normalizer");
        if (normalizers != null && normalizers.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = normalizers.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                String path = "settings.analysis.normalizer." + e.getKey();
                checkRefs(e.getValue().get("filter"), BUILTIN_TOKEN_FILTERS, customFilters, path + ".filter", "token filter", issues);
                checkRefs(e.getValue().get("char_filter"), BUILTIN_CHAR_FILTERS, customCharFilters, path + ".char_filter", "char filter", issues);
            }
        }
    }

    private void checkRefs(JsonNode refs, Set<String> builtin, Set<String> custom,
                           String path, String kind, List<ConfigIssue> issues) {
        if (refs == null || !refs.isArray()) {
            return;
        }
        for (JsonNode r : refs) {
            String name = r.asText();
            if (!builtin.contains(name) && !custom.contains(name)) {
                issues.add(ConfigIssue.warn(LAYER_LINT, "FILTER_UNDEFINED", path,
                        kind + " \"" + name + "\" 非内置且未定义（若非插件提供则建索引失败）", suggest(name, builtin)));
            }
        }
    }

    private void adviseSettings(JsonNode effective, List<ConfigIssue> issues) {
        int shards = intOf(effective, "number_of_shards", 1);
        int replicas = intOf(effective, "number_of_replicas", 1);
        if (shards > 3) {
            issues.add(ConfigIssue.info(LAYER_ADVISOR, "SHARDS_MANY", "settings.number_of_shards",
                    "分片数 " + shards + "：单分片建议承载 10~50GB，确认数据量匹配，分片过多浪费堆内存", null));
        }
        if (replicas == 0) {
            issues.add(ConfigIssue.warn(LAYER_ADVISOR, "ZERO_REPLICAS", "settings.number_of_replicas",
                    "副本数 0：任一节点故障即丢数据（临时导入可接受，上线前应 ≥1）", null));
        }
    }

    // ==================== mapping 检查 ====================

    private void lintMapping(JsonNode mapping, List<ConfigIssue> issues, Analysis analysis) {
        JsonNode root = mapping;
        // 6.x type 名包裹：唯一非法顶层键且其值内含 properties
        if (!mapping.has("properties")) {
            Iterator<Map.Entry<String, JsonNode>> it = mapping.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                if (!MAPPING_TOP_KEYS.contains(e.getKey()) && e.getValue().isObject() && e.getValue().has("properties")) {
                    issues.add(ConfigIssue.error(LAYER_LINT, "TYPE_NAME_WRAPPER", "mappings." + e.getKey(),
                            "检测到 6.x 风格 type 名包裹 \"" + e.getKey() + "\"（7.x 不允许自定义 type）",
                            "去掉这一层，mapping 顶层直接写 properties"));
                    root = e.getValue();
                    break;
                }
            }
        }
        if (root.has("runtime")) {
            issues.add(ConfigIssue.error(LAYER_LINT, "RUNTIME_FIELDS_710", "mappings.runtime",
                    "runtime fields 是 7.11+ 特性，7.10 不支持", null));
        }
        Iterator<String> keys = root.fieldNames();
        while (keys.hasNext()) {
            String k = keys.next();
            if (!MAPPING_TOP_KEYS.contains(k) && !"runtime".equals(k) && root == mapping) {
                issues.add(ConfigIssue.warn(LAYER_LINT, "UNKNOWN_MAPPING_TOP_KEY", "mappings." + k,
                        "未识别的 mapping 顶层键 \"" + k + "\"", suggest(k, MAPPING_TOP_KEYS)));
            }
        }
        Stats stats = new Stats();
        JsonNode props = root.get("properties");
        if (props != null && props.isObject()) {
            lintProperties(props, "mappings.properties", 1, issues, analysis, stats);
        }
        adviseMapping(root, stats, issues);
    }

    private void lintProperties(JsonNode props, String basePath, int depth,
                                List<ConfigIssue> issues, Analysis analysis, Stats stats) {
        Iterator<Map.Entry<String, JsonNode>> it = props.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            String path = basePath + "." + e.getKey();
            JsonNode field = e.getValue();
            if (!field.isObject()) {
                issues.add(ConfigIssue.error(LAYER_LINT, "FIELD_NOT_OBJECT", path, "字段定义必须是 object", null));
                continue;
            }
            stats.total++;
            String type = text(field, "type");
            String effType = type == null ? (field.has("properties") ? "object" : "object") : type;
            checkFieldType(type, path, issues);
            checkFieldParams(field, effType, path, issues, analysis, stats);
            // 递归子层
            JsonNode subProps = field.get("properties");
            if (subProps != null && subProps.isObject()) {
                if (type != null && !"object".equals(type) && !"nested".equals(type)) {
                    issues.add(ConfigIssue.error(LAYER_LINT, "PROPERTIES_ON_LEAF", path + ".properties",
                            type + " 类型不能有子 properties", "多路索引用 fields（multi-fields），层级结构用 object/nested"));
                } else {
                    if ("nested".equals(type)) {
                        stats.nested++;
                    }
                    if (depth >= 10) {
                        issues.add(ConfigIssue.warn(LAYER_ADVISOR, "DEPTH_LIMIT", path,
                                "对象嵌套已达 " + depth + " 层，默认 mapping.depth.limit=20，且深层结构查询代价高", null));
                    }
                    lintProperties(subProps, path + ".properties", depth + 1, issues, analysis, stats);
                }
            }
            // multi-fields
            JsonNode fields = field.get("fields");
            if (fields != null && fields.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> mf = fields.fields();
                while (mf.hasNext()) {
                    Map.Entry<String, JsonNode> sub = mf.next();
                    String subPath = path + ".fields." + sub.getKey();
                    stats.total++;
                    String subType = text(sub.getValue(), "type");
                    checkFieldType(subType, subPath, issues);
                    checkFieldParams(sub.getValue(), subType == null ? "keyword" : subType, subPath, issues, analysis, stats);
                }
            }
        }
    }

    private void checkFieldType(String type, String path, List<ConfigIssue> issues) {
        if (type == null) {
            return; // 无 type + 有 properties = object，合法
        }
        if (LEGACY_TYPES.containsKey(type)) {
            issues.add(ConfigIssue.error(LAYER_LINT, "LEGACY_TYPE", path + ".type",
                    "legacy 类型 \"" + type + "\"：" + LEGACY_TYPES.get(type), null));
            return;
        }
        if (!FIELD_TYPES.contains(type)) {
            issues.add(ConfigIssue.warn(LAYER_LINT, "UNKNOWN_FIELD_TYPE", path + ".type",
                    "\"" + type + "\" 不是 7.10 内置字段类型（若非 mapper 插件提供则建索引失败）",
                    suggest(type, FIELD_TYPES)));
        }
    }

    private void checkFieldParams(JsonNode field, String type, String path,
                                  List<ConfigIssue> issues, Analysis analysis, Stats stats) {
        boolean isText = "text".equals(type) || "search_as_you_type".equals(type) || "annotated_text".equals(type);
        // 引用登记（L1 引用完整性核心）
        for (String p : new String[]{"analyzer", "search_analyzer", "search_quote_analyzer"}) {
            String ref = text(field, p);
            if (ref != null) {
                analysis.checkAnalyzerRef(ref, path + "." + p, issues);
            }
        }
        String norm = text(field, "normalizer");
        if (norm != null && !"lowercase".equals(norm) && !analysis.normalizers.contains(norm)) {
            issues.add(ConfigIssue.warn(LAYER_LINT, "NORMALIZER_UNDEFINED", path + ".normalizer",
                    "normalizer \"" + norm + "\" 未在 settings.analysis.normalizer 定义", null));
        }
        // 参数-类型非法配对（确定必炸 → ERROR）
        if (field.has("analyzer") && !isText && !"completion".equals(type) && !"token_count".equals(type)) {
            issues.add(ConfigIssue.error(LAYER_LINT, "ANALYZER_ON_NON_TEXT", path + ".analyzer",
                    type + " 类型不支持 analyzer", "keyword".equals(type) ? "keyword 精确匹配不分词；需要归一化用 normalizer，需要分词改 text" : null));
        }
        if (field.has("normalizer") && !"keyword".equals(type)) {
            issues.add(ConfigIssue.error(LAYER_LINT, "NORMALIZER_ON_NON_KEYWORD", path + ".normalizer",
                    "normalizer 仅 keyword 类型支持，当前类型 " + type, null));
        }
        if (field.has("ignore_above") && !"keyword".equals(type) && !"wildcard".equals(type)) {
            issues.add(ConfigIssue.error(LAYER_LINT, "IGNORE_ABOVE_ON_NON_KEYWORD", path + ".ignore_above",
                    "ignore_above 仅 keyword/wildcard 支持，当前类型 " + type, null));
        }
        if (field.has("format") && !"date".equals(type) && !"date_nanos".equals(type) && !"date_range".equals(type)) {
            issues.add(ConfigIssue.error(LAYER_LINT, "FORMAT_ON_NON_DATE", path + ".format",
                    "format 仅日期类字段支持，当前类型 " + type, null));
        }
        if (field.has("fielddata") && !"text".equals(type)) {
            issues.add(ConfigIssue.error(LAYER_LINT, "FIELDDATA_ON_NON_TEXT", path + ".fielddata",
                    "fielddata 仅 text 类型支持，当前类型 " + type, null));
        }
        if ("scaled_float".equals(type) && !field.has("scaling_factor")) {
            issues.add(ConfigIssue.error(LAYER_LINT, "SCALING_FACTOR_MISSING", path,
                    "scaled_float 必须指定 scaling_factor", null));
        }
        if ("dense_vector".equals(type) && !field.has("dims")) {
            issues.add(ConfigIssue.error(LAYER_LINT, "DIMS_MISSING", path,
                    "dense_vector 必须指定 dims", null));
        }
        if ("alias".equals(type) && !field.has("path")) {
            issues.add(ConfigIssue.error(LAYER_LINT, "ALIAS_PATH_MISSING", path,
                    "alias 类型必须指定 path", null));
        }
        // legacy index 值
        JsonNode idxParam = field.get("index");
        if (idxParam != null && idxParam.isTextual()) {
            String v = idxParam.asText();
            if ("not_analyzed".equals(v) || "analyzed".equals(v) || "no".equals(v)) {
                issues.add(ConfigIssue.error(LAYER_LINT, "LEGACY_INDEX_VALUE", path + ".index",
                        "index: \"" + v + "\" 是 2.x 语法，7.x 中 index 只接受 true/false", null));
            }
        }
        // 未知参数拼写提示（WARN）
        Set<String> allowed = allowedParams(type, isText);
        Iterator<String> it = field.fieldNames();
        while (it.hasNext()) {
            String k = it.next();
            if (!allowed.contains(k) && !COMMON_FIELD_PARAMS.contains(k) && !"properties".equals(k) && !"dynamic".equals(k)
                    && !"enabled".equals(k) && !"include_in_parent".equals(k) && !"include_in_root".equals(k)) {
                issues.add(ConfigIssue.warn(LAYER_LINT, "UNKNOWN_FIELD_PARAM", path + "." + k,
                        type + " 类型未识别参数 \"" + k + "\"", suggest(k, union(allowed, COMMON_FIELD_PARAMS))));
            }
        }
        // L3 素材统计
        if ("text".equals(type)) {
            stats.text++;
            JsonNode mf = field.get("fields");
            boolean hasKeywordSub = false;
            if (mf != null && mf.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> sub = mf.fields();
                while (sub.hasNext()) {
                    if ("keyword".equals(text(sub.next().getValue(), "type"))) {
                        hasKeywordSub = true;
                    }
                }
            }
            if (!hasKeywordSub) {
                stats.textNoKeyword.add(path);
            }
        }
    }

    private Set<String> allowedParams(String type, boolean isText) {
        if (isText) {
            return TEXT_PARAMS;
        }
        if ("keyword".equals(type) || "wildcard".equals(type) || "constant_keyword".equals(type)) {
            return KEYWORD_PARAMS;
        }
        if (NUMBER_TYPES.contains(type)) {
            return setOf("coerce", "ignore_malformed", "scaling_factor");
        }
        if ("date".equals(type) || "date_nanos".equals(type) || "date_range".equals(type)) {
            return setOf("format", "ignore_malformed", "locale");
        }
        if ("completion".equals(type)) {
            return setOf("analyzer", "search_analyzer", "preserve_separators", "preserve_position_increments",
                    "max_input_length", "contexts");
        }
        if ("token_count".equals(type)) {
            return setOf("analyzer", "enable_position_increments");
        }
        if ("dense_vector".equals(type)) {
            return setOf("dims");
        }
        if ("alias".equals(type)) {
            return setOf("path");
        }
        if ("join".equals(type)) {
            return setOf("relations", "eager_global_ordinals");
        }
        if ("geo_point".equals(type) || "geo_shape".equals(type) || "point".equals(type) || "shape".equals(type)) {
            return setOf("ignore_malformed", "ignore_z_value", "orientation", "coerce");
        }
        // ip/boolean/binary/range/flattened 等：仅通用参数
        return setOf("ignore_malformed", "depth_limit", "eager_global_ordinals", "similarity",
                "positive_score_impact", "max_shingle_size");
    }

    private void adviseMapping(JsonNode root, Stats stats, List<ConfigIssue> issues) {
        JsonNode dynamic = root.get("dynamic");
        if (dynamic == null || dynamic.asText("true").equals("true")) {
            issues.add(ConfigIssue.info(LAYER_ADVISOR, "DYNAMIC_NOT_STRICT", "mappings.dynamic",
                    "未设置 dynamic: \"strict\"——脏字段写入会静默扩 mapping（字段爆炸隐患）；确认接受动态字段再忽略本条", null));
        }
        if (stats.total > 500) {
            issues.add(ConfigIssue.warn(LAYER_ADVISOR, "FIELD_COUNT_HIGH", "mappings",
                    "字段总数 " + stats.total + "，逼近默认 mapping.total_fields.limit=1000", null));
        }
        if (stats.nested > 10) {
            issues.add(ConfigIssue.warn(LAYER_ADVISOR, "NESTED_MANY", "mappings",
                    "nested 字段 " + stats.nested + " 个：每个 nested 文档独立 Lucene doc，写入与查询开销放大", null));
        }
        if (!stats.textNoKeyword.isEmpty() && stats.textNoKeyword.size() <= 20) {
            issues.add(ConfigIssue.info(LAYER_ADVISOR, "TEXT_NO_KEYWORD_SUB", stats.textNoKeyword.get(0),
                    stats.textNoKeyword.size() + " 个 text 字段无 keyword 子字段（无法精确聚合/排序）："
                            + shortList(stats.textNoKeyword), "确有聚合/排序需求的字段加 fields.keyword"));
        }
    }

    // ==================== 工具 ====================

    /** mapping 引用的 analyzer 登记与完整性判定（内置 / settings 定义 / 插件可能提供） */
    private class Analysis {
        final Set<String> analyzers = new HashSet<>();
        final Set<String> normalizers = new HashSet<>();

        void checkAnalyzerRef(String name, String path, List<ConfigIssue> issues) {
            if (BUILTIN_ANALYZERS.contains(name) || analyzers.contains(name)) {
                return;
            }
            issues.add(ConfigIssue.warn(LAYER_LINT, "ANALYZER_UNDEFINED", path,
                    "analyzer \"" + name + "\" 非内置且未在 settings.analysis.analyzer 定义"
                            + "（ik_max_word 等插件 analyzer 可忽略本条，以 Dry-run 为准）",
                    suggest(name, union(BUILTIN_ANALYZERS, analyzers))));
        }
    }

    private static class Stats {
        int total;
        int text;
        int nested;
        final List<String> textNoKeyword = new ArrayList<>();
    }

    private static String text(JsonNode node, String key) {
        JsonNode v = node.get(key);
        return v == null || !v.isTextual() ? null : v.asText();
    }

    private static int intOf(JsonNode node, String key, int def) {
        JsonNode v = node.get(key);
        if (v == null) {
            return def;
        }
        if (v.isInt()) {
            return v.asInt();
        }
        if (v.isTextual() && v.asText().matches("\\d+")) {
            return Integer.parseInt(v.asText());
        }
        return def;
    }

    private static Set<String> fieldNames(JsonNode node) {
        Set<String> names = new HashSet<>();
        if (node != null && node.isObject()) {
            node.fieldNames().forEachRemaining(names::add);
        }
        return names;
    }

    private static JsonNode firstNonNull(JsonNode a, JsonNode b) {
        return a != null ? a : b;
    }

    private static String shortList(List<String> paths) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < paths.size() && i < 3; i++) {
            if (i > 0) {
                sb.append(", ");
            }
            sb.append(paths.get(i).replace("mappings.properties.", ""));
        }
        if (paths.size() > 3) {
            sb.append(" 等");
        }
        return sb.toString();
    }

    private static String suggest(String input, Set<String> candidates) {
        String near = nearest(input, candidates);
        return near == null ? null : "是否想写 \"" + near + "\"？";
    }

    /** did-you-mean：编辑距离 ≤2（或 ≤ 长度/3）的最近候选 */
    private static String nearest(String input, Set<String> candidates) {
        String best = null;
        int bestDist = Math.max(2, input.length() / 3) + 1;
        for (String c : candidates) {
            int d = levenshtein(input, c, bestDist);
            if (d < bestDist) {
                bestDist = d;
                best = c;
            }
        }
        return best;
    }

    private static int levenshtein(String a, String b, int cap) {
        if (Math.abs(a.length() - b.length()) >= cap) {
            return cap;
        }
        int[] prev = new int[b.length() + 1];
        int[] cur = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) {
            prev[j] = j;
        }
        for (int i = 1; i <= a.length(); i++) {
            cur[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                cur[j] = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] tmp = prev;
            prev = cur;
            cur = tmp;
        }
        return prev[b.length()];
    }

    private static Set<String> setOf(String... items) {
        return new HashSet<>(Arrays.asList(items));
    }

    private static Set<String> union(Set<String> a, Set<String> b) {
        Set<String> u = new HashSet<>(a);
        u.addAll(b);
        return u;
    }

    private static Map<String, String> mapOf(String... kv) {
        Map<String, String> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put(kv[i], kv[i + 1]);
        }
        return m;
    }
}
