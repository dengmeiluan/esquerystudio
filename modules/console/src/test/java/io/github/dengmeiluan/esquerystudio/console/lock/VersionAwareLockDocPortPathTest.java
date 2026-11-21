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

package io.github.dengmeiluan.esquerystudio.console.lock;

import io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps;
import io.github.dengmeiluan.esquerystudio.console.multicluster.HostEsVersionProvider;
import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * -67：<b>真实</b> {@link VersionAwareLockDocPort} 拼出来的 path 形态看守。
 *
 * <p>{@link LockDocPortRequestShapeTest} 用桩端口验证「锁存储层怎么用端口」，
 * 本测试补上另一半——<b>端口自己拼出来的 path 长什么样</b>。缺了这一半，
 * 端口实现里把路径写成 {@code /_create/} 也不会有任何测试变红。</p>
 *
 * <p>这里不发真实 HTTP：{@code perform} 的入参（method + path）才是判据，
 * 通过覆写协议钩子把它们记录成<b>值</b>再断言。</p>
 *
 * @author aicoding
 */
public class VersionAwareLockDocPortPathTest {

    /** 捕获真实端口拼出的 method+path，不联网。 */
    private static class CapturingPort extends VersionAwareLockDocPort {
        String lastMethod;
        String lastPath;
        String lastBody;
        int headStatus = 200;
        /** 每次 perform 记一笔 body，用来断言「第二发」长什么样。 */
        final java.util.List<String> bodies = new java.util.ArrayList<>();
        /** 第几次 perform 调用要抛 400（1 = 首发）；0 = 从不抛。 */
        int throw400OnCall = 0;
        private int performCalls = 0;

        CapturingPort(String hostVersion) {
            super(() -> null, new HostEsVersionProvider(() -> null) {
                @Override
                public String currentVersion() {
                    return hostVersion;
                }
            });
        }

        @Override
        protected int statusOf(String method, String path) {
            this.lastMethod = method;
            this.lastPath = path;
            return headStatus;
        }

        @Override
        protected String perform(String method, String path, String jsonBody) throws java.io.IOException {
            this.lastMethod = method;
            this.lastPath = path;
            this.lastBody = jsonBody;
            this.bodies.add(jsonBody);
            if (++performCalls == throw400OnCall) {
                // 仿真 6.x 对 typeless mappings 的真实 400 回包
                throw org.elasticsearch.client.EsFakeClients.responseException(400,
                        "{\"error\":{\"type\":\"mapper_parsing_exception\","
                                + "\"reason\":\"Root mapping definition has unsupported parameters:  "
                                + "[properties : {owner={type=keyword}}]\"},\"status\":400}");
            }
            // 返回一个可被 get() 解析的最小响应
            return "{\"found\":true,\"_seq_no\":5,\"_primary_term\":1,\"_source\":{}}";
        }
    }

    /**
     * <b>本任务的核心形态断言</b>：createIfAbsent 必须发
     * {@code PUT /{index}/_doc/{id}?op_type=create}（6.7.2 实测 201），
     * <b>绝不能</b>发 {@code PUT /{index}/_create/{id}}（6.7.2 实测 400 invalid_type_name_exception）。
     *
     * <p>证伪：把实现里的 {@code "/" + index + "/" + DOC_TYPE + "/" + enc(id) + "?op_type=create"}
     * 改成 {@code "/" + index + "/_create/" + enc(id)} —— 本条立刻红，且红在 path 这个值上。</p>
     */
    @Test
    public void createIfAbsent_emitsDocRouteWithOpTypeCreate() throws Exception {
        for (String version : new String[]{"6.7.2", "7.10.2", null}) {
            CapturingPort port = new CapturingPort(version);
            port.createIfAbsent("lock_idx", "bond_basic", Collections.emptyMap());

            assertEquals("PUT", port.lastMethod);
            assertEquals("宿主版本=" + version + " 时形态必须是 6.x/7.x 双兼容的 _doc 路由",
                    "/lock_idx/_doc/bond_basic?op_type=create", port.lastPath);
            assertFalse("绝不能出现 7.0+ 专有 /_create/ 路由（6.x 上 400）",
                    port.lastPath.contains("/_create/"));
        }
    }

    /** CAS 覆写：if_seq_no / if_primary_term 必须真的出现在 path 上。 */
    @Test
    public void replaceIfUnchanged_emitsCasQueryParams() throws Exception {
        CapturingPort port = new CapturingPort("6.7.2");
        port.replaceIfUnchanged("lock_idx", "k", Collections.emptyMap(), 11, 4);
        assertEquals("/lock_idx/_doc/k?if_seq_no=11&if_primary_term=4", port.lastPath);
    }

    /** 条件删除同理——契约是 path 上的值。 */
    @Test
    public void deleteIfUnchanged_emitsCasQueryParams() throws Exception {
        CapturingPort port = new CapturingPort("6.7.2");
        port.deleteIfUnchanged("lock_idx", "k", 7, 2);
        assertEquals("DELETE", port.lastMethod);
        assertEquals("/lock_idx/_doc/k?if_seq_no=7&if_primary_term=2", port.lastPath);
    }

    /** 读锁文档也走 typed 形态（6.x 上 /{index}/_doc/{id} 合法，7.x 同样合法）。 */
    @Test
    public void get_emitsDocRoute() throws Exception {
        CapturingPort port = new CapturingPort("6.7.2");
        LockDocPort.LockDoc doc = port.get("lock_idx", "k");
        assertEquals("/lock_idx/_doc/k", port.lastPath);
        assertEquals(5L, doc.seqNo());
        assertEquals(1L, doc.primaryTerm());
    }

