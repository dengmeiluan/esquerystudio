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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.control.EntityIndexNames;
import io.github.dengmeiluan.esquerystudio.console.control.EntityMappingDeriver;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.junit.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;

import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link DesiredStateController} 的<b>接线</b>守卫：它必须把 deriver 真的传下去。
 *
 * <p><b>为什么单靠 {@link DesiredStatePayloadTest} 不够</b>：那个类直接调
 * {@code DesiredStatePayload.of(metas, deriver)}，把 deriver 当参数喂进去。实测把控制器里的
 * {@code DesiredStatePayload.of(registry.listMetas(), mappingDeriver)} 改成传 {@code null} 后，
 * 全量 387 条测试<b>全绿</b> —— payload 逻辑写得再对，控制器不传 deriver 就等于这次改造没做，
 * 而没有任何测试会察觉。</p>
 *
 * <p>这条链是 basic（client 模式）唯一让索引「可见」的路径：
 * {@code DesiredStateController} 是「 业务侧唯一的运维端点」，人从它复制配置到 宿主；
 * 而 宿主 有 0 个 {@code @Document} 实体、<b>无法自己推导</b>，只能用被复制过去的那份。
 * 推导 mapping 掉在这里，索引就会被按 ES 动态推断重建，代码声明的字段类型静默丢失。</p>
 */
public class DesiredStateControllerWiringTest {

    /** 无 @Mapping 但有可映射属性 —— 推导结果必须出现在响应体里。 */
    @Document(indexName = "ctrl_derived_alias")
    static class CtrlDerivedES {
        @Field(type = FieldType.Keyword)
        private String ctrlProbeField;

        public String getCtrlProbeField() {
            return ctrlProbeField;
        }

        public void setCtrlProbeField(String ctrlProbeField) {
            this.ctrlProbeField = ctrlProbeField;
        }
    }

    private static String desiredStateBody() {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        ctx.refresh();
        // 无 ElasticsearchOperations Bean → EntityIndexNames 走裸 MappingContext 解析路径
        EntityIndexNames names = new EntityIndexNames(
                ctx.getBeanProvider(ElasticsearchOperations.class), ctx);
        ManagedEsIndex decl = new ManagedEsIndex() {
            @Override
            public Class<?> entityClass() {
                return CtrlDerivedES.class;
            }
        };
        IndexMetaRegistry registry = new IndexMetaRegistry(names, Collections.singletonList(decl));

        return new DesiredStateController(registry, new EntityMappingDeriver(ctx))
                .desiredState().getBody();
    }

    /**
     * 控制器必须把 deriver 传给 payload —— 判据是 {@code derivedMappingJson} 这个键的<b>值</b>里
     * 真的有推导内容。
     *
     * <p><b>这里踩过一个坑，记下来</b>：第一版断言写的是
     * {@code assertThat(body).contains("ctrlProbeField")} —— 那是<b>死断言</b>。
     * 因为 {@code EntityFieldScanner} 会把实体注解里的字段名输出到 {@code fields} 数组，
     * 所以无论控制器传不传 deriver，{@code ctrlProbeField} 都出现在响应体里。
     * 实测该变异下全量测试仍全绿。必须解析 JSON、只看 {@code derivedMappingJson} 的值。</p>
     */
    @Test
    public void responseCarriesDerivedMappingForEntityWithoutMappingAnnotation() throws Exception {
        String body = desiredStateBody();

        JsonNode row = new ObjectMapper().readTree(body).get(0);
        JsonNode derived = row.get("derivedMappingJson");

        assertThat(derived).as("derivedMappingJson 这个键必须存在").isNotNull();
        assertThat(derived.isNull())
                .as("控制器必须把 deriver 传下去：无 @Mapping 的实体，derivedMappingJson 不许是 null")
                .isFalse();
        assertThat(derived.asText())
                .as("derivedMappingJson 的值里应含实体 @Field 声明的字段")
                .contains("ctrlProbeField");
        // 同时确认 mappingJson 仍是 null —— 推导结果不许污染「未声明」这个态
        assertThat(row.get("mappingJson").isNull()).isTrue();
    }
}
