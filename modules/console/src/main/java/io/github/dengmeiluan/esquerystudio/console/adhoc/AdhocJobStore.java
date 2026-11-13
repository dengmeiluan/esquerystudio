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

import java.util.List;
import java.util.Optional;

/**
 * Adhoc（无 provider）托管重建作业存储 SPI。照
 * {@link io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditStore} 范式：
 * 存储可插拔（Es/Jdbc/内存），由 {@code esquerystudio.elasticsearch.console.store} 开关 +
 * {@code @ConditionalOnMissingBean} 装配；宿主可注册自定义 Bean 完全接管。
 *
 * <p>契约红线：持久化永不反噬重建——{@link #save} 失败只记日志不上抛，
 * 重建该跑还跑。作业记录丢失是可接受的降级，拖垮正在跑的 reindex 不是。</p>
 *
 * @author aicoding
 */
public interface AdhocJobStore {

    /** 状态变更时 upsert（同 jobId 覆盖，不产生重复）。失败只记日志，不上抛。 */
    void save(AdhocRebuildJob job);

    /** 按 jobId 查；未命中返回 {@link Optional#empty()}。 */
    Optional<AdhocRebuildJob> find(String jobId);

    /** 最近 {@code limit} 条（新的在前），供列表页；重启后仍可见历史（内存实现除外）。 */
    List<AdhocRebuildJob> listRecent(int limit);

    /** 删除指定作业（worker 提交失败等需彻底清除，不留 RUNNING 僵尸）。失败只记日志，不上抛。 */
    void remove(String jobId);
}
