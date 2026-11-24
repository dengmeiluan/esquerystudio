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

import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * smart_sync 同步计划（持久化到<b>控制集群</b> ES，供 plan_list / plan_apply 与计划资源读取）。
 *
 * <p><b>安全</b>：计划只记连接<b>档案 id</b>，绝不含凭据——执行时由服务端按档案取密。
 * 索引名带 {@code esquerystudio_} 前缀，即控制面索引（数据面删改被控制面守卫拒绝）；
 * {@code createIndex=false}，由 {@code PlanStore} 首次写入前主动建。</p>
 *
 * <p>目标索引、模式、计划摘要以<b>预览报告</b>口径落库（报告里的 destIndex 已做空值同名回退），
 * 执行时按同一组参数重跑，计划摘要才有可比性。</p>
 */
@Document(indexName = PlanRecord.INDEX_NAME, createIndex = false)
public class PlanRecord {

    /** 控制集群索引名。 */
    public static final String INDEX_NAME = "esquerystudio_sync_plan";

    /** 计划 id：{@code destIndex + "_" + 时间戳 + "_" + 随机段}（与迁移作业 id 同规则，不可枚举）。 */
    @Id
    @Field(type = FieldType.Keyword)
    private String planId;

    /** 源连接档案 id。 */
    @Field(type = FieldType.Keyword)
    private String srcConnId;

    @Field(type = FieldType.Keyword)
    private String sourceIndex;

    /** 目标连接 id（{@code host}=宿主集群）。 */
    @Field(type = FieldType.Keyword)
    private String destConnId;

    @Field(type = FieldType.Keyword)
    private String destIndex;

    /** {@code create} / {@code incremental}。 */
    @Field(type = FieldType.Keyword)
    private String mode;

    @Field(type = FieldType.Boolean)
    private Boolean syncAliases;

    /** 降级字段的回退分析器（smart_sync 的 downgradedAnalyzerFallback 原值，空=服务端缺省）。 */
    @Field(type = FieldType.Keyword)
    private String fallbackAnalyzer;

    @Field(type = FieldType.Boolean)
    private Boolean autoTune;

    /** 保存时的计划摘要（plan_apply 的漂移门基准）。 */
    @Field(type = FieldType.Keyword)
    private String planDigest;

    @Field(type = FieldType.Long)
    private Long savedAtMs;

    /** 最近一次按计划执行成功的时刻（毫秒）；从未执行为 null。 */
    @Field(type = FieldType.Long)
    private Long appliedAtMs;

    /** 按计划执行成功的累计次数。 */
    @Field(type = FieldType.Integer)
    private Integer appliedCount;

    /**
     * 预览报告全量 JSON：planned 三清单、autoTuned、advice、warnings、body（create 模式）与
     * 增量计划五清单都在其中。整篇存一个文本字段——任意嵌套的报告结构若交给动态映射会逐字段
     * 建 mapping，同类字段类型一旦不一致，后续写入直接被拒（与托管重建作业台账存整篇 payload
     * 的取舍一致）。
     */
    @Field(type = FieldType.Text)
    private String snapshot;

