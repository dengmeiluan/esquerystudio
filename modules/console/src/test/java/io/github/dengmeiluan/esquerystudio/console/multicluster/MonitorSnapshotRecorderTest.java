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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 20260922 批4：多集群监控快照落库——服务端定时任务=唯一写入方契约的落点测试：
 * 快照 doc 构建（探活结果映射/空维省略/error 截断）+ 环形写端到端（先建当日索引再落文档、
 * 同日只建一次）+ 故障面（供给抛错整轮跳过不外溢/空清单零写入）。
 */
public class MonitorSnapshotRecorderTest {

    private static Map<String, Object> conn(String id, String name, String env) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("id", id);
        c.put("name", name);
        if (env != null) {
            c.put("env", env);
        }
        return c;
    }

    private static Map<String, Object> green(long latencyMs, String version) {
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("status", "GREEN");
        h.put("latencyMs", latencyMs);
        h.put("error", null);
        if (version != null) {
            h.put("version", version);
        }
        return h;
    }

    private static Map<String, Object> red(String error) {
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("status", "RED");
        h.put("latencyMs", null);
        h.put("error", error);
        return h;
    }

    @Test
    public void buildDoc_GREEN全维含版本时延() {
        Map<String, Object> doc = MonitorSnapshotRecorder.buildDoc(
                conn("7bdac680", "腾讯云QA", "QA"), green(36L, "7.10.1"), 123L);
        assertEquals(123L, doc.get("timestamp"));
        assertEquals("7bdac680", doc.get("connId"));
        assertEquals("腾讯云QA", doc.get("connName"));
        assertEquals("QA", doc.get("env"));
        assertEquals("GREEN", doc.get("status"));
        assertEquals(36L, doc.get("latencyMs"));
        assertEquals("7.10.1", doc.get("esVersion"));
        assertFalse(doc.containsKey("error"));
    }

    @Test
    public void buildDoc_RED带错误与缺维省略() {
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 100; i++) {
            big.append("connect-timeout");
        }
        Map<String, Object> doc = MonitorSnapshotRecorder.buildDoc(
                conn("837a33d7", "生产集群", null), red(big.toString()), 456L);
        assertEquals("RED", doc.get("status"));
        assertFalse("latencyMs 缺失即省略", doc.containsKey("latencyMs"));
        assertFalse(doc.containsKey("env"));
        assertFalse(doc.containsKey("esVersion"));
        assertEquals("error 截断 500 字符", 500, String.valueOf(doc.get("error")).length());
    }

    @Test
    public void buildDoc_探活缺席status退化UNKNOWN() {
        Map<String, Object> doc = MonitorSnapshotRecorder.buildDoc(
                conn("x", "无探活", "QA"), Collections.emptyMap(), 1L);
        assertEquals("UNKNOWN", doc.get("status"));
        assertFalse(doc.containsKey("latencyMs"));
    }

    /** 端到端：一轮两连接 → 1 次建当日索引 + 2 条快照落当日日期索引；同日不再建索引。 */
    @Test
    public void recordOnce_先建当日索引再逐连接落快照() throws Exception {
        List<String> puts = new CopyOnWriteArrayList<>();
        List<String> posts = new CopyOnWriteArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("PUT".equals(req.getMethod())) {
                puts.add(req.getEndpoint());
                return "{\"acknowledged\":true}";
            }
            if ("POST".equals(req.getMethod())) {
                posts.add(req.getEndpoint());
                return "{\"result\":\"created\"}";
            }
            throw EsFakeClients.responseException(400, "{\"error\":{\"type\":\"illegal_argument_exception\"}}");
        });
        MonitorSnapshotRecorder recorder = new MonitorSnapshotRecorder(() -> client,
                () -> Arrays.asList(
                        MonitorSnapshotRecorder.buildDoc(conn("a", "生产集群", "PROD"), green(10L, "7.10.0"), 1L),
                        MonitorSnapshotRecorder.buildDoc(conn("b", "腾讯云QA", "QA"), red("timeout"), 1L)),
                "esquerystudio_monitor", 60);
        recorder.recordOnce();
        assertEquals("同日只建一次索引", 1, puts.size());
        assertTrue(puts.get(0).startsWith("/esquerystudio_monitor-2"));
        assertEquals("每连接一条快照", 2, posts.size());
        assertTrue(posts.get(0).startsWith("/esquerystudio_monitor-2"));
        assertTrue(posts.get(1).startsWith("/esquerystudio_monitor-2"));
        /* 索引已 ensure，仅追加快照 */
        recorder.recordOnce();
        assertEquals("同日不再重复建索引", 1, puts.size());
        assertEquals(4, posts.size());
    }

    /** 故障面：快照供给抛错（连接清单拉不到等）整轮跳过、零写入零外溢；空清单零写入。 */
    @Test
    public void recordOnce_供给抛错整轮跳过_空清单零写入() throws Exception {
        List<String> requests = new CopyOnWriteArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            requests.add(req.getMethod() + " " + req.getEndpoint());
            return "{}";
        });
        MonitorSnapshotRecorder failing = new MonitorSnapshotRecorder(() -> client,
                () -> { throw new IllegalStateException("control cluster down"); }, "esquerystudio_monitor", 60);
        failing.recordOnce();
        assertTrue("供给抛错=整轮跳过零请求", requests.isEmpty());

        MonitorSnapshotRecorder empty = new MonitorSnapshotRecorder(() -> client,
                Collections::emptyList, "esquerystudio_monitor", 60);
        empty.recordOnce();
        assertTrue("空清单=零写入", requests.isEmpty());
    }
}
