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

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.control.EntityMappingDeriver;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import io.github.dengmeiluan.esquerystudio.console.mapping.MappingReconcileReport;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.beans.factory.support.RootBeanDefinition;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.annotation.Primary;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.IndexOperations;
import org.springframework.data.elasticsearch.core.mapping.IndexCoordinates;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.Assert.fail;

public class MappingReconcileWiringTest {

    private static final String FILE_MAPPING =
            "{\"properties\":{\"fromFile\":{\"type\":\"keyword\"}}}";
    private static final String DERIVED_MAPPING =
            "{\"properties\":{\"derived\":{\"type\":\"long\"}}}";

    @Test
    public void defaultAndExplicitClientModesWireRunnerWhenOperationsExists() {
        runner().withUserConfiguration(OperationsConfiguration.class).run(context ->
                assertThat(context).hasSingleBean(MappingReconcileBootstrapRunner.class));

        runner().withUserConfiguration(OperationsConfiguration.class)
                .withPropertyValues("esquerystudio.elasticsearch.mode=client")
                .run(context -> assertThat(context)
                        .hasSingleBean(MappingReconcileBootstrapRunner.class));
    }

    @Test
    public void consoleModeAndDisabledAutoRegisterDoNotWireRunner() {
        runner().withPropertyValues("esquerystudio.elasticsearch.mode=console")
                .run(context -> assertThat(context)
                        .doesNotHaveBean(MappingReconcileBootstrapRunner.class));

        runner().withUserConfiguration(OperationsConfiguration.class)
                .withPropertyValues("esquerystudio.elasticsearch.mapping.auto-register=off")
                .run(context -> assertThat(context)
                        .doesNotHaveBean(MappingReconcileBootstrapRunner.class));
    }

    @Test
    public void noOperationsStillWiresRunnerAndRunOnceSkipsSafely() {
        runner().run(context -> {
            assertThat(context).hasNotFailed();
            MappingReconcileBootstrapRunner bootstrap =
                    context.getBean(MappingReconcileBootstrapRunner.class);

            List<MappingReconcileReport.Status> statuses = bootstrap.runOnce();

            assertThat(statuses).containsExactly(MappingReconcileReport.Status.SKIPPED_NO_CLIENT);
            assertUnmodifiable(statuses);
        });
    }

    @Test
    public void lazyPrimaryAndSecondaryAreRejectedWithoutInstantiation() {
        LazyAmbiguousOperationsConfiguration.reset();

        runner().withUserConfiguration(LazyAmbiguousOperationsConfiguration.class).run(context -> {
            assertThat(context).hasNotFailed();
            MappingReconcileBootstrapRunner bootstrap =
                    context.getBean(MappingReconcileBootstrapRunner.class);
            assertThat(LazyAmbiguousOperationsConfiguration.primaryCreations.get()).isZero();
            assertThat(LazyAmbiguousOperationsConfiguration.secondaryCreations.get()).isZero();
            ListAppender<ILoggingEvent> appender = attachRunnerAppender();

            List<MappingReconcileReport.Status> statuses;
            try {
                statuses = bootstrap.runOnce();
            } finally {
                detachRunnerAppender(appender);
            }

            assertThat(statuses).containsExactly(MappingReconcileReport.Status.FAILED_ES);
            assertThat(LazyAmbiguousOperationsConfiguration.primaryCreations.get()).isZero();
            assertThat(LazyAmbiguousOperationsConfiguration.secondaryCreations.get()).isZero();
            assertThat(formattedLog(appender)).contains(
                    "status=FAILED_ES reason=AMBIGUOUS_CLIENT candidates=2");
            assertThat(formattedLog(appender)).doesNotContain("reason=RUNNER_FAILED");
        });
    }

