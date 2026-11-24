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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** raw REST 语义分类：POST 查询不能按方法误判为写，未知 POST fail-closed。 */
public class McpRestClassifierTest {

    @Test
    public void postQueriesAreRead() {
        assertTrue(McpRestClassifier.isReadOnly("POST", "/research/_search"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/_search"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/_msearch"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/_msearch/template"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/research/_count"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/_mget"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/_sql"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/_xpack/sql?format=json"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/_sql/translate"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/research/_field_caps"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/research/_validate/query"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/research/_explain/42"));
        assertTrue(McpRestClassifier.isReadOnly("POST", "/_pit"));
        assertTrue(McpRestClassifier.isReadOnly("DELETE", "/_pit/abc"));
        assertTrue(McpRestClassifier.isReadOnly("DELETE", "/_search/scroll"));
        assertTrue(McpRestClassifier.isReadOnly("GET", "/_cluster/settings"));
    }

    @Test
    public void writesAndUnknownPostsAreNotRead() {
        assertFalse(McpRestClassifier.isReadOnly("POST", "/_bulk"));
        assertFalse(McpRestClassifier.isReadOnly("POST", "/_reindex"));
        assertFalse(McpRestClassifier.isReadOnly("POST", "/_update_by_query"));
        assertFalse(McpRestClassifier.isReadOnly("POST", "/_delete_by_query"));
        assertFalse(McpRestClassifier.isReadOnly("POST", "/_cluster/reroute"));
        assertFalse(McpRestClassifier.isReadOnly("POST", "/_security/user"));
        assertFalse(McpRestClassifier.isReadOnly("PUT", "/research/_doc/1"));
        assertFalse(McpRestClassifier.isReadOnly("DELETE", "/research/_doc/1"));
        assertFalse(McpRestClassifier.isReadOnly("POST", "/research/_close"));
    }
}
