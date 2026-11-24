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

package io.github.dengmeiluan.esquerystudio.platform.pages;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 控制台页面目录：页面契约 {@code META-INF/esquerystudio-pages.json} 的 Java 侧读取口。
 *
 * <p>契约是<b>唯一事实源</b>：console 前端导航（构建期 import 派生）、后端页面级拦截（本类）、
 * 宿主菜单注册器（如 宿主 经 classpath 直读）三端共用，结构性消灭漂移。</p>
 *
 * <p>契约不可或缺：加载/解析/校验任一失败即抛 {@link IllegalStateException}（启动 fail-fast），
 * 不许静默降级为空目录——那会让页面级授权「看起来像开了其实什么都没拦」。</p>
 *
 * @author aicoding
 */
public class ConsolePageCatalog {

    /** 契约资源路径（classpath 相对）。 */
    public static final String RESOURCE = "META-INF/esquerystudio-pages.json";

    /** 模块统一惯例：静态共享 ObjectMapper（线程安全，免每实例新建）。 */
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * 页面 key 合法字符集：仅小写字母/数字/连字符。key 会原样拼进 403 JSON 报文与宿主菜单标识，
     * 加载期收敛字符集，消灭「报文拼接端需要转义而契约端不加约束」的不对称。
     */
    private static final Pattern KEY_PATTERN = Pattern.compile("[a-z0-9-]+");

    private final List<Group> groups;
    private final List<Pack> packs;
    private final List<Page> pages;

    private ConsolePageCatalog(List<Group> groups, List<Pack> packs, List<Page> pages) {
        this.groups = Collections.unmodifiableList(groups);
        this.packs = Collections.unmodifiableList(packs);
        this.pages = Collections.unmodifiableList(pages);
    }

    /** 从当前线程 context ClassLoader 加载契约（starter 与宿主读到同一份）。 */
    public static ConsolePageCatalog load() {
        ClassLoader cl = Thread.currentThread().getContextClassLoader();
        if (cl == null) {
            cl = ConsolePageCatalog.class.getClassLoader();
        }
        InputStream in = cl.getResourceAsStream(RESOURCE);
        if (in == null) {
            throw new IllegalStateException("控制台页面契约缺失: classpath:" + RESOURCE
                    + "（ESQueryStudio 控制台构建产物不完整）");
        }
        try {
            return parse(in);
        } finally {
            try {
                in.close();
            } catch (IOException ignore) {
                // 关流失败不影响加载结果
            }
        }
    }

    /** 解析 + 校验契约流（包私有重载供单测喂非法样本做反向对照）。 */
    static ConsolePageCatalog parse(InputStream in) {
        final JsonNode root;
        try {
            root = MAPPER.readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException("控制台页面契约解析失败: " + RESOURCE, e);
        }
        try {
            // 版本闸门：契约结构随版本演进，版本不符说明前后端产物漂移，必须 fail-fast 而非静默错配
            int v = root.required("version").asInt(-1);
            if (v != 1) {
                throw new IllegalStateException("控制台页面契约版本不受支持: " + v);
            }
            List<Group> groups = new ArrayList<>();
            for (JsonNode g : root.required("groups")) {
                groups.add(new Group(g.required("id").asText(), g.required("name").asText(), g.required("sort").asInt()));
            }
            List<Pack> packs = new ArrayList<>();
            /* packs 为可选扩展：旧契约（无 packs）按「单包全量」读取，保证宿主自定义契约不被迫升级。 */
            if (root.has("packs")) {
                for (JsonNode p : root.get("packs")) {
                    List<String> packGroups = new ArrayList<>();
                    for (JsonNode g : p.required("groups")) {
                        packGroups.add(g.asText());
                    }
                    packs.add(new Pack(
                            p.required("id").asText(),
                            p.required("name").asText(),
                            p.has("description") ? p.get("description").asText() : "",
                            packGroups));
                }
            }
            if (packs.isEmpty()) {
                List<String> allGroups = new ArrayList<>();
                for (Group g : groups) {
                    allGroups.add(g.getId());
                }
                packs.add(new Pack("all", "全部功能", "未声明功能包的兼容模式", allGroups));
            }
            List<Page> pages = new ArrayList<>();
            for (JsonNode p : root.required("pages")) {
                List<String> prefixes = new ArrayList<>();
                for (JsonNode a : p.required("apiPrefixes")) {
                    prefixes.add(a.asText());
                }
                pages.add(new Page(
                        p.required("key").asText(),
                        p.required("name").asText(),
                        p.required("group").asText(),
                        p.required("route").asText(),
                        p.required("icon").asText(),
                        p.has("hotkey") ? p.get("hotkey").asText() : "",
                        prefixes,
                        p.has("minVer") && !p.get("minVer").isNull() ? p.get("minVer").asText() : null));
            }
            validate(groups, packs, pages);
            return new ConsolePageCatalog(groups, packs, pages);
        } catch (IllegalArgumentException e) {
            // Jackson required() 缺字段抛 IAE，统一包装成类 Javadoc 承诺的 ISE（fail-fast 单一异常形态）
            throw new IllegalStateException("控制台页面契约结构非法: " + RESOURCE, e);
        }
    }

