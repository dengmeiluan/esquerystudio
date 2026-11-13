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

package io.github.dengmeiluan.esquerystudio.console.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 审计下拉值建议端点（ terms agg）：返回审计索引族里真实出现过的动作/集群值与计数，
 * 供安全中心审计筛选下拉做「值建议」（数据里没有的值不出现在下拉里）。
 *
 * <p>审计值建议会暴露全量用户名/URI，属于审计域数据：rank3 专项（REBUILD_OP/CLUSTER_OP/
 * AUDIT_OP）或 ADMIN 才可读；VIEWER 返回 403。失败/空档回空建议，前端回落硬编码词表，绝不反噬。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/auth/audit-facets")
public class AuditFacetsController {

    private static final String FORBIDDEN_MESSAGE = "审计值建议需 rank3 专项或 ADMIN 角色";

    private final AuditFacetsStore store;

    public AuditFacetsController(AuditFacetsStore store) {
        this.store = store;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> facets(HttpServletRequest request) {
        Object attr = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        if (!(attr instanceof ConsolePrincipal)
                || !((ConsolePrincipal) attr).getRole().atLeast(ConsoleRole.REBUILD_OP)) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("code", "FORBIDDEN");
            body.put("message", FORBIDDEN_MESSAGE);
            body.put("required", ConsoleRole.REBUILD_OP.name());
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
        }
        ConsolePrincipal p = (ConsolePrincipal) attr;
        java.util.Set<String> gp = p.getGrantedPages();
        /* 值建议是跨全部连接的聚合（用户/URI/集群），连接维度 security 读键不能拿到
           其它连接与宿主的目录值。非全局授权回空建议，前端回落硬编码词表即可。 */
        /* 空授权集同样不得读跨连接聚合值：此前 !gp.isEmpty() 让零页面用户拿到全量建议。 */
        if (gp != null
                && !gp.contains("security") && !p.getRole().atLeast(ConsoleRole.ADMIN)) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("actions", Collections.emptyList());
            empty.put("conns", Collections.emptyList());
            empty.put("users", Collections.emptyList());
            empty.put("uris", Collections.emptyList());
            return ResponseEntity.ok(empty);
        }
        return ResponseEntity.ok(Collections.unmodifiableMap(store.facets()));
    }
}
