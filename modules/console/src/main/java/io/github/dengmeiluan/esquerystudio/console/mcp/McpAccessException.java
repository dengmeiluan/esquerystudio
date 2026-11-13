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

/** MCP key 认证/限流/配额的显式失败，controller 映射为 401/429。 */
public class McpAccessException extends RuntimeException {

    private final int status;
    private final String code;
    private final long retryAfterSeconds;
    /** 命中的 key 前缀（仅 revoked/expired 等已匹配记录的失败可带）；用于审计日志定位。 */
    private String keyPrefix;

    public McpAccessException(int status, String code, String message) {
        this(status, code, message, 0L);
    }

    public McpAccessException(int status, String code, String message, long retryAfterSeconds) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }

    public String getKeyPrefix() {
        return keyPrefix;
    }

    public McpAccessException withKeyPrefix(String prefix) {
        this.keyPrefix = prefix;
        return this;
    }
}
