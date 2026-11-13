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

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 *  P2-4 v2：连接环境页面模板（纯 grantedPages 同构方案）。
 *
 * <p>语义：连接档案的 {@code env}（PROD/STAGING/QA/DEV）映射到该环境的<b>页面 key 白名单模板</b>，
 * 与宿主 grantedPages <b>取交集</b>后作为该连接下的实际页面授权——「测试环境菜单全给、
 * 生产自动收缩为只读页集」。三层各管一维：宿主 角色 rank（操作类别上限）×
 * 宿主 grantedPages（用户级页面授权）× env 模板（环境级页集收缩）。</p>
 *
 * <p>插拔保证：未配置 env 模板（Map 为空或该 env 无模板）→ 原样透传，行为与现状逐字节一致；
 * 删除配置即完全回滚。前端零改动（grantedPages 驱动菜单已存在）。</p>
 *
 * @author aicoding
 */
@Component
public class EnvPagesResolver {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(EnvPagesResolver.class);

    private final ConnStore connStore;
    private final ESQueryStudioElasticsearchProperties properties;

    public EnvPagesResolver(ConnStore connStore, ESQueryStudioElasticsearchProperties properties) {
        this.connStore = connStore;
        this.properties = properties;
        /* 空模板不是「未配置」而是显式全拒：启动时点名，避免上线后被静默锁死。 */
        Map<String, java.util.Set<String>> templates = properties == null ? null : properties.getEnvPages();
        if (templates != null) {
            for (Map.Entry<String, java.util.Set<String>> e : templates.entrySet()) {
                if (e.getValue() == null || e.getValue().isEmpty()) {
                    log.warn("[esquerystudio] env-pages[{}] 为空：该环境所有页面读写均被拒绝（显式全拒语义）",
                            e.getKey());
                }
            }
        }
    }

    /**
     * 环境模板快照（env → 页面 key 集），供 /auth/me 下发前端做菜单/按钮同口径收缩。
     * 只含页面 key（非秘密）；未配置返回空 Map。键归一为大写，空集保留（=该环境全拒）。
     */
    public Map<String, Set<String>> configuredTemplates() {
        Map<String, java.util.Set<String>> templates = properties.getEnvPages();
        Map<String, Set<String>> out = new java.util.LinkedHashMap<>();
        if (templates == null || templates.isEmpty()) return out;
        for (Map.Entry<String, java.util.Set<String>> e : templates.entrySet()) {
            if (e.getKey() == null || e.getKey().trim().isEmpty()) continue;
            Set<String> pages = new LinkedHashSet<>();
            if (e.getValue() != null) pages.addAll(e.getValue());
            /* 与 pagesFor 的“首个大小写不敏感匹配”保持一致：重复键先到先得，
               避免 /auth/me 下发一份、实际执行用另一份。 */
            String key = e.getKey().trim().toUpperCase(java.util.Locale.ROOT);
            if (!out.containsKey(key)) out.put(key, pages);
        }
        return out;
    }

    /** 该连接的环境封顶页集；未配置返回 null（不收缩）。targetId=连接 id（host 字面量=宿主，无模板）。 */
    public Set<String> pagesFor(String targetId) {
        if (targetId == null || targetId.isEmpty() || "host".equalsIgnoreCase(targetId.trim())) {
            return null;
        }
        RemoteClusterConn conn = connStore.get(targetId);
        if (conn == null) return null;
        String env = conn.getEnv();
        if (env == null || env.trim().isEmpty()) return null;
        Map<String, java.util.Set<String>> templates = properties.getEnvPages();
        if (templates == null || templates.isEmpty()) return null;
        /* 连接存储层已 trim+upper，这里再归一一次：旧档案/宿主直写不得因空白或大小写
           跳过环境收缩（跳过=prod 变全开，属于 fail-open）。配置键本身也按大小写不敏感匹配：
           YAML 的 env-pages.prod 与代码里的 PROD 必须是同一份模板。 */
        String wanted = env.trim();
        for (Map.Entry<String, java.util.Set<String>> e : templates.entrySet()) {
            if (e.getKey() == null || !wanted.equalsIgnoreCase(e.getKey().trim())) continue;
            /* 显式配置的空集=该环境全拒；只有「该环境未配置」才返回 null 表示不收缩。 */
            if (e.getValue() == null) return new LinkedHashSet<>();
            /* 模板值归一化：YAML 里写成 "Indices"/"indices " 时，retainAll/contains 会静默失配，
               表现为「配了模板却把有权限的人全拦掉」。键已归一，值必须同口径。 */
            Set<String> normalized = new LinkedHashSet<>();
            for (String v : e.getValue()) {
                if (v != null && !v.trim().isEmpty()) normalized.add(v.trim());
            }
            return normalized;
        }
        return null;
    }

