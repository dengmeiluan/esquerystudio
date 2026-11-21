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

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;
import org.junit.experimental.runners.Enclosed;
import org.junit.runner.RunWith;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * EsIndexAdmin raw 通道守卫的加固测试族：覆盖 DevTools 写链与读面残留（BOM、wrapper
 * 编码、系统读、快照删除与仓库凭据脱敏）、残留绕过形态（索引查询参数、Mustache 模板、
 * update 脚本、SQL filter、多词向量、rank_eval）、raw 通道收口（PIT/scroll 方法面、已存
 * 模板路径 id 形态、索引表达式加号前缀、大小写归一、boost 目标、cat 限定列名）以及增量
 * 加固（索引级分片拓扑读、reindex 源索引显式化、嵌套已存模板引用）。每个嵌套类独立
 * 验证一个守卫面，均针对无客户端实例下的静态守卫逻辑。
 */
@RunWith(Enclosed.class)
public class EsIndexAdminRawHardenTest {

/** 批次 983：DevTools 写链与读面残留（BOM bulk / wrapper / 系统读 / 快照删除 / 仓库凭据）。 */
    public static class EsIndexAdminRawHarden983 {

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

/** 批次 985：DevTools 残留绕过（重复空索引参数 / Mustache 结构键 / 模板路径 id / health / UBQ 脚本）。 */
    public static class EsIndexAdminRawHarden985 {

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
    public void 重复空index参数不能退化为全量搜索() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search?index=&index=logs", null),
                "首个 index 为空，ES 会按全量执行");
    }

