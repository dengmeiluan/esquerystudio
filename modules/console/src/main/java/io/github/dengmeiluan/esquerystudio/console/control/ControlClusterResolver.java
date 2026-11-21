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

package io.github.dengmeiluan.esquerystudio.console.control;

import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.RequestOptions;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.ElasticsearchRestTemplate;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 控制集群解析器（控制面（登录用户/连接档案/审计/作业/锁）到底存到哪台 ES。
 *
 * <p>解析优先级（controlMode=auto）：</p>
 * <ol>
 *   <li><b>BOOTSTRAP</b>——本地自举档案存在 → 用档案连接（宿主无 ES 的 宿主形态）；</li>
 *   <li><b>SPRING</b>——探测宿主 spring ES（3 秒超时）可达 → 沿用现状（basic 形态，零回归）；</li>
 *   <li><b>NONE</b>——都不可用 → 控制面接口统一 409 SETUP_REQUIRED，前端弹首连向导。</li>
 * </ol>
 *
 * <p>controlMode=spring 时跳过档案与探测恒为 SPRING（宿主显式钉死，向导永不出现）。</p>
 *
 * <p><b>防劫持语义</b>：一旦绑定（SPRING/BOOTSTRAP），控制集群不可达只报 503，
 * <b>绝不回落 NONE</b>——否则攻击者可通过打挂控制集群骗出 setup 向导重绑到自己的集群。
 * NONE 仅在「从未绑定」时存在，且会 10 秒节流惰性重探 spring ES 自愈（宿主 ES 迟到场景）。</p>
 *
 * @author aicoding
 */
public class ControlClusterResolver {

    private static final Logger LOG = LoggerFactory.getLogger(ControlClusterResolver.class);

    private static final long SPRING_PROBE_TIMEOUT_MS = 3_000L;
    private static final long NONE_REPROBE_INTERVAL_MS = 10_000L;

    /** 控制集群来源。 */
    public enum Mode { SPRING, BOOTSTRAP, NONE }

    private final RestHighLevelClient springClient;
    private final ElasticsearchOperations springOps;
    private final BootstrapHomeStore homeStore;
    private final RemoteEsClientFactory clientFactory;
    private final ControlIndexInitializer indexInitializer;
    private final String controlMode;

    private final AtomicReference<RestHighLevelClient> control = new AtomicReference<>();
    private final AtomicReference<ElasticsearchOperations> ops = new AtomicReference<>();
    private volatile Mode mode = Mode.NONE;
    /** 脱敏 endpoint（scheme://host:port）；SPRING 模式为 "(spring)"。 */
    private volatile String endpoint = "";
    private volatile long lastSpringProbeAt = 0L;
    /** ping 失败首条 WARN 节流计数（三态见 warnPingFailureThrottled）。 */
    private final AtomicLong pingFailCount = new AtomicLong();

    public ControlClusterResolver(RestHighLevelClient springClient, ElasticsearchOperations springOps,
                                  BootstrapHomeStore homeStore, RemoteEsClientFactory clientFactory,
                                  ControlIndexInitializer indexInitializer, String controlMode) {
        this.springClient = springClient;
        this.springOps = springOps;
        this.homeStore = homeStore;
        this.clientFactory = clientFactory;
        this.indexInitializer = indexInitializer;
        this.controlMode = controlMode == null ? "auto" : controlMode;
    }

