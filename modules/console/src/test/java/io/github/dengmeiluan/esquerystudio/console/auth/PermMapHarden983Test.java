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

import java.util.List;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 批次 983：页面写能力与真实 UI 动作对拍（browser 只有读面）。 */
public class PermMapHarden983Test {

    @Test
    public void browser写键不再获得文档覆盖权() {
        for (String path : new String[]{
                "/internal/es/index/cluster/doc",
                "/internal/es/index/cluster/doc/update",
                "/internal/es/index/cluster/update-document",
                "/internal/es/index/cluster/update-partial"}) {
            List<String> pages = ConsoleAuthInterceptor.sharedWritePages(path);
            assertTrue("必须登记共享写映射：" + path, pages != null);
            assertFalse("browser 不应出现在写归属：" + path, pages.contains("browser"));
        }
    }

    @Test
    public void browser仍保留文档读面() {
        List<String> pages = ConsoleAuthInterceptor.sharedReadPages("/internal/es/index/cluster/doc");
        assertTrue(pages != null && pages.contains("browser"));
    }
}