    @Test
    public void naked_index参数同样拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search?index&index=logs", null),
                "naked index 为空值");
    }

    @Test
    public void 重复index参数一律拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_count?index=logs&index=metrics", null),
                "重复 index 取值口径不唯一");
    }

    @Test
    public void 单个业务索引走路径形式才放行() {
        /* 1005 收紧：index 查询参数不再充当范围凭据（原因见 guardRawIndexQueryParam），
           业务索引改用路径形式；能力不缺。 */
        assertAllowed(() -> admin.guardRawGuarded("GET", "/logs/_count", null), "路径限定业务索引");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_count?index=logs", null),
                "查询参数不构成目标限定");
    }

    @Test
    public void 复数indices空值与重复同样拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_msearch?indices=&indices=logs", null),
                "indices 空首值");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_count?indices=logs&indices=metrics", null),
                "indices 重复");
    }

    @Test
    public void 节点与集群元数据读不向非管理员开放() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/nodes?format=json", null),
                "节点地址");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_data_stream", null),
                "内部数据流名");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_license", null),
                "许可信息");
        assertRejected(() -> admin.guardRawGuarded("GET",
                        "/_cat/transforms?format=json&h=id,source_index,dest_index", null),
                "transform 源/目标索引名");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/component_templates?format=json", null),
                "组件模板视图");
    }

    @Test
    public void 集群统计与节点分配对非管理员放行() {
        /* 纯观测聚合（节点数/磁盘/分片占用），不含控制面索引名与凭据；
           es_cluster 组 stats / cat_allocation 正式 action 与 es_rest GET 同口径可读，
           控制台 UI 概览/健康/分片页对同角色本就展示这些数据。 */
        assertAllowed(() -> admin.guardRawGuarded("GET", "/_cluster/stats", null), "集群统计");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/_cat/allocation?format=json&bytes=b", null), "节点分配");
    }

    @Test
    public void lookup键全部为Mustache占位符时拒绝() {
        String inline = "{\"query\":{\"terms\":{\"u\":{\"{{k1}}\":\"{{v1}}\","
                + "\"{{k2}}\":\"{{v2}}\",\"{{k3}}\":\"{{v3}}\"}}}}";
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs-1/_search/template",
                        "{\"inline\":" + quote(inline) + "}"),
                "占位符键渲染为 terms lookup 的 index/id/path");
    }

    @Test
    public void lookup的index值为Mustache占位符时拒绝() {
        String inline = "{\"query\":{\"terms\":{\"f\":{\"index\":\"{{idx}}\",\"id\":\"1\"}}}}";
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search/template",
                        "{\"inline\":" + quote(inline) + "}"),
                "动态索引目标无法静态校验");
    }

    @Test
    public void 对象source中的子句键占位符同样拒绝() {
        String body = "{\"source\":{\"query\":{\"{{q}}\":{\"{{f}}\":"
                + "{\"index\":\".security\",\"id\":\"1\",\"path\":\"username\"}}}},"
                + "\"params\":{\"q\":\"terms\",\"f\":\"username\"}}";
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search/template", body),
                "对象 source 的子句键 {{q}} 渲染为 terms");
    }

    @Test
    public void 对象source中的分隔符切换拒绝() {
        String body = "{\"source\":{\"query\":{\"term\":{\"tag\":\"{{=<% %>=}}\"}}},"
                + "\"params\":{}}";
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search/template", body),
                "对象 source 切换 Mustache 分隔符");
    }

    @Test
    public void termsEnum与rankEval的body同样过二级索引守卫() {
        String body = "{\"field\":\"u\",\"index_filter\":{\"terms\":{\"u\":"
                + "{\"index\":\".security\",\"id\":\"1\",\"path\":\"username\"}}}}";
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs/_terms_enum", body),
                "_terms_enum 无 body 守卫");
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs/_rank_eval", body),
                "_rank_eval 无 body 守卫");
    }

    @Test
    public void pipeline无法确认目标时failClosed() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_bulk?pipeline=admin_pipe",
                        "{\"index\":{\"_id\":\"1\"}}\n{\"x\":1}\n"),
                "raw bulk 管道可 reroute 到控制面");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_reindex",
                        "{\"source\":{\"index\":\"logs\"},\"dest\":{\"index\":\"copy\","
                                + "\"pipeline\":\"admin_pipe\"}}"),
                "reindex dest.pipeline 可 reroute 到控制面");
    }

    @Test
    public void Mustache分隔符切换拒绝() {
        String inline = "{{=<% %>=}}{\"query\":{\"terms\":{\"f\":{\"index\":\"<%idx%>\","
                + "\"id\":\"1\"}}}}";
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search/template",
                        "{\"inline\":" + quote(inline) + "}"),
                "分隔符切换后占位符扫描失效");
    }

    @Test
    public void render模板路径id形态拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_render/template/admin-tpl", null),
                "路径 id 绕过 body 的已存模板拒绝");
    }

    @Test
    public void render模板内联source仍放行() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_render/template",
                        "{\"source\":{\"query\":{\"match_all\":{}}}}"),
                "内联 source 不回显服务端已存模板");
    }

    @Test
    public void 索引级health枚举路径形态同样拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cluster/health/_all?level=indices", null),
                "_all health 索引级视图");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cluster/health/logs?level=shards", null),
                "索引 health 分片级视图");
    }

    @Test
    public void 集群级health仍放行() {
        assertAllowed(() -> admin.guardRawGuarded("GET", "/_cluster/health", null),
                "集群级 health 不返回索引名");
    }

    @Test
    public void updateByQuery脚本触碰index时拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_update_by_query",
                        "{\"query\":{\"match_all\":{}},"
                                + "\"script\":{\"lang\":\"painless\","
                                + "\"source\":\"ctx._index='esquerystudio_user'\"}}"),
                "旧版 ES 可用脚本改写目标索引");
    }

    @Test
    public void updateByQuery已存脚本id拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_update_by_query",
                        "{\"query\":{\"match_all\":{}},\"script\":{\"id\":\"admin-script\"}}"),
                "已存脚本无法静态审计");
    }

    @Test
    public void updateByQuery普通source脚本仍放行() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_update_by_query",
                        "{\"query\":{\"match_all\":{}},\"script\":{\"lang\":\"painless\","
                                + "\"source\":\"ctx._source.n = 1\"}}"),
                "仅更新文档字段的脚本");
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
    }

