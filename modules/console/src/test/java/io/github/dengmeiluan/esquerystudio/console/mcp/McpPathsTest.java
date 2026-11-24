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

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

public class McpPathsTest {

    @Test
    public void normalizesLeadingAndTrailingSlashesWithProjectDefault() {
        assertEquals("/esmcp", McpPaths.normalize(null));
        assertEquals("/esmcp", McpPaths.normalize("   "));
        assertEquals("/esmcp", McpPaths.normalize("esmcp"));
        assertEquals("/mcp", McpPaths.normalize("/mcp/"));
        assertEquals("/esq/rpc", McpPaths.normalize("esq/rpc"));
    }

    @Test
    public void acceptsUrlPaths() {
        assertEquals("/esmcp", McpPaths.requireValid("/esmcp"));
        assertEquals("/mcp", McpPaths.requireValid("mcp"));
        assertEquals("/esq/rpc", McpPaths.requireValid("/esq/rpc"));
    }

    @Test
    public void rejectsShellMangledOrNonUrlPathsInsteadOfMountingThemSilently() {
        String[] bad = {
                "/c:/Program Files/Git/mcp",
                "/mcp path",
                "/a/../b",
                "//double",
                "/mcp?x=1",
                "/mcp#frag",
                "/" + repeat('a', 130),
        };
        for (String value : bad) {
            try {
                McpPaths.requireValid(value);
                fail("must reject malformed MCP path: " + value);
            } catch (IllegalArgumentException expected) {
                // expected: startup fails with the offending value in the message
            }
        }
    }

    private static String repeat(char c, int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            sb.append(c);
        }
        return sb.toString();
    }
}
