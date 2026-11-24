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

package io.github.dengmeiluan.esquerystudio.console.web;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * -C2：ES 错误透传的统一口径（状态码映射 + message 组装），供控制台各端点异常处理复用。
 *
 * <p>为什么必须把 ES 原始报错体带给前端：RestHighLevelClient 的 {@code ResponseException#getMessage()}
 * 内含 ES 返回的完整 JSON（{@code error.root_cause[].reason}），前端 {@code utils/esError.ts:friendlyEsError}
 * 正是从中提取 reason 映射友好文案（如 {@code index_not_found_exception} → 「索引不存在」）。
 * 若在后端把它换成「操作失败」类无信息文案，或让它落到宿主 {@code GlobalWebExceptionHandler}
 * 被拍平成「内部错误:traceId」，前端就只剩一句无从下手的提示。</p>
 *
 * @author aicoding
 */
public final class EsErrorMapper {

    /** ES 侧失败（索引不存在 / 语法错 / 连接异常等）的统一 code。 */
    public static final String CODE_ES_ERROR = "ES_ERROR";

    /** message 上限：bulk 逐条 failure 这类报错体可达数十 KB，截断防前端弹层与日志爆量（root_cause 总在体首，不会被截掉）。 */
    static final int MAX_MESSAGE_LEN = 2000;

    private static final String TRUNCATED_SUFFIX = "...(truncated)";

    /** 错误体内的内网拓扑指纹归一（992）：URL（RHLC message 内嵌 host 形态）与
     *  节点坐标脱敏；坐标两形态——ES 分片坐标 [host:port] 与 Apache 连接失败
     *  [host/ip:port]（994 补）；裸「IPv4:port」保留（连接异常的诊断粒度，既有契约锁）。
     *  root_cause 语义保留（前端 friendlyEsError 链路不受影响）。 */
    private static final java.util.regex.Pattern TOPOLOGY_URL =
            java.util.regex.Pattern.compile("https?://[\\w.\\-]+(?::\\d{1,5})?");
    private static final java.util.regex.Pattern TOPOLOGY_BRACKET_HOST =
            java.util.regex.Pattern.compile("\\[[\\w.\\-]+(?:/[\\w.\\-]+)*:\\d{1,5}\\]");

    private static final String REDACTED_HOST = "[redacted-host]";

    /** 剥错误体内的完整 URL 与节点坐标：VIEWER 级只读端点错误体同样可达，ES message
     *  内嵌的集群地址不随响应外发；诊断仍可凭 code+reason+裸地址粒度定位。 */
    public static String sanitizeTopology(String message) {
        if (message == null || message.isEmpty()) {
            return message;
        }
        String out = TOPOLOGY_URL.matcher(message).replaceAll(REDACTED_HOST);
        out = TOPOLOGY_BRACKET_HOST.matcher(out).replaceAll(REDACTED_HOST);
        return out;
    }

    private EsErrorMapper() {
    }

    /**
     * 异常 → HTTP 状态码：ES 端 4xx（索引不存在=404、DSL 非法=400）原样透传，不拉平成 500 误导成本服务故障；
     * ES 端 5xx 与网络类 IO 故障映射 502（上游故障）；其余未知异常 500。
     */
    public static int httpStatusOf(Throwable e) {
        /* 控制器里用 ResponseStatusException 表达「已判定的拒绝」（PIT/SQL cursor 归属、
           作业归属等）：其状态码就是业务语义，不能被通用兜底拉平成 500（前端会误判为
           服务端故障并重试）。 */
        if (e instanceof org.springframework.web.server.ResponseStatusException) {
            return ((org.springframework.web.server.ResponseStatusException) e).getStatus().value();
        }
        if (e instanceof org.elasticsearch.client.ResponseException) {
            return normalize(((org.elasticsearch.client.ResponseException) e)
                    .getResponse().getStatusLine().getStatusCode());
        }
        if (e instanceof org.elasticsearch.ElasticsearchStatusException) {
            return normalize(((org.elasticsearch.ElasticsearchStatusException) e).status().getStatus());
        }
        if (e instanceof java.io.IOException || e instanceof org.elasticsearch.ElasticsearchException) {
            return 502;
        }
        return 500;
    }

    private static int normalize(int esStatus) {
        return esStatus >= 400 && esStatus < 500 ? esStatus : 502;
    }

    /** 异常 → 前端可读 message：{@code 异常类名: 原始报错体}（含 ES root_cause），超长截断；
     *  内网地址/端口统一脱敏（root_cause 语义不受影响）。 */
    public static String describe(Throwable e) {
        if (e instanceof org.springframework.web.server.ResponseStatusException) {
            /* reason 是给人看的业务文案（如 PIT 归属提示）；不要暴露
               "ResponseStatusException: 403 FORBIDDEN" 这类框架串。 */
            String reason = ((org.springframework.web.server.ResponseStatusException) e).getReason();
            if (reason != null && !reason.trim().isEmpty()) {
                return sanitizeTopology(reason.trim());
            }
        }
        String msg = e.getMessage();
        String full = e.getClass().getSimpleName() + (msg == null || msg.isEmpty() ? "" : ": " + msg);
        full = sanitizeTopology(full);
        return full.length() <= MAX_MESSAGE_LEN ? full : full.substring(0, MAX_MESSAGE_LEN) + TRUNCATED_SUFFIX;
    }

    /**
     * 统一错误体：{@code error} 供前端 api.ts 的 200-with-error 分支识别，{@code code} 供精确分流，
     * {@code message} 供 friendlyEsError 提取 reason。
     */
    public static Map<String, Object> body(String code, String message) {
        return body(code, message, null);
    }

    /**
     * 统一错误体（带 {@code endpoint} 上下文）：endpoint = {@code METHOD requestURI}，
     * 供前端/运维一眼定位是哪个端点失败。endpoint 为空白时不输出该键（两参旧口径响应形状逐字节不变）。
     */
    public static Map<String, Object> body(String code, String message, String endpoint) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("error", true);
        b.put("code", code);
        b.put("message", message);
        if (endpoint != null && !endpoint.trim().isEmpty()) {
            b.put("endpoint", endpoint);
        }
        return b;
    }

    /** ES 异常的标准错误体。 */
    public static Map<String, Object> esErrorBody(Throwable e) {
        return body(CODE_ES_ERROR, describe(e));
    }

    /** ES 异常的标准错误体（带 endpoint 上下文）。 */
    public static Map<String, Object> esErrorBody(Throwable e, String endpoint) {
        return body(CODE_ES_ERROR, describe(e), endpoint);
    }

    /**
     * endpoint 上下文串组装：{@code method + " " + requestURI}。
     * request 缺失/字段为空时宁缺勿炸——返回 null（错误体不含 endpoint 键），绝不抛异常。
     */
    public static String endpointOf(javax.servlet.http.HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String method = request.getMethod();
        String uri = request.getRequestURI();
        boolean hasMethod = method != null && !method.trim().isEmpty();
        boolean hasUri = uri != null && !uri.trim().isEmpty();
        if (hasMethod && hasUri) {
            return method + " " + uri;
        }
        return hasMethod ? method : (hasUri ? uri : null);
    }
}
