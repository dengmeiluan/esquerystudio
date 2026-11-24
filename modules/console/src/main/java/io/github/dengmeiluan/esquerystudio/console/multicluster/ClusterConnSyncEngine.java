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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 连接中心 ES 连接自动同步引擎(连接中心自动同步批):周期把 {@link ClusterConnContributor}
 * 贡献的连接 upsert 进 {@link ConnStore}。语义(详见 spec /):
 * <ul>
 *   <li><b>三层去重</b>:cc- 前缀确定性 id 幂等域 / 源内「映射后 env 分桶 + 节点集交集」判重 /
 *       新建前与手工域交集冲突跳过(手工优先,零触碰);</li>
 *   <li><b>指纹免刷</b>:name/url/username/env/minRole/password 全同不 save——防周期 SAVED
 *       事件刷连接菜单供给器;任一不同才 save + evict + 探活(与 EsClusterConnController.save 同款链);</li>
 *   <li><b>失联标记保留</b>(裁决):源消失 → markSyncState(STALE) 保留;源复现 → 恢复并更新;
 *       人工删除的同步档案(软删 DISMISSED)一律不再回灌——跳过 upsert 与失联标记,报告 notes 留痕;</li>
 *   <li><b>降级红线</b>:contribute() 抛错一次 WARN 后本进程永久降级;单条失败计入报告不中断整轮。</li>
 * </ul>
 *
 * @author aicoding
 */
public class ClusterConnSyncEngine {

    private static final Logger LOG = LoggerFactory.getLogger(ClusterConnSyncEngine.class);

    /** 同步档案 id 前缀:严格圈定同步域(手工域 = 非 cc- 前缀)。 */
    public static final String SYNC_ID_PREFIX = "cc-";
    /** 源已失联标记值。 */
    public static final String STATE_STALE = "STALE";

    private final ConnStore connStore;
    private final EsClientRouter router;          // 可空(单测);档案变更后 evict 长连接
    private final ConnHealthProber prober;        // 可空;save 后即时探活
    private final ClusterConnContributor contributor;
    private final int intervalSeconds;
    private final int initialDelaySeconds;
    private final String defaultMinRole;

    private final ScheduledExecutorService scheduler;
    private volatile boolean contributorBroken;
    private volatile ClusterConnSyncReport lastReport;

