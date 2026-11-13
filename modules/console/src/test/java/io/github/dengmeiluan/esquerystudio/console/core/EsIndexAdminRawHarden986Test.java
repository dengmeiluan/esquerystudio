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

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 批次 986：DevTools 残留绕过（bulk 动作级管道 / _update 脚本 / SQL filter / 多词向量 / rank_eval 模板 / 快照逗号通配）。 */
public class EsIndexAdminRawHarden986Test {

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
