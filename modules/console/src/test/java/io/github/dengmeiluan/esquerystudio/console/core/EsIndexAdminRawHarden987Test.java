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
 * 批次 987：raw 通道收口——全集群 PIT/scroll 按方法放行、已存搜索模板的路径 id 形态、
 * 索引表达式加号前缀、系统读补项、系统段大小写归一、中段 _all、boost 目标与 _cat 限定列名。
 */
public class EsIndexAdminRawHarden987Test {

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
