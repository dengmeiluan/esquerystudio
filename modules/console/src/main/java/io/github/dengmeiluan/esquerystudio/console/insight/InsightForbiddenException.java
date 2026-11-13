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

package io.github.dengmeiluan.esquerystudio.console.insight;

/**
 *  Insight 403 语义异常。
 *
 * <p>两类 code：</p>
 * <ul>
 *   <li>{@code ACTION_FORBIDDEN} —— 角色不足（低于动作 minRole）</li>
 *   <li>{@code CONFIRM_TOKEN_INVALID} —— 无 token / 过期 / 参数被篡改（护栏协议核心防线）</li>
 * </ul>
 *
 * @author aicoding
 */
public class InsightForbiddenException extends RuntimeException {

    public static final String ACTION_FORBIDDEN = "ACTION_FORBIDDEN";
    public static final String CONFIRM_TOKEN_INVALID = "CONFIRM_TOKEN_INVALID";

    private final String code;

    public InsightForbiddenException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