    private static void validate(List<Group> groups, List<Pack> packs, List<Page> pages) {
        Set<String> groupIds = new HashSet<>();
        for (Group g : groups) {
            if (!groupIds.add(g.getId())) {
                throw new IllegalStateException("控制台页面契约非法：分组 id 重复: " + g.getId());
            }
        }
        Set<String> packIds = new HashSet<>();
        Set<String> assignedGroups = new HashSet<>();
        for (Pack p : packs) {
            if (!KEY_PATTERN.matcher(p.getId()).matches()) {
                throw new IllegalStateException("控制台页面契约非法：功能包 id 只允许小写字母/数字/连字符: \""
                        + p.getId() + "\"");
            }
            if (!packIds.add(p.getId())) {
                throw new IllegalStateException("控制台页面契约非法：功能包 id 重复: " + p.getId());
            }
            if (p.getGroups().isEmpty()) {
                throw new IllegalStateException("控制台页面契约非法：功能包未声明分组: " + p.getId());
            }
            for (String groupId : p.getGroups()) {
                if (!groupIds.contains(groupId)) {
                    throw new IllegalStateException("控制台页面契约非法：功能包 " + p.getId()
                            + " 引用了不存在的分组: " + groupId);
                }
                if (!assignedGroups.add(groupId)) {
                    throw new IllegalStateException("控制台页面契约非法：分组 " + groupId + " 被多个功能包声明");
                }
            }
        }
        for (String groupId : groupIds) {
            if (!assignedGroups.contains(groupId)) {
                throw new IllegalStateException("控制台页面契约非法：分组 " + groupId + " 未归属任何功能包");
            }
        }
        Set<String> keys = new HashSet<>();
        Map<String, String> prefixOwner = new HashMap<>();
        for (Page p : pages) {
            if (!KEY_PATTERN.matcher(p.getKey()).matches()) {
                throw new IllegalStateException("控制台页面契约非法：页面 key 只允许小写字母/数字/连字符: \""
                        + p.getKey() + "\"");
            }
            if (!keys.add(p.getKey())) {
                throw new IllegalStateException("控制台页面契约非法：页面 key 重复: " + p.getKey());
            }
            if (!groupIds.contains(p.getGroup())) {
                throw new IllegalStateException("控制台页面契约非法：页面 " + p.getKey()
                        + " 引用了不存在的分组: " + p.getGroup());
            }
            for (String prefix : p.getApiPrefixes()) {
                // 空前缀会吞掉所有绝对路径；非 / 开头永远命不中——都是笔误，必须拒载
                if (prefix.isEmpty() || !prefix.startsWith("/")) {
                    throw new IllegalStateException("控制台页面契约非法：页面 " + p.getKey()
                            + " 的 apiPrefix 必须以 / 开头且非空: \"" + prefix + "\"");
                }
                // 跨页重复前缀会让 pageOf 的 > 严格比较使先声明者静默赢，必须拒载
                String owner = prefixOwner.putIfAbsent(prefix, p.getKey());
                if (owner != null) {
                    throw new IllegalStateException("控制台页面契约非法：apiPrefix 跨页重复: " + prefix
                            + "（页面 " + owner + " 与 " + p.getKey() + "）");
                }
            }
        }
    }

    public List<Group> getGroups() {
        return groups;
    }

