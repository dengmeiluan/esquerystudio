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
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 多集群 client 路由器（控制台的「当前目标集群」上下文。
 *
 * <p>三件事：</p>
 * <ol>
 *   <li><b>ThreadLocal 目标绑定</b>——{@link EsTargetInterceptor} 在请求进入时按
 *       {@code X-Es-Target} 头 {@link #bind}，请求结束 {@link #clear}；</li>
 *   <li><b>长连接缓存</b>——connId → {@link RestHighLevelClient}，同一连接反复切换不重建；
 *       连接档案更新/删除时 {@link #evict} 关旧建新；</li>
 *   <li><b>控制集群兜底</b>——无目标头/头值为 {@code host} 时返回控制集群 client（ 经
 *       Supplier 懒解析，兼容 Setup 后才绑定的自举形态），行为与单集群时代完全一致。</li>
 * </ol>
 *
 * <p>控制面（登录用户、审计、重建作业、锁）持有各自的控制集群 Supplier，<b>不经本路由</b>，
 * 天然锁定控制集群；只有 {@link io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin} 的数据面操作跟随目标。</p>
 *
 * @author aicoding
 */
public class EsClientRouter {

    private static final Logger LOG = LoggerFactory.getLogger(EsClientRouter.class);

    /** 目标头/前端约定的宿主（控制集群）标识。 */
    public static final String HOST = "host";

    private static final ThreadLocal<String> TARGET = new ThreadLocal<>();

    private final java.util.function.Supplier<RestHighLevelClient> controlClient;
    private final ConnStore connStore;
    private final RemoteEsClientFactory clientFactory;
    /** connId → 长连接 client（懒建）。 */
    private final Map<String, RestHighLevelClient> cache = new ConcurrentHashMap<>();
    /** connId → 建连时的档案指纹（档案变更即失效重建）。 */
    private final Map<String, Integer> fingerprints = new ConcurrentHashMap<>();
    /** -67 宿主版本探测器（setter 可选注入）：宿主无连接档案，版本只能主动探。 */
    private volatile HostEsVersionProvider hostVersionProvider;

    public EsClientRouter(java.util.function.Supplier<RestHighLevelClient> controlClient, ConnStore connStore,
                          RemoteEsClientFactory clientFactory) {
        this.controlClient = controlClient;
        this.connStore = connStore;
        this.clientFactory = clientFactory;
    }

    /** 注入宿主版本探测器（-67）；不注入则宿主版本恒未知（退化为修复前行为的「诚实版」）。 */
    public void setHostVersionProvider(HostEsVersionProvider hostVersionProvider) {
        this.hostVersionProvider = hostVersionProvider;
    }

    /** 把当前线程的目标集群绑定为 connId（null/空/host = 宿主）。 */
    public void bind(String connId) {
        if (connId == null || connId.trim().isEmpty() || HOST.equalsIgnoreCase(connId.trim())) {
            TARGET.remove();
        } else {
            TARGET.set(connId.trim());
        }
    }

    /** 请求结束清理（拦截器 afterCompletion 调）。 */
    public void clear() {
        TARGET.remove();
    }

    /**
     * 目标作用域（target-aware adhoc 轮）：在<b>任意线程</b>（含异步 worker）上绑定目标，
     * close 时恢复进入前的绑定状态（嵌套安全）。用 try-with-resources 包住整段目标相关执行，
     * 保证异常路径也不残留绑定。不校验 conn 存在性——fail-closed 发生在 {@link #current()}
     * 经 {@link #clientFor} 抛 {@link IllegalArgumentException}，本方法不得吞掉或回落 host。
     */
    public TargetScope openScope(String connId) {
        final String previous = TARGET.get();
        bind(connId);
        return () -> {
            if (previous == null) {
                TARGET.remove();
            } else {
                TARGET.set(previous);
            }
        };
    }

    /** {@link #openScope} 返回的可关闭作用域；close 幂等语义由实现保证（重复 close 只是重复恢复）。 */
    public interface TargetScope extends AutoCloseable {
        @Override
        void close();
    }

    /**
     * 当前线程的捕获目标；未绑定返回 {@link #HOST}（宿主/控制集群）。
     * 供 job 创建时快照目标标识，异步线程再经 {@link #openScope} 恢复。
     */
    public String requireCapturedTarget() {
        String connId = TARGET.get();
        return connId == null ? HOST : connId;
    }


    /** 当前线程绑定的 connId；宿主返回 null。 */
    public String currentTarget() {
        return TARGET.get();
    }

    /**
     * /-67：当前目标集群的服务端版本。
     *
     * <p>有目标（远程集群）→ 连接档案里探活回写的 esVersion；
     * <b>无目标（宿主/控制集群）→ {@link HostEsVersionProvider} 主动探测</b>（{@code GET /}）。</p>
     *
     * <p>-67 之前此处对宿主<b>恒返回 null</b>，而 null 被当成 7.x 默认，
     * 导致宿主为 6.x 时全部版本分叉集体走错（{@code createIndexLegacy6} 对宿主永远不可达，
     * 产线 6.7.2 宿主上 adhoc 重建构造性不可用）。</p>
     *
     * @return 版本号；<b>探不到返回 null 表示「未知」</b>，调用方须经
     *         {@link EsVersionCaps#mappingTypeMode(String)} 显式处理，<b>不得假设 7.x</b>
     */
    public String currentEsVersion() {
        String connId = TARGET.get();
        if (connId != null) {
            return connStore.getVersion(connId);
        }
        HostEsVersionProvider p = hostVersionProvider;
        return p == null ? null : p.currentVersion();
    }

    /**
     * 当前线程应使用的 client：无绑定 → 控制集群；有绑定 → 缓存/懒建长连接。
     *
     * @throws IllegalArgumentException connId 不存在（档案已删）
     */
    public RestHighLevelClient current() {
        String connId = TARGET.get();
        if (connId == null) {
            return controlClient.get();
        }
        return clientFor(connId);
    }

    /** 按 connId 取（或懒建）长连接 client。 */
    public RestHighLevelClient clientFor(String connId) {
        RemoteClusterConn conn = connStore.get(connId);
        if (conn == null) {
            throw new IllegalArgumentException("目标集群连接不存在或已删除: " + connId);
        }
        int fp = conn.hashCode();
        Integer oldFp = fingerprints.get(connId);
        if (oldFp != null && oldFp != fp) {
            evict(connId); // 档案已被编辑：关旧连接，下面重建
        }
        return cache.computeIfAbsent(connId, id -> {
            fingerprints.put(id, fp);
            LOG.info("[EsClientRouter] open client for conn={} endpoint={}", id, conn.endpoint());
            return clientFactory.build(conn);
        });
    }

    /** 关闭并移除某连接的缓存 client（档案更新/删除时调）。 */
    public void evict(String connId) {
        RestHighLevelClient old = cache.remove(connId);
        fingerprints.remove(connId);
        if (old != null) {
            try {
                old.close();
                LOG.info("[EsClientRouter] closed client for conn={}", connId);
            } catch (Exception e) {
                LOG.warn("[EsClientRouter] close client failed conn={}: {}", connId, e.getMessage(), e);
            }
        }
    }

    /** 控制集群 client（控制面兜底用）。 */
    public RestHighLevelClient host() {
        return controlClient.get();
    }
}

