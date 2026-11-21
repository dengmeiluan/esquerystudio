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
 * PIT/raw 破坏性通配加固：PIT search 不得退化为全集群 _search；
 * 通配 _delete_by_query/_update_by_query 必须解析真实索引名后过控制面守卫。
 */
public class EsIndexAdminPitGuard979Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private interface Throwing {
        void run() throws Exception;
    }

    private static void rejected(Throwing r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (Exception expected) {
            // ok
        }
    }

    @Test
    public void pitSearch必须携带pitId且不得指定index() throws Exception {
        rejected(() -> admin.pitSearch("{\"query\":{\"match_all\":{}}}"), "裸 body=全集群搜索");
        rejected(() -> admin.pitSearch("{\"pit\":{},\"query\":{\"match_all\":{}}}"), "空 pit");
        rejected(() -> admin.pitSearch("{\"pit\":{\"id\":\"\"}}"), "空 pit.id");
        rejected(() -> admin.pitSearch("{\"pit\":{\"id\":\"abc\"},\"index\":\"esquerystudio_user\"}"), "index 覆盖");
        rejected(() -> admin.pitSearch("not-json"), "非法 JSON");
    }

    @Test
    public void pitOpen拒绝控制索引与不可解析通配() throws Exception {
        rejected(() -> admin.pitOpen("esquerystudio_user", "5m"), "控制面索引");
        rejected(() -> admin.pitOpen("logs*", "5m"), "通配无法解析（无客户端=fail-closed）");
    }

    @Test
    public void raw通配破坏性操作解析后拒绝_精确业务索引放行() throws Exception {
        rejected(() -> admin.guardRawGuarded("POST", "/logs*/_delete_by_query", "{}"), "通配 DBQ 无法解析");
        rejected(() -> admin.guardRawGuarded("POST", "/esquerystudio_user/_delete_by_query", "{}"), "精确控制面 DBQ");
        admin.guardRawGuarded("POST", "/logs-2026/_delete_by_query", "{}");
        admin.guardRawGuarded("POST", "/logs-2026/_update_by_query", "{}");
        /* 正文里出现 "esquerystudio" 字样的业务文档不得被误伤（只拦精确前缀/通配形态） */
        admin.guardRawGuarded("POST", "/logs-2026/_search",
                "{\"query\":{\"match\":{\"message\":\"esquerystudio\"}}}");
    }

    @Test
    public void pitSearch拒绝termsLookup通配控制面() throws Exception {
        rejected(() -> admin.pitSearch(
                "{\"pit\":{\"id\":\"abc\"},\"query\":{\"terms\":{\"p\":{\"index\":\"esquerystudio*\"}}}}"),
                "terms lookup 通配控制面");
        rejected(() -> admin.pitSearch(
                "{\"pit\":{\"id\":\"abc\"},\"query\":{\"terms\":{\"p\":{\"index\":\"esquerystudio_conn\"}}}}"),
                "terms lookup 精确控制面");
        rejected(() -> admin.guardRawGuarded("POST", "/logs-2026/_search",
                "{\"query\":{\"terms\":{\"p\":{\"index\":\"esquerystudio*\"}}}}"), "raw terms lookup 通配控制面");
    }

    @Test
    public void 控制面索引识别覆盖账号连接审计与后缀锁() {
        org.junit.Assert.assertTrue(admin.isControlIndex("esquerystudio_user"));
        org.junit.Assert.assertTrue(admin.isControlIndex("esquerystudio_conn"));
        org.junit.Assert.assertTrue(admin.isControlIndex("esquerystudio_ops_audit-2026.10"));
        org.junit.Assert.assertTrue(admin.isControlIndex("logs_esquerystudio_lock"));
        org.junit.Assert.assertTrue(admin.isControlIndex("mig_esquerystudio_migrate_job"));
        org.junit.Assert.assertTrue(admin.isControlIndex(".kibana"));
        org.junit.Assert.assertFalse(admin.isControlIndex("logs-2026"));
    }
}
