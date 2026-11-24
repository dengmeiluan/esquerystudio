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

import java.util.LinkedHashMap;
import java.util.Map;

/**
 *  配置门禁——单条校验问题。
 *
 * <p>三层来源（layer）：</p>
 * <ul>
 *   <li>{@code LINT}    —— L1 静态检查（结构 / 拼写 / 类型白名单 / 引用完整性 / 参数配对），不碰 ES</li>
 *   <li>{@code DRYRUN}  —— L2 临时索引试建，ES 服务端原生裁决</li>
 *   <li>{@code ADVISOR} —— L3 最佳实践建议（不阻断）</li>
 * </ul>
 *
 * <p>severity：{@code ERROR}（建索引必失败，挡启动/挡向导）、{@code WARN}（疑点，L2 最终裁决）、
 * {@code INFO}（建议）。path 为 JSON 定位路径（如 {@code mappings.properties.title.analyzer}），
 * 前端据此在编辑器里高亮。</p>
 *
 * @author aicoding
 */
public class ConfigIssue {

    public static final String LAYER_LINT = "LINT";
    public static final String LAYER_DRYRUN = "DRYRUN";
    public static final String LAYER_ADVISOR = "ADVISOR";

    public static final String ERROR = "ERROR";
    public static final String WARN = "WARN";
    public static final String INFO = "INFO";

    private final String layer;
    private final String severity;
    /** 机器可读错误码，如 UNKNOWN_FIELD_TYPE / ANALYZER_UNDEFINED / TYPE_NAME_WRAPPER */
    private final String code;
    /** JSON 定位路径；无法定位时为空串 */
    private final String path;
    private final String message;
    /** 修复建议（可空），含 did-you-mean */
    private final String suggestion;
    /** 机器可执行修复动作（可空）：{action: REMOVE_SETTING, key: 相对键}。
     前端据此渲染「一键移除」按钮——识别≠擅自动配置，执行前有确认门。
     action 是可扩展枚举，REMOVE_SETTING 是第一种（未知/被拒的 settings 键）。 */
    private final Map<String, String> fix;

    /** 修复动作常量：从 settings 移除指定键（key 为剥 index./settings. 前缀后的相对键） */
    public static final String FIX_REMOVE_SETTING = "REMOVE_SETTING";

    /** 修复动作常量：向 settings 补充指定键（key 相对键 + value 建议值）。
     典型产生点：dry-run 报 ngram 等 index 级限制键缺失（源索引带着该键建成的，
     粘贴期望配置整体替换后丢失），ES 错误文本自带键名与可解出的建议值。 */
    public static final String FIX_ADD_SETTING = "ADD_SETTING";

    private ConfigIssue(String layer, String severity, String code, String path, String message, String suggestion) {
        this(layer, severity, code, path, message, suggestion, null);
    }

    private ConfigIssue(String layer, String severity, String code, String path, String message, String suggestion,
                        Map<String, String> fix) {
        this.layer = layer;
        this.severity = severity;
        this.code = code;
        this.path = path == null ? "" : path;
        this.message = message;
        this.suggestion = suggestion;
        this.fix = fix;
    }

    /** 返回携带修复动作的等价新实例（本类不可变，copy-on-write） */
    public ConfigIssue withFix(String action, String key) {
        Map<String, String> f = new LinkedHashMap<>();
        f.put("action", action);
        f.put("key", key);
        return new ConfigIssue(layer, severity, code, path, message, suggestion, f);
    }

    /** 同 {@link #withFix(String, String)}，带建议值（ADD_SETTING 类动作的 value）。 */
    public ConfigIssue withFix(String action, String key, String value) {
        Map<String, String> f = new LinkedHashMap<>();
        f.put("action", action);
        f.put("key", key);
        f.put("value", value);
        return new ConfigIssue(layer, severity, code, path, message, suggestion, f);
    }

    public static ConfigIssue error(String layer, String code, String path, String message, String suggestion) {
        return new ConfigIssue(layer, ERROR, code, path, message, suggestion);
    }

    public static ConfigIssue warn(String layer, String code, String path, String message, String suggestion) {
        return new ConfigIssue(layer, WARN, code, path, message, suggestion);
    }

    public static ConfigIssue info(String layer, String code, String path, String message, String suggestion) {
        return new ConfigIssue(layer, INFO, code, path, message, suggestion);
    }

    public boolean isError() {
        return ERROR.equals(severity);
    }

    public String getLayer() {
        return layer;
    }

    public String getSeverity() {
        return severity;
    }

    public String getCode() {
        return code;
    }

    public String getPath() {
        return path;
    }

    public String getMessage() {
        return message;
    }

    public String getSuggestion() {
        return suggestion;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("layer", layer);
        m.put("severity", severity);
        m.put("code", code);
        m.put("path", path);
        m.put("message", message);
        if (suggestion != null && !suggestion.isEmpty()) {
            m.put("suggestion", suggestion);
        }
        if (fix != null) {
            m.put("fix", new LinkedHashMap<>(fix));
        }
        return m;
    }

    @Override
    public String toString() {
        return "[" + layer + "/" + severity + "] " + code + (path.isEmpty() ? "" : " @" + path) + ": " + message;
    }
}
