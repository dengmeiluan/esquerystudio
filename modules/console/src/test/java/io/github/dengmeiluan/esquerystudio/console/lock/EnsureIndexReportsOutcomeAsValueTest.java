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

import org.junit.Test;

import java.io.IOException;
import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * -67：{@code ensureIndex()} 的成败必须是一个<b>可读取的返回值</b>，
 * 而不是「有没有抛异常」这个控制流信号。
 *
 * <p><b>实测抓到的假成功</b>（6.7.2 演练日志，相邻两行）：</p>
 * <pre>
 * WARN  [RebuildLock] ensureIndex failed (...): Timeout connecting to [localhost/127.0.0.1:9200]
 * INFO  [EsRebuildBootstrapRunner] lock index ensured      &lt;-- 明明失败了还宣称 ensured
 * </pre>
 *
 * <p>成因：{@code ensureIndex()} 内部把异常 catch 掉只打 WARN，于是外层
 * {@code try { action.run(); log("ensured"); }} <b>永远</b>走成功分支——
 * 判据落在控制流上，而该控制流已被内层吞掉，<b>信息量为零</b>。</p>
 *
 * @author aicoding
 */
public class EnsureIndexReportsOutcomeAsValueTest {

    /** 端口全部失败：ensureIndex 必须返回 false。 */
    private static class FailingPort implements LockDocPort {
        @Override
        public boolean indexExists(String index) throws IOException {
            throw new IOException("Timeout connecting to [localhost/127.0.0.1:9200]");
        }

        @Override
        public void createIndex(String index, String propertiesJson) throws IOException {
            throw new IOException("unreachable");
        }

        @Override
        public boolean createIfAbsent(String i, String id, Map<String, Object> s) {
            return false;
        }

        @Override
        public boolean replaceIfUnchanged(String i, String id, Map<String, Object> s, long a, long b) {
            return false;
        }

        @Override
        public LockDoc get(String i, String id) {
            return null;
        }

        @Override
        public boolean deleteIfUnchanged(String i, String id, long a, long b) {
            return false;
        }

        @Override
        public void deleteAny(String i, String id) {
        }
    }

    /** 端口正常：索引不存在 -> 建出来 -> true。 */
    private static class WorkingPort extends FailingPort {
        boolean exists;

        @Override
        public boolean indexExists(String index) {
            return exists;
        }

        @Override
        public void createIndex(String index, String propertiesJson) {
            exists = true;
        }
    }

    /**
     * <b>核心</b>：ES 不可达时 ensureIndex 必须返回 false。
     *
     * <p>证伪：把 {@code ensureIndex} 的 catch 分支改回 {@code return true}（或改回 void
     * 让调用方靠异常判定）——本条立刻红。</p>
     */
    @Test
    public void ensureIndex_returnsFalseWhenClusterUnreachable() {
        EsRebuildLockStore store = new EsRebuildLockStore(new FailingPort(), "lock_idx", true);
        assertFalse("ES 不可达时必须返回 false，不得宣称 ensured", store.ensureIndex());
    }

    /** 正常路径返回 true（防止把上一条做成恒 false 的空转断言）。 */
    @Test
    public void ensureIndex_returnsTrueOnSuccess() {
        EsRebuildLockStore store = new EsRebuildLockStore(new WorkingPort(), "lock_idx", true);
        assertTrue("建索引成功必须返回 true", store.ensureIndex());
    }

    /** 索引已存在也算就绪。 */
    @Test
    public void ensureIndex_returnsTrueWhenAlreadyExists() {
        WorkingPort port = new WorkingPort();
        port.exists = true;
        EsRebuildLockStore store = new EsRebuildLockStore(port, "lock_idx", true);
        assertTrue(store.ensureIndex());
    }

    /** 锁禁用时视为就绪（no-op 降级路径，不该报失败）。 */
    @Test
    public void ensureIndex_disabledLockIsTriviallyReady() {
        EsRebuildLockStore store = new EsRebuildLockStore(new FailingPort(), "lock_idx", false);
        assertTrue("lock.enabled=false 时应无害返回 true", store.ensureIndex());
    }
}
