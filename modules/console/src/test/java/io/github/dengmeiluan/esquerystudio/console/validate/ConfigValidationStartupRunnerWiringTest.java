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

package io.github.dengmeiluan.esquerystudio.console.validate;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.control.EntityIndexNames;
import io.github.dengmeiluan.esquerystudio.console.control.EntityMappingDeriver;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;
import org.springframework.data.elasticsearch.annotations.Mapping;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 启动期校验的<b>同源</b>守卫：校验器拿到的必须是<b>重建实际会应用的那份 mapping</b>。
 *
 * <p><b>这个洞是实测出来的，不是假想的</b>：改造前校验器直接用 {@code meta.getMappingJson()}
 * （{@code @Mapping} 原文），而重建走 {@code resolveMappingJson()} 会回落到注解推导 ——
 * 于是无 {@code @Mapping} 的索引，校验器一条 mapping 都没校，却照样打「配置校验通过」。
 * 生产实测：{@code bondRepurchaseBasicInfo} 的 {@code @mappings.*} 校验条目为 0，
 * 而有 {@code @Mapping} 的 {@code comInfo} 为 2。</p>
 *
 * <p><b>为什么必须断言「校验器收到了什么」而不只断日志措辞</b>：措辞是结论，
 * 传参才是事实。只断措辞的话，实现把措辞写对、却仍然把 {@code @Mapping} 原文（null）
 * 传给校验器，测试照样绿 —— 那时 mapping 依然没被校验。</p>
 *
 * <p>用 logback {@link ListAppender} 抓日志（logback 本就在 compile classpath，非新增依赖）。</p>
 */
public class ConfigValidationStartupRunnerWiringTest {

    /** 有 @Mapping：校验器应收到 @Mapping 原文。 */
    @Document(indexName = "wiring_with_mapping_alias")
    @Mapping(mappingPath = "scanfixture/scan_mapping.json")
    static class WiringWithMappingES {
    }

    /** 无 @Mapping 但有可映射属性：校验器应收到<b>注解推导</b>的 mapping。 */
    @Document(indexName = "wiring_derived_alias")
    static class WiringDerivedMappingES {
        @Field(type = FieldType.Keyword)
        private String derivedProbeField;

        public String getDerivedProbeField() {
            return derivedProbeField;
        }

        public void setDerivedProbeField(String derivedProbeField) {
            this.derivedProbeField = derivedProbeField;
        }
    }

    /** 无 @Mapping 且无可映射属性：推导为空，校验器应收到 null。 */
    @Document(indexName = "wiring_no_mapping_alias")
    static class WiringNoMappingES {
    }

    /** 校验器替身：记录每次收到的 mappingJson，并一律返回「全通过」。 */
    private static final class RecordingValidator extends IndexConfigValidator {
        final List<String> receivedMappings = new java.util.ArrayList<String>();

        RecordingValidator() {
            super((EsIndexAdmin) null);
        }

        @Override
        public ConfigValidationReport validate(String settingsJson, String mappingJson, boolean dryRun) {
            receivedMappings.add(mappingJson);
            ConfigValidationReport report = new ConfigValidationReport();
            report.setDryRunExecuted(true);
            report.setDryRunPassed(true);
            return report;
        }
    }

    private ListAppender<ILoggingEvent> appender;
    private Logger runnerLogger;

    @Before
    public void attachAppender() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        runnerLogger = (Logger) LoggerFactory.getLogger(ConfigValidationStartupRunner.class);
        runnerLogger.addAppender(appender);
    }

    @After
    public void detachAppender() {
        if (runnerLogger != null) {
            runnerLogger.detachAppender(appender);
        }
    }

    private static ManagedEsIndex providerOf(final Class<?> entityClass) {
        return new ManagedEsIndex() {
            @Override
            public Class<?> entityClass() {
                return entityClass;
            }
        };
    }

    /** 跑一次 runner，返回 indexKey→校验器收到的 mappingJson，以及日志全文。 */
    private Map<String, String> received;
    private String log;

    private void runRunner() {
        AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext();
        ctx.refresh();
        // 无 ElasticsearchOperations Bean → EntityIndexNames 走裸 MappingContext 解析路径
        EntityIndexNames names = new EntityIndexNames(
                ctx.getBeanProvider(ElasticsearchOperations.class), ctx);
        List<ManagedEsIndex> providers = Arrays.asList(
                providerOf(WiringWithMappingES.class),
                providerOf(WiringDerivedMappingES.class),
                providerOf(WiringNoMappingES.class));
        IndexMetaRegistry registry = new IndexMetaRegistry(names, providers);
        ctx.getBeanFactory().registerSingleton("indexMetaRegistry", registry);
        ObjectProvider<IndexMetaRegistry> registryProvider =
                ctx.getBeanProvider(IndexMetaRegistry.class);

        RecordingValidator validator = new RecordingValidator();
        new ConfigValidationStartupRunner(validator, registryProvider,
                new ESQueryStudioElasticsearchProperties(), new EntityMappingDeriver(ctx)).run(null);

        // registry.listIndexKeys() 的顺序即 validate 的调用顺序，据此配对
        received = new LinkedHashMap<String, String>();
        List<String> keys = registry.listIndexKeys();
        assertThat(validator.receivedMappings).hasSameSizeAs(keys);
        for (int i = 0; i < keys.size(); i++) {
            received.put(keys.get(i), validator.receivedMappings.get(i));
        }
        StringBuilder sb = new StringBuilder();
        for (ILoggingEvent e : appender.list) {
            sb.append(e.getFormattedMessage()).append('\n');
        }
        log = sb.toString();
    }

    /**
     * 同源守卫：无 {@code @Mapping} 的索引，校验器必须收到<b>注解推导</b>出的 mapping。
     *
     * <p>这条是本类的核心。它断言的是<b>传参事实</b>：推导出的字段名必须真的出现在
     * 校验器收到的那份 JSON 里。</p>
     */
    @Test
    public void validatorReceivesTheSameMappingRebuildWouldApply() {
        runRunner();

        // ① 有 @Mapping → 收到 @Mapping 原文（scan_mapping.json 里是 id: keyword）
        assertThat(received.get("wiringWithMapping")).contains("\"id\"");

        // ② 无 @Mapping 但可推导 → 收到推导结果，含实体上 @Field 声明的那个字段
        assertThat(received.get("wiringDerivedMapping"))
                .as("无 @Mapping 的索引，校验器必须收到重建会用的注解推导 mapping，而不是 null")
                .isNotNull();
        assertThat(received.get("wiringDerivedMapping")).contains("derivedProbeField");

        // ③ 无 @Mapping 且推导为空 → 确实无 mapping 可校验
        assertThat(received.get("wiringNoMapping")).isNull();
    }

    /**
     * 措辞接线守卫：三个索引在<b>同一次 run</b> 里各自拿到对应的那一态。
     *
     * <p>必须同一次 run：分开测的话，把调用点写死成任一常量都有一部分能过。</p>
     */
    @Test
    public void logWordingIsRoutedPerIndex() {
        runRunner();

        assertThat(log).contains("indexKey=wiringWithMapping 配置校验通过（L1 Lint + L2 Dry-run；mapping 来自 @Mapping）");
        assertThat(log).contains("indexKey=wiringDerivedMapping 配置校验通过");
        assertThat(log).contains("已按重建实际会用的注解推导 mapping 校验");
        assertThat(log).contains("indexKey=wiringNoMapping settings 校验通过");
        assertThat(log).doesNotContain("indexKey=wiringNoMapping 配置校验通过");
    }
}
