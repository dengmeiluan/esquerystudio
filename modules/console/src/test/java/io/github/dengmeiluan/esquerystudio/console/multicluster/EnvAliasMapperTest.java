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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/**
 * 连接中心自动同步批:环境映射全枚举——白名单外 fail-closed 归 PROD
 * (与 infra 侧 EnvironmentDomains「白名单外一律按生产」哲学一致)。
 */
public class EnvAliasMapperTest {

    @Test
    public void 白名单四值与常见别名逐一映射() {
        assertEquals("DEV", EnvAliasMapper.map("dev"));
        assertEquals("QA", EnvAliasMapper.map("qa"));
        assertEquals("STAGING", EnvAliasMapper.map("uat"));
        assertEquals("PROD", EnvAliasMapper.map("prod"));
        assertEquals("PROD", EnvAliasMapper.map("prd"));
        assertEquals("PROD", EnvAliasMapper.map("production"));
    }

    @Test
    public void 大小写与首尾空白不敏感() {
        assertEquals("QA", EnvAliasMapper.map(" QA "));
        assertEquals("PROD", EnvAliasMapper.map("Prod"));
        assertEquals("DEV", EnvAliasMapper.map("DEV"));
    }

    @Test
    public void 空白返回null_未知值failClosed归PROD() {
        assertNull(EnvAliasMapper.map(null));
        assertNull(EnvAliasMapper.map("   "));
        assertEquals("未知值宁错杀不漏标(生产)", "PROD", EnvAliasMapper.map("staging2"));
        assertEquals("PROD", EnvAliasMapper.map("预发"));
    }
}
