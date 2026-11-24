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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import io.github.dengmeiluan.esquerystudio.console.core.ControlPlaneGuardException;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.junit.Test;
import org.springframework.core.env.StandardEnvironment;

import static org.junit.Assert.fail;

/** 批次 983：迁移源/目标必须是精确业务索引，不得触达控制面或通配。 */
public class CrossClusterMigrateIndexGuard983Test {

    private static CrossClusterMigrateService service() {
        return new CrossClusterMigrateService(null, new EsIndexAdmin(null), null, null, null, null, null,
                new StandardEnvironment(), null);
    }

    private static MigrateRequest request(String source, String dest) {
        MigrateRequest req = new MigrateRequest();
        req.setConn(new RemoteClusterConn());
        req.setSourceIndex(source);
        req.setDestIndex(dest);
        return req;
    }

    @Test
    public void 源索引不得是控制面或通配() {
        for (String source : new String[]{"esquerystudio_user", "s*", "logs-2026*", "logs,esquerystudio_user", ".security-7"}) {
            try {
                service().validate(request(source, "logs-1"));
                fail("源索引应拒绝：" + source);
            } catch (ControlPlaneGuardException expected) {
                // ok
            }
        }
    }

    @Test
    public void 目标索引不得是控制面或系统索引() {
        for (String dest : new String[]{"esquerystudio_ops_audit", "s*", "logs-1,esquerystudio_user", ".kibana"}) {
            try {
                service().validate(request("logs-1", dest));
                fail("目标索引应拒绝：" + dest);
            } catch (ControlPlaneGuardException expected) {
                // ok
            }
        }
    }

    @Test
    public void 精确业务索引仍放行() {
        service().validate(request("logs-2026.10", "logs-2026.10-copy"));
    }
}
