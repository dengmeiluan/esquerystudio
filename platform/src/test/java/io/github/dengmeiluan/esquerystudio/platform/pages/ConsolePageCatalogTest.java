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

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 2.5.0 菜单 SPI：页面契约是 Java 拦截 / console 前端 / 宿主菜单注册三端的唯一事实源，
 * 本类钉死它的结构（13 组 53 页、11 个功能包、key 唯一）与匹配语义（最长前缀 + 段边界）。
 */
public class ConsolePageCatalogTest {

    private final ConsolePageCatalog catalog = ConsolePageCatalog.load();

    @Test
    public void 契约加载_13组53页() {
        assertEquals(13, catalog.getGroups().size());
        assertEquals(53, catalog.getPages().size());
    }

    @Test
    public void 功能包_11包覆盖全部组且页数合计53() {
        assertEquals(11, catalog.getPacks().size());
        Set<String> assigned = new HashSet<>();
        int pages = 0;
        for (ConsolePageCatalog.Pack pack : catalog.getPacks()) {
            for (String group : pack.getGroups()) {
                pages += catalog.pagesOf(group).size();
                assertTrue("分组被多个包声明: " + group, assigned.add(group));
                assertTrue("功能包引用了不存在分组: " + group,
                        catalog.getGroups().stream().anyMatch(g -> g.getId().equals(group)));
            }
        }
        assertEquals("每个分组都必须归属一个功能包", catalog.getGroups().size(), assigned.size());
        assertEquals(53, pages);
        assertEquals("security", catalog.packOfPage("security").getId());
        assertEquals("platform", catalog.packOfPage("overview").getId());
        assertEquals("lifecycle", catalog.packOfPage("adhoc-rebuild").getId());
        assertEquals("devtools", catalog.packOfPage("devtools").getId());
    }

    @Test
    public void 页面key全唯一且分组按sort升序() {
        Set<String> keys = new HashSet<>();
        for (ConsolePageCatalog.Page p : catalog.getPages()) {
            assertTrue("页面 key 重复: " + p.getKey(), keys.add(p.getKey()));
        }
        int prev = Integer.MIN_VALUE;
        for (ConsolePageCatalog.Group g : catalog.getGroups()) {
            assertTrue("分组 sort 必须升序", g.getSort() > prev);
            prev = g.getSort();
        }
    }

    @Test
    public void 每组页面数合计53_core5_security1_rank6() {
        int sum = 0;
        for (ConsolePageCatalog.Group g : catalog.getGroups()) {
            sum += catalog.pagesOf(g.getId()).size();
        }
        assertEquals(53, sum);
        assertEquals(5, catalog.pagesOf("core").size());
        assertEquals(1, catalog.pagesOf("security").size());
        assertEquals(6, catalog.pagesOf("rank").size());
        assertEquals(4, catalog.pagesOf("devx").size());
    }

    @Test
    public void pageOf_精确命中页面专属端点() {
        assertEquals("adhoc-rebuild", catalog.pageOf("/internal/es/index/adhoc-rebuild/prepare").getKey());
        assertEquals("adhoc-rebuild", catalog.pageOf("/internal/es/index/adhoc-rebuild").getKey());
        assertEquals("xmigrate", catalog.pageOf("/internal/es/xmigrate/jobs").getKey());
        /* ·管理域放开（裁决）：auth/users 归属 security 页——读键可见用户
           列表、写键（w:security）放行用户管理（ ADMIN 一刀切随「管理域放」退役）；
           系统管理（/setup/rebind、/clusters/）仍维持 ADMIN 专属（无菜单勾选项对应）。 */
        assertEquals("security", catalog.pageOf("/internal/es/index/auth/users").getKey());
        assertEquals("security", catalog.pageOf("/internal/es/index/auth/users/upsert").getKey());
        /* 审计值建议会暴露全量用户名/URI——归属安全中心（原挂 overview 是页面归属错位） */
        assertEquals("security", catalog.pageOf("/internal/es/index/auth/audit-facets").getKey());
        /* ops-audit 归 security 页：全量审计必须同时具备页面读键 + rank3 角色门
           （连接模型下页面读键即最终裁决）；/auth/ops-audit/mine 是自助端点，
           拦截器 bootstrapRead 特例不因页面归属受限。 */
        assertEquals("security", catalog.pageOf("/internal/es/index/auth/ops-audit").getKey());
        assertEquals("security", catalog.pageOf("/internal/es/index/auth/ops-audit/mine").getKey());
        assertEquals("indices", catalog.pageOf("/internal/es/index/status").getKey());
        assertEquals("indices", catalog.pageOf("/internal/es/index/cluster/delete-index").getKey());
        assertEquals("optimizer", catalog.pageOf("/internal/es/index/cluster/force-merge").getKey());
        assertEquals("overview", catalog.pageOf("/internal/es/index/overview").getKey());
    }

