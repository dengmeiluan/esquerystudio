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

import java.io.IOException;
import java.util.Map;

/**
 * 锁文档存取的<b>窄端口</b>（-67 防复发看守）——按<b>意图</b>建模，不按 ES 动词建模。
 *
 * <p><b>它拦住了什么</b>： 之前 {@code EsRebuildLockStore} 直接持有
 * {@code Supplier<RestHighLevelClient>}，于是可以写出
 * {@code new IndexRequest(idx).id(id).opType(CREATE)}——RHLC 无论是否知道版本都把它发成
 * {@code PUT /idx/_create/id}，这条 typeless 路由在 6.x 上是 <b>400 invalid_type_name_exception</b>
 * （「Document mapping type name can't start with '_', found: [_create]」，6.7.2 实测）。
 * {@code putMappingVersionAware} / {@code _update} / {@code _explain} 等早在 / 就做了版本感知兜底，
 * <b>唯独  新加的锁绕过了全部惯例</b>——因为惯例只活在老代码里，<b>不活在任何能拦住新代码的地方</b>。</p>
 *
 * <p><b>为什么这个端口真的拦得住下一个人</b>：调用方拿不到 {@code RestHighLevelClient}，
 * 也拿不到 {@code IndexRequest}。<b>本接口的词汇表里根本没有「发一个 typeless 请求」这个概念</b>——
 * 想写错必须先改这个接口的签名，那是一次显式的、会被评审看见的动作，
 * 而不是一次「顺手 new 一个 IndexRequest」的无声滑落。<b>让错误不可能，强于检测错误。</b></p>
 *
 * <p><b>为什么按意图而不按动词</b>：如果这里提供的是 {@code index(IndexRequest)}，
 * 那只是给裸客户端加了一层直通——裸请求对象原路漏回来，收窄等于没做。
 * 按意图命名后还顺带把 CAS 契约<b>变成签名里的值</b>
 * （{@link #replaceIfUnchanged} 的 {@code seqNo}/{@code primaryTerm} 是参数，
 * 而不是藏在 {@code IndexRequest} 的标志位组合里）——<b>藏在标志位里的契约没有看守</b>。</p>
 *
 * <p>实现须对 {@link EsVersionCaps.MappingTypeMode#UNKNOWN} 选择 6.x/7.x <b>双方都合法</b>的请求形态，
 * <b>不得</b>假设 7.x。</p>
 *
 * @author aicoding
 */
public interface LockDocPort {

    /** 锁索引是否存在。 */
    boolean indexExists(String index) throws IOException;

    /**
     * 建锁索引（带 mapping）。实现须按宿主版本决定 mappings 是否要 {@code _doc} type 包层
     * ——6.x 上 typeless mapping 会 {@code mapper_parsing_exception}。
     *
     * @param propertiesJson {@code properties} 段（不含外层 {@code mappings}/type 包层）
     */
    void createIndex(String index, String propertiesJson) throws IOException;

    /**
     * <b>不存在才写入</b>（CAS 起点，锁互斥的唯一依据）。
     *
     * @return true=写入成功（抢到锁）；false=文档已存在（409 冲突，没抢到）
     */
    boolean createIfAbsent(String index, String id, Map<String, Object> source) throws IOException;

    /**
     * <b>仅当文档未被改动过才覆写</b>（{@code if_seq_no}/{@code if_primary_term} 乐观锁）。
     * <p>CAS 契约在签名里：调用方必须显式带上读到的 {@code seqNo}/{@code primaryTerm}，
     * 无法「忘记」加条件而退化成无条件覆写。</p>
     *
     * @return true=覆写成功；false=期间已被他人改动（409 冲突）
     */
    boolean replaceIfUnchanged(String index, String id, Map<String, Object> source,
                               long seqNo, long primaryTerm) throws IOException;

    /** 读锁文档；不存在返回 null。 */
    LockDoc get(String index, String id) throws IOException;

    /**
     * <b>仅当文档未被改动过才删除</b>（正常 release 用，避免删掉他人刚抢到的锁）。
     *
     * @return true=删除成功；false=期间已被改动/已不存在
     */
    boolean deleteIfUnchanged(String index, String id, long seqNo, long primaryTerm) throws IOException;

    /** 无条件删除（forceRelease 解孤儿锁用，显式承认绕过 CAS）。 */
    void deleteAny(String index, String id) throws IOException;

    /** 锁文档 + 其 CAS 版本坐标。 */
    class LockDoc {
        private final Map<String, Object> source;
        private final long seqNo;
        private final long primaryTerm;

        public LockDoc(Map<String, Object> source, long seqNo, long primaryTerm) {
            this.source = source;
            this.seqNo = seqNo;
            this.primaryTerm = primaryTerm;
        }

        public Map<String, Object> source() {
            return source;
        }

        public long seqNo() {
            return seqNo;
        }

        public long primaryTerm() {
            return primaryTerm;
        }
    }
}
