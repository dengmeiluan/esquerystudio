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

package io.github.dengmeiluan.esquerystudio.console.core;

/**
 * reindex 任务进度（结构化）。
 *
 * <p>原先只回传 {@code completed} + ES status 的裸 JSON 字符串 {@code detail}，逼前端自行 {@code JSON.parse}
 * 且无计数维度。现把“解析 ES 内部 status 格式”收敛到后端一次（见 {@code EsIndexAdmin.getReindexProgress}），
 * 前端直接读结构化计数；{@code detail} 仅保留为兜底/调试原文。</p>
 *
 * <p>{@link #status}：{@code RUNNING}（任务存在、未完成）/ {@code COMPLETED}（已完成或已从 _tasks 消失）/
 * {@code UNKNOWN}（taskId 非法等无法判定）。受 RHLC 7.6 限制（运行中 status 不含 failures、
 * GetTaskResponse 不直接给 BulkByScrollResponse），不提供精细 FAILED 态。</p>
 */
public class ReindexProgress {

    /**
     * 任务是否已完成
     */
    private final boolean completed;

    /**
     * 任务状态：{@code RUNNING} / {@code COMPLETED} / {@code UNKNOWN}
     */
    private final String status;

    /**
     * 进度原文（ES status 的 JSON 文本快照，结构化解析失败时的兜底/调试用）
     */
    private final String detail;

    /**
     * 总文档数（解析失败时为 null）
     */
    private final Long total;
    private final Long created;
    private final Long updated;
    private final Long deleted;

    /**
     * 版本冲突数（reindex op_type=create 跳过的「同 _id 增量」数）
     */
    private final Long versionConflicts;

    /**
     * 简单路径（无结构化计数）：非法 taskId（completed=false → {@code UNKNOWN}）/
     * task 已从 _tasks 消失（completed=true → {@code COMPLETED}）。
     */
    public ReindexProgress(boolean completed, String detail) {
        this(completed, completed ? "COMPLETED" : "UNKNOWN", detail, null, null, null, null, null);
    }

    private ReindexProgress(boolean completed, String status, String detail,
                            Long total, Long created, Long updated, Long deleted, Long versionConflicts) {
        this.completed = completed;
        this.status = status;
        this.detail = detail;
        this.total = total;
        this.created = created;
        this.updated = updated;
        this.deleted = deleted;
        this.versionConflicts = versionConflicts;
    }

    /**
     * 任务存在路径：{@code completed} 决定 {@code COMPLETED}/{@code RUNNING}，计数来自 status JSON 解析（解析失败传 null）。
     */
    public static ReindexProgress of(boolean completed, String detail, Long total, Long created,
                                     Long updated, Long deleted, Long versionConflicts) {
        return new ReindexProgress(completed, completed ? "COMPLETED" : "RUNNING", detail,
                total, created, updated, deleted, versionConflicts);
    }

    public boolean isCompleted() {
        return completed;
    }

    public String getStatus() {
        return status;
    }

    public String getDetail() {
        return detail;
    }

    public Long getTotal() {
        return total;
    }

    public Long getCreated() {
        return created;
    }

    public Long getUpdated() {
        return updated;
    }

    public Long getDeleted() {
        return deleted;
    }

    public Long getVersionConflicts() {
        return versionConflicts;
    }
}
