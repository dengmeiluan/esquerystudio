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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

/**
 * 控制面索引守卫（通用数据端点不得触达 esquerystudio_*）。
 *
 * <p>风险：VIEWER 可通过 /cluster/query、文档 CRUD、bulk/SQL/reindex 读写控制集群里的
 * esquerystudio_user（密码哈希）/ esquerystudio_ops_audit，绕过安全中心与审计权限。守卫覆盖
 * 精确名、通配模式、SQL FROM/JOIN、批量/重索引/模板/ILM/快照 body 与目录穿越编码。</p>
 */
public class EsIndexAdminControlGuard963Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private static void assertRejected(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    @Test
    public void 控制索引路径拒绝_通配与穿越编码也不放过() {
        assertRejected(() -> admin.guardControlPath("/esquerystudio_user/_doc/1"), "精确控制索引");
        assertRejected(() -> admin.guardControlPath("/ESQUERYSTUDIO_ELASTICSEARCH_USER/_search"), "大小写变体");
        assertRejected(() -> admin.guardControlPath("/%65squerystudio_user/_doc/1"), "百分号编码");
        assertRejected(() -> admin.guardControlPath("/%2e%2e/esquerystudio_user/_search"), "目录穿越");
        assertRejected(() -> admin.guardControlPath("/esquerystudio*/_search"), "通配控制索引");
        assertRejected(() -> admin.guardControlPath("/%2A/_search"), "全量通配");
        assertRejected(() -> admin.guardControlPath("/esquerystudio_validate_123/_mapping"), "校验器临时索引走公开路径");
        admin.guardControlPath("/logs-*/_search");
        assertRejected(() -> admin.guardControlPath("/_all/_search"), "全量别名路径");
        admin.guardControlPath("/_cluster/health");
    }

    @Test
    public void 控制索引名与模式_校验临时索引只走专用通道() {
        assertRejected(() -> admin.guardIndexName("esquerystudio_validate_1"), "校验器临时索引走通用写通道");
        admin.guardIndexName("logs-2026");
        assertRejected(() -> admin.guardIndexName("esquerystudio_user"), "用户库");
        assertRejected(() -> admin.guardIndexName("../esquerystudio_user"), "穿越名");

        assertRejected(() -> admin.guardIndexPattern("*"), "全量");
        assertRejected(() -> admin.guardIndexPattern("_all"), "全量别名");
        assertRejected(() -> admin.guardIndexPattern("esquerystudio_*"), "es 前缀通配");
        assertRejected(() -> admin.guardIndexPattern("e*"), "e 前缀通配");
        assertRejected(() -> admin.guardIndexPattern("logs-*,esquerystudio_user"), "逗号列表夹带");
        admin.guardIndexPattern("logs-*");
        assertRejected(() -> admin.guardIndexPattern("esquerystudio_validate_*"), "校验器临时索引通配走公开模式");
    }

    @Test
    public void 请求体与SQL守卫() {
        assertRejected(() -> admin.guardControlBody("{\"query\":\"SELECT * FROM esquerystudio_user\"}"), "body 字面");
        assertRejected(() -> admin.guardControlBody("{\"source\":{\"index\":\"esquerystudio_ops_audit\"}}"), "reindex body");
        assertRejected(() -> admin.guardSql("SELECT * FROM esquerystudio_user"), "SQL 精确");
        assertRejected(() -> admin.guardSql("SELECT * FROM *"), "SQL 全量通配");
        assertRejected(() -> admin.guardSql("SELECT * FROM logs-* JOIN esquerystudio_audit ON 1=1"), "SQL JOIN");
        admin.guardSql("SELECT * FROM logs-*");
        admin.guardControlBody("{\"doc\":{\"message\":\"hello\"}}");
        assertRejected(() -> admin.guardReindexBody("{\"source\":{\"index\":\"*\"},\"dest\":{\"index\":\"copy\"}}"),
                "reindex 全量通配");
        assertRejected(() -> admin.guardReindexBody("{\"source\":{\"index\":[\"logs-*\",\"esquerystudio_user\"]},\"dest\":{\"index\":\"copy\"}}"),
                "reindex 数组夹带");
        admin.guardReindexBody("{\"source\":{\"index\":\"logs-*\"},\"dest\":{\"index\":\"copy\"}}");
        assertRejected(() -> {
            try { admin.rawGuarded("GET", "/_all/_search", null); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "raw 全量路径");
        assertRejected(() -> {
            try { admin.rawGuarded("GET", "/esquerystudio_user/_search", null); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "raw 控制索引");
        assertRejected(() -> {
            try { admin.rawGuarded("POST", "/_bulk",
                    "{\"index\":{\"_index\":\"esquerystudio_ops_audit\"}}\n{}\n"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "raw bulk 控制索引");
        assertRejected(() -> admin.guardRestoreBody(null), "restore 全部（空 body）");
        assertRejected(() -> admin.guardRestoreBody("{\"include_global_state\":true}"), "restore 缺 indices");
        assertRejected(() -> admin.guardRestoreBody("{\"indices\":\"*\"}"), "restore 全量通配");
        assertRejected(() -> admin.guardRestoreBody("{\"indices\":[\"logs-*\",\"esquerystudio_user\"]}"), "restore 夹带控制索引");
        admin.guardRestoreBody("{\"indices\":\"logs-*\"}");
        admin.guardRestoreBody("{\"indices\":[\"logs-2026\",\"orders-*\"]}");
        assertRejected(() -> admin.guardIndexTemplateBody("{\"index_patterns\":[\"*\"]}"), "模板全量通配");
        assertRejected(() -> admin.guardIndexTemplateBody("{\"index_patterns\":[\"esquerystudio_*\"]}"), "模板控制面通配");
        admin.guardIndexTemplateBody("{\"index_patterns\":[\"logs-*\",\"orders-*\"]}");
        admin.guardIndexTemplateBody("{\"template\":{\"settings\":{}}}");
    }

    @Test
    public void SQL表清单解析覆盖引号无空白逗号别名与注释() {
        /* 旧正则漏掉的五类真实载荷：FROM 后无空白、引号列表第二项、引号别名、块/行注释、反引号 */
        assertRejected(() -> admin.guardSql("{\"query\":\"SELECT * FROM\\\"e*\\\"\"}"), "FROM 后无空白");
        assertRejected(() -> admin.guardSql("{\"query\":\"SELECT * FROM \\\"logs\\\", \\\"e*\\\"\"}"), "逗号列表夹带");
        assertRejected(() -> admin.guardSql("{\"query\":\"SELECT * FROM \\\"logs\\\" AS \\\"l\\\", \\\"e*\\\"\"}"),
                "引号别名后的逗号列表");
        assertRejected(() -> admin.guardSql("{\"query\":\"SELECT * FROM/*x*/e*\"}"), "块注释");
        assertRejected(() -> admin.guardSql("{\"query\":\"SELECT * FROM -- x\\ne*\"}"), "行注释");
        assertRejected(() -> admin.guardSql("{\"query\":\"SELECT * FROM `e*`\"}"), "反引号");
        /* 未闭合注释/非法 JSON 必须 fail-closed，不能把整条 SQL 当引号跳过 */
        assertRejected(() -> admin.guardSql("{\"query\":\"SELECT * FROM/*x e*\"}"), "未闭合块注释");
        assertRejected(() -> admin.guardSql("{\"query\":\"SELECT * FROM -- x\ne*\"}"), "JSON 未转义换行");
        assertRejected(() -> admin.guardSql("{\"notQuery\":\"x\"}"), "缺 query");
        /* 合法业务 SQL 与字符串字面量不得误伤 */
        admin.guardSql("{\"query\":\"SELECT * FROM \\\"logs-*\\\"\"}");
        admin.guardSql("{\"query\":\"SELECT * FROM logs AS l, other WHERE x=1\"}");
        admin.guardSql("{\"query\":\"SELECT 'FROM e*' AS x FROM logs-*\"}");
        admin.guardSql("SELECT * FROM logs-* JOIN orders-* ON 1=1");
        admin.guardSql("{\"cursor\":\"abc\"}");
        assertRejected(() -> admin.guardSql("SHOW TABLES"), "元数据枚举");
    }

    @Test
    public void mget路径形式允许省略文档_index_根路径仍禁止全量() {
        admin.guardRawGuarded("POST", "/logs/_mget", "{\"docs\":[{\"_id\":\"1\"}]}");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_mget", "{\"docs\":[{\"_id\":\"1\"}]}"),
                "根 _mget 缺 _index");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_mget",
                "{\"docs\":[{\"_id\":\"1\",\"_index\":\"esquerystudio_user\"}]}"), "文档级控制索引");
    }

    @Test
    public void 文档与脚本路径ID不得携带穿越片段() {
        assertRejected(() -> admin.guardControlPath("/logs/_doc/../../_security/user/admin"), "多段穿越");
        assertRejected(() -> admin.guardControlPath("/logs/_doc/%2e%2e/%2e%2e/_security/user/admin"), "编码穿越");
        assertRejected(() -> EsIndexAdmin.encodePathToken("../../_security/user/admin", "文档 ID"), "ID 穿越");
        assertRejected(() -> EsIndexAdmin.encodePathToken("a/b", "文档 ID"), "ID 斜杠");
        assertRejected(() -> EsIndexAdmin.encodePathToken("a\\b", "脚本 ID"), "ID 反斜杠");
        assertEquals("a%20b%26c", EsIndexAdmin.encodePathToken("a b&c", "文档 ID"));
    }

    @Test
    public void Painless执行体不得读取控制面索引() {
        assertRejected(() -> admin.guardPainlessBody(
                "{\"script\":{\"source\":\"1\"},\"context_setup\":{\"index\":\"esquerystudio_user\"}}"),
                "painless 控制索引上下文");
        assertRejected(() -> admin.guardPainlessBody(
                "{\"index\":[\"logs-*\",\"esquerystudio_user\"]}"), "painless index 数组夹带");
        admin.guardPainlessBody("{\"script\":{\"source\":\"1\"},\"context_setup\":{\"index\":\"logs-*\"}}");
    }

    @Test
    public void 宿主自定义控制索引实名同样受保护() {
        EsIndexAdmin custom = new EsIndexAdmin(null);
        custom.setExtraControlIndexNames(java.util.Arrays.asList("custom_users", "custom-monitor"));
        assertRejected(() -> custom.guardIndexName("custom_users"), "自定义用户库");
        assertRejected(() -> custom.guardIndexName("custom-monitor-2026.10.20"), "自定义监控日期索引");
        assertRejected(() -> custom.guardIndexPattern("custom_users*"), "自定义名通配");
        assertRejected(() -> custom.guardControlBody("{\"source\":{\"index\":\"custom_users\"}}"), "自定义名 body");
        custom.guardIndexName("logs-2026");
    }
}
