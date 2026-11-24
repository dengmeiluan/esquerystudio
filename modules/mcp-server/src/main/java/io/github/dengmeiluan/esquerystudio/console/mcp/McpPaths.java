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

/**
 * Mount-path rules for the MCP transport. The default is project-scoped ({@code /esmcp}) so a
 * host that already owns {@code /mcp} can keep the dependency without a mapping clash; legacy
 * clients keep working by setting {@code esquerystudio.mcp.path=/mcp}.
 *
 * <p>A path is a URL path, not a filesystem path: accept only ASCII letters, digits and
 * {@code . _ ~ - /}, no {@code ..} or empty segment. Malformed values fail startup with a clear
 * message instead of silently mounting an unreachable endpoint (e.g. a shell-mangled Windows
 * path).</p>
 */
public final class McpPaths {

    public static final String DEFAULT = "/esmcp";

    private McpPaths() {
    }

    /** Leading slash, no trailing slash; blank falls back to {@link #DEFAULT}. */
    public static String normalize(String raw) {
        String p = raw == null ? "" : raw.trim();
        if (p.isEmpty()) {
            p = DEFAULT;
        }
        if (!p.startsWith("/")) {
            p = "/" + p;
        }
        while (p.length() > 1 && p.endsWith("/")) {
            p = p.substring(0, p.length() - 1);
        }
        return p;
    }

    /** {@link #normalize(String)} plus strict validation; throws with the offending value. */
    public static String requireValid(String raw) {
        String p = normalize(raw);
        if (p.length() > 120
                || p.contains(" ")
                || p.contains("..")
                || p.contains("//")
                || !p.matches("/[A-Za-z0-9._~/-]+")) {
            throw new IllegalArgumentException(
                    "esquerystudio.mcp.path 必须是 URL 路径（字母/数字/._~-，如 /esmcp 或 /mcp），实际=" + raw
                            + "。注意 shell 传参时避免被展开成 Windows 路径（Git Bash 可用 MSYS_NO_PATHCONV=1）。");
        }
        return p;
    }
}
