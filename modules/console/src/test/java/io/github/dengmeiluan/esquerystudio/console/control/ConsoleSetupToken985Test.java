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

package io.github.dengmeiluan.esquerystudio.console.control;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 批次 985：未绑定首连可选令牌——配置后匿名 test/apply 必须携带正确 X-Setup-Token。 */
public class ConsoleSetupToken985Test {

    @Test
    public void 未配置令牌时保持历史放行() {
        assertTrue(ConsoleSetupController.setupTokenMatches("", ""));
        assertTrue(ConsoleSetupController.setupTokenMatches(null, null));
        assertTrue(ConsoleSetupController.setupTokenMatches(" ", "anything"));
    }

    @Test
    public void 配置令牌后缺失或错误一律拒绝() {
        assertFalse(ConsoleSetupController.setupTokenMatches("s3cret", null));
        assertFalse(ConsoleSetupController.setupTokenMatches("s3cret", ""));
        assertFalse(ConsoleSetupController.setupTokenMatches("s3cret", "   "));
        assertFalse(ConsoleSetupController.setupTokenMatches("s3cret", "s3cre"));
        assertFalse(ConsoleSetupController.setupTokenMatches("s3cret", "S3CRET"));
    }

    @Test
    public void 正确令牌允许首尾空白时放行() {
        assertTrue(ConsoleSetupController.setupTokenMatches("s3cret", "s3cret"));
        assertTrue(ConsoleSetupController.setupTokenMatches("s3cret", "  s3cret  "));
    }
}