    @Test
    public void soleLazyOperationsIsCreatedOnlyByRunOnce() {
        LazySingleOperationsConfiguration.reset();

        runner().withUserConfiguration(LazySingleOperationsConfiguration.class).run(context -> {
            assertThat(context).hasNotFailed();
            MappingReconcileBootstrapRunner bootstrap =
                    context.getBean(MappingReconcileBootstrapRunner.class);
            assertThat(LazySingleOperationsConfiguration.creations.get()).isZero();

            List<MappingReconcileReport.Status> statuses = bootstrap.runOnce();

            assertThat(statuses).containsExactly(MappingReconcileReport.Status.FAILED_ES);
            assertThat(LazySingleOperationsConfiguration.creations.get()).isEqualTo(1);
            assertThat(LazySingleOperationsConfiguration.operations.coordinates).isEmpty();
            assertThat(LazySingleOperationsConfiguration.operations.readCalls.get()).isZero();
        });
    }

    @Test
    public void soleThrowingLazyOperationsUsesRunnerFailedBoundary() {
        LazyThrowingOperationsConfiguration.creations.set(0);

        runner().withUserConfiguration(LazyThrowingOperationsConfiguration.class).run(context -> {
            assertThat(context).hasNotFailed();
            MappingReconcileBootstrapRunner bootstrap =
                    context.getBean(MappingReconcileBootstrapRunner.class);
            assertThat(LazyThrowingOperationsConfiguration.creations.get()).isZero();
            ListAppender<ILoggingEvent> appender = attachRunnerAppender();

            List<MappingReconcileReport.Status> statuses;
            try {
                statuses = bootstrap.runOnce();
            } finally {
                detachRunnerAppender(appender);
            }

            assertThat(statuses).containsExactly(MappingReconcileReport.Status.FAILED_ES);
            assertThat(LazyThrowingOperationsConfiguration.creations.get()).isEqualTo(1);
            assertThat(formattedLog(appender)).contains(
                    "status=FAILED_ES reason=RUNNER_FAILED");
            assertThat(formattedLog(appender)).doesNotContain("reason=AMBIGUOUS_CLIENT");
        });
    }

    @Test
    public void multipleOperationsWithoutPrimaryAreExplicitlyRejected() {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        RecordingOperations first = new RecordingOperations(0);
        RecordingOperations second = new RecordingOperations(0);
        beanFactory.registerSingleton("firstOperations", first.operations());
        beanFactory.registerSingleton("secondOperations", second.operations());
        ListAppender<ILoggingEvent> appender = attachRunnerAppender();

        List<MappingReconcileReport.Status> statuses;
        try {
            statuses = bootstrap(beanFactory,
                    registry(Collections.<RebuildableIndexMeta>emptyList()),
                    new RecordingDeriver()).runOnce();
        } finally {
            detachRunnerAppender(appender);
        }

        assertThat(statuses).containsExactly(MappingReconcileReport.Status.FAILED_ES);
        assertThat(first.coordinates).isEmpty();
        assertThat(second.coordinates).isEmpty();
        assertThat(formattedLog(appender)).contains(
                "status=FAILED_ES reason=AMBIGUOUS_CLIENT candidates=2");
        assertThat(formattedLog(appender)).doesNotContain("reason=RUNNER_FAILED");
        assertUnmodifiable(statuses);
    }

