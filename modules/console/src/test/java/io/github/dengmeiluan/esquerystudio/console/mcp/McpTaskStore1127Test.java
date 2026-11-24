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

import org.junit.Test;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;

/**
 * 1127：任务台账打破「进程内、不共享」边界——
 * ① 重启后完成结果仍可读；② 失联执行方的在途任务如实终结；
 * ③ 多实例任务可见，任一实例取消都能真中断执行方；④ 心跳让别的实例看到 progress。
 */
public class McpTaskStore1127Test {

    /** 共享台账内存桩：模拟多实例共用一份存储。 */
    private static class MemoryTaskStore implements McpTaskStore {
        final Map<String, Map<String, Object>> docs = new ConcurrentHashMap<>();

        @Override
        public synchronized void save(Map<String, Object> record) {
            /* 与 ES 的 _update doc 合并同语义：执行方心跳不得丢掉别人写的取消标记。 */
            String id = String.valueOf(record.get("taskId"));
            Map<String, Object> merged = docs.get(id) == null
                    ? new LinkedHashMap<>() : new LinkedHashMap<>(docs.get(id));
            merged.putAll(record);
            docs.put(id, merged);
        }

        @Override
        public synchronized Map<String, Object> get(String taskId) {
            Map<String, Object> row = docs.get(taskId);
            return row == null ? null : new LinkedHashMap<>(row);
        }

        @Override
        public synchronized List<Map<String, Object>> recent(int limit) {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (Map<String, Object> row : docs.values()) rows.add(new LinkedHashMap<>(row));
            rows.sort(Comparator.comparingLong((Map<String, Object> r) ->
                    ((Number) r.getOrDefault("lastUpdatedAtMs", 0L)).longValue()).reversed());
            return rows.size() > limit ? new ArrayList<>(rows.subList(0, Math.max(1, limit))) : rows;
        }

        @Override
        public synchronized void requestCancel(String taskId) {
            Map<String, Object> row = docs.get(taskId);
            Map<String, Object> merged = row == null ? new LinkedHashMap<>() : new LinkedHashMap<>(row);
            merged.put("taskId", taskId);
            merged.put("cancelRequestedAtMs", System.currentTimeMillis());
            docs.put(taskId, merged);
        }

        @Override
        public synchronized boolean isCancelRequested(String taskId) {
            Map<String, Object> row = docs.get(taskId);
            return row != null && row.get("cancelRequestedAtMs") != null;
        }
    }

    private static Map<String, Object> record(String taskId, String status, long updatedAt) {
        Map<String, Object> rec = new LinkedHashMap<>();
        rec.put("taskId", taskId);
        rec.put("owner", "owner");
        rec.put("tool", "es_sql");
        rec.put("target", "host");
        rec.put("requestId", "req-" + taskId);
        rec.put("status", status);
        rec.put("stage", status);
        rec.put("createdAtMs", updatedAt - 1_000);
        rec.put("lastUpdatedAtMs", updatedAt);
        rec.put("deadlineAtMs", updatedAt + 60_000);
        rec.put("nodeId", "node-x");
        return rec;
    }

    @Test
    public void completedTaskSurvivesRestart() {
        MemoryTaskStore store = new MemoryTaskStore();
        Map<String, Object> done = record("t-done", McpTaskRegistry.COMPLETED, System.currentTimeMillis());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ok", true);
        done.put("result", payload);
        store.save(done);

        McpTaskRegistry restarted = new McpTaskRegistry(5_000);
        try {
            restarted.attachStore(store);
            Map<String, Object> view = restarted.view("t-done", "owner");
            assertNotNull("重启后必须还能按 taskId 读到完成结果", view);
            assertEquals("completed", view.get("status"));
            @SuppressWarnings("unchecked")
            Map<String, Object> envelope = (Map<String, Object>) view.get("result");
            assertNotNull(envelope);
            @SuppressWarnings("unchecked")
            Map<String, Object> structured = (Map<String, Object>) envelope.get("structuredContent");
            assertEquals(Boolean.TRUE, structured.get("ok"));
        } finally {
            restarted.shutdown();
        }
    }

    @Test
    public void staleWorkingTaskEndsAsExecutorLostInsteadOfPollingForever() {
        MemoryTaskStore store = new MemoryTaskStore();
        store.save(record("t-lost", McpTaskRegistry.WORKING, System.currentTimeMillis() - 60_000));
        McpTaskRegistry restarted = new McpTaskRegistry(5_000);
        try {
            restarted.attachStore(store);
            Map<String, Object> view = restarted.view("t-lost", "owner");
            assertEquals("cancelled", view.get("status"));
            assertEquals("EXECUTOR_LOST", view.get("cancelReason"));
            assertTrue(String.valueOf(view.get("note")).contains("心跳中断"));
        } finally {
            restarted.shutdown();
        }
    }

    @Test
    public void anotherInstanceCanSeeProgressAndReallyCancelTheOwner() throws Exception {
        MemoryTaskStore store = new MemoryTaskStore();
        McpTaskRegistry owner = new McpTaskRegistry(5_000);
        McpTaskRegistry other = new McpTaskRegistry(5_000);
        try {
            owner.attachStore(store);
            CountDownLatch started = new CountDownLatch(1);
            McpTaskRegistry.Task task = owner.submit("owner", "es_sql", "host", "req-multi", control -> {
                Map<String, Object> progress = new LinkedHashMap<>();
                progress.put("done", 3);
                control.progress(progress);
                control.stage("running");
                started.countDown();
                while (!control.cancelled()) Thread.sleep(10);
                throw new McpTaskRegistry.TaskCancelled(control.cancelReason());
            });
            assertTrue(started.await(2, TimeUnit.SECONDS));
            /* 等一个心跳，别的实例才能看到 progress */
            long deadline = System.currentTimeMillis() + 5_000;
            while (System.currentTimeMillis() < deadline) {
                Map<String, Object> stored = store.get(task.id);
                if (stored != null && stored.get("progress") != null) break;
                Thread.sleep(100);
            }

            other.attachStore(store);
            Map<String, Object> shadow = other.view(task.id, "owner");
            assertNotNull("别的实例必须能看到在途任务", shadow);
            assertEquals(Boolean.TRUE, shadow.get("remote"));
            assertEquals("working", shadow.get("status"));

            Map<String, Object> cancelled = other.cancel(task.id, "owner", "CLIENT");
            assertNotNull(cancelled);
            assertEquals("cancelled", cancelled.get("status"));
            assertTrue(store.isCancelRequested(task.id));

            /* 执行方 2s 巡检看到共享取消标记 → 真中断工作线程 → 台账落 cancelled/CLIENT */
            long cancelDeadline = System.currentTimeMillis() + 8_000;
            Map<String, Object> stored = null;
            while (System.currentTimeMillis() < cancelDeadline) {
                stored = store.get(task.id);
                if (stored != null && McpTaskRegistry.CANCELLED.equals(stored.get("status"))) break;
                Thread.sleep(100);
            }
            assertEquals("执行实例必须把共享取消落成 terminated", "cancelled", stored.get("status"));
            assertEquals("CLIENT", stored.get("cancelReason"));
            assertEquals("cancelled", owner.view(task.id, "owner").get("status"));
        } finally {
            owner.shutdown();
            other.shutdown();
        }
    }
}
