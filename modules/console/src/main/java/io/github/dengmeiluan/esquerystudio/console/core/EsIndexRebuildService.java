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

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLock;
import io.github.dengmeiluan.esquerystudio.console.validate.DateFormSampler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * ES 索引控制台通用能力服务（Facade + 协作者模式 R1）：把锁管理、索引名解析等子职责
 * 委托给 {@link RebuildLockGuard} / {@link IndexNameResolver}（OOP/SRP）。
 *
 * <p><b> 阶段⑤</b>：SPI 驱动的重建编排路径（firstMigrate / rebuild / finishRebuild /
 * cleanup / abort / full-reload / 作业追踪）已整条退役，重建执行改由
 * {@code adhoc/AdhocRebuildService} 按索引名承担（不再要求业务侧实现能力接口）。
 * 本类保留控制台通用能力：索引/别名诊断（status / overview / health）、reindex 进度查询、
 * 索引巡检与 DSL 查询、force-merge / 副本数调整、空索引重建（清空）。</p>
 */
public class EsIndexRebuildService {

    private static final Logger logger = LoggerFactory.getLogger(EsIndexRebuildService.class);

    private final IndexMetaRegistry registry;
    private final EsIndexAdmin esIndexAdmin;
    private final RebuildLockGuard lockGuard;
    private final IndexNameResolver nameResolver;
    private final ESQueryStudioElasticsearchProperties properties;

    public EsIndexRebuildService(IndexMetaRegistry registry, EsIndexAdmin esIndexAdmin,
                                 RebuildLockGuard lockGuard, IndexNameResolver nameResolver,
                                 ESQueryStudioElasticsearchProperties properties) {
        this.registry = registry;
        this.esIndexAdmin = esIndexAdmin;
        this.lockGuard = lockGuard;
        this.nameResolver = nameResolver;
        this.properties = properties;
    }

    public ReindexProgress progress(String taskId) throws IOException {
        return esIndexAdmin.getReindexProgress(taskId);
    }

    /**
     * Q1: 索引详情快照（mapping/settings/docCount/aliases/sample N 条）。
     * 已注册 indexKey 用 alias；未注册的物理索引名直传。
     */
    public Map<String, Object> inspect(String name, int sampleSize) throws IOException {
        // 优先按 indexKey 解析为 alias；找不到当物理索引名直查
        String resolved;
        try {
            resolved = registry.getByKey(name).getAliasName();
        } catch (Exception e) {
            // registry 异常与「未注册直传」此前静默合流零痕——补 debug 留痕
            // （带异常类名）。未注册物理索引名直传是合法主路径，维持 debug 不升 WARN 防刷屏
            logger.debug("[inspect] indexKey 解析未命中/registry 异常，按物理索引名直传 name={} exception={}",
                    name, e.getClass().getName());
            resolved = name;
        }
        return esIndexAdmin.inspect(resolved, Math.max(0, Math.min(sampleSize, 50)));
    }

    /**
     * Q1: starter 自家系统索引详情。
     *
     * <p> 阶段⑤：{@code job} / {@code audit} 两个系统索引随 SPI 重建路径退役，
     * 仅剩 {@code lock} 可查。</p>
     */
    public Map<String, Object> inspectSystem(String which) throws IOException {
        /* lock 名由装配处注入、非用户输入；通用控制面守卫会拒绝该名，这里走系统索引专用读
           （trusted 通道：mapping/alias 与 query DSL 均可读，页门仍按 /system 授权）。 */
        return esIndexAdmin.inspectSystemIndex(systemIndexName(which), 20);
    }

    /**
     * 解析 starter 自家系统索引名。lock 索引名由装配处（{@code rebuildLockStore}）解析后注入，
     * 保证控制台查到的与锁实际读写的是<b>同一个</b>索引，而不是两处各自推导、可能悄悄分叉。
     */
    private String systemIndexName(String which) {
        if (!"lock".equals(which)) {
            throw new IllegalArgumentException("which 参数必须为 lock，实际=" + which);
        }
        if (lockIndexName == null || lockIndexName.isEmpty()) {
            throw new IllegalStateException("lock 索引名未注入，无法查询系统索引");
        }
        return lockIndexName;
    }

    /** 由装配处注入的 lock 索引名（与 {@code RebuildLockStore} 使用的完全一致）。 */
    private String lockIndexName;

    public void setLockIndexName(String lockIndexName) {
        this.lockIndexName = lockIndexName;
    }

