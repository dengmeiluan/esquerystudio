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

package io.github.dengmeiluan.esquerystudio.console.docs;

import org.junit.Test;

import javax.annotation.PreDestroy;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.Assert.assertTrue;

/**
 * 产物源码线程池生命周期守卫：src/main/java（含 standalone 与 examples 模块）中凡创建
 * ExecutorService/ScheduledExecutorService/ThreadPoolExecutor 的类，必须具备显式关闭
 * 策略——{@code @PreDestroy} 钩子，或 Spring inferred destroy 契约的无参 public
 * {@code shutdown()}/{@code close()} 方法；方法内局部池（finally shutdown 兜底、不驻留
 * 字段）登记豁免清单。缺策略即红，防「池无主」回潮：上下文关停时在途任务被硬断、
 * 审计落盘与后台调度静默截断。判定走反射读注解与方法签名，与源码注释文本无关。
 */
public class ExecutorLifecycleGuardTest {

    private static final Pattern POOL_CREATION = Pattern.compile(
            "Executors\\.new\\w+|new\\s+ThreadPoolExecutor|new\\s+ScheduledThreadPoolExecutor");

    /**
     * 局部/短命池豁免：池在方法体内创建、finally shutdown(Now) 兜底、不驻留字段——
     * ControlClusterResolver.ping 探活池、MappingReconcileBootstrapRunner 对账池、
     * CrossClusterMigrateService 当次跑完即停的迁移池。
     */
    private static final Set<String> LOCAL_SCOPE_EXEMPT = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver",
            "io.github.dengmeiluan.esquerystudio.console.config.MappingReconcileBootstrapRunner",
            "io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService")));

    @Test
    public void everyPoolOwnerDeclaresShutdownStrategy() throws IOException {
        List<String> violations = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", "."))))) {
            walk.filter(p -> p.toString().endsWith(".java"))
                    .filter(p -> p.toString().replace('\\', '/').contains("/src/main/java/"))
                    .forEach(p -> {
                        try {
                            String source = new String(Files.readAllBytes(p), StandardCharsets.UTF_8);
                            if (!POOL_CREATION.matcher(source).find()) {
                                return;
                            }
                            String fqcn = toFqcn(p);
                            if (LOCAL_SCOPE_EXEMPT.contains(fqcn) || hasShutdownStrategy(fqcn)) {
                                return;
                            }
                            violations.add(fqcn + "（" + p.getFileName() + "）");
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                    });
        }
        assertTrue("持线程池类缺关闭策略 " + violations.size() + " 处：\n  "
                + String.join("\n  ", violations), violations.isEmpty());
    }

    /** {@code @PreDestroy} 钩子，或 inferred destroy 契约的类自声明无参 public shutdown()/close()。 */
    private static boolean hasShutdownStrategy(String fqcn) {
        Class<?> type;
        try {
            type = Class.forName(fqcn);
        } catch (Throwable e) {
            throw new IllegalStateException("持池类无法加载，无法验证关闭策略：" + fqcn, e);
        }
        for (Method m : type.getMethods()) {
            if (m.isAnnotationPresent(PreDestroy.class)) {
                return true;
            }
            if ((m.getName().equals("shutdown") || m.getName().equals("close"))
                    && m.getParameterCount() == 0
                    && m.getDeclaringClass() == type) {
                return true;
            }
        }
        return false;
    }

    private static String toFqcn(Path p) {
        String norm = p.toString().replace('\\', '/');
        String marker = "/src/main/java/";
        int i = norm.indexOf(marker);
        String rel = norm.substring(i + marker.length(), norm.length() - ".java".length());
        return rel.replace('/', '.');
    }
}
