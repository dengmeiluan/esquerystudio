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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleConnVisibility;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 多集群指标端点（指标时序批）：只读查询服务端定时任务落库的 cluster/node 指标时序
 * （{@code esquerystudio_monitor-yyyy.MM.dd} 里 kind=metrics 的 doc），供概览页图表。
 *
 * <p>路径刻意挂在 {@code /internal/es/index/monitor-metrics}（与 monitor-history 同族，
 * 避开 {@code /clusters/} ADMIN 关键字与 {@code /cluster/} 透传白名单），并登记进
 * overview 页 apiPrefixes——看得见概览的角色即看得见指标，授权随页面走。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/monitor-metrics")
public class MonitorMetricsController {

    private final MonitorMetricsStore store;
    private final ConnStore connStore;

    public MonitorMetricsController(MonitorMetricsStore store, ConnStore connStore) {
        this.store = store;
        this.connStore = connStore;
    }

    /** interval 桶宽合法性（缺省不聚合走原始 doc；给了必须形如 60s/10m/1h/1d）。 */
    private static final String INTERVAL_PATTERN = "\\d+[smhd]";

    /**  聚合方式合法性（仅 avg|max；非法抛异常回前端，不静默当 avg 用）。
     *  637 三值同返后，{@code agg} 仅决定标量别名 {@code <field>} 取哪个值；
     *  每字段另平铺 {@code <field>Avg/Max/Min} 三键，故校验面不变（仍仅 avg|max）。 */
    private static final String AGG_PATTERN = "avg|max";

    /**
     * 指标时序（timestamp 升序）。线缆 {records:[...]}，与 monitor-history 同款单点组装。
     *
     * <p>{@code interval} 缺省 → 原始 doc 查询（老前端零改动）；给了合法 interval →
     * 服务端 date_histogram 聚合（7d 长窗不截断，见 {@link MonitorMetricsStore#searchAgg}）；
     * 给了非法 interval → 抛异常（错误回给前端），不静默当缺省用。
     * {@code agg} 聚合方式（avg 缺省|max）仅聚合模式生效；637 三值同返后它只决定标量别名
     * {@code <field>} 的取值，每字段同时平铺 {@code <field>Avg/Max/Min}（前端逐卡零请求切换）。</p>
     */
    @GetMapping
    public Map<String, Object> metrics(@RequestParam(required = false) String connId,
                                       @RequestParam(required = false) String connName,
                                       @RequestParam(required = false, defaultValue = "cluster") String scope,
                                       @RequestParam(required = false, defaultValue = "2000") int size,
                                       @RequestParam(required = false, defaultValue = "0") int from,
                                       @RequestParam(required = false) Long fromMs,
                                       @RequestParam(required = false) Long toMs,
                                       @RequestParam(required = false) String interval,
                                       @RequestParam(required = false, defaultValue = "avg") String agg,
                                       HttpServletRequest request) {
        ConsolePrincipal principal = MonitorRecordVisibility.principal(request);
        ConsoleConnVisibility.Snapshot snap = ConsoleConnVisibility.snapshot(principal, connStore);
        if (connId != null && !connId.trim().isEmpty() && !snap.seesId(connId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "暂无该连接监控数据的访问权限");
        }
        if (connName != null && !connName.trim().isEmpty()
                && !ConsoleConnVisibility.canSeeName(snap, principal, connName)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "暂无该集群监控数据的访问权限");
        }
        boolean hasFilter = (connId != null && !connId.trim().isEmpty())
                || (connName != null && !connName.trim().isEmpty());
        /* 节点聚合桶只含 nodeName，无法逐行判定归属：未覆盖全部连接时必须显式指定集群。
           静态页/内置角色即使非 ADMIN 也可能覆盖目录内全部连接（seesAllKnown），
           不能只因 visibleIds 非空就 403——那会把有权限的人挡在默认视图外。 */
        if (!snap.seesAllKnown() && !hasFilter && "node".equals(scope)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "节点视图需先选择已授权的集群");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> records;
        if (interval == null || interval.isEmpty()) {
            /* 缺省不聚合：原始 doc 形态，前端零改动兼容 */
            records = store.search(connId, connName, scope, size, from, fromMs, toMs);
        } else {
            if (!interval.matches(INTERVAL_PATTERN)) {
                throw new IllegalStateException("非法 interval（须形如 60s/10m/1h/1d）: " + interval);
            }
            if (!agg.matches(AGG_PATTERN)) {
                throw new IllegalStateException("非法 agg（仅 avg|max）: " + agg);
            }
            records = store.searchAgg(connId, connName, scope, fromMs, toMs, interval, agg);
        }
        /* 节点桶只含 nodeName：显式过滤已由查询侧收口；全量可见用户也无需逐行判定。
           其余行按 connId/connName 再验一次。 */
        boolean alreadyScopedNode = "node".equals(scope) && (hasFilter || snap.seesAllKnown());
        out.put("records", alreadyScopedNode ? records
                : MonitorRecordVisibility.filterByIdentity(records, snap));
        return Collections.unmodifiableMap(out);
    }

    /**
     *  最新 Top 索引快照（对标阿里云 Grafana Index 索引行）：取带 topIndexes 的最新
     * cluster doc，返回 {index,qps,idxRate,storeMb,latencyMs}×≤limit；无快照（首次采集/
     * 索引全静）回空数组。limit 缺省 8（兼容旧前端），上限 20=快照层截断宽度。
     */
    @GetMapping("top-indexes")
    public Map<String, Object> topIndexes(@RequestParam(required = false) String connName,
                                          @RequestParam(required = false, defaultValue = "8") Integer limit,
                                          HttpServletRequest request) {
        ConsolePrincipal principal = MonitorRecordVisibility.principal(request);
        ConsoleConnVisibility.Snapshot snap = ConsoleConnVisibility.snapshot(principal, connStore);
        boolean hasName = connName != null && !connName.trim().isEmpty();
        if (!snap.seesAllKnown() && !hasName) {
            /* Top 快照行不带集群标识：未覆盖全部连接时必须按已授权集群逐次查询 */
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Top 索引需先选择已授权的集群");
        }
        if (hasName && !ConsoleConnVisibility.canSeeName(snap, principal, connName)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "暂无该集群 Top 索引的访问权限");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", store.searchTopIndexes(connName,
                Math.max(1, Math.min(limit == null ? 8 : limit, 20))));
        return Collections.unmodifiableMap(out);
    }
}
