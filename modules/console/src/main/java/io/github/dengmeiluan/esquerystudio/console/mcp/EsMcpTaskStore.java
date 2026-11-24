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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.http.util.EntityUtils;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestHighLevelClient;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * 控制集群 ES 版任务台账（{@code console.store=control-es}，默认）。
 *
 * <p>每个任务一条文档（{@code _doc/{taskId}}）；取消请求用 {@code _update} 只写
 * {@code cancelRequestedAtMs} 字段，不会覆盖执行实例正在写的状态快照。
 * 索引名默认 {@code esquerystudio_mcp_tasks}。</p>
 */
public class EsMcpTaskStore implements McpTaskStore {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final Supplier<RestHighLevelClient> controlClient;
    private final String index;

    public EsMcpTaskStore(Supplier<RestHighLevelClient> controlClient, String index) {
        this.controlClient = controlClient;
        this.index = index == null || index.trim().isEmpty() ? "esquerystudio_mcp_tasks" : index.trim();
    }

    @Override
    public void save(Map<String, Object> record) {
        Object id = record == null ? null : record.get("taskId");
        if (id == null) throw new IllegalArgumentException("task record without taskId");
        try {
            /* 用 _update doc 合并而不是整文档 PUT：其他实例写的 cancelRequestedAtMs
               不会被执行实例的心跳覆盖丢失。 */
            Request req = new Request("POST", "/" + index + "/_update/" + id);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("doc", record);
            body.put("doc_as_upsert", true);
            req.setJsonEntity(MAPPER.writeValueAsString(body));
            controlClient.get().getLowLevelClient().performRequest(req);
        } catch (Exception e) {
            throw new IllegalStateException("保存 MCP 任务失败(es): " + e.getMessage(), e);
        }
    }

    @Override
    public Map<String, Object> get(String taskId) {
        if (taskId == null || taskId.isEmpty()) return null;
        try {
            Request req = new Request("GET", "/" + index + "/_doc/" + taskId);
            Response resp = controlClient.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(EntityUtils.toString(resp.getEntity()), Map.class);
            Object source = raw.get("_source");
            if (!(source instanceof Map)) return null;
            @SuppressWarnings("unchecked")
            Map<String, Object> out = new LinkedHashMap<>((Map<String, Object>) source);
            return out;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) return null;
            throw new IllegalStateException("读取 MCP 任务失败(es): " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("读取 MCP 任务失败(es): " + e.getMessage(), e);
        }
    }

    @Override
    public List<Map<String, Object>> recent(int limit) {
        int size = Math.max(1, Math.min(limit <= 0 ? 50 : limit, 200));
        try {
            Request req = new Request("POST", "/" + index + "/_search");
            req.setJsonEntity("{\"size\":" + size
                    + ",\"query\":{\"match_all\":{}},\"sort\":[{\"lastUpdatedAtMs\":{\"order\":\"desc\"}}]}");
            Response resp = controlClient.get().getLowLevelClient().performRequest(req);
            Map<String, Object> raw = MAPPER.readValue(EntityUtils.toString(resp.getEntity()), Map.class);
            Object hits = raw.get("hits");
            if (!(hits instanceof Map)) return Collections.emptyList();
            Object list = ((Map<?, ?>) hits).get("hits");
            if (!(list instanceof List)) return Collections.emptyList();
            List<Map<String, Object>> out = new ArrayList<>();
            for (Object hit : (List<?>) list) {
                Object source = hit instanceof Map ? ((Map<?, ?>) hit).get("_source") : null;
                if (source instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> row = new LinkedHashMap<>((Map<String, Object>) source);
                    out.add(row);
                }
            }
            return out;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) return Collections.emptyList();
            throw new IllegalStateException("列出 MCP 任务失败(es): " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("列出 MCP 任务失败(es): " + e.getMessage(), e);
        }
    }

    @Override
    public void requestCancel(String taskId) {
        if (taskId == null || taskId.isEmpty()) return;
        try {
            Request req = new Request("POST", "/" + index + "/_update/" + taskId);
            req.setJsonEntity("{\"doc\":{\"cancelRequestedAtMs\":" + System.currentTimeMillis()
                    + "},\"doc_as_upsert\":true}");
            controlClient.get().getLowLevelClient().performRequest(req);
        } catch (Exception e) {
            throw new IllegalStateException("写入 MCP 取消请求失败(es): " + e.getMessage(), e);
        }
    }

    @Override
    public boolean isCancelRequested(String taskId) {
        Map<String, Object> record = get(taskId);
        return record != null && record.get("cancelRequestedAtMs") != null;
    }

    @Override
    public void clear(String taskId) {
        if (taskId == null || taskId.isEmpty()) return;
        try {
            Request req = new Request("DELETE", "/" + index + "/_doc/" + taskId);
            controlClient.get().getLowLevelClient().performRequest(req);
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() != 404) {
                throw new IllegalStateException("清理 MCP 任务失败(es): " + e.getMessage(), e);
            }
        } catch (Exception e) {
            throw new IllegalStateException("清理 MCP 任务失败(es): " + e.getMessage(), e);
        }
    }
}