    /** 连接维度键前缀(grantedPages 形态:conn:{connId}:{pageKey},写:conn:{connId}:w:{pageKey})。 */
    public static final String CONN_KEY_PREFIX = "conn:";
    private static final java.util.regex.Pattern CONN_KEY = java.util.regex.Pattern.compile("^conn:([^:]+):(?:w:)?(.+)$");

    /** 解析 grantedPages 中的连接维度键 → {connId → 该连接的页面 key 集(含写键的页面)};无连接键返回空 Map。 */
    public Map<String, Set<String>> connPagesOf(Set<String> grantedPages) {
        Map<String, Set<String>> out = new java.util.LinkedHashMap<>();
        if (grantedPages == null) return out;
        for (String g : grantedPages) {
            if (g == null || !g.startsWith(CONN_KEY_PREFIX)) continue;
            java.util.regex.Matcher m = CONN_KEY.matcher(g);
            if (m.matches()) out.computeIfAbsent(m.group(1), k -> new java.util.LinkedHashSet<>()).add(m.group(2));
        }
        return out;
    }

    /**
     * 有效页面授权(扩展连接维度):
     * <ul>
     *   <li>静态 key(无 conn: 前缀)→ 全局页,对所有连接生效(仍受 env 模板交集);</li>
     *   <li>conn:{connId}:{pageKey} 键 → 仅对 targetId=connId 的连接生效(pageKey 并入有效集);</li>
     *   <li>grantedPages 无任何 conn 键 → 现状行为逐字节一致(纯静态+env 交集)。</li>
     * </ul>
     */
    public Set<String> effectivePages(String targetId, Set<String> grantedPages) {
        Map<String, Set<String>> connMap = connPagesOf(grantedPages);
        Set<String> staticKeys = new LinkedHashSet<>();
        if (grantedPages != null) {
            for (String g : grantedPages) {
                if (g != null && !g.startsWith(CONN_KEY_PREFIX)) staticKeys.add(g);
            }
        }
        Set<String> envPages = pagesFor(targetId);
        Set<String> out;
        /* 模型判定必须与 {@link #inConnModel} 同源（都看 conn: 前缀）。此前用 connPages.isEmpty()
           判模型：畸形键 conn:x（不匹配解析正则）会让 effectivePages 走纯静态分支（不吃 env 收缩），
           而写门 inConnModel 仍按连接模型默认拒绝——两个函数对「是否连接模型」各说各话。 */
        if (!inConnModel(grantedPages)) {
            /* 纯静态模型：env 模板收缩静态页（现状不变） */
            out = new LinkedHashSet<>(staticKeys);
            if (envPages != null) out.retainAll(envPages);
        } else {
            /* 混合/纯 conn 模型：env 是环境级页集封顶，静态键与 conn 键都必须过模板。
               此前只收缩静态键，conn 读键会把被 env 排除的页面重新并入有效集，
               进而让 staticWriteAllowed 误判——环境限制被 conn 读键绕过。 */
            out = new LinkedHashSet<>();
            if (envPages == null) {
                out.addAll(staticKeys);
            } else {
                out.addAll(staticPagesUnderEnv(staticKeys, envPages));
            }
            Set<String> connPages = connMap.get(targetId);
            if (connPages != null) {
                if (envPages == null) {
                    out.addAll(connPages);
                } else {
                    Set<String> capped = new LinkedHashSet<>(connPages);
                    capped.retainAll(envPages);
                    out.addAll(capped);
                }
            }
        }
        return out;
    }

