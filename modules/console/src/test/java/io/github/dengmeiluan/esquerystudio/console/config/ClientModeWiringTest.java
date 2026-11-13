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

package io.github.dengmeiluan.esquerystudio.console.config;

import io.github.dengmeiluan.esquerystudio.console.adhoc.AdhocRebuildService;
import io.github.dengmeiluan.esquerystudio.console.client.ConsoleAssetGuard;
import io.github.dengmeiluan.esquerystudio.console.client.DesiredStateController;
import io.github.dengmeiluan.esquerystudio.console.client.EsWriteRetryAspect;
import io.github.dengmeiluan.esquerystudio.console.client.EsWriteRetryTemplate;
import io.github.dengmeiluan.esquerystudio.console.client.StaleWriteBlockDetector;
import io.github.dengmeiluan.esquerystudio.console.config.hostpkg.HostProbeES;
import io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver;
import io.github.dengmeiluan.esquerystudio.console.control.EntityIndexNames;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.junit.Test;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.boot.autoconfigure.AutoConfigurationPackages;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.ImportBeanDefinitionRegistrar;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.type.AnnotationMetadata;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;

import java.io.File;
import java.net.URL;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/**
 *  本波最关键的测试：钉住「业务侧默认零装配」。
 *
 * <p>这 3800 行删除面几乎零测试覆盖，唯一能自动化证明「业务侧真的变轻了」的手段就是本类。
 * 断言的是 Bean 的<b>存在与不存在</b>，不是行为——因此它对实现细节不敏感、不会因重构假红。</p>
 */
public class ClientModeWiringTest {

    /** 控制台目录对应的 pattern，用于识别「前端未构建」这一特征。 */
    private static final String ESQUERYSTUDIO_DIR_PATTERN = "/esquerystudio/**";

