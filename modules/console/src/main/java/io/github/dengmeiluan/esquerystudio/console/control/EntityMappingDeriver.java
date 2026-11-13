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

package io.github.dengmeiluan.esquerystudio.console.control;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.data.elasticsearch.core.convert.MappingElasticsearchConverter;
import org.springframework.data.elasticsearch.core.index.MappingBuilder;
import org.springframework.data.elasticsearch.core.mapping.SimpleElasticsearchMappingContext;

/**
 * 从实体注解离线推导 mapping JSON —— 补齐 spring-data-es 次序里「配置之后、动态映射之前」那一级。
 *
 * <p><b>为什么需要它</b>：sdes 4.0.9 的 {@code AbstractDefaultIndexOperations.createMapping(Class)}
 * 是「先 {@code @Mapping.mappingPath()} 配置，否则 {@code buildMapping} 走注解推导」。
 * 而 {@code IndexNameResolver} 原先只有「@Mapping → 复制旧索引 → 动态映射」，
 * 缺了注解推导这一级。{@code @Mapping} 对接入方是<b>可选</b>的，不能强要求。</p>
 *
 * <p><b>离线</b>：只用裸 {@link SimpleElasticsearchMappingContext}，<b>不要</b>
 * {@code ElasticsearchOperations} —— 与 {@code EntityIndexNames} 同一条路径，
 * 守住 /「宿主零 ES 依赖」的地基。</p>
 */
public class EntityMappingDeriver {

    private static final Logger logger = LoggerFactory.getLogger(EntityMappingDeriver.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final MappingBuilder mappingBuilder;

    public EntityMappingDeriver(ApplicationContext applicationContext) {
        SimpleElasticsearchMappingContext context = new SimpleElasticsearchMappingContext();
        // 必须挂 ApplicationContext：@Document indexName 的 SpEL 依赖 BeanFactoryResolver
        context.setApplicationContext(applicationContext);
        MappingElasticsearchConverter converter = new MappingElasticsearchConverter(context);
        converter.afterPropertiesSet();
        this.mappingBuilder = new MappingBuilder(converter);
    }

    /**
     * 推导实体的 mapping JSON。
     *
     * @return mapping JSON；实体无可映射属性（推导结果 {@code properties} 为空）或推导失败时返回 {@code null}
     */
    public String derive(Class<?> entityClass) {
        if (entityClass == null) {
            return null;
        }
        String json;
        try {
            json = mappingBuilder.buildPropertyMapping(entityClass);
        } catch (Exception e) {
            // 推导失败不该拖垮重建：调用方会继续落到「从旧索引复制」那一级
            logger.warn("[EntityMappingDeriver] 注解推导 mapping 失败，将回落下一级: {}",
                    entityClass.getName(), e);
            return null;
        }
        return hasProperties(json) ? json : null;
    }

    /**
     * 解析<b>代码声明的</b> mapping：第 ① 级 {@code @Mapping} 原文 → 第 ② 级注解推导 → 都没有则 null。
     *
     * <p><b>为什么要有这个方法</b>：重建（{@code IndexNameResolver.resolveMappingJson}）与
     * 启动期配置校验（{@code ConfigValidationStartupRunner}）必须对「代码声明了哪份 mapping」
     * 有<b>完全一致</b>的答案。此前校验器直接用 {@code @Mapping} 原文，而重建会回落到注解推导，
     * 于是校验放绿灯的那份配置不是重建实际会应用的那份。把这两级收敛在这里，两边共用同一实现，
     * 不再各写一遍而漂移。</p>
     *
     * <p><b>不含第 ③ 级「从旧索引复制」</b>：那是重建时的运行期兜底，需要 ES 客户端；
     * 且旧索引的 mapping 本来就已被 ES 接受过，拿它去校验没有意义。</p>
     *
     * @param mappingJson {@code @Mapping} 的原文（{@code RebuildableIndexMeta.getMappingJson()}）
     * @param entityClass 实体类，用于注解推导
     * @return 代码声明的 mapping JSON；两级都拿不到时返回 {@code null}
     */
    public String declaredOrDerived(String mappingJson, Class<?> entityClass) {
        if (mappingJson != null && !mappingJson.isEmpty()) {
            return mappingJson;
        }
        return derive(entityClass);
    }

    /**
     * 判定推导结果是否有实际内容。
     *
     * <p><b>这个守卫承重</b>：无可映射属性的实体会推出 {@code {"properties":{}}}（已实测）。
     * 若把它当有效结果返回，会<b>遮蔽</b>调用方的「从旧索引复制 mapping」那一级，
     * 让本可复制的索引退化成空 mapping —— 比不加注解推导这一级更糟。</p>
     */
    private static boolean hasProperties(String json) {
        if (json == null || json.isEmpty()) {
            return false;
        }
        try {
            JsonNode properties = JSON.readTree(json).path("properties");
            return properties.isObject() && properties.size() > 0;
        } catch (Exception e) {
            logger.warn("[EntityMappingDeriver] 推导结果不是合法 JSON，将回落下一级", e);
            return false;
        }
    }
}
