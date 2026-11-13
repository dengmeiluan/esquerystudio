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

/**
 * 迁移期目标索引调优档（全部作用于 dynamic settings，运行时可改、收尾还原，不重启）。
 *
 * <ul>
 *   <li>{@link #AGGRESSIVE}：{@code refresh_interval=-1} + {@code number_of_replicas=0}
 *       + {@code translog.durability=async} + 调大 {@code flush_threshold_size}。
 *       吞吐最大化，适合「目标索引尚未对外查询、先回填后切流」。</li>
 *   <li>{@link #GENTLE}：仅把 {@code refresh_interval} 拉长（如 30s），保留副本与 translog。
 *       适合「目标索引已对外查询、边查边回填」，吞吐让步于可见性/可用性。</li>
 * </ul>
 */
public enum TuneMode {
    AGGRESSIVE,
    GENTLE
}
