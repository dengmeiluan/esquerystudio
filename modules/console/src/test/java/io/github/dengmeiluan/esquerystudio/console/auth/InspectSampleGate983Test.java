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

import java.util.Arrays;
import java.util.HashSet;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 批次 983：仅元数据页授权时，索引详情不得回传样本文档。 */
public class InspectSampleGate983Test {

    @Test
    public void 只有mapping页授权不允许样本文档() {
        assertFalse(ConsoleAuthInterceptor.inspectSampleAllowed(new HashSet<>(Arrays.asList("mapping"))));
        assertFalse(ConsoleAuthInterceptor.inspectSampleAllowed(
                new HashSet<>(Arrays.asList("config-validator", "adhoc-rebuild"))));
    }

    @Test
    public void 文档读页授权允许样本文档() {
        assertTrue(ConsoleAuthInterceptor.inspectSampleAllowed(new HashSet<>(Arrays.asList("indices"))));
        assertTrue(ConsoleAuthInterceptor.inspectSampleAllowed(new HashSet<>(Arrays.asList("search"))));
        assertTrue(ConsoleAuthInterceptor.inspectSampleAllowed(new HashSet<>(Arrays.asList("browser"))));
        assertTrue(ConsoleAuthInterceptor.inspectSampleAllowed(new HashSet<>(Arrays.asList("doc-diff"))));
    }

    @Test
    public void 无有效页集一律关闭采样() {
        assertFalse(ConsoleAuthInterceptor.inspectSampleAllowed(new HashSet<>()));
        assertFalse(ConsoleAuthInterceptor.inspectSampleAllowed(null));
    }
}
