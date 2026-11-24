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

package io.github.dengmeiluan.esquerystudio.console.auth;

import org.junit.After;
import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 1046：SQL cursor 归属绑定（与 PIT 同一 IDOR 类）。
 */
public class SqlCursorOwnership1046Test {

    @After
    public void cleanup() {
        SqlCursorOwnership.clear();
    }

    @Test
    public void 未登记cursor保持外部能力() {
        assertTrue(SqlCursorOwnership.allows("external-cursor", "bob", false));
        assertNull(SqlCursorOwnership.owner("external-cursor"));
    }

    @Test
    public void 登记后仅开启者与ADMIN可用() {
        SqlCursorOwnership.register("c1", "alice", 60_000L);
        assertTrue(SqlCursorOwnership.allows("c1", "alice", false));
        assertFalse(SqlCursorOwnership.allows("c1", "bob", false));
        assertTrue("ADMIN 可应急接管", SqlCursorOwnership.allows("c1", "bob", true));
    }

    @Test
    public void 关闭后释放归属() {
        SqlCursorOwnership.register("c1", "alice", 60_000L);
        SqlCursorOwnership.release("c1");
        assertTrue(SqlCursorOwnership.allows("c1", "bob", false));
    }
}
