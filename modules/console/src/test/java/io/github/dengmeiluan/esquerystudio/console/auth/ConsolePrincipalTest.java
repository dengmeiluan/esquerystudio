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

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/** 2.5.0 菜单 SPI：ConsolePrincipal 的 grantedPages 三态语义（null=不启用 / 空集=全拒 / 非空=白名单）。 */
public class ConsolePrincipalTest {

    @Test
    public void 旧构造器链_grantedPages为null_不启用页面级() {
        ConsolePrincipal p3 = new ConsolePrincipal("u", ConsoleRole.ADMIN, false);
        ConsolePrincipal p4 = new ConsolePrincipal("u", ConsoleRole.ADMIN, false, true);
        ConsolePrincipal p6 = new ConsolePrincipal("u", ConsoleRole.ADMIN, false, true, "张三", null);
        assertNull(p3.getGrantedPages());
        assertNull(p4.getGrantedPages());
        assertNull(p6.getGrantedPages());
    }

    @Test
    public void 全参构造器_白名单原样保留() {
        Set<String> pages = new HashSet<>(Arrays.asList("overview", "search"));
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null, pages);
        assertEquals(new HashSet<>(Arrays.asList("overview", "search")), p.getGrantedPages());
    }

    @Test
    public void 全参构造器_空集是全拒而非不启用() {
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null,
                Collections.<String>emptySet());
        assertTrue("空集必须原样保留（语义=全拒），不得折叠成 null", p.getGrantedPages() != null);
        assertTrue(p.getGrantedPages().isEmpty());
    }

    @Test
    public void grantedPages不可变_防御性拷贝() {
        Set<String> pages = new HashSet<>(Collections.singleton("overview"));
        ConsolePrincipal p = new ConsolePrincipal("u", ConsoleRole.VIEWER, false, true, null, null, pages);
        pages.add("search"); // 改源集合不得影响 principal
        assertEquals(1, p.getGrantedPages().size());
        try {
            p.getGrantedPages().add("bulk");
            fail("grantedPages 必须不可变");
        } catch (UnsupportedOperationException expected) {
            // 通过
        }
    }
}
