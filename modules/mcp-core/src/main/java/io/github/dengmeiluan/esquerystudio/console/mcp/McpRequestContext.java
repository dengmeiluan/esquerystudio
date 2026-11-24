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
 * Transport-neutral view of one MCP HTTP request. The MCP core never imports a servlet API:
 * a console (javax) or Boot (jakarta) adapter fills this in, so the same protocol/audit code runs
 * on every Spring baseline.
 */
public interface McpRequestContext {

    String header(String name);

    String parameter(String name);

    String remoteAddr();

    String method();

    String requestUri();

    boolean isResponseCommitted();

    void setResponseHeader(String name, String value);

    /** Handler pattern that matched this request (e.g. {@code /esmcp}), or null if unavailable. */
    String matchedPattern();
}