    private ApplicationContextRunner runner() {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(ESQueryStudioConsoleAutoConfiguration.class));
    }

    /** 不配 mode（默认 client）：控制台侧的重家伙一个都不该在。 */
    @Test
    public void defaultModeIsClientAndConsoleBeansAbsent() {
        runner().run(ctx -> {
            org.junit.Assert.assertFalse("client 模式不该装 EsIndexAdmin",
                    ctx.getBeanNamesForType(EsIndexAdmin.class).length > 0);
            org.junit.Assert.assertFalse("client 模式不该装 ControlClusterResolver",
                    ctx.getBeanNamesForType(ControlClusterResolver.class).length > 0);
            org.junit.Assert.assertEquals("默认 mode 必须是 client",
                    "client", ctx.getBean(ESQueryStudioElasticsearchProperties.class).getMode());
        });
    }

    /** 不配 mode：client 侧该在的地基必须在。 */
    @Test
    public void clientModeKeepsDeclarationBeans() {
        runner().run(ctx -> {
            org.junit.Assert.assertTrue("client 模式必须装 EntityIndexNames",
                    ctx.getBeanNamesForType(EntityIndexNames.class).length > 0);
            org.junit.Assert.assertTrue("client 模式必须装 IndexMetaRegistry",
                    ctx.getBeanNamesForType(IndexMetaRegistry.class).length > 0);
            /* 4 个 sdes 签名断裂点里有两个落在 EntityFieldScanner —— client 模式
               desired-state 的必经之路。契约诊断只在 console 装，等于让最需要它的一方
               拿不到；故它必须出现在 client 模式的装配清单里。 */
            org.junit.Assert.assertTrue("client 模式必须装 EsStackContractValidator（断裂点正在 client 侧）",
                    ctx.getBeanNamesForType(EsStackContractValidator.class).length > 0);
        });
    }

    /**
     *  修订一的前提看守：client 模式下<b>没有任何东西校验 mappingJson 的 JSON 合法性</b>。
     *
     * <p>唯一会校验它的 {@link io.github.dengmeiluan.esquerystudio.console.validate.IndexConfigValidator}
     * 与 {@link io.github.dengmeiluan.esquerystudio.console.validate.ConfigValidationStartupRunner}
     * 都写在 {@code ConsoleModeConfiguration} 里（{@code havingValue="console"}），
     * 而 {@code DesiredStateController} 在外层、client 模式就装。
     * 加上 {@code IndexMetaRegistry.readAnnotationPath} 只是原样读 classpath 资源、不解析 JSON，
     * 「坏 mappingJson 流进 payload」在业务侧是<b>可达</b>路径。</p>
     *
     * <p>这正是 {@code EntityFieldScanner} 必须输出 {@code mappingParsed} 判别位的理由：
     * 没有它，前端会把「mapping 没解析成功」误读成「该字段走 dynamic mapping」。
     * 本条钉住这个前提——将来若有人把校验挪进 client 模式，本条会红，
     * 提示重新评估判别位（而不是让缺陷静默复活）。</p>
     */
    @Test
    public void clientModeHasNoMappingJsonValidator() {
        runner().run(ctx -> {
            org.junit.Assert.assertEquals("client 模式不该装 IndexConfigValidator（坏 mappingJson 无人拦）",
                    0, ctx.getBeanNamesForType(
                            io.github.dengmeiluan.esquerystudio.console.validate.IndexConfigValidator.class).length);
            org.junit.Assert.assertEquals("client 模式不该装 ConfigValidationStartupRunner",
                    0, ctx.getBeanNamesForType(
                            io.github.dengmeiluan.esquerystudio.console.validate.ConfigValidationStartupRunner.class).length);
        });
    }

    /** 配 mode=console：控制台侧的重家伙必须回来。 */
    @Test
    public void consoleModeWiresEverything() {
        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console").run(ctx -> {
            org.junit.Assert.assertTrue("console 模式必须装 EsIndexAdmin",
                    ctx.getBeanNamesForType(EsIndexAdmin.class).length > 0);
            org.junit.Assert.assertTrue("console 模式必须装 ControlClusterResolver",
                    ctx.getBeanNamesForType(ControlClusterResolver.class).length > 0);
        });
    }

    /**
     *  {@code AdhocRebuildService} 必须<b>真的拿到</b> {@code RebuildLockStore}。
     *
     * <p><b>本断言声称防的失败模式</b>：装配处漏传 lockStore（或传了 null），adhoc 退回
     * 无锁构造 —— 两个人对同一索引起重建仍会各建新索引、各翻别名，而<b>整套锁代码看起来都在</b>，
     * 单测也全绿（它们自己 new service 并传桩，绕过了 Spring 装配）。此前这条接线
     * <b>仅靠编译期保证</b>：console 模式的配置类在测试中从未被实例化过。</p>
     *
     * <p>断言落在字段实际值而非"Bean 存在"上：Bean 存在不代表它拿到了锁。</p>
     */
    @Test
    public void consoleModeInjectsRebuildLockStoreIntoAdhocService() {
        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console").run(ctx -> {
            org.junit.Assert.assertTrue("console 模式必须装 AdhocRebuildService",
                    ctx.getBeanNamesForType(AdhocRebuildService.class).length > 0);
            AdhocRebuildService service = ctx.getBean(AdhocRebuildService.class);
            java.lang.reflect.Field f = AdhocRebuildService.class.getDeclaredField("lockStore");
            f.setAccessible(true);
            org.junit.Assert.assertNotNull(
                    "AdhocRebuildService 没拿到 RebuildLockStore —— adhoc 退回无锁运行，"
                            + "两人对同一索引起重建仍会各翻别名，而锁代码看起来都在",
                    f.get(service));
        });
    }

    /** 同一条接线的另一半：租约必须来自配置，否则续约间隔与实际租约脱节。 */
    @Test
    public void consoleModeInjectsLockLeaseIntoAdhocService() {
        // 取值须同时满足既有交叉校验 lease-ms >= orchestration.timeout-ms（默认 1800000）
        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console", "esquerystudio.elasticsearch.lock.lease-ms=7200000")
                .run(ctx -> {
                    AdhocRebuildService service = ctx.getBean(AdhocRebuildService.class);
                    java.lang.reflect.Field f = AdhocRebuildService.class.getDeclaredField("lockLeaseMs");
                    f.setAccessible(true);
                    org.junit.Assert.assertEquals("租约未从 esquerystudio.elasticsearch.lock.lease-ms 注入",
                            7200000L, f.get(service));
                });
    }

    /**
     * target-aware adhoc：service 必须<b>真的拿到</b> {@code EsClientRouter}（与 ConnStore）。
     *
     * <p><b>防的失败模式</b>：装配漏传 router 时 service 的 router 字段为 null ——
     * start 捕获不到目标（一律 host）、worker 不恢复路由、abort 取消打到宿主——
     * 前端 X-Es-Target 头全在发，控制台看起来「选了集群」，重建却<b>静默全程打宿主</b>。
     * 与 lockStore 断言同理：Bean 存在 ≠ service 拿到了。</p>
     */
    @Test
    public void consoleModeInjectsRouterIntoAdhocService() {
        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console").run(ctx -> {
            AdhocRebuildService service = ctx.getBean(AdhocRebuildService.class);
            java.lang.reflect.Field router = AdhocRebuildService.class.getDeclaredField("router");
            router.setAccessible(true);
            org.junit.Assert.assertNotNull(
                    "AdhocRebuildService 没拿到 EsClientRouter —— prepare/start 捕获不了选中目标，"
                            + "重建静默全程打宿主（前端选集群形同虚设）", router.get(service));
            java.lang.reflect.Field connStore = AdhocRebuildService.class.getDeclaredField("connStore");
            connStore.setAccessible(true);
            org.junit.Assert.assertNotNull(
                    "AdhocRebuildService 没拿到 ConnStore —— 目标名称/版本快照与 fail-closed 预检失效",
                    connStore.get(service));
        });
    }

    /** mode 非法值必须启动失败，而不是静默回落。 */
    @Test
    public void illegalModeFailsFast() {
        runner().withPropertyValues("esquerystudio.elasticsearch.mode=whatever").run(ctx -> {
            org.junit.Assert.assertNotNull("非法 mode 必须让上下文启动失败", ctx.getStartupFailure());
            org.junit.Assert.assertTrue("失败信息要点名 esquerystudio.elasticsearch.mode 与可选值",
                    rootMessage(ctx.getStartupFailure()).contains("esquerystudio.elasticsearch.mode"));
        });
    }

    /** client 模式必须装资源守卫（否则 6MB 控制台照样能访问）。 */
    @Test
    public void clientModeInstallsConsoleAssetGuard() {
        runner().run(ctx -> org.junit.Assert.assertTrue("client 模式必须装 ConsoleAssetGuard",
                ctx.getBeanNamesForType(ConsoleAssetGuard.class).length > 0));
    }

    /** console 模式不该装守卫，否则 宿主的控制台自己被挡掉。 */
    @Test
    public void consoleModeHasNoConsoleAssetGuard() {
        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console").run(ctx ->
                org.junit.Assert.assertEquals("console 模式不该装 ConsoleAssetGuard",
                        0, ctx.getBeanNamesForType(ConsoleAssetGuard.class).length));
    }

    /**
     * console 模式必须装静态资源缓存策略（assets immutable 长缓存 + html no-cache）。
     *
     * <p><b>为什么钉在装配层</b>：若该 Bean 被误删，无任何编译错误，唯一症状是产线
     * 每次进控制台重下 ~767KB（Security 宿主为 no-store 裸传）——纯粹的性能静默回退，
     * 功能测试全绿。装配断言是唯一能察觉它的自动化手段。</p>
     */
    @Test
    public void consoleModeInstallsConsoleCacheConfigurer() {
        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console").run(ctx ->
                org.junit.Assert.assertTrue("console 模式必须装 ConsoleCacheConfigurer",
                        ctx.getBeanNamesForType(
                                io.github.dengmeiluan.esquerystudio.console.web.ConsoleCacheConfigurer.class).length > 0));
    }

    /**
     * client 模式必须<b>不装</b>缓存策略——否则其精确 pattern {@code /esquerystudio/assets/**}
     * 优先于守卫的 {@code /esquerystudio/**}，资产会绕过守卫的 404 被服务出去，静默解除资源封锁。
     */
    @Test
    public void clientModeHasNoConsoleCacheConfigurer() {
        runner().run(ctx -> org.junit.Assert.assertEquals(
                "client 模式不该装 ConsoleCacheConfigurer（其精确 pattern 会抢先于守卫 /esquerystudio/**，静默解封资产）",
                0, ctx.getBeanNamesForType(
                        io.github.dengmeiluan.esquerystudio.console.web.ConsoleCacheConfigurer.class).length));
    }

    /**
     * 光有 Bean 不等于真挡住：本条钉住守卫「注册了 /esquerystudio/** 且 locations 为空」这一实质内容。
     *
     * <p>{@code ResourceHandlerRegistry#getHandlerMapping()} 是 protected、跨包调不到，
     * 故用反射读 {@code registrations} 私有字段（spring-webmvc 5.2.15 字段名核对过）。
     * 每一步取值都断言非 null —— 万一未来版本改了字段名/结构，本测试要红，
     * 而不是因为拿到 null 而恒真通过。</p>
     *
     * <p>端到端「真 404」不在本测试范围内（starter 无 @SpringBootApplication，
     * 起不了带容器的上下文），由  的真实进程 curl 验证。</p>
     */
    @Test
    public void consoleAssetGuardRegistersConsolePatternWithNoLocations() throws Exception {
        ResourceHandlerRegistry registry = new ResourceHandlerRegistry(new GenericApplicationContext(), null);
        new ConsoleAssetGuard().addResourceHandlers(registry);

        org.junit.Assert.assertArrayEquals(
                "守卫必须接管 /esquerystudio/** 与统一入口页",
                new String[]{"/esquerystudio/**", "/esquerystudio.html"},
                registeredPatterns());

        java.lang.reflect.Field regsField = ResourceHandlerRegistry.class.getDeclaredField("registrations");
        regsField.setAccessible(true);
        List<?> registrations = (List<?>) regsField.get(registry);
        org.junit.Assert.assertNotNull("反射未取到 registrations，字段名或结构已变", registrations);

        Object registration = registrations.get(0);
        java.lang.reflect.Field locationsField = registration.getClass().getDeclaredField("locationValues");
        locationsField.setAccessible(true);
        List<?> locations = (List<?>) locationsField.get(registration);
        org.junit.Assert.assertNotNull("反射未取到 locationValues，字段名或结构已变", locations);
        org.junit.Assert.assertTrue("locations 必须为空，否则控制台资源仍能被解析到、挡不住",
                locations.isEmpty());
    }

    /**
     * 防复发护栏：{@code static/} 根下的实际内容必须与守卫已覆盖的 pattern 集合<b>恰好相等</b>。
     *
     * <p>本 Task 的缺陷根因就是「有人往 {@code static/} 根加了文件，而守卫 pattern 是手写枚举，
     * 加了也没人知道」——`esquerystudio.html` 因此漏网。本条把两边钉在一起：
     * 将来再加第二个静态文件，本测试会红并逼出一次决策（挡它、或显式豁免它），
     * 而不是静默重现今天这个洞。</p>
     *
     * <p>实现说明：测试跑在 exploded 的 {@code target/classes} 上，{@code getResource("static/")}
     * 返回 {@code file:} URL、可直接列目录。若哪天换成 jar 内运行（{@code jar:} 协议）本方式失效——
     * 那时本测试会<b>直接失败</b>而不是静默跳过，因为一条恒真的护栏比没有护栏更糟。</p>
     *
     * <p><b>隐式依赖：本断言依赖前端构建产物已生成。</b>{@code static/esquerystudio/} 是 vite 构建产物、
     * 被 .gitignore 忽略（{@code git ls-files} 下 0 个文件）。在没跑过前端构建的干净 checkout 上，
     * {@code static/} 根下只有入口 html、没有 {@code esquerystudio/} 目录，本断言会因缺 {@code /esquerystudio/**}
     * 而变红——那是<b>假红</b>，与守卫代码无关。为此下方对这一特征专门给出自解释的失败信息，
     * 避免有人跑去查一个并不存在的守卫 bug。</p>
     */
    @Test
    public void guardedPatternsCoverEveryStaticRootEntry() throws Exception {
        URL staticRoot = getClass().getClassLoader().getResource("static/");
        org.junit.Assert.assertNotNull("classpath 下找不到 static/，护栏无法工作", staticRoot);
        org.junit.Assert.assertEquals(
                "static/ 不是可列举的 file: 目录（如已改为 jar 内运行），本护栏需重写而非跳过",
                "file", staticRoot.getProtocol());

        File[] entries = new File(staticRoot.toURI()).listFiles();
        org.junit.Assert.assertNotNull("static/ 目录列举失败", entries);
        org.junit.Assert.assertTrue("static/ 意外为空，护栏会恒真，必须排查", entries.length > 0);

        // 目录 → /名字/**，文件 → /名字：与 ConsoleAssetGuard 的 pattern 写法保持同一映射
        Set<String> actual = new TreeSet<>();
        for (File f : entries) {
            actual.add(f.isDirectory() ? "/" + f.getName() + "/**" : "/" + f.getName());
        }
        Set<String> guarded = new TreeSet<>(Arrays.asList(registeredPatterns()));

        // 特征识别：唯一的差异是「守卫有 /esquerystudio/**、实际没有」且 esquerystudio/ 目录确实不在
        // —— 这是前端没构建，不是守卫漏挡。假红与假绿一样有害，必须让信息自己解释清楚。
        boolean onlyAssetsMissing = guarded.contains(ESQUERYSTUDIO_DIR_PATTERN)
                && !actual.contains(ESQUERYSTUDIO_DIR_PATTERN)
                && !new File(new File(staticRoot.toURI()), "esquerystudio").isDirectory();
        Set<String> otherDiff = new TreeSet<>(actual);
        otherDiff.removeAll(guarded);

        if (onlyAssetsMissing && otherDiff.isEmpty()) {
            org.junit.Assert.fail("前端构建产物缺失，不是守卫的问题："
                    + "static/esquerystudio/ 是 vite 构建产物且被 .gitignore 忽略，当前 checkout 下不存在。"
                    + " 请先跑前端构建（mvn 打包链会自动执行 vite build）再跑本测试；"
                    + " 守卫本身无需改动。实际=" + actual + " 守卫=" + guarded);
        }

        org.junit.Assert.assertEquals(
                "static/ 根下的内容与守卫 pattern 不一致：新增静态资源必须同步 ConsoleAssetGuard.GUARDED_PATTERNS"
                        + "（或显式决定豁免）。实际=" + actual + " 守卫=" + guarded,
                guarded, actual);
    }

    /**
     * 钉住「守卫不可被宿主静默替换」——即 {@code consoleAssetGuard} 上<b>刻意不加</b>
     * {@code @ConditionalOnMissingBean} 这个决定本身。
     *
     * <p>为什么需要本条：其余 8 条断言在「加」与「不加」该注解时<b>全部通过</b>（已实跑确认），
     * 也就是说那个决定原本只靠一句 Javadoc 撑着，没有任何测试保护。
     * 一个无法被测试察觉其被推翻的决定，等于没有决定。</p>
     *
     * <p>判别力：无注解（当前）→ starter 守卫与宿主守卫共存 → count=2 → 绿；
     * 若有人把注解加回去 → starter 守卫让位 → count=1 → 红。</p>
     *
     * <p>宿主 Bean 取<b>异名</b>：实测同名会因 Boot 2.3 默认
     * {@code spring.main.allow-bean-definition-overriding=false} 抛
     * {@code BeanDefinitionOverrideException} 启动硬失败，那条路径不适合做断言载体。
     * 异名恰好也是宿主扩展的正当姿势——追加自己的 WebMvcConfigurer，而不是替换我们这个。</p>
     */
    @Test
    public void hostCannotSilentlyReplaceConsoleAssetGuard() {
        runner().withUserConfiguration(HostExtraGuardConfiguration.class).run(ctx ->
                org.junit.Assert.assertEquals(
                        "宿主自带守卫时 starter 守卫必须仍然在（共存），否则说明 "
                                + "@ConditionalOnMissingBean 被加回、守卫可被静默解除",
                        2, ctx.getBeanNamesForType(ConsoleAssetGuard.class).length));
    }

    /** 模拟宿主追加自己的守卫（异名 Bean），用于上面那条断言。 */
    @Configuration(proxyBeanMethods = false)
    static class HostExtraGuardConfiguration {

        @Bean
        public ConsoleAssetGuard hostOwnConsoleAssetGuard() {
            return new ConsoleAssetGuard();
        }
    }

    /**
     * 残留的手写 {@link ManagedEsIndex} bean 必须让上下文<b>启动失败</b>，并点名违规类。
     *
     * <p><b>本条原先断言的是相反的行为</b>（「从容器收集手写 ManagedEsIndex」）。
     *  把受管索引改成「带 {@code @Document} 就自动发现」，并<b>整体废掉</b>手写 provider 通道：
     * {@code ManagedEsIndexScanner.rejectLeftoverProviders} 一旦发现残留实现即抛
     * {@code IllegalStateException}。原断言描述的能力已被有意删除，故本条改为钉住新语义。</p>
     *
     * <p><b>为什么选 fail-fast 而不是静默忽略</b>：静默忽略会让接入方以为自己写的 provider 生效了
     * （比如以为 override 的 {@code indexKey()} 起作用），实际却被丢弃 —— 那种失效没人会发现。
     * 既然要 fail-fast，就必须有测试钉住它真的会 fail，否则守卫本身可能在重构中被悄悄摘掉。</p>
     *
     * <p><b>为什么要在集成层再测一遍</b>：{@code ManagedEsIndexScannerTest
     * .discoverRejectsLeftoverHandwrittenProvider} 已在单元层覆盖 {@code discover} 会抛。
     * 但单元层无法证明<b>自动配置真的调用了这条守卫</b> —— 若 {@code indexMetaRegistry} 那个
     * {@code @Bean} 绕开 scanner 直接 {@code new IndexMetaRegistry(names, legacyProviders)}，
     * 单元测试照样全绿而守卫形同虚设。本条真起容器，是唯一能察觉那种接线倒退的断言。</p>
     *
     * <p><b>判别力</b>：注释掉 {@code rejectLeftoverProviders} 调用、或把它降级成打日志、
     * 或让自动配置不再经由 scanner → 上下文启动成功 → {@code hasFailed()} 红；
     * 异常信息里不再点名违规类 → 根因断言红。</p>
     */
    @Test
    public void indexMetaRegistryRejectsHandwrittenManagedEsIndex() {
        runner().withUserConfiguration(LeftoverHandwrittenProviderConfiguration.class).run(ctx -> {
            assertThat(ctx).hasFailed();

            // 异常被 Spring 包成 BeanCreationException，判别力在根因上，故必须取到根因再断言。
            Throwable rootCause = org.springframework.core.NestedExceptionUtils
                    .getRootCause(ctx.getStartupFailure());
            assertThat(rootCause)
                    .as("残留手写 provider 必须由 ManagedEsIndexScanner 的守卫抛 IllegalStateException，"
                            + "而不是别的偶然错误")
                    .isInstanceOf(IllegalStateException.class);
            assertThat(rootCause.getMessage())
                    .as("失败信息必须点名违规类，否则接入方只看到『启动失败』而不知道该删什么")
                    .contains(LeftoverHandwrittenProviderConfiguration.LeftoverProvider.class.getName());
        });
    }

    /**
     * 模拟接入方<b>残留</b>的手写 provider（ 已废弃的通道），用于上面那条 fail-fast 断言。
     *
     * <p>用具名类而非 lambda：异常信息点名的是 {@code getClass().getName()}，
     * lambda 的名字形如 {@code ...$$Lambda$677/2091439256} 带运行期序号，无法稳定断言。</p>
     */
    @Configuration(proxyBeanMethods = false)
    static class LeftoverHandwrittenProviderConfiguration {

        static class LeftoverProvider implements ManagedEsIndex {
            @Override
            public Class<?> entityClass() {
                return HostProbeES.class;
            }
        }

        @Bean
        public ManagedEsIndex leftoverHandwrittenProvider() {
            return new LeftoverProvider();
        }
    }

    /**
     * 模拟宿主「基础包里放了个 {@code @Document} 实体」——  之后唯一合法的接入形态。
     *
     * <p>通过 {@link org.springframework.boot.autoconfigure.AutoConfigurationPackages#register}
     * 把 {@code ...config.hostpkg} 注册为宿主基础包，让 {@code ManagedEsIndexScanner.discover}
     * 真去扫它。用 {@link ImportBeanDefinitionRegistrar} 是因为基础包那个 bean definition
     * 必须在 {@code indexMetaRegistry} 实例化<b>之前</b>就位；registrar 在配置类解析阶段执行，
     * 早于任何单例创建，能保证这个次序。</p>
     */
    @Configuration(proxyBeanMethods = false)
    @Import(HostBasePackageConfiguration.HostPackageRegistrar.class)
    static class HostBasePackageConfiguration {

        /** 只指向 hostpkg 这一个包：它下面只有 HostProbeES，无子包、无同简名冲突。 */
        static class HostPackageRegistrar implements ImportBeanDefinitionRegistrar {
            @Override
            public void registerBeanDefinitions(AnnotationMetadata metadata, BeanDefinitionRegistry registry) {
                AutoConfigurationPackages.register(registry, HostProbeES.class.getPackage().getName());
            }
        }
    }

    /**
     * -5：client 模式必须装期望配置控制器，否则「一键复制」无从下手。
     *
     * <p><b>这是本 Task 的存亡断言</b>：该 Bean 若被误写进 {@code ConsoleModeConfiguration}
     * （本类里 51 个控制台 Bean 都在那个嵌套类里，放错是最可能的失误），
     * client 模式下页面根本不存在 —— 而业务侧<b>只跑 client 模式</b>，那就完全失去意义。
     * 本条是唯一能察觉这个错误的断言。</p>
     */
    @Test
    public void clientModeInstallsDesiredStateController() {
        runner().run(ctx -> org.junit.Assert.assertTrue("client 模式必须装 DesiredStateController —— "
                        + "若为 0，检查该 @Bean 是否被误放进 ConsoleModeConfiguration 嵌套类",
                ctx.getBeanNamesForType(DesiredStateController.class).length > 0));
    }

    /** console 模式也要有它 —— 宿主 自己没有声明索引，但端点存在无害且便于自检。 */
    @Test
    public void consoleModeAlsoInstallsDesiredStateController() {
        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console").run(ctx ->
                org.junit.Assert.assertTrue("console 模式也应装 DesiredStateController",
                        ctx.getBeanNamesForType(DesiredStateController.class).length > 0));
    }

    /* ---- ：`/internal/es/index/keys` 是 console 专属，desired-state 两种模式都在 ----
       起因：README 原写「client 模式下 /internal/es/index/** 全部 404」，而
       DesiredStateController 映射的是**同一个前缀**且两种模式都装 —— 该说法自相矛盾。
       AGENTS.md 更进一步，把 console 专属的 /keys 写成通用「接口自检」步骤，
       会让业务应用（client 是默认）接入后拿到 404 并误判成接入失败，
       甚至为了让它返回 200 而给业务应用配 mode=console（把业务应用变成控制台）。
       两处文档已改；这两条断言把该区分钉进代码，避免再次漂移。 */

    @Test
    public void r98_客户端模式没有keys所在的控制台controller() {
        runner().run(ctx -> org.junit.Assert.assertEquals(
                "client 模式不该装 InternalEsIndexRebuildController（/keys 等重建端点在它上面）",
                0,
                ctx.getBeanNamesForType(
                        io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController.class).length));
    }

    /** 正向对照：console 模式必须有它，否则上一条可能只是「它压根没被装过」。 */
    @Test
    public void r98_控制台模式装keys所在的controller() {
        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console").run(ctx ->
                org.junit.Assert.assertTrue(
                        "console 模式必须装 InternalEsIndexRebuildController",
                        ctx.getBeanNamesForType(
                                io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController.class).length > 0));
    }

    /**
     * 控制器拿到的 registry 就是容器里那个真 registry，且能读出宿主声明的索引。
     *
     * <p>为什么不止断言 Bean 存在：上面两条只证明控制器<b>被造出来了</b>。
     * 而控制器若拿到一个空 registry（或另一个实例），端点会稳定返回 {@code []} ——
     * 页面显示空态，看起来「正常」，实则业务方永远复制不到任何东西。那是静默空转。</p>
     *
     * <p><b> 只换了声明机制，没换意图</b>：宿主原先靠手写 {@code ManagedEsIndex} bean 声明索引，
     * 现在靠「基础包里放 {@code @Document} 实体」。本条的判别力（端到端：宿主声明 → 扫描 →
     * registry → 控制器 payload）原样保留，只是夹具从注册 provider bean 换成注册
     * {@code AutoConfigurationPackages}。</p>
     *
     * <p>判别力：控制器构造参数换成新建的空 registry、或注入错实例、或自动发现扫不到
     * 基础包里的 {@code @Document} → payload 里没有 hostProbe → 红。</p>
     */
    @Test
    public void desiredStateControllerSeesHostDeclaredIndexes() {
        runner().withUserConfiguration(HostBasePackageConfiguration.class).run(ctx -> {
            org.junit.Assert.assertNull("上下文本身必须启动成功", ctx.getStartupFailure());

            // 先钉住扫描链路真的把基础包里的 @Document 登记成了 key，
            // 否则下面 payload 为空时无法区分「没扫到」还是「控制器拿错 registry」。
            org.junit.Assert.assertEquals(
                    "自动发现未把宿主基础包里的 @Document 实体登记进 registry —— "
                            + "检查 ManagedEsIndexScanner.discover 的扫描链路",
                    java.util.Collections.singletonList("hostProbe"),
                    ctx.getBean(IndexMetaRegistry.class).listIndexKeys());

            org.springframework.http.ResponseEntity<String> resp =
                    ctx.getBean(DesiredStateController.class).desiredState();
            org.junit.Assert.assertEquals("端点必须回 200", 200, resp.getStatusCodeValue());
            org.junit.Assert.assertTrue(
                    "控制器返回的 payload 里必须出现宿主声明的 indexKey —— 为空说明控制器拿到的不是"
                            + "容器里那个已收集受管索引的 registry，端点会稳定返回 [] 而不报错，实际=" + resp.getBody(),
                    String.valueOf(resp.getBody()).contains("\"hostProbe\""));
        });
    }

    /**
     * 端点必须显式声明 {@code Content-Type: application/json}。
     *
     * <p>因为返回类型是 {@code String}，若不显式设置，{@code StringHttpMessageConverter}
     * 会按 {@code text/plain} 输出 —— 浏览器把 JSON 当纯文本渲染，某些客户端会拒绝解析。
     * 这是「返回预序列化字符串」这个决定的直接代价，必须钉住。</p>
     */
    @Test
    public void desiredStateEndpointDeclaresJsonContentType() {
        runner().run(ctx -> {
            org.springframework.http.ResponseEntity<String> resp =
                    ctx.getBean(DesiredStateController.class).desiredState();
            org.junit.Assert.assertEquals(
                    "返回 String 时必须显式设 application/json，否则会被当 text/plain 输出",
                    org.springframework.http.MediaType.APPLICATION_JSON,
                    resp.getHeaders().getContentType());
        });
    }

    /**
     * 单页端点必须回 {@code text/html;charset=UTF-8} 且真的吐出 HTML。
     *
     * <p>charset 不能省：页面全中文，缺 charset 时部分浏览器按 ISO-8859-1 解码会全部乱码。</p>
     */
    @Test
    public void desiredStatePageEndpointServesHtmlWithUtf8() {
        runner().run(ctx -> {
            org.springframework.http.ResponseEntity<String> resp =
                    ctx.getBean(DesiredStateController.class).desiredStatePage();
            org.junit.Assert.assertEquals("单页必须回 200", 200, resp.getStatusCodeValue());
            org.junit.Assert.assertEquals("单页必须声明 UTF-8，否则中文乱码",
                    "text/html;charset=UTF-8",
                    resp.getHeaders().getFirst(org.springframework.http.HttpHeaders.CONTENT_TYPE));
            org.junit.Assert.assertTrue("单页 body 必须是 HTML",
                    String.valueOf(resp.getBody()).contains("<!DOCTYPE html>"));
        });
    }

    /** 反射读出守卫「实际注册进 registry」的 pattern 数组（spring-webmvc 5.2.15 字段名核对过）。 */
    private static String[] registeredPatterns() throws Exception {
        ResourceHandlerRegistry registry = new ResourceHandlerRegistry(new GenericApplicationContext(), null);
        new ConsoleAssetGuard().addResourceHandlers(registry);

        java.lang.reflect.Field regsField = ResourceHandlerRegistry.class.getDeclaredField("registrations");
        regsField.setAccessible(true);
        List<?> registrations = (List<?>) regsField.get(registry);
        org.junit.Assert.assertNotNull("反射未取到 registrations，字段名或结构已变", registrations);
        org.junit.Assert.assertEquals("守卫应且只应注册 1 条 handler", 1, registrations.size());

        Object registration = registrations.get(0);
        java.lang.reflect.Field patternsField = registration.getClass().getDeclaredField("pathPatterns");
        patternsField.setAccessible(true);
        String[] patterns = (String[]) patternsField.get(registration);
        org.junit.Assert.assertNotNull("反射未取到 pathPatterns，字段名或结构已变", patterns);
        return patterns;
    }

    /**
     *  .5（台账 #65）：{@code StaleWriteBlockDetector} 在<b>两种模式</b>都必须装。
     *
     * <p><b>本断言声称防的失败模式</b>：这条诊断被顺手挪进 {@code ConsoleModeConfiguration}，
     * 于是<b>业务侧</b>——也就是唯一的受害者、唯一知道自己有哪些索引的那一方——反而没有它，
     * 而单测与编译全绿。装错模式的后果与「根本没实现」等价，且更难发现。</p>
     */
    @Test
    public void staleWriteBlockDetectorIsWiredInBothModes() {
        runner().run(ctx -> org.junit.Assert.assertTrue(
                "client 模式必须装 StaleWriteBlockDetector——业务侧才是写阻断的受害者",
                ctx.getBeanNamesForType(StaleWriteBlockDetector.class).length > 0));

        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console").run(ctx -> org.junit.Assert.assertTrue(
                "console 模式也必须装 StaleWriteBlockDetector——宿主 一旦声明索引就同样是写入方",
                ctx.getBeanNamesForType(StaleWriteBlockDetector.class).length > 0));
    }

    /**
     *  #70（台账）：{@code EsWriteRetryAspect} 与 {@code EsWriteRetryTemplate}
     * 在<b>两种模式</b>都必须装。
     *
     * <p><b>本断言声称防的失败模式</b>：这对 Bean 原本被放在 {@code ConsoleModeConfiguration} 里，
     * 于是 client 模式（业务应用，<b>默认模式</b>）根本不装 —— 每次 WRITE_BLOCK 重建，
     * 业务写入硬失败而不是被重试救回。而 {@code ManagedEsIndex} 的 javadoc 把
     * 「挡写 + <b>业务自身重试</b>」当作安全保证的两半，其中一半就这样静默缺席，
     * 编译与既有单测全绿。与 {@link #staleWriteBlockDetectorIsWiredInBothModes()} 属同一类缺陷。</p>
     *
     * <p><b>本条的能力边界</b>：它只证明 Bean <b>存在</b>，不证明它<b>会重试</b> ——
     * 窗口闸门若被加回来，本条照样全绿。行为由
     * {@code EsWriteRetryAspectBehaviorTest} 覆盖，两者缺一不可。</p>
     */
    @Test
    public void esWriteRetryIsWiredInBothModes() {
        runner().run(ctx -> {
            org.junit.Assert.assertTrue(
                    "client 模式必须装 EsWriteRetryAspect——业务应用才是 ES 写入方；"
                            + "若为 0，检查该 @Bean 是否被误放进 ConsoleModeConfiguration 嵌套类",
                    ctx.getBeanNamesForType(EsWriteRetryAspect.class).length > 0);
            org.junit.Assert.assertTrue("client 模式必须装 EsWriteRetryTemplate",
                    ctx.getBeanNamesForType(EsWriteRetryTemplate.class).length > 0);
        });

        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console").run(ctx -> {
            org.junit.Assert.assertTrue(
                    "console 模式也必须装 EsWriteRetryAspect——宿主 一旦声明索引就同样是写入方",
                    ctx.getBeanNamesForType(EsWriteRetryAspect.class).length > 0);
            org.junit.Assert.assertTrue("console 模式也必须装 EsWriteRetryTemplate",
                    ctx.getBeanNamesForType(EsWriteRetryTemplate.class).length > 0);
        });
    }

    private static String rootMessage(Throwable t) {
        Throwable cur = t;
        StringBuilder sb = new StringBuilder();
        while (cur != null) {
            sb.append(String.valueOf(cur.getMessage())).append(" | ");
            cur = cur.getCause();
        }
        return sb.toString();
    }
}
