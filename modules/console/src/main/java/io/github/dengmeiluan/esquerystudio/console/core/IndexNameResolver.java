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

package io.github.dengmeiluan.esquerystudio.console.core;

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.control.EntityMappingDeriver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 索引名解析器（R1 SRP 抽取）：把"下个物理索引名 / 旧索引兜底 mapping" 两类
 * 索引名相关的逻辑从 {@link EsIndexRebuildService} 抽出，service 不必再到处持 versionFormat / esIndexAdmin。
 *
 * <p> 阶段⑤：{@code resolvePhysical}（从作业记录自取并校验物理索引名）随 SPI 重建路径
 * 与作业追踪一并退役。</p>
 *
 * @author aicoding
 */
public class IndexNameResolver {

    private static final Logger logger = LoggerFactory.getLogger(IndexNameResolver.class);

    private final EsIndexAdmin esIndexAdmin;
    private final DateTimeFormatter versionFormat;
    private final EntityMappingDeriver mappingDeriver;

    public IndexNameResolver(EsIndexAdmin esIndexAdmin, ESQueryStudioElasticsearchProperties properties,
                             EntityMappingDeriver mappingDeriver) {
        this.esIndexAdmin = esIndexAdmin;
        this.versionFormat = DateTimeFormatter.ofPattern(properties.getVersionFormat());
        this.mappingDeriver = mappingDeriver;
    }

    /**
     * 生成本次重建的下个物理索引名 {@code 前缀_v时间戳}。
     */
    public String nextPhysical(RebuildableIndexMeta meta) {
        return meta.getPhysicalIndexPrefix() + "_v" + LocalDateTime.now().format(versionFormat);
    }

    /**
     * 解析建新索引用的 mappingJson，四级次序（对齐 spring-data-es 的
     * {@code createMapping}：先配置、后注解）：
     *
     * <ol>
     *   <li>实体声明了 {@code @Mapping} → 用之（接入方权威意图）</li>
     *   <li>注解推导有实际内容 → 用之。{@code @Mapping} 对接入方是<b>可选</b>的，
     *       不能强要求；实体注解是代码声明的意图，优于从旧索引继承漂移</li>
     *   <li>旧索引有 mapping → 复制（防新索引动态映射漂移）</li>
     *   <li>都没有 → 返回 null（动态映射兜底）并告警</li>
     * </ol>
     */
    public String resolveMappingJson(RebuildableIndexMeta meta, String sourceIndex, String indexKey) throws IOException {
        // 第 ①②级与启动期配置校验共用 declaredOrDerived，避免两边各写一遍而漂移
        String declared = mappingDeriver == null
                ? meta.getMappingJson()
                : mappingDeriver.declaredOrDerived(meta.getMappingJson(), meta.getEntityClass());
        if (declared != null && !declared.isEmpty()) {
            if (!meta.hasMapping()) {
                logger.info("[IndexNameResolver] indexKey={} 实体无 @Mapping，用注解推导 mapping"
                        + "（对齐 spring-data-es 的「先配置、后注解」次序）", indexKey);
            }
            return declared;
        }
        String copied = esIndexAdmin.getMapping(sourceIndex);
        if (copied != null && !copied.isEmpty()) {
            logger.info("[IndexNameResolver] indexKey={} 实体无 @Mapping 且注解推导为空，"
                    + "从旧索引 {} 复制 mapping，防新索引动态映射漂移", indexKey, sourceIndex);
            return copied;
        }
        logger.warn("[IndexNameResolver] indexKey={} 无 @Mapping、注解推导为空、旧索引 {} 也无 mapping，"
                + "新索引将依赖 ES 动态映射", indexKey, sourceIndex);
        return null;
    }
}
