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
 * 非 ADMIN raw 透传的增量加固：索引级分片拓扑读与根形态同权拒绝、
 * reindex 源索引显式化、嵌套形态的已存模板引用识别。
 */
public class EsIndexAdminRawHarden999Test {

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
