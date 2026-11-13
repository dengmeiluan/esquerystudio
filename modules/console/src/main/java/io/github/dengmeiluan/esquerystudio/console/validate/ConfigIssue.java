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

    private ConfigIssue(String layer, String severity, String code, String path, String message, String suggestion) {
        this.layer = layer;
        this.severity = severity;
        this.code = code;
        this.path = path == null ? "" : path;
        this.message = message;
        this.suggestion = suggestion;
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
        return m;
    }

    @Override
    public String toString() {
        return "[" + layer + "/" + severity + "] " + code + (path.isEmpty() ? "" : " @" + path) + ": " + message;
    }
}
