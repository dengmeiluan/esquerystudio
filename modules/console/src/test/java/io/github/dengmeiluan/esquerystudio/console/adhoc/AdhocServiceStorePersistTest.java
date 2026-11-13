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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.ReindexProgress;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 验证 {@link AdhocRebuildService} 每次状态变更都落盘到 {@link AdhocJobStore}。
 *
 * <p>注入一个「捕获型」store（每次 save 立刻快照 jobId+status），跑一个能快速终结的
 * MANUAL + 别名模式作业（不触真 ES：假 {@link EsIndexAdmin} + null client supplier），
 * 断言 save 在 RUNNING 与终态 SUCCEEDED 各至少被调一次、且 jobId 一致。</p>
 *
 * <p>用<b>新增的 6 参构造</b>注入假 store —— 在此之前该构造不存在，测试编译不过（Step2 红）。</p>
 */
public class AdhocServiceStorePersistTest {

    /** 捕获型 store：save 时立刻快照 (jobId, status)，避免读到后续被改写的终值。 */
    private static final class CapturingStore implements AdhocJobStore {
        final List<String[]> saves = new CopyOnWriteArrayList<>();

        @Override
        public void save(AdhocRebuildJob job) {
            saves.add(new String[]{job.getJobId(), job.getStatus()});
        }

        @Override
        public Optional<AdhocRebuildJob> find(String jobId) {
            return Optional.empty();
        }

        @Override
        public List<AdhocRebuildJob> listRecent(int limit) {
            return java.util.Collections.emptyList();
        }

        @Override
        public void remove(String jobId) {
        }
    }

    /**
     * 假 EsIndexAdmin：只覆盖 MANUAL + 别名模式 happy path 会触达的机械件，全部 no-op / 立即完成。
     * 别名模式 + 显式 settings/mapping + 无 timeField，编排走：建索引 → 全量 reindex（一轮即完成）
     * → MANUAL 不追平 → 切换 → 收尾 → SUCCEEDED，全程不需要真 ES。
     */
    private static EsIndexAdmin fakeAdmin() {
        return new EsIndexAdmin(null) {
            @Override
            public boolean aliasExists(String alias) {
                return true; // 别名模式
            }

            @Override
            public String getWriteIndex(String alias) {
                return "src_phys";
            }

            @Override
            public boolean indexExists(String index) {
                return false; // 目标索引不存在，放行
            }

            @Override
            public void createIndex(String index, String settingsJson, String mappingJson) {
                // no-op
            }

            @Override
            public String submitReindex(String sourceIndex, String destIndex) {
                return "node:1";
            }

            @Override
            public ReindexProgress getReindexProgress(String taskId) {
                return new ReindexProgress(true, "completed"); // 一次即完成
            }

            @Override
            public void switchWriteIndex(String alias, String newPhysical, String oldPhysical) {
                // no-op
            }
        };
    }

    @Test
    public void savesOnRunningAndTerminalStates() throws Exception {
        CapturingStore store = new CapturingStore();
        AdhocRebuildService service = new AdhocRebuildService(
                fakeAdmin(), () -> null, 60_000L, null, 0L, store);

        Map<String, Object> req = new LinkedHashMap<>();
        req.put("index", "my_alias");
        req.put("strategy", "MANUAL");
        req.put("destIndex", "my_alias_v2");
        req.put("settingsJson", "{\"index\":{}}");
        req.put("mappingJson", "{\"properties\":{}}");

        Map<String, Object> out = service.start(req);
        String jobId = (String) out.get("jobId");
        assertThat(jobId).isNotNull();

        // 等作业终结（getReindexProgress 立即完成，通常毫秒级；给足 5s 兜底 CI 抖动）
        long deadline = System.currentTimeMillis() + 5_000L;
        String status = null;
        while (System.currentTimeMillis() < deadline) {
            status = (String) service.status(jobId).get("status");
            if (!"RUNNING".equals(status)) {
                break;
            }
            Thread.sleep(20L);
        }
        assertThat(status).isEqualTo("SUCCEEDED");

        // RUNNING 态被 save 过（提交时的一级缓存落盘点）
        assertThat(store.saves)
                .anySatisfy(s -> {
                    assertThat(s[0]).isEqualTo(jobId);
                    assertThat(s[1]).isEqualTo("RUNNING");
                });
        // 终态 SUCCEEDED 被 save 过
        assertThat(store.saves)
                .anySatisfy(s -> {
                    assertThat(s[0]).isEqualTo(jobId);
                    assertThat(s[1]).isEqualTo("SUCCEEDED");
                });
    }
}
