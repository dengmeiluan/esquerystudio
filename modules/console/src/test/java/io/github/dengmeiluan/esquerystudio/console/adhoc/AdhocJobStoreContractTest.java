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

import org.junit.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link AdhocJobStore} 契约测试：save/find/listRecent/upsert 四条基本行为。
 * 用 {@link AdhocRebuildJob#minimal(String)} 造最小作业，避开重建构造的一堆参数。
 */
public class AdhocJobStoreContractTest {

    private AdhocRebuildJob job(String id, String status) {
        AdhocRebuildJob j = AdhocRebuildJob.minimal(id);
        j.setStatus(status);
        return j;
    }

    @Test
    public void saveThenFindReturnsSameJob() {
        InMemoryAdhocJobStore store = new InMemoryAdhocJobStore();
        store.save(job("j1", "RUNNING"));
        Optional<AdhocRebuildJob> got = store.find("j1");
        assertThat(got).isPresent();
        assertThat(got.get().getStatus()).isEqualTo("RUNNING");
    }

    @Test
    public void findMissingReturnsEmpty() {
        assertThat(new InMemoryAdhocJobStore().find("nope")).isEmpty();
    }

    @Test
    public void listRecentReturnsUpToLimitNewestFirst() {
        InMemoryAdhocJobStore store = new InMemoryAdhocJobStore();
        store.save(job("a", "SUCCEEDED"));
        store.save(job("b", "SUCCEEDED"));
        store.save(job("c", "SUCCEEDED"));
        assertThat(store.listRecent(2))
                .extracting(AdhocRebuildJob::getJobId)
                .containsExactly("c", "b");
    }

    @Test
    public void saveIsUpsertNotDuplicate() {
        InMemoryAdhocJobStore store = new InMemoryAdhocJobStore();
        store.save(job("j1", "RUNNING"));
        store.save(job("j1", "SUCCEEDED"));
        assertThat(store.find("j1").get().getStatus()).isEqualTo("SUCCEEDED");
        assertThat(store.listRecent(10)).hasSize(1);
    }
}
