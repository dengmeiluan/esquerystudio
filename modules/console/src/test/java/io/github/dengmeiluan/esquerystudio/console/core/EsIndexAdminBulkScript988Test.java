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
 * 批次 988：bulk update 的伴生文档行 script 与 _update 通道同权——动作行 _index 合法
 * 但脚本改写 ctx._index 到控制面的组合必须拒绝；普通字段更新脚本不受影响。
 */
public class EsIndexAdminBulkScript988Test {

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
    public void bulkUpdate脚本改写目标索引拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_bulk",
                        "{\"update\":{\"_index\":\"logs\",\"_id\":\"1\"}}\n"
                                + "{\"script\":{\"source\":\"ctx._index='esquerystudio_user'\"}}\n"),
                "bulk update 伴生行脚本把文档改写到控制面索引");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_bulk",
                        "{\"update\":{\"_id\":\"1\"}}\n"
                                + "{\"script\":{\"source\":\"ctx['_index']='x_esquerystudio_lock'\"}}\n"),
                "方括号字面量形态同样改写目标索引");
    }

    @Test
    public void bulkUpdate脚本参数拼接拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/_bulk",
                        "{\"update\":{\"_index\":\"logs\",\"_id\":\"1\"}}\n"
                                + "{\"script\":{\"source\":\"ctx[params.k]='v'\","
                                + "\"params\":{\"k\":\"_index\"}}}\n"),
                "params 携带 _index 的动态键访问");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_bulk",
                        "{\"update\":{\"_index\":\"logs\",\"_id\":\"1\"}}\n"
                                + "{\"script\":{\"id\":\"painless-admin-saved\"}}\n"),
                "按已存脚本 id 执行无法静态审计");
    }

    @Test
    public void bulkUpdate普通字段脚本放行() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_bulk",
                        "{\"update\":{\"_index\":\"logs\",\"_id\":\"1\"}}\n"
                                + "{\"script\":{\"source\":\"ctx._source.counter += params.n\","
                                + "\"params\":{\"n\":1}}}\n"),
                "普通字段累加脚本不受影响");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_bulk",
                        "{\"update\":{\"_id\":\"1\"}}\n"
                                + "{\"doc\":{\"level\":\"info\"}}\n"),
                "无脚本的 update doc 形态照旧");
    }

    @Test
    public void bulkIndex动作行不受影响() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_bulk",
                        "{\"index\":{\"_index\":\"logs\",\"_id\":\"1\"}}\n"
                                + "{\"message\":\"hello\"}\n"
                                + "{\"create\":{\"_index\":\"logs\",\"_id\":\"2\"}}\n"
                                + "{\"message\":\"world\"}\n"),
                "index/create 动作正常批量写入");
        assertRejected(() -> admin.guardRawGuarded("POST", "/_bulk",
                        "{\"update\":{\"_index\":\"logs\",\"_id\":\"1\"}}\n"
                                + "{\"script\":{\"lang\":\"expression\",\"source\":\"1\"}}\n"),
                "非 painless 语言仍拒");
    }
}
