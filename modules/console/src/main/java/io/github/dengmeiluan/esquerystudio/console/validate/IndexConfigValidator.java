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

import java.util.Locale;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static io.github.dengmeiluan.esquerystudio.console.validate.ConfigIssue.LAYER_DRYRUN;

/**
 *  配置门禁——校验编排内核：L1/L3（{@link IndexConfigLinter}）+ L2 服务端 Dry-run。
 *
 * <p><b>L2 Dry-run 原理</b>：ES 7.10 没有 validate-config API，唯一的零副作用真校验是
 * 「临时索引试建」——用被校验的 settings+mapping 建 {@code esquerystudio_validate_<ts>_<rand>}，
 * 成功即立刻删除；失败则捕获 ES 原生报错逐条解析。这是服务端语义的最终裁决
 * （analyzer 插件是否存在、settings 键是否合法等 L1 只能给 WARN 的疑点在此定论）。</p>
 *
 * <p>试建时强制覆写 {@code number_of_shards=1, number_of_replicas=0}——结构/语义校验与分片数无关，
 * 覆写避免大分片配置在集群上瞬时分配大量 shard（shards 取值合法性由 L1 数值检查负责）。</p>
 *
 * @author aicoding
 */
public class IndexConfigValidator {

    private static final Logger logger = LoggerFactory.getLogger(IndexConfigValidator.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 临时索引名前缀（拦截器 ADMIN 清单外；建后即删，泄漏时可按前缀批量清理） */
    public static final String DRYRUN_PREFIX = "esquerystudio_validate_";

    /** ES 异常消息形如 {@code Elasticsearch exception [type=xxx_exception, reason=...]}，可嵌套多段 */
    private static final Pattern ES_REASON = Pattern.compile("type=([a-z_]+), reason=(.*?)]");

    private final IndexConfigLinter linter = new IndexConfigLinter();
    private final EsIndexAdmin esIndexAdmin;
    /** w44:目标路由与连接档案——dry-run 实测打的是哪个集群必须随报告透出,
     * 否则「顶栏选错目标回落宿主」的误判无法自查(宿主无分词器插件时报错与本配置无关)。 */
    private final io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter router;
    private final io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore connStore;

    public IndexConfigValidator(EsIndexAdmin esIndexAdmin) {
        this(esIndexAdmin, null, null);
    }

    public IndexConfigValidator(EsIndexAdmin esIndexAdmin,
                                io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter router,
                                io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore connStore) {
        this.esIndexAdmin = esIndexAdmin;
        this.router = router;
        this.connStore = connStore;
    }

    /**
     * 全量校验。
     *
     * @param dryRun true 时在 L1 无 ERROR 的前提下追加 L2 临时索引试建（L1 已确定必炸就不浪费一次建删）
     */
    public ConfigValidationReport validate(String settingsJson, String mappingJson, boolean dryRun) {
        long t0 = System.currentTimeMillis();
        ConfigValidationReport report = new ConfigValidationReport();
        /* 第 ：形态归一化——GET _settings/_mapping 原样形态（索引名壳+flat 平铺）宽容接受，
           L1/L2 都吃净形态，剥壳/归组动作以 INFO 透出（校准误差第二案根治） */
        IndexConfigNormalizer.Result nr = IndexConfigNormalizer.normalize(settingsJson, mappingJson);
        for (String note : nr.notes) {
            report.add(ConfigIssue.info(ConfigIssue.LAYER_LINT, "NORMALIZED_SHAPE", "", note, null));
        }
        report.addAll(linter.lint(nr.settingsJson, nr.mappingJson));
        if (dryRun && report.isValid()) {
            dryRun(nr.settingsJson, nr.mappingJson, report);
        }
        report.setElapsedMs(System.currentTimeMillis() - t0);
        return report;
    }

    private void dryRun(String settingsJson, String mappingJson, ConfigValidationReport report) {
        String tmpIndex = DRYRUN_PREFIX + System.currentTimeMillis() + "_"
                + Integer.toHexString(ThreadLocalRandom.current().nextInt(0x10000));
        report.setDryRunExecuted(true);
        /* w44:实测目标随报告透出(控制台顶栏选错集群时,用户可一眼看出 Dry-run 打偏了) */
        try {
            String tid = router == null ? null : router.requireCapturedTarget();
            if (tid != null) {
                report.setDryRunTargetId(tid);
                report.setDryRunTargetName(connStore == null ? null : connStore.getName(tid));
            }
        } catch (Exception ignore) {
            /* 目标信息是增强信息,取不到不影响校验本身 */
        }
        try {
            esIndexAdmin.createValidatorTempIndex(tmpIndex, overrideShards(settingsJson), mappingJson);
            report.setDryRunPassed(true);
        } catch (Exception e) {
            report.setDryRunPassed(false);
            parseEsError(e, report);
        } finally {
            try {
                if (esIndexAdmin.validatorTempIndexExists(tmpIndex)) {
                    esIndexAdmin.deleteValidatorTempIndex(tmpIndex);
                }
            } catch (Exception cleanup) {
                logger.warn("[IndexConfigValidator] dry-run 临时索引清理失败（可按前缀 {} 手动清理）: {}",
                        DRYRUN_PREFIX, cleanup.getMessage(), cleanup);
            }
        }
    }

    /**
     * 覆写 shards=1 / replicas=0（兼容三种书写形态：顶层扁平键、index 嵌套对象、index. 前缀扁平键），
     * 原值全部移除后统一写回顶层——避免同一 setting 双处指定被 ES 拒绝。
     */
    String overrideShards(String settingsJson) {
        ObjectNode root;
        try {
            root = settingsJson == null || settingsJson.trim().isEmpty()
                    ? MAPPER.createObjectNode()
                    : (ObjectNode) MAPPER.readTree(settingsJson);
        } catch (Exception e) {
            // L1 已挡 JSON 语法错误；此处兜底（e.g. 顶层非 object 被强转失败）——按原样送 ES 裁决
            return settingsJson;
        }
        root.remove("number_of_shards");
        root.remove("number_of_replicas");
        root.remove("index.number_of_shards");
        root.remove("index.number_of_replicas");
        JsonNode idx = root.get("index");
        if (idx instanceof ObjectNode) {
            ((ObjectNode) idx).remove("number_of_shards");
            ((ObjectNode) idx).remove("number_of_replicas");
        }
        root.put("number_of_shards", 1);
        root.put("number_of_replicas", 0);
        return root.toString();
    }

    /** 把 ES 异常链解析为逐条 DRYRUN ERROR（type+reason 去重；嵌套 caused_by 各自成条）。 */
    private void parseEsError(Exception e, ConfigValidationReport report) {
        String msg = String.valueOf(e.getMessage());
        Set<String> seen = new LinkedHashSet<>();
        Matcher m = ES_REASON.matcher(msg);
        while (m.find()) {
            String type = m.group(1);
            String reason = m.group(2);
            if (seen.add(type + "|" + reason)) {
                report.add(ConfigIssue.error(LAYER_DRYRUN, type.toUpperCase(Locale.ROOT), "",
                        "ES 服务端拒绝：" + reason, hint(type, reason)));
            }
        }
        if (seen.isEmpty()) {
            // 非标准格式（如连接失败）——整条透出
            report.add(ConfigIssue.error(LAYER_DRYRUN, "DRYRUN_FAILED", "", "Dry-run 失败：" + msg, null));
        }
    }

    /** 高频服务端报错 → 中文修复提示 */
    private String hint(String type, String reason) {
        if (reason.contains("analyzer") && (reason.contains("not been defined") || reason.contains("not found"))) {
            return "在 settings.analysis.analyzer 中定义该 analyzer，或确认集群已安装对应分词插件";
        }
        if ("illegal_argument_exception".equals(type) && reason.contains("unknown setting")) {
            return "检查 settings 键拼写；自定义配置不能放在 settings 里";
        }
        if ("mapper_parsing_exception".equals(type)) {
            return "检查 mapping 字段定义（type 拼写 / 参数配对 / JSON 结构）";
        }
        return null;
    }
}
