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
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 1046：共享读端点的最小授权面。
 *
 * <p>{@code /cluster/search-raw} 会把命中文档原文回给调用方，元数据页（aliases）没有
 * 文档读面，不能凭页键读取业务文档。</p>
 */
public class SharedReadGrant1046Test {

    @Test
    public void search_raw不授予别名页文档读() {
        List<String> pages = ConsoleAuthInterceptor.sharedReadPages(
                "/internal/es/index/cluster/search-raw");
        assertNotNull(pages);
        assertFalse("aliases 页只做元数据管理，不应读取文档原文", pages.contains("aliases"));
        assertTrue(pages.contains("search"));
        assertTrue(pages.contains("indices"));
    }

    @Test
    public void 文档读仍按真实文档页收口() {
        List<String> pages = ConsoleAuthInterceptor.sharedReadPages(
                "/internal/es/index/cluster/doc");
        assertNotNull(pages);
        assertFalse(pages.contains("aliases"));
        assertTrue(pages.contains("search"));
        assertTrue(pages.contains("browser"));
    }
}
