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

import org.junit.Test;

import static org.junit.Assert.assertEquals;

/**
 * 批次 1001：持久化快照必须携带源连接档案——连接模型下 jobs 过滤/progress/abort/resume
 * 的授权全部按 job.srcConnId 对写键，快照丢失该字段即「发起者无法查看/中止自己发起的迁移」。
 */
public class MigrationHandleSrcConnId1001Test {

    @Test
    public void 持久化快照透传源连接档案() {
        MigrateJobES meta = new MigrateJobES();
        meta.setJobId("orders_1");
        meta.setSourceIndex("orders");
        meta.setDestIndex("orders_v2");
        meta.setSrcConnId("conn-old-cluster");
        MigrationHandle handle = new MigrationHandle("orders_1", null, null, meta, 1500L);
        assertEquals("toJobEs 快照必须带出 srcConnId（连接模型授权链的地基）",
                "conn-old-cluster", handle.toJobEs().getSrcConnId());
    }

    @Test
    public void 未注档作业快照保持空档案语义() {
        MigrateJobES meta = new MigrateJobES();
        meta.setJobId("legacy_1");
        MigrationHandle handle = new MigrationHandle("legacy_1", null, null, meta, 1500L);
        assertEquals("手输/旧作业无档案时快照字段为 null（jobs 过滤按空档案语义处理）",
                null, handle.toJobEs().getSrcConnId());
    }
}
