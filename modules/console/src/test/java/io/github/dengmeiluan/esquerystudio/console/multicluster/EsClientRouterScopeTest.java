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

import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 目标作用域（target-aware adhoc 轮）：异步 worker 线程必须能在 job 创建时捕获的
 * 目标上恢复路由。锁定 openScope 的嵌套恢复语义与 requireCapturedTarget 的 fail-closed 语义。
 */
public class EsClientRouterScopeTest {

    /** 最小 ConnStore 桩：get(id) 按内存 map 返回，支撑 conn 存在性判定。 */
    private static ConnStore fakeConnStore(Map<String, RemoteClusterConn> conns) {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return conns.get(id); }
            @Override public String getName(String id) { return conns.containsKey(id) ? id : null; }
            @Override public String getVersion(String id) { return conns.containsKey(id) ? "6.7.2" : null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                                                     String password, String minRole, Integer connectTimeoutMs,
                                                     Integer socketTimeoutMs, String env) {
                return new HashMap<>();
            }
            @Override public void updateVersion(String id, String esVersion) { }
            @Override public void delete(String id) { conns.remove(id); }
        };
    }

    private static RemoteClusterConn conn(String id) {
        RemoteClusterConn c = new RemoteClusterConn();
        c.setHost(id + ".example.com");
        c.setPort(9200);
        return c;
    }

    private static EsClientRouter router(Map<String, RemoteClusterConn> conns) {
        return new EsClientRouter(() -> null, fakeConnStore(conns), new RemoteEsClientFactory(1000, 1000) {
            @Override
            public RestHighLevelClient build(RemoteClusterConn c) {
                throw new UnsupportedOperationException("scope 测试不应建连");
            }
        });
    }

    @Test
    public void openScopeBindsAndCloseRestoresPrevious() {
        EsClientRouter r = router(new HashMap<>());
        assertThat(r.currentTarget()).isNull();
        try (EsClientRouter.TargetScope a = r.openScope("conn-a")) {
            assertThat(r.currentTarget()).isEqualTo("conn-a");
            try (EsClientRouter.TargetScope b = r.openScope("conn-b")) {
                assertThat(r.currentTarget()).isEqualTo("conn-b");
            }
            assertThat(r.currentTarget()).isEqualTo("conn-a");
        }
        assertThat(r.currentTarget()).isNull();
    }

    @Test
    public void openScopeHostUnbindsAndCloseRestores() {
        EsClientRouter r = router(new HashMap<>());
        try (EsClientRouter.TargetScope a = r.openScope("conn-a");
             EsClientRouter.TargetScope host = r.openScope(EsClientRouter.HOST)) {
            assertThat(r.currentTarget()).isNull();
        }
        assertThat(r.currentTarget()).isNull();
    }

    @Test
    public void requireCapturedTargetDefaultsToHostAndEchoesBinding() {
        EsClientRouter r = router(new HashMap<>());
        assertThat(r.requireCapturedTarget()).isEqualTo(EsClientRouter.HOST);
        try (EsClientRouter.TargetScope a = r.openScope("conn-a")) {
            assertThat(r.requireCapturedTarget()).isEqualTo("conn-a");
        }
        assertThat(r.requireCapturedTarget()).isEqualTo(EsClientRouter.HOST);
    }

    @Test
    public void unknownConnFailsBeforeFallingBackToHostClient() {
        Map<String, RemoteClusterConn> conns = new HashMap<>();
        conns.put("conn-a", conn("conn-a"));
        EsClientRouter r = router(conns);
        try (EsClientRouter.TargetScope a = r.openScope("conn-missing")) {
            // 未知 conn 必须抛错回绝，绝不能静默回落宿主 client（fail closed）
            assertThatThrownBy(r::current).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("conn-missing");
        }
        assertThat(r.currentTarget()).isNull();
    }

    @Test
    public void scopeClearsAfterExceptionInTryWithResources() {
        Map<String, RemoteClusterConn> conns = new HashMap<>();
        conns.put("conn-a", conn("conn-a"));
        EsClientRouter r = router(conns);
        try (EsClientRouter.TargetScope a = r.openScope("conn-a")) {
            assertThat(r.requireCapturedTarget()).isEqualTo("conn-a");
            throw new IllegalStateException("worker 模拟异常");
        } catch (IllegalStateException expected) {
            assertThat(r.currentTarget()).isNull();
        }
    }
}
