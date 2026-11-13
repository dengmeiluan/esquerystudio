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

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

/** 批次 986：共享端点映射按路径段边界匹配，前缀相同的新动作 id 不得继承旧页权限。 */
public class PermMapHarden986Test {

    @Test
    public void 共享写端点不得命中同前缀的更长动作id() {
        assertNotNull(ConsoleAuthInterceptor.sharedWritePages(
                "/internal/es/index/insight/actions/apply-index-settings/execute"));
        assertNull(ConsoleAuthInterceptor.sharedWritePages(
                "/internal/es/index/insight/actions/apply-index-settings-extra/execute"));
    }

    @Test
    public void 共享读端点不得命中同前缀的更长端点() {
        assertNotNull(ConsoleAuthInterceptor.sharedReadPages(
                "/internal/es/index/cluster/query?index=logs"));
        assertNull(ConsoleAuthInterceptor.sharedReadPages(
                "/internal/es/index/cluster/query-extra?index=logs"));
    }
}
