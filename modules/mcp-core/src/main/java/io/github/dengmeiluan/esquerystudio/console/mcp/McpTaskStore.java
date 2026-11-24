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

import java.util.List;
import java.util.Map;

/**
 * MCP 任务台账的持久化 SPI（可选）。
 *
 * <p>不装配时台账只在进程内存（默认）。装配后任务快照（含完成结果）按 taskId
 * upsert 到共享存储：任意实例的 {@code tasks/get} 都能读到别的实例完成的结果，
 * 重启后历史任务仍可查询。执行本身仍属于发起实例（线程不可迁移），
 * 跨实例取消通过 {@link #requestCancel(String)} 标记、由执行实例的心跳巡检发现。</p>
 *
 * <p>记录字段（扁平 Map，时间一律 epoch millis）：{@code taskId, owner, tool, target,
 * requestId, status, stage, createdAtMs, lastUpdatedAtMs, deadlineAtMs, cancelReason,
 * esTaskId, progress, result, error, note, nodeId}。</p>
 */
public interface McpTaskStore {

    /** 覆盖写一条任务快照。实现失败应抛异常由调用方记日志，不能静默丢。 */
    void save(Map<String, Object> record);

    /** 按 taskId 读取快照；不存在返回 null。 */
    Map<String, Object> get(String taskId);

    /** 最近任务（按 lastUpdatedAtMs 倒序，最多 limit 条）。 */
    List<Map<String, Object>> recent(int limit);

    /**
     * 请求取消某一任务（其他实例发起）。实现写入一个独立的取消标记，
     * 不覆盖执行实例正在写的其他字段；执行实例巡检到后自行中断。
     */
    void requestCancel(String taskId);

    /** 执行实例巡检：该任务是否被其他实例请求取消。 */
    boolean isCancelRequested(String taskId);

    /** 过期清理（台账淘汰时调用）。 */
    default void clear(String taskId) {
        /* 默认不清理 */
    }
}
