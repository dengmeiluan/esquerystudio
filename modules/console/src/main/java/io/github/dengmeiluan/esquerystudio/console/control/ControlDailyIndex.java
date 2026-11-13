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

package io.github.dengmeiluan.esquerystudio.console.control;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestHighLevelClient;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 控制集群「按日环形索引」公共机制（20260922 统一只用控制集群 ES 单载体约定）：
 * 审计（{@code EsConsoleOpsAuditStore}）与监控快照（{@code MonitorSnapshotRecorder}）
 * 共用的日期命名、契约建索引体与容错 ensure——一套机制两个消费方，杜绝复制漂移。
 *
 * <p><b>契约</b>：索引名 {@code <前缀>-yyyy.MM.dd}（宿主本地时区日界，运维直觉可读）；
 * 建索引体 = 显式 mapping（调用方给）+ {@code number_of_replicas:0}（日志环形数据，
 * 单副本可接受——环形本身即滚动丢弃语义）+ {@code refresh_interval:30s}（不要求实时可见，
 * 段更大更少=查询更快）；6.x 目标 typeless 400 后 typed 形态重试（与
 * {@link ControlIndexInitializer} 兜底同构）；「已存在」按 error.type 结构化判据幂等吞掉。</p>
 *
 * @author aicoding
 */
public final class ControlDailyIndex {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 日界格式（宿主本地时区：按运维直觉的本地日切分）。yyyy.MM.dd 字典序=时间序，环形选删可直接利用。 */
    public static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyy.MM.dd").withLocale(Locale.ROOT);

    /** ES 对「索引已存在」的 error.type 取值——幂等判据落在这个结构化位置，不落在消息文本上。 */
    private static final String ALREADY_EXISTS_TYPE = "resource_already_exists_exception";

    private ControlDailyIndex() {
    }

    /** 事件时间 → 日期索引名（{@code 前缀-yyyy.MM.dd}）；zone 显式入参=测点可钉。 */
    public static String datedIndexName(String prefix, long epochMs, ZoneId zone) {
        return prefix + "-" + DAY_FMT.format(Instant.ofEpochMilli(epochMs).atZone(zone).toLocalDate());
    }

    /** 建索引体（settings+mapping 组装，包外可测）：契约形态在此锁死。 */
    public static String createBodyJson(String mappingJson) throws Exception {
        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("number_of_replicas", 0);
        settings.put("refresh_interval", "30s");
        @SuppressWarnings("unchecked")
        Map<String, Object> mapping = MAPPER.readValue(mappingJson, Map.class);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("settings", settings);
        body.put("mappings", mapping);
        return MAPPER.writeValueAsString(body);
    }

    /**
     * 幂等确保日期索引存在。已存在=静默成功；疑似 6.x（typeless 400）按 typed 形态重试一次；
     * 其余失败原样上抛——由调用方决定降级语义（审计=节流告警后文档照写动态映射兜底）。
     */
    public static void ensure(RestHighLevelClient client, String index, String mappingJson) throws Exception {
        try {
            putIndex(client, index, mappingJson, false);
        } catch (ResponseException e) {
            if (ALREADY_EXISTS_TYPE.equals(errorType(e))) {
                return; /* 幂等成功：跨重启重复建当日索引无害 */
            }
            if (e.getResponse().getStatusLine().getStatusCode() == 400) {
                putIndex(client, index, mappingJson, true);
                return;
            }
            throw e;
        }
    }

    private static void putIndex(RestHighLevelClient client, String index, String mappingJson,
                                 boolean typed) throws Exception {
        @SuppressWarnings("unchecked")
        Map<String, Object> body = MAPPER.readValue(createBodyJson(mappingJson), Map.class);
        if (typed) {
            body.put("mappings", Collections.singletonMap("_doc", body.remove("mappings")));
        }
        Request req = new Request("PUT", "/" + index);
        req.setJsonEntity(MAPPER.writeValueAsString(body));
        client.getLowLevelClient().performRequest(req);
    }

    /** 从 {@link ResponseException} 响应体解析 error.type；解析不出返回 null（宁多抛不误吞）。 */
    public static String errorType(ResponseException e) {
        try {
            String body = org.apache.http.util.EntityUtils.toString(e.getResponse().getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> root = MAPPER.readValue(body, Map.class);
            Object error = root.get("error");
            Object type = error instanceof Map ? ((Map<?, ?>) error).get("type") : null;
            return type == null ? null : String.valueOf(type);
        } catch (Exception ignored) {
            return null;
        }
    }
}
