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

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 进程内审计存储，仅测试/无持久化宿主使用；生产必须换 ES/JDBC。 */
public class InMemoryMcpCallAuditStore implements McpCallAuditStore {

    private final List<Map<String, Object>> calls = new ArrayList<>();

    @Override
    public synchronized void append(McpKeyRecord key, Map<String, Object> call) {
        if (key == null || call == null) return;
        Map<String, Object> row = new LinkedHashMap<>(call);
        row.put("keyId", key.id);
        row.put("keyName", key.name);
        row.put("keyPrefix", key.prefix);
        row.put("owner", key.owner);
        row.put("role", key.role);
        calls.add(row);
    }

    @Override
    public synchronized List<Map<String, Object>> list(String keyId, int limit) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : calls) {
            if (keyId != null && !keyId.trim().isEmpty()
                    && !keyId.trim().equals(String.valueOf(row.get("keyId")))) continue;
            out.add(new LinkedHashMap<>(row));
        }
        out.sort(Comparator.comparingLong((Map<String, Object> row) ->
                ((Number) row.getOrDefault("at", 0L)).longValue()).reversed());
        if (out.size() > Math.max(1, limit)) return new ArrayList<>(out.subList(0, limit));
        return out;
    }

    @Override
    public synchronized int prune(long beforeMillis) {
        int before = calls.size();
        calls.removeIf(row -> ((Number) row.getOrDefault("at", 0L)).longValue() < beforeMillis);
        return before - calls.size();
    }
}
