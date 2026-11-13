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

import java.util.Arrays;

import static org.junit.Assert.assertEquals;

/**
 * 无 format 的 date 字段告知必须<b>活过持久化快照</b>。
 *
 * <p><b>为什么单独测这个</b>：{@link MigrationHandle#toJobEs()} 每次构造<b>全新</b>的
 * {@link MigrateJobES}，逐字段拷贝。漏拷一个字段不会有任何编译错误、不会有任何现有测试变红，
 * 而这份告知会在<b>收尾持久化时静默消失</b>——恰恰是它最需要在场的时刻
 * （「一次顺利完成的迁移」正是要交代这件事）。这是一个「靠纪律维持」的点，
 * 所以必须有断言钉住它。</p>
 *
 * @author aicoding
 */
public class MigrationHandleFormatlessDatesTest {

    private static MigrationHandle handleWith(String... formatlessFields) {
        MigrateJobES meta = new MigrateJobES();
        meta.setJobId("job-1");
        meta.setSourceIndex("src");
        meta.setDestIndex("dst");
        meta.setFormatlessDateFields(Arrays.asList(formatlessFields));
        return new MigrationHandle("job-1", new RemoteClusterConn(), null, meta, 0L);
    }

    /** 正向：清单必须原样出现在快照里。 */
    @Test
    public void snapshotCarriesFormatlessDateFields() {
        MigrationHandle h = handleWith("createTime", "o.updateTime");
        assertEquals(Arrays.asList("createTime", "o.updateTime"),
                h.toJobEs().getFormatlessDateFields());
    }

    /**
     * 终态快照同样要带——收尾时 {@code setStatus/setMessage} 会覆盖 message，
     * 但告知<b>不能</b>跟着一起没。
     */
    @Test
    public void finalSnapshotStillCarriesTheNoticeAfterMessageIsOverwritten() {
        MigrationHandle h = handleWith("createTime");
        h.setStatus(MigrateJobTracker.STATUS_DONE);
        h.setMessage("迁移结束：搬入 100，跳过(冲突/增量) 0，失败 0");
        MigrateJobES snap = h.toJobEs();
        assertEquals("收尾覆盖 message 后，告知仍须在场",
                Arrays.asList("createTime"), snap.getFormatlessDateFields());
    }

    /** 反向对照：没有无 format 的 date 字段时，快照里就是空清单（不是 null，前端可直接遍历）。 */
    @Test
    public void snapshotHasEmptyListWhenNothingToReport() {
        assertEquals(java.util.Collections.emptyList(),
                handleWith().toJobEs().getFormatlessDateFields());
    }
}
