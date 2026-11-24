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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.web.CrossClusterMigrateController;
import org.apache.http.HttpHost;
import org.apache.http.HttpVersion;
import org.apache.http.message.BasicHttpResponse;
import org.elasticsearch.client.EsResponses;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestClient;
import org.junit.Test;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 迁移后等价性验证契约：双侧 _count 对比（countsMatch 三态）、样本对比（源 _search 取 id 集、
 * 两侧 _mget 取 _source、canonical JSON SHA-256 前 16 hex 摘要逐 id 比对，sampleFields 投影后
 * 哈希——投影外字段差异不算内容差异）、terms 聚合对比（onlyInSource/onlyInDest/countDiffs）、
 * verdict 三态矩阵（EQUIVALENT/DIVERGENT/INCONCLUSIVE；目标索引 404→count=null+INCONCLUSIVE
 * 不是异常）、sampleSize/aggSize 钳制告警；service 统一入口的 jobId 形态取参与档案解析；
 * REST 端点 jobId 形态的归属校验（创建者本人或 ADMIN）。纯路径表桩，不触真实集群。
 */
public class VerifyEquivalenceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /* ───────── 核心对比契约（StructureSyncService 直测） ───────── */

    /** 全等用例：counts 匹配、样本 3/3 摘要一致、聚合桶一致 → EQUIVALENT，报告形态逐键校验。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 全等用例_判定EQUIVALENT() {
        ScriptedVerify v = stubBaseline();

        Map<String, Object> out = v.verifyEquivalence(conn(), "legacy_orders", null, null, "orders_v2",
                null, null, "sku", 10);

        Map<String, Object> source = (Map<String, Object>) out.get("source");
        assertEquals("legacy_orders", source.get("index"));
        assertEquals(3L, source.get("count"));
        Map<String, Object> dest = (Map<String, Object>) out.get("dest");
        assertEquals("orders_v2", dest.get("index"));
        assertEquals(3L, dest.get("count"));
        assertNull("destConnId 缺省=宿主（null 回显）", dest.get("destConnId"));
        assertEquals(Boolean.TRUE, out.get("countsMatch"));

        Map<String, Object> sample = (Map<String, Object>) out.get("sample");
        assertEquals(100, sample.get("requested"));
        assertEquals(3, sample.get("checked"));
        assertEquals(3, sample.get("matched"));
        assertTrue(((List<?>) sample.get("missingInDest")).isEmpty());
        assertTrue(((List<?>) sample.get("mismatched")).isEmpty());
        assertEquals(Boolean.FALSE, sample.get("missingTruncated"));
        assertEquals(Boolean.FALSE, sample.get("mismatchTruncated"));

        Map<String, Object> aggregation = (Map<String, Object>) out.get("aggregation");
        assertEquals("sku", aggregation.get("field"));
        assertEquals(10, aggregation.get("requestedSize"));
        assertEquals(Boolean.TRUE, aggregation.get("match"));
        assertTrue(((List<?>) aggregation.get("onlyInSource")).isEmpty());
        assertTrue(((List<?>) aggregation.get("onlyInDest")).isEmpty());
        assertTrue(((List<?>) aggregation.get("countDiffs")).isEmpty());
        assertEquals(2, ((List<?>) aggregation.get("sourceBuckets")).size());

        assertEquals("EQUIVALENT", out.get("verdict"));
        assertTrue("无钳制/缺失时 warnings 为空: " + out.get("warnings"),
                ((List<?>) out.get("warnings")).isEmpty());
    }

    /** counts 不匹配：countsMatch=false → DIVERGENT（样本即使全一致也判分化）。 */
    @Test
    public void counts不匹配_判定DIVERGENT() {
        ScriptedVerify v = stubBaseline();
        v.targetGet.put("/orders_v2/_count", "{\"count\":2}");

        Map<String, Object> out = v.verifyEquivalence(conn(), "legacy_orders", null, null, "orders_v2",
                null, null, null, null);

        assertEquals(Boolean.FALSE, out.get("countsMatch"));
        assertEquals("DIVERGENT", out.get("verdict"));
    }

    /** 样本摘要不同：mismatched 记 {id, reason=content_mismatch} → DIVERGENT。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 样本content_mismatch() {
        ScriptedVerify v = stubBaseline();
        v.targetMget.put("/orders_v2/_mget", mgetResponse(
                "1", doc("a", "x"), "2", doc("b-different", "y"), "3", doc("c", "x")));

        Map<String, Object> out = v.verifyEquivalence(conn(), "legacy_orders", null, null, "orders_v2",
                null, null, null, null);

        Map<String, Object> sample = (Map<String, Object>) out.get("sample");
        assertEquals(3, sample.get("checked"));
        assertEquals(2, sample.get("matched"));
        List<Map<String, Object>> mismatched = (List<Map<String, Object>>) sample.get("mismatched");
        assertEquals(1, mismatched.size());
        assertEquals("2", mismatched.get(0).get("id"));
        assertEquals("content_mismatch", mismatched.get(0).get("reason"));
        assertEquals("DIVERGENT", out.get("verdict"));
    }

    /** 目标端缺文档：mget found=false → missingInDest 记 id → DIVERGENT。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 样本missingInDest() {
        ScriptedVerify v = stubBaseline();
        v.targetMget.put("/orders_v2/_mget", mgetResponse("1", doc("a", "x"), "2", null, "3", doc("c", "x")));

        Map<String, Object> out = v.verifyEquivalence(conn(), "legacy_orders", null, null, "orders_v2",
                null, null, null, null);

        Map<String, Object> sample = (Map<String, Object>) out.get("sample");
        assertEquals(3, sample.get("checked"));
        assertEquals(2, sample.get("matched"));
        List<String> missing = (List<String>) sample.get("missingInDest");
        assertEquals(Collections.singletonList("2"), missing);
        assertEquals("DIVERGENT", out.get("verdict"));
    }

    /** 聚合对比：countDiffs/onlyInSource/onlyInDest 逐项呈报，match=false → DIVERGENT。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 聚合countDiffs与only清单() {
        ScriptedVerify v = stubBaseline();
        v.targetAgg.put("/orders_v2/_search", aggResponse("x", 1, "z", 1));

        Map<String, Object> out = v.verifyEquivalence(conn(), "legacy_orders", null, null, "orders_v2",
                null, null, "sku", 10);

        Map<String, Object> aggregation = (Map<String, Object>) out.get("aggregation");
        assertEquals(Boolean.FALSE, aggregation.get("match"));
        List<Map<String, Object>> countDiffs = (List<Map<String, Object>>) aggregation.get("countDiffs");
        assertEquals(1, countDiffs.size());
        assertEquals("x", countDiffs.get(0).get("key"));
        assertEquals(2L, countDiffs.get(0).get("sourceCount"));
        assertEquals(1L, countDiffs.get(0).get("destCount"));
        List<Map<String, Object>> onlyInSource = (List<Map<String, Object>>) aggregation.get("onlyInSource");
        assertEquals(Collections.singletonList(map("key", "y", "count", 1L)), onlyInSource);
        List<Map<String, Object>> onlyInDest = (List<Map<String, Object>>) aggregation.get("onlyInDest");
        assertEquals(Collections.singletonList(map("key", "z", "count", 1L)), onlyInDest);
        assertEquals("DIVERGENT", out.get("verdict"));
    }

    /** 目标索引不存在（404）：dest.count=null、countsMatch=null、warning 如实记录 → INCONCLUSIVE
     * （不是异常）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 目标索引404_判定INCONCLUSIVE() {
        ScriptedVerify v = stubBaseline();
        v.targetCount404 = true;

        Map<String, Object> out = v.verifyEquivalence(conn(), "legacy_orders", "c2", null, "orders_v2",
                null, null, "sku", 10);

        Map<String, Object> source = (Map<String, Object>) out.get("source");
        assertEquals(3L, source.get("count"));
        Map<String, Object> dest = (Map<String, Object>) out.get("dest");
        assertNull("404 → count=null（不冒充 0）", dest.get("count"));
        assertEquals("c2", dest.get("destConnId"));
        assertNull(out.get("countsMatch"));
        Map<String, Object> sample = (Map<String, Object>) out.get("sample");
        assertEquals("count 任一 null 时样本跳过", 0, sample.get("checked"));
        assertNull("索引缺失时聚合跳过", out.get("aggregation"));
        assertEquals("INCONCLUSIVE", out.get("verdict"));
        List<String> warnings = (List<String>) warningsOf(out);
        assertTrue("warning 指明目标索引不存在: " + warnings,
                warnings.stream().anyMatch(w -> w.contains("目标索引不存在") && w.contains("404")
                        && w.contains("orders_v2")));
    }

    /** 双侧 count=0：countsMatch=true、sample.checked=0、聚合空桶 match → EQUIVALENT。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 双侧count为0_判定EQUIVALENT() {
        ScriptedVerify v = new ScriptedVerify();
        v.getSource.put("/empty_src/_count", "{\"count\":0}");
        v.targetGet.put("/empty_dst/_count", "{\"count\":0}");
        v.sourceAgg.put("/empty_src/_search", aggResponse());
        v.targetAgg.put("/empty_dst/_search", aggResponse());

        Map<String, Object> out = v.verifyEquivalence(conn(), "empty_src", null, null, "empty_dst",
                null, null, "sku", null);

        assertEquals(Boolean.TRUE, out.get("countsMatch"));
        Map<String, Object> sample = (Map<String, Object>) out.get("sample");
        assertEquals(0, sample.get("checked"));
        assertEquals(0, sample.get("matched"));
        Map<String, Object> aggregation = (Map<String, Object>) out.get("aggregation");
        assertEquals(Boolean.TRUE, aggregation.get("match"));
        assertEquals("EQUIVALENT", out.get("verdict"));
    }

    /** sampleFields 投影：投影外字段差异不算内容差异（投影后 EQUIVALENT、不投影 DIVERGENT）；
     * 投影字段在源样本全未出现时记 warning。 */
    @Test
    @SuppressWarnings("unchecked")
    public void sampleFields投影等价_多余字段不算差异() {
        ScriptedVerify v = stubBaseline();
        /* 源文档多 extra 字段，目标文档只有 title+sku：投影后等价、全量对比分化 */
        v.sourceMget.put("/legacy_orders/_mget", mgetResponse(
                "1", map("title", "a", "sku", "x", "extra", "e1"),
                "2", map("title", "b", "sku", "y", "extra", "e2"),
                "3", map("title", "c", "sku", "x", "extra", "e3")));
        v.targetMget.put("/orders_v2/_mget", mgetResponse(
                "1", map("title", "a", "sku", "x"),
                "2", map("title", "b", "sku", "y"),
                "3", map("title", "c", "sku", "x")));

        Map<String, Object> projected = v.verifyEquivalence(conn(), "legacy_orders", null, null,
                "orders_v2", null, Arrays.asList("title", "sku", "ghost"), null, null);
        assertEquals("投影后 extra 差异不算内容差异", "EQUIVALENT", projected.get("verdict"));
        List<String> warnings = (List<String>) warningsOf(projected);
        assertTrue("全样本未出现的投影字段记 warning: " + warnings,
                warnings.stream().anyMatch(w -> w.contains("投影字段 ghost")));

        Map<String, Object> raw = v.verifyEquivalence(conn(), "legacy_orders", null, null,
                "orders_v2", null, null, null, null);
        assertEquals("不投影时 extra 差异如实判分化", "DIVERGENT", raw.get("verdict"));
    }

    /** sampleSize/aggSize 钳制：越界值钳到边界并记 warning（requested 回显钳后值）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void sampleSize与aggSize钳制告警() {
        ScriptedVerify v = stubBaseline();

        Map<String, Object> low = v.verifyEquivalence(conn(), "legacy_orders", null, null, "orders_v2",
                5, null, null, null);
        assertEquals(10, ((Map<String, Object>) low.get("sample")).get("requested"));
        List<String> lowWarnings = (List<String>) warningsOf(low);
        assertTrue(lowWarnings.stream().anyMatch(w -> w.contains("sampleSize") && w.contains("5") && w.contains("10")));

        Map<String, Object> high = v.verifyEquivalence(conn(), "legacy_orders", null, null, "orders_v2",
                900, null, "sku", 99);
        assertEquals(500, ((Map<String, Object>) high.get("sample")).get("requested"));
        assertEquals(50, ((Map<String, Object>) high.get("aggregation")).get("requestedSize"));
        List<String> highWarnings = (List<String>) warningsOf(high);
        assertTrue(highWarnings.stream().anyMatch(w -> w.contains("sampleSize") && w.contains("900") && w.contains("500")));
        assertTrue(highWarnings.stream().anyMatch(w -> w.contains("aggSize") && w.contains("99") && w.contains("50")));
    }

    /* ───────── Service 统一入口（id 形态） ───────── */

    /** jobId 形态：从作业档案取 srcConnId/sourceIndex/destIndex，档案经解析器取密后透传核心。 */
    @Test
    public void service入口_jobId形态从档案取参() {
        ScriptedService svc = new ScriptedService();
        MigrateJobES job = new MigrateJobES();
        job.setJobId("j1");
        job.setSrcConnId("c1");
        job.setSourceIndex("src-1");
        job.setDestIndex("dst-1");
        job.setOwnerUsername("u-owner");
        svc.jobs.put("j1", job);
        svc.profiles.put("c1", conn("10.0.0.9"));

        Map<String, Object> out = svc.verifyEquivalence("j1", null, null, null, null,
                null, null, null, null);

        assertEquals("EQUIVALENT", out.get("verdict"));
        assertEquals("源连接按档案 id 解析", "10.0.0.9", svc.lastSourceHost);
        assertEquals("src-1", svc.lastSourceIndex);
        assertEquals("目标索引取作业档案值", "dst-1", svc.lastDestIndex);
        assertNull("destConnId 缺省=宿主", svc.lastDestConnId);

        /* destConnId=host 显式等同宿主；具体档案 id 则解析对应连接 */
        svc.verifyEquivalence("j1", null, null, "host", null, null, null, null, null);
        assertNull(svc.lastDestConnId);
        svc.profiles.put("c2", conn("10.0.0.8"));
        svc.verifyEquivalence("j1", null, null, "c2", null, null, null, null, null);
        assertEquals("c2", svc.lastDestConnId);
    }

    /** 缺参/未知档案：无 jobId 且无 srcConnId、srcConnId 未建档、作业无源档案均 400 形态报错。 */
    @Test
    public void service入口_缺参与未知档案报错() {
        ScriptedService svc = new ScriptedService();
        try {
            svc.verifyEquivalence((String) null, null, "idx", null, null, null, null, null, null);
            fail("缺 srcConnId 与 jobId 必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(String.valueOf(e.getMessage()), e.getMessage().contains("srcConnId"));
        }
        try {
            svc.verifyEquivalence((String) null, "c-none", "idx", null, null, null, null, null, null);
            fail("未知档案必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(String.valueOf(e.getMessage()), e.getMessage().contains("连接不存在或已被删除"));
        }
        MigrateJobES legacy = new MigrateJobES();
        legacy.setJobId("j2");
        legacy.setSourceIndex("src-2");
        svc.jobs.put("j2", legacy);
        try {
            svc.verifyEquivalence("j2", null, null, null, null, null, null, null, null);
            fail("作业未记录源档案必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(String.valueOf(e.getMessage()), e.getMessage().contains("未记录源连接档案"));
        }
        try {
            svc.verifyEquivalence("missing", null, null, null, null, null, null, null, null);
            fail("未知作业必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(String.valueOf(e.getMessage()), e.getMessage().contains("作业不存在"));
        }
    }

    /* ───────── REST 端点（鉴权/取参） ───────── */

    /** jobId 形态归属校验：非创建者同连接成员 403（与 resume 同口径），创建者/ADMIN 放行。 */
    @Test
    public void controller_jobId形态_归属校验() {
        ScriptedService svc = new ScriptedService();
        MigrateJobES job = new MigrateJobES();
        job.setJobId("j-owned");
        job.setSrcConnId("c1");
        job.setSourceIndex("src-1");
        job.setDestIndex("dst-1");
        job.setOwnerUsername("u-owner");
        svc.jobs.put("j-owned", job);
        svc.profiles.put("c1", conn("10.0.0.9"));
        CrossClusterMigrateController ctrl = controller(svc);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("jobId", "j-owned");
        HttpServletRequest teammate = request(viewer("conn:c1:w:xmigrate"));
        try {
            ctrl.verifyEquivalence(body, teammate);
            fail("非创建者同连接成员不得验证他人作业");
        } catch (ResponseStatusException e) {
            assertEquals(403, e.getStatus().value());
        }

        HttpServletRequest owner = request(new ConsolePrincipal("u-owner", ConsoleRole.VIEWER,
                false, true, "创建者", null, new HashSet<>(Collections.singletonList("conn:c1:w:xmigrate"))));
        assertEquals("EQUIVALENT", ctrl.verifyEquivalence(body, owner).get("verdict"));
        assertEquals("参数取作业档案", "src-1", svc.lastSourceIndex);
        assertEquals("dst-1", svc.lastDestIndex);

        HttpServletRequest admin = request(new ConsolePrincipal("admin-x", ConsoleRole.ADMIN, false));
        assertEquals("EQUIVALENT", ctrl.verifyEquivalence(body, admin).get("verdict"));
    }

    /** 形态二：缺 sourceIndex 400；sampleFields 逗号串/数组两种形态都收并透传。 */
    @Test
    public void controller_形态二_缺参与sampleFields形态() {
        ScriptedService svc = new ScriptedService();
        svc.profiles.put("c1", conn("10.0.0.9"));
        CrossClusterMigrateController ctrl = controller(svc);
        HttpServletRequest c1 = request(viewer("conn:c1:w:xmigrate"));

        Map<String, Object> missing = new LinkedHashMap<>();
        missing.put("srcConnId", "c1");
        try {
            ctrl.verifyEquivalence(missing, c1);
            fail("缺 sourceIndex 必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(String.valueOf(e.getMessage()), e.getMessage().contains("sourceIndex"));
        }

        Map<String, Object> csv = new LinkedHashMap<>();
        csv.put("srcConnId", "c1");
        csv.put("sourceIndex", "src-1");
        csv.put("sampleFields", "title, sku ");
        csv.put("sampleSize", "50");
        assertEquals("EQUIVALENT", ctrl.verifyEquivalence(csv, c1).get("verdict"));
        assertEquals(Arrays.asList("title", "sku"), svc.lastSampleFields);
        assertEquals(Integer.valueOf(50), svc.lastSampleSize);

        Map<String, Object> arr = new LinkedHashMap<>();
        arr.put("srcConnId", "c1");
        arr.put("sourceIndex", "src-1");
        arr.put("sampleFields", Arrays.asList("a", "b"));
        ctrl.verifyEquivalence(arr, c1);
        assertEquals(Arrays.asList("a", "b"), svc.lastSampleFields);
    }

    /* ───────── 桩与工具 ───────── */

    /** 基线桩：源/目标各 3 条（title+sku），聚合桶 x:2/y:1——全等形态，用例按需覆写分化点。 */
    private static ScriptedVerify stubBaseline() {
        ScriptedVerify v = new ScriptedVerify();
        v.getSource.put("/legacy_orders/_count", "{\"count\":3}");
        v.targetGet.put("/orders_v2/_count", "{\"count\":3}");
        v.sourceSearch.put("/legacy_orders/_search", hits("1", "2", "3"));
        v.sourceMget.put("/legacy_orders/_mget", mgetResponse(
                "1", doc("a", "x"), "2", doc("b", "y"), "3", doc("c", "x")));
        v.targetMget.put("/orders_v2/_mget", mgetResponse(
                "1", doc("a", "x"), "2", doc("b", "y"), "3", doc("c", "x")));
        v.sourceAgg.put("/legacy_orders/_search", aggResponse("x", 2, "y", 1));
        v.targetAgg.put("/orders_v2/_search", aggResponse("x", 2, "y", 1));
        return v;
    }

    /** 核心桩：路径表覆写 GET（_count）与 POST（_search 样本/聚合、_mget）三通道。 */
    private static class ScriptedVerify extends StructureSyncService {
        final Map<String, String> getSource = new LinkedHashMap<>();
        final Map<String, String> targetGet = new LinkedHashMap<>();
        final Map<String, String> sourceSearch = new LinkedHashMap<>();
        final Map<String, String> targetSearch = new LinkedHashMap<>();
        final Map<String, String> sourceAgg = new LinkedHashMap<>();
        final Map<String, String> targetAgg = new LinkedHashMap<>();
        final Map<String, String> sourceMget = new LinkedHashMap<>();
        final Map<String, String> targetMget = new LinkedHashMap<>();
        boolean targetCount404;

        ScriptedVerify() {
            super(() -> {
                throw new RuntimeException("local-client-must-not-be-touched");
            }, new EsIndexAdmin(null), new RemoteEsClientFactory(1000, 1000) {
                @Override
                public org.elasticsearch.client.RestHighLevelClient build(RemoteClusterConn conn) {
                    return new org.elasticsearch.client.RestHighLevelClient(
                            RestClient.builder(new HttpHost("127.0.0.1", 1)));
                }
            });
        }

        @Override
        Map<String, Object> sourceGet(RestClient ll, String path) {
            return json(getSource.get(path));
        }

        @Override
        Map<String, Object> targetGet(String path) throws Exception {
            if (targetCount404 && path.endsWith("/_count")) {
                throw new ResponseException(EsResponses.of(new BasicHttpResponse(
                        HttpVersion.HTTP_1_1, 404, "Not Found")));
            }
            return json(targetGet.get(path));
        }

        @Override
        Map<String, Object> sourcePost(RestClient ll, String path, String jsonBody) {
            if (path.endsWith("/_mget")) {
                return json(sourceMget.get(path));
            }
            return json((jsonBody.contains("\"aggs\"") ? sourceAgg : sourceSearch).get(path));
        }

        @Override
        Map<String, Object> targetPost(String path, String jsonBody) {
            if (path.endsWith("/_mget")) {
                return json(targetMget.get(path));
            }
            return json((jsonBody.contains("\"aggs\"") ? targetAgg : targetSearch).get(path));
        }
    }

    /** service 桩：progress/档案解析器可控；已解析连接形态只记录参数（核心对比由上面直测）。 */
    private static class ScriptedService extends CrossClusterMigrateService {
        final Map<String, MigrateJobES> jobs = new LinkedHashMap<>();
        final Map<String, RemoteClusterConn> profiles = new LinkedHashMap<>();
        String lastSourceHost;
        String lastSourceIndex;
        String lastDestConnId;
        String lastDestIndex;
        Integer lastSampleSize;
        List<String> lastSampleFields;
        String lastAggField;
        Integer lastAggSize;

        ScriptedService() {
            super(null, null, null, null, null, null, null, null, null);
            setConnProfileResolver(profiles::get);
        }

        @Override
        public MigrateJobES progress(String jobId) {
            MigrateJobES job = jobs.get(jobId);
            if (job == null) {
                throw new IllegalArgumentException("作业不存在: " + jobId);
            }
            return job;
        }

        @Override
        public Map<String, Object> verifyEquivalence(RemoteClusterConn srcConn, String sourceIndex,
                String destConnId, RemoteClusterConn destConn, String destIndex, Integer sampleSize,
                List<String> sampleFields, String aggField, Integer aggSize) {
            lastSourceHost = srcConn == null ? null : srcConn.getHost();
            lastSourceIndex = sourceIndex;
            lastDestConnId = destConnId;
            lastDestIndex = destIndex;
            lastSampleSize = sampleSize;
            lastSampleFields = sampleFields;
            lastAggField = aggField;
            lastAggSize = aggSize;
            return Collections.singletonMap("verdict", "EQUIVALENT");
        }
    }

    private static Object warningsOf(Map<String, Object> out) {
        return out.get("warnings");
    }

    private static Map<String, Object> json(String raw) {
        if (raw == null) {
            throw new IllegalStateException("桩缺少响应");
        }
        try {
            return MAPPER.readValue(raw, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException("桩响应不是合法 JSON", e);
        }
    }

    /** 样本文档 _source（title+sku 两字段）。 */
    private static Map<String, Object> doc(String title, String sku) {
        return map("title", title, "sku", sku);
    }

    /** _search 命中桩（_source:false 形态，只有 _id）。 */
    private static String hits(String... ids) {
        List<Map<String, Object>> hitList = new ArrayList<>();
        for (String id : ids) {
            hitList.add(map("_id", id));
        }
        return write(map("hits", map("hits", hitList)));
    }

    /** _mget 响应桩：id 与 _source 成对；source 为 null 记 found=false（目标缺失侧）。 */
    private static String mgetResponse(Object... idSourcePairs) {
        List<Map<String, Object>> docs = new ArrayList<>();
        for (int i = 0; i + 1 < idSourcePairs.length; i += 2) {
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("_id", idSourcePairs[i]);
            if (idSourcePairs[i + 1] == null) {
                doc.put("found", false);
            } else {
                doc.put("_source", idSourcePairs[i + 1]);
            }
            docs.add(doc);
        }
        return write(map("docs", docs));
    }

    /** terms 聚合响应桩（key/doc_count 成对）。 */
    private static String aggResponse(Object... keyCounts) {
        List<Map<String, Object>> buckets = new ArrayList<>();
        for (int i = 0; i + 1 < keyCounts.length; i += 2) {
            buckets.add(map("key", keyCounts[i], "doc_count", keyCounts[i + 1]));
        }
        return write(map("aggregations", map("eq_verify", map("buckets", buckets))));
    }

    private static String write(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("桩序列化失败", e);
        }
    }

    private static Map<String, Object> map(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }

    private static RemoteClusterConn conn() {
        return conn("10.0.0.9");
    }

    private static RemoteClusterConn conn(String host) {
        return new RemoteClusterConn("http", host, 9200, "legacy", "pw");
    }

    /* ───────── Web 层桩（与 CrossClusterMigrateControllerTargetTest 同款） ───────── */

    private static ConnStore connStore() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return new RemoteClusterConn(); }
            @Override public String getName(String id) { return id; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
    }

    private static CrossClusterMigrateController controller(CrossClusterMigrateService service) {
        return new CrossClusterMigrateController(service, connStore(),
                new EnvPagesResolver(connStore(), new ESQueryStudioElasticsearchProperties()), true);
    }

    private static HttpServletRequest request(ConsolePrincipal principal) {
        Map<String, Object> attrs = new HashMap<>();
        attrs.put(ConsoleAuthInterceptor.ATTR_PRINCIPAL, principal);
        InvocationHandler h = (proxy, method, args) -> {
            switch (method.getName()) {
                case "getAttribute": return attrs.get(args[0]);
                case "getHeader": return null;
                default: throw new UnsupportedOperationException(method.getName());
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                VerifyEquivalenceTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, h);
    }

    private static ConsolePrincipal viewer(String... grants) {
        return new ConsolePrincipal("u-conn", ConsoleRole.VIEWER, false, true, "连接用户", null,
                new HashSet<>(Arrays.asList(grants)));
    }
}
