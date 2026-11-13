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

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/**
 * setup/status 是免鉴权白名单端点：绑定后控制集群地址不再向未认证方回显；
 * 未绑定窗口照常回显（首连向导的数据源）。
 */
public class ConsoleSetupStatusMask999Test {

    /** bound 态 resolver：endpoint 固定为内网地址，验证掩码不回显。 */
    private static class BoundResolver extends ControlClusterResolver {
        BoundResolver() {
            super(null, null, null, null, null, "auto");
        }

        @Override public boolean bound() {
            return true;
        }

        @Override public String endpoint() {
            return "http://10.9.8.7:9200";
        }
    }

    @Test
    public void 绑定后不再回显控制集群地址() {
        ConsoleSetupController c = new ConsoleSetupController(
                new BoundResolver(), null, null, null, "test-app", false);
        Map<String, Object> r = c.status();
        assertEquals(Boolean.TRUE, r.get("bound"));
        assertNull("已绑定态 endpoint 必须为空", r.get("endpoint"));
        org.junit.Assert.assertNotNull("mode 照常下发", r.get("mode"));
    }

    @Test
    public void 未绑定窗口照常回显() {
        ConsoleSetupController c = new ConsoleSetupController(
                new ControlClusterResolver(null, null, null, null, null, "auto"),
                null, null, null, "test-app", false);
        Map<String, Object> r = c.status();
        assertEquals(Boolean.FALSE, r.get("bound"));
        assertEquals(Boolean.FALSE, r.get("hostVisible"));
    }
}
