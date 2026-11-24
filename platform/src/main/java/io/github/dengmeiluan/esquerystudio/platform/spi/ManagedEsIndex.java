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

package io.github.dengmeiluan.esquerystudio.platform.spi;

/**
 * 声明一个由本项目统一管理的 ES 索引 —— 业务侧唯一需要实现的核心契约。
 *
 * <p>每个受管索引由接入方实现一个 {@code @Component}，把「索引身份」这一最小业务知识
 * 内聚到各自模块旁，由 starter 的 {@code IndexMetaRegistry} 通过 {@code List} 集合注入自动发现并登记。</p>
 *
 * <p>这样核心编排件（registry / service）只依赖本抽象，不反向依赖具体业务 service，
 * 新增索引 = 新增一个实现类，registry 一行不改（满足开闭原则与依赖倒置）。</p>
 *
 * <p> 阶段⑤起本接口语义收窄为业务侧<b>声明受管索引</b>，而非<b>提供重建能力</b>——
 * 重建执行已迁往 宿主侧，业务应用不再背控制台。{@code fullReload()} 与
 * {@code PhysicalDeletionAware} / {@code IncrementalReplayable} 两个能力接口
 * 已随 SPI 重建路径一并退役（阶段④真实演练通过后执行）。</p>
 *
 * @author aicoding
 */
public interface ManagedEsIndex {

    /**
     * 运维接口传参用的逻辑标识，须全局唯一（如 {@code bondQuoteInfo}）。
     *
     * <p><b>K 阶段约定大于配置</b>：default 实现从 {@link #entityClass()} 反推：
     * <pre>
     *   AssetBasicInfoES   → assetBasicInfo
     *   BondQuoteES  → bondQuoteInfo
     *   FooBar             → fooBar
     * </pre>
     * 接入方仅需 override {@link #entityClass()}，{@code indexKey()} 自动从类名推出，无需手写。
     * 历史命名不匹配的索引可显式 override 本方法指定。</p>
     */
    default String indexKey() {
        String simple = entityClass().getSimpleName();
        if (simple.endsWith("ES") && simple.length() > 2) {
            simple = simple.substring(0, simple.length() - 2);
        }
        return Character.toLowerCase(simple.charAt(0)) + simple.substring(1);
    }

    /**
     * ES 实体类（带 {@code @Document}），用于解析索引名与读取 {@code @Setting}/{@code @Mapping}。
     */
    Class<?> entityClass();
}