    @Test
    public void primaryDoesNotChooseAmongMultipleOperations() {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        RecordingOperations primary = new RecordingOperations(0);
        RecordingOperations secondary = new RecordingOperations(0);
        primary.mapping("orders_alias", FILE_MAPPING);
        secondary.mapping("orders_alias", FILE_MAPPING);
        registerOperations(beanFactory, "primaryOperations", primary, true);
        registerOperations(beanFactory, "secondaryOperations", secondary, false);
        List<RebuildableIndexMeta> metas = Collections.singletonList(
                meta("orders", "orders_alias", FileEntity.class, FILE_MAPPING));
        ListAppender<ILoggingEvent> appender = attachRunnerAppender();

        List<MappingReconcileReport.Status> statuses;
        try {
            statuses = bootstrap(beanFactory,
                    registry(metas), new RecordingDeriver()).runOnce();
        } finally {
            detachRunnerAppender(appender);
        }

        assertThat(statuses).containsExactly(MappingReconcileReport.Status.FAILED_ES);
        assertThat(primary.coordinates).isEmpty();
        assertThat(primary.readCalls.get()).isZero();
        assertThat(secondary.coordinates).isEmpty();
        assertThat(secondary.readCalls.get()).isZero();
        assertThat(formattedLog(appender)).contains(
                "status=FAILED_ES reason=AMBIGUOUS_CLIENT candidates=2");
        assertThat(formattedLog(appender)).doesNotContain("reason=RUNNER_FAILED");
        assertUnmodifiable(statuses);
    }

    @Test
    public void unsupportedSinglePrimaryOperationsFailsClosedWithoutIndexOps() {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        RecordingOperations primary = new RecordingOperations(1);
        primary.mapping("orders_alias", FILE_MAPPING);
        registerOperations(beanFactory, "primaryOperations", primary, true);
        List<RebuildableIndexMeta> metas = Collections.singletonList(
                meta("orders", "orders_alias", FileEntity.class, FILE_MAPPING));

        List<MappingReconcileReport.Status> statuses = bootstrap(
                beanFactory,
                registry(metas), new RecordingDeriver()).runOnce();

        assertThat(statuses).containsExactly(MappingReconcileReport.Status.FAILED_ES);
        assertThat(primary.coordinates).isEmpty();
        assertThat(primary.readCalls.get()).isZero();
    }

    @Test
    public void registryFailureReturnsFailedEsWithoutThrowing() {
        IndexMetaRegistry failingRegistry = new IndexMetaRegistry(
                null, Collections.<ManagedEsIndex>emptyList()) {
            @Override
            public List<RebuildableIndexMeta> listMetas() {
                throw new IllegalStateException("registry unavailable");
            }
        };

        List<MappingReconcileReport.Status> statuses = bootstrap(
                beanFactory(new RecordingOperations(0).operations()), failingRegistry,
                new RecordingDeriver()).runOnce();

        assertThat(statuses).containsExactly(MappingReconcileReport.Status.FAILED_ES);
        assertUnmodifiable(statuses);
    }

    @Test
    public void defaultMappingPropertiesRemainBound() {
        runner().run(context -> {
            ESQueryStudioElasticsearchProperties.Mapping mapping =
                    context.getBean(ESQueryStudioElasticsearchProperties.class).getMapping();

            assertThat(mapping.getAutoRegister()).isEqualTo("startup");
            assertThat(mapping.getConflictPolicy()).isEqualTo("fail");
            assertThat(mapping.getMissingIndexPolicy()).isEqualTo("skip");
        });
    }

