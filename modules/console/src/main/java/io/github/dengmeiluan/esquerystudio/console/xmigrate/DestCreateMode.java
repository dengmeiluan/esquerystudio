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
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;

/**
 * 目标索引创建模式。
 *
 * <ul>
 *   <li>{@link #NONE}：目标索引已由新应用（@Document 启动建索引）建好，迁移工具只校验存在、只灌数；</li>
 *   <li>{@link #COPY_FROM_SOURCE}：从旧集群源索引拷贝 mapping 到新集群建目标索引；</li>
 *   <li>{@link #FROM_ENTITY}：按已注册 {@code ManagedEsIndex} 的 entityClass 解析 settings+mapping 建目标索引。</li>
 * </ul>
 */
public enum DestCreateMode {
    NONE,
    COPY_FROM_SOURCE,
    FROM_ENTITY,
    /** 删除已有目标索引(含数据),再按源结构建新索引 */
    REBUILD
}
