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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;

/**
 * 迁移能力启动钩子（仿 {@code EsRebuildBootstrapRunner}，ApplicationReadyEvent 后异步、不阻塞启动）：
 * ① 建迁移作业索引；② 清扫上次进程遗留的 RUNNING 作业为 INTERRUPTED（凭据随进程消失，需 resume 重录）。
 */
public class MigrateBootstrapRunner {

    private static final Logger logger = LoggerFactory.getLogger(MigrateBootstrapRunner.class);

    private final MigrateJobStore jobStore;
    private final MigrateJobTracker tracker;
    private final RunningMigrations running;

    public MigrateBootstrapRunner(MigrateJobStore jobStore, MigrateJobTracker tracker, RunningMigrations running) {
        this.jobStore = jobStore;
        this.tracker = tracker;
        this.running = running;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        Thread t = new Thread(() -> {
            try {
                jobStore.ensureIndex();
                tracker.sweepInterrupted(running);
            } catch (Exception e) {
                logger.warn("[MigrateBootstrapRunner] bootstrap failed: {}", e.getMessage(), e);
            }
        }, "esquerystudio-xmigrate-bootstrap");
        t.setDaemon(true);
        t.start();
    }
}