/** 批次 986：DevTools 残留绕过（bulk 动作级管道 / _update 脚本 / SQL filter / 多词向量 / rank_eval 模板 / 快照逗号通配）。 */
    public static class EsIndexAdminRawHarden986 {

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
    public void bulk动作级pipeline不能绕过查询串管道守卫() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_bulk",
                        "{\"index\":{\"_index\":\"logs\",\"pipeline\":\"reroute_console\"}}\n{\"x\":1}\n"),
                "动作行 pipeline 可改写目标索引");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_bulk",
                        "{\"index\":{\"pipeline\":\"reroute_console\"}}\n{\"x\":1}\n"),
                "路径前缀 bulk 的动作行 pipeline 同样要守");
    }

    @Test
    public void update脚本即使拼接index也不能放行() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_update/1",
                        "{\"script\":{\"source\":\"ctx['_'+'index']='esquerystudio_user'\"}}"),
                "_update 脚本可改写目标索引");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_update_by_query",
                        "{\"query\":{\"match_all\":{}},\"script\":{\"source\":\"ctx['_'+'index']='esquerystudio_user'\"}}"),
                "update_by_query 拼接 _index");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_update_by_query",
                        "{\"query\":{\"match_all\":{}},\"script\":{\"id\":\"stored-script\"}}"),
                "已存脚本无法静态审计");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_update_by_query",
                        "{\"query\":{\"match_all\":{}},\"script\":{\"source\":"
                                + "\"ctx['_'+params.s]='esquerystudio_user'\",\"params\":{\"s\":\"index\"}}}"),
                "ctx 方括号拼接参数");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_update_by_query",
                        "{\"query\":{\"match_all\":{}},\"script\":{\"source\":"
                                + "\"ctx['_'.concat(params.s)]='esquerystudio_user'\",\"params\":{\"s\":\"index\"}}}"),
                "ctx concat 参数");
    }

    @Test
    public void update无脚本与批量无脚本仍放行() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_update/1",
                "{\"doc\":{\"x\":1}}"), "普通局部更新");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_update_by_query",
                "{\"query\":{\"match_all\":{}}}"), "普通按查询更新");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_bulk",
                "{\"index\":{\"_index\":\"logs\"}}\n{\"x\":1}\n"), "无 pipeline 的 bulk");
    }

    @Test
    public void sqlFilter是二级数据源必须过查询守卫() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_sql",
                        "{\"query\":\"SELECT * FROM logs\",\"filter\":{\"terms\":{\"u\":"
                                + "{\"index\":\".security\",\"id\":\"x\",\"path\":\"username\"}}}}"),
                "_sql.filter 可读控制面索引");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_sql",
                        "{\"query\":\"SELECT * FROM logs\",\"filter\":{\"term\":{\"tag\":\"a\"}}}"),
                "业务字段 filter");
    }

    @Test
    public void 多词向量docs索引必须逐个校验() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_mtermvectors",
                        "{\"docs\":[{\"_index\":\".security\",\"_id\":\"x\",\"fields\":[\"username\"]}]}"),
                "根路径 docs[]._index");
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs/_mtermvectors",
                        "{\"docs\":[{\"_index\":\"esquerystudio_user\",\"_id\":\"x\"}]}"),
                "索引前缀 docs[]._index");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_mtermvectors",
                        "{\"ids\":[\"x\"],\"parameters\":{\"index\":\".security\",\"fields\":[\"username\"]}}"),
                "parameters.index 二级目标");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/_mtermvectors",
                        "{\"docs\":[{\"_index\":\"logs\",\"_id\":\"x\",\"fields\":[\"msg\"]}]}"),
                "业务索引词向量");
    }

    @Test
    public void rankEval按已存模板id执行必须拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs/_rank_eval",
                        "{\"requests\":[{\"id\":\"r\",\"template_id\":\"admin-tpl\",\"params\":{}}],"
                                + "\"metric\":{\"precision\":{\"k\":1,\"relevant_rating_threshold\":1}}}"),
                "template_id 会执行已存模板");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_rank_eval",
                        "{\"requests\":[{\"id\":\"r\",\"template_id\":\"admin-tpl\"}]}"),
                "根路径 template_id");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/logs/_rank_eval",
                        "{\"requests\":[{\"id\":\"r\",\"request\":{\"query\":{\"match_all\":{}}}}],"
                                + "\"metric\":{\"precision\":{\"k\":1,\"relevant_rating_threshold\":1}}}"),
                "内联 request");
    }

    @Test
    public void pipeline引用必须按定义拒绝嵌套与改写处理器() {
        /* 无客户端时读不到定义即 fail-closed；有客户端时由 guardPipelineRef 结构化拒绝。 */
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_bulk?pipeline=nested",
                        "{\"index\":{\"_id\":\"1\"}}\n{\"x\":1}\n"),
                "pipeline 定义不可确认时不放行");
    }

    @Test
    public void 已存脚本写入时拒绝控制面字面量与index改写() {
        assertRejected(() -> {
            try {
                admin.putStoredScript("s1", "{\"script\":{\"lang\":\"painless\","
                        + "\"source\":\"ctx._source.t='.security'\"}}");
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "脚本体含控制面字面量");
        assertRejected(() -> {
            try {
                admin.putStoredScript("s2", "{\"script\":{\"lang\":\"painless\","
                        + "\"source\":\"ctx._index='other'\"}}");
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "脚本体改写 _index");
    }

    @Test
    public void 快照恢复逗号通配拆成独立模式() {
        java.util.List<String> parts = EsIndexAdmin.snapshotPatternParts("logs*,-x, metrics-?");
        assertTrue(parts.contains("logs*"));
        assertTrue(parts.contains("metrics-?"));
        assertFalse("排除项不得当作正向目标", parts.contains("-x"));
        assertTrue(EsIndexAdmin.snapshotPatternParts("logs-*").contains("logs-*"));
    }
    }

/**
 * 批次 987：raw 通道收口——全集群 PIT/scroll 按方法放行、已存搜索模板的路径 id 形态、
 * 索引表达式加号前缀、系统读补项、系统段大小写归一、中段 _all、boost 目标与 _cat 限定列名。
 */
    public static class EsIndexAdminRawHarden987 {

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
    public void 根路径开PIT与续读scroll按方法收口() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_pit", "{\"keep_alive\":\"1m\"}"),
                "开全集群 PIT 等价全量读");
        assertAllowed(() -> admin.guardRawGuarded("DELETE", "/_pit", "{\"x\":\"y\"}"),
                "关闭自己持有的 PIT 资源仍可用");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_search/scroll",
                        "{\"scroll\":\"1m\",\"scroll_id\":\"abc\"}"),
                "续读 scroll 无法验明上下文归属");
        assertAllowed(() -> admin.guardRawGuarded("DELETE", "/_search/scroll", "{\"scroll_id\":[\"abc\"]}"),
                "显式清理 scroll 资源仍可用");
    }

    @Test
    public void 限定索引PIT仍可用() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_pit", "{\"keep_alive\":\"1m\"}"),
                "限定业务索引开 PIT");
        assertRejected(() -> admin.guardRawGuarded("POST", "/.security/_pit", "{\"keep_alive\":\"1m\"}"),
                "限定形态的系统索引仍要拒");
    }

    @Test
    public void scroll读形态兜底拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search/scroll?scroll=1m", null),
                "GET scroll 进入系统读拒绝清单");
    }

    @Test
    public void 已存搜索模板路径id形态拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search/template/tpl-console", null),
                "根路径按已存 id 执行模板");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_search/template/tpl-console", "{}"),
                "根路径 POST 同样拒");
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs/_search/template/tpl-console", null),
                "索引前缀路径 id 同样拒");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search/template/tpl-console", "{}"),
                "索引前缀 POST 同样拒");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_search/template",
                        "{\"source\":{\"query\":{\"match_all\":{}}}}"),
                "内联 source 模板照旧放行");
    }

    @Test
    public void 索引表达式加号前缀归一后判定() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/+.security/_search?q=x", null),
                "路径段加号前缀的系统索引变体");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_bulk",
                        "{\"index\":{\"_index\":\"+.security\"}}\n{}\n"),
                "bulk 行 _index 的加号前缀变体");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/+logs/_search?q=x", null),
                "加号前缀的业务索引归一后放行");
    }

    @Test
    public void 系统读补项() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/hot_threads", null), "热线程栈");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_dangling", null), "悬挂索引");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_xpack", null), "许可特性根");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_script_context", null), "脚本上下文");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_async_search/status/j1", null), "异步搜索状态");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_migration/deprecations", null), "废弃项面");
    }

    @Test
    public void 中段全量形态拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cluster/health/_all", null),
                "health 路径中段 _all");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/indices/_all?format=json&h=index", null),
                "cat 路径中段 _all");
    }

    @Test
    public void boost目标过索引守卫() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search",
                        "{\"query\":{\"match_all\":{}},\"index_boost\":[{\"index\":\".security\",\"boost\":2}]}"),
                "index_boost 数组形态引用系统索引");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search",
                        "{\"query\":{\"match_all\":{}},\"indices_boost\":{\".security\":2}}"),
                "indices_boost 对象键形态引用系统索引");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_search",
                        "{\"query\":{\"match_all\":{}},\"indices_boost\":{\"logs\":1.5}}"),
                "业务索引 boost 放行");
    }

    @Test
    public void cat限定列名与大小写归一() {
        assertAllowed(() -> admin.guardRawGuarded("GET", "/_cat/indices?format=json&h=index.health", null),
                "h=index.health 完全限定列名计为含 index 列");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/indices?format=json&h=docs.count", null),
                "无 index 列仍拒");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_CAT/INDICES?h=index", null),
                "大写 cat 变体缺 format 仍拒");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_SECURITY/user", null),
                "大写系统读变体仍拒");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_MSEARCH",
                        "{\"index\":\"logs\"}\n{\"query\":{\"match_all\":{}}}\n"),
                "大写系统写归一后走同一白名单与守卫");
    }
    }

