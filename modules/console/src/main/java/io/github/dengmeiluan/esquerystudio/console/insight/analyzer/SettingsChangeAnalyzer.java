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

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.validate.ConfigIssue;
import io.github.dengmeiluan.esquerystudio.console.validate.IndexConfigLinter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 *  现场①：索引 settings 变更分析器。
 *
 * <p>逐项判定 DYNAMIC（可热更）/ STATIC（需重建）/ ILLEGAL（未知键或值非法），
 * L1 门禁复用 {@link IndexConfigLinter}（无状态，自持实例），静态项耗时预估复用
 * {@link EsIndexAdmin#reindexPreview}（30 MB/s 折算，后端统一算好 estimatedMinutes，
 * 前端不重复公式）。完全只读，零副作用。</p>
 *
 * @author aicoding
 */
public class SettingsChangeAnalyzer {

    private static final Logger logger = LoggerFactory.getLogger(SettingsChangeAnalyzer.class);

    /** 就地重建吞吐经验值：30 MB/s（与前端既有折算惯例一致）。 */
    private static final double REBUILD_BYTES_PER_SECOND = 30.0 * 1024 * 1024;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final EsIndexAdmin esIndexAdmin;
    /** L1 门禁（无状态，可自持）。 */
    private final IndexConfigLinter linter = new IndexConfigLinter();

    public SettingsChangeAnalyzer(EsIndexAdmin esIndexAdmin) {
        this.esIndexAdmin = esIndexAdmin;
    }

    /**
     * 分析一组 settings 变更。
     *
     * @param index   目标索引（静态项存在时用于重建耗时预估）
     * @param changes 扁平变更集，如 {@code {"refresh_interval":"30s","number_of_shards":3}}
     * @return {@code {items[], hasDynamic, hasStatic, hasIllegal, rebuildEstimate?}}
     */
    public Map<String, Object> analyze(String index, Map<String, Object> changes) {
        List<Map<String, Object>> items = new ArrayList<>();
        boolean hasDynamic = false;
        boolean hasStatic = false;
        boolean hasIllegal = false;

        // L1 门禁：整组 changes 作为 settings JSON 过 linter，issues 按 path 归到对应 key
        List<ConfigIssue> issues = lintChanges(changes);

        for (Map.Entry<String, Object> e : changes.entrySet()) {
            String key = e.getKey();
            String norm = normalize(key);
            String kind = Es710IndexSettings.classify(key);

            List<Map<String, Object>> gateIssues = new ArrayList<>();
            for (ConfigIssue issue : issues) {
                if (issue.getPath().equals("settings." + norm) || issue.getPath().startsWith("settings." + norm + ".")) {
                    gateIssues.add(issue.toMap());
                    // 值非法（如 replicas=-1）→ 升级 ILLEGAL
                    if (issue.isError()) {
                        kind = Es710IndexSettings.UNKNOWN;
                    }
                }
            }

            String note;
            if (Es710IndexSettings.DYNAMIC.equals(kind)) {
                note = "动态 setting，可热更，立即生效";
                hasDynamic = true;
            } else if (Es710IndexSettings.STATIC.equals(kind)) {
                note = "静态 setting，需关闭索引或零停机重建后生效";
                hasStatic = true;
            } else {
                kind = "ILLEGAL";
                note = "非法项：未知 setting 键或值校验失败，无法应用";
                hasIllegal = true;
            }

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", key);
            item.put("value", e.getValue());
            item.put("kind", kind);
            item.put("note", note);
            if (!gateIssues.isEmpty()) {
                item.put("gateIssues", gateIssues);
            }
            items.add(item);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("hasDynamic", hasDynamic);
        out.put("hasStatic", hasStatic);
        out.put("hasIllegal", hasIllegal);
        if (hasStatic) {
            out.put("rebuildEstimate", rebuildEstimate(index));
        }
        return out;
    }

    /** 静态项重建耗时预估；失败（索引不存在等）不抛，返回 error 字符串。 */
    private Map<String, Object> rebuildEstimate(String index) {
        Map<String, Object> est = new LinkedHashMap<>();
        try {
            Map<String, Object> preview = esIndexAdmin.reindexPreview(index, null);
            long docs = ((Number) preview.getOrDefault("docs", 0L)).longValue();
            long bytes = ((Number) preview.getOrDefault("sourcePrimaryBytes", 0L)).longValue();
            est.put("docCount", docs);
            est.put("sizeBytes", bytes);
            // ceil 且至少 1 分钟：预估宁可略保守
            long minutes = Math.max(1L, (long) Math.ceil(bytes / REBUILD_BYTES_PER_SECOND / 60.0));
            est.put("estimatedMinutes", minutes);
        } catch (Exception e) {
            est.put("error", "重建预估失败: " + e.getMessage());
        }
        return est;
    }

    private List<ConfigIssue> lintChanges(Map<String, Object> changes) {
        try {
            return linter.lint(OBJECT_MAPPER.writeValueAsString(changes), null);
        } catch (Exception e) {
            // 裁决（三态之②回退误导类）：lint 失败若伪装「零问题」空列表，
            // analyze 的 L1 门禁即假绿灯，非法 settings 会被调用方直接采纳。冷路径
            // （lint 仅在分析入口执行一次），WARN 带键名摘要与堆栈——刻意只记键不记值
            // （settings 值可能带敏感语义）；返回空列表契约不变（Observability554Test 反锁）。
            logger.warn("[SettingsChange] lint 门禁执行失败，按零 issues 放行（假绿灯风险）"
                    + ": keys={} : {}", changes == null ? null : changes.keySet(), e.getMessage(), e);
            return new ArrayList<>();
        }
    }

    private String normalize(String key) {
        String k = key == null ? "" : key.trim();
        return k.startsWith("index.") ? k.substring("index.".length()) : k;
    }
}
