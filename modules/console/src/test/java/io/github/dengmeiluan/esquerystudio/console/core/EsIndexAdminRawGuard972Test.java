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

/**
 * 非 ADMIN raw 透传的控制面纵深守卫：结构化端点上已有的 reindex/快照/别名/
 * 模板/SQL 专用守卫必须在 raw 通道同样生效，且系统级全量搜索不得绕过索引范围。
 */
public class EsIndexAdminRawGuard972Test {

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
    public void 系统级全量搜索必须显式索引() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search", null), "_search 无索引");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_search",
                "{\"query\":{\"match_all\":{}}}"), "_search 全量 body");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search?index=*", null), "_search 通配");
        assertRejected(() -> admin.guardRawGuarded("GET", "/_count", null), "_count 无索引");
        /* 1005 收紧：查询参数不构成目标限定（无法证明目标端按其路由，忽略即全量）——
           业务索引必须写在路径里。 */
        assertRejected(() -> admin.guardRawGuarded("GET", "/_search?index=logs-*", null),
                "查询参数不构成目标限定");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/logs-*/_search", null), "路径限定索引");
    }

    @Test
    public void msearch索引头必须显式且不得命中控制面() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_msearch",
                "{}\n{\"query\":{\"match_all\":{}}}\n"), "缺索引头=全量");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_msearch",
                "{\"index\":\"*\"}\n{}\n"), "通配索引头");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_msearch",
                "{\"index\":\"esquerystudio_user\"}\n{}\n"), "控制面索引头");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_msearch",
                "{\"index\":\"logs-*\"}\n{}\n"), "业务索引头");
    }

    @Test
    public void mget不得读取控制面文档() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_mget",
                "{\"docs\":[{\"_index\":\"esquerystudio_user\",\"_id\":\"admin\"}]}"), "控制面 _index");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/_mget",
                "{\"docs\":[{\"_index\":\"logs-2026\",\"_id\":\"1\"}]}"), "业务 _index");
    }

    @Test
    public void reindex只能走专属端点_raw一律拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_reindex",
                "{\"source\":{\"index\":\"*\"},\"dest\":{\"index\":\"copy\"}}"), "source 通配");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_reindex",
                "{\"source\":{\"index\":\"logs-*\"},\"dest\":{\"index\":\"esquerystudio_copy\"}}"), "dest 控制面");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_reindex",
                "{\"source\":{\"index\":\"logs-*\"},\"dest\":{\"index\":\"copy\"}}"), "raw 业务 reindex");
        assertAllowed(() -> admin.guardReindexBody(
                "{\"source\":{\"index\":\"logs-*\"},\"dest\":{\"index\":\"copy\"}}"), "专属端点业务 reindex");
    }

    @Test
    public void 快照恢复只能走专属端点_raw一律拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_snapshot/repo/snap/_restore", "{}"),
                "恢复全部");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_snapshot/repo/snap/_restore",
                "{\"indices\":\"*\"}"), "恢复通配");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_snapshot/repo/snap/_restore",
                "{\"indices\":\"logs-*\"}"), "raw 恢复业务索引");
        assertAllowed(() -> admin.guardRestoreBody("{\"indices\":\"logs-*\"}"), "专属端点恢复业务索引");
    }

    @Test
    public void 别名只能走专属端点_raw一律拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_aliases",
                "{\"actions\":[{\"add\":{\"index\":\"*\",\"alias\":\"rest\"}}]}"), "通配别名");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_aliases",
                "{\"actions\":[{\"add\":{\"index\":\"esquerystudio*\",\"alias\":\"rest\"}}]}"), "控制面别名");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_aliases",
                "{\"actions\":[{\"add\":{\"indices\":[\"*\"],\"alias\":\"rest\"}}]}"), "复数通配别名");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_aliases",
                "{\"actions\":[{\"add\":{\"index\":\"logs-*\",\"alias\":\"rest\"}}]}"), "raw 业务别名");
        assertAllowed(() -> admin.guardAliasActionsBody(
                "{\"actions\":[{\"add\":{\"index\":\"logs-*\",\"alias\":\"rest\"}}]}"), "专属端点业务别名");
        assertAllowed(() -> admin.guardAliasActionsBody(
                "{\"actions\":[{\"add\":{\"indices\":[\"logs-*\"],\"alias\":\"rest\"}}]}"), "专属端点复数别名");
    }

    @Test
    public void 模板只能走专属端点_raw一律拒绝() {
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_index_template/x",
                "{\"index_patterns\":[\"*\"],\"template\":{}}"), "索引模板 catch-all");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_template/x",
                "{\"index_patterns\":[\"esquerystudio_*\"],\"settings\":{}}"), "旧模板 catch-all");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/_index_template/x",
                "{\"index_patterns\":[\"logs-*\"],\"template\":{}}"), "raw 业务模板");
        assertAllowed(() -> admin.guardIndexTemplateBody(
                "{\"index_patterns\":[\"logs-*\"],\"template\":{}}"), "专属端点业务模板");
    }

    @Test
    public void sql全量查询拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_sql",
                "{\"query\":\"SELECT * FROM *\"}"), "SQL 全量");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_sql/translate",
                "{\"query\":\"SELECT * FROM esquerystudio_user\"}"), "SQL 控制面");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_sql",
                "{\"query\":\"SELECT * FROM logs-*\"}"), "SQL 业务索引");
    }

    @Test
    public void 请求体unicode转义不得绕过控制面名扫描() {
        String body = "{\"delete\":{\"_index\":\"\\u0065squerystudio_user\",\"_id\":\"admin\"}}\n";
        assertRejected(() -> admin.guardRawGuarded("POST", "/_bulk", body), "bulk 转义控制面");
        assertRejected(() -> admin.guardControlBody(body), "body 守卫转义");
    }

    @Test
    public void SQL全量查询在发往ES前拦截() {
        assertRejected(() -> {
            try { admin.executeSql("SELECT * FROM *", 100); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "结构化 SQL 全量");
        assertRejected(() -> {
            try { admin.executeSql("SELECT * FROM esquerystudio_user", 100); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "结构化 SQL 控制面");
        assertRejected(() -> {
            try { admin.sqlQuery("{\"query\":\"SELECT * FROM *\"}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "SQL JSON 通道全量");
    }
}