    @Test
    public void fileMappingWinsDerivedMappingAndMissingSourceSkipsWithoutRead() {
        List<RebuildableIndexMeta> metas = Arrays.asList(
                meta("file", "file_alias", FileEntity.class, FILE_MAPPING),
                meta("derived", "derived_alias", DerivedEntity.class, null),
                meta("empty", "empty_alias", EmptyEntity.class, null));
        RecordingOperations operations = new RecordingOperations(2);
        operations.mapping("file_alias", FILE_MAPPING);
        operations.mapping("derived_alias", DERIVED_MAPPING);
        RecordingDeriver deriver = new RecordingDeriver();
        MappingReconcileBootstrapRunner bootstrap = bootstrap(operations.operations(), metas, deriver);
        Logger logger = (Logger) LoggerFactory.getLogger(MappingReconcileBootstrapRunner.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        appender.start();
        logger.addAppender(appender);

        List<MappingReconcileReport.Status> statuses;
        try {
            statuses = bootstrap.runOnce();
        } finally {
            logger.detachAppender(appender);
        }

        assertThat(statuses).containsExactly(
                MappingReconcileReport.Status.FAILED_ES,
                MappingReconcileReport.Status.FAILED_ES);
        assertThat(deriver.declaredMappings).containsExactly(FILE_MAPPING, null, null);
        assertThat(operations.coordinates).isEmpty();
        assertThat(operations.readCalls.get()).isZero();
        assertThat(MappingReconcileBootstrapRunner.sourceFor(metas.get(0)))
                .isEqualTo(MappingReconcileReport.Source.MAPPING_FILE);
        assertThat(MappingReconcileBootstrapRunner.sourceFor(metas.get(1)))
                .isEqualTo(MappingReconcileReport.Source.ANNOTATION_DERIVED);
        assertThat(formattedLog(appender)).contains(
                "indexKey=empty index=empty_alias reason=NO_MAPPING_SOURCE");
        assertThat(formattedLog(appender)).doesNotContain("status=SKIPPED_NO_MAPPING");
        assertUnmodifiable(statuses);
    }

    @Test
    public void runOnceProcessesMetasInRegistryOrderBeforeUnsupportedClientFailure() {
        List<RebuildableIndexMeta> metas = Arrays.asList(
                meta("first", "first_alias", FirstEntity.class, FILE_MAPPING),
                meta("second", "second_alias", SecondEntity.class, FILE_MAPPING));
        RecordingOperations operations = new RecordingOperations(2);
        operations.mapping("first_alias", FILE_MAPPING);
        operations.mapping("second_alias", FILE_MAPPING);
        RecordingDeriver deriver = new RecordingDeriver();
        MappingReconcileBootstrapRunner bootstrap =
                bootstrap(operations.operations(), metas, deriver);

        List<MappingReconcileReport.Status> statuses = bootstrap.runOnce();

        assertThat(statuses).containsExactly(
                MappingReconcileReport.Status.FAILED_ES,
                MappingReconcileReport.Status.FAILED_ES);
        assertThat(deriver.declaredMappings).containsExactly(FILE_MAPPING, FILE_MAPPING);
        assertThat(operations.coordinates).isEmpty();
        assertThat(operations.threadNames).isEmpty();
    }

    @Test
    public void readyEventUsesOneDaemonNamedThreadAndSchedulesOnlyOnce() throws Exception {
        List<RebuildableIndexMeta> metas = Arrays.asList(
                meta("first", "first_alias", FirstEntity.class, FILE_MAPPING),
                meta("second", "second_alias", SecondEntity.class, FILE_MAPPING));
        RecordingOperations operations = new RecordingOperations(2);
        operations.mapping("first_alias", FILE_MAPPING);
        operations.mapping("second_alias", FILE_MAPPING);
        CountDownLatch expectedDerivations = new CountDownLatch(2);
        CountDownLatch unexpectedDerivation = new CountDownLatch(1);
        AtomicInteger derivations = new AtomicInteger();
        List<String> threadNames = Collections.synchronizedList(new ArrayList<String>());
        List<Boolean> daemonFlags = Collections.synchronizedList(new ArrayList<Boolean>());
        RecordingDeriver deriver = new RecordingDeriver() {
            @Override
            public String declaredOrDerived(String mappingJson, Class<?> entityClass) {
                int call = derivations.incrementAndGet();
                threadNames.add(Thread.currentThread().getName());
                daemonFlags.add(Thread.currentThread().isDaemon());
                if (call > 2) {
                    unexpectedDerivation.countDown();
                }
                expectedDerivations.countDown();
                return super.declaredOrDerived(mappingJson, entityClass);
            }
        };
        MappingReconcileBootstrapRunner bootstrap =
                bootstrap(operations.operations(), metas, deriver);

        assertThat(operations.coordinates).isEmpty();
        bootstrap.onReady();
        bootstrap.onReady();

        assertThat(expectedDerivations.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(unexpectedDerivation.await(500, TimeUnit.MILLISECONDS)).isFalse();
        assertThat(derivations.get()).isEqualTo(2);
        assertThat(operations.coordinates).isEmpty();
        assertThat(threadNames).containsOnly("es-mapping-reconcile");
        assertThat(daemonFlags).containsOnly(true);
    }

    @Test
    public void unexpectedFailureForOneMetaDoesNotPreventNextMeta() {
        List<RebuildableIndexMeta> metas = Arrays.asList(
                meta("first", "first_alias", FirstEntity.class, null),
                meta("second", "second_alias", SecondEntity.class, null));
        RecordingOperations operations = new RecordingOperations(1);
        operations.mapping("second_alias", DERIVED_MAPPING);
        RecordingDeriver deriver = new RecordingDeriver() {
            @Override
            public String declaredOrDerived(String mappingJson, Class<?> entityClass) {
                if (entityClass == FirstEntity.class) {
                    throw new IllegalStateException("broken first meta");
                }
                return super.declaredOrDerived(mappingJson, entityClass);
            }
        };

        List<MappingReconcileReport.Status> statuses =
                bootstrap(operations.operations(), metas, deriver).runOnce();

        assertThat(statuses).containsExactly(
                MappingReconcileReport.Status.FAILED_ES,
                MappingReconcileReport.Status.FAILED_ES);
        assertThat(deriver.declaredMappings).hasSize(1);
        assertThat(deriver.declaredMappings.get(0)).isNull();
        assertThat(operations.coordinates).isEmpty();
    }

    private ApplicationContextRunner runner() {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(ESQueryStudioConsoleAutoConfiguration.class));
    }

    private static MappingReconcileBootstrapRunner bootstrap(ElasticsearchOperations operations,
                                                              List<RebuildableIndexMeta> metas,
                                                              EntityMappingDeriver deriver) {
        return bootstrap(beanFactory(operations), registry(metas), deriver);
    }

    private static MappingReconcileBootstrapRunner bootstrap(
            DefaultListableBeanFactory beanFactory,
            IndexMetaRegistry registry,
            EntityMappingDeriver deriver) {
        return new MappingReconcileBootstrapRunner(
                beanFactory, registry, deriver, new ESQueryStudioElasticsearchProperties());
    }

    private static DefaultListableBeanFactory beanFactory(ElasticsearchOperations operations) {
        DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
        if (operations != null) {
            beanFactory.registerSingleton("elasticsearchOperations", operations);
        }
        return beanFactory;
    }

    private static void registerOperations(DefaultListableBeanFactory beanFactory,
                                           String beanName,
                                           RecordingOperations operations,
                                           boolean primary) {
        RootBeanDefinition definition = new RootBeanDefinition(ElasticsearchOperations.class);
        definition.setInstanceSupplier(operations::operations);
        definition.setPrimary(primary);
        beanFactory.registerBeanDefinition(beanName, definition);
    }

    private static IndexMetaRegistry registry(List<RebuildableIndexMeta> metas) {
        return new IndexMetaRegistry(null, Collections.<ManagedEsIndex>emptyList()) {
            @Override
            public List<RebuildableIndexMeta> listMetas() {
                return Collections.unmodifiableList(new ArrayList<RebuildableIndexMeta>(metas));
            }
        };
    }

    private static RebuildableIndexMeta meta(String indexKey,
                                             String alias,
                                             Class<?> entityClass,
                                             String mappingJson) {
        ManagedEsIndex provider = new ManagedEsIndex() {
            @Override
            public String indexKey() {
                return indexKey;
            }

            @Override
            public Class<?> entityClass() {
                return entityClass;
            }
        };
        return new RebuildableIndexMeta(provider, alias, alias, null, mappingJson);
    }

    private static String formattedLog(ListAppender<ILoggingEvent> appender) {
        StringBuilder log = new StringBuilder();
        for (ILoggingEvent event : appender.list) {
            log.append(event.getFormattedMessage()).append('\n');
        }
        return log.toString();
    }

    private static ListAppender<ILoggingEvent> attachRunnerAppender() {
        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(MappingReconcileBootstrapRunner.class)).addAppender(appender);
        return appender;
    }

