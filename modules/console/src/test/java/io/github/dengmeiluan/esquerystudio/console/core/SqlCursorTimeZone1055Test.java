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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/* 1055：SQL cursor 续页 time_zone——ES 续页只认 columnar/time_zone，
   首查时区必须原样带上，否则日期列格式与函数口径前后不一致。 */
public class SqlCursorTimeZone1055Test {

    @Test
    public void carriesTimeZoneOnCursorPage() throws Exception {
        assertEquals("{\"cursor\":\"c1\",\"time_zone\":\"Asia/Shanghai\"}",
                EsIndexAdmin.sqlCursorBody("c1", "Asia/Shanghai"));
    }

    @Test
    public void blankTimeZoneOmitsKey() throws Exception {
        assertEquals("{\"cursor\":\"c1\"}", EsIndexAdmin.sqlCursorBody("c1", "   "));
        assertEquals("{\"cursor\":\"c1\"}", EsIndexAdmin.sqlCursorBody("c1", null));
    }

    @Test
    public void rejectsJsonInjection() {
        try {
            EsIndexAdmin.sqlCursorBody("c1", "Asia/Shanghai\"}");
            assertTrue("非法时区必须拒绝", false);
        } catch (Exception ex) {
            assertTrue(ex instanceof IllegalArgumentException);
        }
    }

    @Test
    public void rejectsEmptyCursor() {
        try {
            EsIndexAdmin.sqlCursorBody("", "UTC");
            assertTrue("空 cursor 必须拒绝", false);
        } catch (Exception ex) {
            assertTrue(ex instanceof IllegalArgumentException);
        }
    }
}