    @Test
    public void pageOf_共享端点返回null() {
        assertNull(catalog.pageOf("/internal/es/index/auth/me"));
        assertNull(catalog.pageOf("/internal/es/index/auth/login"));
        assertNull(catalog.pageOf("/internal/es/index/auth/change-password"));
        assertNull(catalog.pageOf("/internal/es/index/setup/status"));
        assertNull(catalog.pageOf("/internal/es/index/keys"));
        assertNull(catalog.pageOf("/internal/es/index/health"));
        assertNull(catalog.pageOf("/internal/es/index/cluster/indices"));
        assertNull(catalog.pageOf("/internal/es/index/cluster/health"));
        /* cluster/raw 归属 rest 页（REST 直连页写勾选=raw 透传可用） */
        assertEquals("rest", catalog.pageOf("/internal/es/index/cluster/raw").getKey());
        assertNull(catalog.pageOf("/internal/es/index/cluster/query"));
        assertNull(catalog.pageOf("/internal/es/index/cluster/tasks"));
        assertNull(catalog.pageOf("/internal/es/index/cluster/task-detail"));
        assertNull(catalog.pageOf("/internal/es/index/cluster/templates"));
        assertNull(catalog.pageOf("/internal/es/index/cluster/shards"));
        assertNull(catalog.pageOf("/internal/es/index/clusters"));
        assertNull(catalog.pageOf("/internal/es/index/clusters/save"));
        assertNull(catalog.pageOf("/internal/es/index/insight/settings-impact"));
        assertNull(catalog.pageOf("/internal/es/index/desired-state"));
        assertNull(catalog.pageOf("/internal/es/index/cluster/doc"));
        assertNull(catalog.pageOf("/internal/es/index/cluster/delete-by-query"));
    }

    @Test
    public void pageOf_段边界不误吞() {
        // nodes-stats-brief 是共享端点（liveMonitor/CmdPalette 全局用），不得被 diag 页前缀 /nodes-stats 吞掉
        assertNull(catalog.pageOf("/internal/es/index/cluster/nodes-stats-brief"));
        assertEquals("diag", catalog.pageOf("/internal/es/index/cluster/nodes-stats").getKey());
        // rebuild-empty 属 indices 页（契约显式列了），且 /rebuild 前缀不得吞 /rebuildx 这类词
        assertEquals("indices", catalog.pageOf("/internal/es/index/rebuild-empty").getKey());
        assertNull(catalog.pageOf("/internal/es/index/rebuildx"));
    }

    @Test
    public void pageOf_尾斜杠前缀纯startsWith() {
        assertEquals("search", catalog.pageOf("/internal/es/index/cluster/pit/open").getKey());
        assertEquals("search", catalog.pageOf("/internal/es/index/cluster/pit/close").getKey());
        assertEquals("snapshots", catalog.pageOf("/internal/es/index/cluster/snapshot/repos").getKey());
        assertEquals("snapshots", catalog.pageOf("/internal/es/index/cluster/snapshot/status").getKey());
        assertEquals("slm", catalog.pageOf("/internal/es/index/cluster/slm/policies").getKey());
    }

    @Test
    public void pageOf_同族前缀各归其页() {
        assertEquals("cluster-settings", catalog.pageOf("/internal/es/index/cluster/settings").getKey());
        assertEquals("cluster-settings", catalog.pageOf("/internal/es/index/cluster/settings/put").getKey());
        assertEquals("mapping", catalog.pageOf("/internal/es/index/cluster/index-settings-defaults").getKey());
        assertEquals("ilm", catalog.pageOf("/internal/es/index/cluster/ilm/explain").getKey());
        assertNull(catalog.pageOf("/internal/es/index/cluster/ilm/policies")); // ilm+lifecycle 共用 → 共享
        assertEquals("lifecycle", catalog.pageOf("/internal/es/index/cluster/ilm/move").getKey());
        assertEquals("templates", catalog.pageOf("/internal/es/index/cluster/templates/put").getKey());
    }

