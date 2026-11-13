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

import static org.junit.Assert.fail;

/** 批次 985：DevTools 残留绕过（重复空索引参数 / Mustache 结构键 / 模板路径 id / health / UBQ 脚本）。 */
public class EsIndexAdminRawHarden985Test {

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
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cluster/stats", null),
                "集群统计");
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
