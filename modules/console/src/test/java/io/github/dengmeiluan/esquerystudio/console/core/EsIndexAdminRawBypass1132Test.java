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
 * 1132：控制面索引守卫的<b>主动绕过</b>测试（红队视角）。
 *
 * <p>背景：需求 2 要求「即使绕过前端直接操作，也需彻底杜绝被攻击或权限被绕过」。
 * raw 透传能执行任意 ES API，是唯一能触达控制面索引的通道，因此它的守卫必须是
 * 路径归一化 + 多层级判定，而不是「字符串里含 esquerystudio 就拒」。
 *
 * <p>本类只加<b>此前批次没覆盖的编码/构造手法</b>，已覆盖的（矩阵参数、_all、bulk 管道、
 * _update 脚本、SQL filter、快照逗号通配等）不重复。每个用例都断言「必须拒绝」，
 * 若哪天守卫被放松，这里会立刻变红。</p>
 */
public class EsIndexAdminRawBypass1132Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private void mustReject(String method, String path, String body, String why) {
        try {
            admin.guardRawGuarded(method, path, body);
            fail("应拒绝（" + why + "）：" + method + " " + path);
        } catch (ControlPlaneGuardException expected) {
            /* 期望路径 */
        } catch (RuntimeException e) {
            /* 任何非守卫异常的拒绝同样算拦住；但若是放行则上面已 fail */
        }
    }

    /* ---------------- 大小写与编码变体 ---------------- */

    @Test
    public void 控制面索引的大小写变体不得绕过() {
        for (String idx : new String[]{"esquerystudio_users", "ESQUERYSTUDIO_ELASTICSEARCH_USERS", "ESQUERYSTUDIO_USERS"}) {
            mustReject("POST", "/" + idx + "/_doc/1", "{\"a\":1}", "控制面索引大小写变体");
            mustReject("DELETE", "/" + idx, null, "删除控制面索引（大小写变体）");
        }
    }

    @Test
    public void 百分号编码的索引名不得绕过() {
        /* %65squerystudio_users → esquerystudio_users：目标端会解码后再路由 */
        mustReject("POST", "/%65squerystudio_users/_doc/1", "{\"a\":1}", "百分号编码还原成控制面索引");
        mustReject("POST", "/esquerystudio%5Fusers/_doc/1", "{\"a\":1}", "下划线编码");
    }

    @Test
    public void 系统API第二段的编码索引不得绕过() {
        mustReject("GET", "/_cat/indices/%65squerystudio_users?format=json", null,
                "_cat 路径段编码");
        mustReject("GET", "/_cluster/state/metadata/%65squerystudio_users", null,
                "_cluster/state 元数据读取");
    }

    /* ---------------- 路径构造 ---------------- */

    @Test
    public void 双斜杠与点段拼接不得绕过() {
        mustReject("POST", "//esquerystudio_users/_doc/1", "{\"a\":1}", "双斜杠");
        mustReject("POST", "/logs/../esquerystudio_users/_doc/1", "{\"a\":1}", "点段回退");
        mustReject("POST", "/./esquerystudio_users/_doc/1", "{\"a\":1}", "当前目录段");
    }

    @Test
    public void 逗号多索引表达式不得夹带控制面索引() {
        mustReject("POST", "/logs,esquerystudio_users/_search", "{\"query\":{\"match_all\":{}}}",
                "逗号多索引夹带");
        mustReject("DELETE", "/logs,esquerystudio_users", null, "逗号多索引删除");
        mustReject("POST", "/esquerystudio*/_doc/1", "{\"a\":1}", "通配符命中控制面");
        mustReject("POST", "/esquerystudio_user*/_doc/1", "{\"a\":1}", "通配符中段");
    }

    /* ---------------- 体内容器 ---------------- */

    @Test
    public void mget的docs列表不得夹带控制面索引() {
        mustReject("POST", "/_mget",
                "{\"docs\":[{\"_index\":\"esquerystudio_users\",\"_id\":\"1\"}]}", "mget docs[]._index");
        mustReject("POST", "/logs/_mget",
                "{\"docs\":[{\"_index\":\"esquerystudio_users\",\"_id\":\"1\"}]}", "前缀 mget 夹带");
    }

    @Test
    public void terms_lookup的索引字段不得夹带控制面索引() {
        mustReject("POST", "/logs/_search",
                "{\"query\":{\"terms\":{\"u\":{\"index\":\"esquerystudio_users\",\"id\":\"1\",\"path\":\"username\"}}}}",
                "terms lookup");
    }

    @Test
    public void reindex的远端与源目标不得夹带控制面索引() {
        mustReject("POST", "/_reindex",
                "{\"source\":{\"index\":\"esquerystudio_users\"},\"dest\":{\"index\":\"copy\"}}", "reindex 源");
        mustReject("POST", "/_reindex",
                "{\"source\":{\"index\":\"logs\"},\"dest\":{\"index\":\"esquerystudio_users\"}}", "reindex 目标");
    }

    @Test
    public void 快照与模板体不得夹带控制面索引() {
        mustReject("PUT", "/_snapshot/repo/snap1",
                "{\"indices\":\"esquerystudio_users\"}", "快照备份控制面索引");
        mustReject("PUT", "/_index_template/t1",
                "{\"index_patterns\":[\"esquerystudio*\"],\"template\":{}}", "模板覆盖控制面索引");
    }

    /* ---------------- 查询串 ---------------- */

    @Test
    public void source查询参数不得成为体旁路() {
        /* 直接写字面编码，避免 URLEncoder 的受检异常污染用例意图 */
        mustReject("POST", "/_mget?source="
                        + "%7B%22docs%22%3A%5B%7B%22_index%22%3A%22esquerystudio_users%22%2C%22_id%22%3A%221%22%7D%5D%7D",
                null, "?source= 夹带控制面索引");
    }

    @Test
    public void index查询参数不得充当目标() {
        /* 注意：routing/preference 的值是「分片路由/节点偏好」，ES 不会拿它当索引去读，
           不构成控制面触达——把它们也拒掉反而是误拦（正常写入带 routing 很常见）。
           真正危险的是 index/indices 查询参数：ES 会用它覆盖路径里的目标。 */
        mustReject("POST", "/logs/_doc/1?refresh=true&index=esquerystudio_users", "{\"a\":1}",
                "index 查询参数充当目标");
        mustReject("POST", "/logs/_search?indices=esquerystudio_users", "{\"query\":{\"match_all\":{}}}",
                "indices 查询参数充当目标");
        mustReject("POST", "/logs/_doc/1?" + "%69ndex=esquerystudio_users", "{\"a\":1}",
                "参数名编码后的 index");
    }
}