/**
 * 非 ADMIN raw 透传的增量加固：索引级分片拓扑读与根形态同权拒绝、
 * reindex 源索引显式化、嵌套形态的已存模板引用识别。
 */
    public static class EsIndexAdminRawHarden999 {

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
    public void 索引级分片拓扑读与根形态同权拒绝() {
        /* 根形态已在系统读拒绝清单（既有锁），索引前缀变体不得绕行 */
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs-2026/_stats", null), "索引级 _stats");
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs-2026/_recovery", null), "索引级 _recovery");
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs-2026/_segments", null), "索引级 _segments");
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs-2026/_shard_stores", null), "索引级 _shard_stores");
        /* 带度量细分子路径与 source 参数形态同权 */
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs-2026/_stats/docs,store", null), "子路径度量");
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs-2026/_stats?source=%7B%7D", null), "source 形态");
        assertRejected(() -> admin.guardRawGuarded("HEAD", "/logs-2026/_stats", null), "HEAD 形态");
        /* 大小写变体随既有归一口径同拒 */
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs-2026/_STATS", null), "大写变体");
        /* 业务检索读不受影响（防误拦面） */
        assertAllowed(() -> admin.guardRawGuarded("GET", "/logs-2026/_search", null), "索引级检索");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/logs-2026/_count", null), "索引级 count");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/logs-2026/_search/scroll", null), "索引级 scroll 读");
    }

    @Test
    public void reindex必须显式指定源索引() {
        assertRejected(() -> admin.guardReindexBody(
                "{\"source\":{\"query\":{\"match_all\":{}}},\"dest\":{\"index\":\"copy\"}}"), "source 缺 index");
        assertRejected(() -> admin.guardReindexBody(
                "{\"dest\":{\"index\":\"copy\"}}"), "source 整体缺席");
        assertRejected(() -> admin.guardReindexBody(
                "{\"source\":{\"index\":\"\"},\"dest\":{\"index\":\"copy\"}}"), "空串 index");
        /* 显式业务源保持放行（防误拦面） */
        assertAllowed(() -> admin.guardReindexBody(
                "{\"source\":{\"index\":\"logs-*\"},\"dest\":{\"index\":\"copy\"}}"), "显式业务源");
    }

    @Test
    public void 嵌套形态的已存模板引用同权拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_render/template",
                "{\"template\":{\"id\":\"admin-tpl\"}}"), "嵌套 template.id");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_search",
                "{\"template\":{\"id\":\"admin-tpl\"}}"), "搜索体嵌套 template.id");
        /* 嵌套内联 source 是合法形态（last-field-wins 下无 id 覆盖面） */
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_render/template",
                "{\"template\":{\"source\":{\"query\":{\"match_all\":{}}}}}"), "嵌套内联 source");
    }
    }
}
