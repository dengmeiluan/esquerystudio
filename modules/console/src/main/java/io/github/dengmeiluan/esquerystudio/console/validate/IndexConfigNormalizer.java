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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 第 ：索引配置形态归一化——「ES 原样响应」宽容接受（校准误差第二案）。
 *
 * <p>实报：Mapping 页「发送到托管重建」→ validate 报 UNKNOWN_SETTING_KEY×1 +
 * TYPE_NAME_WRAPPER ERROR（挡死 dry-run）+ ANALYZER_UNDEFINED×12。根因是
 * {@code EsIndexAdmin.inspect} 返回的 settings 段保留索引名壳 + HLRC Settings keySet
 * 天然 flat（{@code index.analysis.analyzer.x.tokenizer} 平铺键），mappings 段保留索引名壳；
 * 这份原文直通审编框后，Linter 只认「建索引 PUT」标准形态 → 壳被当结构错误、
 * 平铺的 analysis 定义全部「看不见」。</p>
 *
 * <p>归一化是无损的：剥壳只去掉索引名包裹，flat 平铺键按点号重组回嵌套对象，
 * flat 数组字符串 {@code "[a, b]"} 还原为数组。validate 与托管重建建索引入口共用本类，
 * 保证「校验过的形态 = 落 ES 的形态」。</p>
 *
 * @author aicoding
 */
public final class IndexConfigNormalizer {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 保留结构键：索引名壳判定时这些名字不当作索引名剥 */
    private static final Set<String> STRUCT_KEYS = new java.util.HashSet<>(java.util.Arrays.asList(
            "index", "settings", "mappings", "properties", "_doc", "doc"));

    /** mapping 顶层合法键（与 IndexConfigLinter.MAPPING_TOP_KEYS 同口径） */
    private static final Set<String> MAPPING_TOP_KEYS = new java.util.HashSet<>(java.util.Arrays.asList(
            "properties", "dynamic", "dynamic_templates", "_source", "_meta", "_routing",
            "_field_names", "_size", "date_detection", "numeric_detection", "dynamic_date_formats", "runtime"));

    /** flat 平铺键里需要归组回嵌套对象的子树前缀（其余平铺键保持原样即可） */
    private static final String PREFIX_ANALYSIS = "analysis.";
    private static final String PREFIX_SIMILARITY = "similarity.";

    /** 归一化结果：净形态 JSON + 人类可读标注（入参为空时对应字段为 null） */
    public static final class Result {
        public final String settingsJson;
        public final String mappingJson;
        public final List<String> notes;

        Result(String settingsJson, String mappingJson, List<String> notes) {
            this.settingsJson = settingsJson;
            this.mappingJson = mappingJson;
            this.notes = notes;
        }
    }

    private IndexConfigNormalizer() {
    }

    public static Result normalize(String settingsJson, String mappingJson) {
        List<String> notes = new ArrayList<>();
        String s = normalizeSettings(settingsJson, notes);
        String m = normalizeMapping(mappingJson, notes);
        return new Result(s, m, notes);
    }

    // ==================== settings ====================

