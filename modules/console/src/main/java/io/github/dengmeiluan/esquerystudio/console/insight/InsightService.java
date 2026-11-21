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

package io.github.dengmeiluan.esquerystudio.console.insight;

import io.github.dengmeiluan.esquerystudio.console.insight.analyzer.SettingsChangeAnalyzer;

import java.util.Map;

/**
 *  现场智能门面：InsightController 与各分析器之间的路由层。
 *
 * <p>（.1）只挂 settings 变更分析；.2+ 的诊断/故障分析器在此扩展，
 * Controller 契约保持稳定。</p>
 *
 * @author aicoding
 */
public class InsightService {

    private final SettingsChangeAnalyzer settingsChangeAnalyzer;

    public InsightService(SettingsChangeAnalyzer settingsChangeAnalyzer) {
        this.settingsChangeAnalyzer = settingsChangeAnalyzer;
    }

    /** 现场①：settings 变更影响分析（只读零副作用）。 */
    public Map<String, Object> settingsImpact(String index, Map<String, Object> changes) {
        if (index == null || index.trim().isEmpty()) {
            throw new IllegalArgumentException("index 必填");
        }
        if (changes == null || changes.isEmpty()) {
            throw new IllegalArgumentException("changes 必填且不能为空");
        }
        return settingsChangeAnalyzer.analyze(index.trim(), changes);
    }
}