    /**
     * 建锁索引：宿主确定为 6.x 时 mappings 必须带 {@code _doc} 包层
     * （6.7.2 实测：不带包层 400 mapper_parsing_exception）。
     */
    @Test
    public void createIndex_wrapsDocTypeLayerFor6x() throws Exception {
        CapturingPort port = new CapturingPort("6.7.2");
        port.createIndex("lock_idx", "{\"properties\":{\"owner\":{\"type\":\"keyword\"}}}");
        assertEquals("/lock_idx", port.lastPath);
        assertTrue("6.x 必须带 _doc 包层，否则 mapper_parsing_exception",
                port.lastBody.contains("\"mappings\":{\"_doc\":{"));
    }

    /** 7.x 确定时不包 type 层。 */
    @Test
    public void createIndex_noTypeLayerFor7x() throws Exception {
        CapturingPort port = new CapturingPort("7.10.2");
        port.createIndex("lock_idx", "{\"properties\":{\"owner\":{\"type\":\"keyword\"}}}");
        assertFalse("7.x 不得包 _doc 层", port.lastBody.contains("\"_doc\""));
        assertTrue(port.lastBody.contains("\"mappings\":{\"properties\""));
    }

    /** 宿主版本未知时先发 typeless（400 后由实现 typed 重试，见下一条）。 */
    @Test
    public void createIndex_unknownStartsTypeless() throws Exception {
        CapturingPort port = new CapturingPort(null);
        assertEquals(EsVersionCaps.MappingTypeMode.UNKNOWN, EsVersionCaps.mappingTypeMode(null));
        port.createIndex("lock_idx", "{\"properties\":{\"owner\":{\"type\":\"keyword\"}}}");
        assertFalse(port.lastBody.contains("\"_doc\""));
    }

    /**
     * <b>M1：UNKNOWN 的 typeless→typed 重试是全类<u>唯一</u>真正按 UNKNOWN 分叉的逻辑</b>，
     * 必须被覆盖。
     *
     * <p>此前只有 {@code createIndex_unknownStartsTypeless} 断言「第一发是 typeless」，
     * 重试路径零覆盖——<b>把 catch 块整个删掉，那条测试照样全绿</b>：
     * 典型的「守卫与被守卫者同控制流时一起被杀」。</p>
     *
     * <p>判据落在<b>第二发请求体</b>这个值上：必须出现 {@code "mappings":{"_doc":{}}} 包层，
     * 否则 6.x 上锁索引永远建不出来。</p>
     *
     * <p>证伪：删掉 {@code createIndex} 里的 {@code catch (ResponseException e)} 整块
     * —— 本条立刻红（400 直接冒泡出来）。</p>
     */
    @Test
    public void createIndex_unknown400_retriesWithTypedLayer() throws Exception {
        CapturingPort port = new CapturingPort(null);
        port.throw400OnCall = 1; // 首发 typeless 被 6.x 拒

        port.createIndex("lock_idx", "{\"properties\":{\"owner\":{\"type\":\"keyword\"}}}");

        assertEquals("必须重试一次，共两发", 2, port.bodies.size());
        assertFalse("首发必须是 typeless", port.bodies.get(0).contains("\"_doc\""));
        assertTrue("第二发必须带 _doc 包层，否则 6.x 上建不出锁索引",
                port.bodies.get(1).contains("\"mappings\":{\"_doc\":{"));
        assertEquals("/lock_idx", port.lastPath);
    }

    /**
     * 非 400 的错误<b>不得</b>被重试吞掉——重试分支不许宽到把真故障也当成「疑似 6.x」。
     *
     * <p>没有这条，把 catch 里的状态码判断删成「任何 ResponseException 都重试」也能全绿。</p>
     */
    @Test
    public void createIndex_non400_isNotRetried() throws Exception {
        CapturingPort port = new CapturingPort(null);
        port.throw400OnCall = 0;
        VersionAwareLockDocPort failing = new VersionAwareLockDocPort(() -> null,
                new HostEsVersionProvider(() -> null) {
                    @Override
                    public String currentVersion() {
                        return null;
                    }
                }) {
            @Override
            protected String perform(String method, String path, String jsonBody) throws java.io.IOException {
                throw org.elasticsearch.client.EsFakeClients.responseException(403,
                        "{\"error\":{\"type\":\"security_exception\"},\"status\":403}");
            }
        };

        try {
            failing.createIndex("lock_idx", "{\"properties\":{}}");
            fail("403 不是 400，必须原样抛出而不是 typed 重试");
        } catch (org.elasticsearch.client.ResponseException expected) {
            assertEquals(403, expected.getResponse().getStatusLine().getStatusCode());
        }
    }

    /**
     * <b>6.7.2 演练首跑栽在这里的回归看守</b>：低层 RestClient 对 {@code HEAD} 的 404
     * <b>不抛 ResponseException</b>，而是正常返回 Response。
     *
     * <p>原实现按「抛异常 = 不存在」写，于是<b>不存在的索引被判成"存在"</b>，
     * {@code ensureIndex} 直接跳过建索引，锁索引根本没建出来。
     * 这是「判据落在控制流（有没有抛异常）而不是值（状态码）上」的又一例。</p>
     *
     * <p>证伪：把 {@code indexExists} 改回 {@code perform(...); return true;} —— 本条立刻红。</p>
     */
    @Test
    public void indexExists_decidesOnStatusCodeNotOnExceptionControlFlow() throws Exception {
        CapturingPort absent = new CapturingPort("6.7.2");
        absent.headStatus = 404;
        assertFalse("HEAD 404 必须判为不存在（低层客户端此时不抛异常）", absent.indexExists("lock_idx"));

        CapturingPort present = new CapturingPort("6.7.2");
        present.headStatus = 200;
        assertTrue("HEAD 200 必须判为存在", present.indexExists("lock_idx"));
    }
}
