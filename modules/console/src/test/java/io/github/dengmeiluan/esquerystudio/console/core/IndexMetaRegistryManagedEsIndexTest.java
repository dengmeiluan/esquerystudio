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
import org.junit.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.elasticsearch.annotations.Document;

import java.util.Arrays;
import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * -3：钉住 {@link IndexMetaRegistry} 真的按 {@link ManagedEsIndex} 装配。
 *
 * <p><b>这条测试存在的理由</b>：本 Task 是纯改名，35 处引用替换。{@code ManagedEsIndexTest}
 * 只覆盖 {@code indexKey()} 的字符串逻辑（那段是逐字节复制的，永远不会红），
 * <b>覆盖不到「注册链路是否真的换成了新类型」这个本 Task 唯一的真实风险</b>。
 *
 * <p><b>它在什么情况下会红</b>：
 * <ul>
 *   <li>{@code IndexMetaRegistry} 构造第二参没换成 {@code List<ManagedEsIndex>} → 本文件编译不过；</li>
 *   <li>{@code RebuildableIndexMeta} 构造第一参 / {@code getProvider()} 没换 → 编译不过；</li>
 *   <li>装配链路被改坏（registry 不再登记 provider、indexKey 反推错、entityClass 反查表没建）
 *       → {@code getByKey} / {@code resolveIndexKey} / {@code listIndexKeys} 断言红；</li>
 *   <li>重复 indexKey 的防御被删掉 → 最后一条断言红。</li>
 * </ul>
 */
public class IndexMetaRegistryManagedEsIndexTest {

    @Document(indexName = "managed_probe_alias")
    static class ManagedProbeES { }

    @Document(indexName = "other_probe_alias")
    static class OtherProbeES { }

    /** 只实现 ManagedEsIndex —— 编译期即钉住 registry 收的就是这个类型。 */
    static class ManagedProbeIndex implements ManagedEsIndex {
        @Override
        public Class<?> entityClass() {
            return ManagedProbeES.class;
        }
    }

    static class OtherProbeIndex implements ManagedEsIndex {
        @Override
        public Class<?> entityClass() {
            return OtherProbeES.class;
        }
    }

    /**
     * 与 {@link ManagedProbeIndex} <b>indexKey 相同、entityClass 不同</b>。
     *
     * <p>{@code register()} 里两道防线的顺序是 <b>indexKey 在前、entityClass 在后</b>。
     * 本 fixture 让 indexKey 先撞上，从而<b>单独</b>触发 indexKey 那条分支。</p>
     */
    static class IndexKeyCollidingIndex implements ManagedEsIndex {
        @Override
        public Class<?> entityClass() {
            return OtherProbeES.class;
        }

        @Override
        public String indexKey() {
            return "managedProbe";
        }
    }

    /**
     * 与 {@link OtherProbeIndex} <b>entityClass 相同、indexKey 不同</b>。
     *
     * <p>因为 indexKey 那道防线在前，若两个 provider 的 indexKey 也相同（例如直接用两个
     * {@code OtherProbeIndex}），就会被 indexKey 分支先拦下，entityClass 分支<b>永远走不到</b>——
     * 那样的断言即使把 entityClass 去重整行删掉也照样绿（<b>已实测确认</b>）。
     * 故此处显式 override 出一个不冲突的 indexKey，把 entityClass 分支单独暴露出来。</p>
     */
    static class EntityClassCollidingIndex implements ManagedEsIndex {
        @Override
        public Class<?> entityClass() {
            return OtherProbeES.class;
        }

        @Override
        public String indexKey() {
            return "distinctKeySoOnlyEntityClassCollides";
        }
    }

    private IndexMetaRegistry registryOf(ManagedEsIndex... providers) {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        ctx.refresh();
        // 无 ElasticsearchOperations Bean → EntityIndexNames 走裸 MappingContext 解析路径
        EntityIndexNames names = new EntityIndexNames(
                ctx.getBeanProvider(org.springframework.data.elasticsearch.core.ElasticsearchOperations.class), ctx);
        return new IndexMetaRegistry(names, Arrays.asList(providers));
    }

