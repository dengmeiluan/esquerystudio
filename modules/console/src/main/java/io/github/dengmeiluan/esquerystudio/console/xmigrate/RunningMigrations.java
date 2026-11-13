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

import java.util.Collection;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 活跃迁移注册表：{@code jobId → } {@link MigrationHandle}。
 *
 * <p>仅进程内有效（凭据随之只在内存）。重启即空，遗留 RUNNING 作业由
 * {@link MigrateJobTracker#sweepInterrupted(RunningMigrations)} 标为 INTERRUPTED。</p>
 */
public class RunningMigrations {

    private final ConcurrentHashMap<String, MigrationHandle> handles = new ConcurrentHashMap<>();

    public void register(MigrationHandle handle) {
        handles.put(handle.getJobId(), handle);
    }

    /** 原子注册：isRunning 检查与 register 之间的窗口里并发 resume 同一作业会建双执行器
     *  双写目标索引——占位失败即已有实例在跑，调用方按「仍在运行」拒绝。 */
    public boolean registerIfAbsent(MigrationHandle handle) {
        return handles.putIfAbsent(handle.getJobId(), handle) == null;
    }

    public MigrationHandle get(String jobId) {
        return handles.get(jobId);
    }

    public void remove(String jobId) {
        handles.remove(jobId);
    }

    public boolean isRunning(String jobId) {
        return handles.containsKey(jobId);
    }

    public Collection<MigrationHandle> all() {
        return handles.values();
    }
}