    /** 静态 key 与 env 页集的交集(空/无 env 模板时为空集,调用方自行合并)。 */
    private Set<String> staticPagesUnderEnv(Set<String> staticKeys, Set<String> envPages) {
        Set<String> out = new LinkedHashSet<>(staticKeys);
        out.retainAll(envPages);
        return out;
    }

    /** 用户是否处于连接授权模型(grantedPages 含任一 conn: 前缀键)。写门判定用。 */
    public boolean inConnModel(Set<String> grantedPages) {
        if (grantedPages == null) return false;
        for (String g : grantedPages) {
            if (g != null && g.startsWith(CONN_KEY_PREFIX)) return true;
        }
        return false;
    }

    /** 连接写授权检查:targetId 连接上 pageKey 的写操作是否被显式授权(conn:{id}:w:{page} 键)，且过 env 模板。 */
    public boolean writeAllowed(String targetId, String pageKey, Set<String> grantedPages) {
        if (grantedPages == null || pageKey == null) return false;
        if (!grantedPages.contains(CONN_KEY_PREFIX + targetId + ":w:" + pageKey)) return false;
        Set<String> envPages = pagesFor(targetId);
        return envPages == null || envPages.contains(pageKey);
    }

    /**
     * 连接<b>读</b>授权检查：{@code conn:{id}:{page}} 读键（不带 {@code w:}），且过 env 模板。
     *
     * <p>读键此前只用于「页面可见」，从没参与执行裁决——于是 raw / devtools 透传这类
     * 外层恒 POST 的端点，只读身份连内层 {@code GET /_cluster/health} 都会被写门拒绝，
     * 「宿主给了只读授权」这条信息在执行层被丢掉。写键持有者天然也读得到（页面可见性
     * 两种键都认），所以这里只认读键形态，写键由 {@link #writeAllowed} 单独判。</p>
     */
    public boolean readAllowed(String targetId, String pageKey, Set<String> grantedPages) {
        if (grantedPages == null || pageKey == null) return false;
        if (!grantedPages.contains(CONN_KEY_PREFIX + targetId + ":" + pageKey)) return false;
        Set<String> envPages = pagesFor(targetId);
        return envPages == null || envPages.contains(pageKey);
    }

    /** 该连接上 pageKey 是否「可见」（读键或写键任一即可），且过 env 模板。 */
    public boolean visible(String targetId, String pageKey, Set<String> grantedPages) {
        return readAllowed(targetId, pageKey, grantedPages) || writeAllowed(targetId, pageKey, grantedPages);
    }

    /**
     * 静态页写权：授权集里的无前缀 pageKey（全局页授权）经 env 模板收缩后仍然可见。
     * 混合授权（conn 键 + 静态键）下，静态键不能被 conn 写法门吞掉——否则同一份
     * 静态页授权在纯静态模型可写、混入任一 conn 读键后反而 403（有权限人被拦）。
     * 但 env 收缩只能看静态键本身：conn 读键不得把 env 排除的静态页重新并入有效集。
     */
    public boolean staticWriteAllowed(String targetId, String pageKey, Set<String> grantedPages) {
        if (grantedPages == null || pageKey == null || !grantedPages.contains(pageKey)) return false;
        Set<String> envPages = pagesFor(targetId);
        return envPages == null || envPages.contains(pageKey);
    }

    /** 授权集是否含任一静态（全局页）键。混合模型的无页归属写回落角色门时用。 */
    public boolean hasStatic(Set<String> grantedPages) {
        if (grantedPages == null) return false;
        for (String g : grantedPages) {
            if (g != null && !g.startsWith(CONN_KEY_PREFIX)) return true;
        }
        return false;
    }

    /** 403 响应体（页面被 env 模板收缩掉时——与 PAGE_DENIED 风格区分）。 */
    public static String denyBody(String page) {
        return "{\"code\":\"ENV_PAGE_DENIED\",\"page\":\"" + page + "\",\"message\":\"当前连接环境未开放该页面\"}";
    }

}