    /**
     * 由 smart_sync 预览报告生成一条新计划：参数原值入档，目标索引/模式/计划摘要取报告口径，
     * 报告另存为快照。
     */
    static PlanRecord of(String srcConnId, String sourceIndex, String destConnId, String destIndex,
                         boolean syncAliases, String fallbackAnalyzer, boolean autoTune,
                         Map<String, Object> preview) {
        PlanRecord record = new PlanRecord();
        String effectiveDest = text(preview.get("destIndex"));
        if (effectiveDest.isEmpty()) {
            effectiveDest = destIndex == null || destIndex.trim().isEmpty() ? sourceIndex : destIndex.trim();
        }
        record.setPlanId(newPlanId(effectiveDest));
        record.setSrcConnId(srcConnId);
        record.setSourceIndex(sourceIndex);
        record.setDestConnId(destConnId);
        record.setDestIndex(effectiveDest);
        String mode = text(preview.get("mode"));
        record.setMode(mode.isEmpty() ? "create" : mode);
        record.setSyncAliases(syncAliases);
        record.setFallbackAnalyzer(fallbackAnalyzer == null || fallbackAnalyzer.trim().isEmpty()
                ? null : fallbackAnalyzer);
        record.setAutoTune(autoTune);
        record.setPlanDigest(text(preview.get("planDigest")).isEmpty() ? null : text(preview.get("planDigest")));
        record.setSavedAtMs(System.currentTimeMillis());
        record.setAppliedCount(0);
        record.setSnapshot(snapshotJson(preview));
        return record;
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper SNAPSHOT_MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper();

    /** 计划快照序列化失败不阻断保存（与 PlanStore 原语义一致：快照可缺，计划本身仍留）。 */
    private static String snapshotJson(Map<String, Object> preview) {
        try {
            return SNAPSHOT_MAPPER.writeValueAsString(preview);
        } catch (Exception e) {
            return null;
        }
    }

    /** 与迁移作业 id 同规则：目标索引前缀 + 毫秒时间戳 + 16 位随机段（不可枚举）。 */
    private static String newPlanId(String destIndex) {
        return destIndex + "_" + System.currentTimeMillis() + "_"
                + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    /** 字段拷贝（存储层留进程内副本时隔离调用方后续改动）。 */
    PlanRecord copy() {
        PlanRecord out = new PlanRecord();
        out.setPlanId(planId);
        out.setSrcConnId(srcConnId);
        out.setSourceIndex(sourceIndex);
        out.setDestConnId(destConnId);
        out.setDestIndex(destIndex);
        out.setMode(mode);
        out.setSyncAliases(syncAliases);
        out.setFallbackAnalyzer(fallbackAnalyzer);
        out.setAutoTune(autoTune);
        out.setPlanDigest(planDigest);
        out.setSavedAtMs(savedAtMs);
        out.setAppliedAtMs(appliedAtMs);
        out.setAppliedCount(appliedCount);
        out.setSnapshot(snapshot);
        return out;
    }

    /** plan_list 行形态：12 键，键序即对外契约顺序。 */
    public Map<String, Object> toSummary() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("planId", planId);
        out.put("srcConnId", srcConnId);
        out.put("sourceIndex", sourceIndex);
        out.put("destConnId", destConnId);
        out.put("destIndex", destIndex);
        out.put("mode", mode);
        out.put("autoTune", autoTune);
        out.put("syncAliases", syncAliases);
        out.put("planDigest", planDigest);
        out.put("savedAtMs", savedAtMs);
        out.put("appliedAtMs", appliedAtMs);
        out.put("appliedCount", appliedCount);
        return out;
    }

    public String getPlanId() { return planId; }
    public void setPlanId(String planId) { this.planId = planId; }
    public String getSrcConnId() { return srcConnId; }
    public void setSrcConnId(String srcConnId) { this.srcConnId = srcConnId; }
    public String getSourceIndex() { return sourceIndex; }
    public void setSourceIndex(String sourceIndex) { this.sourceIndex = sourceIndex; }
    public String getDestConnId() { return destConnId; }
    public void setDestConnId(String destConnId) { this.destConnId = destConnId; }
    public String getDestIndex() { return destIndex; }
    public void setDestIndex(String destIndex) { this.destIndex = destIndex; }
    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }
    public Boolean getSyncAliases() { return syncAliases; }
    public void setSyncAliases(Boolean syncAliases) { this.syncAliases = syncAliases; }
    public String getFallbackAnalyzer() { return fallbackAnalyzer; }
    public void setFallbackAnalyzer(String fallbackAnalyzer) { this.fallbackAnalyzer = fallbackAnalyzer; }
    public Boolean getAutoTune() { return autoTune; }
    public void setAutoTune(Boolean autoTune) { this.autoTune = autoTune; }
    public String getPlanDigest() { return planDigest; }
    public void setPlanDigest(String planDigest) { this.planDigest = planDigest; }
    public Long getSavedAtMs() { return savedAtMs; }
    public void setSavedAtMs(Long savedAtMs) { this.savedAtMs = savedAtMs; }
    public Long getAppliedAtMs() { return appliedAtMs; }
    public void setAppliedAtMs(Long appliedAtMs) { this.appliedAtMs = appliedAtMs; }
    public Integer getAppliedCount() { return appliedCount; }
    public void setAppliedCount(Integer appliedCount) { this.appliedCount = appliedCount; }
    public String getSnapshot() { return snapshot; }
    public void setSnapshot(String snapshot) { this.snapshot = snapshot; }
}
