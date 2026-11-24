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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.adhoc.AdhocRebuildService;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter;
import org.junit.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public class McpControllerTest {

    private static class FakeAdmin extends EsIndexAdmin {
        String lastSearchBody;
        String lastExplainBody;
        String lastRaw;
        String lastRawBody;
        String lastRawGuarded;
        String lastRawGuardedBody;
        String lastCreateIndex;
        String lastCreateSettings;
        String lastCreateMappings;
        String lastAliasBody;
        String lastTemplateKind;
        String lastTemplateName;
        String lastTemplateBody;
        String lastUpdateByQueryIndex;
        String lastUpdateByQueryBody;
        String lastDeleteByQueryBody;
        String lastReindexBody;
        String lastAnalyzeIndex;
        String lastAnalyzeBody;
        Map<String, String> lastBatchOpts;
        String lastClusterSettingsBody;
        String lastRerouteBody;
        boolean lastRerouteDryRun;
        boolean lastRerouteExplain;
        boolean lastRerouteRetry;
        String lastSnapshotRepo;
        String lastSnapshotName;
        String lastSnapshotBody;
        String lastIlmPolicyName;
        String lastIlmPolicyBody;
        String lastScriptId;
        String lastScriptBody;
        String lastTaskId;
        String lastValidateBody;
        String lastTermFields;
        String lastSearchTemplateBody;
        String lastAllocationBody;
        String lastShardStatus;
        String lastSlmPolicy;
        int lastSampleSize;
        int indexStatsSummaryCalls;
        /** 透传 Cancellable 登记口：由工作线程在 HTTP 请求发出后回调（取消接线测试用）。 */
        volatile java.util.function.Consumer<org.elasticsearch.client.Cancellable> lastHttpAttach;

        FakeAdmin() { super(null); }

        @Override
        public Map<String, Object> raw(String method, String path, String body) {
            lastRaw = method + " " + path;
            lastRawBody = body;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("path", path);
            return out;
        }

        @Override
        public Map<String, Object> rawGuarded(String method, String path, String body) {
            lastRawGuarded = method + " " + path;
            lastRawGuardedBody = body;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("path", path);
            return out;
        }

        /** 可取消透传与同步透传同桩：登记口记录了就触发（供 abort 接线测试），不连真实 ES。 */
        @Override
        public Map<String, Object> rawCancellable(String method, String path, String body, boolean guarded,
                java.util.function.Consumer<org.elasticsearch.client.Cancellable> onAttach) {
            lastHttpAttach = onAttach;
            return guarded ? rawGuarded(method, path, body) : raw(method, path, body);
        }

        @Override
        public List<Map<String, Object>> nodesStatsBrief() {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("nodeId", "n1");
            node.put("name", "node-1");
            node.put("host", "10.0.0.1");
            node.put("heapPct", 42);
            return Collections.singletonList(node);
        }

        @Override
        public Map<String, Object> indexStatsSummary(String index) {
            indexStatsSummaryCalls++;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index", index);
            out.put("trimmed", Boolean.TRUE);
            return out;
        }

        @Override
        public void createIndex(String index, String settingsJson, String mappingJson) {
            lastCreateIndex = index;
            lastCreateSettings = settingsJson;
            lastCreateMappings = mappingJson;
        }

        @Override
        public boolean createIndexChecked(String index, String settingsJson, String mappingJson) {
            createIndex(index, settingsJson, mappingJson);
            return true;
        }

        @Override
        public boolean deleteIndexChecked(String index) {
            lastCreateIndex = index;
            return true;
        }

        @Override
        public Map<String, Object> aliasActions(String body) {
            lastAliasBody = body;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> putTemplate(String kind, String name, String bodyJson) {
            lastTemplateKind = kind;
            lastTemplateName = name;
            lastTemplateBody = bodyJson;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> putTemplateAdmin(String kind, String name, String bodyJson) {
            return putTemplate(kind, name, bodyJson);
        }

        @Override
        public Map<String, Object> updateByQuery(String index, String body, Map<String, String> opts) {
            lastUpdateByQueryIndex = index;
            lastUpdateByQueryBody = body;
            lastBatchOpts = opts;
            return Collections.<String, Object>singletonMap("updated", 2);
        }

        @Override
        public Map<String, Object> deleteByQuery(String index, String body, Map<String, String> opts) {
            lastDeleteByQueryBody = body;
            lastBatchOpts = opts;
            return Collections.<String, Object>singletonMap("deleted", 1);
        }

        @Override
        public Map<String, Object> reindexAdvanced(String body, Map<String, String> opts) {
            lastReindexBody = body;
            lastBatchOpts = opts;
            return Collections.<String, Object>singletonMap("created", 2);
        }

        @Override
        public Map<String, Object> analyze(String index, String bodyJson) {
            lastAnalyzeIndex = index;
            lastAnalyzeBody = bodyJson;
            return Collections.<String, Object>singletonMap("tokens", Collections.emptyList());
        }

        @Override
        public Map<String, Object> getClusterSettings() {
            return Collections.<String, Object>singletonMap("persistent", Collections.emptyMap());
        }

        @Override
        public Map<String, Object> putClusterSettings(String bodyJson) {
            lastClusterSettingsBody = bodyJson;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> clusterReroute(String bodyJson, boolean dryRun, boolean explain, boolean retryFailed) {
            lastRerouteBody = bodyJson;
            lastRerouteDryRun = dryRun;
            lastRerouteExplain = explain;
            lastRerouteRetry = retryFailed;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public java.util.List<Map<String, Object>> listSnapshotRepositories() {
            Map<String, Object> repo = new LinkedHashMap<>();
            repo.put("name", "repo1");
            repo.put("settings", Collections.singletonMap("access_key", "secret"));
            return Collections.singletonList(repo);
        }

        @Override
        public java.util.List<Map<String, Object>> listSnapshots(String repo) {
            lastSnapshotRepo = repo;
            return Collections.singletonList(Collections.<String, Object>singletonMap("snapshot", "s1"));
        }

        @Override
        public Map<String, Object> snapshotStatus(String repo, String name) {
            lastSnapshotRepo = repo;
            lastSnapshotName = name;
            return Collections.<String, Object>singletonMap("snapshots", Collections.emptyList());
        }

        @Override
        public Map<String, Object> createSnapshot(String repo, String name, String bodyJson) {
            lastSnapshotRepo = repo;
            lastSnapshotName = name;
            lastSnapshotBody = bodyJson;
            return Collections.<String, Object>singletonMap("accepted", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> deleteSnapshot(String repo, String name) {
            lastSnapshotRepo = repo;
            lastSnapshotName = name;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> restoreSnapshot(String repo, String name, String bodyJson) {
            lastSnapshotRepo = repo;
            lastSnapshotName = name;
            lastSnapshotBody = bodyJson;
            return Collections.<String, Object>singletonMap("accepted", Boolean.TRUE);
        }

        @Override
        public java.util.List<Map<String, Object>> listIlmPolicies() {
            return Collections.singletonList(Collections.<String, Object>singletonMap("name", "policy1"));
        }

        @Override
        public Map<String, Object> explainIlm(String index) {
            return Collections.<String, Object>singletonMap("index", index);
        }

        @Override
        public Map<String, Object> putIlmPolicy(String name, String bodyJson) {
            lastIlmPolicyName = name;
            lastIlmPolicyBody = bodyJson;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> deleteIlmPolicy(String name) {
            lastIlmPolicyName = name;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> ilmMove(String index, String body) {
            lastIlmPolicyName = index;
            lastIlmPolicyBody = body;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> ilmStart() {
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> ilmStop() {
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> ilmStatus() {
            return Collections.<String, Object>singletonMap("operation_mode", "RUNNING");
        }

        @Override
        public Map<String, Object> listStoredScripts() {
            return Collections.<String, Object>singletonMap("count", 1);
        }

        @Override
        public Map<String, Object> putStoredScript(String id, String body) {
            lastScriptId = id;
            lastScriptBody = body;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> deleteStoredScript(String id) {
            lastScriptId = id;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> taskDetail(String taskId) {
            lastTaskId = taskId;
            return Collections.<String, Object>singletonMap("task", taskId);
        }

        @Override
        public Map<String, Object> validateQuery(String index, String body) {
            lastValidateBody = body;
            return Collections.<String, Object>singletonMap("valid", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> termVectors(String index, String id, String fields) {
            lastTermFields = fields;
            return Collections.<String, Object>singletonMap("term_vectors", Collections.emptyMap());
        }

        @Override
        public Map<String, Object> searchTemplate(String index, String body) {
            lastSearchTemplateBody = body;
            return Collections.<String, Object>singletonMap("hits", Collections.emptyMap());
        }

        @Override
        public Map<String, Object> renderTemplate(String body) {
            lastSearchTemplateBody = body;
            return Collections.<String, Object>singletonMap("template_output", Collections.emptyMap());
        }

        @Override
        public Map<String, Object> inspect(String index, int sampleSize) {
            lastSampleSize = sampleSize;
            return Collections.<String, Object>singletonMap("name", index);
        }

        @Override
        public Map<String, Object> allocationExplain(String bodyJson) {
            lastAllocationBody = bodyJson;
            return Collections.<String, Object>singletonMap("index", "research");
        }

        @Override
        public Map<String, Object> shardStores(String index, String status) {
            lastShardStatus = status;
            return Collections.<String, Object>singletonMap("indices", Collections.emptyMap());
        }

        @Override
        public Map<String, Object> pendingTasks() {
            return Collections.<String, Object>singletonMap("tasks", Collections.emptyList());
        }

        @Override
        public Map<String, Object> slmPolicies() {
            return Collections.<String, Object>singletonMap("policies", Collections.emptyMap());
        }

        @Override
        public Map<String, Object> slmStatus() {
            return Collections.<String, Object>singletonMap("status", Collections.emptyMap());
        }

        @Override
        public Map<String, Object> slmExecute(String policyId) {
            lastSlmPolicy = policyId;
            return Collections.<String, Object>singletonMap("acknowledged", Boolean.TRUE);
        }

        @Override
        public Map<String, Object> putDoc(String index, String id, String body, String refresh) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index", index);
            out.put("id", id);
            out.put("body", body);
            return out;
        }

        @Override
        public List<Map<String, Object>> listClusterIndices() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("index", "research_report");
            return Collections.singletonList(row);
        }

        @Override
        public Map<String, Object> clusterHealth() {
            return Collections.<String, Object>singletonMap("status", "green");
        }

        @Override
        public Map<String, Object> getMappingDetail(String index) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index", index);
            out.put("fields", Collections.emptyList());
            return out;
        }

        @Override
        public Map<String, Object> searchDsl(String index, String bodyJson, boolean explain, boolean profile) {
            lastSearchBody = bodyJson;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index", index);
            out.put("explain", explain);
            out.put("profile", profile);
            return out;
        }

        @Override
        public Map<String, Object> explainDoc(String index, String id, String body) {
            lastExplainBody = body;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("index", index);
            out.put("id", id);
            return out;
        }
    }

    private McpController controller() {
        return new McpController(new FakeAdmin(), "secret");
    }

    @Test
    public void httpMappingRoutesJsonRpcThroughMockMvc() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller()).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        ObjectMapper mapper = new ObjectMapper();
        MvcResult ok = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":11,\"method\":\"initialize\"}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = mapper.readTree(ok.getResponse().getContentAsString());
        assertEquals("2026-07-28", body.path("result").path("protocolVersion").asText());
        assertEquals(11, body.path("id").asInt());
        MvcResult legacy = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":13,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-06-18\"}}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode legacyBody = mapper.readTree(legacy.getResponse().getContentAsString());
        assertEquals("2025-06-18", legacyBody.path("result").path("protocolVersion").asText());
        MvcResult old = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":15,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\"}}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode oldBody = mapper.readTree(old.getResponse().getContentAsString());
        assertEquals("2024-11-05", oldBody.path("result").path("protocolVersion").asText());
        MvcResult unknown = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":16,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2099-01-01\"}}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode unknownBody = mapper.readTree(unknown.getResponse().getContentAsString());
        assertEquals("2025-06-18", unknownBody.path("result").path("protocolVersion").asText());
        MvcResult discover = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":14,\"method\":\"server/discover\"}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode discoverBody = mapper.readTree(discover.getResponse().getContentAsString());
        assertEquals("2025-11-25", discoverBody.path("result").path("supportedVersions").get(1).asText());
        assertTrue(discoverBody.path("result").path("supportedVersions").toString().contains("2024-11-05"));
        assertEquals("ESQueryStudio", discoverBody.path("result").path("serverInfo").path("name").asText());
        assertTrue(discoverBody.path("result").path("capabilities").path("extensions")
                .has("io.modelcontextprotocol/tasks"));
        MvcResult denied = mvc.perform(post("/mcp").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Request-Id", "trace-denied-1")
                        .content("{\"jsonrpc\":\"2.0\",\"id\":12,\"method\":\"ping\"}"))
                .andExpect(status().isUnauthorized())
                .andReturn();
        assertEquals(401, denied.getResponse().getStatus());
        /* 认证失败也要能用同一个 requestId 对上日志，排查「key 配错」时不必猜时间窗。 */
        assertEquals("trace-denied-1", denied.getResponse().getHeader("X-Request-Id"));
    }

    @Test
    public void mountPathIsConfigurableInsteadOfBeingHardcodedToBareMcp() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        String rpc = "{\"jsonrpc\":\"2.0\",\"id\":31,\"method\":\"server/discover\"}";

        MockMvc project = MockMvcBuilders.standaloneSetup(controller())
                .addPlaceholderValue("esquerystudio.mcp.path", "/esmcp").build();
        MvcResult ok = project.perform(post("/esmcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON).content(rpc))
                .andExpect(status().isOk()).andReturn();
        JsonNode body = mapper.readTree(ok.getResponse().getContentAsString());
        assertEquals("server/discover must echo the mounted path instead of a hardcoded /mcp",
                "/esmcp", body.path("result").path("endpoint").asText());

        MockMvc custom = MockMvcBuilders.standaloneSetup(controller())
                .addPlaceholderValue("esquerystudio.mcp.path", "/esq/rpc").build();
        custom.perform(post("/esq/rpc")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON).content(rpc))
                .andExpect(status().isOk());
        custom.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON).content(rpc))
                .andExpect(status().isNotFound());
    }

    @Test
    public void tasksExtensionIsOptInAndReturnsDurableCompletedTask() throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller()).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        ObjectMapper mapper = new ObjectMapper();
        MvcResult created = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":20,\"method\":\"tools/call\",\"params\":{\"name\":\"es_batch\",\"arguments\":{\"action\":\"reindex\",\"body\":{\"source\":{\"index\":\"probe\"},\"dest\":{\"index\":\"probe_copy\"}}},\"_meta\":{\"io.modelcontextprotocol/clientCapabilities\":{\"extensions\":{\"io.modelcontextprotocol/tasks\":{}}}}}}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode createBody = mapper.readTree(created.getResponse().getContentAsString());
        assertEquals("task", createBody.path("result").path("resultType").asText());
        String taskId = createBody.path("result").path("taskId").asText();
        assertTrue(taskId.length() > 10);
        /* Tasks 扩展先回任务身份，执行在工作池；客户端断线也能续传结果。
           极快工具可能在首份快照前就完成（CI 实测 completed<working 竞态）——
           契约是「立即返回 task」而不是「状态必须仍为 working」，两种首态都合法，
           终态统一由 awaitTask 断言。 */
        String firstStatus = createBody.path("result").path("status").asText();
        assertTrue("first snapshot must be working or completed, was " + firstStatus,
                "working".equals(firstStatus) || "completed".equals(firstStatus));
        JsonNode task = awaitTask(mvc, mapper, taskId);
        assertEquals("completed", task.path("status").asText());
        assertTrue(task.path("result").path("content").isArray());
    }

    /** 长任务异步化后，测试端按 MCP 客户端的方式轮询到终态。 */
    private JsonNode awaitTask(MockMvc mvc, ObjectMapper mapper, String taskId) throws Exception {
        long deadline = System.currentTimeMillis() + 10_000L;
        JsonNode task = null;
        while (System.currentTimeMillis() < deadline) {
            MvcResult got = mvc.perform(post("/mcp")
                            .header("Authorization", "Bearer secret")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"jsonrpc\":\"2.0\",\"id\":21,\"method\":\"tasks/get\",\"params\":{\"taskId\":\""
                                    + taskId + "\"}}"))
                    .andExpect(status().isOk())
                    .andReturn();
            task = mapper.readTree(got.getResponse().getContentAsString()).path("result");
            String status = task.path("status").asText();
            if (!"working".equals(status)) return task;
            Thread.sleep(20L);
        }
        return task;
    }

    @Test
    public void tasksCancelStopsExecutionAndReturnsCancelledView() throws Exception {
        /* 真实慢工具：重写 FakeAdmin 的 reindex 让工作线程阻塞，cancel 才有可取消的对象；
           用快到瞬间完成的任务测取消只会测到「已完成不可回滚」这条正确语义。 */
        FakeAdmin slow = new FakeAdmin() {
            @Override
            public Map<String, Object> reindexAdvanced(String body, Map<String, String> opts) {
                try {
                    Thread.sleep(5_000L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return Collections.<String, Object>singletonMap("created", 2);
            }
        };
        McpController c = new McpController(slow, "secret");
        MockMvc mvc = MockMvcBuilders.standaloneSetup(c).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        ObjectMapper mapper = new ObjectMapper();
        MvcResult created = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":30,\"method\":\"tools/call\",\"params\":{\"name\":\"es_batch\",\"arguments\":{\"action\":\"reindex\",\"body\":{\"source\":{\"index\":\"probe\"},\"dest\":{\"index\":\"probe_copy\"}}},\"_meta\":{\"io.modelcontextprotocol/clientCapabilities\":{\"extensions\":{\"io.modelcontextprotocol/tasks\":{}}}}}}"))
                .andExpect(status().isOk())
                .andReturn();
        String taskId = mapper.readTree(created.getResponse().getContentAsString())
                .path("result").path("taskId").asText();
        assertEquals("working", mapper.readTree(created.getResponse().getContentAsString())
                .path("result").path("status").asText());
        MvcResult cancelled = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":31,\"method\":\"tasks/cancel\",\"params\":{\"taskId\":\""
                                + taskId + "\"}}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode view = mapper.readTree(cancelled.getResponse().getContentAsString()).path("result");
        assertEquals(taskId, view.path("taskId").asText());
        assertEquals("cancelled", view.path("status").asText());
        assertEquals("CLIENT", view.path("cancelReason").asText());
        /* 取消幂等：重复 cancel 仍是 cancelled，不会翻成 completed。 */
        MvcResult again = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":32,\"method\":\"tasks/cancel\",\"params\":{\"taskId\":\""
                                + taskId + "\"}}"))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals("cancelled", mapper.readTree(again.getResponse().getContentAsString())
                .path("result").path("status").asText());
        /* 真中断：工作线程被打断后任务不会被翻回 completed。 */
        Thread.sleep(120L);
        MvcResult after = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":33,\"method\":\"tasks/get\",\"params\":{\"taskId\":\""
                                + taskId + "\"}}"))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals("cancelled", mapper.readTree(after.getResponse().getContentAsString())
                .path("result").path("status").asText());
    }

    @Test
    public void mrtrConfirmsDestructiveWritesOnlyWhenClientDeclaresElicitation() {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "mrtr");
        req.put("method", "tools/call");
        Map<String, Object> meta = new LinkedHashMap<>();
        Map<String, Object> caps = new LinkedHashMap<>();
        caps.put("elicitation", new LinkedHashMap<String, Object>());
        meta.put("io.modelcontextprotocol/clientCapabilities", caps);
        req.put("_meta", meta);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_batch");
        params.put("arguments", args("action", "delete_by_query", "index", "probe",
                "query", Collections.singletonMap("match_all", Collections.emptyMap())));
        req.put("params", params);

        Map<String, Object> first = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        Map<?, ?> firstResult = (Map<?, ?>) first.get("result");
        assertEquals("input_required", firstResult.get("resultType"));
        assertEquals("elicitation/create", ((Map<?, ?>) ((Map<?, ?>) firstResult.get("inputRequests"))
                .get("confirm")).get("method"));
        String state = String.valueOf(firstResult.get("requestState"));
        assertTrue(state.length() > 20);
        assertNull("confirmation must not execute the delete", admin.lastDeleteByQueryBody);

        Map<String, Object> declineParams = new LinkedHashMap<>(params);
        Map<String, Object> decline = new LinkedHashMap<>();
        Map<String, Object> declineConfirm = new LinkedHashMap<>();
        declineConfirm.put("action", "decline");
        decline.put("confirm", declineConfirm);
        declineParams.put("inputResponses", decline);
        declineParams.put("requestState", state);
        req.put("params", declineParams);
        Map<String, Object> declined = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        String declinedText = String.valueOf(((Map<?, ?>) ((List<?>) ((Map<?, ?>) declined.get("result"))
                .get("content")).get(0)).get("text"));
        assertTrue(declinedText.contains("已取消"));
        assertNull("decline must not execute the delete", admin.lastDeleteByQueryBody);

        /* 重新发起一次，拿到新的 state 后同意执行。 */
        req.put("params", params);
        Map<String, Object> again = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        String freshState = String.valueOf(((Map<?, ?>) again.get("result")).get("requestState"));
        Map<String, Object> acceptParams = new LinkedHashMap<>(params);
        Map<String, Object> accept = new LinkedHashMap<>();
        Map<String, Object> acceptConfirm = new LinkedHashMap<>();
        acceptConfirm.put("action", "accept");
        acceptConfirm.put("content", Collections.singletonMap("confirm", true));
        accept.put("confirm", acceptConfirm);
        acceptParams.put("inputResponses", accept);
        acceptParams.put("requestState", freshState);
        req.put("params", acceptParams);
        Map<String, Object> accepted = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        Map<?, ?> acceptedResult = (Map<?, ?>) accepted.get("result");
        assertEquals(Boolean.FALSE, acceptedResult.get("isError"));
        assertNotNull("accept must execute the delete", admin.lastDeleteByQueryBody);

        Map<String, Object> tampered = new LinkedHashMap<>(acceptParams);
        tampered.put("requestState", freshState + "x");
        req.put("params", tampered);
        Map<String, Object> rejected = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        assertNotNull(rejected.get("error"));
        assertEquals(-32602, ((Number) ((Map<?, ?>) rejected.get("error")).get("code")).intValue());
    }

    /** MRTR 回执嵌 arguments 正控：部分 2026 客户端把 inputResponses/requestState 塞进
        params.arguments 而非 params 顶层——验签按剥净后的业务参数摘要进行，确认后成功
        执行且两键不透传给工具（修复前嵌套形态验签恒 -32602）。 */
    @Test
    public void mrtrAcceptsResponsesEmbeddedInArguments() {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "mrtr-embedded");
        req.put("method", "tools/call");
        Map<String, Object> meta = new LinkedHashMap<>();
        Map<String, Object> caps = new LinkedHashMap<>();
        caps.put("elicitation", new LinkedHashMap<String, Object>());
        meta.put("io.modelcontextprotocol/clientCapabilities", caps);
        req.put("_meta", meta);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_batch");
        params.put("arguments", args("action", "delete_by_query", "index", "probe",
                "query", Collections.singletonMap("match_all", Collections.emptyMap())));
        req.put("params", params);

        Map<String, Object> first = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        String state = String.valueOf(((Map<?, ?>) first.get("result")).get("requestState"));
        assertNull("confirmation must not execute the delete", admin.lastDeleteByQueryBody);

        /* 回执：inputResponses/requestState 嵌在 arguments 里（而非 params 顶层）。 */
        Map<String, Object> embeddedArgs = new LinkedHashMap<>((Map<String, Object>) params.get("arguments"));
        Map<String, Object> accept = new LinkedHashMap<>();
        Map<String, Object> acceptConfirm = new LinkedHashMap<>();
        acceptConfirm.put("action", "accept");
        acceptConfirm.put("content", Collections.singletonMap("confirm", true));
        accept.put("confirm", acceptConfirm);
        embeddedArgs.put("inputResponses", accept);
        embeddedArgs.put("requestState", state);
        Map<String, Object> embeddedParams = new LinkedHashMap<>(params);
        embeddedParams.put("arguments", embeddedArgs);
        req.put("params", embeddedParams);

        Map<String, Object> accepted = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        Map<?, ?> acceptedResult = (Map<?, ?>) accepted.get("result");
        assertEquals("embedded responses must pass digest verification and execute",
                Boolean.FALSE, acceptedResult.get("isError"));
        assertNotNull("accept must execute the delete", admin.lastDeleteByQueryBody);
    }

    @Test
    public void discoveryRequiresBearerTokenAndListsReadOnlyTools() {
        McpController c = controller();
        assertEquals(401, c.discover(null).getStatusCodeValue());
        ResponseEntity<Map<String, Object>> ok = c.discover("Bearer secret");
        assertEquals(200, ok.getStatusCodeValue());
        List<?> tools = (List<?>) ok.getBody().get("tools");
        assertTrue(tools.size() >= 5);
        assertNotNull(ok.getBody().get("capabilities"));
        assertTrue(String.valueOf(ok.getBody().get("instructions")).contains("es_connections"));
        assertEquals(17, ((List<?>) ok.getBody().get("recommendedTools")).size());
        assertEquals(17, ok.getBody().get("maxRecommendedTools"));
    }

    @Test
    public void discoveryNoLongerAdvertisesSseTransport() {
        /* 单轨传输：Streamable HTTP（POST /mcp）是唯一 HTTP 传输；发现面不再出现 SSE 提示。 */
        McpController c = controller();
        Map<String, Object> body = c.discover("Bearer secret").getBody();
        assertFalse(body.containsKey("sseEndpoint"));
        assertFalse(body.containsKey("messageEndpoint"));
    }

    @Test
    public void toolsCarryReadOnlyAndDestructiveAnnotations() {
        McpController c = controller();
        List<?> tools = (List<?>) c.discover("Bearer secret").getBody().get("tools");
        Map<String, Map<?, ?>> byName = new LinkedHashMap<>();
        for (Object item : tools) {
            Map<?, ?> tool = (Map<?, ?>) item;
            byName.put(String.valueOf(tool.get("name")), tool);
        }
        Map<?, ?> readAnnotations = (Map<?, ?>) byName.get("es_search").get("annotations");
        assertEquals(Boolean.TRUE, readAnnotations.get("readOnlyHint"));
        assertEquals(Boolean.FALSE, readAnnotations.get("destructiveHint"));
        Map<?, ?> deleteAnnotations = (Map<?, ?>) byName.get("es_indices").get("annotations");
        assertEquals(Boolean.FALSE, deleteAnnotations.get("readOnlyHint"));
        assertEquals(Boolean.TRUE, deleteAnnotations.get("destructiveHint"));
    }

    @Test
    public void jsonRpcInitializeAndToolsListKeepIds() {
        McpController c = controller();
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 7);
        req.put("method", "initialize");
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        assertEquals("2.0", body.get("jsonrpc"));
        assertEquals(7, body.get("id"));
        assertNotNull(body.get("result"));

        req.put("method", "tools/list");
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        assertEquals(7, body.get("id"));
        assertTrue(((List<?>) ((Map<?, ?>) body.get("result")).get("tools")).size() >= 5);
    }

    @Test
    public void initializeAdvertisesResourcesAndPromptsCapabilities() {
        McpController c = controller();
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 8);
        req.put("method", "initialize");
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        Map<?, ?> result = (Map<?, ?>) body.get("result");
        Map<?, ?> capabilities = (Map<?, ?>) result.get("capabilities");
        assertNotNull(capabilities.get("tools"));
        assertNotNull(capabilities.get("resources"));
        assertNotNull(capabilities.get("prompts"));
        assertEquals(Boolean.FALSE, ((Map<?, ?>) capabilities.get("resources")).get("subscribe"));
        assertTrue(String.valueOf(result.get("instructions")).contains("es_connections"));
        Map<?, ?> extensions = (Map<?, ?>) capabilities.get("extensions");
        assertNotNull(extensions.get("io.modelcontextprotocol/tasks"));
        assertNotNull(extensions.get("io.modelcontextprotocol/ui"));
    }

    @Test
    public void resourcesExposeConnectionCatalogAndIndexDetail() throws Exception {
        McpController c = controller();
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 9);
        req.put("method", "resources/list");
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        List<?> resources = (List<?>) ((Map<?, ?>) body.get("result")).get("resources");
        assertTrue(resources.size() >= 3);
        assertEquals("ui://esquerystudio/tool-console", ((Map<?, ?>) resources.get(0)).get("uri"));
        assertEquals("text/html;profile=mcp-app", ((Map<?, ?>) resources.get(0)).get("mimeType"));
        assertEquals("esquerystudio://connections", ((Map<?, ?>) resources.get(1)).get("uri"));
        assertEquals("连接目录", ((Map<?, ?>) resources.get(1)).get("name"));
        assertEquals("esquerystudio://connection/host", ((Map<?, ?>) resources.get(2)).get("uri"));
        /* resource.name 是客户端 UI 直接展示的字段：必须是人类可读名称，不能是 connection-<id>。 */
        String connectionResourceName = String.valueOf(((Map<?, ?>) resources.get(2)).get("name"));
        assertTrue("connection resource name should be human-readable: " + connectionResourceName,
                connectionResourceName.startsWith("连接 · "));
        assertFalse(connectionResourceName.contains("connection-"));

        req.put("method", "resources/templates/list");
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        List<?> templates = (List<?>) ((Map<?, ?>) body.get("result")).get("resourceTemplates");
        assertEquals(11, templates.size());
        assertEquals("连接详情", ((Map<?, ?>) templates.get(0)).get("name"));
        for (Object template : templates) {
            String name = String.valueOf(((Map<?, ?>) template).get("name"));
            assertFalse("template name should not be a slug: " + name, name.contains("-"));
        }

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("uri", "esquerystudio://index/host/orders/mapping");
        req.put("method", "resources/read");
        req.put("params", params);
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        List<?> contents = (List<?>) ((Map<?, ?>) body.get("result")).get("contents");
        assertEquals(1, contents.size());
        String text = String.valueOf(((Map<?, ?>) contents.get(0)).get("text"));
        JsonNode resourceData = new ObjectMapper().readTree(text);
        assertEquals("orders", resourceData.path("index").asText());
        assertFalse(resourceData.has("content"));

        params.put("uri", "esquerystudio://indices/host");
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        String indicesText = String.valueOf(((Map<?, ?>) ((List<?>) ((Map<?, ?>) body.get("result"))
                .get("contents")).get(0)).get("text"));
        assertTrue(indicesText.contains("research_report"));

        params.put("uri", "esquerystudio://index/host/orders/not-a-resource");
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        assertNotNull(body.get("error"));
        assertEquals(-32602, ((Number) ((Map<?, ?>) body.get("error")).get("code")).intValue());
    }

    @Test
    public void appsExtensionBindsUiResourceToEveryActionTool() {
        McpController c = controller();
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 91);
        req.put("method", "resources/read");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("uri", "ui://esquerystudio/tool-console");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        Map<?, ?> content = (Map<?, ?>) ((List<?>) ((Map<?, ?>) body.get("result")).get("contents")).get(0);
        assertEquals("text/html;profile=mcp-app", content.get("mimeType"));
        assertTrue(String.valueOf(content.get("text")).contains("ESQUERYSTUDIO / MCP APP"));
        Map<?, ?> uiMeta = (Map<?, ?>) ((Map<?, ?>) content.get("_meta")).get("ui");
        assertEquals(Boolean.TRUE, uiMeta.get("prefersBorder"));
        assertNotNull(uiMeta.get("csp"));

        req.put("method", "tools/list");
        req.remove("params");
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        List<?> tools = (List<?>) ((Map<?, ?>) body.get("result")).get("tools");
        assertFalse(tools.isEmpty());
        for (Object tool : tools) {
            Map<?, ?> meta = (Map<?, ?>) ((Map<?, ?>) tool).get("_meta");
            assertNotNull("every action tool must bind the MCP app resource", meta);
            assertEquals("ui://esquerystudio/tool-console",
                    ((Map<?, ?>) meta.get("ui")).get("resourceUri"));
        }
    }

    @Test
    public void promptsExposeGuidedWorkflowsAndValidateArguments() {
        McpController c = controller();
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 10);
        req.put("method", "prompts/list");
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        List<?> prompts = (List<?>) ((Map<?, ?>) body.get("result")).get("prompts");
        assertEquals(McpController.PROMPT_NAMES.size(), prompts.size());
        assertEquals("diagnose_slow_query", ((Map<?, ?>) prompts.get(0)).get("name"));

        Map<String, Object> args = new LinkedHashMap<>();
        args.put("connection", "host");
        args.put("index", "orders");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "diagnose_slow_query");
        params.put("arguments", args);
        req.put("method", "prompts/get");
        req.put("params", params);
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        List<?> messages = (List<?>) ((Map<?, ?>) body.get("result")).get("messages");
        String text = String.valueOf(((Map<?, ?>) ((Map<?, ?>) messages.get(0)).get("content")).get("text"));
        assertTrue(text.contains("`host`"));
        assertTrue(text.contains("`orders`"));

        params.put("arguments", Collections.emptyMap());
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        assertEquals(-32602, ((Number) ((Map<?, ?>) body.get("error")).get("code")).intValue());

        /* 跨云结构同步提示词：引导 7 步工作流（探测→对比→dry-run→校验→执行→迁移→diff 验证）。 */
        Map<String, Object> syncArgs = new LinkedHashMap<>();
        syncArgs.put("srcConnId", "prod-aliyun");
        syncArgs.put("destConnId", "uat-tencent");
        syncArgs.put("sourceIndex", "orders");
        params.put("name", "cross_cloud_structure_sync");
        params.put("arguments", syncArgs);
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        messages = (List<?>) ((Map<?, ?>) body.get("result")).get("messages");
        text = String.valueOf(((Map<?, ?>) ((Map<?, ?>) messages.get(0)).get("content")).get("text"));
        assertTrue(text.contains("`prod-aliyun`"));
        assertTrue(text.contains("`uat-tencent`"));
        assertTrue(text.contains("`orders`"));
        assertTrue(text.contains("compare_capabilities"));
        assertTrue(text.contains("diff_structure"));
    }

    @Test
    public void deployAndConnectPromptMatchesAgentSetupAndAppliesMode() throws Exception {
        McpController c = controller();
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 11);
        req.put("method", "prompts/get");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "deploy_and_connect");
        params.put("arguments", Collections.emptyMap());
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        List<?> messages = (List<?>) ((Map<?, ?>) body.get("result")).get("messages");
        String text = String.valueOf(((Map<?, ?>) ((Map<?, ?>) messages.get(0)).get("content")).get("text"));

        /* 仓库根 AGENT_SETUP.md 的契约正文必须与服务端 prompts/get 默认输出逐字一致。 */
        File md = new File("../../AGENT_SETUP.md");
        if (!md.isFile()) md = new File("AGENT_SETUP.md");
        assertTrue("AGENT_SETUP.md 必须随仓库发布", md.isFile());
        String source = new String(Files.readAllBytes(md.toPath()), StandardCharsets.UTF_8).replace("\r\n", "\n");
        String start = "<!-- AGENT_SETUP:START -->";
        String end = "<!-- AGENT_SETUP:END -->";
        int from = source.indexOf(start);
        int to = source.indexOf(end);
        assertTrue("AGENT_SETUP.md 缺少契约标记", from >= 0 && to > from);
        String expected = source.substring(from + start.length(), to).replaceFirst("^\\n", "").replaceFirst("\\n$", "");
        assertEquals(expected, text);

        Map<String, Object> args = new LinkedHashMap<>();
        args.put("mode", "host");
        args.put("client", "workbuddy");
        args.put("endpoint", "http://quotehub.internal:7788");
        args.put("os", "linux");
        params.put("arguments", args);
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        messages = (List<?>) ((Map<?, ?>) body.get("result")).get("messages");
        String hostText = String.valueOf(((Map<?, ?>) ((Map<?, ?>) messages.get(0)).get("content")).get("text"));
        assertTrue(hostText.contains("嵌入现有 Spring Boot 宿主"));
        assertTrue(hostText.contains("http://quotehub.internal:7788/quotehub/esmcp"));
        assertTrue(hostText.contains("客户端：workbuddy"));
        assertTrue(hostText.contains("操作系统：linux"));
    }

    @Test
    public void completionCompleteSuggestsVisibleConnectionIds() {
        McpController c = controller();
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 13);
        req.put("method", "completion/complete");
        Map<String, Object> argument = new LinkedHashMap<>();
        argument.put("name", "connection");
        argument.put("value", "ho");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("ref", Collections.singletonMap("type", "ref/prompt"));
        params.put("argument", argument);
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        List<?> values = (List<?>) ((Map<?, ?>) ((Map<?, ?>) body.get("result")).get("completion")).get("values");
        assertTrue(values.contains("host"));
        assertEquals(1, values.size());

        argument.put("name", "index");
        argument.put("value", "res");
        body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        values = (List<?>) ((Map<?, ?>) ((Map<?, ?>) body.get("result")).get("completion")).get("values");
        assertTrue(values.contains("research_report"));
        assertEquals(1, values.size());
    }

    @Test
    public void resourceReadRespectsKeyToolAllowlistAndConnectionReadPermission() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("host", Collections.singletonList("read"));
        String secret = (String) store.create("mapping-only", "alice", "VIEWER",
                Collections.singletonList("es_get_mapping"), Collections.singletonList("host"),
                Collections.singletonList("read"), scoped, 60, 100, 100, null).get("secret");
        McpController c = new McpController(new FakeAdmin(), "", new McpAccessService(store));

        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 11);
        req.put("method", "resources/read");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("uri", "esquerystudio://index/host/orders/mapping");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer " + secret, req).getBody();
        assertNotNull(body.get("result"));

        params.put("uri", "esquerystudio://index/host/orders");
        body = (Map<String, Object>) c.rpc("Bearer " + secret, req).getBody();
        assertNotNull(body.get("error"));
        assertTrue(String.valueOf(((Map<?, ?>) body.get("error")).get("message")).contains("es_get_settings"));
    }

    @Test
    public void resourceReadCountsAgainstKeyQuotaAsItsOwnRequestKind() {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("host", Collections.singletonList("read"));
        String secret = (String) store.create("resource-quota", "alice", "VIEWER",
                Collections.singletonList("es_get_mapping"), Collections.singletonList("host"),
                Collections.singletonList("read"), scoped, 60, 1, 10, null).get("secret");
        McpController c = new McpController(new FakeAdmin(), "", new McpAccessService(store));

        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 12);
        req.put("method", "resources/read");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("uri", "esquerystudio://index/host/orders/mapping");
        req.put("params", params);

        ResponseEntity<?> first = c.rpc("Bearer " + secret, req);
        assertEquals(200, first.getStatusCodeValue());
        assertNotNull(((Map<?, ?>) first.getBody()).get("result"));
        ResponseEntity<?> second = c.rpc("Bearer " + secret, req);
        assertEquals(429, second.getStatusCodeValue());
        assertEquals("MCP_DAILY_QUOTA_EXCEEDED",
                ((Map<?, ?>) ((Map<?, ?>) second.getBody()).get("error")).get("data"));
    }

    @Test
    public void searchAndExplainAcceptAQueryObjectOrAFullBodyString() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");

        /* 组面调用：es_search 组的 search action，其余参数原样透传。 */
        Map<String, Object> searchArgs = new LinkedHashMap<>();
        searchArgs.put("action", "search");
        searchArgs.put("index", "research_report");
        searchArgs.put("query", "{\"query\":{\"term\":{\"status\":\"published\"}},\"size\":99}");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_search");
        params.put("arguments", searchArgs);
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 1);
        req.put("method", "tools/call");
        req.put("params", params);
        c.rpc("Bearer secret", req);

        JsonNode searchBody = new ObjectMapper().readTree(admin.lastSearchBody);
        assertEquals("published", searchBody.path("query").path("term").path("status").asText());
        assertEquals("schema default size is 10", 10, searchBody.path("size").asInt());

        Map<String, Object> fullBody = new LinkedHashMap<>();
        fullBody.put("aggs", Collections.singletonMap("by_status", Collections.singletonMap("terms",
                Collections.singletonMap("field", "status"))));
        fullBody.put("sort", Collections.singletonList(Collections.singletonMap("created_at", "desc")));
        params.put("name", "es_search");
        params.put("arguments", args("action", "search", "index", "research_report", "body", fullBody, "size", 2,
                "query", Collections.singletonMap("term", Collections.singletonMap("status", "published"))));
        req.put("id", 3);
        c.rpc("Bearer secret", req);
        JsonNode fullSearchBody = new ObjectMapper().readTree(admin.lastSearchBody);
        assertEquals("published", fullSearchBody.path("query").path("term").path("status").asText());
        assertEquals(2, fullSearchBody.path("size").asInt());
        assertTrue(fullSearchBody.has("aggs"));
        assertTrue(fullSearchBody.has("sort"));

        Map<String, Object> explainArgs = new LinkedHashMap<>();
        explainArgs.put("action", "explain");
        explainArgs.put("index", "research_report");
        explainArgs.put("id", "doc-1");
        explainArgs.put("query", "{\"query\":{\"term\":{\"status\":\"published\"}}}");
        params.put("name", "es_search");
        params.put("arguments", explainArgs);
        req.put("id", 2);
        c.rpc("Bearer secret", req);

        JsonNode explainBody = new ObjectMapper().readTree(admin.lastExplainBody);
        assertEquals("published", explainBody.path("query").path("term").path("status").asText());
    }

    @Test
    public void toolFailureIsAnMcpResultNotAProtocolError() {
        McpController c = controller();
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_unknown_tool");
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "bad-tool");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        assertNull(body.get("error"));
        Map<?, ?> result = (Map<?, ?>) body.get("result");
        assertEquals(true, result.get("isError"));
        assertTrue(((String) ((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text")).contains("Unknown tool"));
    }

    @Test
    public void toolCallReturnsTextContentAndIsReadOnly() {
        McpController c = controller();
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_indices");
        params.put("arguments", args("action", "list"));
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "call-1");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
        Map<?, ?> result = (Map<?, ?>) body.get("result");
        assertEquals(false, result.get("isError"));
        assertTrue(((String) ((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text")).contains("research_report"));
        Map<?, ?> structured = (Map<?, ?>) result.get("structuredContent");
        assertTrue(((List<?>) structured.get("result")).size() > 0);
    }

    @Test
    public void nodesAndIndexStatsToolsUseUnguardedRawForAdminAndTrimmedViewForViewer() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController adminController = new McpController(admin, "secret");
        callTool(adminController, "Bearer secret", "es_list_nodes", Collections.emptyMap());
        assertTrue(admin.lastRaw.endsWith(" /_cat/nodes?format=json"));
        callTool(adminController, "Bearer secret", "es_get_index_stats",
                Collections.<String, Object>singletonMap("index", "research_report"));
        assertTrue(admin.lastRaw.endsWith(" /research_report/_stats"));
        assertEquals(0, admin.indexStatsSummaryCalls);

        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String viewerSecret = (String) store.create("viewer", "alice", "VIEWER",
                Arrays.asList("es_list_nodes", "es_get_index_stats"),
                Collections.singletonList("host"), Collections.singletonList("read"),
                60, 100, 100, null).get("secret");
        McpController viewerController = new McpController(admin, "", new McpAccessService(store));
        JsonNode nodes = callTool(viewerController, "Bearer " + viewerSecret, "es_list_nodes",
                Collections.emptyMap());
        assertTrue(nodes.isArray());
        assertFalse(nodes.get(0).has("host"));

        JsonNode stats = callTool(viewerController, "Bearer " + viewerSecret, "es_get_index_stats",
                Collections.<String, Object>singletonMap("index", "research_report"));
        assertEquals(1, admin.indexStatsSummaryCalls);
        assertTrue(stats.path("trimmed").asBoolean());
    }

    @Test
    public void perConnectionPermissionsAllowQaWriteWhileProdStaysReadOnly() throws Exception {
        McpKeyRecord record = new McpKeyRecord();
        record.permissions = Collections.singletonList("read");
        record.connectionPermissions.put("qa", Arrays.asList("read", "write"));
        record.connectionPermissions.put("prod", Collections.singletonList("read"));
        assertTrue(record.canWrite("qa"));
        assertTrue(record.canRead("qa"));
        assertFalse(record.canWrite("prod"));
        assertTrue(record.canRead("prod"));
        assertTrue(record.hasAnyWrite());

        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("host", Collections.singletonList("read"));
        String secret = (String) store.create("raw-read", "alice", "VIEWER",
                Collections.singletonList("es_rest"), Collections.singletonList("host"),
                Collections.singletonList("read"), scoped, 60, 100, 100, null).get("secret");
        McpController controller = new McpController(new FakeAdmin(), "", new McpAccessService(store));

        Map<String, Object> scope = controller.discover("Bearer " + secret).getBody();
        assertEquals("VIEWER", scope.get("role"));
        assertTrue(((Map<?, ?>) scope.get("connectionPermissions")).containsKey("host"));

        JsonNode read = callTool(controller, "Bearer " + secret, "es_rest",
                args("method", "GET", "path", "/research_report/_count"));
        assertEquals("/research_report/_count", read.path("path").asText());

        String write = callToolRaw(controller, "Bearer " + secret, "es_rest",
                args("method", "PUT", "path", "/probe/_doc/1", "body", Collections.singletonMap("a", 1)));
        assertTrue(write.contains("read-only"));

        Map<String, List<String>> rw = new LinkedHashMap<>();
        rw.put("host", Arrays.asList("read", "write"));
        String adminSecret = (String) store.create("admin-raw", "root", "ADMIN",
                Collections.singletonList("es_rest"), Collections.singletonList("host"),
                Collections.singletonList("read"), rw, 60, 100, 100, null).get("secret");
        McpController adminController = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        JsonNode allowedWrite = callTool(adminController, "Bearer " + adminSecret, "es_rest",
                args("method", "PUT", "path", "/probe/_doc/1", "body", Collections.singletonMap("a", 1)));
        assertEquals("/probe/_doc/1", allowedWrite.path("path").asText());

        /* 写-only key 也应拿到动态读写的 es_rest；是否可读由目标连接的 read 权限在执行面判定。 */
        String writeOnlySecret = (String) store.create("raw-write-only", "bob", "OPERATOR",
                Collections.singletonList("es_rest"), Collections.singletonList("host"),
                Collections.singletonList("write"), 60, 100, 100, null).get("secret");
        McpController writeOnlyController = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        JsonNode writeOnly = callTool(writeOnlyController, "Bearer " + writeOnlySecret, "es_rest",
                args("method", "PUT", "path", "/probe/_doc/2", "body", Collections.singletonMap("a", 2)));
        assertEquals("/probe/_doc/2", writeOnly.path("path").asText());
    }

    @Test
    public void operatorKeysCannotSeeOrCallAdminOnlySystemTools() throws Exception {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("host", Arrays.asList("read", "write"));
        String operatorSecret = (String) store.create("ops", "alice", "OPERATOR",
                Arrays.asList("es_list_indices", "es_put_watch", "es_cluster_state", "es_put_slm_policy"),
                Collections.singletonList("host"), Arrays.asList("read", "write"), scoped,
                60, 100, 100, null).get("secret");
        FakeAdmin admin = new FakeAdmin();
        McpController controller = new McpController(admin, "", new McpAccessService(store));

        List<?> tools = (List<?>) controller.discover("Bearer " + operatorSecret).getBody().get("tools");
        List<String> names = new java.util.ArrayList<>();
        for (Object tool : tools) names.add(String.valueOf(((Map<?, ?>) tool).get("name")));
        assertTrue(names.contains("es_indices"));
        assertFalse(names.contains("es_automation"));
        assertFalse(names.contains("es_lifecycle"));
        Map<String, Object> operatorDiscovery = controller.discover("Bearer " + operatorSecret).getBody();
        assertEquals(Collections.singletonList("es_indices"), operatorDiscovery.get("recommendedTools"));
        assertEquals(1, ((Number) operatorDiscovery.get("maxRecommendedTools")).intValue());

        String denied = callToolRaw(controller, "Bearer " + operatorSecret, "es_put_watch",
                args("id", "w1", "body", Collections.singletonMap("trigger", Collections.emptyMap())));
        assertTrue(denied, denied.contains("not allowed"));
        assertNull(admin.lastRaw);

        FakeAdmin adminFake = new FakeAdmin();
        String adminSecret = (String) store.create("root-ops", "root", "ADMIN",
                Collections.singletonList("es_put_watch"), Collections.singletonList("host"),
                Arrays.asList("read", "write"), scoped, 60, 100, 100, null).get("secret");
        McpController adminController = new McpController(adminFake, "", new McpAccessService(store));
        List<?> adminTools = (List<?>) adminController.discover("Bearer " + adminSecret).getBody().get("tools");
        List<String> adminNames = new java.util.ArrayList<>();
        for (Object tool : adminTools) adminNames.add(String.valueOf(((Map<?, ?>) tool).get("name")));
        assertTrue(adminNames.contains("es_automation"));
        Map<String, Object> adminDiscovery = adminController.discover("Bearer " + adminSecret).getBody();
        assertEquals(Collections.singletonList("es_automation"), adminDiscovery.get("recommendedTools"));
        assertEquals(1, ((Number) adminDiscovery.get("maxRecommendedTools")).intValue());
        callTool(adminController, "Bearer " + adminSecret, "es_automation",
                args("action", "watch_put", "id", "w1", "body", Collections.singletonMap("trigger", Collections.emptyMap())));
        assertEquals("PUT /_watcher/watch/w1", adminFake.lastRaw);
    }

    @Test
    public void indexLifecycleToolsAreRegisteredAndDispatchWritePayloads() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");
        List<?> tools = (List<?>) c.discover("Bearer secret").getBody().get("tools");
        List<String> names = new java.util.ArrayList<>();
        for (Object tool : tools) names.add(String.valueOf(((Map<?, ?>) tool).get("name")));
        assertTrue(names.contains("es_indices"));
        assertTrue(names.contains("es_templates"));
        Map<?, ?> indexGroup = null;
        for (Object tool : tools) {
            Map<?, ?> item = (Map<?, ?>) tool;
            if ("es_indices".equals(item.get("name"))) indexGroup = item;
        }
        assertNotNull(indexGroup);
        Map<?, ?> indexActions = (Map<?, ?>) ((Map<?, ?>) ((Map<?, ?>) indexGroup.get("inputSchema")).get("properties"))
                .get("action");
        List<?> actionValues = (List<?>) indexActions.get("enum");
        for (String action : Arrays.asList("create", "delete", "put_mapping", "update_settings", "alias",
                "rollover", "force_merge")) {
            assertTrue(action + " must be registered", actionValues.contains(action));
        }

        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("number_of_shards", 1);
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("title", Collections.singletonMap("type", "text"));
        Map<String, Object> mapping = Collections.<String, Object>singletonMap("properties", properties);
        JsonNode created = callTool(c, "Bearer secret", "es_indices",
                args("action", "create", "index", "probe", "settings", settings, "mappings", mapping));
        assertTrue(created.path("acknowledged").asBoolean());
        assertEquals("probe", admin.lastCreateIndex);
        assertEquals(1, new ObjectMapper().readTree(admin.lastCreateSettings).path("number_of_shards").asInt());
        assertTrue(admin.lastCreateMappings.contains("\"properties\""));
        JsonNode deleted = callTool(c, "Bearer secret", "es_delete_index", args("index", "probe"));
        assertTrue(deleted.path("acknowledged").asBoolean());

        callTool(c, "Bearer secret", "es_alias", args("actions", Collections.singletonList(
                Collections.singletonMap("add", args("index", "probe", "alias", "probe_alias")))));
        assertTrue(admin.lastAliasBody.startsWith("{\"actions\":["));

        callTool(c, "Bearer secret", "es_put_template", args(
                "name", "tpl", "kind", "component", "template", mapping));
        assertEquals("component", admin.lastTemplateKind);
        assertEquals("tpl", admin.lastTemplateName);
        assertTrue(admin.lastTemplateBody.contains("\"properties\""));
    }

    @Test
    public void dataStreamComponentTemplateAndIndexTopologyToolsDispatchGuardedPaths() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");

        JsonNode streams = callTool(c, "Bearer secret", "es_list_data_streams", args());
        assertEquals("/_data_stream", streams.path("path").asText());
        callTool(c, "Bearer secret", "es_get_data_stream", args("name", "logs-*"));
        assertEquals("GET /_data_stream/logs-*", admin.lastRaw);
        callTool(c, "Bearer secret", "es_data_stream_stats", args("name", "logs-*"));
        assertEquals("GET /_data_stream/logs-*/_stats", admin.lastRaw);
        callTool(c, "Bearer secret", "es_create_data_stream", args("name", "logs-app"));
        assertEquals("PUT /_data_stream/logs-app", admin.lastRaw);
        callTool(c, "Bearer secret", "es_delete_data_stream", args("name", "logs-app"));
        assertEquals("DELETE /_data_stream/logs-app", admin.lastRaw);
        callTool(c, "Bearer secret", "es_list_component_templates", args());
        assertEquals("GET /_component_template", admin.lastRaw);

        Map<String, Object> body = Collections.<String, Object>singletonMap("settings",
                Collections.singletonMap("number_of_shards", 1));
        callTool(c, "Bearer secret", "es_clone_index", args("index", "orders", "target", "orders-clone", "body", body));
        assertEquals("POST /orders/_clone/orders-clone", admin.lastRaw);
        assertTrue(admin.lastRawBody.contains("number_of_shards"));
        callTool(c, "Bearer secret", "es_shrink_index", args("index", "orders", "target", "orders-shrink"));
        assertEquals("POST /orders/_shrink/orders-shrink", admin.lastRaw);
        callTool(c, "Bearer secret", "es_split_index", args("index", "orders", "target", "orders-split"));
        assertEquals("POST /orders/_split/orders-split", admin.lastRaw);
    }

    @Test
    public void diagnosticsToolsDispatchRecoveryShardsStateSegmentsAndMTermVectors() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");
        callTool(c, "Bearer secret", "es_index_recovery", args("index", "orders"));
        assertEquals("GET /orders/_recovery", admin.lastRaw);
        callTool(c, "Bearer secret", "es_cat_shards", args("index", "orders"));
        assertEquals("GET /_cat/shards/orders?format=json", admin.lastRaw);
        callTool(c, "Bearer secret", "es_cluster_state", args("metrics", "metadata", "index", "orders"));
        assertEquals("GET /_cluster/state/metadata/orders", admin.lastRaw);
        callTool(c, "Bearer secret", "es_mtermvectors", args(
                "index", "orders", "body", Collections.singletonMap("docs", Collections.singletonList(
                        Collections.singletonMap("_id", "1")))));
        assertEquals("POST /orders/_mtermvectors", admin.lastRaw);
        assertTrue(admin.lastRawBody.contains("docs"));
        callTool(c, "Bearer secret", "es_index_segments", args("index", "orders"));
        assertEquals("GET /orders/_segments", admin.lastRaw);
        callTool(c, "Bearer secret", "es_list_transforms", args());
        assertEquals("GET /_transform", admin.lastRaw);
        callTool(c, "Bearer secret", "es_get_transform", args("id", "t1"));
        assertEquals("GET /_transform/t1", admin.lastRaw);
        callTool(c, "Bearer secret", "es_transform_stats", args("id", "t1"));
        assertEquals("GET /_transform/t1/_stats", admin.lastRaw);
        callTool(c, "Bearer secret", "es_put_transform", args("id", "t1", "body",
                Collections.singletonMap("source", Collections.singletonMap("index", "orders"))));
        assertEquals("PUT /_transform/t1", admin.lastRaw);
        assertTrue(admin.lastRawBody.contains("source"));
        callTool(c, "Bearer secret", "es_start_transform", args("id", "t1"));
        assertEquals("POST /_transform/t1/_start", admin.lastRaw);
        callTool(c, "Bearer secret", "es_stop_transform", args("id", "t1"));
        assertEquals("POST /_transform/t1/_stop", admin.lastRaw);
        callTool(c, "Bearer secret", "es_delete_transform", args("id", "t1"));
        assertEquals("DELETE /_transform/t1", admin.lastRaw);
        callTool(c, "Bearer secret", "es_put_ingest_pipeline", args("id", "p1",
                "body", Collections.singletonMap("processors", Collections.emptyList())));
        assertEquals("PUT /_ingest/pipeline/p1", admin.lastRaw);
        assertTrue(admin.lastRawBody.contains("processors"));
        callTool(c, "Bearer secret", "es_delete_ingest_pipeline", args("id", "p1"));
        assertEquals("DELETE /_ingest/pipeline/p1", admin.lastRaw);
        callTool(c, "Bearer secret", "es_put_snapshot_repo", args("repo", "repo1",
                "body", Collections.singletonMap("type", "fs")));
        assertEquals("PUT /_snapshot/repo1", admin.lastRaw);
        assertTrue(admin.lastRawBody.contains("fs"));
        callTool(c, "Bearer secret", "es_delete_snapshot_repo", args("repo", "repo1"));
        assertEquals("DELETE /_snapshot/repo1", admin.lastRaw);
        callTool(c, "Bearer secret", "es_put_slm_policy", args("policyId", "nightly",
                "body", Collections.singletonMap("schedule", "0 30 1 * * ?")));
        assertEquals("PUT /_slm/policy/nightly", admin.lastRaw);
        assertTrue(admin.lastRawBody.contains("schedule"));
        callTool(c, "Bearer secret", "es_delete_slm_policy", args("policyId", "nightly"));
        assertEquals("DELETE /_slm/policy/nightly", admin.lastRaw);
        callTool(c, "Bearer secret", "es_put_watch", args("id", "w1",
                "body", Collections.singletonMap("trigger", Collections.singletonMap("schedule", "*/5 * * * * ?"))));
        assertEquals("PUT /_watcher/watch/w1", admin.lastRaw);
        assertTrue(admin.lastRawBody.contains("trigger"));
        callTool(c, "Bearer secret", "es_execute_watch", args("id", "w1"));
        assertEquals("POST /_watcher/watch/w1/_execute", admin.lastRaw);
        callTool(c, "Bearer secret", "es_delete_watch", args("id", "w1"));
        assertEquals("DELETE /_watcher/watch/w1", admin.lastRaw);
    }

    @Test
    public void batchDataToolsDispatchQueryScriptAndAnalyze() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");
        callTool(c, "Bearer secret", "es_update_by_query", args(
                "index", "probe",
                "query", Collections.singletonMap("term", Collections.singletonMap("status", "draft")),
                "script", Collections.singletonMap("source", "ctx._source.x = 1"),
                "maxDocs", 10));
        JsonNode updateBody = new ObjectMapper().readTree(admin.lastUpdateByQueryBody);
        assertEquals("draft", updateBody.path("query").path("term").path("status").asText());
        assertEquals("ctx._source.x = 1", updateBody.path("script").path("source").asText());
        assertEquals("10", admin.lastBatchOpts.get("maxDocs"));

        callTool(c, "Bearer secret", "es_delete_by_query", args(
                "index", "probe",
                "query", Collections.singletonMap("term", Collections.singletonMap("status", "draft"))));
        assertTrue(admin.lastDeleteByQueryBody.contains("\"query\""));

        callTool(c, "Bearer secret", "es_reindex", args(
                "body", args("source", Collections.singletonMap("index", "probe"),
                        "dest", Collections.singletonMap("index", "probe_copy")),
                "slices", 2));
        assertTrue(admin.lastReindexBody.contains("\"dest\""));
        assertEquals("2", admin.lastBatchOpts.get("slices"));

        callTool(c, "Bearer secret", "es_analyze", args(
                "index", "probe", "body", Collections.singletonMap("analyzer", "standard")));
        assertEquals("probe", admin.lastAnalyzeIndex);
        assertTrue(admin.lastAnalyzeBody.contains("\"analyzer\""));
    }

    @Test
    public void clusterToolsDispatchSnapshotIlmAndScripts() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");
        assertEquals("persistent", callTool(c, "Bearer secret", "es_get_cluster_settings",
                Collections.emptyMap()).fieldNames().next());

        callTool(c, "Bearer secret", "es_update_cluster_settings", args(
                "body", Collections.singletonMap("persistent", Collections.singletonMap("x", "y"))));
        assertTrue(admin.lastClusterSettingsBody.contains("\"persistent\""));

        callTool(c, "Bearer secret", "es_reroute", args(
                "body", Collections.singletonMap("commands", Collections.emptyList()),
                "dryRun", true, "retryFailed", true));
        assertTrue(admin.lastRerouteDryRun);
        assertTrue(admin.lastRerouteExplain);
        assertTrue(admin.lastRerouteRetry);

        JsonNode repos = callTool(c, "Bearer secret", "es_list_snapshot_repos", Collections.emptyMap());
        assertEquals("repo1", repos.get(0).path("name").asText());
        assertEquals("secret", repos.get(0).path("settings").path("access_key").asText());

        JsonNode snapshots = callTool(c, "Bearer secret", "es_list_snapshots",
                Collections.singletonMap("repo", "repo1"));
        assertEquals("s1", snapshots.get(0).path("snapshot").asText());
        callTool(c, "Bearer secret", "es_snapshot_status", args("repo", "repo1", "name", "s1"));
        assertEquals("repo1", admin.lastSnapshotRepo);
        assertEquals("s1", admin.lastSnapshotName);

        callTool(c, "Bearer secret", "es_create_snapshot", args("repo", "repo1", "name", "s2",
                "body", Collections.singletonMap("indices", "research")));
        assertTrue(admin.lastSnapshotBody.contains("\"indices\""));
        callTool(c, "Bearer secret", "es_delete_snapshot", args("repo", "repo1", "name", "s2"));
        callTool(c, "Bearer secret", "es_restore_snapshot", args("repo", "repo1", "name", "s2",
                "body", Collections.singletonMap("rename_pattern", "(.+)")));
        assertTrue(admin.lastSnapshotBody.contains("\"rename_pattern\""));

        JsonNode policies = callTool(c, "Bearer secret", "es_ilm_policies", Collections.emptyMap());
        assertEquals("policy1", policies.get(0).path("name").asText());
        callTool(c, "Bearer secret", "es_ilm_explain", Collections.singletonMap("index", "research"));
        callTool(c, "Bearer secret", "es_put_ilm_policy", args("name", "policy1",
                "policy", Collections.singletonMap("policy", Collections.emptyMap())));
        assertEquals("policy1", admin.lastIlmPolicyName);
        callTool(c, "Bearer secret", "es_delete_ilm_policy", Collections.singletonMap("name", "policy1"));
        callTool(c, "Bearer secret", "es_ilm_move", args("index", "research",
                "body", Collections.singletonMap("current_step", Collections.emptyMap())));
        callTool(c, "Bearer secret", "es_ilm_start", Collections.emptyMap());
        assertEquals("RUNNING", callTool(c, "Bearer secret", "es_ilm_status",
                Collections.emptyMap()).path("operation_mode").asText());

        JsonNode scripts = callTool(c, "Bearer secret", "es_list_scripts", Collections.emptyMap());
        assertEquals(1, scripts.path("count").asInt());
        callTool(c, "Bearer secret", "es_put_script", args("id", "s1",
                "script", Collections.singletonMap("script", Collections.emptyMap())));
        assertEquals("s1", admin.lastScriptId);
        callTool(c, "Bearer secret", "es_delete_script", Collections.singletonMap("id", "s1"));

        JsonNode task = callTool(c, "Bearer secret", "es_task_detail",
                Collections.singletonMap("taskId", "node:1"));
        assertEquals("node:1", task.path("task").asText());
        assertEquals("node:1", admin.lastTaskId);
    }

    @Test
    public void msearchPreservesFullBodies() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");
        List<Object> searches = new java.util.ArrayList<>();
        searches.add(args("index", "research",
                "body", Collections.singletonMap("aggs", Collections.singletonMap("by_status",
                        Collections.singletonMap("terms", Collections.singletonMap("field", "status")))),
                "size", 2));
        callTool(c, "Bearer secret", "es_msearch", args("searches", searches));
        String[] lines = admin.lastRawGuardedBody.split("\\n");
        assertEquals("{\"index\":\"research\"}", lines[0]);
        JsonNode body = new ObjectMapper().readTree(lines[1]);
        assertTrue(body.has("aggs"));
        assertEquals(2, body.path("size").asInt());
        assertEquals("match_all", body.path("query").fieldNames().next());
    }

    @Test
    public void mgetBuildsIdsBody() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");
        callTool(c, "Bearer secret", "es_mget", args("index", "research", "ids", Arrays.asList("1", "2")));
        assertEquals("POST /research/_mget", admin.lastRawGuarded);
        assertEquals("{\"ids\":[\"1\",\"2\"]}", admin.lastRawGuardedBody);
    }

    @Test
    public void diagnosticsAndSlmToolsDispatchPayloads() throws Exception {
        FakeAdmin admin = new FakeAdmin();
        McpController c = new McpController(admin, "secret");
        callTool(c, "Bearer secret", "es_validate_query", args(
                "index", "research",
                "body", Collections.singletonMap("query", Collections.singletonMap("match_all", Collections.emptyMap()))));
        assertTrue(admin.lastValidateBody.contains("\"query\""));

        callTool(c, "Bearer secret", "es_term_vectors", args(
                "index", "research", "id", "1", "fields", "title,body"));
        assertEquals("title,body", admin.lastTermFields);

        callTool(c, "Bearer secret", "es_search_template", args(
                "index", "research", "body", Collections.singletonMap("source", Collections.emptyMap())));
        callTool(c, "Bearer secret", "es_render_template", args(
                "body", Collections.singletonMap("source", Collections.emptyMap())));
        assertTrue(admin.lastSearchTemplateBody.contains("\"source\""));

        callTool(c, "Bearer secret", "es_index_detail", args("index", "research", "sampleSize", 3));
        assertEquals(3, admin.lastSampleSize);

        callTool(c, "Bearer secret", "es_allocation_explain", args(
                "body", Collections.singletonMap("index", "research")));
        assertTrue(admin.lastAllocationBody.contains("\"research\""));

        callTool(c, "Bearer secret", "es_shard_stores", args("index", "research", "status", "red,yellow"));
        assertEquals("red,yellow", admin.lastShardStatus);

        JsonNode pending = callTool(c, "Bearer secret", "es_pending_tasks", Collections.emptyMap());
        assertTrue(pending.path("tasks").isArray());
        callTool(c, "Bearer secret", "es_slm_policies", Collections.emptyMap());
        callTool(c, "Bearer secret", "es_slm_status", Collections.emptyMap());
        callTool(c, "Bearer secret", "es_slm_execute", Collections.singletonMap("policyId", "nightly"));
        assertEquals("nightly", admin.lastSlmPolicy);
    }

    @Test
    public void snapshotRepoSecretsAreMaskedForNonAdminKeys() throws Exception {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String secret = (String) store.create("snap-reader", "alice", "VIEWER",
                Collections.singletonList("es_list_snapshot_repos"), Collections.singletonList("host"),
                Collections.singletonList("read"), 60, 100, 100, null).get("secret");
        McpController c = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        JsonNode repos = callTool(c, "Bearer " + secret, "es_list_snapshot_repos", Collections.emptyMap());
        assertEquals("repo1", repos.get(0).path("name").asText());
        assertEquals("***", repos.get(0).path("settings").path("access_key").asText());
    }

    @Test
    public void writeToolsAreDeniedWithoutWritePermission() throws Exception {
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        String secret = (String) store.create("ro", "alice", "VIEWER",
                Collections.singletonList("es_create_index"), Collections.singletonList("host"),
                Collections.singletonList("read"), 60, 100, 100, null).get("secret");
        McpController c = new McpController(new FakeAdmin(), "", new McpAccessService(store));
        String raw = callToolRaw(c, "Bearer " + secret, "es_create_index",
                args("index", "probe"));
        assertTrue(raw, raw.contains("not allowed"));
    }

    private static String callToolRaw(McpController controller, String auth, String name,
                                      Map<String, Object> arguments) throws Exception {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "call");
        req.put("method", "tools/call");
        req.put("params", groupParams(name, arguments));
        Map<String, Object> body = (Map<String, Object>) controller.rpc(auth, req).getBody();
        Map<?, ?> result = (Map<?, ?>) body.get("result");
        return String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
    }

    private static Map<String, Object> args(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        return out;
    }

    /** 内部路由名（如 es_cluster_health）自动换算成「组 + action」的客户端调用形状。 */
    private static Map<String, Object> groupParams(String name, Map<String, Object> arguments) {
        Map<String, Object> params = new LinkedHashMap<>();
        String qualified = McpController.TOOL_ACTIONS.get(name);
        if (qualified == null) {
            params.put("name", name);
            params.put("arguments", arguments);
            return params;
        }
        int colon = qualified.indexOf(':');
        Map<String, Object> merged = new LinkedHashMap<>();
        merged.put("action", qualified.substring(colon + 1));
        merged.putAll(arguments);
        params.put("name", qualified.substring(0, colon));
        params.put("arguments", merged);
        return params;
    }

    private static JsonNode callTool(McpController controller, String auth, String name,
                                     Map<String, Object> arguments) throws Exception {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "call");
        req.put("method", "tools/call");
        req.put("params", groupParams(name, arguments));
        Map<String, Object> body = (Map<String, Object>) controller.rpc(auth, req).getBody();
        Map<?, ?> result = (Map<?, ?>) body.get("result");
        assertNotNull(result);
        assertEquals(false, result.get("isError"));
        String text = String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
        return new ObjectMapper().readTree(text);
    }
    @Test
    public void compactSurfaceReturnsSmallClientFacingCatalog() {
        McpController controller = new McpController(new FakeAdmin(), "service-token", null);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("surface", "compact");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        try {
            Map<String, Object> listReq = new LinkedHashMap<>();
            listReq.put("jsonrpc", "2.0"); listReq.put("id", 1); listReq.put("method", "tools/list");
            Map<String, Object> body = (Map<String, Object>) controller.rpc("Bearer service-token", listReq).getBody();
            List<?> tools = (List<?>) ((Map<?, ?>) body.get("result")).get("tools");
            assertEquals("compact must keep every action group; only resources/prompts are hidden",
                    McpController.GROUP_TOOL_NAMES.size(), tools.size());
            assertEquals(McpController.GROUP_TOOL_NAMES,
                    ((List<?>) tools).stream().map(tool -> ((Map<?, ?>) tool).get("name")).collect(java.util.stream.Collectors.toList()));

            Map<String, Object> resReq = new LinkedHashMap<>();
            resReq.put("jsonrpc", "2.0"); resReq.put("id", 2); resReq.put("method", "resources/list");
            Map<String, Object> resources = (Map<String, Object>) controller.rpc("Bearer service-token", resReq).getBody();
            assertEquals(0, ((List<?>) ((Map<?, ?>) resources.get("result")).get("resources")).size());

            Map<String, Object> promptReq = new LinkedHashMap<>();
            promptReq.put("jsonrpc", "2.0"); promptReq.put("id", 3); promptReq.put("method", "prompts/list");
            Map<String, Object> prompts = (Map<String, Object>) controller.rpc("Bearer service-token", promptReq).getBody();
            assertEquals(0, ((List<?>) ((Map<?, ?>) prompts.get("result")).get("prompts")).size());
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }
    }

    @Test
    public void adhocToolsFailFastWithoutAdhocService() {
        /* 直建形态（宿主/测试短构造器）不注入 adhocRebuildService：
           六个 adhoc 工具必须以 isError 明确拒绝，而不是 NPE 或伪成功。 */
        McpController c = controller();
        for (String tool : new String[]{"es_adhoc_prepare", "es_adhoc_jobs"}) {
            Map<String, Object> req = new LinkedHashMap<>();
            req.put("jsonrpc", "2.0");
            req.put("id", 21);
            req.put("method", "tools/call");
            Map<String, Object> arguments = new LinkedHashMap<>();
            arguments.put("index", "orders");
            req.put("params", groupParams(tool, arguments));
            Map<String, Object> body = (Map<String, Object>) c.rpc("Bearer secret", req).getBody();
            Map<?, ?> result = (Map<?, ?>) body.get("result");
            assertNotNull(tool + " must return a result, not a protocol error", result);
            assertEquals(tool + " must be an isError result", Boolean.TRUE, result.get("isError"));
            String text = String.valueOf(((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"));
            assertTrue(tool + " must explain the missing service boundary, got: " + text,
                    text.contains("Adhoc rebuild service is not available"));
        }
    }

    @Test
    public void callBudgetAutoAbortsAndReportsCancelReasonDeadline() throws Exception {
        /* 预算注入 120ms（生产默认 180000ms）：到点必须自动掐断，而不是无限期堵住调用方。 */
        FakeAdmin slow = new FakeAdmin() {
            @Override
            public Map<String, Object> reindexAdvanced(String body, Map<String, String> opts) {
                try {
                    Thread.sleep(5_000L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return Collections.<String, Object>singletonMap("created", 2);
            }
        };
        McpController c = new McpController(slow, "secret", null, null, null, 120L);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(c).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        ObjectMapper mapper = new ObjectMapper();
        MvcResult created = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":40,\"method\":\"tools/call\",\"params\":{\"name\":\"es_batch\",\"arguments\":{\"action\":\"reindex\",\"body\":{\"source\":{\"index\":\"probe\"},\"dest\":{\"index\":\"probe_copy\"}}}}}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode result = mapper.readTree(created.getResponse().getContentAsString()).path("result");
        /* 同步调用到点返回结构化错误码，而不是把 HTTP 线程挂死。 */
        assertTrue(result.path("isError").asBoolean());
        assertTrue(result.path("content").get(0).path("text").asText().contains("MCP_CALL_TIMEOUT"));
    }

    @Test
    public void budgetDeadlineMarksTheTaskCancelledWithDeadlineReason() throws Exception {
        FakeAdmin slow = new FakeAdmin() {
            @Override
            public Map<String, Object> reindexAdvanced(String body, Map<String, String> opts) {
                try {
                    Thread.sleep(5_000L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return Collections.<String, Object>singletonMap("created", 2);
            }
        };
        McpController c = new McpController(slow, "secret", null, null, null, 120L);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(c).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        ObjectMapper mapper = new ObjectMapper();
        MvcResult created = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":42,\"method\":\"tools/call\",\"params\":{\"name\":\"es_batch\",\"arguments\":{\"action\":\"reindex\",\"body\":{\"source\":{\"index\":\"probe\"},\"dest\":{\"index\":\"probe_copy\"}}},\"_meta\":{\"io.modelcontextprotocol/clientCapabilities\":{\"extensions\":{\"io.modelcontextprotocol/tasks\":{}}}}}}"))
                .andExpect(status().isOk())
                .andReturn();
        String taskId = mapper.readTree(created.getResponse().getContentAsString())
                .path("result").path("taskId").asText();
        long deadline = System.currentTimeMillis() + 3_000L;
        while (System.currentTimeMillis() < deadline) {
            MvcResult got = mvc.perform(post("/mcp")
                            .header("Authorization", "Bearer secret")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"jsonrpc\":\"2.0\",\"id\":43,\"method\":\"tasks/get\",\"params\":{\"taskId\":\""
                                    + taskId + "\"}}"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode task = mapper.readTree(got.getResponse().getContentAsString()).path("result");
            if ("cancelled".equals(task.path("status").asText())) {
                assertEquals("DEADLINE", task.path("cancelReason").asText());
                return;
            }
            Thread.sleep(20L);
        }
        fail("任务未在预算到点后自动取消");
    }

    @Test
    public void notificationsCancelledStopsTheMatchingInFlightCall() throws Exception {
        FakeAdmin slow = new FakeAdmin() {
            @Override
            public Map<String, Object> reindexAdvanced(String body, Map<String, String> opts) {
                try {
                    Thread.sleep(5_000L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return Collections.<String, Object>singletonMap("created", 2);
            }
        };
        McpController c = new McpController(slow, "secret");
        MockMvc mvc = MockMvcBuilders.standaloneSetup(c).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        ObjectMapper mapper = new ObjectMapper();
        MvcResult created = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .header("X-Request-Id", "cancel-me-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":50,\"method\":\"tools/call\",\"params\":{\"name\":\"es_batch\",\"arguments\":{\"action\":\"reindex\",\"body\":{\"source\":{\"index\":\"probe\"},\"dest\":{\"index\":\"probe_copy\"}}},\"_meta\":{\"io.modelcontextprotocol/clientCapabilities\":{\"extensions\":{\"io.modelcontextprotocol/tasks\":{}}}}}}"))
                .andExpect(status().isOk())
                .andReturn();
        String taskId = mapper.readTree(created.getResponse().getContentAsString())
                .path("result").path("taskId").asText();
        /* 2025/2026 核心取消语义：notifications/cancelled 按请求 id 取消在途调用。 */
        mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .header("X-Request-Id", "cancel-me-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":\"cancel-me-1\"}}"))
                .andExpect(status().isAccepted());
        MvcResult got = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":51,\"method\":\"tasks/get\",\"params\":{\"taskId\":\""
                                + taskId + "\"}}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode task = mapper.readTree(got.getResponse().getContentAsString()).path("result");
        assertEquals("cancelled", task.path("status").asText());
        assertEquals("CLIENT", task.path("cancelReason").asText());
    }

    @Test
    public void pollMethodsStayOutOfTheAuditTrailButCancelDoesNot() throws Exception {
        /* 页面「调用任务」条 1.5s 轮询 tasks/list；若逐条留档，一天数万条把真实调用淹没。
           cancel 是动作，必须留档。 */
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller()).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        ObjectMapper mapper = new ObjectMapper();
        mvc.perform(post("/mcp").header("Authorization", "Bearer secret")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"jsonrpc\":\"2.0\",\"id\":90,\"method\":\"tools/call\",\"params\":{\"name\":\"es_list_indices\",\"arguments\":{}}}"))
                .andExpect(status().isOk());
        for (int i = 0; i < 3; i++) {
            mvc.perform(post("/mcp").header("Authorization", "Bearer secret")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"jsonrpc\":\"2.0\",\"id\":9" + i + ",\"method\":\"tasks/list\",\"params\":{\"limit\":5}}"))
                    .andExpect(status().isOk());
            mvc.perform(post("/mcp").header("Authorization", "Bearer secret")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"jsonrpc\":\"2.0\",\"id\":8" + i + ",\"method\":\"tasks/get\",\"params\":{\"taskId\":\"nope\"}}"))
                    .andExpect(status().isOk());
        }
        MvcResult card = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/mcp")
                        .header("Authorization", "Bearer secret"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode recent = mapper.readTree(card.getResponse().getContentAsString()).path("recentCalls");
        java.util.List<String> methods = new ArrayList<>();
        for (JsonNode row : recent) methods.add(row.path("method").asText());
        assertTrue("tools/call 必须在最近调用里", methods.contains("tools/call"));
        assertFalse("tasks/list 轮询不得写审计", methods.contains("tasks/list"));
        assertFalse("tasks/get 轮询不得写审计", methods.contains("tasks/get"));
    }

    @Test
    public void taskResourcesExposeActiveListAndSingleTaskWithoutResultBody() throws Exception {
        FakeAdmin slow = new FakeAdmin() {
            @Override
            public Map<String, Object> reindexAdvanced(String body, Map<String, String> opts) {
                try {
                    Thread.sleep(600L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return Collections.<String, Object>singletonMap("created", 2);
            }
        };
        McpController c = new McpController(slow, "secret");
        MockMvc mvc = MockMvcBuilders.standaloneSetup(c).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        ObjectMapper mapper = new ObjectMapper();
        MvcResult created = mvc.perform(post("/mcp").header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":85,\"method\":\"tools/call\",\"params\":{\"name\":\"es_batch\",\"arguments\":{\"action\":\"reindex\",\"body\":{\"source\":{\"index\":\"a\"},\"dest\":{\"index\":\"b\"}}},\"_meta\":{\"io.modelcontextprotocol/clientCapabilities\":{\"extensions\":{\"io.modelcontextprotocol/tasks\":{}}}}}}"))
                .andExpect(status().isOk()).andReturn();
        String taskId = mapper.readTree(created.getResponse().getContentAsString())
                .path("result").path("taskId").asText();

        /* 在途任务资源：Agent 断线重连后按 URI 续看，不必回读整屏审计。 */
        MvcResult active = mvc.perform(post("/mcp").header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":86,\"method\":\"resources/read\",\"params\":{\"uri\":\"esquerystudio://tasks/active\"}}"))
                .andExpect(status().isOk()).andReturn();
        String activeText = mapper.readTree(active.getResponse().getContentAsString())
                .path("result").path("contents").get(0).path("text").asText();
        assertTrue("在途资源必须列出刚创建的任务", activeText.contains(taskId));

        MvcResult single = mvc.perform(post("/mcp").header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":87,\"method\":\"resources/read\",\"params\":{\"uri\":\"esquerystudio://task/"
                                + taskId + "\"}}"))
                .andExpect(status().isOk()).andReturn();
        String singleRaw = single.getResponse().getContentAsString();
        JsonNode singleBody = mapper.readTree(singleRaw)
                .path("result").path("contents").get(0);
        assertTrue("单任务资源应返回 contents，实际: " + singleRaw, singleBody != null);
        String singleText = singleBody.path("text").asText();
        assertTrue(singleText.contains("working"));
        assertTrue("单任务资源不下发结果体", !singleText.contains("\"result\":"));

        /* 不存在的任务：JSON-RPC error（资源读取不走 tool isError）。 */
        MvcResult missing = mvc.perform(post("/mcp").header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":88,\"method\":\"resources/read\",\"params\":{\"uri\":\"esquerystudio://task/nope\"}}"))
                .andExpect(status().isOk()).andReturn();
        assertTrue(mapper.readTree(missing.getResponse().getContentAsString()).path("error").isObject());
    }

    @Test
    public void tasksListShowsLiveTaskWithoutResultBody() throws Exception {
        FakeAdmin slow = new FakeAdmin() {
            @Override
            public Map<String, Object> reindexAdvanced(String body, Map<String, String> opts) {
                try {
                    Thread.sleep(600L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return Collections.<String, Object>singletonMap("created", 2);
            }
        };
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new McpController(slow, "secret")).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        ObjectMapper mapper = new ObjectMapper();
        mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":80,\"method\":\"tools/call\",\"params\":{\"name\":\"es_batch\",\"arguments\":{\"action\":\"reindex\",\"body\":{\"source\":{\"index\":\"a\"},\"dest\":{\"index\":\"b\"}}},\"_meta\":{\"io.modelcontextprotocol/clientCapabilities\":{\"extensions\":{\"io.modelcontextprotocol/tasks\":{}}}}}}"))
                .andExpect(status().isOk());
        MvcResult list = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":81,\"method\":\"tasks/list\",\"params\":{\"limit\":10}}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode payload = mapper.readTree(list.getResponse().getContentAsString()).path("result");
        assertTrue(payload.path("count").asInt() >= 1);
        JsonNode first = payload.path("tasks").get(0);
        assertEquals("working", first.path("status").asText());
        assertTrue(first.has("elapsedMs") && first.has("remainingMs"));
        assertTrue("列表不下发结果体", first.path("result").isMissingNode());
        assertEquals(180000L, payload.path("callTimeoutMs").asLong());
        /* 只列该凭证作用域：换一把 key（另一个 owner）看不到。 */
        MvcResult other = mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer other-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"id\":82,\"method\":\"tasks/list\",\"params\":{\"limit\":10}}"))
                .andExpect(status().isUnauthorized())
                .andReturn();
        assertEquals(401, other.getResponse().getStatus());
    }

    @Test
    public void aClientWithoutTasksCanCancelItsSyncCallByRequestId() throws Exception {
        /* 普通客户端（不声明 Tasks）也会发核心 notifications/cancelled；同步路径必须进台账，
           否则这条通知永远匹配不到在途调用——「所有请求都能取消」就成了空话。 */
        FakeAdmin slow = new FakeAdmin() {
            @Override
            public Map<String, Object> searchDsl(String index, String bodyJson, boolean explain, boolean profile) {
                try {
                    Thread.sleep(5_000L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return Collections.<String, Object>singletonMap("hits", Collections.emptyList());
            }
        };
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new McpController(slow, "secret")).addPlaceholderValue("esquerystudio.mcp.path", "/mcp").build();
        final java.util.concurrent.atomic.AtomicReference<String> body =
                new java.util.concurrent.atomic.AtomicReference<>();
        Thread caller = new Thread(() -> {
            try {
                MvcResult r = mvc.perform(post("/mcp")
                                .header("Authorization", "Bearer secret")
                                .header("X-Request-Id", "sync-cancel-1")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"jsonrpc\":\"2.0\",\"id\":70,\"method\":\"tools/call\",\"params\":{\"name\":\"es_search\",\"arguments\":{\"action\":\"search\",\"index\":\"i\",\"body\":{}}}}"))
                        .andReturn();
                body.set(r.getResponse().getContentAsString());
            } catch (Exception e) {
                body.set("EXCEPTION " + e.getMessage());
            }
        });
        caller.start();
        Thread.sleep(250L);
        /* 关键：这是未声明 Tasks 的客户端能用的唯一取消手段。 */
        mvc.perform(post("/mcp")
                        .header("Authorization", "Bearer secret")
                        .header("X-Request-Id", "sync-cancel-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":\"sync-cancel-1\"}}"))
                .andExpect(status().isAccepted());
        caller.join(3_000L);
        assertFalse("同步调用必须被取消并返回，而不是挂到 3 分钟死线", caller.isAlive());
        assertNotNull(body.get());
        assertTrue("取消应返回 cancelled 结果，got: " + body.get(),
                body.get().contains("cancelled") || body.get().contains("已取消"));
    }

    @Test
    public void adhocJobsListScopedToCapturedTargetForRestrictedKeys() {
        /* 受限 key 只能看到当前目标连接的作业；service token 是全局视角全列。
           AdhocRebuildService 仅覆写 listJobs 桩（prepare/start 等不走本用例），
           EsClientRouter 三参全 null：openScope 只操作线程绑定，不触碰连接依赖。 */
        InMemoryMcpKeyStore store = new InMemoryMcpKeyStore();
        Map<String, List<String>> scoped = new LinkedHashMap<>();
        scoped.put("qa", Collections.singletonList("read"));
        String secret = (String) store.create("adhoc-jobs", "alice", "VIEWER",
                Collections.singletonList("es_adhoc_jobs"), Collections.singletonList("qa"),
                Collections.singletonList("read"), scoped, 60, 100, 100, null).get("secret");
        EsClientRouter router = new EsClientRouter(null, null, null);
        AdhocRebuildService stub = new AdhocRebuildService(null, null, 0L) {
            @Override
            public List<Map<String, Object>> listJobs() {
                List<Map<String, Object>> jobs = new ArrayList<>();
                Map<String, Object> hostJob = new LinkedHashMap<>();
                hostJob.put("jobId", "adhoc-host1");
                hostJob.put("targetId", "host");
                Map<String, Object> qaJob = new LinkedHashMap<>();
                qaJob.put("jobId", "adhoc-qa1");
                qaJob.put("targetId", "qa");
                jobs.add(hostJob);
                jobs.add(qaJob);
                return jobs;
            }
        };
        McpController restricted = new McpController(new FakeAdmin(), "",
                new McpAccessService(store), router, null);
        restricted.setAdhocRebuildService(stub);

        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", 22);
        req.put("method", "tools/call");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", "es_adhoc_rebuild");
        params.put("arguments", args("action", "jobs"));
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) restricted.rpc("Bearer " + secret, req).getBody();
        Map<?, ?> result = (Map<?, ?>) body.get("result");
        assertNotNull(result);
        assertEquals(Boolean.FALSE, result.get("isError"));
        List<?> scopedJobs = (List<?>) ((Map<?, ?>) result.get("structuredContent")).get("result");
        assertEquals("restricted key must only see its own target connection jobs", 1, scopedJobs.size());
        assertEquals("adhoc-qa1", ((Map<?, ?>) scopedJobs.get(0)).get("jobId"));

        McpController service = new McpController(new FakeAdmin(), "svc-secret",
                new McpAccessService(store), router, null);
        service.setAdhocRebuildService(stub);
        Map<String, Object> serviceBody = (Map<String, Object>) service.rpc("Bearer svc-secret", req).getBody();
        Map<?, ?> serviceResult = (Map<?, ?>) serviceBody.get("result");
        assertEquals(Boolean.FALSE, serviceResult.get("isError"));
        List<?> allJobs = (List<?>) ((Map<?, ?>) serviceResult.get("structuredContent")).get("result");
        assertEquals("service token keeps the global view across target connections", 2, allJobs.size());
    }

}