    /**
     * 空索引重建（清空数据）：基于 provider 声明的 mapping/settings 新建空物理索引 → alias atomic swap → 删旧。
     *
     * <p> 阶段⑤：原 {@code triggerReload} 参数依赖已退役的 {@code fullReload} SPI，已移除；
     * 本方法只做「换成一个空索引」，回灌由业务侧自行发起。</p>
     */
    public Map<String, Object> rebuildEmpty(String indexKey) throws IOException {
        RebuildableIndexMeta meta = registry.getByKey(indexKey);
        lockGuard.acquire(indexKey);
        try {
            String alias = meta.getAliasName();
            if (!esIndexAdmin.aliasExists(alias)) {
                throw new IllegalStateException("别名不存在，请先完成首次迁移: " + alias);
            }
            String oldPhysical = esIndexAdmin.getWriteIndex(alias);
            if (oldPhysical == null) {
                throw new IllegalStateException("无法确定别名当前写索引: " + alias);
            }
            String newPhysical = createNewPhysicalIndex(meta, indexKey, oldPhysical);
            esIndexAdmin.switchWriteIndex(alias, newPhysical, oldPhysical);
            if (esIndexAdmin.getIndicesByAlias(alias).contains(oldPhysical)) {
                esIndexAdmin.removeAlias(alias, oldPhysical);
            }
            esIndexAdmin.deleteIndex(oldPhysical);
            logger.info("[rebuildEmpty] indexKey={} old={} new={}", indexKey, oldPhysical, newPhysical);
            lockGuard.release(indexKey);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("indexKey", indexKey);
            result.put("oldPhysical", oldPhysical);
            result.put("newPhysical", newPhysical);
            result.put("docCount", 0);
            return result;
        } catch (Exception e) {
            lockGuard.release(indexKey);
            throw e;
        }
    }

    /**
     * Force merge 索引（合并 segment，减少碎片）。
     */
    public Map<String, Object> forceMerge(String indexKey, int maxNumSegments) throws IOException {
        RebuildableIndexMeta meta = registry.getByKey(indexKey);
        String alias = meta.getAliasName();
        String physical = esIndexAdmin.getWriteIndex(alias);
        if (physical == null) physical = alias;
        Map<String, Object> r = esIndexAdmin.forceMerge(physical, maxNumSegments);
        logger.info("[forceMerge] indexKey={} physical={} maxSegments={}", indexKey, physical, maxNumSegments);
        return r;
    }

    /**
     * 热更新副本数。
     */
    public void updateReplicas(String indexKey, int count) throws IOException {
        if (count < 0 || count > 5) {
            throw new IllegalArgumentException("副本数必须在 0-5 范围内，实际=" + count);
        }
        RebuildableIndexMeta meta = registry.getByKey(indexKey);
        String alias = meta.getAliasName();
        String physical = esIndexAdmin.getWriteIndex(alias);
        if (physical == null) physical = alias;
        String settingsJson = "{\"index\":{\"number_of_replicas\":\"" + count + "\"}}";
        esIndexAdmin.updateSettings(physical, settingsJson);
        logger.info("[updateReplicas] indexKey={} physical={} replicas={}", indexKey, physical, count);
    }

    /**
     * 系统索引 Query DSL。
     *
     * <p> 阶段⑤：{@code job} / {@code audit} 两个系统索引随 SPI 重建路径退役，
     * 仅剩 {@code lock} 可查。</p>
     */
    public Map<String, Object> querySystem(String which, String dslJson, int size) throws IOException {
        return esIndexAdmin.querySystemIndex(systemIndexName(which), dslJson, Math.max(0, Math.min(size, 100)));
    }

    /** Q1: 自由 query DSL。 */
    public Map<String, Object> queryDsl(String name, String dslJson, int size) throws IOException {
        String resolved;
        try {
            resolved = registry.getByKey(name).getAliasName();
        } catch (Exception e) {
            // 同 inspect——debug 留痕带异常类名，控制流零变更
            logger.debug("[queryDsl] indexKey 解析未命中/registry 异常，按物理索引名直传 name={} exception={}",
                    name, e.getClass().getName());
            resolved = name;
        }
        return esIndexAdmin.queryDsl(resolved, dslJson, Math.max(0, Math.min(size, 100)));
    }

