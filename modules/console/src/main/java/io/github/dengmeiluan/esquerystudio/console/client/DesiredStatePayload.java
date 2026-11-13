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

package io.github.dengmeiluan.esquerystudio.console.client;

import io.github.dengmeiluan.esquerystudio.console.control.EntityMappingDeriver;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 把登记的索引元数据转成「可一键复制到 宿主」的 payload。
 *
 * <p>纯函数、无 IO、无 Spring 依赖，可穷举单测。字段全部来自 {@link RebuildableIndexMeta}
 * 已有的 getter，零新增数据源、<b>零 ES 读取</b>（这是 client 模式不装 EsIndexAdmin 的前提）。</p>
 *
 * <p>键序刻意固定：人复制出来的 JSON 要可读、可 diff；键序漂移会让两次复制产出不同文本。</p>
 */
public final class DesiredStatePayload {

    private DesiredStatePayload() {
    }

    public static List<Map<String, Object>> of(List<RebuildableIndexMeta> metas,
                                              EntityMappingDeriver deriver) {
        if (metas == null || metas.isEmpty()) {
            return Collections.emptyList();
        }
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>(metas.size());
        for (RebuildableIndexMeta meta : metas) {
            Map<String, Object> row = new LinkedHashMap<String, Object>();
            row.put("indexKey", meta.getIndexKey());
            row.put("entityClass", meta.getEntityClass().getName());
            row.put("alias", meta.getAliasName());
            row.put("physicalIndexPrefix", meta.getPhysicalIndexPrefix());
            row.put("settingsJson", meta.getSettingsJson());
            // 实体无 @Mapping 时为 null，原样透出。
            //  起 null **不再等同于**「将由 ES 动态推断」—— 还要看下面的 derivedMappingJson：
            // 两者皆 null 才是动态推断。宿主的二次确认判据须按这两个键合看。
            row.put("mappingJson", meta.getMappingJson());
            // mappingParsed 是「本索引 mappingJson」的属性（per-index），故置于 row 级而非每个字段行。
            // 与上一行的 mappingJson 合看可分三态：未声明(null) / 已声明且解析成功 / 已声明但解析失败。
            row.put("mappingParsed", EntityFieldScanner.mappingParsed(meta.getMappingJson()));
            // 实体无 @Mapping 时，重建实际会应用的是**注解推导**出的 mapping
            // （见 IndexNameResolver.resolveMappingJson 第②级）。宿主 没有接入方的实体类、
            // 无法自己推导，故必须由本 payload 带过去，否则复制过去的配置会丢掉代码声明的字段类型。
            // 有 @Mapping 时恒为 null：那时 mappingJson 才是权威，不重复输出以免两份 mapping 打架。
            row.put("derivedMappingJson", derivedMappingOf(meta, deriver));
            // 字段级 date 兼容识别的原料。sdesVersion 决定 date 序列化行为。
            row.put("sdesVersion", EntityFieldScanner.sdesVersion());
            row.put("fields", EntityFieldScanner.scan(meta.getEntityClass(), meta.getMappingJson()));
            out.add(row);
        }
        return out;
    }

    /**
     * 仅当实体<b>没有</b> {@code @Mapping} 时才给出注解推导结果，否则 null。
     *
     * <p>{@code deriver} 允许为 null（调用方无推导能力时），此时恒返回 null ——
     * 退化为  之前的行为，而不是抛异常。</p>
     */
    private static String derivedMappingOf(RebuildableIndexMeta meta, EntityMappingDeriver deriver) {
        if (deriver == null || meta.hasMapping()) {
            return null;
        }
        return deriver.derive(meta.getEntityClass());
    }
}
