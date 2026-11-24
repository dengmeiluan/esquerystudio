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
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;
import org.springframework.data.elasticsearch.core.document.Document;
import org.springframework.data.elasticsearch.core.ElasticsearchRestTemplate;
import org.springframework.data.elasticsearch.core.mapping.IndexCoordinates;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 同步计划存储契约：存取（参数 + 快照完整，另一接入面读到同一份）、容量上限 50 按 savedAtMs 淘汰最旧
 * （持久层与进程内形态同上限）、降级形态（写失败只留进程内副本不阻断；列表读失败只返回进程内副本并附
 * warning；单条读失败不冒充「计划不存在」）、按计划执行（漂移门摘要缺省取存储值、执行成功才回写
 * appliedAtMs/appliedCount、漂移拒绝原样上抛、记账回写失败不吞执行结果）、记录的显式 mapping 可由
 * spring-data-es 生成。持久层以进程内实现替换，不触真实集群。
 */
public class PlanStoreTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /* ───────── ES 档的离线部分 ───────── */

    /** 首次写入前建索引用的显式 mapping：排序字段 savedAtMs 必须是 long，快照整篇是 text。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 记录的显式mapping可生成_排序字段为long_快照为text() throws Exception {
        RestHighLevelClient client = new RestHighLevelClient(RestClient.builder(new HttpHost("127.0.0.1", 1)));
        try {
            Document mapping = new ElasticsearchRestTemplate(client)
                    .indexOps(IndexCoordinates.of(PlanRecord.INDEX_NAME)).createMapping(PlanRecord.class);

            Map<String, Object> properties = (Map<String, Object>) mapping.get("properties");
            assertThat(((Map<?, ?>) properties.get("savedAtMs")).get("type")).isEqualTo("long");
            assertThat(((Map<?, ?>) properties.get("appliedAtMs")).get("type")).isEqualTo("long");
            assertThat(((Map<?, ?>) properties.get("appliedCount")).get("type")).isEqualTo("integer");
            assertThat(((Map<?, ?>) properties.get("planId")).get("type")).isEqualTo("keyword");
            assertThat(((Map<?, ?>) properties.get("syncAliases")).get("type")).isEqualTo("boolean");
            assertThat(((Map<?, ?>) properties.get("snapshot")).get("type")).isEqualTo("text");
        } finally {
            client.close();
        }
    }

    /** 持久层桩：按 planId 存取，可分别对读/写注入失败。 */
    private static class FakeBackend implements PlanStore.Backend {
        final Map<String, PlanRecord> rows = new LinkedHashMap<>();
        boolean failWrite;
        boolean failRead;

        @Override
        public void save(PlanRecord record) {
            if (failWrite) {
                throw new IllegalStateException("control cluster unavailable (write)");
            }
            rows.put(record.getPlanId(), record.copy());
        }

        @Override
        public PlanRecord get(String planId) {
            if (failRead) {
                throw new IllegalStateException("control cluster unavailable (read)");
            }
            PlanRecord record = rows.get(planId);
            return record == null ? null : record.copy();
        }

        @Override
        public long count() {
            if (failRead) {
                throw new IllegalStateException("control cluster unavailable (read)");
            }
            return rows.size();
        }

        @Override
        public List<PlanRecord> listOldest(int limit) {
            if (failRead) {
                throw new IllegalStateException("control cluster unavailable (read)");
            }
            return sorted(true, limit);
        }

        @Override
        public List<PlanRecord> listNewest(int limit) {
            if (failRead) {
                throw new IllegalStateException("control cluster unavailable (read)");
            }
            return sorted(false, limit);
        }

        @Override
        public void delete(String planId) {
            rows.remove(planId);
        }

        @Override
        public void refresh() {
        }

        private List<PlanRecord> sorted(boolean ascending, int limit) {
            List<PlanRecord> all = new ArrayList<>();
            for (PlanRecord record : rows.values()) {
                all.add(record.copy());
            }
            all.sort((a, b) -> ascending
                    ? Long.compare(a.getSavedAtMs(), b.getSavedAtMs())
                    : Long.compare(b.getSavedAtMs(), a.getSavedAtMs()));
            return new ArrayList<>(all.subList(0, Math.min(limit, all.size())));
        }
    }

    /* ───────── 存取 ───────── */

    /** REST 与 MCP 两个控制器各建 StructureSyncService，计划存储须经进程级同一份：降级形态的
        进程内副本在一个接入面保存、另一接入面立即可见（控制集群正常时共用索引本就无碍）。 */
    @Test
    public void 共享实例_两个服务接入面经同一存储_降级副本互通() {
        PlanStore shared = PlanStore.sharedInstance(() -> null);
        assertThat(PlanStore.sharedInstance(() -> null)).as("进程级同一份").isSameAs(shared);

        StructureSyncService rest = new StructureSyncService(() -> null, null, null);
        rest.setPlanStore(PlanStore.sharedInstance(() -> null));
        StructureSyncService mcp = new StructureSyncService(() -> null, null, null);
        mcp.setPlanStore(PlanStore.sharedInstance(() -> null));

        rest.planStore().save(record("p-shared", 1000L));

        assertThat(mcp.planStore().find("p-shared")).isNotNull();
        assertThat(mcp.planStore().list().getPlans())
                .extracting(PlanRecord::getPlanId).contains("p-shared");
    }

    /** 回退分析器空串/null 统一归 null 入档（与浏览器/本地 Node 端的 `|| null` 归一口径一致）。 */
    @Test
    public void 回退分析器空串归一为null() {
        PlanRecord saved = new PlanStore(new FakeBackend()).savePlan("src-1", "orders", "host",
                null, false, "  ", false, preview("digest-a", "orders"));

        assertThat(saved.getFallbackAnalyzer()).isNull();
    }

    @Test
    public void 存取_参数与快照完整_另一接入面读到同一份() {
        FakeBackend backend = new FakeBackend();
        Map<String, Object> preview = preview("digest0123456789abcdef", "orders_uat");

        PlanRecord saved = new PlanStore(backend).savePlan("src-1", "orders", "uat-dest", null,
                true, "ik_max_word", true, preview);
        PlanRecord read = new PlanStore(backend).find(saved.getPlanId());

        assertThat(read).isNotNull();
        assertThat(read.getPlanId()).matches("orders_uat_\\d+_[0-9a-f]{16}");
        assertThat(read.getSrcConnId()).isEqualTo("src-1");
        assertThat(read.getSourceIndex()).isEqualTo("orders");
        assertThat(read.getDestConnId()).isEqualTo("uat-dest");
        assertThat(read.getDestIndex()).as("目标索引取报告口径（报告已做空值同名回退）").isEqualTo("orders_uat");
        assertThat(read.getMode()).isEqualTo("create");
        assertThat(read.getSyncAliases()).isTrue();
        assertThat(read.getFallbackAnalyzer()).as("回退分析器原值入档").isEqualTo("ik_max_word");
        assertThat(read.getAutoTune()).isTrue();
        assertThat(read.getPlanDigest()).isEqualTo("digest0123456789abcdef");
        assertThat(read.getSavedAtMs()).isGreaterThan(0L);
        assertThat(read.getAppliedAtMs()).isNull();
        assertThat(read.getAppliedCount()).isEqualTo(0);
        assertThat(read.getSnapshot()).as("快照是预览报告全量 JSON")
                .contains("\"planDigest\":\"digest0123456789abcdef\"")
                .contains("\"planned\"").contains("\"body\"");
        assertThat((List<?>) preview.get("warnings")).as("落盘成功不改报告 warnings").isEmpty();
    }

    @Test
    public void 报告缺目标索引与模式时_回退源索引同名与create() {
        PlanRecord saved = new PlanStore(new FakeBackend()).savePlan("src-1", "orders", "host", "  ",
                false, null, false, Collections.<String, Object>singletonMap("planDigest", "d"));

        assertThat(saved.getDestIndex()).isEqualTo("orders");
        assertThat(saved.getMode()).isEqualTo("create");
        assertThat(saved.getPlanDigest()).isEqualTo("d");
        assertThat(saved.getSyncAliases()).isFalse();
        assertThat(saved.getAutoTune()).isFalse();
    }

    @Test
    public void 进程内副本与入参隔离_调用方后续改动不污染存储() {
        FakeBackend backend = new FakeBackend();
        backend.failWrite = true;
        PlanStore store = new PlanStore(backend);
        PlanRecord record = record("p-1", 1000L);
        store.save(record);
        record.setPlanDigest("mutated-after-save");

        assertThat(store.find("p-1").getPlanDigest()).isEqualTo("digest-p-1");
    }

    @Test
    public void 记录JSON往返_appliedAtMs可空_行键序即契约顺序() throws Exception {
        PlanRecord record = record("p-1", 1000L);
        String json = MAPPER.writeValueAsString(record);
        PlanRecord back = MAPPER.readValue(json, PlanRecord.class);
        assertThat(back.getPlanId()).isEqualTo("p-1");
        assertThat(back.getAppliedAtMs()).isNull();
        assertThat(back.getAppliedCount()).isEqualTo(0);
        assertThat(back.getSnapshot()).isEqualTo(record.getSnapshot());
        assertThat(MAPPER.readValue("{\"planId\":\"legacy\",\"savedAtMs\":5}", PlanRecord.class).getPlanId())
                .as("旧文档缺 appliedAtMs 字段同样读得回").isEqualTo("legacy");
        assertThat(new ArrayList<>(back.toSummary().keySet())).isEqualTo(Arrays.asList(
                "planId", "srcConnId", "sourceIndex", "destConnId", "destIndex", "mode", "autoTune",
                "syncAliases", "planDigest", "savedAtMs", "appliedAtMs", "appliedCount"));
    }

    /* ───────── 容量上限 ───────── */

    @Test
    public void 持久层超上限_淘汰最旧_保留最新50条() {
        FakeBackend backend = new FakeBackend();
        PlanStore store = new PlanStore(backend);
        for (int i = 0; i < 55; i++) {
            assertThat(store.save(record("p-" + i, 1000L + i))).isTrue();
        }

        assertThat(backend.rows).hasSize(PlanStore.CAP);
        assertThat(store.find("p-4")).as("最旧的 5 条被淘汰").isNull();
        assertThat(store.find("p-5")).isNotNull();
        assertThat(store.find("p-54")).isNotNull();
        assertThat(store.list().getPlans()).extracting(PlanRecord::getPlanId).startsWith("p-54", "p-53");
    }

    @Test
    public void 进程内形态同上限_按savedAtMs淘汰最旧() {
        FakeBackend backend = new FakeBackend();
        backend.failWrite = true;
        PlanStore store = new PlanStore(backend);
        for (int i = 0; i < 55; i++) {
            store.save(record("p-" + i, 1000L + i));
        }

        assertThat(store.list().getPlans()).hasSize(PlanStore.CAP);
        assertThat(store.find("p-4")).isNull();
        assertThat(store.find("p-5")).isNotNull();
        assertThat(store.find("p-54")).isNotNull();
    }

    /* ───────── 降级形态 ───────── */

    @Test
    public void 写失败降级进程内副本_存取不阻断_存储恢复后回到持久层() {
        FakeBackend backend = new FakeBackend();
        backend.failWrite = true;
        PlanStore store = new PlanStore(backend);

        assertThat(store.save(record("p-1", 1000L))).as("写失败如实返回 false").isFalse();
        assertThat(store.find("p-1")).isNotNull();
        assertThat(store.list().getPlans()).extracting(PlanRecord::getPlanId).containsExactly("p-1");

        backend.failWrite = false;
        assertThat(store.save(store.find("p-1"))).isTrue();
        assertThat(backend.rows).as("恢复后以持久层为准").containsKey("p-1");
    }

    @Test
    public void 列表读失败_只返回进程内副本并附warning_无副本即空() {
        PlanStore.Listing healthyEmpty = new PlanStore(new FakeBackend()).list();
        assertThat(healthyEmpty.getPlans()).isEmpty();
        assertThat(healthyEmpty.getWarning()).isNull();

        FakeBackend backend = new FakeBackend();
        backend.failRead = true;
        backend.failWrite = true;
        PlanStore store = new PlanStore(backend);
        store.save(record("p-1", 1000L));
        store.save(record("p-2", 1001L));
        PlanStore.Listing listing = store.list();

        assertThat(listing.getPlans()).extracting(PlanRecord::getPlanId).containsExactly("p-2", "p-1");
        assertThat(listing.getWarning()).contains("同步计划存储读取失败");
        assertThat(listing.getWarning()).as("失败原因只给根因类型名，不带可能含集群地址的报错原文")
                .contains("IllegalStateException").doesNotContain("control cluster unavailable");

        FakeBackend bare = new FakeBackend();
        bare.failRead = true;
        PlanStore.Listing degradedEmpty = new PlanStore(bare).list();
        assertThat(degradedEmpty.getPlans()).isEmpty();
        assertThat(degradedEmpty.getWarning()).isNotNull();
    }

    @Test
    public void 单条读失败_不冒充计划不存在() {
        FakeBackend backend = new FakeBackend();
        backend.failRead = true;
        PlanStore store = new PlanStore(backend);

        assertThatThrownBy(() -> store.find("nope"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith(PlanStore.UNREADABLE_PREFIX)
                .hasMessageContaining("IllegalStateException")
                .hasMessageNotContaining("control cluster unavailable");
    }

    @Test
    public void 单条读失败_进程内有副本时仍取得到() {
        FakeBackend backend = new FakeBackend();
        backend.failRead = true;
        backend.failWrite = true;
        PlanStore store = new PlanStore(backend);
        store.save(record("p-1", 1000L));

        assertThat(store.find("p-1")).isNotNull();
    }

    @Test
    public void 仅进程内形态_无持久层_未知计划返回空而非读取失败() {
        PlanStore store = new PlanStore();

        assertThat(store.save(record("p-1", 1000L))).isFalse();
        assertThat(store.find("p-1")).isNotNull();
        assertThat(store.find("nope")).isNull();
        assertThat(store.list().getWarning()).isNull();
    }

    @Test
    public void 控制集群未绑定或未装配_写降级_读如实报失败() {
        PlanStore unbound = new PlanStore(() -> {
            throw new IllegalStateException("setup required");
        });
        assertThat(unbound.save(record("p-1", 1000L))).isFalse();
        assertThat(unbound.find("p-1")).as("进程内副本兜住").isNotNull();
        assertThatThrownBy(() -> unbound.find("nope"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith(PlanStore.UNREADABLE_PREFIX)
                .hasMessageContaining("IllegalStateException")
                .hasMessageNotContaining("setup required");

        PlanStore noClient = new PlanStore(() -> null);
        assertThat(noClient.save(record("p-2", 1000L))).isFalse();
        assertThatThrownBy(() -> noClient.find("nope"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith(PlanStore.UNREADABLE_PREFIX);
    }

    /* ───────── 按计划执行 ───────── */

    @Test
    public void 按计划执行_漂移门摘要缺省取存储值_成功回写记账并回显planId() {
        PlanStore store = new PlanStore(new FakeBackend());
        PlanRecord plan = savedPlan(store, "digest0123456789abcdef");
        List<String> gates = new ArrayList<>();

        Map<String, Object> first = store.apply(plan, null, gate -> {
            gates.add(gate);
            return applied();
        });
        Map<String, Object> second = store.apply(store.find(plan.getPlanId()), "  ", gate -> {
            gates.add(gate);
            return applied();
        });

        assertThat(gates).containsExactly("digest0123456789abcdef", "digest0123456789abcdef");
        assertThat(first).containsEntry("verdict", "APPLIED").containsEntry("planId", plan.getPlanId());
        PlanRecord after = store.find(plan.getPlanId());
        assertThat(after.getAppliedCount()).isEqualTo(2);
        assertThat(after.getAppliedAtMs()).isGreaterThan(0L);
        assertThat(after.getSavedAtMs()).as("savedAtMs 不因执行而变（淘汰仍按保存时间）").isEqualTo(1000L);
        assertThat(after.toSummary()).containsEntry("appliedCount", 2);
    }

    @Test
    public void 按计划执行_expectPlanDigest优先于存储值() {
        PlanStore store = new PlanStore(new FakeBackend());
        PlanRecord plan = savedPlan(store, "digest0123456789abcdef");
        List<String> gates = new ArrayList<>();

        store.apply(plan, " expect-digest-0001 ", gate -> {
            gates.add(gate);
            return applied();
        });

        assertThat(gates).containsExactly("expect-digest-0001");
    }

    @Test
    public void 按计划执行_计划无摘要且未给期望值_拒绝无门执行() {
        PlanStore store = new PlanStore(new FakeBackend());
        PlanRecord record = record("p-nodigest", 1000L);
        record.setPlanDigest(null);
        store.save(record);
        List<String> gates = new ArrayList<>();

        assertThatThrownBy(() -> store.apply(record, null, gate -> {
            gates.add(gate);
            return applied();
        })).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("无法校验漂移");
        assertThat(gates).as("执行方未被调用").isEmpty();
        assertThat(store.find("p-nodigest").getAppliedCount()).isEqualTo(0);
    }

    @Test
    public void 按计划执行_执行未成功不回写() {
        PlanStore store = new PlanStore(new FakeBackend());
        PlanRecord plan = savedPlan(store, "digest0123456789abcdef");

        Map<String, Object> failed = store.apply(plan, null, gate -> {
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("verdict", "FAILED");
            report.put("applied", false);
            return report;
        });

        assertThat(failed).containsEntry("planId", plan.getPlanId());
        assertThat(store.find(plan.getPlanId()).getAppliedAtMs()).isNull();
        assertThat(store.find(plan.getPlanId()).getAppliedCount()).isEqualTo(0);
    }

    @Test
    public void 按计划执行_漂移拒绝原样上抛_不回写() {
        PlanStore store = new PlanStore(new FakeBackend());
        PlanRecord plan = savedPlan(store, "digest0123456789abcdef");

        assertThatThrownBy(() -> store.apply(plan, null, gate -> {
            throw new IllegalStateException("计划摘要不匹配，拒绝执行：期望 " + gate + "，实际 other"
                    + "（source structure drifted, re-run smart-sync preview）");
        })).isInstanceOf(IllegalStateException.class)
                .hasMessageStartingWith("计划摘要不匹配，拒绝执行：期望 digest0123456789abcdef");

        assertThat(store.find(plan.getPlanId()).getAppliedCount()).isEqualTo(0);
    }

    @Test
    public void 按计划执行_报告warnings原样保留_记账回写失败不吞执行结果() {
        FakeBackend backend = new FakeBackend();
        PlanStore store = new PlanStore(backend);
        PlanRecord plan = savedPlan(store, "digest0123456789abcdef");
        backend.failWrite = true;

        Map<String, Object> report = store.apply(plan, null, gate -> {
            Map<String, Object> out = applied();
            out.put("warnings", new ArrayList<>(Collections.singletonList("源集群版本不一致")));
            return out;
        });

        assertThat(report).containsEntry("verdict", "APPLIED").containsEntry("planId", plan.getPlanId());
        @SuppressWarnings("unchecked")
        List<String> warnings = (List<String>) report.get("warnings");
        assertThat(warnings).containsExactly("源集群版本不一致", "同步计划已执行，但执行次数未能写回存储");
        assertThat(store.find(plan.getPlanId()).getAppliedCount()).as("回写失败的记账留在进程内副本").isEqualTo(1);
    }

    @Test
    public void 保存失败_在预览报告warnings里如实告知() {
        FakeBackend backend = new FakeBackend();
        backend.failWrite = true;
        Map<String, Object> preview = preview("digest0123456789abcdef", "orders_uat");
        preview.put("warnings", new ArrayList<>(Collections.singletonList("原有告警")));

        new PlanStore(backend).savePlan("src-1", "orders", "host", null, false, null, false, preview);

        @SuppressWarnings("unchecked")
        List<String> warnings = (List<String>) preview.get("warnings");
        assertThat(warnings).hasSize(2);
        assertThat(warnings.get(0)).isEqualTo("原有告警");
        assertThat(warnings.get(1)).contains("仅保留在当前进程内");
    }

    /* ───────── 工具 ───────── */

    private static PlanRecord savedPlan(PlanStore store, String digest) {
        PlanRecord record = record("p-" + digest, 1000L);
        record.setPlanDigest(digest);
        store.save(record);
        return record;
    }

    private static PlanRecord record(String planId, long savedAtMs) {
        PlanRecord record = new PlanRecord();
        record.setPlanId(planId);
        record.setSrcConnId("src-1");
        record.setSourceIndex("orders");
        record.setDestConnId("host");
        record.setDestIndex("orders");
        record.setMode("create");
        record.setSyncAliases(false);
        record.setAutoTune(false);
        record.setPlanDigest("digest-" + planId);
        record.setSavedAtMs(savedAtMs);
        record.setAppliedCount(0);
        record.setSnapshot("{\"verdict\":\"PLANNED\"}");
        return record;
    }

    private static Map<String, Object> preview(String digest, String destIndex) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("verdict", "PLANNED");
        out.put("applied", false);
        out.put("mode", "create");
        out.put("planDigest", digest);
        out.put("destIndex", destIndex);
        out.put("planned", Collections.singletonMap("removedSettings", new ArrayList<>()));
        out.put("body", Collections.singletonMap("settings", new LinkedHashMap<String, Object>()));
        out.put("warnings", new ArrayList<String>());
        return out;
    }

    private static Map<String, Object> applied() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("verdict", "APPLIED");
        out.put("applied", true);
        return out;
    }
}
