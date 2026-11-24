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

import java.util.ArrayList;
import java.util.Deque;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * {@link AdhocJobStore} 的内存实现（保底）：无 ES/DB 可用时降级于此，
 * 行为等同 adhoc v1 的原 {@code ConcurrentHashMap}——应用重启记录即丢失。
 *
 * <p>{@code jobs} 存作业本体，{@code order} 记插入顺序供 {@link #listRecent} 倒序。</p>
 */
public class InMemoryAdhocJobStore implements AdhocJobStore {

    private final Map<String, AdhocRebuildJob> jobs = new ConcurrentHashMap<>();
    /** 插入顺序，供 listRecent 倒序（新的在后，尾进）。 */
    private final Deque<String> order = new ConcurrentLinkedDeque<>();

    @Override
    public void save(AdhocRebuildJob job) {
        if (!jobs.containsKey(job.getJobId())) {
            order.addLast(job.getJobId());
        }
        jobs.put(job.getJobId(), job);
    }

    @Override
    public Optional<AdhocRebuildJob> find(String jobId) {
        return Optional.ofNullable(jobs.get(jobId));
    }

    @Override
    public List<AdhocRebuildJob> listRecent(int limit) {
        List<AdhocRebuildJob> out = new ArrayList<>();
        Iterator<String> it = order.descendingIterator();
        while (it.hasNext() && out.size() < limit) {
            AdhocRebuildJob j = jobs.get(it.next());
            if (j != null) {
                out.add(j);
            }
        }
        return out;
    }

    @Override
    public void remove(String jobId) {
        jobs.remove(jobId);
        order.remove(jobId);
    }
}
