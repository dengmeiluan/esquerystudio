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

import io.github.dengmeiluan.esquerystudio.console.control.EntityIndexNames;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.elasticsearch.annotations.Mapping;
import org.springframework.data.elasticsearch.annotations.Setting;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 可重建 ES 索引注册表。
 *
 * <p>构造时接收一份已汇总好的 {@code List<ManagedEsIndex>}，逐个登记为 {@link RebuildableIndexMeta}。
 * <b> 起清单由 {@code ManagedEsIndexScanner} 扫描宿主基础包下全部 {@code @Document} 实体自动合成</b>——
 * 新增索引只需给实体加 {@code @Document}，<b>不要再手写 {@link ManagedEsIndex} 实现类</b>
 * （那条通道已废弃，残留实现会在启动期被 fail-fast 点名）。本类不感知清单从何而来（开闭原则）。
 * 用 {@link EntityIndexNames} 解析各 provider 实体的 @Document 索引名
 * （与实际读写一致， 起不依赖宿主 ops），反射读取 @Setting/@Mapping 的 json 资源，建为 {@link RebuildableIndexMeta}。</p>
 */
public class IndexMetaRegistry {

    private static final Logger logger = LoggerFactory.getLogger(IndexMetaRegistry.class);

    private final EntityIndexNames entityIndexNames;
    private final Map<String, RebuildableIndexMeta> registry = new LinkedHashMap<>();
    /** entityClass → indexKey 反查表，供切面在 peek 实参后按 entityClass 反查所属 indexKey */
    private final Map<Class<?>, String> entityIndex = new LinkedHashMap<>();

    public IndexMetaRegistry(EntityIndexNames entityIndexNames,
                             List<ManagedEsIndex> providers) {
        this.entityIndexNames = entityIndexNames;
        for (ManagedEsIndex provider : providers) {
            register(provider);
        }
        logger.info("[IndexMetaRegistry] registered indexKeys={}", registry.keySet());
    }

    private void register(ManagedEsIndex provider) {
        String indexKey = provider.indexKey();
        try {
            // 别名复用原索引名（对直连读写该索引的其它服务透明）：迁移后该名本身即别名，
            // 物理索引按 resolved + _v<时间戳> 滚动，故 aliasName 与 physicalPrefix 都取原名。
            Class<?> entityClass = provider.entityClass();
            String resolved = entityIndexNames.indexNameOf(entityClass);
            String settingsJson = readAnnotationPath(getSettingPath(entityClass));
            String mappingJson = readAnnotationPath(getMappingPath(entityClass));
            RebuildableIndexMeta meta = new RebuildableIndexMeta(provider, resolved, resolved, settingsJson, mappingJson);
            if (registry.putIfAbsent(indexKey, meta) != null) {
                throw new IllegalStateException("indexKey 重复登记: " + indexKey);
            }
            if (entityIndex.putIfAbsent(entityClass, indexKey) != null) {
                throw new IllegalStateException("entityClass 重复登记: " + entityClass.getName());
            }
        } catch (Exception e) {
            logger.error("[IndexMetaRegistry] register failed: indexKey={}", indexKey, e);
            throw new IllegalStateException("注册可重建索引失败: " + indexKey, e);
        }
    }

    private String getSettingPath(Class<?> entityClass) {
        Setting setting = entityClass.getAnnotation(Setting.class);
        return setting == null ? null : setting.settingPath();
    }

    private String getMappingPath(Class<?> entityClass) {
        Mapping mapping = entityClass.getAnnotation(Mapping.class);
        return mapping == null ? null : mapping.mappingPath();
    }

    private String readAnnotationPath(String path) throws IOException {
        if (path == null || path.isEmpty()) {
            return null;
        }
        try (InputStream is = new ClassPathResource(path).getInputStream()) {
            return StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        }
    }

    public RebuildableIndexMeta getByKey(String indexKey) {
        RebuildableIndexMeta meta = registry.get(indexKey);
        if (meta == null) {
            throw new IllegalArgumentException("未登记的可重建索引: " + indexKey + "，可选: " + registry.keySet());
        }
        return meta;
    }

    /**
     * 反查 entityClass 对应的 indexKey（切面 peek 实参拿到 entityClass 后用，决定该写入归属哪个 indexKey）。
     * @return indexKey；未登记返回 null。
     */
    public String resolveIndexKey(Class<?> entityClass) {
        return entityClass == null || entityClass == void.class ? null : entityIndex.get(entityClass);
    }

    public List<String> listIndexKeys() {
        return new ArrayList<>(registry.keySet());
    }

    /**
     * 全部登记元数据（按登记顺序）。：供 DesiredStateController 组装期望配置 payload。
     * 返回不可变视图，避免调用方改动内部 registry。
     */
    public List<RebuildableIndexMeta> listMetas() {
        return java.util.Collections.unmodifiableList(new ArrayList<>(registry.values()));
    }
}
