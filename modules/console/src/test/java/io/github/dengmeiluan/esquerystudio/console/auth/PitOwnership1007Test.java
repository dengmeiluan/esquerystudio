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

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** PIT id 归属：控制台内打开的 id 绑定开启者；账号切换/他人不得续用；ADMIN 可应急接管。 */
public class PitOwnership1007Test {

    @Test
    public void 归属判定_同人放行_他人拒绝_ADMIN放行() {
        PitOwnership.clear();
        PitOwnership.register("pit-1", "u1", 60_000L);
        assertEquals("u1", PitOwnership.owner("pit-1"));
        assertTrue(PitOwnership.allows("pit-1", "u1", false));
        assertFalse("同连接/换号后的他人不得使用", PitOwnership.allows("pit-1", "u2", false));
        assertTrue("ADMIN 是应急通道", PitOwnership.allows("pit-1", "u2", true));
        assertTrue("未登记的 id（控制台外打开）维持既有能力", PitOwnership.allows("external", "u2", false));
    }

    @Test
    public void 关闭PIT释放归属_过期自动失效() throws Exception {
        PitOwnership.clear();
        PitOwnership.register("pit-2", "u1", 30L);
        PitOwnership.release("pit-2");
        assertNull(PitOwnership.owner("pit-2"));
        PitOwnership.register("pit-3", "u1", 30L);
        Thread.sleep(50L);
        assertNull("过期项不得继续绑定身份", PitOwnership.owner("pit-3"));
    }

    @Test
    public void 空身份与空id不登记() {
        PitOwnership.clear();
        PitOwnership.register(null, "u1", 60_000L);
        PitOwnership.register("pit-4", null, 60_000L);
        PitOwnership.register("  ", "u1", 60_000L);
        assertNull(PitOwnership.owner("pit-4"));
    }
}
