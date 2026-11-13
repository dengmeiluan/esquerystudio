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

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 宿主角色 → 控制台角色映射（ 配置式鉴权配套）。
 *
 * <p>配置形如 {@code role-mapping.ADMIN=admin,superuser}（console 角色 → 宿主角色逗号串），
 * 构造时倒排成「宿主角色(小写) → ConsoleRole」查找表；{@link #map} 对用户的全部宿主角色
 * 取命中的最高档（ADMIN &gt; OPERATOR &gt; VIEWER），<b>一个都未命中一律回落 VIEWER</b>
 * （宁降不升——配置漏了某个宿主角色时最多只读，不会意外放权）。</p>
 *
 * @author aicoding
 */
public class HostRoleMapper {

    /** 宿主角色(小写) → console 角色。 */
    private final Map<String, ConsoleRole> inverted = new LinkedHashMap<>();

    public HostRoleMapper(Map<String, String> roleMapping) {
        if (roleMapping == null) {
            return;
        }
        for (Map.Entry<String, String> e : roleMapping.entrySet()) {
            ConsoleRole consoleRole = ConsoleRole.parse(e.getKey());
            String hostRoles = e.getValue();
            if (hostRoles == null) {
                continue;
            }
            for (String hostRole : hostRoles.split(",")) {
                String key = hostRole.trim().toLowerCase(Locale.ROOT);
                if (key.isEmpty()) {
                    continue;
                }
                // 同一宿主角色被映射到多个 console 角色时保留高档（配置冲突从宽解释为高配）
                ConsoleRole prev = inverted.get(key);
                if (prev == null || consoleRole.atLeast(prev)) {
                    inverted.put(key, consoleRole);
                }
            }
        }
    }

    /** 对用户的全部宿主角色取命中最高档；未命中/空集合 → VIEWER。 */
    public ConsoleRole map(Collection<String> hostRoles) {
        ConsoleRole best = ConsoleRole.VIEWER;
        if (hostRoles == null) {
            return best;
        }
        for (String hostRole : hostRoles) {
            if (hostRole == null) {
                continue;
            }
            ConsoleRole hit = inverted.get(hostRole.trim().toLowerCase(Locale.ROOT));
            if (hit != null && hit.atLeast(best)) {
                best = hit;
            }
        }
        return best;
    }
}