    /** 功能包（部署时可选择的产品单元）；旧契约自动合成为单包 {@code all}。 */
    public List<Pack> getPacks() {
        return packs;
    }

    public List<Page> getPages() {
        return pages;
    }

    /** 分组 → 功能包；契约校验保证每个分组恰好归属一个包。 */
    public Pack packOfGroup(String groupId) {
        for (Pack p : packs) {
            if (p.getGroups().contains(groupId)) {
                return p;
            }
        }
        return null;
    }

    public Pack packOfPage(String pageKey) {
        for (Page p : pages) {
            if (p.getKey().equals(pageKey)) {
                return packOfGroup(p.getGroup());
            }
        }
        return null;
    }

    /** 指定分组下的页面（契约声明序）。宿主菜单注册器按组建目录用。 */
    public List<Page> pagesOf(String groupId) {
        List<Page> out = new ArrayList<>();
        for (Page p : pages) {
            if (p.getGroup().equals(groupId)) {
                out.add(p);
            }
        }
        return out;
    }

    /**
     * 请求路径 → 归属页面（最长前缀匹配）。
     *
     * <p>返回 {@code null} 表示<b>共享端点</b>（不落在任何页面 apiPrefixes 内：auth/setup、
     * 全局引导、多页共用端点）——维持现有三档角色拦截，不吃页面级。</p>
     *
     * <p><b>段边界</b>：不带尾斜杠的前缀仅在「路径等于前缀」或「以 前缀+{@code /} 开头」时命中——
     * {@code /cluster/nodes-stats}（diag 页）不会误吞共享的 {@code /cluster/nodes-stats-brief}；
     * 带尾斜杠前缀（如 {@code /cluster/pit/}）是纯 startsWith。</p>
     *
     * @param path 已剥 context-path 的请求路径（如 {@code /internal/es/index/overview}）
     */
    public Page pageOf(String path) {
        Page best = null;
        int bestLen = -1;
        for (Page p : pages) {
            for (String prefix : p.getApiPrefixes()) {
                if (prefix.length() > bestLen && matches(path, prefix)) {
                    best = p;
                    bestLen = prefix.length();
                }
            }
        }
        return best;
    }

    private static boolean matches(String path, String prefix) {
        if (prefix.endsWith("/")) {
            return path.startsWith(prefix);
        }
        return path.equals(prefix) || path.startsWith(prefix + "/");
    }

    /** 功能包：一组分组的部署选择单元（导航裁剪的最小粒度；不参与权限判定）。 */
    public static class Pack {
        private final String id;
        private final String name;
        private final String description;
        private final List<String> groups;

        Pack(String id, String name, String description, List<String> groups) {
            this.id = id;
            this.name = name;
            this.description = description;
            this.groups = Collections.unmodifiableList(new ArrayList<>(groups));
        }

        public String getId() { return id; }
        public String getName() { return name; }
        public String getDescription() { return description; }
        public List<String> getGroups() { return groups; }
    }

    /** 分组（console 侧栏组 / 宿主菜单目录）。 */
    public static class Group {
        private final String id;
        private final String name;
        private final int sort;

        Group(String id, String name, int sort) {
            this.id = id;
            this.name = name;
            this.sort = sort;
        }

        public String getId() { return id; }
        public String getName() { return name; }
        public int getSort() { return sort; }
    }

    /** 页面（一个控制台功能页 = 一组专属 API 前缀组成的授权单元）。 */
    public static class Page {
        private final String key;
        private final String name;
        private final String group;
        private final String route;
        private final String icon;
        private final String hotkey;
        private final List<String> apiPrefixes;
        private final String minVer;

        Page(String key, String name, String group, String route, String icon, String hotkey,
             List<String> apiPrefixes, String minVer) {
            this.key = key;
            this.name = name;
            this.group = group;
            this.route = route;
            this.icon = icon;
            this.hotkey = hotkey;
            this.apiPrefixes = Collections.unmodifiableList(new ArrayList<>(apiPrefixes));
            this.minVer = minVer;
        }

        public String getKey() { return key; }
        public String getName() { return name; }
        public String getGroup() { return group; }
        public String getRoute() { return route; }
        public String getIcon() { return icon; }
        public String getHotkey() { return hotkey; }
        public List<String> getApiPrefixes() { return apiPrefixes; }
        public String getMinVer() { return minVer; }
    }
}
