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
 * 可选 SPI：ADMIN 代签 key 时解析目标用户的真实角色。
 * 返回 null 表示用户目录不可用/未收录（例如宿主委托身份），此时无法做角色上限校验。
 */
public interface McpKeyOwnerResolver {

    String roleOf(String username);

    /**
     * 可选：目标用户的页面授权快照（静态页键或 conn:{id}:{page} 键）。
     *
     * <p>返回 {@code null} 表示宿主无法解析该用户的页面授权（保持既有 fail-closed 策略）；
     * 返回集合时，ADMIN 代签的 key 会被限制在该用户真实可读/可写的连接与工具内，
     * 避免「控制台打不开的页面，MCP key 却能访问」的超发。默认 null 兼容已有实现。</p>
     */
    default java.util.Set<String> pagesOf(String username) {
        return null;
    }
}
