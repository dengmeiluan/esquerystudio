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

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 跨集群「结构同步·兼容性自适应」：读源索引 settings/mapping 后在目标集群建同名/指定索引。
 *
 * <p>兼容剔除分两层：<b>主动</b>——{@link CompatMatrix} 按静态规则表（厂商私有 settings（含
 * 跨厂商 vendor-private）、已废弃 settings、节点属性路由、目标缺失插件的分析组件、目标缺失
 * ILM 策略）在建索引前预剔除，产出 planned 清单与 advice；<b>反应式</b>——目标集群真实报错逐轮
 * 兜底剔除（unknown/private setting 剔 settings 键；Unknown tokenizer/analyzer/filter/char_filter
 * 剔组件定义并把字段引用降级为回退分词器）。{@code dryRun=true} 只产出计划不发 PUT；
 * {@code syncAliases=true} 在建索引成功后逐别名随迁（filter/routing 元数据原样）。两侧集群
 * 版本/厂商/插件经 {@link #probeCluster} 探测后随报告呈现，供跨厂商差异判读。</p>
 *
 * <p>v3：目标可经 {@code destConnId} 指定非宿主集群；报告附 {@code planDigest}（计划摘要，配合
 * {@code expectPlanDigest} 拒绝源结构漂移后的过期执行）与 {@code body}（适配后实际/将 PUT 的
 * 请求体）。配套只读判读：{@link #compareCapabilities}（双侧能力对比与风险清单）与
 * {@link #diffStructure}（源结构 vs 目标既有索引的结构差异）。</p>
 */
public class StructureSyncService {

    private static final Logger logger = LoggerFactory.getLogger(StructureSyncService.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 自适应剔除轮数上限：防御异常集群用无限错误序列耗尽请求。 */
    static final int MAX_ROUNDS = 20;

    /** 建索引前从源 settings 剔除的内部/不可迁移键（uuid/时间戳/版本指纹与目标无关）。 */
    private static final List<String> STRIPPED_SETTING_KEYS = Arrays.asList(
            "index.uuid", "index.creation_date", "index.provided_name",
            "index.version.created", "index.version.upgraded");

    /** 目标不可用组件的两种典型报错形态（大小写不敏感，key/name 取方括号内字面值）。 */
    private static final Pattern UNKNOWN_SETTING =
            Pattern.compile("unknown setting \\[([^\\]]+)\\]", Pattern.CASE_INSENSITIVE);
    private static final Pattern PRIVATE_SETTING =
            Pattern.compile("private index setting \\[([^\\]]+)\\]", Pattern.CASE_INSENSITIVE);
    private static final Pattern UNKNOWN_COMPONENT =
            Pattern.compile("Unknown (\\w+) \\[([^\\]]+)\\]");
    private static final Pattern COMPONENT_NOT_FOUND =
            Pattern.compile("(tokenizer|char_filter|filter|analyzer) \\[([^\\]]+)\\] not found",
                    Pattern.CASE_INSENSITIVE);
    /** 报错里可自适应处理的 analysis 组件类别（normalizer 仅作为字段属性引用出现）。 */
    private static final Set<String> HANDLED_KINDS = new LinkedHashSet<>(Arrays.asList(
            "analyzer", "tokenizer", "filter", "char_filter", "normalizer"));
    /** 字段定义里引用 analysis 组件的属性名。 */
    private static final String[] FIELD_ANALYSIS_ATTRS = {"analyzer", "search_analyzer", "normalizer"};

    /** 别名定义里随迁时原样保留的元数据键（filter/路由）。 */
    private static final String[] ALIAS_META_KEYS = {"filter", "index_routing", "search_routing", "routing"};

    /** 回退分词器默认值：ES 全版本内置、无插件依赖。 */
    static final String DEFAULT_FALLBACK_ANALYZER = "standard";

    private final java.util.function.Supplier<RestHighLevelClient> localClient;
    private final EsIndexAdmin localAdmin;
    private final RemoteEsClientFactory remoteClientFactory;

    public StructureSyncService(java.util.function.Supplier<RestHighLevelClient> localClient,
                                EsIndexAdmin localAdmin, RemoteEsClientFactory remoteClientFactory) {
        this.localClient = localClient;
        this.localAdmin = localAdmin;
        this.remoteClientFactory = remoteClientFactory;
    }

    /** 兼容旧调用形态：不做 dry-run、不随迁别名。 */
    public Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                             String fallbackAnalyzer) {
        return syncStructure(conn, sourceIndex, destIndex, fallbackAnalyzer, false, false);
    }

    /**
     * 执行结构同步（v2 报告契约）：委托 v3 全参形态（目标=宿主集群、无计划摘要校验）。
     *
     * @param conn              已解析的源集群连接（含密，仅服务端流转）
     * @param sourceIndex       源索引名（精确业务索引）
     * @param destIndex         目标索引名；空则与 sourceIndex 同名
     * @param fallbackAnalyzer  引用降级目标；空则 standard
     * @param dryRun            true=只产出兼容剔除计划，不向目标发 PUT
     * @param syncAliases       true=建索引成功后按源别名逐个 POST _aliases 随迁
     */
    public Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                             String fallbackAnalyzer, boolean dryRun, boolean syncAliases) {
        return syncStructure(conn, sourceIndex, destIndex, fallbackAnalyzer, dryRun, syncAliases,
                null, null, null);
    }

    /**
     * 执行结构同步（v3 报告契约，v2 基础上增量）：
     * {@code {created, dryRun, destConnId, destIndex, planDigest, rounds,
     * source:{index,version,vendor,plugins}, target:{...},
     * planned:{removedSettings,removedAnalysis,downgradedFields},
     * reactive:{...同 planned}, body:{settings,mappings,aliases}, aliases:{skipped,synced},
     * advice:[{kind,key,message}], warnings, lastError?}}。
     *
     * <p>v3 增量字段：{@code destConnId} 目标连接回显（null=宿主集群）；{@code planDigest}
     * 对 canonical JSON {@code {settings,mappings,aliases}}（兼容矩阵适配后）的 SHA-256 摘要
     * 前 16 hex——dryRun 与执行模式同点计算（矩阵适配后、PUT 前），同输入稳定复现；
     * {@code body} 适配后将在目标创建索引的请求体（dryRun=计划 PUT 内容；执行=实际 PUT 内容，
     * 含反应式轮次收敛后的最终形态；aliases 为计划/实际随迁的别名名单）。</p>
     *
     * <p>{@code expectPlanDigest}（仅 dryRun=false 生效）：执行时重算计划摘要，与期望值不一致
     * 即拒绝执行（计划漂移：两次调用之间源结构已变化），错误信息含两个摘要值。</p>
     *
     * @param conn              已解析的源集群连接（含密，仅服务端流转）
     * @param sourceIndex       源索引名（精确业务索引）
     * @param destIndex         目标索引名；空则与 sourceIndex 同名
     * @param fallbackAnalyzer  引用降级目标；空则 standard
     * @param dryRun            true=只产出兼容剔除计划，不向目标发 PUT
     * @param syncAliases       true=建索引成功后按源别名逐个 POST _aliases 随迁
     * @param destConnId        目标连接 id 回显（null/空=宿主集群）；id→连接的解析由 Web/MCP 层完成
     * @param destConn          已解析的目标集群连接；null=目标走宿主集群
     * @param expectPlanDigest  期望的计划摘要（先 dryRun 取得）；不匹配拒绝执行
     */
    public Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                             String fallbackAnalyzer, boolean dryRun, boolean syncAliases,
                                             String destConnId, RemoteClusterConn destConn,
                                             String expectPlanDigest) {
        if (sourceIndex == null || sourceIndex.trim().isEmpty()) {
            throw new IllegalArgumentException("sourceIndex 不能为空");
        }
        String src = sourceIndex.trim();
        String dest = destIndex == null || destIndex.trim().isEmpty() ? src : destIndex.trim();
        localAdmin.guardExactDataIndex(src);
        localAdmin.guardExactDataIndex(dest);
        String fallback = fallbackAnalyzer == null || fallbackAnalyzer.trim().isEmpty()
                ? DEFAULT_FALLBACK_ANALYZER : fallbackAnalyzer.trim();
        String destConnEcho = destConnId == null || destConnId.trim().isEmpty() ? null : destConnId.trim();

        List<String> warnings = new ArrayList<>();
        RestHighLevelClient remote = null;
        RestHighLevelClient destRest = null;
        final Map<String, Object> sourceProbe;
        final Map<String, Object> targetProbe;
        final Map<String, Object> settings;
        final Map<String, Object> mappings;
        final Map<String, Map<String, Object>> sourceAliases;
        final RestClient destLl;
        try {
            remote = remoteClientFactory == null ? null : remoteClientFactory.build(conn);
            if (destConn != null) {
                destRest = remoteClientFactory == null ? null : remoteClientFactory.build(destConn);
            }
            destLl = destRest == null ? null : destRest.getLowLevelClient();
            RestClient remoteLL = remote == null ? null : remote.getLowLevelClient();
            sourceProbe = probeCluster(path -> sourceGet(remoteLL, path));
            targetProbe = probeCluster(destLl == null ? this::targetGet : path -> destGet(destLl, path));
            settings = readSourceSettings(remoteLL, src);
            mappings = readSourceMapping(remoteLL, src);
            sourceAliases = readSourceAliases(remoteLL, src, warnings);
        } catch (RuntimeException e) {
            closeQuietly(remote);
            closeQuietly(destRest);
            throw e;
        } catch (Exception e) {
            closeQuietly(remote);
            closeQuietly(destRest);
            throw new IllegalStateException("读取源索引配置失败 [" + conn.endpoint() + "/" + src + "]: " + rootMsg(e), e);
        }

        String sourceVersion = str(sourceProbe.get("version"));
        String targetVersion = str(targetProbe.get("version"));
        if (sourceVersion == null) {
            warnings.add("未能读取源集群版本信息，版本对比跳过");
        }
        if (targetVersion == null) {
            warnings.add("未能读取目标集群版本信息，版本对比跳过");
        }
        compareVersions(sourceVersion, targetVersion, warnings);

        /* 主动兼容矩阵：剔除直接改写 settings/mappings（待 PUT 体即剔除后形态）；
           源厂商传入供跨厂商 plugin_install advice 判定 */
        CompatMatrix.Planned planned = CompatMatrix.apply(settings, mappings,
                targetSnapshot(targetProbe, destLl), fallback, vendorIdOf(sourceProbe));
        warnings.addAll(planned.warnings);

        String planDigest = planDigestOf(buildCreateBody(settings, mappings),
                new ArrayList<>(sourceAliases.keySet()));
        if (!dryRun && expectPlanDigest != null && !expectPlanDigest.trim().isEmpty()
                && !expectPlanDigest.trim().equalsIgnoreCase(planDigest)) {
            closeQuietly(remote);
            closeQuietly(destRest);
            throw new IllegalStateException("计划摘要不匹配，拒绝执行：期望 " + expectPlanDigest.trim()
                    + "，实际 " + planDigest + "（source structure drifted, re-run dryRun）");
        }

        List<Map<String, Object>> reactiveSettings = new ArrayList<>();
        List<Map<String, Object>> reactiveAnalysis = new ArrayList<>();
        List<Map<String, Object>> reactiveDowngraded = new ArrayList<>();
        List<String> syncedAliases = new ArrayList<>();
        int rounds = 0;
        boolean created = false;
        String lastError = null;
        if (dryRun) {
            closeQuietly(remote);
            closeQuietly(destRest);
        } else {
            for (int round = 1; round <= MAX_ROUNDS; round++) {
                rounds = round;
                PutResult result;
                String bodyJson;
                try {
                    bodyJson = OBJECT_MAPPER.writeValueAsString(buildCreateBody(settings, mappings));
                    result = destLl == null ? targetPut(dest, bodyJson) : destTargetPut(destLl, dest, bodyJson);
                } catch (RuntimeException e) {
                    closeQuietly(remote);
                    closeQuietly(destRest);
                    throw e;
                } catch (Exception e) {
                    closeQuietly(remote);
                    closeQuietly(destRest);
                    throw new IllegalStateException("创建目标索引失败 [" + dest + "]: " + rootMsg(e), e);
                }
                if (result.status >= 200 && result.status < 300) {
                    created = true;
                    break;
                }
                if (result.status != 400) {
                    closeQuietly(remote);
                    closeQuietly(destRest);
                    /* 404/5xx 等：目标连接或集群层面的问题，剔除循环无法推进，直接报错。 */
                    throw new IllegalStateException("创建目标索引失败（HTTP " + result.status + "）[" + dest + "]: "
                            + brief(result.body));
                }
                EsError error = parseError(result.body);
                String reason = error.reason == null ? "" : error.reason;
                if (reason.contains("resource_already_exists_exception")
                        || "resource_already_exists_exception".equals(error.type)) {
                    closeQuietly(remote);
                    closeQuietly(destRest);
                    throw new IllegalStateException("目标索引已存在：" + dest
                            + "（本能力不覆盖既有索引，如需重建请先删除或换名）");
                }
                if (applyAdaptiveRemoval(reason, settings, mappings, fallback,
                        reactiveSettings, reactiveAnalysis, reactiveDowngraded)) {
                    continue;
                }
                /* 报错与可剔除内容对不上（或已无可剔）：继续重试只会得到同一错误，如实失败。 */
                lastError = reason.isEmpty() ? brief(result.body) : reason;
                break;
            }
            closeQuietly(remote);
            closeQuietly(destRest);
            if (!created && rounds >= MAX_ROUNDS) {
                lastError = "已达 " + MAX_ROUNDS + " 轮自适应剔除上限，最后错误: "
                        + (lastError == null ? "目标集群持续拒绝建索引请求" : lastError);
            }
            if (created && syncAliases && !sourceAliases.isEmpty()) {
                syncAliasesTo(dest, sourceAliases, syncedAliases, warnings, destLl);
            }
        }
        if (!planned.removedSettings.isEmpty() || !planned.removedAnalysis.isEmpty()
                || !planned.downgradedFields.isEmpty() || !reactiveSettings.isEmpty()) {
            logger.info("[StructureSyncService] sync {} -> {} created={} dryRun={} rounds={} "
                            + "planned(settings={},analysis={},fields={}) reactive(settings={},analysis={},fields={})",
                    src, dest, created, dryRun, rounds,
                    planned.removedSettings.size(), planned.removedAnalysis.size(),
                    planned.downgradedFields.size(),
                    reactiveSettings.size(), reactiveAnalysis.size(), reactiveDowngraded.size());
        }

        Map<String, Object> aliases = aliasesReport(sourceAliases, syncedAliases, dryRun, syncAliases);
        @SuppressWarnings("unchecked")
        List<String> bodyAliases = (List<String>) aliases.get("synced");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("created", created);
        out.put("dryRun", dryRun);
        out.put("destConnId", destConnEcho);
        out.put("destIndex", dest);
        out.put("planDigest", planDigest);
        out.put("rounds", rounds);
        out.put("source", sideBlock(src, sourceProbe));
        out.put("target", sideBlock(dest, targetProbe));
        out.put("planned", removalBlock(planned.removedSettings, planned.removedAnalysis,
                planned.downgradedFields));
        out.put("reactive", removalBlock(reactiveSettings, reactiveAnalysis, reactiveDowngraded));
        out.put("body", bodyBlock(buildCreateBody(settings, mappings), bodyAliases));
        out.put("aliases", aliases);
        out.put("advice", planned.advice);
        out.put("warnings", warnings);
        if (!created && !dryRun) {
            out.put("lastError", lastError == null ? "未知错误" : lastError);
        }
        return out;
    }

    // ---------------------------------------------------------------- 能力对比与结构 diff

    /**
     * 双侧集群能力对比（sync_structure 前置判读）：双侧 probeCluster + 源索引分片数，
     * 输出 {@code {source:{connection,index,version,distribution,clusterName,vendor,evidence,
     * plugins,managed,nodeCount,dataNodeCount,pluginsReliable}, target:{同上},
     * diff:{versionGap, vendorChanged, pluginsOnlyInSource, pluginsOnlyInTarget,
     * nodeScale:{sourceDataNodes,targetDataNodes}, risks:[{kind,severity,message,action}]}}}。
     *
     * <p>risks 生成规则：源独有插件逐个 {@code plugin_missing}（severity=high；被兼容矩阵已知
     * 具名组件覆盖时 action 提示 sync_structure 可自动剔除）；目标大版本低于源
     * {@code version_downgrade}（medium）；厂商不同 {@code vendor_change}（low，提示 dryRun 预览，
     * 任一侧厂商未知不判「变」）；源分片数超目标数据节点（&gt;0）3 倍
     * {@code shard_oversize}（medium）。versionGap 按 major.minor 口径（补丁号差异不算版本差）。</p>
     *
     * @param srcConnId  源连接 id 回显（可空；连接 id→档案的解析在 Web/MCP 层完成）
     * @param srcConn    已解析的源集群连接（必填）
     * @param srcIndex   源索引名（可选；空时跳过索引画像与 shard_oversize 判定，只做双侧集群对比）
     * @param destConnId 目标连接 id 回显（可空）
     * @param destConn   已解析的目标集群连接；null=目标走宿主集群
     * @param destIndex  目标索引名；空则与 srcIndex 同名
     */
    public Map<String, Object> compareCapabilities(String srcConnId, RemoteClusterConn srcConn, String srcIndex,
                                                   String destConnId, RemoteClusterConn destConn,
                                                   String destIndex) {
        if (srcConn == null) {
            throw new IllegalArgumentException("缺少源连接信息 srcConn");
        }
        String src = srcIndex == null || srcIndex.trim().isEmpty() ? null : srcIndex.trim();
        String dest = destIndex == null || destIndex.trim().isEmpty() ? src : destIndex.trim();
        if (src != null) {
            localAdmin.guardExactDataIndex(src);
        }
        if (dest != null) {
            localAdmin.guardExactDataIndex(dest);
        }
        RestHighLevelClient srcRest = null;
        RestHighLevelClient destRest = null;
        try {
            srcRest = remoteClientFactory == null ? null : remoteClientFactory.build(srcConn);
            RestClient srcLl = srcRest == null ? null : srcRest.getLowLevelClient();
            final RestClient destLl;
            if (destConn != null) {
                destRest = remoteClientFactory == null ? null : remoteClientFactory.build(destConn);
                destLl = destRest == null ? null : destRest.getLowLevelClient();
            } else {
                destLl = null;
            }
            Map<String, Object> sourceProbe = probeCluster(path -> sourceGet(srcLl, path));
            Map<String, Object> targetProbe = probeCluster(destLl == null
                    ? this::targetGet : path -> destGet(destLl, path));
            Integer srcShards = src == null ? null
                    : indexShardCount(path -> sourceGet(srcLl, path), src);
            return assembleCompare(srcConnId, src, srcConn, sourceProbe, srcShards,
                    destConnId, dest, destConn, targetProbe);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("集群能力对比失败: " + rootMsg(e), e);
        } finally {
            closeQuietly(srcRest);
            closeQuietly(destRest);
        }
    }

    /** 组装对比报告（探测完成后纯内存计算）。 */
    private static Map<String, Object> assembleCompare(String srcConnId, String src, RemoteClusterConn srcConn,
                                                       Map<String, Object> sourceProbe, Integer srcShards,
                                                       String destConnId, String dest, RemoteClusterConn destConn,
                                                       Map<String, Object> targetProbe) {
        String srcVersion = str(sourceProbe.get("version"));
        String dstVersion = str(targetProbe.get("version"));
        String versionGap = srcVersion != null && dstVersion != null && !sameMajorMinor(srcVersion, dstVersion)
                ? srcVersion + " -> " + dstVersion : null;
        String srcVendor = vendorIdOf(sourceProbe);
        String dstVendor = vendorIdOf(targetProbe);
        boolean vendorChanged = !srcVendor.equals(dstVendor)
                && !"unknown".equals(srcVendor) && !"unknown".equals(dstVendor);
        List<String> srcPlugins = stringList(sourceProbe.get("plugins"));
        List<String> dstPlugins = stringList(targetProbe.get("plugins"));
        List<String> onlyInSource = new ArrayList<>(srcPlugins);
        onlyInSource.removeAll(dstPlugins);
        List<String> onlyInTarget = new ArrayList<>(dstPlugins);
        onlyInTarget.removeAll(srcPlugins);
        Integer srcDataNodes = intValue(sourceProbe.get("dataNodeCount"));
        Integer dstDataNodes = intValue(targetProbe.get("dataNodeCount"));

        List<Map<String, Object>> risks = new ArrayList<>();
        for (String plugin : onlyInSource) {
            boolean known = CompatMatrix.coversKnownComponent(plugin);
            risks.add(entry("kind", "plugin_missing", "severity", "high",
                    "message", "目标集群缺少源侧插件 " + plugin
                            + (known ? "（兼容矩阵已知组件，sync_structure 可自动剔除/降级）" : ""),
                    "action", known
                            ? "auto-strip on sync_structure; or install plugin on target"
                            : "install plugin on target or exclude related components"));
        }
        Integer srcMajor = majorOf(srcVersion);
        Integer dstMajor = majorOf(dstVersion);
        if (versionGap != null && srcMajor != null && dstMajor != null && dstMajor < srcMajor) {
            risks.add(entry("kind", "version_downgrade", "severity", "medium",
                    "message", "目标集群版本低于源（" + versionGap + "），字段解析与默认行为可能退化",
                    "action", "review mapping defaults; prefer target version not below source"));
        }
        if (vendorChanged) {
            risks.add(entry("kind", "vendor_change", "severity", "low",
                    "message", "源厂商 " + srcVendor + " 与目标厂商 " + dstVendor
                            + " 不同，私有 settings 与插件差异需经兼容矩阵预剔除",
                    "action", "run sync_structure with dryRun=true to preview the compat plan"));
        }
        if (srcShards != null && dstDataNodes != null && dstDataNodes > 0 && srcShards > 3 * dstDataNodes) {
            risks.add(entry("kind", "shard_oversize", "severity", "medium",
                    "message", "源分片 " + srcShards + " 片超过目标数据节点数 " + dstDataNodes
                            + " 的 3 倍，分片过碎",
                    "action", "reduce index.number_of_shards to <= " + (3 * dstDataNodes) + " on sync"));
        }

        Map<String, Object> nodeScale = new LinkedHashMap<>();
        nodeScale.put("sourceDataNodes", srcDataNodes);
        nodeScale.put("targetDataNodes", dstDataNodes);
        Map<String, Object> diff = new LinkedHashMap<>();
        diff.put("versionGap", versionGap);
        diff.put("vendorChanged", vendorChanged);
        diff.put("pluginsOnlyInSource", onlyInSource);
        diff.put("pluginsOnlyInTarget", onlyInTarget);
        diff.put("nodeScale", nodeScale);
        diff.put("risks", risks);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("source", compareSide(connectionOf(srcConnId, srcConn), src, sourceProbe));
        out.put("target", compareSide(destConnId == null || destConnId.trim().isEmpty()
                ? connectionOf(null, destConn) : destConnId.trim(), dest, targetProbe));
        out.put("diff", diff);
        return out;
    }

    /** 对比报告单侧块：{connection, index, version, distribution, clusterName, vendor, evidence, plugins,
     * managed, nodeCount, dataNodeCount, pluginsReliable}。 */
    private static Map<String, Object> compareSide(String connection, String index, Map<String, Object> probe) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("connection", connection);
        out.put("index", index);
        out.put("version", probe.get("version"));
        out.put("distribution", probe.get("distribution"));
        out.put("clusterName", probe.get("clusterName"));
        Map<String, Object> vendorBlock = new LinkedHashMap<>();
        List<String> evidence = new ArrayList<>();
        Object vendor = probe.get("vendor");
        if (vendor instanceof Map) {
            vendorBlock.put("id", ((Map<?, ?>) vendor).get("id"));
            vendorBlock.put("label", ((Map<?, ?>) vendor).get("label"));
            Object ev = ((Map<?, ?>) vendor).get("evidence");
            if (ev instanceof List) {
                for (Object o : (List<?>) ev) {
                    evidence.add(String.valueOf(o));
                }
            }
        }
        out.put("vendor", vendorBlock);
        out.put("evidence", evidence);
        out.put("plugins", probe.get("plugins"));
        String vendorId = vendorIdOf(probe);
        out.put("managed", !"oss".equals(vendorId) && !"unknown".equals(vendorId));
        out.put("nodeCount", probe.get("nodeCount"));
        out.put("dataNodeCount", probe.get("dataNodeCount"));
        out.put("pluginsReliable", probe.get("pluginsReliable"));
        return out;
    }

    /** 连接标识：连接 id 优先，否则脱敏 endpoint；宿主（无连接）为 {@code host}。 */
    private static String connectionOf(String connId, RemoteClusterConn conn) {
        if (connId != null && !connId.trim().isEmpty()) {
            return connId.trim();
        }
        return conn == null ? "host" : conn.endpoint();
    }

    /** 索引分片数（{@code _settings} 的 index.number_of_shards，创建期静态值）；读不到如实 null。 */
    private static Integer indexShardCount(ClusterGet getter, String index) {
        try {
            Map<String, Object> root = getter.get("/" + index + "/_settings?flat_settings=true");
            Map<String, Object> idx = firstSection(root, "_settings");
            Object settings = idx == null ? null : idx.get("settings");
            Object shards = settings instanceof Map
                    ? ((Map<?, ?>) settings).get("index.number_of_shards") : null;
            return shards == null ? null : Integer.parseInt(String.valueOf(shards).trim());
        } catch (Exception e) {
            logger.debug("[StructureSyncService] read shard count failed {}: {}", index, e.getMessage(), e);
            return null;
        }
    }

    private static List<String> stringList(Object value) {
        List<String> out = new ArrayList<>();
        if (value instanceof List) {
            for (Object o : (List<?>) value) {
                out.add(String.valueOf(o));
            }
        }
        return out;
    }

    private static Integer majorOf(String version) {
        if (version == null || version.trim().isEmpty()) {
            return null;
        }
        try {
            return Integer.parseInt(version.trim().split("\\.")[0]);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String requireIndexName(String index, String what) {
        if (index == null || index.trim().isEmpty()) {
            throw new IllegalArgumentException(what + " 不能为空");
        }
        return index.trim();
    }

    /** 结构 diff 忽略的运行时可变 settings 键（uuid/时间戳/版本指纹/副本数跨环境必然不同）。 */
    private static final List<String> DIFF_IGNORED_SETTING_KEYS = Arrays.asList(
            "index.provided_name", "index.creation_date", "index.uuid",
            "index.version.created", "index.version.upgraded", "index.number_of_replicas");

    /** 字段语义属性（diff 只比这些，其余如 copy_to/store 等暂不比）。 */
    private static final String[] FIELD_SEMANTIC_ATTRS = {"type", "analyzer", "search_analyzer", "normalizer"};

    /**
     * 双侧索引结构 diff（源结构 vs 目标既有索引）：
     * {@code {sourceIndex, destIndex, settingsDiff:{onlyInSource,onlyInTarget,valueChanged},
     * mappingsDiff:{fieldAdded,fieldRemoved,fieldChanged},
     * expectedRemovals:[{area,key,reason}], unexpected:[{area,key,message}], compatible:bool}}。
     *
     * <p>语义：目标索引不存在→明确报错（不冒充空 diff）；diff 前先对源结构跑兼容矩阵得到
     * {@code expectedRemovals}（计划剔除/降级豁免表，对齐 TS/mjs 形态：settings 整键、
     * analysis 记 {@code kind.name}、mappings 记降级字段名），{@code settingsDiff.onlyInSource}
     * 命中计划剔除的 settings 整键或 {@code index.analysis.{kind}.{name}.} 平铺前缀不算
     * unexpected；{@code mappingsDiff} 字段增/删/改命中计划降级清单不算 unexpected
     * （fieldChanged 另要求 type 未变——差异仅在 analysis 引用属性），报告含
     * {@code destConnId} 回显（由 Web/MCP 调用层补充）；{@code unexpected} 为空则
     * {@code compatible=true}。settings 对比忽略
     * provided_name/creation_date/uuid/version/replicas（运行时可变）；mappings 归一化
     * （剥 6.x type 包装）后比较 properties 全量字段路径与 type/analyzer 语义属性。</p>
     *
     * @param srcConn    已解析的源集群连接（必填）
     * @param sourceIndex 源索引名（精确业务索引）
     * @param destConn   已解析的目标集群连接；null=目标走宿主集群
     * @param destIndex  目标索引名；空则与 sourceIndex 同名（必须已存在）
     */
    public Map<String, Object> diffStructure(RemoteClusterConn srcConn, String sourceIndex,
                                             RemoteClusterConn destConn, String destIndex) {
        if (srcConn == null) {
            throw new IllegalArgumentException("缺少源连接信息 srcConn");
        }
        String src = requireIndexName(sourceIndex, "sourceIndex");
        String dest = destIndex == null || destIndex.trim().isEmpty() ? src : destIndex.trim();
        localAdmin.guardExactDataIndex(src);
        localAdmin.guardExactDataIndex(dest);
        RestHighLevelClient srcRest = null;
        RestHighLevelClient destRest = null;
        try {
            srcRest = remoteClientFactory == null ? null : remoteClientFactory.build(srcConn);
            RestClient srcLl = srcRest == null ? null : srcRest.getLowLevelClient();
            final RestClient destLl;
            if (destConn != null) {
                destRest = remoteClientFactory == null ? null : remoteClientFactory.build(destConn);
                destLl = destRest == null ? null : destRest.getLowLevelClient();
            } else {
                destLl = null;
            }
            ClusterGet sourceRead = path -> sourceGet(srcLl, path);
            ClusterGet targetRead = destLl == null ? this::targetGet : path -> destGet(destLl, path);
            Map<String, Object> srcSettings = readIndexSettings(sourceRead, src);
            Map<String, Object> srcMappings = readIndexMapping(sourceRead, src);
            Map<String, Object> dstSettings;
            Map<String, Object> dstMappings;
            try {
                dstSettings = readIndexSettings(targetRead, dest);
                dstMappings = readIndexMapping(targetRead, dest);
            } catch (Exception e) {
                throw new IllegalStateException("目标索引不存在或不可读 [" + dest + "]: " + rootMsg(e), e);
            }
            /* 兼容矩阵对源深拷贝做计划剔除（diff 比较仍用原始形态），目标探测供厂商/插件/ILM 判定 */
            Map<String, Object> targetProbe = probeCluster(targetRead);
            CompatMatrix.Planned planned = CompatMatrix.apply(deepCopy(srcSettings), deepCopy(srcMappings),
                    targetSnapshot(targetProbe, destLl), null);
            List<Map<String, Object>> expectedRemovals = new ArrayList<>();
            for (Map<String, Object> row : planned.removedSettings) {
                expectedRemovals.add(entry("area", "settings",
                        "key", row.get("key"), "reason", row.get("reason")));
            }
            for (Map<String, Object> row : planned.removedAnalysis) {
                expectedRemovals.add(entry("area", "analysis",
                        "key", row.get("kind") + "." + row.get("name"), "reason", row.get("reason")));
            }
            for (Map<String, Object> row : planned.downgradedFields) {
                expectedRemovals.add(entry("area", "mappings",
                        "key", row.get("field"), "reason", row.get("reason")));
            }
            return assembleDiff(src, dest, srcSettings, dstSettings, srcMappings, dstMappings,
                    expectedRemovals);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("读取索引结构失败: " + rootMsg(e), e);
        } finally {
            closeQuietly(srcRest);
            closeQuietly(destRest);
        }
    }

    /** 组装结构 diff 报告（读取完成后纯内存计算）；{@code expectedRemovals} 为兼容矩阵
     * 计划剔除/降级豁免表（{@code {area,key,reason}}，area ∈ settings/analysis/mappings）。 */
    private static Map<String, Object> assembleDiff(String src, String dest,
                                                    Map<String, Object> srcSettings, Map<String, Object> dstSettings,
                                                    Map<String, Object> srcMappings, Map<String, Object> dstMappings,
                                                    List<Map<String, Object>> expectedRemovals) {
        Set<String> expectedSettingKeys = new LinkedHashSet<>();
        Set<String> expectedFieldKeys = new LinkedHashSet<>();
        List<String> expectedAnalysisPrefixes = new ArrayList<>();
        Set<String> expectedAnalysisSet = new LinkedHashSet<>();
        for (Map<String, Object> row : expectedRemovals) {
            if ("settings".equals(row.get("area"))) {
                expectedSettingKeys.add(String.valueOf(row.get("key")));
            } else if ("analysis".equals(row.get("area"))) {
                /* analysis 组件剔除后其平铺 settings 定义键（index.analysis.{kind}.{name}.*）随之
                   消失——与 TS/mjs 豁免同口径：命中前缀不算 unexpected */
                expectedAnalysisPrefixes.add("index.analysis." + row.get("key") + ".");
                expectedAnalysisSet.add(String.valueOf(row.get("key")));
            } else if ("mappings".equals(row.get("area"))) {
                expectedFieldKeys.add(String.valueOf(row.get("key")));
            }
        }
        /* 嵌套形态（标准 ES flat 响应）下 analysis 挂在 index.analysis 单键——计划剔除组件表现为
           整键 valueChanged 或整键 onlyInSource；按组件级差集（源有目标无 ⊆ 计划剔除集）豁免，
           组件定义被改（双侧都有但定义不同）仍照报（与 TS/mjs 同口径） */
        Map<String, Object> srcSettingsF = filterIgnoredSettings(srcSettings);
        Map<String, Object> dstSettingsF = filterIgnoredSettings(dstSettings);
        List<Map<String, Object>> onlyInSource = new ArrayList<>();
        List<Map<String, Object>> onlyInTarget = new ArrayList<>();
        List<Map<String, Object>> valueChanged = new ArrayList<>();
        Set<String> keys = new TreeSet<>(srcSettingsF.keySet());
        keys.addAll(dstSettingsF.keySet());
        for (String key : keys) {
            boolean inSrc = srcSettingsF.containsKey(key);
            boolean inDst = dstSettingsF.containsKey(key);
            if (inSrc && !inDst) {
                onlyInSource.add(entry("key", key, "sourceValue", srcSettingsF.get(key)));
            } else if (!inSrc && inDst) {
                onlyInTarget.add(entry("key", key, "targetValue", dstSettingsF.get(key)));
            } else if (!java.util.Objects.equals(srcSettingsF.get(key), dstSettingsF.get(key))) {
                valueChanged.add(entry("key", key, "sourceValue", srcSettingsF.get(key),
                        "targetValue", dstSettingsF.get(key)));
            }
        }

        Map<String, Map<String, Object>> srcFields = new LinkedHashMap<>();
        Map<String, Map<String, Object>> dstFields = new LinkedHashMap<>();
        flattenFields(srcMappings.get("properties"), "", srcFields);
        flattenFields(dstMappings.get("properties"), "", dstFields);
        List<Map<String, Object>> fieldAdded = new ArrayList<>();
        List<Map<String, Object>> fieldRemoved = new ArrayList<>();
        List<Map<String, Object>> fieldChanged = new ArrayList<>();
        Set<String> paths = new TreeSet<>(srcFields.keySet());
        paths.addAll(dstFields.keySet());
        for (String path : paths) {
            Map<String, Object> s = srcFields.get(path);
            Map<String, Object> d = dstFields.get(path);
            if (s == null) {
                fieldAdded.add(entry("field", path, "type", d.get("type")));
            } else if (d == null) {
                fieldRemoved.add(entry("field", path, "type", s.get("type")));
            } else if (!s.equals(d)) {
                fieldChanged.add(entry("field", path, "sourceType", s.get("type"), "targetType", d.get("type"),
                        "detail", semanticDetail(s, d)));
            }
        }

        List<Map<String, Object>> unexpected = new ArrayList<>();
        for (Map<String, Object> row : onlyInSource) {
            String key = String.valueOf(row.get("key"));
            boolean planned = expectedSettingKeys.contains(key)
                    || expectedAnalysisPrefixes.stream().anyMatch(key::startsWith)
                    || ("index.analysis".equals(key)
                        && analysisDiffExplained(row.get("sourceValue"), null, expectedAnalysisSet));
            if (!planned) {
                unexpected.add(entry("area", "settings", "key", key,
                        "message", "源独有且不在兼容剔除计划内: " + key));
            }
        }
        for (Map<String, Object> row : onlyInTarget) {
            unexpected.add(entry("area", "settings", "key", row.get("key"),
                    "message", "目标独有: " + row.get("key")));
        }
        for (Map<String, Object> row : valueChanged) {
            boolean planned = "index.analysis".equals(row.get("key"))
                    && analysisDiffExplained(row.get("sourceValue"), row.get("targetValue"), expectedAnalysisSet);
            if (!planned) {
                unexpected.add(entry("area", "settings", "key", row.get("key"),
                        "message", "取值不同: " + row.get("key")));
            }
        }
        for (Map<String, Object> row : fieldAdded) {
            if (expectedFieldKeys.contains(String.valueOf(row.get("field")))) {
                continue;
            }
            unexpected.add(entry("area", "mappings", "key", row.get("field"),
                    "message", "目标多出字段: " + row.get("field")));
        }
        for (Map<String, Object> row : fieldRemoved) {
            if (expectedFieldKeys.contains(String.valueOf(row.get("field")))) {
                continue;
            }
            unexpected.add(entry("area", "mappings", "key", row.get("field"),
                    "message", "源有目标无字段: " + row.get("field")));
        }
        for (Map<String, Object> row : fieldChanged) {
            String field = String.valueOf(row.get("field"));
            Map<String, Object> s = srcFields.get(field);
            Map<String, Object> d = dstFields.get(field);
            /* 豁免：字段命中计划降级清单且差异仅在 analysis 引用属性（type 未变）——
               按计划降级的正常态，不算 unexpected；type 或其他差异仍逐项呈报 */
            boolean plannedDowngrade = expectedFieldKeys.contains(field)
                    && s != null && d != null
                    && java.util.Objects.equals(s.get("type"), d.get("type"));
            if (!plannedDowngrade) {
                unexpected.add(entry("area", "mappings", "key", field,
                        "message", "字段定义不同: " + field + "（" + row.get("detail") + "）"));
            }
        }

        Map<String, Object> settingsDiff = new LinkedHashMap<>();
        settingsDiff.put("onlyInSource", onlyInSource);
        settingsDiff.put("onlyInTarget", onlyInTarget);
        settingsDiff.put("valueChanged", valueChanged);
        Map<String, Object> mappingsDiff = new LinkedHashMap<>();
        mappingsDiff.put("fieldAdded", fieldAdded);
        mappingsDiff.put("fieldRemoved", fieldRemoved);
        mappingsDiff.put("fieldChanged", fieldChanged);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sourceIndex", src);
        out.put("destIndex", dest);
        out.put("settingsDiff", settingsDiff);
        out.put("mappingsDiff", mappingsDiff);
        out.put("expectedRemovals", expectedRemovals);
        out.put("unexpected", unexpected);
        out.put("compatible", unexpected.isEmpty());
        return out;
    }

    /** 收集嵌套 analysis 值里的组件名集合（{@code {kind:{name:def}}} → {@code kind.name}）。 */
    private static void collectAnalysisComponents(Object value, Set<String> out) {
        if (!(value instanceof Map)) {
            return;
        }
        for (Map.Entry<?, ?> kindEntry : ((Map<?, ?>) value).entrySet()) {
            if (!(kindEntry.getValue() instanceof Map)) {
                continue;
            }
            for (Object name : ((Map<?, ?>) kindEntry.getValue()).keySet()) {
                out.add(kindEntry.getKey() + "." + name);
            }
        }
    }

    /** {@code index.analysis} 整键差异是否被计划剔除完全解释：源有目标无的组件全部命中
     * 计划剔除集合（组件定义被改等其余差异不豁免）。 */
    private static boolean analysisDiffExplained(Object srcValue, Object dstValue, Set<String> plannedSet) {
        Set<String> srcComps = new LinkedHashSet<>();
        collectAnalysisComponents(srcValue, srcComps);
        Set<String> dstComps = new LinkedHashSet<>();
        collectAnalysisComponents(dstValue, dstComps);
        for (String comp : srcComps) {
            if (!dstComps.contains(comp) && !plannedSet.contains(comp)) {
                return false;
            }
        }
        return true;
    }

    /** settings 对比前剔除运行时可变键（两侧同口径）。 */
    private static Map<String, Object> filterIgnoredSettings(Map<String, Object> settings) {
        Map<String, Object> out = new LinkedHashMap<>(settings);
        for (String key : DIFF_IGNORED_SETTING_KEYS) {
            out.remove(key);
        }
        return out;
    }

    /** 递归展平 properties/multi-fields 为「字段路径 → 语义属性（type/analyzer/search_analyzer/normalizer）」。 */
    @SuppressWarnings("unchecked")
    private static void flattenFields(Object node, String prefix, Map<String, Map<String, Object>> out) {
        if (!(node instanceof Map)) {
            return;
        }
        for (Map.Entry<String, Object> e : ((Map<String, Object>) node).entrySet()) {
            if (!(e.getValue() instanceof Map)) {
                continue;
            }
            Map<String, Object> field = (Map<String, Object>) e.getValue();
            String path = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
            Map<String, Object> semantic = new LinkedHashMap<>();
            for (String attr : FIELD_SEMANTIC_ATTRS) {
                if (field.containsKey(attr)) {
                    semantic.put(attr, field.get(attr));
                }
            }
            out.put(path, semantic);
            flattenFields(field.get("properties"), path, out);
            flattenFields(field.get("fields"), path, out);
        }
    }

    /** 字段语义属性差异摘要（如 {@code analyzer: ik_max_word -> standard}；缺失侧记 (absent)）。 */
    private static String semanticDetail(Map<String, Object> source, Map<String, Object> target) {
        Set<String> attrs = new TreeSet<>(source.keySet());
        attrs.addAll(target.keySet());
        List<String> parts = new ArrayList<>();
        for (String attr : attrs) {
            Object s = source.get(attr);
            Object d = target.get(attr);
            if (!java.util.Objects.equals(s, d)) {
                parts.add(attr + ": " + (s == null ? "(absent)" : s) + " -> " + (d == null ? "(absent)" : d));
            }
        }
        return String.join("; ", parts);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> deepCopy(Map<String, Object> in) {
        return OBJECT_MAPPER.convertValue(in, Map.class);
    }

    /** 报告两侧块：{index, version, vendor:{id,label}, plugins}。 */
    private static Map<String, Object> sideBlock(String index, Map<String, Object> probe) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("index", index);
        out.put("version", probe.get("version"));
        Object vendor = probe.get("vendor");
        Map<String, Object> vendorBlock = new LinkedHashMap<>();
        if (vendor instanceof Map) {
            vendorBlock.put("id", ((Map<?, ?>) vendor).get("id"));
            vendorBlock.put("label", ((Map<?, ?>) vendor).get("label"));
        }
        out.put("vendor", vendorBlock);
        out.put("plugins", probe.get("plugins"));
        return out;
    }

    /** planned/reactive 共用形态：{removedSettings, removedAnalysis, downgradedFields}。 */
    private static Map<String, Object> removalBlock(List<Map<String, Object>> removedSettings,
                                                    List<Map<String, Object>> removedAnalysis,
                                                    List<Map<String, Object>> downgradedFields) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("removedSettings", removedSettings);
        out.put("removedAnalysis", removedAnalysis);
        out.put("downgradedFields", downgradedFields);
        return out;
    }

    /** v3 body 块：{settings, mappings, aliases}——适配后将在目标创建索引的请求体形态。 */
    private static Map<String, Object> bodyBlock(Map<String, Object> createBody, List<String> aliases) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("settings", createBody.get("settings"));
        out.put("mappings", createBody.get("mappings"));
        out.put("aliases", aliases);
        return out;
    }

    /** canonical JSON 序列化器（键全层排序）：计划摘要的确定性输入。 */
    private static final com.fasterxml.jackson.databind.ObjectMapper CANONICAL_MAPPER =
            new com.fasterxml.jackson.databind.ObjectMapper()
                    .configure(com.fasterxml.jackson.databind.SerializationFeature
                            .ORDER_MAP_ENTRIES_BY_KEYS, true);

    /**
     * 计划摘要：对 canonical JSON {@code {settings,mappings,aliases}}（兼容矩阵适配后的
     * 建 indexes 请求体 + 计划随迁别名名单，键全层排序）取 SHA-256 前 16 hex。
     * 同输入（含嵌套 map 的键序差异）稳定复现，供 dryRun→执行的计划漂移校验。
     */
    static String planDigestOf(Map<String, Object> createBody, List<String> aliasNames) {
        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("settings", createBody.get("settings"));
        canonical.put("mappings", createBody.get("mappings"));
        canonical.put("aliases", aliasNames);
        String json;
        try {
            json = CANONICAL_MAPPER.writeValueAsString(canonical);
        } catch (Exception e) {
            throw new IllegalStateException("计划摘要序列化失败", e);
        }
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(16);
            for (int i = 0; i < 8; i++) {
                out.append(String.format("%02x", digest[i]));
            }
            return out.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 摘要算法不可用", e);
        }
    }

    /** 探测结果里的厂商 id（无 vendor 节/无 id 归一为 unknown）。 */
    private static String vendorIdOf(Map<String, Object> probe) {
        Object vendor = probe.get("vendor");
        Object id = vendor instanceof Map ? ((Map<?, ?>) vendor).get("id") : null;
        return id == null ? "unknown" : String.valueOf(id);
    }

    /**
     * aliases 报告块（守恒式：skipped+synced 之和恒等于源别名总数）。dry-run 为<b>计划口径</b>：
     * syncAliases=true 时 synced=源别名全集（计划将同步）、skipped 为空；false 时反之。
     * 执行模式为<b>事实口径</b>：synced 只含实际写成功的别名，skipped 为其余全部
     * （含开关关闭跳过的与写失败的），失败明细另进 warnings。
     */
    private static Map<String, Object> aliasesReport(Map<String, Map<String, Object>> sourceAliases,
                                                     List<String> synced, boolean dryRun,
                                                     boolean syncAliases) {
        List<String> all = new ArrayList<>(sourceAliases.keySet());
        List<String> skipped;
        List<String> reportedSynced;
        if (dryRun && syncAliases) {
            reportedSynced = all;
            skipped = Collections.emptyList();
        } else if (dryRun) {
            reportedSynced = Collections.emptyList();
            skipped = all;
        } else {
            reportedSynced = synced;
            skipped = new ArrayList<>(all);
            skipped.removeAll(synced);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("skipped", skipped);
        out.put("synced", reportedSynced);
        return out;
    }

    /** 矩阵目标快照：探测结果 + 目侧 ILM 策略探针（异常按存在处理，不误删）；{@code destLl}
     * 非空时探针走指定连接（destConnId），否则走宿主。 */
    private CompatMatrix.TargetSnapshot targetSnapshot(Map<String, Object> targetProbe, RestClient destLl) {
        return new CompatMatrix.TargetSnapshot() {
            @Override
            public String version() {
                return str(targetProbe.get("version"));
            }

            @Override
            @SuppressWarnings("unchecked")
            public Set<String> plugins() {
                Object plugins = targetProbe.get("plugins");
                return plugins instanceof List ? new LinkedHashSet<>((List<String>) plugins)
                        : Collections.<String>emptySet();
            }

            @Override
            public Integer dataNodeCount() {
                Object v = targetProbe.get("dataNodeCount");
                return v instanceof Number ? ((Number) v).intValue() : null;
            }

            @Override
            public boolean ilmPolicyExists(String policy) {
                return destLl == null ? targetIlmPolicyExists(policy) : destIlmPolicyExists(destLl, policy);
            }

            @Override
            public boolean pluginsReliable() {
                return Boolean.TRUE.equals(targetProbe.get("pluginsReliable"));
            }

            @Override
            public String vendorId() {
                return vendorIdOf(targetProbe);
            }
        };
    }

    // ---------------------------------------------------------------- 集群能力探测

    /** 集群信息 GET 通道：路径 → 已解析 JSON（源/目标/任意已存连接三处复用）。 */
    interface ClusterGet {
        Map<String, Object> get(String path) throws Exception;
    }

    /**
     * 探测集群能力快照：{@code GET /}（版本/发行版/集群名）、{@code GET _nodes/plugins}
     * （插件 id 聚合去重）、{@code GET _cluster/health}（节点数）。子探测失败逐项降级
     * （null/空清单），不整体抛出；厂商按插件 id 与 distribution 关键字（token 边界）推断，
     * {@code vendor.evidence} 记录判定依据（如 {@code plugin:analysis-ik}）。
     */
    static Map<String, Object> probeCluster(ClusterGet getter) {
        String version = null;
        String distribution = null;
        String clusterName = null;
        try {
            Map<String, Object> root = getter.get("/");
            Object versionNode = root == null ? null : root.get("version");
            if (versionNode instanceof Map) {
                Object number = ((Map<?, ?>) versionNode).get("number");
                version = number == null ? null : String.valueOf(number);
                Object dist = ((Map<?, ?>) versionNode).get("distribution");
                distribution = dist == null ? null : String.valueOf(dist);
            }
            Object name = root == null ? null : root.get("cluster_name");
            clusterName = name == null ? null : String.valueOf(name);
        } catch (Exception e) {
            logger.debug("[StructureSyncService] probe version failed: {}", e.getMessage(), e);
        }
        List<String> plugins = new ArrayList<>();
        boolean pluginsReliable = false;
        try {
            Map<String, Object> root = getter.get("/_nodes/plugins");
            Object nodes = root == null ? null : root.get("nodes");
            if (nodes instanceof Map) {
                Set<String> ids = new TreeSet<>();
                for (Object n : ((Map<?, ?>) nodes).values()) {
                    if (!(n instanceof Map)) {
                        continue;
                    }
                    Object list = ((Map<?, ?>) n).get("plugins");
                    if (!(list instanceof List)) {
                        continue;
                    }
                    for (Object p : (List<?>) list) {
                        if (p instanceof Map) {
                            Object id = ((Map<?, ?>) p).get("id");
                            if (id != null && !String.valueOf(id).trim().isEmpty()) {
                                ids.add(String.valueOf(id).trim());
                            }
                        }
                    }
                }
                plugins.addAll(ids);
                pluginsReliable = true;
            }
        } catch (Exception e) {
            logger.debug("[StructureSyncService] probe plugins failed: {}", e.getMessage(), e);
        }
        Integer nodeCount = null;
        Integer dataNodeCount = null;
        try {
            Map<String, Object> root = getter.get("/_cluster/health");
            nodeCount = intValue(root == null ? null : root.get("number_of_nodes"));
            dataNodeCount = intValue(root == null ? null : root.get("number_of_data_nodes"));
        } catch (Exception e) {
            logger.debug("[StructureSyncService] probe health failed: {}", e.getMessage(), e);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("clusterName", clusterName);
        out.put("version", version);
        out.put("distribution", distribution);
        out.put("plugins", plugins);
        out.put("pluginsReliable", pluginsReliable);
        out.put("nodeCount", nodeCount);
        out.put("dataNodeCount", dataNodeCount);
        out.put("vendor", vendorOf(distribution, plugins));
        return out;
    }

    /**
     * 厂商推断（顺序即优先级）：插件 id 或 distribution 关键字（token 边界匹配，见
     * {@link #pluginKeywordHit}）→ 阿里云/腾讯云/AWS/Elastic Cloud；无云特征且
     * distribution=default → 开源自建。
     */
    private static Map<String, Object> vendorOf(String distribution, List<String> plugins) {
        List<String> signals = new ArrayList<>();
        for (String plugin : plugins) {
            signals.add(plugin == null ? "" : plugin.toLowerCase(Locale.ROOT));
        }
        String dist = distribution == null ? "" : distribution.toLowerCase(Locale.ROOT);
        List<String> evidence = new ArrayList<>();
        String id = matchVendor(signals, dist, "aliyun", new String[]{"aliyun", "apack", "aliws"}, evidence);
        if (id == null) {
            id = matchVendor(signals, dist, "tencent", new String[]{"tencent", "qcloud", "tc"}, evidence);
        }
        if (id == null) {
            id = matchVendor(signals, dist, "aws",
                    new String[]{"com.amazonaws", "cloud-aws", "repository-s3"}, evidence);
        }
        if (id == null) {
            id = matchVendor(signals, dist, "elastic", new String[]{"elastic-cloud", "ece"}, evidence);
        }
        if (id == null && "default".equals(dist) && noCloudSignature(signals)) {
            id = "oss";
            evidence.add("distribution:default");
        }
        if (id == null) {
            id = "unknown";
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("label", vendorLabel(id));
        out.put("evidence", evidence);
        return out;
    }

    /** 逐关键字匹配厂商：插件按 token 边界命中记 {@code plugin:<id>} 证据、distribution 精确（或 {@code :} 前缀）命中记 {@code distribution:<值>}。 */
    private static String matchVendor(List<String> pluginSignals, String dist, String vendorId,
                                      String[] keywords, List<String> evidence) {
        boolean hit = false;
        for (String plugin : pluginSignals) {
            for (String keyword : keywords) {
                if (pluginKeywordHit(plugin, keyword)) {
                    evidence.add("plugin:" + plugin);
                    hit = true;
                    break;
                }
            }
        }
        if (!dist.isEmpty()) {
            for (String keyword : keywords) {
                if (dist.equals(keyword) || dist.startsWith(keyword + ":")) {
                    evidence.add("distribution:" + dist);
                    hit = true;
                    break;
                }
            }
        }
        return hit ? vendorId : null;
    }

    /**
     * 插件 id 关键字命中（token 边界，杜绝子串误判）：精确相等、Maven 组前缀
     * （{@code com.amazonaws:ec2-discovery}）或 {@code -} 段前缀（{@code apack-knn}）。
     * 仅含子串（如 {@code mapper-forensicsaws}）不算命中——自建集群装个别含云字的
     * 社区插件不应误判为云厂商托管。
     */
    private static boolean pluginKeywordHit(String plugin, String keyword) {
        return plugin.equals(keyword)
                || plugin.startsWith(keyword + ":")
                || plugin.startsWith(keyword + "-");
    }

    /** 是否完全无云厂商特征插件（oss 判定的前提；关键字与 vendorOf 各档同源、同 token 边界）。 */
    private static boolean noCloudSignature(List<String> pluginSignals) {
        List<String[]> cloudKeywords = Arrays.asList(
                new String[]{"aliyun", "apack", "aliws"},
                new String[]{"tencent", "qcloud", "tc"},
                new String[]{"com.amazonaws", "cloud-aws", "repository-s3"},
                new String[]{"elastic-cloud", "ece"});
        for (String plugin : pluginSignals) {
            for (String[] group : cloudKeywords) {
                for (String keyword : group) {
                    if (pluginKeywordHit(plugin, keyword)) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    /** 厂商中文标签（报告/探测返回共用）。 */
    static String vendorLabel(String id) {
        if ("aliyun".equals(id)) {
            return "阿里云 ES";
        }
        if ("tencent".equals(id)) {
            return "腾讯云 ES";
        }
        if ("aws".equals(id)) {
            return "AWS ES";
        }
        if ("elastic".equals(id)) {
            return "Elastic Cloud";
        }
        if ("oss".equals(id)) {
            return "开源自建";
        }
        return "未知";
    }

    private static Integer intValue(Object value) {
        return value instanceof Number ? ((Number) value).intValue() : null;
    }

    /**
     * 目标 ILM 策略存在性探针：{@code GET _ilm/policy/<P>}，404=false、2xx=true、
     * 其余异常按存在处理（探测不出就不删，留给反应式兜底）。包内可见供测试覆写。
     */
    boolean targetIlmPolicyExists(String policy) {
        return ilmPolicyExistsOn(localClient.get().getLowLevelClient(), policy);
    }

    /** 同 {@link #targetIlmPolicyExists}，走指定连接（destConnId）通道；包内可见供测试覆写。 */
    boolean destIlmPolicyExists(RestClient ll, String policy) {
        return ilmPolicyExistsOn(ll, policy);
    }

    private static boolean ilmPolicyExistsOn(RestClient ll, String policy) {
        try {
            Request req = new Request("GET", "/_ilm/policy/" + encodeSegment(policy.trim()));
            ll.performRequest(req);
            return true;
        } catch (ResponseException re) {
            return re.getResponse().getStatusLine().getStatusCode() != 404;
        } catch (Exception e) {
            logger.debug("[StructureSyncService] ilm policy probe failed {}: {}", policy, e.getMessage(), e);
            return true;
        }
    }

    private static String encodeSegment(String value) {
        try {
            return java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException e) {
            return value;
        }
    }

    // ---------------------------------------------------------------- 源侧读取

    /** flat_settings 形态读源 settings，剔除内部键后返回扁平键表（含 {@code index.analysis} 嵌套对象）。 */
    private Map<String, Object> readSourceSettings(RestClient ll, String src) throws Exception {
        return readIndexSettings(path -> sourceGet(ll, path), src);
    }

    /** 读任意侧索引 settings（通道注入）：形态归一同 {@link #readSourceSettings}。 */
    private static Map<String, Object> readIndexSettings(ClusterGet getter, String index) throws Exception {
        Map<String, Object> root = getter.get("/" + index + "/_settings?flat_settings=true");
        Map<String, Object> idx = firstSection(root, "_settings");
        Object settingsNode = idx == null ? null : idx.get("settings");
        if (!(settingsNode instanceof Map) || ((Map<?, ?>) settingsNode).isEmpty()) {
            throw new IllegalStateException("索引无可读 settings: " + index);
        }
        Map<String, Object> out = new LinkedHashMap<>((Map<String, Object>) settingsNode);
        for (String key : STRIPPED_SETTING_KEYS) {
            out.remove(key);
        }
        return out;
    }

    /** 读源 mapping 并归一为无类型 body（6.x 剥单 type 包装、剔 7.x 已移除的 _all）。 */
    private Map<String, Object> readSourceMapping(RestClient ll, String src) throws Exception {
        return readIndexMapping(path -> sourceGet(ll, path), src);
    }

    /** 读任意侧索引 mapping（通道注入）：形态归一同 {@link #readSourceMapping}。 */
    private static Map<String, Object> readIndexMapping(ClusterGet getter, String index) throws Exception {
        Map<String, Object> root = getter.get("/" + index + "/_mapping");
        Map<String, Object> idx = firstSection(root, "_mapping");
        Object mappingsNode = idx == null ? null : idx.get("mappings");
        Map<String, Object> body = new LinkedHashMap<>();
        if (mappingsNode instanceof Map && !((Map<?, ?>) mappingsNode).isEmpty()) {
            Map<String, Object> mappings = (Map<String, Object>) mappingsNode;
            if (mappings.containsKey("properties") || mappings.containsKey("dynamic_templates")
                    || mappings.containsKey("_meta")) {
                body.putAll(mappings); // 7.x 无类型
            } else {
                body.putAll((Map<String, Object>) mappings.values().iterator().next()); // 6.x 单 type body
            }
        }
        body.remove("_all"); // 7.x 已移除
        return body;
    }

    /** 读源别名（{@code GET /{idx}/_alias}）：名称 → 定义（filter/routing 元数据）；读取失败如实 warning、按空处理。 */
    private Map<String, Map<String, Object>> readSourceAliases(RestClient ll, String src,
                                                               List<String> warnings) {
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();
        try {
            Map<String, Object> root = sourceGet(ll, "/" + src + "/_alias");
            Map<String, Object> idx = firstSection(root, "_alias");
            Object aliases = idx == null ? null : idx.get("aliases");
            if (aliases instanceof Map) {
                for (Map.Entry<String, Object> e : ((Map<String, Object>) aliases).entrySet()) {
                    out.put(e.getKey(), e.getValue() instanceof Map
                            ? (Map<String, Object>) e.getValue() : Collections.<String, Object>emptyMap());
                }
            }
        } catch (Exception e) {
            logger.debug("[StructureSyncService] read source aliases failed {}: {}", src, e.getMessage(), e);
            warnings.add("读取源别名失败，别名清单按空处理: " + rootMsg(e));
        }
        return out;
    }

    /** 源侧 low-level GET；包内可见供测试以路径表覆写（不触真实集群）。 */
    Map<String, Object> sourceGet(RestClient ll, String path) throws Exception {
        return lowLevelGet(ll, path);
    }

    /** 目标（宿主）侧 low-level GET；包内可见供测试覆写。 */
    Map<String, Object> targetGet(String path) throws Exception {
        return lowLevelGet(localClient.get().getLowLevelClient(), path);
    }

    /** 目标（宿主）侧 PUT 建索引；非 2xx 不抛（状态码与响应体交由调用方分类），包内可见供测试覆写。 */
    PutResult targetPut(String destIndex, String jsonBody) throws Exception {
        return performPut(localClient.get().getLowLevelClient(), "PUT", "/" + destIndex, jsonBody);
    }

    /** 目标（宿主）侧 POST _aliases（别名随迁）；非 2xx 不抛，包内可见供测试覆写。 */
    PutResult targetPostAliases(String jsonBody) throws Exception {
        return performPut(localClient.get().getLowLevelClient(), "POST", "/_aliases", jsonBody);
    }

    /** 目标为指定连接（destConnId）时的 low-level GET；包内可见供测试覆写（不触真实集群）。 */
    Map<String, Object> destGet(RestClient ll, String path) throws Exception {
        return lowLevelGet(ll, path);
    }

    /** 目标为指定连接（destConnId）时的 PUT 建索引；语义同 {@link #targetPut}，包内可见供测试覆写。 */
    PutResult destTargetPut(RestClient ll, String destIndex, String jsonBody) throws Exception {
        return performPut(ll, "PUT", "/" + destIndex, jsonBody);
    }

    /** 目标为指定连接（destConnId）时的 POST _aliases；语义同 {@link #targetPostAliases}，包内可见供测试覆写。 */
    PutResult destTargetPostAliases(RestClient ll, String jsonBody) throws Exception {
        return performPut(ll, "POST", "/_aliases", jsonBody);
    }

    /** low-level PUT/POST：非 2xx 不抛，状态码与响应体交由调用方分类（ResponseException 形态）。 */
    private static PutResult performPut(RestClient ll, String method, String uri, String jsonBody)
            throws Exception {
        Request req = new Request(method, uri);
        req.setJsonEntity(jsonBody);
        try {
            Response resp = ll.performRequest(req);
            return new PutResult(resp.getStatusLine().getStatusCode(), bodyOf(resp));
        } catch (ResponseException re) {
            Response resp = re.getResponse();
            return new PutResult(resp.getStatusLine().getStatusCode(), bodyOf(resp));
        }
    }

    /** 逐别名 add（filter/routing 元数据原样）：成功进 synced，失败进 warnings 不回滚索引创建。 */
    private void syncAliasesTo(String dest, Map<String, Map<String, Object>> aliases,
                               List<String> synced, List<String> warnings, RestClient destLl) {
        for (Map.Entry<String, Map<String, Object>> e : aliases.entrySet()) {
            Map<String, Object> add = new LinkedHashMap<>();
            add.put("index", dest);
            add.put("alias", e.getKey());
            Map<String, Object> def = e.getValue();
            if (def != null) {
                for (String meta : ALIAS_META_KEYS) {
                    if (def.containsKey(meta)) {
                        add.put(meta, def.get(meta));
                    }
                }
            }
            Map<String, Object> action = new LinkedHashMap<>();
            action.put("add", add);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("actions", Collections.singletonList(action));
            try {
                PutResult result = destLl == null
                        ? targetPostAliases(OBJECT_MAPPER.writeValueAsString(body))
                        : destTargetPostAliases(destLl, OBJECT_MAPPER.writeValueAsString(body));
                if (result.status >= 200 && result.status < 300) {
                    synced.add(e.getKey());
                } else {
                    warnings.add("别名 " + e.getKey() + " 同步失败（HTTP " + result.status + "）: "
                            + brief(result.body));
                }
            } catch (Exception ex) {
                warnings.add("别名 " + e.getKey() + " 同步失败: " + rootMsg(ex));
            }
        }
    }

    private static Map<String, Object> lowLevelGet(RestClient ll, String path) throws Exception {
        Response resp = ll.performRequest(new Request("GET", path));
        return OBJECT_MAPPER.readValue(bodyOf(resp), Map.class);
    }

    private static String bodyOf(Response resp) throws Exception {
        return resp.getEntity() == null ? "" : org.apache.http.util.EntityUtils.toString(resp.getEntity());
    }

    // ---------------------------------------------------------------- 反应式剔除（目标报错驱动）

    /**
     * 按目标 400 报错剔除不兼容内容；返回是否发生可推进的变更（无变更时调用方应终止循环）。
     */
    static boolean applyAdaptiveRemoval(String reason, Map<String, Object> settings, Map<String, Object> mappings,
                                        String fallback, List<Map<String, Object>> removedSettings,
                                        List<Map<String, Object>> removedAnalysis,
                                        List<Map<String, Object>> downgradedFields) {
        String settingKey = matchSettingKey(reason);
        if (settingKey != null) {
            if (settings.remove(settingKey) == null) {
                return false; // 报错指向的键不存在（已被剔除/非本源），重试无意义
            }
            removedSettings.add(entry("key", settingKey, "reason", reason));
            return true;
        }
        String[] component = matchComponent(reason);
        if (component == null) {
            return false;
        }
        return removeAnalysisComponent(component[0], component[1], reason, settings, mappings, fallback,
                removedAnalysis, downgradedFields, true);
    }

    /**
     * 剔除一个 analysis 组件定义并级联处理：引用它的自定义 analyzer 一并剔除、字段上的
     * analyzer/search_analyzer 引用降级为回退分词器、normalizer 引用剔除属性（字段保留）。
     * 反应式（目标报错）与兼容矩阵（预判）共用；{@code includeAttr=true} 时降级条目附
     * {@code attr} 属性名（反应式报告形态），矩阵形态为 {@code {field,from,to,reason}}。
     */
    @SuppressWarnings("unchecked")
    static boolean removeAnalysisComponent(String kind, String name, String reason,
                                           Map<String, Object> settings, Map<String, Object> mappings,
                                           String fallback, List<Map<String, Object>> removedAnalysis,
                                           List<Map<String, Object>> downgradedFields, boolean includeAttr) {
        return removeAnalysisComponent(kind, name, reason, settings, mappings, fallback,
                removedAnalysis, downgradedFields, includeAttr, reason);
    }

    /**
     * 同上（{@code fieldReason} 形态）：{@code removedAnalysis} 条目用 {@code reason}，
     * 字段降级条目用 {@code fieldReason}——兼容矩阵 vendor-aware 时降级 reason 附目标厂商，
     * 与组件剔除的中文理由分离；反应式路径两 reason 相同（走 9 参重载）。
     */
    @SuppressWarnings("unchecked")
    static boolean removeAnalysisComponent(String kind, String name, String reason,
                                           Map<String, Object> settings, Map<String, Object> mappings,
                                           String fallback, List<Map<String, Object>> removedAnalysis,
                                           List<Map<String, Object>> downgradedFields, boolean includeAttr,
                                           String fieldReason) {
        boolean changed = false;
        Set<String> removedNames = new LinkedHashSet<>();
        removedNames.add(name);
        Map<String, Object> analysis = analysisOf(settings);
        Map<String, Object> byKind = analysis == null ? null : (Map<String, Object>) analysis.get(kind);
        if (byKind != null && byKind.remove(name) != null) {
            removedAnalysis.add(entry("kind", kind, "name", name, "reason", reason));
            changed = true;
        }
        /* 引用被剔 tokenizer/filter/char_filter 的自定义 analyzer 在目标不可构建，一并剔除。 */
        if (!"analyzer".equals(kind) && analysis != null) {
            Map<String, Object> analyzers = (Map<String, Object>) analysis.get("analyzer");
            if (analyzers != null && !analyzers.isEmpty()) {
                for (Map.Entry<String, Object> e : new ArrayList<>(analyzers.entrySet())) {
                    if (e.getValue() instanceof Map && analyzerReferences((Map<String, Object>) e.getValue(), kind, name)) {
                        analyzers.remove(e.getKey());
                        removedAnalysis.add(entry("kind", "analyzer", "name", e.getKey(),
                                "reason", "analyzer 引用了目标不可用的 " + kind + " [" + name + "]: " + reason));
                        removedNames.add(e.getKey());
                        changed = true;
                    }
                }
            }
        }
        if (analysis != null && analysis.isEmpty()) {
            settings.remove("index.analysis");
        }
        if (downgradeReferences(mappings.get("properties"), removedNames, fallback, downgradedFields,
                fieldReason, "", includeAttr)) {
            changed = true;
        }
        return changed;
    }

    /** settings 扁平键表里的 analysis 节（flat_settings 下挂在 {@code index.analysis} 键）。 */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> analysisOf(Map<String, Object> settings) {
        Object node = settings.get("index.analysis");
        return node instanceof Map ? (Map<String, Object>) node : null;
    }

    /** 自定义 analyzer 定义是否直接引用指定组件（tokenizer 等值、filter/char_filter 列表包含）。 */
    private static boolean analyzerReferences(Map<String, Object> analyzerDef, String kind, String name) {
        Object tokenizer = analyzerDef.get("tokenizer");
        if ("tokenizer".equals(kind) && name.equals(tokenizer)) {
            return true;
        }
        if ("filter".equals(kind) || "char_filter".equals(kind)) {
            Object list = analyzerDef.get(kind);
            if (list instanceof List) {
                for (Object item : (List<?>) list) {
                    if (name.equals(item)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * 递归扫描 properties（含嵌套对象与 multi-fields），把引用被剔组件名的
     * analyzer/search_analyzer 属性降级为回退分词器、normalizer 属性直接剔除
     * （"standard" 不是合法 normalizer 名，无处可降）；字段定义本身保留。
     */
    @SuppressWarnings("unchecked")
    private static boolean downgradeReferences(Object propertiesNode, Set<String> removedNames, String fallback,
                                               List<Map<String, Object>> downgradedFields, String reason,
                                               String prefix, boolean includeAttr) {
        if (!(propertiesNode instanceof Map) || ((Map<?, ?>) propertiesNode).isEmpty()) {
            return false;
        }
        boolean changed = false;
        Map<String, Object> properties = (Map<String, Object>) propertiesNode;
        for (Map.Entry<String, Object> e : properties.entrySet()) {
            if (!(e.getValue() instanceof Map)) {
                continue;
            }
            Map<String, Object> field = (Map<String, Object>) e.getValue();
            String fieldPath = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
            for (String attr : FIELD_ANALYSIS_ATTRS) {
                Object value = field.get(attr);
                if (value instanceof String && removedNames.contains(value)) {
                    Object to;
                    if ("normalizer".equals(attr)) {
                        field.remove(attr); // normalizer 无合法回退值，恒剔除属性
                        to = null;
                    } else {
                        field.put(attr, fallback);
                        to = fallback;
                    }
                    if (includeAttr) {
                        downgradedFields.add(entry("field", fieldPath, "attr", attr,
                                "from", value, "to", to, "reason", reason));
                    } else {
                        downgradedFields.add(entry("field", fieldPath,
                                "from", value, "to", to, "reason", reason));
                    }
                    changed = true;
                }
            }
            if (downgradeReferences(field.get("properties"), removedNames, fallback, downgradedFields,
                    reason, fieldPath, includeAttr)) {
                changed = true;
            }
            if (downgradeReferences(field.get("fields"), removedNames, fallback, downgradedFields,
                    reason, fieldPath, includeAttr)) {
                changed = true;
            }
        }
        return changed;
    }

    /**
     * 字段引用降级（兼容矩阵入口）：把直接引用指定组件名（如 {@code analyzer=ik_max_word}）
     * 的字段属性降级为回退分词器，条目形态 {@code {field, from, to, reason}}。
     */
    static boolean downgradeFieldReferences(Object propertiesNode, Set<String> removedNames, String fallback,
                                            List<Map<String, Object>> downgradedFields, String reason) {
        return downgradeReferences(propertiesNode, removedNames, fallback, downgradedFields, reason, "", false);
    }

    /** 400 报错中提取可剔除的 settings 键名（unknown/private 两种形态）。 */
    private static String matchSettingKey(String reason) {
        Matcher m = UNKNOWN_SETTING.matcher(reason);
        if (m.find()) {
            return m.group(1);
        }
        m = PRIVATE_SETTING.matcher(reason);
        return m.find() ? m.group(1) : null;
    }

    /** 400 报错中提取可剔除的 analysis 组件（kind, name）；不属可处理类别返回 null。 */
    private static String[] matchComponent(String reason) {
        Matcher m = UNKNOWN_COMPONENT.matcher(reason);
        if (m.find() && HANDLED_KINDS.contains(m.group(1).toLowerCase(Locale.ROOT))) {
            return new String[]{m.group(1).toLowerCase(Locale.ROOT), m.group(2)};
        }
        m = COMPONENT_NOT_FOUND.matcher(reason);
        if (m.find()) {
            return new String[]{m.group(1).toLowerCase(Locale.ROOT), m.group(2)};
        }
        return null;
    }

    /** 组装建索引请求体：settings 平铺键按点号重组为嵌套形态 {@code {"index":{...,"analysis":{...}}}}
     * （对齐 TS/mjs；PUT 体与报告 body 同源同构）+ mapping。 */
    private static Map<String, Object> buildCreateBody(Map<String, Object> settings, Map<String, Object> mappings) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("settings", nestSettings(settings));
        body.put("mappings", mappings);
        return body;
    }

    /** 平铺 settings 键按点号重组为建索引用的嵌套形态（{@code index.number_of_shards} 归入
     * {@code {index:{number_of_shards}}}，{@code index.analysis} 嵌套对象并入 {@code index.analysis}）。 */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> nestSettings(Map<String, Object> settings) {
        Map<String, Object> root = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : settings.entrySet()) {
            String[] parts = e.getKey().split("\\.");
            Map<String, Object> cur = root;
            for (int i = 0; i < parts.length - 1; i++) {
                Object next = cur.get(parts[i]);
                if (!(next instanceof Map)) {
                    next = new LinkedHashMap<>();
                    cur.put(parts[i], next);
                }
                cur = (Map<String, Object>) next;
            }
            cur.put(parts[parts.length - 1], e.getValue());
        }
        return root;
    }

    // ---------------------------------------------------------------- 版本对比与错误解析

    /** 主/次版本不一致（或发行版标记不一致）时给出非阻断提示。 */
    private static void compareVersions(String sourceVersion, String targetVersion, List<String> warnings) {
        if (sourceVersion == null || targetVersion == null) {
            return;
        }
        String[] src = versionParts(sourceVersion);
        String[] dst = versionParts(targetVersion);
        if (src.length >= 2 && dst.length >= 2
                && (!src[0].equals(dst[0]) || !src[1].equals(dst[1]))) {
            warnings.add("源集群版本 " + sourceVersion + " 与目标集群版本 " + targetVersion
                    + " 主/次版本不一致，跨版本建索引的字段解析与默认行为可能存在差异");
        }
    }

    private static String[] versionParts(String version) {
        return version.trim().split("\\.");
    }

    /** 主/次版本是否一致（与 {@link #compareVersions} 同口径：major.minor 相同即视为同版，
     *  补丁号差异如 7.10.1 vs 7.10.2 不算版本差）。 */
    private static boolean sameMajorMinor(String a, String b) {
        String[] sa = versionParts(a);
        String[] sb = versionParts(b);
        return sa.length >= 2 && sb.length >= 2 && sa[0].equals(sb[0]) && sa[1].equals(sb[1]);
    }

    /** 400 响应体解析：优先 error.root_cause[0] 的 type+reason，回退 error.reason。 */
    @SuppressWarnings("unchecked")
    static EsError parseError(String body) {
        if (body == null || body.isEmpty()) {
            return new EsError(null, null);
        }
        try {
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            Object errorNode = root.get("error");
            if (errorNode instanceof Map) {
                Map<String, Object> error = (Map<String, Object>) errorNode;
                Object rootCauses = error.get("root_cause");
                if (rootCauses instanceof List && !((List<?>) rootCauses).isEmpty()) {
                    Object first = ((List<?>) rootCauses).get(0);
                    if (first instanceof Map) {
                        Map<String, Object> cause = (Map<String, Object>) first;
                        return new EsError(String.valueOf(cause.get("type")),
                                cause.get("reason") == null ? null : String.valueOf(cause.get("reason")));
                    }
                }
                return new EsError(error.get("type") == null ? null : String.valueOf(error.get("type")),
                        error.get("reason") == null ? null : String.valueOf(error.get("reason")));
            }
        } catch (Exception ignore) {
            // 非 JSON 响应体：按原文失败
        }
        return new EsError(null, body);
    }

    /** {@code _settings}/{@code _mapping}/{@code _alias} 响应取第一个索引节。 */
    private static Map<String, Object> firstSection(Map<String, Object> root, String what) {
        if (root == null || root.isEmpty()) {
            throw new IllegalStateException("源索引响应为空（" + what + "）");
        }
        Object first = root.values().iterator().next();
        if (!(first instanceof Map)) {
            throw new IllegalStateException("源索引响应形态异常（" + what + "）");
        }
        return (Map<String, Object>) first;
    }

    private static String brief(String body) {
        if (body == null) {
            return "";
        }
        String b = body.trim();
        return b.length() > 300 ? b.substring(0, 300) + "...(截断)" : b;
    }

    private static Map<String, Object> entry(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return out;
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String rootMsg(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return t.getMessage() == null ? t.toString() : t.getMessage();
    }

    private static void closeQuietly(RestHighLevelClient client) {
        if (client == null) {
            return;
        }
        try {
            client.close();
        } catch (Exception e) {
            logger.debug("[StructureSyncService] close remote client ignore: {}", e.getMessage(), e);
        }
    }

    /** PUT/POST 结果：状态码 + 响应体（400 时含 error.root_cause）。 */
    static final class PutResult {
        final int status;
        final String body;

        PutResult(int status, String body) {
            this.status = status;
            this.body = body == null ? "" : body;
        }
    }

    /** 400 解析出的错误类型与原始 reason。 */
    static final class EsError {
        final String type;
        final String reason;

        EsError(String type, String reason) {
            this.type = type;
            this.reason = reason;
        }
    }
}