    private static void detachRunnerAppender(ListAppender<ILoggingEvent> appender) {
        ((Logger) LoggerFactory.getLogger(MappingReconcileBootstrapRunner.class)).detachAppender(appender);
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private static void assertUnmodifiable(List<?> statuses) {
        try {
            ((List) statuses).add(MappingReconcileReport.Status.FAILED_ES);
            fail("statuses must be unmodifiable");
        } catch (UnsupportedOperationException expected) {
            // expected
        }
    }

    @Configuration(proxyBeanMethods = false)
    static class OperationsConfiguration {
        @Bean
        ElasticsearchOperations elasticsearchOperations() {
            return new RecordingOperations(0).operations();
        }
    }

    @Configuration(proxyBeanMethods = false)
    static class LazyAmbiguousOperationsConfiguration {
        private static final AtomicInteger primaryCreations = new AtomicInteger();
        private static final AtomicInteger secondaryCreations = new AtomicInteger();

        static void reset() {
            primaryCreations.set(0);
            secondaryCreations.set(0);
        }

        @Bean
        @Lazy
        @Primary
        ElasticsearchOperations primaryOperations() {
            primaryCreations.incrementAndGet();
            throw new IllegalStateException("ambiguous primary must not be created");
        }

        @Bean
        @Lazy
        ElasticsearchOperations secondaryOperations() {
            secondaryCreations.incrementAndGet();
            return new RecordingOperations(0).operations();
        }
    }

    @Configuration(proxyBeanMethods = false)
    static class LazySingleOperationsConfiguration {
        private static final AtomicInteger creations = new AtomicInteger();
        private static RecordingOperations operations;

        static void reset() {
            creations.set(0);
            operations = new RecordingOperations(1);
            operations.mapping("orders_alias", FILE_MAPPING);
        }

        @Bean
        IndexMetaRegistry testIndexMetaRegistry() {
            return registry(Collections.singletonList(
                    meta("orders", "orders_alias", FileEntity.class, FILE_MAPPING)));
        }

        @Bean
        @Lazy
        @Primary
        ElasticsearchOperations primaryOperations() {
            creations.incrementAndGet();
            return operations.operations();
        }
    }

    @Configuration(proxyBeanMethods = false)
    static class LazyThrowingOperationsConfiguration {
        private static final AtomicInteger creations = new AtomicInteger();

        @Bean
        @Lazy
        ElasticsearchOperations throwingOperations() {
            creations.incrementAndGet();
            throw new IllegalStateException("sole operations creation failed");
        }
    }

    private static class RecordingDeriver extends EntityMappingDeriver {
        private final List<String> declaredMappings = new ArrayList<String>();

        RecordingDeriver() {
            super(new StaticApplicationContext());
        }

        @Override
        public String declaredOrDerived(String mappingJson, Class<?> entityClass) {
            declaredMappings.add(mappingJson);
            if (mappingJson != null && !mappingJson.trim().isEmpty()) {
                return mappingJson;
            }
            return entityClass == EmptyEntity.class ? "  " : DERIVED_MAPPING;
        }
    }

    private static final class RecordingOperations {
        private static final ObjectMapper JSON = new ObjectMapper();

        private final Map<String, Map<String, Object>> mappings =
                new LinkedHashMap<String, Map<String, Object>>();
        private final List<String> coordinates =
                Collections.synchronizedList(new ArrayList<String>());
        private final List<String> threadNames =
                Collections.synchronizedList(new ArrayList<String>());
        private final List<Boolean> daemonFlags =
                Collections.synchronizedList(new ArrayList<Boolean>());
        private final CountDownLatch calls;
        private final CountDownLatch firstReadStarted = new CountDownLatch(1);
        private final CountDownLatch releaseFirstRead = new CountDownLatch(1);
        private final CountDownLatch unexpectedRead = new CountDownLatch(1);
        private final AtomicInteger readCalls = new AtomicInteger();
        private final int expectedReads;
        private boolean blockFirstRead;

        RecordingOperations(int expectedReads) {
            this.expectedReads = expectedReads;
            this.calls = new CountDownLatch(expectedReads);
        }

        void mapping(String alias, String json) {
            try {
                mappings.put(alias, JSON.readValue(json,
                        new TypeReference<LinkedHashMap<String, Object>>() { }));
            } catch (Exception e) {
                throw new AssertionError(e);
            }
        }

        boolean await() throws InterruptedException {
            return calls.await(5, TimeUnit.SECONDS);
        }

        void blockFirstRead() {
            blockFirstRead = true;
        }

        boolean awaitFirstRead() throws InterruptedException {
            return firstReadStarted.await(5, TimeUnit.SECONDS);
        }

        void releaseFirstRead() {
            releaseFirstRead.countDown();
        }

        boolean awaitUnexpectedRead() throws InterruptedException {
            return unexpectedRead.await(500, TimeUnit.MILLISECONDS);
        }

        ElasticsearchOperations operations() {
            return (ElasticsearchOperations) Proxy.newProxyInstance(
                    ElasticsearchOperations.class.getClassLoader(),
                    new Class<?>[]{ElasticsearchOperations.class},
                    (proxy, method, args) -> {
                        if (method.getDeclaringClass() == Object.class) {
                            return objectMethod(proxy, method.getName(), args);
                        }
                        if (!"indexOps".equals(method.getName())
                                || args == null || args.length != 1
                                || !(args[0] instanceof IndexCoordinates)) {
                            throw new UnsupportedOperationException(
                                    "unexpected ElasticsearchOperations call: " + method.getName());
                        }
                        String alias = ((IndexCoordinates) args[0]).getIndexName();
                        coordinates.add(alias);
                        threadNames.add(Thread.currentThread().getName());
                        daemonFlags.add(Thread.currentThread().isDaemon());
                        return indexOperations(alias);
                    });
        }

        private IndexOperations indexOperations(String alias) {
            return (IndexOperations) Proxy.newProxyInstance(
                    IndexOperations.class.getClassLoader(),
                    new Class<?>[]{IndexOperations.class},
                    (proxy, method, args) -> {
                        if (method.getDeclaringClass() == Object.class) {
                            return objectMethod(proxy, method.getName(), args);
                        }
                        if ("exists".equals(method.getName())) {
                            return true;
                        }
                        if ("getMapping".equals(method.getName())) {
                            int call = readCalls.incrementAndGet();
                            if (blockFirstRead && call == 1) {
                                firstReadStarted.countDown();
                                releaseFirstRead.await(5, TimeUnit.SECONDS);
                            }
                            if (call > expectedReads) {
                                unexpectedRead.countDown();
                            }
                            calls.countDown();
                            return mappings.get(alias);
                        }
                        throw new UnsupportedOperationException(
                                "unexpected IndexOperations call: " + method.getName());
                    });
        }

        private static Object objectMethod(Object proxy, String name, Object[] args) {
            if ("toString".equals(name)) {
                return "RecordingOperations";
            }
            if ("hashCode".equals(name)) {
                return System.identityHashCode(proxy);
            }
            if ("equals".equals(name)) {
                return proxy == args[0];
            }
            throw new UnsupportedOperationException(name);
        }
    }

    private static final class FileEntity { }
    private static final class DerivedEntity { }
    private static final class EmptyEntity { }
    private static final class FirstEntity { }
    private static final class SecondEntity { }
}
