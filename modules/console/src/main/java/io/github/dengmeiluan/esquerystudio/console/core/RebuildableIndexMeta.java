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

import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;

/**
 * 可重建 ES 索引的元数据。
 *
 * <p>读写都走 {@link #aliasName} 别名，物理索引按 {@code physicalIndexPrefix + "_v" + 时间戳} 命名，
 * 由别名的 is_write_index 路由到当前物理索引。</p>
 *
 * <p>仅承载由 ES 实体解析出的<b>基础设施元数据</b>（别名/前缀/settings/mapping）+ 业务策略
 * {@link ManagedEsIndex} 句柄。 阶段⑤起业务侧契约收窄为「声明受管索引」，
 * 物理删除追删 / 增量重放 / 全量回灌等能力接口已随 SPI 重建路径一并退役。</p>
 */
public class RebuildableIndexMeta {

    /**
     * 业务策略提供者（索引身份的唯一来源）
     */
    private final ManagedEsIndex provider;

    /**
     * 读写别名名（由 @Document.indexName 解析占位符后得到）
     */
    private final String aliasName;

    /**
     * 物理索引名前缀，实际物理索引为 {@code 前缀 + "_v" + 时间戳}。
     *
     * <p><b>当前与 {@link #aliasName} 恒为同一取值</b>：别名复用原索引名（对直连读写该索引的其它服务透明），
     * 迁移后该名本身即别名，物理索引按 {@code resolved + _v<时间戳>} 滚动，
     * 故 {@code IndexMetaRegistry.register} 对两者都传 resolved 后的原名。
     * 二者是<b>语义不同的两个字段</b>，消费方不得依赖其相等，也不得由别名反推前缀。</p>
     */
    private final String physicalIndexPrefix;

    /**
     * settings json（来自 @Setting.settingPath），可能为 null（如无 @Setting 注解的实体）
     */
    private final String settingsJson;

    /**
     * mapping json（来自 @Mapping.mappingPath），可能为 null（如无 @Mapping 注解的实体）
     */
    private final String mappingJson;

    public RebuildableIndexMeta(ManagedEsIndex provider, String aliasName, String physicalIndexPrefix,
                                String settingsJson, String mappingJson) {
        this.provider = provider;
        this.aliasName = aliasName;
        this.physicalIndexPrefix = physicalIndexPrefix;
        this.settingsJson = settingsJson;
        this.mappingJson = mappingJson;
    }

    public String getIndexKey() {
        return provider.indexKey();
    }

    public Class<?> getEntityClass() {
        return provider.entityClass();
    }

    /**
     * 业务策略提供者（包内可见，供契约校验器探测能力接口 default 方法是否被 override）。
     */
    ManagedEsIndex getProvider() {
        return provider;
    }

    public String getAliasName() {
        return aliasName;
    }

    public String getPhysicalIndexPrefix() {
        return physicalIndexPrefix;
    }

    public String getSettingsJson() {
        return settingsJson;
    }

    public String getMappingJson() {
        return mappingJson;
    }

    public boolean hasMapping() {
        return mappingJson != null && !mappingJson.isEmpty();
    }
}