    /** registry 按 ManagedEsIndex 装配，并从 entityClass 反推出 indexKey 登记。 */
    @Test
    public void registersManagedEsIndexByDerivedKey() {
        IndexMetaRegistry registry = registryOf(new ManagedProbeIndex());

        assertThat(registry.listIndexKeys()).containsExactly("managedProbe");

        RebuildableIndexMeta meta = registry.getByKey("managedProbe");
        assertThat(meta.getEntityClass()).isEqualTo(ManagedProbeES.class);
        assertThat(meta.getAliasName()).isEqualTo("managed_probe_alias");
    }

    /** meta 持有的 provider 句柄类型确实是 ManagedEsIndex（改名后的类型流经 meta）。 */
    @Test
    public void metaHoldsManagedEsIndexHandle() {
        IndexMetaRegistry registry = registryOf(new ManagedProbeIndex());

        ManagedEsIndex provider = registry.getByKey("managedProbe").getProvider();

        assertThat(provider).isInstanceOf(ManagedProbeIndex.class);
        assertThat(provider.entityClass()).isEqualTo(ManagedProbeES.class);
    }

    /** entityClass → indexKey 反查表建起来了（切面依赖它决定写入归属）。 */
    @Test
    public void resolvesIndexKeyByEntityClass() {
        IndexMetaRegistry registry = registryOf(new ManagedProbeIndex(), new OtherProbeIndex());

        assertThat(registry.resolveIndexKey(ManagedProbeES.class)).isEqualTo("managedProbe");
        assertThat(registry.resolveIndexKey(OtherProbeES.class)).isEqualTo("otherProbe");
        assertThat(registry.resolveIndexKey(String.class)).isNull();
    }

    /** 空 provider 列表可正常装配（client 模式宿主可能一个索引都没登记）。 */
    @Test
    public void acceptsEmptyProviderList() {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        ctx.refresh();
        EntityIndexNames names = new EntityIndexNames(
                ctx.getBeanProvider(org.springframework.data.elasticsearch.core.ElasticsearchOperations.class), ctx);

        IndexMetaRegistry registry = new IndexMetaRegistry(names, Collections.emptyList());

        assertThat(registry.listIndexKeys()).isEmpty();
    }

    /**
     * 重复 indexKey 必须在启动期炸掉，不许静默覆盖。
     * 两个 provider 的 entityClass <b>不同</b>，所以只可能由 indexKey 去重分支拦下。
     *
     * <p>注意 {@code register()} 用 {@code catch (Exception)} 把原始异常包了一层
     * （外层 message 是「注册可重建索引失败: xxx」），所以分支特征词只在 <b>cause</b> 上，
     * 必须用 {@code getRootCause} 断言——直接断外层 message 会漏掉「是哪道防线抛的」这一信息。</p>
     */
    @Test
    public void rejectsDuplicateIndexKey() {
        assertThatThrownBy(() -> registryOf(new ManagedProbeIndex(), new IndexKeyCollidingIndex()))
                .isInstanceOf(IllegalStateException.class)
                .getRootCause()
                .hasMessageContaining("indexKey 重复登记")
                .hasMessageContaining("managedProbe");
    }

    /**
     * 重复 entityClass 也必须炸掉（与 indexKey 去重是两条<b>独立</b>防线）。
     *
     * <p>两个 provider 的 indexKey <b>不同</b>，故 indexKey 那道在前的防线不会触发，
     * 只可能由 entityClass 分支拦下。断言里点名 {@code entityClass 重复登记}
     * 是为了让「到底哪道防线抛的」可区分——否则删掉 entityClass 去重后，
     * 异常仍可能由另一条分支抛出而让断言恒真（<b>本条正是这么复发过一次的</b>）。</p>
     */
    @Test
    public void rejectsDuplicateEntityClass() {
        assertThatThrownBy(() -> registryOf(new OtherProbeIndex(), new EntityClassCollidingIndex()))
                .isInstanceOf(IllegalStateException.class)
                .getRootCause()
                .hasMessageContaining("entityClass 重复登记")
                .hasMessageContaining(OtherProbeES.class.getName());
    }
}
