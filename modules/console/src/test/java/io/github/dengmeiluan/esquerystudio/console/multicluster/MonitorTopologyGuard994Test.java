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

import org.junit.Test;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 批次 994：Top 业务索引榜单不收录控制面索引（监控自写自读刷榜+控制面名不向
 * overview/live 读者下发）；监控断链根因落档前拓扑脱敏（992 口径的文档通道补漏）。
 */
public class MonitorTopologyGuard994Test {

    @Test
    public void topIndex榜单不收录控制面索引() {
        assertFalse("业务索引保留", ClusterMetricsCollector.isControlIndexLike("logs-2026.10"));
        assertTrue("监控索引滤除", ClusterMetricsCollector.isControlIndexLike("esquerystudio_monitor-2026.10.22"));
        assertTrue("点号系统索引滤除", ClusterMetricsCollector.isControlIndexLike(".security-7"));
        assertTrue("审计索引滤除", ClusterMetricsCollector.isControlIndexLike("esquerystudio_ops_audit-2026.10.22"));
        assertTrue("重建锁后缀滤除", ClusterMetricsCollector.isControlIndexLike("foo_esquerystudio_lock"));
        assertTrue("xmigrate 作业后缀滤除", ClusterMetricsCollector.isControlIndexLike("bar_esquerystudio_migrate_job"));
        assertTrue("adhoc 作业前缀滤除", ClusterMetricsCollector.isControlIndexLike("esquerystudio_adhoc_job"));
    }

    @Test
    public void 断链根因落档脱敏() {
        Map<String, Object> red = ClusterMetricsCollector.buildRedDoc(
                new HashMap<>(Collections.singletonMap("id", "c1")),
                "Connect to qa-es01.corp:9200 [qa-es01.corp/10.2.3.4:9200] failed: "
                        + "http://10.2.3.4:9200 timeout",
                System.currentTimeMillis());
        String err = String.valueOf(red.get("error"));
        assertFalse("URL 不外发", err.contains("http://10.2.3.4:9200"));
        assertFalse("节点坐标不外发", err.contains("10.2.3.4:9200"));
        assertTrue("脱敏占位在", err.contains("[redacted-host]"));

        Map<String, Object> health = new HashMap<>();
        health.put("status", "RED");
        health.put("error", "Connect to [http://10.9.9.9:9200] failed");
        Map<String, Object> doc = MonitorSnapshotRecorder.buildDoc(
                new HashMap<>(Collections.singletonMap("id", "c1")), health, System.currentTimeMillis());
        assertFalse("history 落档同样脱敏", String.valueOf(doc.get("error")).contains("10.9.9.9:9200"));
    }
}
