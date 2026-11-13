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

import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 连接健康探针（周期性并发 ping 全部已存连接档案，结果驻留内存供
 * 列表接口附带 health 字段——前端顶栏/连接管理页据此渲染 GREEN/RED 状态点，
 * 故障集群在切换前就能被看见，而不是切过去才报错。
 *
 * <p><b>硬超时防挂</b>：每个连接的 ping 在独立 worker 线程执行、{@code future.get(3s)}
 * 兜底——RHLC 底层超时再不可靠也拖不住调度线程（同 ControlClusterResolver.ping 的教训）。
 * 复用 {@link EsClientRouter#clientFor} 的长连接缓存，探活不产生额外临时连接；
 * 连接坏死时 router 缓存的 client 请求失败即标 RED，档案修复后指纹重建自动恢复。</p>
 *
 * <p>线程全部 daemon + {@code @PreDestroy} 关停，宿主停机不被探针拖住。</p>
 *
 * @author aicoding
 */
public class ConnHealthProber {

    private static final Logger LOG = LoggerFactory.getLogger(ConnHealthProber.class);

    /** 单次 ping 硬超时（毫秒）：探活要快进快出，3 秒不通即视为故障。 */
    private static final long PING_HARD_TIMEOUT_MS = 3_000L;

    private final ConnStore connStore;
    private final EsClientRouter router;
    private final int intervalSeconds;

    /** connId → 最近一次探活结果。 */
    private final Map<String, Map<String, Object>> healthMap = new ConcurrentHashMap<>();

    /* 整轮跳过累计（首条 WARN 节流计数，见 probeAll） */
    private final AtomicLong skipRoundCount = new AtomicLong();

    private final ScheduledExecutorService scheduler;
    private final ExecutorService workers;

    public ConnHealthProber(ConnStore connStore, EsClientRouter router, int intervalSeconds) {
        this.connStore = connStore;
        this.router = router;
        this.intervalSeconds = Math.max(10, intervalSeconds);
        ThreadFactory tf = daemonFactory("es-conn-probe");
        this.scheduler = Executors.newSingleThreadScheduledExecutor(tf);
        this.workers = Executors.newFixedThreadPool(4, daemonFactory("es-conn-probe-worker"));
    }

    /** 启动周期探活（AutoConfiguration 注册后手动调，首轮延迟 10s 让宿主先完成启动）。 */
    public void start() {
        scheduler.scheduleWithFixedDelay(() -> {
            try {
                probeAll();
            } catch (Exception e) {
                // 探活是观测面，任何异常只记日志，绝不外溢影响调度
                LOG.warn("[ConnHealthProber] probeAll failed: {}", e.getMessage(), e);
            }
        }, 10, intervalSeconds, TimeUnit.SECONDS);
        LOG.info("[ConnHealthProber] started, interval={}s", intervalSeconds);
    }

    @PreDestroy
    public void shutdown() {
        scheduler.shutdownNow();
        workers.shutdownNow();
    }

    /** 全量探活一轮：并发提交、逐个硬超时收割；顺带清理已删除连接的残留结果。 */
    public void probeAll() {
        List<Map<String, Object>> conns;
        try {
            conns = connStore.list();
        } catch (Exception e) {
            /* debug→首条 WARN 节流（AtomicLong 累计，范式=审计双店
               warnAuditDrop——探活是周期调度高频路径，逐条 WARN 会刷屏，但持续性整轮跳过
               比单次失败更该留痕，全静默时「健康面整体失明」无从察觉）。注释修正过时假设：
               list 失败与存储模式无关（控制集群 ES 未就绪/网络/权限等皆可），原「仅 NONE
               模式」的说法不成立。跳整轮保持 UNKNOWN 语义不变 */
            long skips = skipRoundCount.incrementAndGet();
            if (skips == 1) {
                LOG.warn("[ConnHealthProber] skip round, connStore unavailable（首次，后续失败仅累计不再打）: {}",
                        e.getMessage(), e);
            }
            return;
        }
        List<String> aliveIds = new ArrayList<>();
        List<Object[]> pending = new ArrayList<>();
        for (Map<String, Object> c : conns) {
            String id = String.valueOf(c.get("id"));
            aliveIds.add(id);
            pending.add(new Object[]{id, workers.submit(() -> pingOnce(id))});
        }
        for (Object[] p : pending) {
            String id = (String) p[0];
            @SuppressWarnings("unchecked")
            Future<Map<String, Object>> f = (Future<Map<String, Object>>) p[1];
            try {
                healthMap.put(id, f.get(PING_HARD_TIMEOUT_MS, TimeUnit.MILLISECONDS));
            } catch (TimeoutException e) {
                f.cancel(true);
                healthMap.put(id, red("探活超时(" + PING_HARD_TIMEOUT_MS + "ms)"));
            } catch (Exception e) {
                healthMap.put(id, red(rootMessage(e)));
            }
        }
        healthMap.keySet().retainAll(aliveIds); // 档案已删的连接不留幽灵状态
    }

    /** 手动即时探活单个连接（列表「立即探活」按钮），同样硬超时。 */
    public Map<String, Object> probeOne(String connId) {
        Future<Map<String, Object>> f = workers.submit(() -> pingOnce(connId));
        Map<String, Object> h;
        try {
            h = f.get(PING_HARD_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            f.cancel(true);
            h = red("探活超时(" + PING_HARD_TIMEOUT_MS + "ms)");
        } catch (Exception e) {
            h = red(rootMessage(e));
        }
        healthMap.put(connId, h);
        return h;
    }

    /** 最近一次探活结果；从未探过返回 UNKNOWN。 */
    public Map<String, Object> health(String connId) {
        Map<String, Object> h = healthMap.get(connId);
        if (h != null) {
            return h;
        }
        Map<String, Object> unknown = new LinkedHashMap<>();
        unknown.put("status", "UNKNOWN");
        unknown.put("latencyMs", null);
        unknown.put("lastProbeAt", null);
        unknown.put("error", null);
        return unknown;
    }

    /** worker 线程内的真实 ping：GET / 测连通与时延，顺带解析服务端版本回写档案（。 */
    private Map<String, Object> pingOnce(String connId) {
        long t0 = System.currentTimeMillis();
        try {
            Response resp = router.clientFor(connId).getLowLevelClient().performRequest(new Request("GET", "/"));
            String version = parseVersion(resp);
            if (version != null) {
                connStore.updateVersion(connId, version); // 内部已同值短路 + 失败静默
            }
            Map<String, Object> h = new LinkedHashMap<>();
            h.put("status", "GREEN");
            h.put("latencyMs", System.currentTimeMillis() - t0);
            h.put("lastProbeAt", System.currentTimeMillis());
            h.put("error", null);
            h.put("version", version);
            return h;
        } catch (Exception e) {
            return red(rootMessage(e));
        }
    }

    /** 从 GET / 响应里提 version.number；任何解析异常返回 null（版本是增强信息，不影响探活）。 */
    private static String parseVersion(Response resp) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> info = new com.fasterxml.jackson.databind.ObjectMapper().readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            Object ver = info.get("version");
            Object num = ver instanceof Map ? ((Map<?, ?>) ver).get("number") : null;
            return num == null ? null : String.valueOf(num);
        } catch (Exception e) {
            return null;
        }
    }

    private static Map<String, Object> red(String error) {
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("status", "RED");
        h.put("latencyMs", null);
        h.put("lastProbeAt", System.currentTimeMillis());
        /* 断链根因统一拓扑脱敏（992 口径单源）：连接失败消息内嵌的 URL/节点坐标
           不随 health 字段/monitor 落档外发。 */
        h.put("error", io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper.sanitizeTopology(error));
        return h;
    }

    private static String rootMessage(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
    }

    private static ThreadFactory daemonFactory(String prefix) {
        AtomicInteger seq = new AtomicInteger();
        return r -> {
            Thread t = new Thread(r, prefix + "-" + seq.incrementAndGet());
            t.setDaemon(true);
            return t;
        };
    }
}
