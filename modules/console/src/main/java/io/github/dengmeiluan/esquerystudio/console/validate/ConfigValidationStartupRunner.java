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

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.control.EntityMappingDeriver;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;

import java.util.ArrayList;
import java.util.List;

/**
 *  启动期配置门禁：对所有注册 provider 实体的 @Setting/@Mapping 跑三层校验，
 * 把「配置写错、上线建索引才炸」提前到<b>服务启动那一刻</b>暴露（strict 模式直接拒绝启动）。
 *
 * <p>判罚边界（不误杀）：</p>
 * <ul>
 *   <li>L1 确定性错误 / L2 服务端语义拒绝 → strict 模式抛异常挡启动</li>
 *   <li>L2 因 <b>ES 不可达</b>失败（issue code = DRYRUN_FAILED）→ 可用性问题而非配置问题，降级 WARN</li>
 *   <li>WARN/INFO → 只打日志，明细可在控制台「配置校验器」复查</li>
 * </ul>
 *
 * <p>用 {@link ApplicationRunner}（context refresh 完成后、ApplicationReadyEvent 前）：
 * 此时 provider 全部就位，抛异常仍能让 {@code SpringApplication.run} 整体失败。</p>
 *
 * @author aicoding
 */
public class ConfigValidationStartupRunner implements ApplicationRunner {

    private static final Logger logger = LoggerFactory.getLogger(ConfigValidationStartupRunner.class);

    private final IndexConfigValidator validator;
    private final ObjectProvider<IndexMetaRegistry> registryProvider;
    private final ESQueryStudioElasticsearchProperties properties;
    private final EntityMappingDeriver mappingDeriver;

    public ConfigValidationStartupRunner(IndexConfigValidator validator,
                                         ObjectProvider<IndexMetaRegistry> registryProvider,
                                         ESQueryStudioElasticsearchProperties properties,
                                         EntityMappingDeriver mappingDeriver) {
        this.validator = validator;
        this.registryProvider = registryProvider;
        this.properties = properties;
        this.mappingDeriver = mappingDeriver;
    }

    @Override
    public void run(ApplicationArguments args) {
        ESQueryStudioElasticsearchProperties.ConfigValidation cfg = properties.getConfigValidation();
        if ("off".equals(cfg.getMode())) {
            return;
        }
        IndexMetaRegistry registry = registryProvider.getIfAvailable();
        if (registry == null || registry.listIndexKeys().isEmpty()) {
            return; // 纯控制台宿主：无 provider，无校验对象
        }
        List<String> fatal = new ArrayList<>();
        for (String indexKey : registry.listIndexKeys()) {
            RebuildableIndexMeta meta = registry.getByKey(indexKey);
            // 与重建同源：校验的必须是重建实际会应用的那份 mapping（@Mapping 原文，否则注解推导）
            String checkedMapping = mappingDeriver == null
                    ? meta.getMappingJson()
                    : mappingDeriver.declaredOrDerived(meta.getMappingJson(), meta.getEntityClass());
            ConfigValidationReport report = validator.validate(
                    meta.getSettingsJson(), checkedMapping, cfg.isDryRunOnStartup());
            for (ConfigIssue issue : report.getIssues()) {
                if (issue.isError()) {
                    if ("DRYRUN_FAILED".equals(issue.getCode())) {
                        // ES 不可达等可用性问题：不是配置错误，不挡启动
                        logger.warn("[ConfigValidation] indexKey={} dry-run 未能执行（ES 可用性问题，跳过判罚）: {}",
                                indexKey, issue.getMessage());
                    } else {
                        fatal.add("indexKey=" + indexKey + " " + issue);
                    }
                } else {
                    logger.warn("[ConfigValidation] indexKey={} {}", indexKey, issue);
                }
            }
            if (report.isValid() && report.isDryRunPassed()) {
                logger.info("[ConfigValidation] indexKey={} {}", indexKey, passMessage(meta.hasMapping(), checkedMapping != null && !checkedMapping.isEmpty()));
            }
        }
        if (fatal.isEmpty()) {
            return;
        }
        String detail = String.join("\n  ", fatal);
        if ("strict".equals(cfg.getMode())) {
            throw new IllegalStateException("[esquerystudio] 索引配置校验失败（" + fatal.size()
                    + " 处确定性错误，修复后再启动；临时降级可配 esquerystudio.elasticsearch.config-validation.mode=warn）:\n  " + detail);
        }
        logger.error("[ConfigValidation] 发现 {} 处配置错误（mode=warn 不阻断启动，建索引/重建时必失败）:\n  {}",
                fatal.size(), detail);
    }
    /**
     * 「通过」措辞必须点明<b>校验的是哪一份 mapping</b>。
     *
     * <p> 起校验器与重建共用 {@code EntityMappingDeriver.declaredOrDerived}，
     * 所以对无 {@code @Mapping} 的实体，校验的已经是<b>重建实际会应用的那份注解推导 mapping</b>，
     * 不再是「只校验了 settings」。措辞据此分三态，避免两种误导：
     * 既不许对未校验的说「通过」，也不许对已校验的说「未覆盖」。</p>
     *
     * @param hasMapping     实体是否声明了 {@code @Mapping}
     * @param mappingChecked 本次是否真的有一份 mapping 参与了校验
     */
    static String passMessage(boolean hasMapping, boolean mappingChecked) {
        if (!mappingChecked) {
            // 第③④级（复制旧索引 / ES 动态映射）是重建时才决定的，启动期无从校验
            return "settings 校验通过（L1 Lint + L2 Dry-run）；该实体无 @Mapping 且注解推导为空，"
                    + "mapping 未参与校验 —— 重建时将从旧索引复制或回落 ES 动态映射";
        }
        if (hasMapping) {
            return "配置校验通过（L1 Lint + L2 Dry-run；mapping 来自 @Mapping）";
        }
        return "配置校验通过（L1 Lint + L2 Dry-run；该实体无 @Mapping，"
                + "已按重建实际会用的注解推导 mapping 校验）";
    }
}
