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

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/* 1063：搜索请求级 URL 参数——白名单、固定顺序、URL 编码与非法值拒绝。 */
public class SearchRequestParams1063Test {

    @Test
    public void appendsAllowedParamsInStableOrderAndEncodes() {
        Map<String, String> raw = new LinkedHashMap<>();
        raw.put("expand_wildcards", "open,hidden");
        raw.put("preference", "_local");
        raw.put("routing", "主体 1");
        Map<String, String> checked = EsIndexAdmin.checkedSearchRequestParams(raw);
        assertEquals("/i/_search?routing=%E4%B8%BB%E4%BD%93+1&preference=_local&expand_wildcards=open%2Chidden",
                EsIndexAdmin.searchPathWithParams("/i/_search", checked));
    }

    @Test
    public void unknownKeysIgnoredAndEmptyValuesSkipped() {
        Map<String, String> raw = new LinkedHashMap<>();
        raw.put("foo", "bar");
        raw.put("routing", "   ");
        assertTrue(EsIndexAdmin.checkedSearchRequestParams(raw).isEmpty());
        assertEquals("/i/_search", EsIndexAdmin.searchPathWithParams("/i/_search", raw));
        assertEquals("/i/_search", EsIndexAdmin.searchPathWithParams("/i/_search", null));
    }

    @Test
    public void validatesEnumAndComboValues() {
        expectIllegal("search_type", "query_then_fetch2");
        expectIllegal("allow_partial_search_results", "TRUE");
        expectIllegal("ignore_unavailable", "yes");
        expectIllegal("expand_wildcards", "open,none");
        expectIllegal("expand_wildcards", "everything");
        assertEquals("query_then_fetch", EsIndexAdmin.validateSearchRequestParam("search_type", "query_then_fetch"));
        assertEquals("dfs_query_then_fetch", EsIndexAdmin.validateSearchRequestParam("search_type", "dfs_query_then_fetch"));
        assertEquals("open,closed", EsIndexAdmin.validateSearchRequestParam("expand_wildcards", "open,closed"));
    }

    @Test
    public void rejectsControlCharsAndOverlongRouting() {
        expectIllegal("routing", "a\nb");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 513; i++) sb.append('a');
        expectIllegal("preference", sb.toString());
    }

    private static void expectIllegal(String key, String value) {
        try {
            EsIndexAdmin.validateSearchRequestParam(key, value);
            assertTrue("应拒绝 " + key + "=" + value, false);
        } catch (IllegalArgumentException ex) {
            assertTrue(ex.getMessage() != null && !ex.getMessage().isEmpty());
        }
    }
}
