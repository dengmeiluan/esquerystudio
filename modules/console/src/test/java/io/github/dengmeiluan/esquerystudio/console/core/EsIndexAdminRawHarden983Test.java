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

package io.github.dengmeiluan.esquerystudio.console.core;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 批次 983：DevTools 写链与读面残留（BOM bulk / wrapper / 系统读 / 快照删除 / 仓库凭据）。 */
public class EsIndexAdminRawHarden983Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private static void assertRejected(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (ControlPlaneGuardException expected) {
            // ok
        }
    }

    private static void assertAllowed(Runnable r, String why) {
        try {
            r.run();
        } catch (RuntimeException e) {
            fail("不应拒绝：" + why + "，实际=" + e.getMessage());
        }
    }

    @Test
    public void bulk动作行带BOM不能绕过控制面守卫() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_bulk",
                        "\uFEFF{\"delete\":{\"_index\":\"esquerystudio_user\",\"_id\":\"admin\"}}\n"),
                "BOM 前缀动作行");
    }

    @Test
    public void bulk动作行的index值带BOM同样拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_bulk",
                        "{\"index\":{\"_index\":\"\uFEFFesquerystudio_user\"}}\n{\"x\":1}\n"),
                "BOM 前缀 _index 值");
    }

    @Test
    public void bulk业务索引在BOM下仍放行() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_bulk",
                        "\uFEFF{\"index\":{\"_index\":\"logs-1\"}}\n{\"x\":1}\n"),
                "BOM + 业务索引");
    }

    @Test
    public void URI片段符不能把守卫路径与线上路径拆开() throws Exception {
        assertRejected(() -> admin.guardRawGuarded("DELETE", "/logs#", null), "index# 删除");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_stats#x", null), "# 读绕过精确拒绝");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/indices%23x?format=json&h=index", null),
                "%23 解码后同样拒绝");
        try {
            admin.raw("DELETE", "/logs#", null);
            fail("raw 直通也必须拒绝 # 片段");
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    @Test
    public void Mustache注释前缀不能隐藏模板二级索引() throws Exception {
        String source = "{{!x}}{\"query\":{\"terms\":{\"u\":{\"index\":\"e*\",\"id\":\"a\",\"path\":\"u\"}}}}";
        String body = new com.fasterxml.jackson.databind.ObjectMapper()
                .writeValueAsString(java.util.Collections.singletonMap("source", source));
        assertRejected(() -> admin.guardSearchBody(body), "Mustache 前缀 source");
    }

    @Test
    public void PIT搜索按契约免显式索引但仍拒绝空PIT() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_search",
                "{\"pit\":{\"id\":\"abc\"},\"query\":{\"match_all\":{}}}"), "合法 PIT 搜索");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_search",
                "{\"pit\":{},\"query\":{\"match_all\":{}}}"), "空 PIT 退化为全量");
        assertAllowed(() -> admin.guardRawGuarded("DELETE", "/_pit", "{\"id\":\"abc\"}"), "关闭 PIT");
    }

    @Test
    public void 已存模板渲染与非列式cat读仍被拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_render/template", "{\"id\":\"tpl\"}"),
                "按 id 渲染已存模板");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/pending_tasks?format=json", null),
                "pending_tasks 读");
        assertRejected(() -> admin.guardRawGuarded("GET",
                "/_cat/indices?format=json&h=status&h=index", null), "重复 h 失去 index 列");
    }

    @Test
    public void BOM前缀不能跳过结构化二级索引守卫() {
        String search = "\uFEFF{\"query\":{\"terms\":{\"user\":{\"index\":\"e*\",\"id\":\"admin\","
                + "\"path\":\"username\"}}}}";
        assertRejected(() -> admin.guardSearchBody(search), "BOM 搜索体");
        String reindex = "\uFEFF{\"source\":{\"index\":\"e*\"},\"dest\":{\"index\":\"logs-1\"}}";
        assertRejected(() -> admin.guardReindexBody(reindex), "BOM reindex 源");
        String aliases = "\uFEFF{\"actions\":[{\"add\":{\"index\":\"e*\",\"alias\":\"a1\"}}]}";
        assertRejected(() -> admin.guardAliasActionsBody(aliases), "BOM 别名通配");
        String template = "\uFEFF{\"index_patterns\":[\"e*\"]}";
        assertRejected(() -> admin.guardIndexTemplateBody(template), "BOM 模板通配");
    }

    @Test
    public void wrapper编码查询不能藏控制面lookup() {
        String inner = "{\"terms\":{\"user\":{\"index\":\"esquerystudio_user\",\"id\":\"admin\","
                + "\"path\":\"username\"}}}";
        String encoded = Base64.getEncoder().encodeToString(inner.getBytes(StandardCharsets.UTF_8));
        String body = "{\"query\":{\"wrapper\":{\"query\":\"" + encoded + "\"}}}";
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search", body), "wrapper 控制面");
    }

    @Test
    public void wrapper编码业务lookup放行() {
        String inner = "{\"terms\":{\"user\":{\"index\":\"users-v1\",\"id\":\"u1\","
                + "\"path\":\"username\"}}}";
        String encoded = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(inner.getBytes(StandardCharsets.UTF_8));
        String body = "{\"query\":{\"wrapper\":{\"query\":\"" + encoded + "\"}}}";
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_search", body), "wrapper 业务索引");
    }

    @Test
    public void wrapper非法base64直接拒绝() {
        String body = "{\"query\":{\"wrapper\":{\"query\":\"%%%not-base64%%%\"}}}";
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search", body), "非法 wrapper");
    }

    @Test
    public void 系统级读不暴露别名任务模板与分配诊断() {
        for (String path : new String[]{
                "/_aliases", "/_tasks", "/_tasks/node-1:42", "/_cat/tasks",
                "/_cluster/allocation/explain", "/_cluster/pending_tasks",
                "/_cat/templates", "/_index_template", "/_index_template/logs-tpl",
                "/_template/logs-tpl", "/_component_template/logs-cmp"}) {
            assertRejected(() -> admin.guardRawGuarded("GET", path, null), path);
        }
    }

    @Test
    public void 非管理员不能删除含控制面的快照() {
        List<Map<String, Object>> snapshots = new ArrayList<>();
        snapshots.add(snapshot("snap-ok", "logs-1", "logs-2"));
        snapshots.add(snapshot("snap-ctl", "logs-1", "esquerystudio_user"));
        snapshots.add(snapshot("snap-system", ".security-7"));
        assertRejected(() -> admin.guardSnapshotDeletion(snapshots, "snap-ctl"), "控制面快照");
        assertRejected(() -> admin.guardSnapshotDeletion(snapshots, "snap-system"), "系统索引快照");
        assertRejected(() -> admin.guardSnapshotDeletion(snapshots, "missing"), "无法证明快照内容");
        assertAllowed(() -> admin.guardSnapshotDeletion(snapshots, "snap-ok"), "纯业务快照");
    }

    @Test
    public void 快照仓库点号与下划线凭据同样脱敏() {
        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("conf.fs.s3a.access.key", "AKIA-SECRET");
        settings.put("conf.fs.azure.account.key.acct.blob.core.windows.net", "AZURE-SECRET");
        settings.put("api_key", "API-SECRET");
        settings.put("fs.s3a.secret-key", "S3-SECRET");
        settings.put("location", "bucket/prefix");
        Map<String, Object> repo = new LinkedHashMap<>();
        repo.put("type", "s3");
        repo.put("settings", settings);
        List<Map<String, Object>> masked = EsIndexAdmin.maskSnapshotRepoSecrets(java.util.Collections.singletonList(repo));
        @SuppressWarnings("unchecked")
        Map<String, Object> maskedSettings = (Map<String, Object>) masked.get(0).get("settings");
        assertEquals("***", maskedSettings.get("conf.fs.s3a.access.key"));
        assertEquals("***", maskedSettings.get("conf.fs.azure.account.key.acct.blob.core.windows.net"));
        assertEquals("***", maskedSettings.get("api_key"));
        assertEquals("***", maskedSettings.get("fs.s3a.secret-key"));
        assertEquals("bucket/prefix", maskedSettings.get("location"));
        assertTrue(masked.get(0).get("settings") instanceof Map);
    }

    private static Map<String, Object> snapshot(String name, String... indices) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("snapshot", name);
        s.put("indices", new ArrayList<>(java.util.Arrays.asList(indices)));
        return s;
    }
}