    /** 诊断别名当前状态，用于零停机验证与排障；同时暴露分布式锁视图。 */
    public Map<String, Object> status(String indexKey) throws IOException {
        RebuildableIndexMeta meta = registry.getByKey(indexKey);
        String name = meta.getAliasName();
        boolean isAlias = esIndexAdmin.aliasExists(name);
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("indexKey", indexKey);
        status.put("name", name);
        status.put("isAlias", isAlias);
        // C2 索引契约详情：实体类 / settings / mapping（前端契约卡折叠展示，无需读源码）
        Map<String, Object> contract = new LinkedHashMap<>();
        contract.put("entityClass", meta.getEntityClass().getName());
        contract.put("aliasName", meta.getAliasName());
        contract.put("physicalIndexPrefix", meta.getPhysicalIndexPrefix());
        contract.put("hasMapping", meta.hasMapping());
        status.put("contract", contract);
        if (isAlias) {
            status.put("phase", "ALIAS");
            status.put("aliasIndices", esIndexAdmin.getIndicesByAlias(name));
            status.put("writeIndex", esIndexAdmin.getWriteIndex(name));
        } else {
            status.put("phase", esIndexAdmin.indexExists(name) ? "CONCRETE" : "ABSENT");
        }
        // 锁视图（R2：归属判断使用 RebuildLock 充血方法 isHeldBy）：暴露 owner/到期时间/是否本实例，让多实例运维一眼看到「谁在重建、还能持多久」
        RebuildLock lock = lockGuard.get(indexKey);
        if (lock != null) {
            Map<String, Object> lockMap = new LinkedHashMap<>();
            lockMap.put("owner", lock.getOwner());
            lockMap.put("acquireTime", lock.getAcquireTime());
            lockMap.put("expireTime", lock.getExpireTime());
            lockMap.put("expired", lock.isExpired(System.currentTimeMillis()));
            lockMap.put("self", lock.isHeldBy(lockGuard.selfOwner()));
            status.put("lock", lockMap);
        }
        return status;
    }

    public List<String> listIndexKeys() {
        return registry.listIndexKeys();
    }

    /**
     * 全局总览：一次返回所有已登记 indexKey 的 status 摘要，前端 hero 一次拉完、少 N 次 RTT。
     * status() 调用失败的索引保留条目并标记 error，避免单点故障打断整个总览。
     */
    public Map<String, Object> overview() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (String key : registry.listIndexKeys()) {
            try {
                items.add(status(key));
            } catch (Exception e) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("indexKey", key);
                err.put("error", e.getMessage());
                items.add(err);
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("self", lockGuard.selfOwner());
        result.put("indices", items);
        return result;
    }

    /**
     * C7 健康度仪表：动态扫描全集群关键风险点 — 锁汇总（过期/他持/本持）。
     * 本接口运行时实时计算，前端按需刷新。
     */
    public Map<String, Object> health() {
        long now = System.currentTimeMillis();
        int locksSelf = 0, locksOther = 0, locksExpired = 0;
        String selfOwner = lockGuard.selfOwner();

        for (String key : registry.listIndexKeys()) {
            try {
                io.github.dengmeiluan.esquerystudio.console.lock.RebuildLock lock = lockGuard.get(key);
                if (lock != null) {
                    if (lock.isExpired(now)) {
                        locksExpired++;
                    } else if (lock.isHeldBy(selfOwner)) {
                        locksSelf++;
                    } else {
                        locksOther++;
                    }
                }
            } catch (Exception e) {
                logger.warn("[health] indexKey={} probe failed: {}", key, e.getMessage(), e);
            }
        }

        Map<String, Object> locks = new LinkedHashMap<>();
        locks.put("self", locksSelf);
        locks.put("other", locksOther);
        locks.put("expired", locksExpired);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("self", selfOwner);
        result.put("totalIndices", registry.listIndexKeys().size());
        result.put("locks", locks);
        result.put("checkedAt", now);
        return result;
    }

    /** 共性步骤（O3）：生成下个物理索引名 + 校验未占用 + 解析 mapping（含旧索引兜底）+ createIndex。 */
    private String createNewPhysicalIndex(RebuildableIndexMeta meta, String indexKey, String sourceIndex) throws IOException {
        String newPhysical = nameResolver.nextPhysical(meta);
        if (esIndexAdmin.indexExists(newPhysical)) {
            throw new IllegalStateException("目标物理索引已存在，请稍后重试: " + newPhysical);
        }
        esIndexAdmin.createIndex(newPhysical, meta.getSettingsJson(), nameResolver.resolveMappingJson(meta, sourceIndex, indexKey));
        return newPhysical;
    }