    public ClusterConnSyncEngine(ConnStore connStore, EsClientRouter router, ConnHealthProber prober,
                                 ClusterConnContributor contributor,
                                 int intervalSeconds, int initialDelaySeconds, String defaultMinRole) {
        this.connStore = connStore;
        this.router = router;
        this.prober = prober;
        this.contributor = contributor;
        this.intervalSeconds = Math.max(60, intervalSeconds);
        this.initialDelaySeconds = Math.max(0, initialDelaySeconds);
        this.defaultMinRole = defaultMinRole == null || defaultMinRole.trim().isEmpty()
                ? "VIEWER" : defaultMinRole.trim().toUpperCase(Locale.ROOT);
        ThreadFactory tf = new ThreadFactory() {
            private final AtomicInteger n = new AtomicInteger();
            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "es-conn-sync-" + n.incrementAndGet());
                t.setDaemon(true);
                return t;
            }
        };
        this.scheduler = Executors.newSingleThreadScheduledExecutor(tf);
    }

    /** 启动周期调度(首跑延迟 initialDelaySeconds)。 */
    public void start() {
        scheduler.scheduleWithFixedDelay(new Runnable() {
            @Override
            public void run() {
                try {
                    runOnce("scheduled");
                } catch (Exception e) {
                    LOG.warn("[ConnSync] scheduled round failed: {}", e.getMessage(), e);
                }
            }
        }, initialDelaySeconds, intervalSeconds, TimeUnit.SECONDS);
    }

    /** 关停调度线程(自动装配 destroyMethod)。 */
    public void shutdown() {
        scheduler.shutdownNow();
    }

    /** 最近一轮报告;尚未跑过返回 null。 */
    public ClusterConnSyncReport lastReport() {
        return lastReport;
    }

    /** 是否已因 contribute() 抛错永久降级。 */
    public boolean isContributorBroken() {
        return contributorBroken;
    }

    /** 同步档案确定性 id:cc- + sha256(sourceId) 前 12 字节 hex(总长 27 ≤ DDL VARCHAR(64))。 */
    public static String syncIdOf(String sourceId) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256")
                    .digest(String.valueOf(sourceId).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(SYNC_ID_PREFIX);
            for (int i = 0; i < 12; i++) {
                sb.append(String.format("%02x", d[i]));
            }
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    /**
     * 单节点规范化:小写 scheme/host、scheme 缺省 http、port 缺省 9200、
     * 去 userinfo(/ path / query → scheme://host:port;无法解析返回 null。
     */
    public static String normalizeNode(String uri) {
        if (uri == null) {
            return null;
        }
        String s = uri.trim();
        if (s.isEmpty()) {
            return null;
        }
        String scheme = "http";
        int schemeIdx = s.indexOf("://");
        if (schemeIdx >= 0) {
            scheme = s.substring(0, schemeIdx).toLowerCase(Locale.ROOT);
            s = s.substring(schemeIdx + 3);
        }
        int at = s.lastIndexOf('@');
        if (at >= 0) {
            s = s.substring(at + 1);
        }
        int slash = s.indexOf('/');
        if (slash >= 0) {
            s = s.substring(0, slash);
        }
        int q = s.indexOf('?');
        if (q >= 0) {
            s = s.substring(0, q);
        }
        String host = s;
        int port = 9200;
        int colon = s.lastIndexOf(':');
        if (colon >= 0) {
            try {
                port = Integer.parseInt(s.substring(colon + 1).trim());
                host = s.substring(0, colon);
            } catch (NumberFormatException e) {
                // 尾段非端口(如裸 IPv6):整段按 host 处理,端口走缺省
            }
        }
        if (host.trim().isEmpty()) {
            return null;
        }
        return scheme + "://" + host.trim().toLowerCase(Locale.ROOT) + ":" + port;
    }

    // ----------------------------------------------------------------------------------
    // 单轮同步

    /** 引擎内单条规范化条目。 */
    private static final class Entry {
        final String sourceId;
        final String name;
        final String url;       // 首节点单节点形态
        final String username;
        final String password;  // BASIC=密码 / API_KEY=ApiKey 秘钥(按 authType)
        final String env;       // 映射后 PROD/STAGING/QA/DEV/null
        final String minRole;   // 原样(空由 save 前补默认)
        final String authType;  // BASIC/API_KEY/null
        final Set<String> nodes;

        Entry(String sourceId, String name, String url, String username, String password,
              String env, String minRole, Set<String> nodes) {
            this(sourceId, name, url, username, password, env, minRole, "BASIC", nodes);
        }

        Entry(String sourceId, String name, String url, String username, String password,
              String env, String minRole, String authType, Set<String> nodes) {
            this.sourceId = sourceId;
            this.name = name;
            this.url = url;
            this.username = username;
            this.password = password;
            this.env = env;
            this.minRole = minRole;
            this.authType = authType == null || authType.trim().isEmpty()
                    ? "BASIC" : authType.trim().toUpperCase(java.util.Locale.ROOT);
            this.nodes = nodes;
        }
    }

    /**
     * 同步一轮。synchronized:周期调度与手动触发互斥。
     * spec /url 缺失条跳过进 skipped;指纹比对经 get(id)(明文密码)+ list 视图(name/env/minRole)。
     */
    public synchronized ClusterConnSyncReport runOnce(String trigger) {
        long start = System.currentTimeMillis();
        ClusterConnSyncReport.Builder rep = ClusterConnSyncReport.builder()
                .trigger(trigger == null ? "scheduled" : trigger);
        if (contributorBroken) {
            rep.contributorBroken(true)
                    .note("ClusterConnContributor 曾抛错,本进程已永久降级,跳过");
            return finish(rep, start);
        }
        List<ContributedEsCluster> raw;
        try {
            raw = contributor.contribute();
        } catch (Exception e) {
            contributorBroken = true;
            LOG.warn("[ConnSync] ClusterConnContributor.contribute() 抛错,本进程永久降级: {}", e.getMessage(), e);
            rep.contributorBroken(true).note("contribute() 抛错: " + e.getMessage());
            return finish(rep, start);
        }
        List<ContributedEsCluster> contributed = raw == null
                ? Collections.<ContributedEsCluster>emptyList() : raw;
        rep.contributedTotal(contributed.size());

        // A. 规范化 + 跳过条
        List<Entry> entries = new ArrayList<>();
        for (ContributedEsCluster c : contributed) {
            if (c.getSkipReason() != null && !c.getSkipReason().trim().isEmpty()) {
                rep.skipped(1).note("跳过 " + safeName(c) + ":" + c.getSkipReason());
                continue;
            }
            if (blank(c.getSourceId()) || blank(c.getName()) || blank(c.getUrl())) {
                rep.skipped(1).note("跳过无效条(sourceId/name/url 缺失)");
                continue;
            }
            LinkedHashSet<String> nodes = new LinkedHashSet<>();
            String first = null;
            // url 兼容逗号分隔多节点形态:逐段规范化,首个可解析段为档案 url(源内判重按节点集交集)
            for (String piece : c.getUrl().split(",")) {
                String n = normalizeNode(piece);
                if (n != null) {
                    if (first == null) {
                        first = n;
                    }
                    nodes.add(n);
                }
            }
            if (c.getAllUris() != null) {
                for (String u : c.getAllUris()) {
                    String n = normalizeNode(u);
                    if (n != null) {
                        nodes.add(n);
                    }
                }
            }
            if (nodes.isEmpty()) {
                rep.skipped(1).note("跳过 " + safeName(c) + ":无可解析节点");
                continue;
            }
            entries.add(new Entry(c.getSourceId().trim(), c.getName().trim(),
                    first, trimToNull(c.getUsername()), c.getPassword(),
                    EnvAliasMapper.map(c.getRawEnv()), trimToNull(c.getMinRole()),
                    trimToNull(c.getAuthType()), nodes));
        }

        // B. 源内判重:映射后 env 分桶(桶内先按 sourceId 字典序,先到先得,相交并入)
        entries.sort(new Comparator<Entry>() {
            @Override
            public int compare(Entry a, Entry b) {
                return a.sourceId.compareTo(b.sourceId);
            }
        });
        Map<String, List<Entry>> byEnv = new LinkedHashMap<>();
        for (Entry e : entries) {
            String k = e.env == null ? "" : e.env;
            List<Entry> l = byEnv.get(k);
            if (l == null) {
                l = new ArrayList<>();
                byEnv.put(k, l);
            }
            l.add(e);
        }
        List<Entry> accepted = new ArrayList<>();
        for (List<Entry> group : byEnv.values()) {
            List<Entry> kept = new ArrayList<>();
            for (Entry e : group) {
                Entry dup = null;
                for (Entry k : kept) {
                    if (intersects(k.nodes, e.nodes)) {
                        dup = k;
                        break;
                    }
                }
                if (dup != null) {
                    rep.duplicatesMerged(1)
                            .note("源内重复并入:" + e.name + "(" + e.sourceId + ") → " + dup.name);
                } else {
                    kept.add(e);
                }
            }
            accepted.addAll(kept);
        }

        // C. 读取存量:同步域 id → 视图;手工域节点集(冲突比对)
        List<Map<String, Object>> all;
        try {
            all = connStore.list();
        } catch (Exception e) {
            rep.errors(1).note("ConnStore.list 失败: " + e.getMessage());
            return finish(rep, start);
        }
        Map<String, Map<String, Object>> syncDomain = new HashMap<>();
        List<Set<String>> manualNodeSets = new ArrayList<>();
        List<String[]> manualMeta = new ArrayList<>();
        for (Map<String, Object> c : all) {
            String id = c.get("id") == null ? "" : String.valueOf(c.get("id"));
            if (id.startsWith(SYNC_ID_PREFIX)) {
                syncDomain.put(id, c);
            } else {
                String node = normalizeNode(c.get("scheme") + "://" + c.get("host") + ":" + c.get("port"));
                if (node != null) {
                    Set<String> ns = new HashSet<>();
                    ns.add(node);
                    manualNodeSets.add(ns);
                    manualMeta.add(new String[]{id, c.get("name") == null ? id : String.valueOf(c.get("name"))});
                }
            }
        }

        // D. 逐条 upsert(指纹免刷);人工软删的同步档案不回灌
        Set<String> presentIds = new HashSet<>();
        for (Entry e : accepted) {
            String id = syncIdOf(e.sourceId);
            presentIds.add(id);
            try {
                if (isDismissed(connStore.getSyncState(id))) {
                    // 墓碑零写:不复活、不覆盖、不改 createdAt,报告留痕供运维理解为何未灌回
                    rep.note("已删除的同步连接不再回灌:" + e.name);
                    continue;
                }
                RemoteClusterConn existing = connStore.get(id);
                Map<String, Object> view = syncDomain.get(id);
                if (existing == null) {
                    int hit = -1;
                    for (int i = 0; i < manualNodeSets.size(); i++) {
                        if (intersects(manualNodeSets.get(i), e.nodes)) {
                            hit = i;
                            break;
                        }
                    }
                    if (hit >= 0) {
                        rep.skippedConflicts(1).note("与手工连接「" + manualMeta.get(hit)[1]
                                + "」同集群,手工优先跳过:" + e.name);
                        continue;
                    }
                }
                if (existing != null && view != null && sameFingerprint(existing, view, e)) {
                    rep.unchanged(1);
                    if (isStale(view)) {
                        connStore.markSyncState(id, null);
                        rep.restored(1).note("失联恢复(档案无变化):" + e.name);
                    }
                    continue;
                }
                String minRole = blank(e.minRole) ? defaultMinRole : e.minRole;
                connStore.save(id, e.name, e.url, e.username, e.password, minRole, null, null, e.env, e.authType);
                if (router != null) {
                    router.evict(id); // 档案变更:关旧长连接,下次使用重建(与 controller.save 同款)
                }
                if (prober != null) {
                    try {
                        prober.probeOne(id); // 保存即探:状态点秒级可见
                    } catch (Exception pe) {
                        LOG.debug("[ConnSync] probeOne failed id={}: {}", id, pe.getMessage(), pe);
                    }
                }
                if (existing == null) {
                    rep.created(1);
                } else {
                    rep.updated(1);
                    if (view != null && isStale(view)) {
                        connStore.markSyncState(id, null);
                        rep.restored(1);
                    }
                }
            } catch (Exception ex) {
                rep.errors(1).note("同步失败 " + e.name + ": " + ex.getMessage());
            }
        }

        // E. STALE 扫描:同步域内不在 contributed 的 → 标记保留(裁决:不自动删);软删墓碑零写
        for (Map.Entry<String, Map<String, Object>> en : syncDomain.entrySet()) {
            if (presentIds.contains(en.getKey())) {
                continue;
            }
            if (isStale(en.getValue())
                    || isDismissed(strOrNull(en.getValue().get("syncState")))) {
                continue; // 已标记/软删墓碑,零写
            }
            try {
                connStore.markSyncState(en.getKey(), STATE_STALE);
                rep.markedStale(1).note("源已失联,标记 STALE 保留:"
                        + (en.getValue().get("name") == null ? en.getKey() : en.getValue().get("name")));
            } catch (Exception ex) {
                rep.errors(1).note("标记失联失败 " + en.getKey() + ": " + ex.getMessage());
            }
        }
        return finish(rep, start);
    }

    private ClusterConnSyncReport finish(ClusterConnSyncReport.Builder rep, long start) {
        rep.durationMs(System.currentTimeMillis() - start);
        ClusterConnSyncReport r = rep.build();
        this.lastReport = r;
        LOG.info("[ConnSync] round done trigger={} total={} created={} updated={} unchanged={} "
                        + "dup={} conflicts={} skipped={} stale={} restored={} errors={}",
                r.getTrigger(), r.getContributedTotal(), r.getCreated(), r.getUpdated(), r.getUnchanged(),
                r.getDuplicatesMerged(), r.getSkippedConflicts(), r.getSkipped(),
                r.getMarkedStale(), r.getRestored(), r.getErrors());
        return r;
    }

    // ----------------------------------------------------------------------------------
    // helpers

    /**
     * 指纹全同判定:比对口径用「生效 minRole」(条目未显式给时 = defaultMinRole)——
     * 存档视图里落的就是生效值,拿 null 比会永远不等,指纹免刷失效(每轮空 save)。
     */
    private boolean sameFingerprint(RemoteClusterConn existing, Map<String, Object> view, Entry e) {
        String storedNode = normalizeNode(existing.getScheme() + "://" + existing.getHost() + ":"
                + existing.getPort());
        boolean urlSame = e.url != null && e.url.equalsIgnoreCase(storedNode);
        String effectiveMinRole = blank(e.minRole) ? defaultMinRole : e.minRole;
        return urlSame
                && Objects.equals(e.name, strOrNull(view.get("name")))
                && Objects.equals(trimToNull(e.username), trimToNull(existing.getUsername()))
                && Objects.equals(e.password, existing.getPassword())
                && Objects.equals(e.env, normEnv(view.get("env")))
                && Objects.equals(effectiveMinRole.toUpperCase(Locale.ROOT), normEnv(view.get("minRole")));
    }

    private static String normEnv(Object v) {
        String s = strOrNull(v);
        return s == null || s.trim().isEmpty() ? null : s.trim().toUpperCase(Locale.ROOT);
    }

    private static boolean isStale(Map<String, Object> view) {
        return view.get("syncState") != null
                && "STALE".equalsIgnoreCase(String.valueOf(view.get("syncState")));
    }

    /** 同步档案软删墓碑判定(人工删除后不再回灌)。 */
    private static boolean isDismissed(String syncState) {
        return ConnStore.STATE_DISMISSED.equalsIgnoreCase(syncState);
    }

    private static boolean intersects(Set<String> a, Set<String> b) {
        for (String n : a) {
            if (b.contains(n)) {
                return true;
            }
        }
        return false;
    }

    private static String safeName(ContributedEsCluster c) {
        return c.getName() + "(" + c.getSourceId() + ")";
    }

    private static boolean blank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String trimToNull(String s) {
        return blank(s) ? null : s.trim();
    }

    private static String strOrNull(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
