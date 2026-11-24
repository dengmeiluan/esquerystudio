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

/**
 * Structured MCP tool error codes shared by every transport (console and hosts). The mapping is
 * purely type/message based so it can live in the Spring-neutral core; xmigrate's plan-missing
 * prefix is kept in sync with {@code PlanStore.NOT_FOUND_PREFIX}.
 */
public final class McpErrors {

    /** Mirrors {@code PlanStore.NOT_FOUND_PREFIX} (same string, asserted by console tests). */
    static final String PLAN_NOT_FOUND_PREFIX = "同步计划不存在: ";

    private McpErrors() {
    }

    public static String toolErrorCode(Throwable e) {
        if (e instanceof IllegalArgumentException) return "BAD_REQUEST";
        if (e instanceof SecurityException) return "CONN_FORBIDDEN";
        if (e instanceof IllegalStateException) {
            String msg = e.getMessage() == null ? "" : e.getMessage();
            if (msg.startsWith("计划摘要不匹配，拒绝执行")) return "PLAN_DRIFT";
            if (msg.startsWith(PLAN_NOT_FOUND_PREFIX)) return "PLAN_NOT_FOUND";
            if (msg.startsWith("目标索引不存在或不可读")) return "DEST_NOT_FOUND";
            if (msg.startsWith("目标索引已存在")) return "DEST_EXISTS";
            if (msg.contains("连接旧集群失败")) return "REMOTE_CONNECT_FAILED";
            if (msg.contains("仍在运行") || msg.contains("已完成")) return "JOB_STATE";
            if (msg.contains("目标索引") || msg.contains("源索引不存在")) return "DEST_INDEX";
            return "INTERNAL";
        }
        return "INTERNAL";
    }
}
