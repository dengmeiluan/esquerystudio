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

package io.github.dengmeiluan.esquerystudio.console.insight.action;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import org.junit.Test;

import static org.junit.Assert.assertEquals;

/**
 * 热更索引 settings 动作定级锚：前端按 rank3（canOps）展示，直存端点
 * {@code /cluster/index-settings/update} 本身也是 rank3——动作层不得再高挂 ADMIN。
 */
public class ApplyIndexSettingsActionRole963Test {

    @Test
    public void 热更动作最低角色为rank3专项() {
        assertEquals(ConsoleRole.REBUILD_OP, new ApplyIndexSettingsAction(null, null).minRole());
    }
}
