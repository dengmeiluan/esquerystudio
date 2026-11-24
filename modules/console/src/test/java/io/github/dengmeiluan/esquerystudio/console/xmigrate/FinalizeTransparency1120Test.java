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

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;

import org.junit.Test;

/**
 * 迁移收尾透明度（一一二〇）：收尾阶段的刷新失败、设置还原失败与终态对账缺口，
 * 必须随作业完成结论如实呈现——此前这些失败只写服务端 WARN 日志，作业照常标完成，
 * 新写入可能长期不可搜索而使用者无从得知（产线实例：首次迁移报告全量成功，实际
 * 两万余条写入未落盘，作业结论毫无提示）。
 *
 * <p>锁面两层：完成结论的拼接语义（直调 package-private buildFinalMessage）+
 * 收尾编排的源码锚（对账/刷新失败进结论的路径不被重构静默移除）。</p>
 */
public class FinalizeTransparency1120Test {

    private static MigrationHandle handle() {
        MigrateJobES meta = new MigrateJobES();
        meta.setJobId("job-1");
        meta.setSourceIndex("src");
        meta.setDestIndex("dst");
        MigrationHandle h = new MigrationHandle("job-1", new RemoteClusterConn(), null, meta, 0L);
        h.addMigrated(1, 100);
        h.addConflicts(50);
        return h;
    }

    /** 与 CrossClusterMigrateObservability557Test 同款：构造器只赋值不解析依赖，其余协作者传 null。 */
    private static CrossClusterMigrateService service() {
        return new CrossClusterMigrateService(null, null, null, null, null, null, null, null, null);
    }

    @Test
    public void warningsAreAppendedToFinalMessage() {
        String msg = service().buildFinalMessage(handle(), false,
                Arrays.asList("收尾刷新失败（timeout）：部分新写入可能暂不可搜索"));
        assertTrue("基础计数仍在: " + msg, msg.contains("搬入 100"));
        assertTrue("警告带注意前缀: " + msg, msg.contains("注意：收尾刷新失败"));
        assertTrue("警告原文完整透传", msg.contains("暂不可搜索"));
    }

    @Test
    public void shortfallWarningNamesReconcileAndIdempotentRerun() {
        String msg = service().buildFinalMessage(handle(), false,
                Collections.singletonList("目标实际可见 659522 条，低于已处理 679677 条（缺 20155 条）：部分写入未生效，重跑本作业可按 create 幂等补齐（已存在的自动跳过）"));
        assertTrue("对账缺口入结论", msg.contains("低于已处理"));
        assertTrue("给出幂等补齐路径", msg.contains("幂等补齐"));
    }

    @Test
    public void noWarningsKeepsLegacyMessageShape() {
        String msg = service().buildFinalMessage(handle(), false, Collections.emptyList());
        assertTrue(msg.contains("迁移结束：搬入 100，跳过(冲突/增量) 50"));
        assertFalse("无警告不得有注意前缀", msg.contains("注意："));
    }

    @Test
    public void abortedMessageAlsoCarriesWarnings() {
        String msg = service().buildFinalMessage(handle(), true,
                Collections.singletonList("还原索引设置失败（x）：refresh/副本数可能仍处迁移加速值"));
        assertTrue(msg.contains("已中止"));
        assertTrue(msg.contains("还原索引设置失败"));
    }

    /** 收尾编排的源码锚：刷新失败与终态对账必须真的接进 finalize（防重构静默丢失）。 */
    @Test
    public void finalizeWiringAnchors() throws Exception {
        String src = new String(Files.readAllBytes(Paths.get(
                "src/main/java/io/github/dengmeiluan/esquerystudio/console/xmigrate/CrossClusterMigrateService.java")),
                java.nio.charset.StandardCharsets.UTF_8);
        assertTrue("收尾刷新失败进警告", src.contains("收尾刷新失败（"));
        assertTrue("终态对账：目标可见数 vs 已处理量", src.contains("低于已处理"));
        assertTrue("对账走 countLocal", src.contains("Long destCount = countLocal(dest);"));
        assertTrue("刷新失败提示手动 _refresh", src.contains("_refresh 后复查"));
    }
}
