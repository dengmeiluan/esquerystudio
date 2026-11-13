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

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Collections;
import java.util.Map;

/**
 * 环形治理用量端点（20260923 R6）：只读返回审计+监控两个日期索引族的 store.size
 * 合计与分族占用、总量上限——治理透明化（30GB 口径看得见，不再是黑盒承诺）。
 *
 * <p>VIEWER 只读；overview 页 apiPrefixes 覆盖（同 monitor-metrics）。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/ring-usage")
public class RingUsageController {

    private final MonitorMetricsStore store;
    private final String auditPrefix;
    private final long capBytes;

    public RingUsageController(MonitorMetricsStore store, String auditPrefix, long capBytes) {
        this.store = store;
        this.auditPrefix = auditPrefix;
        this.capBytes = capBytes;
    }

    @GetMapping
    public Map<String, Object> usage(javax.servlet.http.HttpServletRequest request) {
        Map<String, Object> out = new java.util.LinkedHashMap<>(store.usage(auditPrefix, capBytes));
        /* 控制面索引前缀只对 ADMIN 可见：概览页读者只需要占用数值，不需要知道审计/监控索引名。 */
        Object p = request == null ? null
                : request.getAttribute(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (p instanceof io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal
                && !((io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal) p).getRole()
                    .atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN)) {
            out.remove("auditPrefix");
            out.remove("monitorPrefix");
        }
        return Collections.unmodifiableMap(out);
    }
}
