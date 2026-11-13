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

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 跨集群迁移作业（持久化到<b>新集群</b> ES，作为面板状态真相源 + 断点续传/settings 还原依据）。
 *
 * <p><b>安全</b>：本文档<b>绝不含任何凭据</b>。{@link #remoteEndpoint} 仅存脱敏 {@code scheme://host:port}
 * 供展示与 resume 提示，不含 user/password。</p>
 *
 * <p>索引名走 {@code @Document} + SpEL（与 {@code EsRebuildJobES} 同风格），默认
 * {@code ${POLARDB_PROFILES_ACTIVE:}${spring.application.name}_esquerystudio_migrate_job}；
 * 接入方可用 {@code esquerystudio.elasticsearch.migrate.job-index-name=...} 覆盖整名。{@code createIndex=false}，
 * 由 {@link MigrateJobStore#ensureIndex()} 在启动后主动建。</p>
 */
@Document(indexName = "#{@environment.getProperty('esquerystudio.elasticsearch.migrate.job-index-name', "
        + "@environment.getProperty('POLARDB_PROFILES_ACTIVE', '') "
        + "+ @environment.getProperty('spring.application.name', '') + '_esquerystudio_migrate_job')}",
        createIndex = false)
public class MigrateJobES {

    /** 作业 id：{@code destIndex + "_" + 时间戳}。 */
    @Id
    @Field(type = FieldType.Keyword)
    private String jobId;

    @Field(type = FieldType.Keyword)
    private String sourceIndex;

    @Field(type = FieldType.Keyword)
    private String destIndex;

    /** 可选：关联的已注册 indexKey。 */
    @Field(type = FieldType.Keyword)
    private String indexKey;

    /** 脱敏旧集群 endpoint（{@code scheme://host:port}，<b>无凭据</b>）。 */
    @Field(type = FieldType.Keyword)
    private String remoteEndpoint;

    /**
     * 源连接档案 id（空=手输连接，未绑定档案）。连接模型下作业列表/进度/中止/续跑据此
     * 校验操作者是否持有该连接的迁移写键，防止用 A 连接权限操作 B 连接的迁移。
     */
    @Field(type = FieldType.Keyword)
    private String srcConnId;

    /** {@link DestCreateMode} 名。 */
    @Field(type = FieldType.Keyword)
    private String destCreateMode;

    /** {@link TuneMode} 名。 */
    @Field(type = FieldType.Keyword)
    private String tuneMode;

    @Field(type = FieldType.Integer)
    private Integer slices;

    @Field(type = FieldType.Integer)
    private Integer batchSize;

    /** RUNNING / DONE / FAILED / ABORTED / INTERRUPTED。取值见 {@link MigrateJobTracker}。 */
    @Field(type = FieldType.Keyword)
    private String status;

    /** 源索引文档总数（自检时取，用于进度百分比；取不到为 null）。 */
    @Field(type = FieldType.Long)
    private Long total;

    /** 已写入新索引的文档数（含 create 成功）。 */
    @Field(type = FieldType.Long)
    private Long migrated;

    /** version_conflict 数（目标已存在同 _id，被 create 跳过——通常即实时增量）。 */
    @Field(type = FieldType.Long)
    private Long conflicts;

    /** 非冲突失败条数（重试后仍失败）。 */
    @Field(type = FieldType.Long)
    private Long errors;

    /** 每 slice 状态：{@code Map<sliceId, PENDING/RUNNING/DONE/FAILED>}。 */
    @Field(type = FieldType.Object)
    private Map<String, String> sliceStatus = new LinkedHashMap<>();

    /** 每 slice 已搬计数：{@code Map<sliceId, count>}。 */
    @Field(type = FieldType.Object)
    private Map<String, Long> sliceMigrated = new LinkedHashMap<>();

    /**
     * 每 slice 失败计数：{@code Map<sliceId, count>}，与 {@link #sliceStatus} 并存。
     *
     * <p>只在 slice 级失败事件处累加（{@link SliceWorker} catch 兜底致命异常计 1 次），
     * 前端据此在进度列渲染失败切片红 chip（有值才显，无值/旧文档缺字段静默降级）。
     * 旧作业文档无此字段 → 反序列化为<b>null</b>，消费侧必须 null 安全（与 sliceMigrated 同口径）。</p>
     */
    @Field(type = FieldType.Object)
    private Map<String, Long> sliceErrors = new LinkedHashMap<>();

    /**
     * 调优前捕获的目标索引原始 settings（4 项），收尾/abort/resume 据此还原；
     * 即便进程崩溃，也能从本字段恢复，避免目标索引永久停在 refresh=-1 / replicas=0。
     */
    @Field(type = FieldType.Object)
    private Map<String, String> savedSettings = new LinkedHashMap<>();

    /** 错误样本（前 N 条，便于排障）。 */
    @Field(type = FieldType.Keyword)
    private List<String> errorSamples = new ArrayList<>();

    @Field(type = FieldType.Text)
    private String message;

    /**
     * 目标 mapping 中<b>无 {@code format} 的 date 字段</b>清单（如实告知，不是警报）。
     *
     * <p>迁移<b>既不造成也不修复</b>这些字段的  风险——源什么样目标就什么样。
     * 之所以单独持久化而不塞进 {@link #message}：{@code message} 会在收尾时被结果文案覆盖，
     * 而这份告知必须在作业完成<b>之后</b>仍然可见——它恰恰是「一次顺利完成的迁移」需要交代的事。</p>
     */
    @Field(type = FieldType.Keyword)
    private List<String> formatlessDateFields = new ArrayList<>();

    @Field(type = FieldType.Long)
    private Long createTime;

    /**
     * 作业创建者（用户级归属）：连接模型下 resume/abort 只允许创建者本人或 ADMIN。
     * 旧作业文档无此字段=legacy，维持连接级语义（升级后仍可收尾）。
     */
    @Field(type = FieldType.Keyword)
    private String ownerUsername;

    /** 创建时角色快照（审计/展示；判权以当前身份角色为准）。 */
    @Field(type = FieldType.Keyword)
    private String ownerRole;

    @Field(type = FieldType.Long)
    private Long updateTime;

    /**
     * 本次运行开始时间戳（毫秒）。start/resume 落第一份快照前打点；resume 会<b>重置</b>
     * （旧终态的 finishedAtMs 一并清空——耗时口径恒为「最近一次运行」，不跨 resume 累计）。
     * 旧作业文档无此字段为 null，前端耗时列静默降级不显。
     */
    @Field(type = FieldType.Long)
    private Long startedAtMs;

    /** 终态落库时刻（毫秒）：DONE/FAILED/ABORTED/INTERRUPTED 收尾打点。进行中为 null。 */
    @Field(type = FieldType.Long)
    private Long finishedAtMs;

    public String getJobId() { return jobId; }
    public void setJobId(String jobId) { this.jobId = jobId; }
    public String getSourceIndex() { return sourceIndex; }
    public void setSourceIndex(String sourceIndex) { this.sourceIndex = sourceIndex; }
    public String getDestIndex() { return destIndex; }
    public void setDestIndex(String destIndex) { this.destIndex = destIndex; }
    public String getIndexKey() { return indexKey; }
    public void setIndexKey(String indexKey) { this.indexKey = indexKey; }
    public String getRemoteEndpoint() { return remoteEndpoint; }
    public void setRemoteEndpoint(String remoteEndpoint) { this.remoteEndpoint = remoteEndpoint; }
    public String getSrcConnId() { return srcConnId; }
    public void setSrcConnId(String srcConnId) { this.srcConnId = srcConnId; }
    public String getDestCreateMode() { return destCreateMode; }
    public void setDestCreateMode(String destCreateMode) { this.destCreateMode = destCreateMode; }
    public String getTuneMode() { return tuneMode; }
    public void setTuneMode(String tuneMode) { this.tuneMode = tuneMode; }
    public Integer getSlices() { return slices; }
    public void setSlices(Integer slices) { this.slices = slices; }
    public Integer getBatchSize() { return batchSize; }
    public void setBatchSize(Integer batchSize) { this.batchSize = batchSize; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getTotal() { return total; }
    public void setTotal(Long total) { this.total = total; }
    public Long getMigrated() { return migrated; }
    public void setMigrated(Long migrated) { this.migrated = migrated; }
    public Long getConflicts() { return conflicts; }
    public void setConflicts(Long conflicts) { this.conflicts = conflicts; }
    public Long getErrors() { return errors; }
    public void setErrors(Long errors) { this.errors = errors; }
    public Map<String, String> getSliceStatus() { return sliceStatus; }
    public void setSliceStatus(Map<String, String> sliceStatus) { this.sliceStatus = sliceStatus; }
    public Map<String, Long> getSliceMigrated() { return sliceMigrated; }
    public void setSliceMigrated(Map<String, Long> sliceMigrated) { this.sliceMigrated = sliceMigrated; }
    public Map<String, Long> getSliceErrors() { return sliceErrors; }
    public void setSliceErrors(Map<String, Long> sliceErrors) { this.sliceErrors = sliceErrors; }
    public Map<String, String> getSavedSettings() { return savedSettings; }
    public void setSavedSettings(Map<String, String> savedSettings) { this.savedSettings = savedSettings; }
    public List<String> getErrorSamples() { return errorSamples; }
    public void setErrorSamples(List<String> errorSamples) { this.errorSamples = errorSamples; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public List<String> getFormatlessDateFields() { return formatlessDateFields; }
    public void setFormatlessDateFields(List<String> formatlessDateFields) { this.formatlessDateFields = formatlessDateFields; }
    public Long getCreateTime() { return createTime; }
    public void setCreateTime(Long createTime) { this.createTime = createTime; }
    public String getOwnerUsername() { return ownerUsername; }
    public void setOwnerUsername(String ownerUsername) { this.ownerUsername = ownerUsername; }
    public String getOwnerRole() { return ownerRole; }
    public void setOwnerRole(String ownerRole) { this.ownerRole = ownerRole; }
    /** 旧作业无归属记录：前端据此显示「升级前作业（连接级）」，不做创建者限制。 */
    /* 派生字段不参与序列化往返：脱敏用的是 ObjectMapper#convertValue 深拷贝，
       只有 getter 没有 setter 的派生属性会让回读阶段抛 UnrecognizedProperty。 */
    @com.fasterxml.jackson.annotation.JsonIgnore
    public boolean isOwnerLegacy() { return ownerUsername == null || ownerUsername.trim().isEmpty(); }
    public Long getUpdateTime() { return updateTime; }
    public void setUpdateTime(Long updateTime) { this.updateTime = updateTime; }
    public Long getStartedAtMs() { return startedAtMs; }
    public void setStartedAtMs(Long startedAtMs) { this.startedAtMs = startedAtMs; }
    public Long getFinishedAtMs() { return finishedAtMs; }
    public void setFinishedAtMs(Long finishedAtMs) { this.finishedAtMs = finishedAtMs; }
}
