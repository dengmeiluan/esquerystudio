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

import org.junit.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 离线从实体注解推导 mapping —— 对齐 spring-data-es「先 @Mapping 配置、否则注解推导」的次序。
 *
 * <p><b>承重点</b>：必须**不依赖 ElasticsearchOperations**（/「宿主零 ES 依赖」是地基，
 * 无 ES Bean 的宿主连启动都不能被拖累）。本测试全程只有裸 ApplicationContext，
 * 一旦实现偷偷去要 ops，这里会直接失败。</p>
 */
public class EntityMappingDeriverTest {

    @Document(indexName = "deriver_probe_alias")
    static class ProbeES {
        @Field(type = FieldType.Keyword)
        private String code;

        public String getCode() {
            return code;
        }

        public void setCode(String code) {
            this.code = code;
        }
    }

    /** 无任何可映射属性 —— 推导会产出 properties 为空的 mapping。 */
    @Document(indexName = "deriver_empty_alias")
    static class EmptyES {
    }

    private EntityMappingDeriver deriver() {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        ctx.refresh();
        return new EntityMappingDeriver(ctx);
    }

    /** 判据 1：有可映射属性时推出真实 mapping，且类型来自 @Field。 */
    @Test
    public void derivesRealMappingFromFieldAnnotations() {
        String json = deriver().derive(ProbeES.class);

        assertThat(json).isNotNull();
        assertThat(json).contains("\"code\"");
        assertThat(json).contains("keyword");
    }

    /**
     * 判据 2：推导结果 properties 为空时返回 null。
     *
     * <p>这条是守卫：若不返回 null，空 mapping 会**遮蔽「从旧索引复制」那一级**，
     * 让本可复制的索引退化成空 mapping —— 比不加注解推导更糟。</p>
     */
    @Test
    public void returnsNullWhenDerivedPropertiesAreEmpty() {
        assertThat(deriver().derive(EmptyES.class)).isNull();
    }

    /** 判据 3：null 入参不抛，返回 null（调用方不必先判空）。 */
    @Test
    public void returnsNullForNullEntityClass() {
        assertThat(deriver().derive(null)).isNull();
    }
}