    /**
     * 将名称解析为 ES 可识别的索引：
     * indexKey → aliasName → writeIndex(物理索引名)。
     * 如果不是已注册的 indexKey 则原样返回。
     */
    public String resolveToPhysical(String name) {
        if (name == null || name.isEmpty()) return name;
        String alias;
        try {
            alias = registry.getByKey(name).getAliasName();
        } catch (Exception e) {
            // 同 inspect——debug 留痕带异常类名，控制流零变更
            logger.debug("[resolveToPhysical] indexKey 解析未命中/registry 异常，按原名返回 name={} exception={}",
                    name, e.getClass().getName());
            return name;
        }
        try {
            String physical = esIndexAdmin.getWriteIndex(alias);
            return physical != null ? physical : alias;
        } catch (Exception e) {
            // 同上——第二臂（别名解析成功但读写索引失败）此前亦静默
            logger.debug("[resolveToPhysical] 读写索引解析失败，回退别名 alias={} exception={}",
                    alias, e.getClass().getName());
            return alias;
        }
    }

    /** {@link #dateForms} 的采样口径标识，随响应返回，供报告说明「这份样本怎么取的」。 */
    public static final String SAMPLING_RANDOM_SCORE = "random_score";

    /**
     * 采样索引的 date 字段实际存储形态。
     *
     * <p><b>为什么不是 match_all</b>：ES 6.7.2 实测（40 条文档 = 先写 20 条 epoch_millis、
     * 后写 20 条 ISO 串），{@code {"query":{"match_all":{}},"size":20}} 连续三次<b>全部</b>返回
     * 最先写入的 {@code a1..a20}，命中 0 条。而本端点存在的理由正是<b>发现存储形态
     * 发生过变化</b>（老文档一种形态、新文档另一种）——一个偏向老文档的采样口径与被测性质
     * <b>反相关</b>，会系统性地把「新写入换了形态」报成「未发现异形」。样本量再大也补不掉，
     * 因为那不是「样本少」。故改用 {@code function_score + random_score}
     * （6.7.2 实测可用，三次采样两批均混杂）。</p>
     *
     * <p>只读 {@code _source}，不改任何东西。样本量有限——调用方必须把 {@code sampled} 与
     * {@code sampling} 一起展示，报告里不许给「无风险」的绝对结论，只能给
     * 「N 条样本中未发现」。</p>
     */
    public Map<String, Object> dateForms(String name, int size) throws IOException {
        int n = size <= 0 ? 50 : Math.min(size, 500);
        String physical = resolveToPhysical(name);
        String dsl = "{\"query\":{\"function_score\":{\"query\":{\"match_all\":{}},\"random_score\":{}}}}";
        Map<String, Object> resp = esIndexAdmin.queryDsl(physical, dsl, n);
        List<Map<String, Object>> sources = new ArrayList<>();
        Object hits = resp.get("hits");
        if (hits instanceof List) {
            for (Object h : (List<?>) hits) {
                if (h instanceof Map) {
                    Object src = ((Map<?, ?>) h).get("_source");
                    if (src instanceof Map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> typed = (Map<String, Object>) src;
                        sources.add(typed);
                    }
                }
            }
        }
        // getMapping 内部已剥 6.x 单 type 包层（EsIndexAdmin.unwrapTypeLayer），此处不重复实现
        Set<String> dateFields = DateFormSampler.dateFieldsOf(esIndexAdmin.getMapping(physical));
        io.github.dengmeiluan.esquerystudio.console.validate.DateFormTally tally =
                DateFormSampler.tally(sources, dateFields);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("index", name);
        out.put("physicalIndex", physical);
        out.put("sampled", sources.size());
        // total 非空是 api.ts 声明的契约（total: number 非可选）。该保证原先来自
        // EsIndexAdmin.queryDsl 的内部实现（两个分支都 put("total", …)）——那是**另一个类**的
        // 实现细节，不是 dateForms 自己的契约。此处兜底，使契约由本方法自己保证。
        Object total = resp.get("total");
        out.put("total", total == null ? 0 : total);
        out.put("sampling", SAMPLING_RANDOM_SCORE);
        out.put("dateFields", new ArrayList<>(dateFields));
        // forms 值域纯计数、samples 是另一棵树——前端求和不会把样例数组加进去（见 DateFormTally）
        out.put("forms", tally.getForms());
        out.put("samples", tally.getSamples());
        return out;
    }
}
