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
 * 批次 999：typed 兼容路由收口——旧版把操作动词后置到第 3/4 段的路径形态
 * （/{index}/{type}/{verb} 与 /{index}/{type}/{id}/{verb}）会让「按第 2 段分派」
 * 的 body 守卫全部失明；矩阵参数路径与单数 _termvectors 的跨索引 body 同批收口。
 */
public class EsIndexAdminTypedRoute999Test {

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
    public void typed路由的bulk与update整形态拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_doc/_bulk",
                        "{\"index\":{\"_index\":\".security\"}}"),
                "typed bulk 的动作行 _index 不再被逐行校验看见");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_doc/1/_update",
                        "{\"script\":{\"source\":\"ctx._index='esquerystudio_users'\"}}"),
                "typed update 的脚本守卫不能因动词后置而失明");
    }

    @Test
    public void typed路由的检索与批量读拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_doc/_search",
                        "{\"query\":{\"terms\":{\"x\":{\"index\":\"esquerystudio_users\"}}}}"),
                "typed search 的跨索引 terms lookup 必须拒");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_doc/_msearch", "{}"),
                "typed msearch 的 header index 通道必须拒");
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs/_doc/_stats", null),
                "typed 拓扑读后置段同样命中拒绝");
    }

    @Test
    public void typed路由的索引结构管理拒绝() {
        assertRejected(() -> admin.guardRawGuarded("PUT", "/logs/_doc/_mapping",
                        "{\"properties\":{\"x\":{\"type\":\"keyword\"}}}"),
                "typed put mapping 是索引结构写，必须走专用端点与页写键");
        assertRejected(() -> admin.guardRawGuarded("PUT", "/logs/_doc/_alias/a1", null),
                "typed alias 是别名管理写，必须走专用端点");
    }

    @Test
    public void 合法的文档与检索形态不受影响() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_doc/1", "{\"a\":1}"),
                "typed 文档写（id 非下划线动词）照常放行");
        assertAllowed(() -> admin.guardRawGuarded("GET", "/logs/_doc/1", null),
                "typed 文档读照常放行");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_search", "{}"),
                "常规检索照常放行");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_search/template",
                        "{\"source\":{\"query\":{\"match_all\":{}}}}"),
                "template 段不是操作动词，检索模板 body 形态照常");
    }

    @Test
    public void 矩阵参数路径整体拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET", "/_cat/indices;v", null),
                "守卫按剥分号形态判定而请求原样发出，语义差一律 fail-closed");
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search;x=1", "{}"),
                "索引路径同样不携带矩阵参数");
    }

    @Test
    public void 单数termvectors的跨索引body拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_termvectors",
                        "{\"docs\":[{\"_index\":\"esquerystudio_users\",\"_id\":\"1\"}]}"),
                "单数 _termvectors 的 docs[] 可带 _index 跨索引，与 _mtermvectors 同守卫");
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_termvectors",
                        "{\"fields\":[\"body\"],\"doc\":{\"body\":\"hello\"}}"),
                "本索引内的词向量查询照常放行");
    }
}
