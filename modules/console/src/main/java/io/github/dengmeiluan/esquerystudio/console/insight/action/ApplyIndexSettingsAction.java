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

package io.github.dengmeiluan.esquerystudio.console.insight.action;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.insight.analyzer.SettingsChangeAnalyzer;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 *  首个护栏动作：热更索引动态 settings。
 *
 * <p>minRole=REBUILD_OP（与 {@code /cluster/index-settings/update} 的 rank3 定级一致）；
 * estimate 内联 {@link SettingsChangeAnalyzer} 结果 + 人话摘要，
 * <b>含 STATIC/ILLEGAL 项时直接抛 IllegalArgumentException</b>——护栏：
 * 不可热更的变更不发 confirmToken；execute 直调
 * {@link EsIndexAdmin#updateIndexSettings}（不 HTTP 自调用）。</p>
 *
 * @author aicoding
 */
public class ApplyIndexSettingsAction implements GuardedAction {

    public static final String ID = "apply-index-settings";

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final SettingsChangeAnalyzer analyzer;
    private final EsIndexAdmin esIndexAdmin;

    public ApplyIndexSettingsAction(SettingsChangeAnalyzer analyzer, EsIndexAdmin esIndexAdmin) {
        this.analyzer = analyzer;
        this.esIndexAdmin = esIndexAdmin;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public ConsoleRole minRole() {
        return ConsoleRole.REBUILD_OP;
    }

    @Override
    public String riskLevel() {
        return RISK_MEDIUM;
    }

    @Override
    public boolean supportsDryRun() {
        return true;
    }

    @Override
    public Map<String, Object> estimate(Map<String, Object> params) {
        String index = requireIndex(params);
        Map<String, Object> changes = requireChanges(params);
        Map<String, Object> analysis = analyzer.analyze(index, changes);
        if (Boolean.TRUE.equals(analysis.get("hasStatic")) || Boolean.TRUE.equals(analysis.get("hasIllegal"))) {
            throw new IllegalArgumentException("变更含静态/非法 setting，无法热更：静态项请走零停机重建，非法项请修正后重试");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", "将对索引 " + index + " 热更 " + changes.size() + " 项动态 setting，立即生效，无需重建");
        out.put("analysis", analysis);
        return out;
    }

    /** 零副作用：仅重跑 L1 门禁，返回 issues（不碰 ES 写路径）。 */
    @Override
    public Map<String, Object> dryRun(Map<String, Object> params) {
        String index = requireIndex(params);
        Map<String, Object> changes = requireChanges(params);
        Map<String, Object> analysis = analyzer.analyze(index, changes);
        List<Map<String, Object>> issues = new java.util.ArrayList<>();
        Object items = analysis.get("items");
        if (items instanceof List) {
            for (Object o : (List<?>) items) {
                if (!(o instanceof Map)) continue;
                Object gi = ((Map<?, ?>) o).get("gateIssues");
                if (gi instanceof List) {
                    for (Object issue : (List<?>) gi) {
                        if (issue instanceof Map) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> m = (Map<String, Object>) issue;
                            issues.add(m);
                        }
                    }
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("issues", issues);
        out.put("ok", issues.isEmpty()
                && !Boolean.TRUE.equals(analysis.get("hasStatic"))
                && !Boolean.TRUE.equals(analysis.get("hasIllegal")));
        return out;
    }

    @Override
    public Map<String, Object> execute(Map<String, Object> params) throws IOException {
        String index = requireIndex(params);
        Map<String, Object> changes = requireChanges(params);
        // 与热Setting页既有保存体一致的 {"index":{...}} 包裹（键去 index. 前缀）
        Map<String, Object> normalized = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : changes.entrySet()) {
            String k = e.getKey().trim();
            normalized.put(k.startsWith("index.") ? k.substring("index.".length()) : k, e.getValue());
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("index", normalized);
        Map<String, Object> resp = esIndexAdmin.updateIndexSettings(index, OBJECT_MAPPER.writeValueAsString(body));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("index", index);
        out.put("applied", normalized);
        out.put("esResponse", resp);
        return out;
    }

    private String requireIndex(Map<String, Object> params) {
        Object index = params == null ? null : params.get("index");
        if (!(index instanceof String) || ((String) index).trim().isEmpty()) {
            throw new IllegalArgumentException("params.index 必填");
        }
        return ((String) index).trim();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> requireChanges(Map<String, Object> params) {
        Object changes = params == null ? null : params.get("changes");
        if (!(changes instanceof Map) || ((Map<String, Object>) changes).isEmpty()) {
            throw new IllegalArgumentException("params.changes 必填且不能为空");
        }
        return (Map<String, Object>) changes;
    }
}
