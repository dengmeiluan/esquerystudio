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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.autoconfigure.AutoConfigurationPackages;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.util.ClassUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * 受管索引自动发现：把宿主基础包里全部带 {@link Document} 的实体登记为受管索引，
 * 业务侧不必再为每个索引手写一个 {@link ManagedEsIndex} 样板 {@code @Component}。
 *
 * <p><b>为什么能自动推</b>：{@link ManagedEsIndex} 语义早已收窄为「声明身份」——
 * {@code indexKey()} 是 default、从 {@code entityClass()} 反推；索引名来自 {@code @Document}；
 * settings/mapping 来自 {@code @Setting}/{@code @Mapping}。样板类里只剩一行
 * {@code return XxxES.class;}，除了「请把这个类算进来」什么都没提供。</p>
 *
 * <p><b>手写 provider 通道已整体废掉</b>：发现残留实现直接 fail-fast 并点名违规类。
 * 不静默忽略 —— 那会让接入方以为自己写的 provider 生效了（比如以为 override 的
 * {@code indexKey()} 起作用），而实际被丢弃，这种失效没人会发现。</p>
 *
 * <p><b>合并发生在 registry 构造之前</b>，所以 {@code IndexMetaRegistry} 与
 * {@code RebuildableIndexMeta} 一行不改。</p>
 */
public final class ManagedEsIndexScanner {

    private static final Logger logger = LoggerFactory.getLogger(ManagedEsIndexScanner.class);

    private ManagedEsIndexScanner() {
    }

    /**
     * 汇总受管索引清单 = 宿主基础包里扫出的全部 {@code @Document} 实体。
     *
     * @param legacyProviders 只用来检测残留：非空即报错（通道已废）
     * @param beanFactory     取宿主基础包用
     */
    public static List<ManagedEsIndex> discover(List<ManagedEsIndex> legacyProviders, BeanFactory beanFactory) {
        rejectLeftoverProviders(legacyProviders);
        if (!AutoConfigurationPackages.has(beanFactory)) {
            logger.info("[ManagedEsIndexScanner] 宿主无 AutoConfigurationPackages，跳过扫描，受管索引为空");
            return Collections.emptyList();
        }
        return synthesize(scan(AutoConfigurationPackages.get(beanFactory)));
    }

    /**
     * 手写 provider 通道已废：残留实现一律 fail-fast。
     *
     * <p>异常信息点名违规类并给出改法，否则接入方只会看到「启动失败」而不知道该删什么。</p>
     */
    private static void rejectLeftoverProviders(List<ManagedEsIndex> legacyProviders) {
        if (legacyProviders == null || legacyProviders.isEmpty()) {
            return;
        }
        List<String> names = new ArrayList<String>();
        for (ManagedEsIndex provider : legacyProviders) {
            names.add(provider.getClass().getName());
        }
        throw new IllegalStateException(
                "手写 ManagedEsIndex 通道已废弃，请删除这些类：" + names
                        + "。索引只要带 @Document 就会被自动发现，无需再手写声明。");
    }

    /**
     * 扫出给定基础包（含子包）下全部带 {@code @Document} 的类。
     *
     * <p>按类名排序返回，保证登记顺序在不同 JVM / 文件系统下稳定 —— 否则
     * {@code registered indexKeys=[...]} 日志与依赖顺序的断言会随机漂。</p>
     */
    static List<Class<?>> scan(List<String> basePackages) {
        if (basePackages == null || basePackages.isEmpty()) {
            return Collections.emptyList();
        }
        // false = 不要默认的 @Component 过滤器，只认我们加的 @Document
        ClassPathScanningCandidateComponentProvider provider =
                new ClassPathScanningCandidateComponentProvider(false);
        provider.addIncludeFilter(new AnnotationTypeFilter(Document.class));

        ClassLoader classLoader = ManagedEsIndexScanner.class.getClassLoader();
        Map<String, Class<?>> byName = new TreeMap<String, Class<?>>();
        for (String basePackage : basePackages) {
            Set<BeanDefinition> candidates = provider.findCandidateComponents(basePackage);
            for (BeanDefinition bd : candidates) {
                String className = bd.getBeanClassName();
                if (className == null) {
                    continue;
                }
                try {
                    byName.put(className, ClassUtils.forName(className, classLoader));
                } catch (ClassNotFoundException | LinkageError e) {
                    // 扫到但加载不了（可选依赖缺失等）：跳过并留痕。
                    // 加载不了的类不可能是本应用在用的索引实体，故此处不 fail-fast。
                    logger.warn("[ManagedEsIndexScanner] @Document 类无法加载，跳过: {}", className, e);
                }
            }
        }
        return new ArrayList<Class<?>>(byName.values());
    }

    /**
     * 把实体类清单合成 {@link ManagedEsIndex} 清单。
     *
     * <p><b>不去重</b>：两个不同实体反推出同一 {@code indexKey}（不同包下同简名）是真冲突，
     * 必须留给 {@code IndexMetaRegistry.register()} 的既有防线 fail-fast。
     * 在这里静默去重会让控制台指着 A 的 key 操作 B 的索引。</p>
     */
    static List<ManagedEsIndex> synthesize(List<Class<?>> entityClasses) {
        List<ManagedEsIndex> out = new ArrayList<ManagedEsIndex>();
        if (entityClasses == null) {
            return out;
        }
        for (final Class<?> entityClass : entityClasses) {
            // ManagedEsIndex 是函数式接口（唯一抽象方法 entityClass()），indexKey() 走 default。
            // 用匿名类而非 lambda：栈轨迹里有清楚的类名，便于诊断。
            out.add(new ManagedEsIndex() {
                @Override
                public Class<?> entityClass() {
                    return entityClass;
                }
            });
        }
        return out;
    }
}
