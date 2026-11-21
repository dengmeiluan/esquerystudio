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
import org.junit.Test;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * -67：锁的请求<b>形态</b>看守——判据落在「实际发出的 method + path」这个<b>值</b>上。
 *
 * <p><b>守的是什么</b>：RHLC 的 {@code IndexRequest.opType(CREATE)} 无论是否知道版本都发
 * {@code PUT /{index}/_create/{id}}，6.7.2 实测 <b>400 invalid_type_name_exception</b>
 * （「Document mapping type name can't start with '_', found: [_create]」）——
 * 产线 6.x 宿主上<b>连锁都拿不到</b>，adhoc 重建无法启动。
 * 正确形态 {@code PUT /{index}/_doc/{id}?op_type=create} 实测 <b>201</b>、重复 <b>409</b>。</p>
 *
 * <p><b>为什么断言路径而不是断言「没调用某 API」</b>（规则三）：
 * 「有没有用 RHLC 的某个类」是代码长相，不是值；而「实际发出的 path」是可读取、可断言的值。
 * 错误实现（改回 opType(CREATE)）会产生 {@code /_create/} 路径，本测试立刻红。</p>
 *
 * @author aicoding
 */
public class LockDocPortRequestShapeTest {

    /** 记录端口实际发出的请求（method + path），断言落在这些值上。 */
    private static class RecordingPort implements LockDocPort {
        final List<String> calls = new ArrayList<>();
        boolean createConflicts;
        Map<String, Object> stored;
        long seqNo = 3;
        long primaryTerm = 2;

        @Override
        public boolean indexExists(String index) {
            calls.add("HEAD /" + index);
            return false;
        }

        @Override
        public void createIndex(String index, String propertiesJson) {
            calls.add("PUT /" + index + " body=" + propertiesJson);
        }

        @Override
        public boolean createIfAbsent(String index, String id, Map<String, Object> source) {
            calls.add("PUT /" + index + "/_doc/" + id + "?op_type=create");
            if (createConflicts) {
                return false;
            }
            stored = source;
            return true;
        }

        @Override
        public boolean replaceIfUnchanged(String index, String id, Map<String, Object> source,
                                          long seq, long term) {
            calls.add("PUT /" + index + "/_doc/" + id + "?if_seq_no=" + seq + "&if_primary_term=" + term);
            stored = source;
            return true;
        }

        @Override
        public LockDoc get(String index, String id) {
            calls.add("GET /" + index + "/_doc/" + id);
            return stored == null ? null : new LockDoc(stored, seqNo, primaryTerm);
        }

        @Override
        public boolean deleteIfUnchanged(String index, String id, long seq, long term) {
            calls.add("DELETE /" + index + "/_doc/" + id + "?if_seq_no=" + seq + "&if_primary_term=" + term);
            stored = null;
            return true;
        }

        @Override
        public void deleteAny(String index, String id) {
            calls.add("DELETE /" + index + "/_doc/" + id);
            stored = null;
        }
    }

    /**
     * 加锁必须走 {@code createIfAbsent} 这个<b>意图方法</b>（而不是先 get 再 put 之类的非原子写法）。
     *
     * <p><b>本条守的不是 path 形态</b>：{@code RecordingPort} 的 path 是<b>桩自己拼的字面量</b>，
     * 实现改了 path 这里也不会红。真正守 path 形态的是
     * {@code VersionAwareLockDocPortPathTest}——<b>删那个文件之前请先看这句话</b>。</p>
     *
     * <p>证伪：让 {@code EsRebuildLockStore} 改用 {@code replaceIfUnchanged} 或先读后写来加锁
     * ——本条立刻红。</p>
     */
    @Test
    public void acquire_usesDocOpTypeCreate_neverUnderscoreCreateRoute() {
        RecordingPort port = new RecordingPort();
        EsRebuildLockStore store = new EsRebuildLockStore(port, "lock_idx", true);

        assertTrue(store.tryAcquire("bond_basic", 60000));

        String acquireCall = port.calls.get(0);
        assertEquals("加锁必须走 createIfAbsent 意图方法（本桩的 path 是桩自己拼的字面量，"
                        + "真正守 path 形态的是 VersionAwareLockDocPortPathTest）",
                "PUT /lock_idx/_doc/bond_basic?op_type=create", acquireCall);
        for (String c : port.calls) {
            assertFalse("绝不能出现 7.0+ 专有的 /_create/ 路由（6.x 上 400 invalid_type_name_exception）: " + c,
                    c.contains("/_create/"));
        }
    }