    /**
     * settings 归一：剥 settings 壳 → 剥索引名壳 → index 嵌套展平合并 →
     * analysis/similarity 平铺键归组 → flat 数组字符串还原。输出统一为 {@code {index: {...}}} 形态
     * （与 cleanedSettingsJson 同构，linter 与建索引 API 双兼容）。
     */
    static String normalizeSettings(String json, List<String> notes) {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        JsonNode root;
        try {
            root = MAPPER.readTree(json);
        } catch (Exception e) {
            return json; // 语法错误交给 Linter 报
        }
        if (!root.isObject()) {
            return json;
        }
        boolean changed = false;
        // 1+2) 壳剥离：GET /{idx}/_settings 完整形态是 {idx: {settings: {index: {...}}}}——
        // 索引名壳在内、settings 壳在外，两轮循环各剥一层
        for (int round = 0; round < 2; round++) {
            JsonNode inner = root.get("settings");
            if (inner != null && inner.isObject() && root.size() == 1) {
                root = inner;
                changed = true;
                continue;
            }
            if (root.size() == 1) {
                String only = root.fieldNames().next();
                JsonNode v = root.get(only);
                if (!STRUCT_KEYS.contains(only) && v.isObject()) {
                    notes.add("settings 已剥离索引名外壳 \"" + only + "\"（GET _settings 原样形态）");
                    root = v;
                    changed = true;
                    continue;
                }
            }
            break;
        }
        // 3) index 嵌套对象展平：{index: {...}} 与平铺键统一成「剥前缀后的相对键」平铺
        JsonNode idxNode = root.get("index");
        // 短路：已是 {index: {...}} 纯标准形态（无壳/无平铺补充键）→ 原样返回，不做无谓重写
        if (!changed && idxNode != null && idxNode.isObject() && root.size() == 1) {
            return json;
        }
        java.util.LinkedHashMap<String, JsonNode> flat = new java.util.LinkedHashMap<>();
        if (idxNode != null && idxNode.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = idxNode.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                flat.put(e.getKey(), e.getValue());
            }
            changed = true;
        }
        Iterator<Map.Entry<String, JsonNode>> top = root.fields();
        while (top.hasNext()) {
            Map.Entry<String, JsonNode> e = top.next();
            String k = e.getKey();
            if ("index".equals(k) || "settings".equals(k)) {
                continue; // 已处理/已剥
            }
            flat.put(k.startsWith("index.") ? k.substring("index.".length()) : k, e.getValue());
        }
        // 4) analysis/similarity 平铺键归组成嵌套对象
        ObjectNode out = MAPPER.createObjectNode();
        ObjectNode analysisTree = MAPPER.createObjectNode();
        ObjectNode similarityTree = MAPPER.createObjectNode();
        boolean hasAnalysisFlat = false;
        boolean hasSimilarityFlat = false;
        for (Map.Entry<String, JsonNode> e : flat.entrySet()) {
            String k = e.getKey();
            if (k.startsWith(PREFIX_ANALYSIS)) {
                dig(analysisTree, k.substring(PREFIX_ANALYSIS.length()).split("\\."), unflatValue(e.getValue()));
                hasAnalysisFlat = true;
            } else if (k.startsWith(PREFIX_SIMILARITY)) {
                dig(similarityTree, k.substring(PREFIX_SIMILARITY.length()).split("\\."), unflatValue(e.getValue()));
                hasSimilarityFlat = true;
            } else {
                out.set(k, e.getValue());
            }
        }
        // 嵌套对象形态的 analysis/similarity（GET 非平铺形态）与归组结果合并——归组补充，嵌套优先
        JsonNode existingAnalysis = out.get("analysis");
        if (existingAnalysis != null && existingAnalysis.isObject()) {
            mergeInto((ObjectNode) existingAnalysis, analysisTree);
        } else if (hasAnalysisFlat) {
            out.set("analysis", analysisTree);
            changed = true;
        }
        JsonNode existingSimilarity = out.get("similarity");
        if (existingSimilarity != null && existingSimilarity.isObject()) {
            mergeInto((ObjectNode) existingSimilarity, similarityTree);
        } else if (hasSimilarityFlat) {
            out.set("similarity", similarityTree);
            changed = true;
        }
        if (hasAnalysisFlat && existingAnalysis != null && existingAnalysis.isObject()) {
            changed = true;
        }
        if (hasSimilarityFlat && existingSimilarity != null && existingSimilarity.isObject()) {
            changed = true;
        }
        if (hasAnalysisFlat || hasSimilarityFlat) {
            notes.add("settings 平铺键已归组回 analysis/similarity 嵌套形态（flat_settings 原样形态）");
        }
        if (!changed && !hasAnalysisFlat && !hasSimilarityFlat) {
            return json; // 本就是标准形态，原样返回（避免重排用户键序）
        }
        ObjectNode wrap = MAPPER.createObjectNode();
        wrap.set("index", out);
        return wrap.toString();
    }

    /** flat 数组字符串 "[a, b]" → 真数组节点；其余原样。parse 失败保持原样由 ES 裁决 */
    private static JsonNode unflatValue(JsonNode v) {
        if (v != null && v.isTextual()) {
            String t = v.asText().trim();
            if (t.startsWith("[") && t.endsWith("]")) {
                try {
                    return MAPPER.readTree(t);
                } catch (Exception ignore) {
                    // 逗号分隔非 JSON 数组（如 [a, b] 无引号）——手工拆
                    String body = t.substring(1, t.length() - 1).trim();
                    ArrayNode arr = MAPPER.createArrayNode();
                    if (!body.isEmpty()) {
                        for (String p : body.split(",")) {
                            String s = p.trim();
                            if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
                                s = s.substring(1, s.length() - 1);
                            }
                            if (!s.isEmpty()) {
                                arr.add(s);
                            }
                        }
                    }
                    return arr;
                }
            }
        }
        return v;
    }

    /** 沿 path 逐段建嵌套对象，叶子上放 value（同名已存在时不覆盖） */
    private static void dig(ObjectNode tree, String[] path, JsonNode value) {
        ObjectNode cur = tree;
        for (int i = 0; i < path.length - 1; i++) {
            JsonNode next = cur.get(path[i]);
            if (next instanceof ObjectNode) {
                cur = (ObjectNode) next;
            } else {
                ObjectNode created = MAPPER.createObjectNode();
                cur.set(path[i], created);
                cur = created;
            }
        }
        String leaf = path[path.length - 1];
        if (!cur.has(leaf)) {
            cur.set(leaf, value);
        }
    }

    /** b 合并进 a（递归；a 已有同名叶子不覆盖） */
    private static void mergeInto(ObjectNode a, ObjectNode b) {
        Iterator<Map.Entry<String, JsonNode>> it = b.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            JsonNode av = a.get(e.getKey());
            if (av != null && av.isObject() && e.getValue().isObject()) {
                mergeInto((ObjectNode) av, (ObjectNode) e.getValue());
            } else if (av == null) {
                a.set(e.getKey(), e.getValue());
            }
        }
    }

    // ==================== mapping ====================

    /**
     * mapping 归一：剥索引名壳（GET _mapping 双层壳 / inspect 单壳 properties 直下）。
     * 单键壳在「索引名」与「6.x type 名」同构无法区分——校验/建索引场景都是单索引，
     * 宽容剥壳；剥完仍有非法顶层键（真多 type）交 Linter 报 TYPE_NAME_WRAPPER。
     */
    static String normalizeMapping(String json, List<String> notes) {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        JsonNode root;
        try {
            root = MAPPER.readTree(json);
        } catch (Exception e) {
            return json;
        }
        if (!root.isObject()) {
            return json;
        }
        boolean changed = false;
        // GET /{idx}/_mapping 完整形态：唯一索引名壳 + 内层 mappings 键 → 双层剥
        if (root.size() == 1) {
            String only = root.fieldNames().next();
            JsonNode v = root.get(only);
            if (!MAPPING_TOP_KEYS.contains(only) && v.isObject() && v.get("mappings") instanceof ObjectNode) {
                root = v.get("mappings");
                notes.add("mapping 已剥离索引名外壳 \"" + only + "\"（GET _mapping 原样形态）");
                changed = true;
            } else if (!MAPPING_TOP_KEYS.contains(only) && v.isObject() && v.has("properties")) {
                // inspect 形态：索引名壳 + properties 直下（与单 type 壳同构，宽容剥）
                root = v;
                notes.add("mapping 已剥离外层包裹 \"" + only + "\"（索引名/type 壳）");
                changed = true;
            }
        }
        return changed ? root.toString() : json;
    }
}