    /** 启动期解析（AutoConfiguration 里调一次）。除 controlMode=spring 但宿主无 ES 的配置错误外
     * 不抛异常——NONE 也允许启动，等向导。 */
    public synchronized void init() {
        if ("spring".equals(controlMode)) {
            adoptSpring();
            LOG.info("[ControlClusterResolver] control-mode=spring 钉死宿主 ES 为控制集群");
            return;
        }
        RemoteClusterConn home = homeStore.load();
        if (home != null) {
            RestHighLevelClient client = null;
            try {
                client = clientFactory.build(home);
                boolean reachable = ping(client, SPRING_PROBE_TIMEOUT_MS);
                control.set(client);
                ops.set(new ElasticsearchRestTemplate(client));
                endpoint = home.endpoint();
                mode = Mode.BOOTSTRAP;
                LOG.info("[ControlClusterResolver] BOOTSTRAP 模式：自举档案 -> {}（当前{}可达）",
                        endpoint, reachable ? "" : "不");
                return;
            } catch (Exception e) {
                // 档案在但建连失败：保持 BOOTSTRAP 语义交由 503 报错，绝不回落 SETUP
                // ERROR 末参补 e（堆栈是 ERROR 级的本分，只有 getMessage 无从定位
                // 根因）+ 文案补脱敏 endpoint（哪台集群连不上一眼可辨）
                LOG.error("[ControlClusterResolver] 自举档案建连失败 endpoint={}（保持绑定语义，等待集群恢复）: {}",
                        home.endpoint(), e.getMessage(), e);
                // 已移交控制面持有（control.set 成功）则不关；未移交才就地回收
                if (client != null && control.get() != client) {
                    closeQuietly(client);
                }
            }
        }
        if (probeSpring()) {
            adoptSpring();
            LOG.info("[ControlClusterResolver] SPRING 模式：宿主 ES 可达，控制面沿用现状");
            return;
        }
        mode = Mode.NONE;
        LOG.warn("[ControlClusterResolver] NONE 模式：无自举档案且宿主 ES 不可达，等待 Setup 首连向导绑定控制集群");
    }

    /** 是否已绑定控制集群（NONE 时惰性重探 spring 自愈）。 */
    public boolean bound() {
        if (mode != Mode.NONE) {
            return true;
        }
        lazyReprobeSpring();
        return mode != Mode.NONE;
    }

    public Mode mode() {
        return mode;
    }

    public String endpoint() {
        return endpoint;
    }

    /** 控制面当前应使用的 client。 */
    public RestHighLevelClient client() {
        if (!bound()) {
            throw new SetupRequiredException();
        }
        return control.get();
    }

    /** 控制面当前应使用的 ElasticsearchOperations（spring-data 存储用）。 */
    public ElasticsearchOperations operations() {
        if (!bound()) {
            throw new SetupRequiredException();
        }
        return ops.get();
    }

    /**
     * 绑定/重绑控制集群（Setup apply 与 rebind 共用）：建连 → 探活 → 幂等初始化控制索引 →
     * 写自举档案 → 原子切换。任一步失败关掉新建 client 不留痕，当前绑定不受影响。
     */
    public synchronized void bindBootstrap(RemoteClusterConn conn) {
        conn.validate();
        RestHighLevelClient candidate = clientFactory.build(conn);
        try {
            if (!ping(candidate, SPRING_PROBE_TIMEOUT_MS)) {
                throw new IllegalArgumentException("控制集群探活失败: " + conn.endpoint());
            }
            indexInitializer.ensureAll(candidate);
            homeStore.save(conn);
        } catch (Exception e) {
            closeQuietly(candidate);
            throw e instanceof RuntimeException ? (RuntimeException) e
                    : new IllegalStateException(e.getMessage(), e);
        }
        RestHighLevelClient old = mode == Mode.BOOTSTRAP ? control.get() : null;
        control.set(candidate);
        ops.set(new ElasticsearchRestTemplate(candidate));
        endpoint = conn.endpoint();
        mode = Mode.BOOTSTRAP;
        closeQuietly(old);
        LOG.info("[ControlClusterResolver] 控制集群已绑定（BOOTSTRAP）: {}", endpoint);
    }

    // ---------------- internal ----------------

    private void adoptSpring() {
        // 宿主可能零 ES 依赖（springClient=null）——probeSpring 已短路，能走到这里只剩
        // controlMode=spring 显式钉死一种可能，属配置错误，快速失败给出明确指引
        if (springClient == null) {
            throw new IllegalStateException("controlMode=spring 需要宿主装配 ES（RestHighLevelClient Bean），"
                    + "当前宿主未装配；请改用 esquerystudio.elasticsearch.console.control-mode=auto 并走 Setup 首连向导绑定控制集群");
        }
        control.set(springClient);
        // 宿主只提供 RHLC、未装 spring-data ops 的形态：用 RHLC 自建 template 兼容
        ops.set(springOps != null ? springOps : new ElasticsearchRestTemplate(springClient));
        endpoint = "(spring)";
        mode = Mode.SPRING;
    }

