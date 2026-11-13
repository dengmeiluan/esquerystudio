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
import java.util.Map;

/**
 * 多集群监控历史端点（20260922 批④前端配套）：只读查询服务端定时任务落库的
 * 连接探活快照（{@code esquerystudio_monitor-yyyy.MM.dd}）。
 *
 * <p>路径刻意挂在 {@code /internal/es/index/monitor-history}（避开 {@code /clusters/}
 * ADMIN 关键字与 {@code /cluster/} 透传白名单），并登记进 overview 页 apiPrefixes——
 * 看得见概览的角色即看得见监控历史，授权随页面走。GET 对 VIEWER 开放（纯只读观测）。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/monitor-history")
public class MonitorHistoryController {

    private final MonitorHistoryStore store;
    private final ConnStore connStore;

    public MonitorHistoryController(MonitorHistoryStore store, ConnStore connStore) {
        this.store = store;
        this.connStore = connStore;
    }

    /** 监控历史（timestamp 倒序）。线缆 {records:[...]}，与 ops-audit 同款单点组装。 */
    @GetMapping
    public Map<String, Object> history(@RequestParam(required = false) String connId,
                                       @RequestParam(required = false) String status,
                                       @RequestParam(required = false, defaultValue = "200") int size,
                                       @RequestParam(required = false, defaultValue = "0") int from,
                                       @RequestParam(required = false) Long fromMs,
                                       @RequestParam(required = false) Long toMs,
                                       HttpServletRequest request) {
        ConsolePrincipal principal = MonitorRecordVisibility.principal(request);
        ConsoleConnVisibility.Snapshot snap = ConsoleConnVisibility.snapshot(principal, connStore);
        if (connId != null && !connId.trim().isEmpty() && !snap.seesId(connId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "暂无该连接监控历史的访问权限");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", MonitorRecordVisibility.filterByIdentity(
                store.search(connId, status, size, from, fromMs, toMs), snap));
        return Collections.unmodifiableMap(out);
    }
}
