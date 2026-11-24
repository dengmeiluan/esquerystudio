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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 多集群告警端点（R7）：只读查询服务端阈值评估落库的告警/恢复事件
 * （{@code esquerystudio_monitor-yyyy.MM.dd} 里 kind=alert 的 doc），供概览页告警面板。
 *
 * <p>路径刻意挂在 {@code /internal/es/index/monitor-alerts}（与 monitor-metrics 同族，
 * 避开 {@code /clusters/} ADMIN 关键字与 {@code /cluster/} 透传白名单），并登记进
 * overview 页 apiPrefixes——看得见概览的角色即看得见告警，授权随页面走。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/monitor-alerts")
public class MonitorAlertsController {

    private final MonitorMetricsStore store;
    private final ConnStore connStore;

    public MonitorAlertsController(MonitorMetricsStore store, ConnStore connStore) {
        this.store = store;
        this.connStore = connStore;
    }

    /** 告警事件（timestamp 倒序，最新打头）。线缆 {records:[...]}，与 monitor-metrics 同款单点组装。
     *   时间窗：fromMs/toMs 供图卡事件标记与可见时间域对齐（缺省不限）。 */
    @GetMapping
    public Map<String, Object> alerts(@RequestParam(required = false, defaultValue = "50") int size,
                                      @RequestParam(required = false) Long fromMs,
                                      @RequestParam(required = false) Long toMs,
                                      HttpServletRequest request) {
        ConsolePrincipal principal = MonitorRecordVisibility.principal(request);
        ConsoleConnVisibility.Snapshot snap = ConsoleConnVisibility.snapshot(principal, connStore);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", MonitorRecordVisibility.filterByIdentity(
                store.searchAlerts(size, fromMs, toMs), snap));
        return Collections.unmodifiableMap(out);
    }
}