    /** NONE 时 10s 节流重探宿主 ES：basic「应用先起、ES 后到」场景自动升 SPRING。 */
    private void lazyReprobeSpring() {
        long now = System.currentTimeMillis();
        if (now - lastSpringProbeAt < NONE_REPROBE_INTERVAL_MS) {
            return;
        }
        synchronized (this) {
            if (mode != Mode.NONE || now - lastSpringProbeAt < NONE_REPROBE_INTERVAL_MS) {
                return;
            }
            lastSpringProbeAt = now;
            if (probeSpring()) {
                adoptSpring();
                LOG.info("[ControlClusterResolver] 宿主 ES 恢复可达，自动切换 SPRING 模式");
            }
        }
    }

    private boolean probeSpring() {
        lastSpringProbeAt = System.currentTimeMillis();
        return springClient != null && ping(springClient, SPRING_PROBE_TIMEOUT_MS);
    }

    /** 带硬超时的探活（RHLC 自身超时可能远大于期望，独立线程包一层）。 */
    private boolean ping(RestHighLevelClient client, long timeoutMs) {
        ExecutorService es = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "esquerystudio-control-probe");
            t.setDaemon(true);
            return t;
        });
        try {
            Future<Boolean> f = es.submit(() -> client.ping(RequestOptions.DEFAULT));
            boolean ok = Boolean.TRUE.equals(f.get(timeoutMs, TimeUnit.MILLISECONDS));
            if (ok) {
                rearmPingWarn(); // ：恢复成功重臂（下次失败再 WARN）
            }
            return ok;
        } catch (Exception e) {
            // 原整段静默——控制面降级 NONE 时用户只见 409 SETUP_REQUIRED，
            // 根因零痕无从排查。首败节流 WARN（三态：首败 WARN/连败仅累计/恢复重臂，
            // 范式= ConnHealthProber.skipRoundCount）。返回 false 契约不变
            warnPingFailureThrottled(e);
            return false;
        } finally {
            es.shutdownNow();
        }
    }

    // ---------------- 探活失败 WARN 节流（包内可见便于单测） ----------------

    /**
     * 探活失败节流 WARN（三态：首败 WARN／连败仅累计静默／恢复成功重臂——与 
     * ConnHealthProber.skipRoundCount 语义对齐）：探活是高频路径（NONE 10s 惰性重探 +
     * 绑定/启动探活），逐条 WARN 会刷屏，但全静默时「控制面为何降级 NONE」无从排查。
     * ping 在 probe 线程与调用线程两处触发，{@code incrementAndGet} 原子性保证只有
     * 见到 1 的那个线程落 WARN。
     */
    void warnPingFailureThrottled(Exception e) {
        long n = pingFailCount.incrementAndGet();
        if (n == 1) {
            LOG.warn("[ControlClusterResolver] 控制集群探活失败(第 {} 次)（首次，后续连续失败仅累计不再打，恢复成功后重臂）: {}（控制面维持 NONE 降级）",
                    n, rootMessage(e));
        }
    }

    /** 探活成功重臂：失败计数归零，下次失败再 WARN（见 ping 成功路径）。 */
    void rearmPingWarn() {
        pingFailCount.set(0);
    }

    /** 取最深根因消息（ExecutionException 等包装异常剥壳），null 消息回退类名。 */
    private static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
    }

    private static void closeQuietly(RestHighLevelClient client) {
        if (client == null) {
            return;
        }
        try {
            client.close();
        } catch (Exception e) {
            LOG.warn("[ControlClusterResolver] close old control client failed: {}", e.getMessage(), e);
        }
    }
}
