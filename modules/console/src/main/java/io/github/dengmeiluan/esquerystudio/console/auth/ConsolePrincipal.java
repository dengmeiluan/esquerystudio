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

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * 控制台已认证身份（； 增身份档案位；2.5.0 增页面级授权）。
 *
 * <p>：委托身份的 username 往往是宿主内部 id（如组织哈希），顶栏/审计直显不可读——
 * 新增 {@code displayName}（人名，空=回落 username）与 {@code attributes}
 * 扩展位（org/dept/avatar 等宿主自定义属性，只透传不解释），旧构造器全部保留兼容。</p>
 *
 * @author aicoding
 */
public class ConsolePrincipal {

    private final String username;
    private final ConsoleRole role;
    /** 是否为兜底默认账号（ES 用户索引为空时的 admin/esquerystudio）。 */
    private final boolean fallback;
    /** 是否来自宿主鉴权委托（ {@link ConsoleAuthDelegate}）：凭据归宿主管，控制台不提供改密/退出。 */
    private final boolean delegated;
    /** 展示名（人读友好的姓名/昵称；空 = 前端回落 username。 */
    private final String displayName;
    /** 宿主自定义属性（org/dept/avatar 等，控制台只透传展示不参与鉴权。 */
    private final Map<String, String> attributes;
    /**
     * 页面级授权白名单（2.5.0 菜单 SPI，页面 key 集合）。三态语义：
     * <ul>
     *   <li>{@code null}：不启用页面级（内置 token 身份 / 宿主未下发 / 逃生阀关闭）——全量放行，向后兼容；</li>
     *   <li>空集：授权器一个页面都没授——页面端点全拒；</li>
     *   <li>非空：白名单，仅放行集合内页面。内置委托、自定义授权器与宿主下发同语义，
     *       拦截器/可见性/权限面板/前端菜单共用这一份白名单。</li>
     * </ul>
     */
    private final Set<String> grantedPages;

    public ConsolePrincipal(String username, ConsoleRole role, boolean fallback) {
        this(username, role, fallback, false);
    }

    public ConsolePrincipal(String username, ConsoleRole role, boolean fallback, boolean delegated) {
        this(username, role, fallback, delegated, null, null);
    }

    public ConsolePrincipal(String username, ConsoleRole role, boolean fallback, boolean delegated,
                            String displayName, Map<String, String> attributes) {
        this(username, role, fallback, delegated, displayName, attributes, null);
    }

    public ConsolePrincipal(String username, ConsoleRole role, boolean fallback, boolean delegated,
                            String displayName, Map<String, String> attributes, Set<String> grantedPages) {
        this.username = username;
        this.role = role;
        this.fallback = fallback;
        this.delegated = delegated;
        this.displayName = displayName == null || displayName.trim().isEmpty() ? null : displayName.trim();
        this.attributes = attributes == null ? Collections.emptyMap()
                : Collections.unmodifiableMap(attributes);
        // 空集必须原样保留（语义=全拒），不得折叠成 null（语义=不启用）
        this.grantedPages = grantedPages == null ? null
                : Collections.unmodifiableSet(new LinkedHashSet<>(grantedPages));
    }

    public String getUsername() { return username; }
    public ConsoleRole getRole() { return role; }
    public boolean isFallback() { return fallback; }
    public boolean isDelegated() { return delegated; }
    public String getDisplayName() { return displayName; }
    public Map<String, String> getAttributes() { return attributes; }
    public Set<String> getGrantedPages() { return grantedPages; }

    /** 顶栏/审计的首选展示名：displayName 优先，空则 username。 */
    public String preferredName() {
        return displayName != null ? displayName : username;
    }
}