    /** CAS 契约在签名里：强夺过期锁必须带上读到的 seqNo/primaryTerm，不得退化为无条件覆写。 */
    @Test
    public void stealExpiredLock_carriesCasCoordinatesAsValues() {
        RecordingPort port = new RecordingPort();
        port.createConflicts = true;
        Map<String, Object> expired = new HashMap<>();
        expired.put("owner", "someone-else");
        expired.put("acquireTime", 1L);
        expired.put("expireTime", 2L); // 早已过期
        port.stored = expired;
        port.seqNo = 11;
        port.primaryTerm = 4;

        EsRebuildLockStore store = new EsRebuildLockStore(port, "lock_idx", true);
        assertTrue("过期锁应被强夺", store.tryAcquire("bond_basic", 60000));

        assertTrue("强夺必须带 CAS 坐标（值落在 path 上）",
                port.calls.contains("PUT /lock_idx/_doc/bond_basic?if_seq_no=11&if_primary_term=4"));
    }

    /** 未过期锁必须被拒绝——互斥语义不能因重构而改变。 */
    @Test
    public void unexpiredLock_isRejected() {
        RecordingPort port = new RecordingPort();
        port.createConflicts = true;
        Map<String, Object> held = new HashMap<>();
        held.put("owner", "other");
        held.put("acquireTime", System.currentTimeMillis());
        held.put("expireTime", System.currentTimeMillis() + 600000);
        port.stored = held;

        EsRebuildLockStore store = new EsRebuildLockStore(port, "lock_idx", true);
        assertFalse("未过期锁必须拒绝，否则互斥失效", store.tryAcquire("bond_basic", 60000));
    }

    /** release 走条件删除（带 CAS），forceRelease 才是无条件删除。 */
    @Test
    public void release_isConditional_forceRelease_isNot() {
        RecordingPort port = new RecordingPort();
        EsRebuildLockStore store = new EsRebuildLockStore(port, "lock_idx", true);
        store.tryAcquire("k", 60000);

        store.release("k");
        assertTrue("release 必须条件删除",
                port.calls.contains("DELETE /lock_idx/_doc/k?if_seq_no=3&if_primary_term=2"));

        port.stored = new HashMap<>();
        store.forceRelease("k");
        assertTrue("forceRelease 显式无条件删除", port.calls.contains("DELETE /lock_idx/_doc/k"));
    }

    /** ensureIndex 传下去的是 properties 段，type 包层由端口按版本决定（6.x 缺包层会 mapper_parsing_exception）。 */
    @Test
    public void ensureIndex_delegatesTypeLayerDecisionToPort() {
        RecordingPort port = new RecordingPort();
        EsRebuildLockStore store = new EsRebuildLockStore(port, "lock_idx", true);
        store.ensureIndex();

        assertEquals("HEAD /lock_idx", port.calls.get(0));
        String createCall = port.calls.get(1);
        assertTrue("应下传 properties 段", createCall.contains("\"properties\""));
        assertFalse("锁存储层不得自行决定 type 包层", createCall.contains("_doc"));
    }

    /** 三态齐备性：UNKNOWN 必须与两个已知态都不同（本仓第 8 次「合法值表缺席」的防线）。 */
    @Test
    public void unknownModeIsDistinctFromBothKnownModes() {
        assertEquals(EsVersionCaps.MappingTypeMode.UNKNOWN, EsVersionCaps.mappingTypeMode(null));
        assertFalse(EsVersionCaps.mappingTypeMode(null) == EsVersionCaps.mappingTypeMode("7.10.2"));
        assertFalse(EsVersionCaps.mappingTypeMode(null) == EsVersionCaps.mappingTypeMode("6.7.2"));
    }
}
