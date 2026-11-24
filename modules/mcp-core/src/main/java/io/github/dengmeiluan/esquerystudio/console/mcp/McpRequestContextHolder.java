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

/** Thread-local bridge between a servlet filter (javax or jakarta) and the MCP core. */
public final class McpRequestContextHolder {

    private static final ThreadLocal<McpRequestContext> CURRENT = new ThreadLocal<>();

    private McpRequestContextHolder() {
    }

    public static void set(McpRequestContext context) {
        if (context == null) {
            CURRENT.remove();
        } else {
            CURRENT.set(context);
        }
    }

    public static void clear() {
        CURRENT.remove();
    }

    public static McpRequestContext current() {
        return CURRENT.get();
    }
}
