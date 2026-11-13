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

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 1007：raw 守卫的残余通道——PIT keep_alive 嵌套形态、_cat/shards 列别名、
 * 根级 _analyze 的 body 目标、ES 作业历史索引行过滤。
 */
public class RawScope1007Test {

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
    public void PIT的keepAlive嵌在pit对象里同样受上限约束() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search",
                "{\"pit\":{\"id\":\"p1\",\"keep_alive\":\"9999d\"},\"size\":1}"),
                "嵌套 pit.keep_alive 绕过根层上限");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_search",
                "{\"pit\":{\"id\":\"p1\",\"keep_alive\":\"30d\"}}"),
                "根级 PIT 搜索的嵌套 keep_alive");
    }

    @Test
    public void PIT上限内的keepAlive仍可用() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_search",
                "{\"pit\":{\"id\":\"p1\",\"keep_alive\":\"5m\"},\"size\":1}"),
                "有权限的运维仍可在上限内使用 PIT");
    }

    @Test
    public void catShards列别名不能绕过拓扑脱敏() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("body", "[{\"index\":\"logs\",\"shard\":\"0\",\"n\":\"node-1\",\"id\":\"abc\","
                + "\"ip\":\"10.0.0.8\",\"unassigned.details\":\"x\"},"
                + "{\"index\":\"ilm-history-000001\",\"shard\":\"0\",\"node\":\"node-2\"}]");
        Map<String, Object> filtered = admin.filterCatControlRows("/_cat/shards", result);
        String body = String.valueOf(filtered.get("body"));
        assertTrue(body.contains("logs"));
        assertTrue(body.contains("shard"));
        assertFalse("节点别名 n 不得漏出", body.contains("node-1"));
        assertFalse("节点 id 不得漏出", body.contains("abc"));
        assertFalse("内网地址不得漏出", body.contains("10.0.0.8"));
        assertFalse("unassigned.* 明细不得漏出", body.contains("unassigned"));
        assertFalse("作业历史索引行应被过滤", body.contains("ilm-history"));
    }

    @Test
    public void 索引维护写在raw仍为ADMIN专属() {
        /* 976/1004 金标准：refresh/flush/cache/forcemerge 在 raw 里属管理/维护写，
           非 ADMIN 一律拒绝（forcemerge 等是可控 DoS 面）；页面端点仍按页写键放行。 */
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_refresh", null), "raw refresh");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_flush", null), "raw flush");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_cache/clear", null), "raw cache clear");
        assertRejected(() -> admin.guardRawGuarded("POST",
                "/logs/_forcemerge?max_num_segments=1", null), "raw forcemerge");
        assertRejected(() -> admin.guardRawGuarded("POST", "/esquerystudio_users/_refresh", null),
                "控制面索引维护写");
    }

    @Test
    public void 已存脚本守卫_允许mustache_拒绝painless改写_index() {
        assertAllowed(() -> admin.guardStoredScript(
                "{\"script\":{\"lang\":\"mustache\",\"source\":\"{\\\"query\\\":{\\\"match_all\\\":{}}}\"}}"),
                "search-templates 页合法的 mustache 模板");
        assertAllowed(() -> admin.guardStoredScript(
                "{\"script\":{\"lang\":\"painless\",\"source\":\"return 1\"}}"),
                "可静态审计的 painless 脚本");
        assertRejected(() -> admin.guardStoredScript(
                "{\"script\":{\"lang\":\"painless\",\"source\":\"ctx._index='evil'\"}}"),
                "painless 改写 _index");
    }

    @Test
    public void 页面PIT搜索的嵌套keepAlive同样受限() throws Exception {
        try {
            admin.pitSearchClamped("{\"pit\":{\"id\":\"p1\",\"keep_alive\":\"9999d\"},\"size\":1}");
            fail("页面 PIT 搜索不得成为 keep_alive 绕过通道");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("超上限"));
        }
    }

    @Test
    public void 根级analyze不得以body目标控制面索引() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_analyze",
                "{\"index\":\"esquerystudio_users\",\"text\":\"a\"}"),
                "body.index 指向控制面索引");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_analyze",
                "{\"index\":\"logs\",\"text\":\"a\"}"),
                "业务索引分析仍可用");
    }
}
