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

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * MCP 调用审计的持久化存储。
 *
 * <p>与 key 记录里的 {@code recentCalls}（最近 100 条、随 key 文档覆盖）分开：
 * 每次调用一条独立记录，按时间保留（默认 30 天，最低 7 天），可按 key 检索。
 * 记录包含 tool / method / requestId / IP / UA / transport / 结果 / 耗时，专门用于
 * 客户端连不上、鉴权失败、限流、代理层丢 requestId 等排障场景。</p>
 */
public interface McpCallAuditStore {

    /** 追加一条调用审计；实现必须自行保证不因单条写入失败影响工具执行。 */
    void append(McpKeyRecord key, Map<String, Object> call);

    /** 按 key 取最近调用（已按 at 倒序）。keyId=null/空表示所有 key。 */
    List<Map<String, Object>> list(String keyId, int limit);

    /** 删除早于 beforeMillis 的记录；返回删除条数（未知返回 0）。 */
    default int prune(long beforeMillis) {
        return 0;
    }

    /** 没有持久化能力时的显式空实现（浏览器模式/自定义宿主）。 */
    static McpCallAuditStore noop() {
        return new McpCallAuditStore() {
            @Override
            public void append(McpKeyRecord key, Map<String, Object> call) {
                /* no-op */
            }

            @Override
            public List<Map<String, Object>> list(String keyId, int limit) {
                return Collections.emptyList();
            }
        };
    }
}
