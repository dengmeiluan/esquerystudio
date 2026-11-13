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

import static org.assertj.core.api.Assertions.assertThat;

/**
 *  契约红线：<b>持久化 save 失败绝不反噬重建</b>。
 *
 * <p>注入一个 {@code save} 必抛 {@link RuntimeException} 的 {@link AdhocJobStore}，跑一个能快速
 * 终结的 MANUAL + 别名模式作业（复用 {@link AdhocServiceStorePersistTest} 的假 {@link EsIndexAdmin}
 * 手法，全程不触真 ES），断言三条红线：</p>
 * <ol>
 *   <li>作业仍推进到终态 SUCCEEDED（save 抛异常不打断编排）；</li>
 *   <li>{@code start} 未把异常上抛给调用方（重建流程不被打断）；</li>
 *   <li>内存 {@code jobs} 一级缓存里仍有该作业（persist 先 put 再 try-save，save 失败不动缓存）。</li>
 * </ol>
 *
 * <p>红线由  的 {@code persist} 内 try-catch 守住；若去掉该 try-catch，本测试必转红
 * （异常从 worker 冒泡、作业停在 RUNNING）。</p>
 */
public class AdhocPersistNeverBreaksRebuildTest {

    /** save 必抛的 store：find 返 empty、listRecent 返 emptyList（brief 给定骨架）。 */
    private static final class ThrowingStore implements AdhocJobStore {
        @Override
        public void save(AdhocRebuildJob job) {
            throw new RuntimeException("boom");
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
     * 假 EsIndexAdmin：与 {@link AdhocServiceStorePersistTest} 同款，MANUAL + 别名模式 happy path
     * 会触达的机械件全部 no-op / 立即完成，全程不需要真 ES。
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
    public void persistFailureNeverBreaksRebuild() throws Exception {
        AdhocRebuildService service = new AdhocRebuildService(
                fakeAdmin(), () -> null, 60_000L, null, 0L, new ThrowingStore());

        Map<String, Object> req = new LinkedHashMap<>();
        req.put("index", "my_alias");
        req.put("strategy", "MANUAL");
        req.put("destIndex", "my_alias_v2");
        req.put("settingsJson", "{\"index\":{}}");
        req.put("mappingJson", "{\"properties\":{}}");

        // 红线②：即便每次 persist 都撞上 save 抛异常，start 也不得把异常上抛给调用方。
        Map<String, Object> out = service.start(req);
        String jobId = (String) out.get("jobId");
        assertThat(jobId).isNotNull();

        // 红线①：作业仍推进到终态 SUCCEEDED（save 抛异常不打断 worker 编排）。
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

        // 红线③：内存 jobs 一级缓存里仍有该作业。store.find 恒 empty，若 status 还能查到终态，
        // 只可能来自一级缓存 —— persist 先 jobs.put 再 try store.save，save 失败不影响缓存。
        Map<String, Object> snapshot = service.status(jobId);
        assertThat(snapshot).isNotNull();
        assertThat(snapshot.get("jobId")).isEqualTo(jobId);
        assertThat(snapshot.get("status")).isEqualTo("SUCCEEDED");
    }
}
