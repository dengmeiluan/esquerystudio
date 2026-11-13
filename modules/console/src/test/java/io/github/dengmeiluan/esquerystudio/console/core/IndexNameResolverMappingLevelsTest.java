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
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.junit.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code resolveMappingJson} 的四级次序：@Mapping → 注解推导 → 复制旧索引 → 动态映射(null)。
 *
 * <p><b>为什么必须逐级测</b>：次序错了不会有任何报错，只会让新索引拿到<b>错的</b> mapping。
 * 每条断言都设计成只对「它那一级」敏感 —— 上一级存在时下一级不许被调用，
 * 否则「优先 @Mapping 配置」这条就成了摆设。</p>
 */
public class IndexNameResolverMappingLevelsTest {

    @Document(indexName = "lvl_probe_alias")
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

    /** 无可映射属性 → 注解推导产出空 properties → 守卫返回 null → 应落到复制那一级。 */
    @Document(indexName = "lvl_empty_alias")
    static class EmptyES {
    }

    /** 可编排的 admin：记录 getMapping 是否被调用过，并可设定它返回什么。 */
    private static final class StubAdmin extends EsIndexAdmin {
        String oldMapping;
        int getMappingCalls;

        StubAdmin(String oldMapping) {
            super(null);
            this.oldMapping = oldMapping;
        }

        @Override
        public String getMapping(String index) throws IOException {
            getMappingCalls++;
            return oldMapping;
        }
    }

    private static RebuildableIndexMeta metaOf(final Class<?> entityClass, String mappingJson) {
        ManagedEsIndex provider = new ManagedEsIndex() {
            @Override
            public Class<?> entityClass() {
                return entityClass;
            }
        };
        return new RebuildableIndexMeta(provider, "alias", "alias", null, mappingJson);
    }

    private static IndexNameResolver resolverOf(StubAdmin admin) {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        ctx.refresh();
        return new IndexNameResolver(admin, new ESQueryStudioElasticsearchProperties(), new EntityMappingDeriver(ctx));
    }

    /**
     * 第 ① 级：有 @Mapping 就用它，**且不许去碰旧索引**。
     *
     * <p>断言 getMappingCalls == 0 是关键：只断返回值的话，实现若先复制旧索引再覆盖，
     * 断言照样绿，而那已经多打了一次 ES 请求、次序也错了。</p>
     */
    @Test
    public void level1_explicitMappingWinsAndDoesNotTouchOldIndex() throws IOException {
        StubAdmin admin = new StubAdmin("{\"properties\":{\"fromOld\":{\"type\":\"text\"}}}");
        String declared = "{\"properties\":{\"declared\":{\"type\":\"keyword\"}}}";

        String resolved = resolverOf(admin).resolveMappingJson(metaOf(ProbeES.class, declared), "src", "k");

        assertThat(resolved).isEqualTo(declared);
        assertThat(admin.getMappingCalls).isZero();
    }

    /**
     * 第 ② 级：无 @Mapping 时用注解推导，**且不许去碰旧索引**。
     *
     * <p>这是本 Task 新增的一级。断言 getMappingCalls == 0 钉住「注解推导在复制之前」，
     * 也就是 spring-data-es 的次序。</p>
     */
    @Test
    public void level2_derivedFromAnnotationsWinsOverOldIndexCopy() throws IOException {
        StubAdmin admin = new StubAdmin("{\"properties\":{\"fromOld\":{\"type\":\"text\"}}}");

        String resolved = resolverOf(admin).resolveMappingJson(metaOf(ProbeES.class, null), "src", "k");

        assertThat(resolved).contains("\"code\"");
        assertThat(resolved).doesNotContain("fromOld");
        assertThat(admin.getMappingCalls).isZero();
    }

    /**
     * 第 ③ 级：注解推导产出空 properties 时，落到复制旧索引。
     *
     * <p>这条钉住守卫真的生效了。少了守卫，空 mapping 会遮蔽这一级。</p>
     */
    @Test
    public void level3_copiesFromOldIndexWhenDerivedIsEmpty() throws IOException {
        StubAdmin admin = new StubAdmin("{\"properties\":{\"fromOld\":{\"type\":\"text\"}}}");

        String resolved = resolverOf(admin).resolveMappingJson(metaOf(EmptyES.class, null), "src", "k");

        assertThat(resolved).contains("fromOld");
        assertThat(admin.getMappingCalls).isEqualTo(1);
    }

    /** 第 ④ 级：三级都没有 → 返回 null（交给 ES 动态映射）。 */
    @Test
    public void level4_returnsNullWhenNothingAvailable() throws IOException {
        StubAdmin admin = new StubAdmin(null);

        String resolved = resolverOf(admin).resolveMappingJson(metaOf(EmptyES.class, null), "src", "k");

        assertThat(resolved).isNull();
    }
}
