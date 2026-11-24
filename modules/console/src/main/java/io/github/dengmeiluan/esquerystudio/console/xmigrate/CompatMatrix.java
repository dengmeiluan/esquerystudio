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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 结构同步的<b>主动兼容矩阵</b>：建索引前按静态规则表预判并剔除源侧跨集群不可迁移内容。
 *
 * <p>与 {@link StructureSyncService} 的反应式剔除（按目标真实报错逐轮兜底）互补：矩阵在
 * PUT 之前按「阿里云 apack 私有 settings / 跨厂商私有 settings（vendor-private，按目标厂商判定，
 * 目标厂商未知时不剔并逐键告知——探测失败不误剔，留反应式兜底）/
 * 已废弃 settings / 节点属性路由 / 目标缺失插件的分析组件 / 目标缺失 ILM 策略 /
 * 目标缺失 ingest pipeline（pipeline-exists 探针，index.final_pipeline/default_pipeline 引用）/
 * 目标版本低于设置引入地板（version-floor，含 index.sort.、index.xpack. 前缀族）/
 * 厂商特有 store 类型值（store-type-vendor）/ 厂商特有 index.codec 压缩编码值（codec-vendor）」
 * 十类规则
 * <b>直接剔除</b>，减少对报错兜底的依赖；分片过碎、auto_expand_replicas、显式 store.type、
 * 特有 codec 目标厂商未知、mapping 上限超目标默认五类不可决断项只给 advice 不动内容。</p>
 *
 * <p>规则表数据驱动（{@link #STRIP_RULES}），剔除与降级复用 {@link StructureSyncService}
 * 既有的级联剔除与字段引用降级逻辑，保证主动/反应式两条路径行为一致。</p>
 */
public final class CompatMatrix {

    private CompatMatrix() {
    }

    /** 目标集群能力快照输入（由探测结果拼装；探测不到的项如实缺省，规则自行跳过）。 */
    public interface TargetSnapshot {

        /** 目标集群版本号（如 7.10.2）；未知 null。 */
        String version();

        /** 目标集群插件 id 集合（小写比对）；探测失败为空集。 */
        Set<String> plugins();

        /** 目标数据节点数；未知 null（分片 advice 跳过）。 */
        Integer dataNodeCount();

        /** 目标 ILM 策略存在性探针：返回 false（如 404）表示策略缺失；异常按存在处理（不误删）。 */
        boolean ilmPolicyExists(String policy);

        /** 目标 ingest pipeline 存在性探针（index.final_pipeline/index.default_pipeline 引用检查）：
         *  返回 false（如 404）表示 pipeline 缺失；异常按存在处理（不误删）。缺省保守视为存在。 */
        default boolean ingestPipelineExists(String pipeline) {
            return true;
        }

        /** 插件清单是否可信（探测失败时 false：插件规则整体跳过，避免误剔可用组件）。 */
        boolean pluginsReliable();

        /** 目标集群厂商 id（aliyun/tencent/aws/elastic/oss；探测不出为 unknown）；vendor-private 规则用。 */
        default String vendorId() {
            return "unknown";
        }
    }

    /** 矩阵应用结果：planned 剔除清单（含降级）与 advice 建议，均按规则序追加。 */
    public static final class Planned {
        /** 已剔除的 settings 键：{@code [{key, reason}]}。 */
        public final List<Map<String, Object>> removedSettings = new ArrayList<>();
        /** 已剔除的 analysis 组件（含级联 analyzer）：{@code [{kind, name, reason}]}。 */
        public final List<Map<String, Object>> removedAnalysis = new ArrayList<>();
        /** 已降级的字段引用：{@code [{field, from, to, reason}]}。 */
        public final List<Map<String, Object>> downgradedFields = new ArrayList<>();
        /** 非剔除建议：{@code [{kind, key, message}]}（kind ∈ shards/replicas/store）。 */
        public final List<Map<String, Object>> advice = new ArrayList<>();
        /** 单条规则应用失败的告知（规则隔离：失败只跳过该条规则，不阻断整体）。 */
        public final List<String> warnings = new ArrayList<>();
    }

    /** settings 剔除规则：id + 判定 + 剔除理由（ilm 为动态理由）。 */
    private abstract static class StripRule {
        final String id;

        StripRule(String id) {
            this.id = id;
        }

        /** 规则是否命中该 settings 键。 */
        abstract boolean matches(String key, Object value, TargetSnapshot target);

        /** 剔除理由（默认静态文案；ilm 覆写为带策略名、vendor-private 覆写为带目标厂商的动态文案）。 */
        String reasonFor(String key, Object value, TargetSnapshot target) {
            return staticReason();
        }

        String staticReason() {
            return null;
        }
    }

    /** 节点属性路由的四个子域前缀（属性名以 "_" 开头的系统属性不剔）。 */
    private static final List<String> ROUTING_SUBDOMAINS = Arrays.asList(
            "index.routing.allocation.include.", "index.routing.allocation.exclude.",
            "index.routing.allocation.require.", "index.routing.allocation.initial_recovery.");

    /** 静态规则表：按序匹配，命中即剔（一条键只剔一次；vendor-private 排在 apack-private 之后，
     * 同键先到先得——index.apack.* 由 apack-private 保留其更具体理由，vendor-private 不重复报）。 */
    private static final List<StripRule> STRIP_RULES = Arrays.asList(
            new StripRule("apack-private") {
                @Override
                boolean matches(String key, Object value, TargetSnapshot target) {
                    return key.startsWith("index.apack.");
                }

                @Override
                String staticReason() {
                    return "阿里云 apack 私有设置，跨环境不可迁移";
                }
            },
            new StripRule("vendor-private") {
                @Override
                boolean matches(String key, Object value, TargetSnapshot target) {
                    String owner = vendorPrivateOwner(key);
                    /* 目标厂商未知（探测失败）不剔：不基于猜测动源结构，留反应式兜底 */
                    return owner != null && !"unknown".equals(target.vendorId())
                            && !owner.equals(target.vendorId());
                }

                @Override
                String reasonFor(String key, Object value, TargetSnapshot target) {
                    return "vendor private setting (" + vendorPrivateOwner(key)
                            + ") not supported by target vendor " + target.vendorId();
                }
            },
            new StripRule("ttl-legacy") {
                @Override
                boolean matches(String key, Object value, TargetSnapshot target) {
                    return key.startsWith("index.ttl");
                }

                @Override
                String staticReason() {
                    return "已废弃的 TTL 设置";
                }
            },
            new StripRule("routing-attrs") {
                @Override
                boolean matches(String key, Object value, TargetSnapshot target) {
                    for (String prefix : ROUTING_SUBDOMAINS) {
                        if (key.startsWith(prefix)) {
                            String attr = key.substring(prefix.length());
                            int lastDot = attr.lastIndexOf('.');
                            String lastSegment = lastDot >= 0 ? attr.substring(lastDot + 1) : attr;
                            /* 系统属性（_name/_ip/_tier_preference 等）目标集群自解释，不剔 */
                            return !lastSegment.startsWith("_");
                        }
                    }
                    return false;
                }

                @Override
                String staticReason() {
                    return "节点属性路由依赖源集群节点标签，跨集群无法匹配，将导致分片不分配";
                }
            },
            new StripRule("ilm-missing") {
                @Override
                boolean matches(String key, Object value, TargetSnapshot target) {
                    return "index.lifecycle.name".equals(key) && value != null
                            && !value.toString().trim().isEmpty()
                            && !target.ilmPolicyExists(value.toString().trim());
                }

                @Override
                String reasonFor(String key, Object value, TargetSnapshot target) {
                    return "目标集群不存在 ILM 策略 " + (value == null ? "" : value.toString().trim());
                }
            },
            new StripRule("pipeline-missing") {
                @Override
                boolean matches(String key, Object value, TargetSnapshot target) {
                    if (!("index.final_pipeline".equals(key) || "index.default_pipeline".equals(key))
                            || value == null) {
                        return false;
                    }
                    String pipeline = value.toString().trim();
                    return !pipeline.isEmpty() && !target.ingestPipelineExists(pipeline);
                }

                @Override
                String reasonFor(String key, Object value, TargetSnapshot target) {
                    return "目标缺少 ingest pipeline " + (value == null ? "" : value.toString().trim());
                }
            },
            new StripRule("version-floor") {
                @Override
                boolean matches(String key, Object value, TargetSnapshot target) {
                    String floor = versionFloorOf(key);
                    /* 目标版本未知（探测失败/解析不了）不剔：保守，留反应式兜底 */
                    return floor != null && compareVersions(target.version(), floor) < 0;
                }

                @Override
                String reasonFor(String key, Object value, TargetSnapshot target) {
                    return "目标 " + target.version() + " 低于该设置最低版本 " + versionFloorOf(key);
                }
            },
            new StripRule("store-type-vendor") {
                @Override
                boolean matches(String key, Object value, TargetSnapshot target) {
                    if (!"index.store.type".equals(key) || !(value instanceof String)) {
                        return false;
                    }
                    String owner = STORE_TYPE_VENDORS.get(((String) value).trim());
                    /* 目标厂商未知不剔（advice 提示人工确认），已知且非值归属厂商才剔 */
                    return owner != null && !"unknown".equals(target.vendorId())
                            && !owner.equals(target.vendorId());
                }

                @Override
                String reasonFor(String key, Object value, TargetSnapshot target) {
                    String storeType = value == null ? "" : String.valueOf(value).trim();
                    return storeType + " 为" + vendorName(STORE_TYPE_VENDORS.get(storeType))
                            + "特有 store 类型，目标为 " + target.vendorId();
                }
            },
            new StripRule("codec-vendor") {
                @Override
                boolean matches(String key, Object value, TargetSnapshot target) {
                    if (!"index.codec".equals(key) || !(value instanceof String)) {
                        return false;
                    }
                    String owner = CODEC_VENDORS.get(((String) value).trim());
                    /* 与 store-type-vendor 同口径：目标厂商未知不剔（advice 人工确认），已知且非归属厂商才剔 */
                    return owner != null && !"unknown".equals(target.vendorId())
                            && !owner.equals(target.vendorId());
                }

                @Override
                String reasonFor(String key, Object value, TargetSnapshot target) {
                    String codec = value == null ? "" : String.valueOf(value).trim();
                    return codec + " 为" + vendorName(CODEC_VENDORS.get(codec))
                            + "（OpenSearch）特有压缩编码，目标为 " + target.vendorId();
                }
            });

    /** 设置键的最低引入版本地板（目标版本低于地板即剔；均为顶层键，表可按需扩展）。
     *  版本依据 elastic.co 官方文档：soft_deletes/default_pipeline 6.5.0（6.5 新增，含 CCR 内部键族）、
     *  number_of_routing_shards 6.1.0（split API 随 6.1.0 发布）、index.write.wait_for_active_shards
     *  7.7.0（7.7.0 由 index.wait_for_active_shards 更名而来）。 */
    private static final Map<String, String> VERSION_FLOOR = buildVersionFloor();

    private static Map<String, String> buildVersionFloor() {
        Map<String, String> out = new LinkedHashMap<>();
        out.put("index.search.idle.after", "7.0.0");
        out.put("index.hidden", "7.7.0");
        out.put("index.final_pipeline", "7.12.0");
        out.put("index.soft_deletes.enabled", "6.5.0");
        out.put("index.default_pipeline", "6.5.0");
        out.put("index.number_of_routing_shards", "6.1.0");
        out.put("index.write.wait_for_active_shards", "7.7.0");
        return Collections.unmodifiableMap(out);
    }

    /** 前缀形态的版本地板（子键众多，按前缀整族判定）：index.sort.* 随 6.0.0 索引排序引入；
     *  index.xpack.* 为 xpack 内部键族（index.xpack.ccr.* 随 CCR 6.5.0 引入，watcher 族更早），
     *  以 6.5.0 为整族地板（更早目标集群已无该族同步场景，误剔风险由反应式兜底收口）。 */
    private static final Map<String, String> VERSION_FLOOR_PREFIXES = buildVersionFloorPrefixes();

    private static Map<String, String> buildVersionFloorPrefixes() {
        Map<String, String> out = new LinkedHashMap<>();
        out.put("index.sort.", "6.0.0");
        out.put("index.xpack.", "6.5.0");
        return Collections.unmodifiableMap(out);
    }

    /** 键的版本地板（精确键优先，其次前缀族）；无地板返回 null。 */
    private static String versionFloorOf(String key) {
        String floor = VERSION_FLOOR.get(key);
        if (floor != null) {
            return floor;
        }
        for (Map.Entry<String, String> e : VERSION_FLOOR_PREFIXES.entrySet()) {
            if (key.startsWith(e.getKey())) {
                return e.getValue();
            }
        }
        return null;
    }

    /** 值级厂商特有 store 类型（值 → 归属厂商 id，目标厂商不同即剔该键；表可按需扩展）。 */
    private static final Map<String, String> STORE_TYPE_VENDORS = buildStoreTypeVendors();

    private static Map<String, String> buildStoreTypeVendors() {
        Map<String, String> out = new LinkedHashMap<>();
        out.put("hybridfs", "aliyun");
        return Collections.unmodifiableMap(out);
    }

    /** 值级厂商特有 index.codec 压缩编码（值 → 归属厂商 id，目标厂商不同即剔该键）：
     *  zstd/zstd_no_dict 随 OpenSearch 2.9.0 引入，Elasticsearch 各版本均不支持；
     *  default/best_compression 为两侧通用值，不入表。表可按需扩展。 */
    private static final Map<String, String> CODEC_VENDORS = buildCodecVendors();

    private static Map<String, String> buildCodecVendors() {
        Map<String, String> out = new LinkedHashMap<>();
        out.put("zstd", "aws");
        out.put("zstd_no_dict", "aws");
        return Collections.unmodifiableMap(out);
    }

    /** 厂商中文简称（store-type-vendor 的剔除理由用，与 vendorLabel 同源的短名口径）。 */
    private static String vendorName(String vendorId) {
        if ("aliyun".equals(vendorId)) {
            return "阿里云";
        }
        if ("tencent".equals(vendorId)) {
            return "腾讯云";
        }
        if ("aws".equals(vendorId)) {
            return "AWS";
        }
        if ("elastic".equals(vendorId)) {
            return "Elastic Cloud";
        }
        if ("oss".equals(vendorId)) {
            return "开源自建";
        }
        return vendorId == null ? "未知" : vendorId;
    }

    /** 语义化版本比较（major.minor.patch 数值逐段，段缺省按 0，含 7.10.2-SNAPSHOT 后缀剥离）；
     * 任一侧解析不了返回 +1（视为不低于地板：保守不剔）。 */
    private static int compareVersions(String left, String right) {
        int[] l = versionParts(left);
        int[] r = versionParts(right);
        if (l == null || r == null) {
            return 1;
        }
        for (int i = 0; i < 3; i++) {
            if (l[i] != r[i]) {
                return Integer.compare(l[i], r[i]);
            }
        }
        return 0;
    }

    private static int[] versionParts(String version) {
        if (version == null || version.trim().isEmpty()) {
            return null;
        }
        String[] parts = version.trim().split("\\.");
        int[] out = new int[3];
        for (int i = 0; i < 3; i++) {
            String segment = i < parts.length ? parts[i] : "0";
            String numeric = segment.split("[^0-9]")[0];
            if (numeric.isEmpty()) {
                return null;
            }
            try {
                out[i] = Integer.parseInt(numeric);
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return out;
    }

    /** 厂商私有 settings 前缀表：键归属厂商 → 私有前缀（目标厂商不同即剔）。
     *  aws 档含 Amazon OpenSearch 系前缀（docs.opensearch.org 确认）：index.knn（k-NN 插件开关，
     *  兼容 index.knn.* 子键族）、index.remote_store.（remote-backed storage）；
     *  index.index_plugin. 未经文档证实，不收。 */
    private static final Map<String, List<String>> VENDOR_PRIVATE_PREFIXES = buildVendorPrivatePrefixes();

    private static Map<String, List<String>> buildVendorPrivatePrefixes() {
        Map<String, List<String>> out = new LinkedHashMap<>();
        out.put("aliyun", Collections.unmodifiableList(Arrays.asList("index.apack.", "index.aliyun.")));
        out.put("tencent", Collections.unmodifiableList(Arrays.asList("index.tencent.", "index.qcloud.")));
        out.put("aws", Collections.unmodifiableList(Arrays.asList(
                "index.cloud_aws.", "index.knn", "index.remote_store.")));
        return Collections.unmodifiableMap(out);
    }

    /** settings 键归属的厂商（命中私有前缀表返回厂商 id，否则 null）。 */
    private static String vendorPrivateOwner(String key) {
        for (Map.Entry<String, List<String>> e : VENDOR_PRIVATE_PREFIXES.entrySet()) {
            for (String prefix : e.getValue()) {
                if (key.startsWith(prefix)) {
                    return e.getKey();
                }
            }
        }
        return null;
    }

    /** 依赖插件的分析组件名（组件 type 或字段直接引用名）→ 目标插件缺失时的剔除范围。
     *  qq_smart/qq_max/qq_smart_ner/qq_max_ner 为腾讯云 ES 自研 QQ 分词插件（analysis-qq）
     *  提供的分析器/分词器（cloud.tencent.com/document/product/845/45531）。 */
    private static final Set<String> PLUGIN_COMPONENTS = new LinkedHashSet<>(Arrays.asList(
            "ik_max_word", "ik_smart", "aliws", "aliws_tokenizer", "pinyin",
            "stconvert", "thulac", "smartcn", "ansj", "hanlp",
            "qq_smart", "qq_max", "qq_smart_ner", "qq_max_ner"));

    /** 固定插件映射的组件 → 插件 id；命中固定 id 或「插件 id 包含组件名」任一即算覆盖
     *  （固定映射为增量补充，不取代包含启发——历史插件 id 如 apack-aliws 仍按包含命中）。 */
    private static final Map<String, String> COMPONENT_PLUGIN = buildComponentPlugin();

    private static Map<String, String> buildComponentPlugin() {
        Map<String, String> out = new LinkedHashMap<>();
        out.put("ik_max_word", "analysis-ik");
        out.put("ik_smart", "analysis-ik");
        out.put("pinyin", "analysis-pinyin");
        out.put("stconvert", "analysis-stconvert");
        out.put("smartcn", "analysis-smartcn");
        out.put("thulac", "analysis-thulac");
        out.put("ansj", "analysis-ansj");
        out.put("aliws", "analysis-aliws");
        out.put("aliws_tokenizer", "analysis-aliws");
        out.put("qq_smart", "analysis-qq");
        out.put("qq_max", "analysis-qq");
        out.put("qq_smart_ner", "analysis-qq");
        out.put("qq_max_ner", "analysis-qq");
        return out;
    }

    /** 矩阵涉及的分析组件类别与字段引用属性（与 StructureSyncService 的处理范围一致）。 */
    private static final String[] ANALYSIS_KINDS = {"analyzer", "tokenizer", "filter", "char_filter", "normalizer"};

    /** 建议显式移除 store.type 的取值（旧文件系统实现，目标默认存储更稳妥）。 */
    private static final Set<String> ADVISE_STORE_TYPES = new LinkedHashSet<>(Arrays.asList("niofs", "simplefs"));

    /**
     * 应用矩阵：直接修改传入的 settings/mappings（剔除与降级就地生效，供后续 PUT 体使用），
     * 返回 planned 清单与 advice。任何单条规则失败不阻断整体（矩阵是预判增强，不是硬门禁）：
     * 每条规则独立隔离，单条失败记入 {@link Planned#warnings} 后继续其余规则。
     *
     * @param settings         源 settings（flat_settings 扁平键表，含 {@code index.analysis} 嵌套对象）
     * @param mappings         源 mapping body（无类型形态）
     * @param target           目标能力快照（版本/插件/数据节点数/ILM 探针/厂商 id）
     * @param fallbackAnalyzer 字段引用降级目标（空则由调用方归一为 standard）
     */
    public static Planned apply(Map<String, Object> settings, Map<String, Object> mappings,
                                TargetSnapshot target, String fallbackAnalyzer) {
        return apply(settings, mappings, target, fallbackAnalyzer, null);
    }

    /**
     * 应用矩阵（vendor-aware 形态）：{@code sourceVendorId} 为源集群厂商 id，与目标厂商不同
     * 且发生组件剔除/降级时追加 {@code plugin_install} advice（跨厂商场景提示装插件或接受降级）。
     */
    public static Planned apply(Map<String, Object> settings, Map<String, Object> mappings,
                                TargetSnapshot target, String fallbackAnalyzer, String sourceVendorId) {
        Planned out = new Planned();
        String fallback = fallbackAnalyzer == null || fallbackAnalyzer.trim().isEmpty()
                ? StructureSyncService.DEFAULT_FALLBACK_ANALYZER : fallbackAnalyzer.trim();
        applySettingRules(settings, target, out);
        try {
            applyPluginAnalysisRule(settings, mappings, target, fallback, sourceVendorId, out);
        } catch (RuntimeException e) {
            out.warnings.add("兼容矩阵规则 plugin-analysis 应用失败: " + rootMsg(e)
                    + "，相关组件暂不剔除，留给反应式兜底");
        }
        applyAdviceRules(settings, target, out);
        return out;
    }

    /** settings 键规则（apack/ttl/routing/ilm）：命中即从 settings 移除并记录；单条规则对单键失败只记告知、其余规则照常。
     * 目标厂商未知时 vendor-private 命中键不剔，逐键告知（探测失败不误剔，留反应式兜底）。 */
    private static void applySettingRules(Map<String, Object> settings, TargetSnapshot target, Planned out) {
        for (String key : new ArrayList<>(settings.keySet())) {
            boolean stripped = false;
            for (StripRule rule : STRIP_RULES) {
                Object value = settings.get(key);
                try {
                    if (!rule.matches(key, value, target)) {
                        continue;
                    }
                    settings.remove(key);
                    out.removedSettings.add(entry("key", key, "rule", rule.id,
                            "reason", rule.reasonFor(key, value, target)));
                    stripped = true;
                    break;
                } catch (RuntimeException e) {
                    out.warnings.add("兼容矩阵规则 " + rule.id + " 应用失败（settings 键 " + key + "）: "
                            + rootMsg(e) + "，该键暂不剔除，留给反应式兜底");
                }
            }
            if (!stripped && "unknown".equals(target.vendorId())
                    && vendorPrivateOwner(key) != null && settings.containsKey(key)) {
                out.warnings.add("目标厂商未知，跳过厂商私有设置剔除：" + key);
            }
        }
    }

    /**
     * 插件分析组件规则：组件（定义 type 或字段直接引用）∈ {@link #PLUGIN_COMPONENTS} 且目标
     * 插件清单不含对应插件 → 剔组件定义（复用既有级联：引用被剔定义的 analyzer 一并剔）、
     * 剔直接引用缺失组件名的自定义 analyzer、字段引用（组件名或被剔 analyzer 名）降级为回退分词器。
     * vendor-aware：目标厂商已知时降级条目 reason 附目标厂商（如 {@code target vendor tencent
     * lacks plugin analysis-ik; analyzer ik_max_word -> standard}）；源/目标厂商均已知且不同
     * 且实际发生剔除/降级时，逐插件追加 {@code plugin_install} advice。
     */
    private static void applyPluginAnalysisRule(Map<String, Object> settings, Map<String, Object> mappings,
                                                TargetSnapshot target, String fallback,
                                                String sourceVendorId, Planned out) {
        Set<String> missing = new LinkedHashSet<>();
        for (String component : PLUGIN_COMPONENTS) {
            if (!pluginCovered(component, target.plugins())) {
                missing.add(component);
            }
        }
        if (missing.isEmpty()) {
            return;
        }
        /* 目标插件清单不可信（探测失败）时整体跳过：宁可留给反应式兜底，不误剔可用组件 */
        if (!target.pluginsReliable()) {
            return;
        }
        Set<String> touchedPlugins = new LinkedHashSet<>();
        Object analysisNode = settings.get("index.analysis");
        if (analysisNode instanceof Map) {
            Map<String, Object> analysis = (Map<String, Object>) analysisNode;
            /* ① 定义本体：type ∈ 缺失组件（内部按定义名级联引用它的 analyzer/字段） */
            for (String kind : ANALYSIS_KINDS) {
                Object byKind = analysis.get(kind);
                if (!(byKind instanceof Map)) {
                    continue;
                }
                for (Map.Entry<String, Object> e : new ArrayList<>(((Map<String, Object>) byKind).entrySet())) {
                    if (!(e.getValue() instanceof Map)) {
                        continue;
                    }
                    Object type = ((Map<String, Object>) e.getValue()).get("type");
                    if (type instanceof String && missing.contains(type)) {
                        String component = String.valueOf(type);
                        int before = out.removedAnalysis.size() + out.downgradedFields.size();
                        StructureSyncService.removeAnalysisComponent(kind, e.getKey(),
                                pluginMissingReason(component), settings, mappings, fallback,
                                out.removedAnalysis, out.downgradedFields, false,
                                pluginFieldReason(component, target.vendorId(), fallback));
                        if (out.removedAnalysis.size() + out.downgradedFields.size() > before) {
                            touchedPlugins.add(requiredPlugin(component));
                        }
                    }
                }
            }
            /* ② 自定义 analyzer 直接引用缺失组件名（tokenizer 值 / filter、char_filter 列表项）：
               定义名与组件名不同时 ① 的按名级联覆盖不到，这里按引用值补剔 */
            Object analyzersNode = analysis.get("analyzer");
            Map<String, String> cascadedReasons = new LinkedHashMap<>();
            Map<String, String> cascadedComponents = new LinkedHashMap<>();
            if (analyzersNode instanceof Map) {
                Map<String, Object> analyzers = (Map<String, Object>) analyzersNode;
                for (Map.Entry<String, Object> e : new ArrayList<>(analyzers.entrySet())) {
                    if (!(e.getValue() instanceof Map)) {
                        continue;
                    }
                    String component = referencedMissingComponent((Map<String, Object>) e.getValue(), missing);
                    if (component != null) {
                        String reason = "analyzer 引用了目标不可用的组件 " + component + ": "
                                + pluginMissingReason(component);
                        analyzers.remove(e.getKey());
                        cascadedReasons.put(e.getKey(), reason);
                        cascadedComponents.put(e.getKey(), component);
                        out.removedAnalysis.add(entry("kind", "analyzer", "name", e.getKey(),
                                "reason", reason));
                        touchedPlugins.add(requiredPlugin(component));
                    }
                }
                if (analysis.isEmpty()) {
                    settings.remove("index.analysis");
                }
            }
            /* ③ 字段直接引用缺失组件名（如 analyzer=ik_max_word）与被剔 analyzer 名：逐个降级 */
            for (String component : missing) {
                int before = out.downgradedFields.size();
                StructureSyncService.downgradeFieldReferences(mappings.get("properties"),
                        Collections.singleton(component), fallback, out.downgradedFields,
                        pluginFieldReason(component, target.vendorId(), fallback));
                if (out.downgradedFields.size() > before) {
                    touchedPlugins.add(requiredPlugin(component));
                }
            }
            for (Map.Entry<String, String> cascaded : cascadedReasons.entrySet()) {
                StructureSyncService.downgradeFieldReferences(mappings.get("properties"),
                        Collections.singleton(cascaded.getKey()), fallback, out.downgradedFields,
                        pluginFieldReason(cascadedComponents.get(cascaded.getKey()),
                                target.vendorId(), fallback));
            }
            /* 空节收口：清空的类别键与整体清空的 index.analysis 一并移除（待 PUT 体不留空壳） */
            for (String kind : ANALYSIS_KINDS) {
                if (analysis.get(kind) instanceof Map && ((Map<?, ?>) analysis.get(kind)).isEmpty()) {
                    analysis.remove(kind);
                }
            }
            if (analysis.isEmpty()) {
                settings.remove("index.analysis");
            }
        } else {
            /* settings 无 analysis 节：字段仍可能直接引用组件名，降级照做 */
            for (String component : missing) {
                int before = out.downgradedFields.size();
                StructureSyncService.downgradeFieldReferences(mappings.get("properties"),
                        Collections.singleton(component), fallback, out.downgradedFields,
                        pluginFieldReason(component, target.vendorId(), fallback));
                if (out.downgradedFields.size() > before) {
                    touchedPlugins.add(requiredPlugin(component));
                }
            }
        }
        /* 计划清单规则溯源：本条规则产出的剔除/降级条目统一标注 rule=plugin-analysis（旧字段原样保留） */
        for (Map<String, Object> row : out.removedAnalysis) {
            row.putIfAbsent("rule", "plugin-analysis");
        }
        for (Map<String, Object> row : out.downgradedFields) {
            row.putIfAbsent("rule", "plugin-analysis");
        }
        appendPluginInstallAdvice(sourceVendorId, target.vendorId(), touchedPlugins, out);
    }

    /** 跨厂商且实际发生组件剔除/降级时，逐插件追加 plugin_install advice（两侧厂商均已知才判「变」）。 */
    private static void appendPluginInstallAdvice(String sourceVendorId, String targetVendorId,
                                                  Set<String> touchedPlugins, Planned out) {
        String sv = knownVendor(sourceVendorId);
        String tv = knownVendor(targetVendorId);
        if (sv == null || tv == null || sv.equals(tv) || touchedPlugins.isEmpty()) {
            return;
        }
        for (String plugin : touchedPlugins) {
            out.advice.add(entry("kind", "plugin_install", "key", plugin,
                    "message", "target vendor " + tv + " lacks plugin " + plugin
                            + "; install it on target or accept standard fallback"));
        }
    }

    /** 厂商 id 归一：null/空/unknown 归一为 null（未知厂商不参与 vendor 变更判定）。 */
    private static String knownVendor(String vendorId) {
        if (vendorId == null) {
            return null;
        }
        String v = vendorId.trim();
        return v.isEmpty() || "unknown".equals(v) ? null : v;
    }

    /** 字段引用降级条目的 reason：目标厂商已知时附厂商与降级形态，未知时退回中文缺失文案。 */
    private static String pluginFieldReason(String component, String targetVendorId, String fallback) {
        String tv = knownVendor(targetVendorId);
        if (tv == null) {
            return pluginMissingReason(component);
        }
        return "target vendor " + tv + " lacks plugin " + requiredPlugin(component)
                + "; analyzer " + component + " -> " + fallback;
    }

    /** analyzer 定义是否直接引用任一缺失组件（tokenizer 等值、filter/char_filter 列表包含）；命中返回组件名。 */
    private static String referencedMissingComponent(Map<String, Object> analyzerDef, Set<String> missing) {
        Object tokenizer = analyzerDef.get("tokenizer");
        if (tokenizer instanceof String && missing.contains(tokenizer)) {
            return String.valueOf(tokenizer);
        }
        for (String kind : new String[]{"filter", "char_filter"}) {
            Object list = analyzerDef.get(kind);
            if (list instanceof List) {
                for (Object item : (List<?>) list) {
                    if (item instanceof String && missing.contains(item)) {
                        return String.valueOf(item);
                    }
                }
            }
        }
        return null;
    }

    /** 组件是否被目标插件清单覆盖：固定映射精确命中或插件 id 包含组件名（任一即可）。 */
    private static boolean pluginCovered(String component, Set<String> plugins) {
        if (plugins == null || plugins.isEmpty()) {
            return false;
        }
        String fixed = COMPONENT_PLUGIN.get(component);
        for (String plugin : plugins) {
            String p = plugin == null ? "" : plugin.toLowerCase(Locale.ROOT);
            if ((fixed != null && p.equals(fixed)) || p.contains(component)) {
                return true;
            }
        }
        return false;
    }

    /** 插件是否覆盖矩阵已知的具名分析组件（与 {@link #pluginCovered} 反向同口径）：能力对比时用于判定缺失插件可被 sync_structure 自动剔除/降级。 */
    public static boolean coversKnownComponent(String pluginId) {
        if (pluginId == null) {
            return false;
        }
        String p = pluginId.toLowerCase(Locale.ROOT);
        for (String component : PLUGIN_COMPONENTS) {
            String fixed = COMPONENT_PLUGIN.get(component);
            if ((fixed != null && p.equals(fixed)) || p.contains(component)) {
                return true;
            }
        }
        return false;
    }

    private static String pluginMissingReason(String component) {
        return "目标集群缺少插件 " + requiredPlugin(component) + "，组件 " + component + " 不可用";
    }

    /** 组件对应的插件名（固定映射优先，其余为组件名本身——插件 id 含组件名即算覆盖）。 */
    private static String requiredPlugin(String component) {
        String fixed = COMPONENT_PLUGIN.get(component);
        return fixed != null ? fixed : component;
    }

    /** advice 规则（分片过碎/auto_expand_replicas/store.type）：只建议、不动 settings；单条失败只记告知、其余照常。 */
    private static void applyAdviceRules(Map<String, Object> settings, TargetSnapshot target, Planned out) {
        try {
            Integer shards = parseInt(settings.get("index.number_of_shards"));
            Integer dataNodes = target.dataNodeCount();
            if (shards != null && dataNodes != null && shards > 3 * dataNodes) {
                out.advice.add(entry("kind", "shards", "key", "index.number_of_shards",
                        "message", "目标数据节点 " + dataNodes + " 个，源分片 " + shards + " 片过碎，建议 ≤ " + (3 * dataNodes)));
            }
        } catch (RuntimeException e) {
            out.warnings.add("兼容矩阵规则 shards-advise 应用失败: " + rootMsg(e));
        }
        try {
            if (settings.containsKey("index.auto_expand_replicas")) {
                out.advice.add(entry("kind", "replicas", "key", "index.auto_expand_replicas",
                        "message", "auto_expand_replicas 跨集群可能失控（如 0-all），建议显式副本数"));
            }
        } catch (RuntimeException e) {
            out.warnings.add("兼容矩阵规则 replicas-advise 应用失败: " + rootMsg(e));
        }
        try {
            Object storeType = settings.get("index.store.type");
            if (storeType instanceof String && ADVISE_STORE_TYPES.contains(storeType)) {
                out.advice.add(entry("kind", "store", "key", "index.store.type",
                        "message", "目标默认存储类型更稳妥，建议移除显式 store.type"));
            }
        } catch (RuntimeException e) {
            out.warnings.add("兼容矩阵规则 store-advise 应用失败: " + rootMsg(e));
        }
        try {
            Object storeType = settings.get("index.store.type");
            if (storeType instanceof String) {
                String owner = STORE_TYPE_VENDORS.get(storeType.toString().trim());
                /* 目标厂商未知时不剔（保守），但逐值告知请人工确认 */
                if (owner != null && "unknown".equals(target.vendorId())) {
                    out.advice.add(entry("kind", "store", "key", "index.store.type",
                            "message", storeType.toString().trim() + " 为" + vendorName(owner)
                                    + "特有 store 类型，目标厂商未知，建议人工确认目标集群是否支持"));
                }
            }
        } catch (RuntimeException e) {
            out.warnings.add("兼容矩阵规则 store-type-vendor 应用失败: " + rootMsg(e));
        }
        try {
            Object codec = settings.get("index.codec");
            if (codec instanceof String) {
                String owner = CODEC_VENDORS.get(codec.toString().trim());
                /* 与 store-type-vendor 同口径：目标厂商未知不剔，逐值告知请人工确认 */
                if (owner != null && "unknown".equals(target.vendorId())) {
                    out.advice.add(entry("kind", "codec", "key", "index.codec",
                            "message", codec.toString().trim() + " 为" + vendorName(owner)
                                    + "（OpenSearch）特有压缩编码，目标厂商未知，建议人工确认目标集群是否支持"));
                }
            }
        } catch (RuntimeException e) {
            out.warnings.add("兼容矩阵规则 codec-vendor 应用失败: " + rootMsg(e));
        }
        try {
            /* mapping 上限建议：源值高于目标默认（total_fields=1000/nested_fields=50）只提示不动数据 */
            Integer totalFields = parseInt(settings.get("index.mapping.total_fields.limit"));
            if (totalFields != null && totalFields > 1000) {
                out.advice.add(entry("kind", "mapping_limit", "key", "index.mapping.total_fields.limit",
                        "message", "源值 " + totalFields + " 超过目标默认上限 1000，"
                                + "目标默认上限较低，超限可能建索引失败"));
            }
            Integer nestedFields = parseInt(settings.get("index.mapping.nested_fields.limit"));
            if (nestedFields != null && nestedFields > 50) {
                out.advice.add(entry("kind", "mapping_limit", "key", "index.mapping.nested_fields.limit",
                        "message", "源值 " + nestedFields + " 超过目标默认上限 50，"
                                + "目标默认上限较低，超限可能建索引失败"));
            }
        } catch (RuntimeException e) {
            out.warnings.add("兼容矩阵规则 mapping-limit-advise 应用失败: " + rootMsg(e));
        }
    }

    private static Integer parseInt(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 根因消息（规则失败告知用）：取因果链最底层的可读文本。 */
    private static String rootMsg(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return t.getMessage() == null ? t.toString() : t.getMessage();
    }

    private static Map<String, Object> entry(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }
}
