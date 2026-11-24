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
import io.github.dengmeiluan.esquerystudio.console.core.scanfixture.ScanAlphaES;
import io.github.dengmeiluan.esquerystudio.console.core.scanfixture.ScanBetaES;
import io.github.dengmeiluan.esquerystudio.console.core.scanfixture.ScanNoMappingES;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.junit.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 受管索引自动发现：扫描 / 合成 / 残留手写 provider 报错 / 撞 key 仍抛 / 无宿主包降级。
 *
 * <p><b>本测试类要防的核心失败模式</b>：业务侧加了 @Document 却因为没写样板 provider
 * 而对控制台不可见（实测生产里 8 个实体只有 1 个可见）。以及三个反向失败模式：
 * 残留的手写 provider 被静默丢弃、不同包同简名实体撞 key 被静默去重、
 * 非 Boot 宿主下 AutoConfigurationPackages 缺失把 starter 炸掉。</p>
 */
public class ManagedEsIndexScannerTest {

    private static final String FIXTURE_PKG = "io.github.dengmeiluan.esquerystudio.console.core.scanfixture";
    private static final String DUPKEY_PKG = "io.github.dengmeiluan.esquerystudio.console.core.scanfixture.dupkey";

    /** 残留的手写 provider —— 通道已废，出现它必须报错。 */
    static class LeftoverProvider implements ManagedEsIndex {
        @Override
        public Class<?> entityClass() {
            return ScanAlphaES.class;
        }
    }

    private IndexMetaRegistry registryOf(List<ManagedEsIndex> providers) {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        ctx.refresh();
        // 无 ElasticsearchOperations Bean → EntityIndexNames 走裸 MappingContext 解析路径
        EntityIndexNames names = new EntityIndexNames(
                ctx.getBeanProvider(ElasticsearchOperations.class), ctx);
        return new IndexMetaRegistry(names, providers);
    }

    /** 判据 1：扫到基础包下全部 @Document 类，一个不漏一个不多。 */
    @Test
    public void scanFindsEveryDocumentEntityInPackage() {
        List<Class<?>> found = ManagedEsIndexScanner.scan(Collections.singletonList(FIXTURE_PKG));

        assertThat(found).contains(ScanAlphaES.class, ScanBetaES.class, ScanNoMappingES.class);
        assertThat(found).hasSize(5); // 三个常规 + dupkey 两个同简名（子包也在扫描范围内）
    }

    /** 判据 2：合成体的 indexKey 走 default 反推，entityClass 是传入那个。 */
    @Test
    public void synthesizeDerivesIndexKeyFromEntityClass() {
        List<ManagedEsIndex> synthesized = ManagedEsIndexScanner.synthesize(
                Collections.<Class<?>>singletonList(ScanAlphaES.class));

        assertThat(synthesized).hasSize(1);
        assertThat(synthesized.get(0).entityClass()).isEqualTo(ScanAlphaES.class);
        assertThat(synthesized.get(0).indexKey()).isEqualTo("scanAlpha");
    }

    /**
     * 判据 3：扫出来的实体真的能被 registry 登记成 key。
     *
     * <p>只扫三个常规 fixture 所在的精确包名会连子包一起扫到，故这里显式用
     * synthesize(三个类) 而非 scan()，把「登记」与「扫描范围」两件事分开测。</p>
     */
    @Test
    public void registryRegistersEverySynthesizedEntity() {
        IndexMetaRegistry registry = registryOf(ManagedEsIndexScanner.synthesize(
                Arrays.<Class<?>>asList(ScanAlphaES.class, ScanBetaES.class, ScanNoMappingES.class)));

        assertThat(registry.listIndexKeys())
                .containsExactlyInAnyOrder("scanAlpha", "scanBeta", "scanNoMapping");

        // 规格 §2.5：@Mapping 对接入方是**可选**的。无它照样登记成功，且 hasMapping() 为 false——
        // 钉住「无 @Mapping 就跳过该实体」这种过滤永不得出珰。
        assertThat(registry.getByKey("scanNoMapping").hasMapping()).isFalse();
        assertThat(registry.getByKey("scanAlpha").hasMapping()).isTrue();
    }

    /**
     * 判据 4：残留的手写 provider → **启动期抛异常并点名违规类**。
     *
     * <p>通道已废（规格 §2.2）。选报错而不是静默忽略：静默忽略会让接入方以为自己写的
     * provider 生效了（比如以为 override 的 indexKey() 起作用了），而实际被丢弃 ——
     * 那种失效没人会发现。</p>
     */
    @Test
    public void discoverRejectsLeftoverHandwrittenProvider() {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        ctx.refresh();

        assertThatThrownBy(() -> ManagedEsIndexScanner.discover(
                Collections.<ManagedEsIndex>singletonList(new LeftoverProvider()), ctx.getBeanFactory()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("LeftoverProvider")
                .hasMessageContaining("@Document");
    }

    /**
     * 判据 5：不同包下同简名实体撞 indexKey → 仍然 fail-fast。
     *
     * <p>自动发现才会出现的冲突（规格 §2.3）。若被静默去重，控制台会指着一个 key
     * 操作另一个索引。异常被 register() 的 catch(Exception) 包了一层，
     * 故分支特征词只在 cause 上，必须用 getRootCause。</p>
     */
    @Test
    public void duplicateIndexKeyFromSameSimpleNameStillFailsFast() {
        List<ManagedEsIndex> synthesized = ManagedEsIndexScanner.synthesize(
                ManagedEsIndexScanner.scan(Collections.singletonList(DUPKEY_PKG)));

        assertThat(synthesized).hasSize(2);
        assertThatThrownBy(() -> registryOf(synthesized))
                .isInstanceOf(IllegalStateException.class)
                .getRootCause()
                .hasMessageContaining("indexKey 重复登记")
                .hasMessageContaining("sameName");
    }

    /**
     * 判据 6：宿主没有 AutoConfigurationPackages 时退化为空清单、不抛异常。
     *
     * <p>AutoConfigurationPackages.get(beanFactory) 在缺该 bean 时会抛 IllegalStateException。
     * 纯 AnnotationConfigApplicationContext（无 @EnableAutoConfiguration）就是这种宿主，
     * 单测环境与某些精简宿主都会命中。不 guard 就等于给 starter 加一个新的启动崩溃点。</p>
     */
    @Test
    public void discoverDegradesWhenHostHasNoAutoConfigurationPackages() {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        ctx.refresh();

        List<ManagedEsIndex> discovered = ManagedEsIndexScanner.discover(
                Collections.<ManagedEsIndex>emptyList(), ctx.getBeanFactory());

        assertThat(discovered).isEmpty();
    }
}
