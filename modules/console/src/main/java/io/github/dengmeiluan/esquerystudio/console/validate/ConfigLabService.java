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
import com.fasterxml.jackson.databind.SerializationFeature;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import org.elasticsearch.action.admin.indices.settings.get.GetSettingsRequest;
import org.elasticsearch.action.admin.indices.settings.get.GetSettingsResponse;
import org.elasticsearch.client.RequestOptions;
import org.elasticsearch.client.RestHighLevelClient;
import org.elasticsearch.common.settings.Settings;
import org.springframework.beans.factory.ObjectProvider;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 *  配置实验室服务：交互式校验 + 配置漂移检测。
 *
 * <p><b>漂移检测</b>解决返工的另一半场景——「代码里的 @Setting/@Mapping 和线上索引实际配置不一致」：
 * 代码侧与线上侧都归一化为「去 index. 前缀、剔系统键、扁平化排序」的 JSON 后对比，
 * 输出 diff 摘要（onlyInCode / onlyInLive / different）+ 归一化全文（前端 monaco diff 渲染）。</p>
 *
 * @author aicoding
 */
public class ConfigLabService {

    /** 序列化按键名排序——保证两侧 JSON 可逐行 diff */
    private static final ObjectMapper SORTED = new ObjectMapper()
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true)
            .configure(SerializationFeature.INDENT_OUTPUT, true);

    /** 线上 settings 中的系统生成键（与代码配置无关，剔除后再比对） */
    private static final String[] SYSTEM_SETTING_PREFIXES = {
            "uuid", "creation_date", "provided_name", "version.", "resize.", "history.", "routing.allocation.initial_recovery"};

    private final IndexConfigValidator validator;
    private final EsIndexAdmin esIndexAdmin;
    /** 宿主 client 改 Supplier 懒解析（零 ES 依赖宿主经 ControlClusterResolver 供给）。 */
    private final java.util.function.Supplier<RestHighLevelClient> restHighLevelClient;
    private final ObjectProvider<IndexMetaRegistry> registryProvider;

    public ConfigLabService(IndexConfigValidator validator,
                            EsIndexAdmin esIndexAdmin,
                            java.util.function.Supplier<RestHighLevelClient> restHighLevelClient,
                            ObjectProvider<IndexMetaRegistry> registryProvider) {
        this.validator = validator;
        this.esIndexAdmin = esIndexAdmin;
        this.restHighLevelClient = restHighLevelClient;
        this.registryProvider = registryProvider;
    }

    public Map<String, Object> validate(String settingsJson, String mappingJson, boolean dryRun) {
        return validator.validate(settingsJson, mappingJson, dryRun).toMap();
    }

    /** 漂移检测可选对象：所有注册 provider（纯控制台宿主为空列表）。 */
    public List<Map<String, Object>> driftKeys() {
        List<Map<String, Object>> out = new ArrayList<>();
        IndexMetaRegistry registry = registryProvider.getIfAvailable();
        if (registry == null) {
            return out;
        }
        for (String key : registry.listIndexKeys()) {
            RebuildableIndexMeta meta = registry.getByKey(key);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("indexKey", key);
            m.put("alias", meta.getAliasName());
            m.put("hasMapping", meta.hasMapping());
            out.add(m);
        }
        return out;
    }

    /** 单索引漂移详情：代码配置 vs 线上（write 索引）实际配置。 */
    public Map<String, Object> drift(String indexKey) throws IOException {
        IndexMetaRegistry registry = registryProvider.getIfAvailable();
        if (registry == null) {
            throw new IllegalStateException("当前宿主无注册 provider，无漂移检测对象");
        }
        RebuildableIndexMeta meta = registry.getByKey(indexKey);
        String alias = meta.getAliasName();
        String physical = esIndexAdmin.aliasExists(alias) ? esIndexAdmin.getWriteIndex(alias) : alias;

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("indexKey", indexKey);
        out.put("alias", alias);
        out.put("physicalIndex", physical);
        if (physical == null || !esIndexAdmin.indexExists(physical)) {
            out.put("liveExists", false);
            return out;
        }
        out.put("liveExists", true);

        // settings：两侧归一化为扁平排序 map
        Map<String, String> codeSettings = flattenSettingsJson(meta.getSettingsJson());
        Map<String, String> liveSettings = liveSettings(physical);
        out.put("codeSettings", SORTED.writeValueAsString(codeSettings));
        out.put("liveSettings", SORTED.writeValueAsString(liveSettings));
        out.put("settingsDiff", diffSummary(codeSettings, liveSettings));

        // mapping：两侧按键名排序 pretty print
        String codeMapping = normalizeJson(meta.getMappingJson());
        String liveMapping = normalizeJson(esIndexAdmin.getMapping(physical));
        out.put("codeMapping", codeMapping);
        out.put("liveMapping", liveMapping);
        out.put("mappingEqual", codeMapping != null && codeMapping.equals(liveMapping));
        return out;
    }

    // ==================== 归一化 ====================

    private Map<String, String> liveSettings(String physical) throws IOException {
        GetSettingsResponse resp = restHighLevelClient.get().indices()
                .getSettings(new GetSettingsRequest().indices(physical), RequestOptions.DEFAULT);
        Settings settings = resp.getIndexToSettings().get(physical);
        Map<String, String> flat = new TreeMap<>();
        if (settings == null) {
            return flat;
        }
        for (String key : settings.keySet()) {
            String rel = stripIndexPrefix(key);
            if (!isSystemKey(rel)) {
                flat.put(rel, settings.get(key));
            }
        }
        return flat;
    }

    /** 代码 settings JSON（顶层扁平 / index 嵌套 / index. 前缀混写均可）→ 扁平排序 map。 */
    Map<String, String> flattenSettingsJson(String settingsJson) throws IOException {
        Map<String, String> flat = new TreeMap<>();
        if (settingsJson == null || settingsJson.trim().isEmpty()) {
            return flat;
        }
        JsonNode root = SORTED.readTree(settingsJson);
        flatten(root, "", flat);
        Map<String, String> normalized = new TreeMap<>();
        for (Map.Entry<String, String> e : flat.entrySet()) {
            normalized.put(stripIndexPrefix(e.getKey()), e.getValue());
        }
        return normalized;
    }

    private void flatten(JsonNode node, String prefix, Map<String, String> out) {
        if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = node.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                flatten(e.getValue(), prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey(), out);
            }
        } else if (node.isArray()) {
            // 与 ES 扁平 settings 一致：数组展开为 key.0 / key.1
            for (int i = 0; i < node.size(); i++) {
                flatten(node.get(i), prefix + "." + i, out);
            }
        } else {
            out.put(prefix, node.asText());
        }
    }

    private static String stripIndexPrefix(String key) {
        return key.startsWith("index.") ? key.substring("index.".length()) : key;
    }

    private static boolean isSystemKey(String rel) {
        for (String p : SYSTEM_SETTING_PREFIXES) {
            if (rel.startsWith(p)) {
                return true;
            }
        }
        return false;
    }

    private Map<String, Object> diffSummary(Map<String, String> code, Map<String, String> live) {
        List<String> onlyInCode = new ArrayList<>();
        List<String> onlyInLive = new ArrayList<>();
        List<Map<String, String>> different = new ArrayList<>();
        for (Map.Entry<String, String> e : code.entrySet()) {
            String liveVal = live.get(e.getKey());
            if (liveVal == null) {
                onlyInCode.add(e.getKey());
            } else if (!liveVal.equals(e.getValue())) {
                Map<String, String> d = new LinkedHashMap<>();
                d.put("key", e.getKey());
                d.put("code", e.getValue());
                d.put("live", liveVal);
                different.add(d);
            }
        }
        for (String k : live.keySet()) {
            if (!code.containsKey(k)) {
                onlyInLive.add(k);
            }
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("onlyInCode", onlyInCode);
        summary.put("onlyInLive", onlyInLive);
        summary.put("different", different);
        summary.put("clean", onlyInCode.isEmpty() && onlyInLive.isEmpty() && different.isEmpty());
        return summary;
    }

    /** 任意 JSON → 按键名排序 pretty print（null/空 → null）。 */
    private String normalizeJson(String json) throws IOException {
        if (json == null || json.trim().isEmpty()) {
            return null;
        }
        Object tree = SORTED.readValue(json, Object.class);
        return SORTED.writeValueAsString(tree);
    }
}