    /** 旧契约没有 packs 字段：自动合成单包 all，不让宿主自定义契约被迫升级。 */
    @Test
    public void 兼容契约_无packs字段_合成单包all() {
        String json = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                + "\"pages\":[{\"key\":\"a\",\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\",\"icon\":\"I\","
                + "\"hotkey\":\"\",\"apiPrefixes\":[],\"minVer\":null}]}";
        ConsolePageCatalog legacy = ConsolePageCatalog.parse(
                new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        assertEquals(1, legacy.getPacks().size());
        assertEquals("all", legacy.getPacks().get(0).getId());
        assertEquals("all", legacy.packOfGroup("g").getId());
    }

    /** 反向对照：功能包引用不存在的分组必须拒载。 */
    @Test
    public void 非法契约_功能包悬空分组_拒载() {
        String bad = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                + "\"packs\":[{\"id\":\"p\",\"name\":\"P\",\"groups\":[\"g\",\"missing\"]}],"
                + "\"pages\":[{\"key\":\"a\",\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\",\"icon\":\"I\","
                + "\"hotkey\":\"\",\"apiPrefixes\":[],\"minVer\":null}]}";
        try {
            ConsolePageCatalog.parse(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)));
            fail("功能包悬空分组必须拒载");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("分组"));
        }
    }

    /** 反向对照：分组未归属任何功能包必须拒载（否则该分组永远无法被配置选中）。 */
    @Test
    public void 非法契约_分组未归属功能包_拒载() {
        String bad = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1},"
                + "{\"id\":\"h\",\"name\":\"H\",\"sort\":2}],"
                + "\"packs\":[{\"id\":\"p\",\"name\":\"P\",\"groups\":[\"g\"]}],"
                + "\"pages\":[{\"key\":\"a\",\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\",\"icon\":\"I\","
                + "\"hotkey\":\"\",\"apiPrefixes\":[],\"minVer\":null}]}";
        try {
            ConsolePageCatalog.parse(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)));
            fail("未归属分组必须拒载");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("未归属"));
        }
    }

    /** 反向对照：契约缺 key 重复时 load 必须拒载（否则上面的全量断言可能因恒真校验而无意义）。 */
    @Test
    public void 非法契约_重复key_拒载() {
        String bad = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                + "\"pages\":["
                + "{\"key\":\"a\",\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\",\"icon\":\"I\",\"hotkey\":\"\",\"apiPrefixes\":[],\"minVer\":null},"
                + "{\"key\":\"a\",\"name\":\"A2\",\"group\":\"g\",\"route\":\"/a2\",\"icon\":\"I\",\"hotkey\":\"\",\"apiPrefixes\":[],\"minVer\":null}]}";
        try {
            ConsolePageCatalog.parse(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)));
            fail("重复 key 必须拒载");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("重复"));
        }
    }

    /** 反向对照：页面引用不存在的分组必须拒载。 */
    @Test
    public void 非法契约_悬空分组_拒载() {
        String bad = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                + "\"pages\":[{\"key\":\"a\",\"name\":\"A\",\"group\":\"nope\",\"route\":\"/a\",\"icon\":\"I\",\"hotkey\":\"\",\"apiPrefixes\":[],\"minVer\":null}]}";
        try {
            ConsolePageCatalog.parse(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)));
            fail("悬空分组必须拒载");
        } catch (IllegalStateException expected) {
            // 通过
        }
    }

    /** 反向对照：key 只允许 [a-z0-9-]（key 原样拼进 403 JSON 报文，非法字符必须加载期拒载）。 */
    @Test
    public void 非法契约_key含非法字符_拒载() {
        String[] badKeys = {"a_b", "A", "a b", "a.b", "a/b"};
        for (String badKey : badKeys) {
            String bad = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                    + "\"pages\":[{\"key\":\"" + badKey + "\",\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\","
                    + "\"icon\":\"I\",\"hotkey\":\"\",\"apiPrefixes\":[],\"minVer\":null}]}";
            try {
                ConsolePageCatalog.parse(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)));
                fail("非法 key 必须拒载: " + badKey);
            } catch (IllegalStateException expected) {
                assertTrue(expected.getMessage().contains("key"));
            }
        }
    }

    /** 反向对照：两页声明相同 apiPrefix 必须拒载（否则 pageOf 的 > 严格比较让先声明者静默赢）。 */
    @Test
    public void 非法契约_重复前缀_拒载() {
        String bad = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                + "\"pages\":["
                + "{\"key\":\"a\",\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\",\"icon\":\"I\",\"hotkey\":\"\",\"apiPrefixes\":[\"/internal/es/x\"],\"minVer\":null},"
                + "{\"key\":\"b\",\"name\":\"B\",\"group\":\"g\",\"route\":\"/b\",\"icon\":\"I\",\"hotkey\":\"\",\"apiPrefixes\":[\"/internal/es/x\"],\"minVer\":null}]}";
        try {
            ConsolePageCatalog.parse(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)));
            fail("跨页重复前缀必须拒载");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("重复"));
        }
    }

    /** 反向对照：空前缀会吞掉所有绝对路径，必须拒载。 */
    @Test
    public void 非法契约_空前缀_拒载() {
        String bad = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                + "\"pages\":[{\"key\":\"a\",\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\",\"icon\":\"I\",\"hotkey\":\"\",\"apiPrefixes\":[\"\"],\"minVer\":null}]}";
        try {
            ConsolePageCatalog.parse(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)));
            fail("空前缀必须拒载");
        } catch (IllegalStateException expected) {
            // 通过
        }
    }

    /** 反向对照：非 / 开头的前缀永不可能命中请求路径，属于笔误，必须拒载。 */
    @Test
    public void 非法契约_非斜杠开头前缀_拒载() {
        String bad = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                + "\"pages\":[{\"key\":\"a\",\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\",\"icon\":\"I\",\"hotkey\":\"\",\"apiPrefixes\":[\"abc\"],\"minVer\":null}]}";
        try {
            ConsolePageCatalog.parse(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)));
            fail("非 / 开头前缀必须拒载");
        } catch (IllegalStateException expected) {
            // 通过
        }
    }

    /** 反向对照：Jackson required() 字段缺失抛的 IAE 必须被包装成类 Javadoc 承诺的 ISE。 */
    @Test
    public void 非法契约_缺字段_抛ISE而非IAE() {
        String bad = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                + "\"pages\":[{\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\",\"icon\":\"I\",\"apiPrefixes\":[]}]}";
        try {
            ConsolePageCatalog.parse(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)));
            fail("缺 key 字段必须拒载");
        } catch (IllegalStateException expected) {
            // 通过：ISE 与 IAE 是兄弟类，catch 到 ISE 即证明包装生效
        }
    }

    /** 反向对照：契约版本不受支持必须拒载（防前端/后端跨版本漂移静默错配）。 */
    @Test
    public void 非法契约_版本不支持_拒载() {
        String bad = "{\"version\":2,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                + "\"pages\":[{\"key\":\"a\",\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\",\"icon\":\"I\",\"hotkey\":\"\",\"apiPrefixes\":[],\"minVer\":null}]}";
        try {
            ConsolePageCatalog.parse(new ByteArrayInputStream(bad.getBytes(StandardCharsets.UTF_8)));
            fail("版本不支持必须拒载");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("版本"));
        }
    }

    /** 固化断言：minVer 三档样本（7.4 / 6.6 / 6.3）与 null 缺省都要正确解析。 */
    @Test
    public void minVer解析_三档版本与null() {
        assertEquals("7.4", pageByKey("slm").getMinVer());
        assertEquals("6.6", pageByKey("ilm").getMinVer());
        assertEquals("6.3", pageByKey("painless-lab").getMinVer());
        assertNull(pageByKey("overview").getMinVer());
    }

    /** 固化断言：hotkey 字段缺省（老契约没这字段）要容忍，解析为空串。 */
    @Test
    public void hotkey缺省容忍() {
        String ok = "{\"version\":1,\"groups\":[{\"id\":\"g\",\"name\":\"G\",\"sort\":1}],"
                + "\"pages\":[{\"key\":\"a\",\"name\":\"A\",\"group\":\"g\",\"route\":\"/a\",\"icon\":\"I\",\"apiPrefixes\":[\"/internal/es/a\"],\"minVer\":null}]}";
        ConsolePageCatalog c = ConsolePageCatalog.parse(new ByteArrayInputStream(ok.getBytes(StandardCharsets.UTF_8)));
        assertEquals(1, c.getPages().size());
        assertEquals("", c.getPages().get(0).getHotkey());
    }

    private ConsolePageCatalog.Page pageByKey(String key) {
        for (ConsolePageCatalog.Page p : catalog.getPages()) {
            if (p.getKey().equals(key)) {
                return p;
            }
        }
        fail("契约缺少页面: " + key);
        return null; // 不可达
    }
}
