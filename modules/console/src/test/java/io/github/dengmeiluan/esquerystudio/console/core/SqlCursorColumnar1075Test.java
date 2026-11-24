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

/* 1075：SQL cursor 续页 columnar——ES cursor 只认 columnar/time_zone；
   首查用了 columnar，续页必须原样带上，否则页形态与首查不一致（列式响应无法转行）。 */
public class SqlCursorColumnar1075Test {

    @Test
    public void carriesColumnarWithTimeZone() throws Exception {
        assertEquals("{\"cursor\":\"c1\",\"time_zone\":\"Asia/Shanghai\",\"columnar\":true}",
                EsIndexAdmin.sqlCursorBody("c1", "Asia/Shanghai", Boolean.TRUE));
    }

    @Test
    public void falseOrNullOmitsKey() throws Exception {
        assertEquals("{\"cursor\":\"c1\"}", EsIndexAdmin.sqlCursorBody("c1", null, Boolean.FALSE));
        assertEquals("{\"cursor\":\"c1\"}", EsIndexAdmin.sqlCursorBody("c1", null, null));
    }

    @Test
    public void legacyTwoArgOverloadOmitsColumnar() throws Exception {
        assertEquals("{\"cursor\":\"c1\"}", EsIndexAdmin.sqlCursorBody("c1", null));
    }
}
