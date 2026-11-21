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

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;

/**
 * -67：宿主集群版本必须<b>真的接进</b>版本感知机制，且「探不到」<b>不得</b>被当成 7.x。
 *
 * <p><b>这条守的是什么</b>：#67 的根因是 {@code EsClientRouter.currentEsVersion()} 对宿主恒返回 null，
 * 而 null 被 {@code EsVersionCaps} 兜底成 7.x —— 于是产线 6.7.2 宿主上
 * {@code createIndexLegacy6} 永远不可达，adhoc 重建构造性不可用。
 * {@code updateVersion} 的两个调用点都以 connId 为前提，宿主没有连接档案，
 * <b>全仓没有任何地方探测宿主版本</b>。</p>
 *
 * <p><b>判据落在值上</b>（规则三）：断言的是 {@code currentEsVersion()} / {@code mappingTypeMode()}
 * <b>返回的值</b>，不是「探测被调用过」这类时序性质。</p>
 *
 * @author aicoding
 */
public class HostEsVersionProviderTest {

    /** 宿主 6.7.2 → 必须解析出 TYPED_6X，否则 createIndexLegacy6 对宿主不可达（#67 的直接死因）。 */
    @Test
    public void hostVersion_6_7_2_yieldsTyped6x() {
        HostEsVersionProvider p = providerReturning("6.7.2");
        assertEquals("6.7.2", p.currentVersion());
        assertEquals(EsVersionCaps.MappingTypeMode.TYPED_6X, p.mappingTypeMode());
    }

    @Test
    public void hostVersion_7x_yieldsTypeless() {
        HostEsVersionProvider p = providerReturning("7.10.2");
        assertEquals(EsVersionCaps.MappingTypeMode.TYPELESS_7X, p.mappingTypeMode());
    }

    /**
     * 探测失败 → <b>UNKNOWN，不是 7.x</b>。
     *
     * <p>这是本任务最重要的设计决定的看守：探不到时不假装知道。
     * 证伪：让 {@code HostEsVersionProvider.probe()} 失败时返回 {@code "7.10.2"}
     * （即旧的 DEFAULT_MAJOR 语义），本条立刻红。</p>
     */
    @Test
    public void probeFailure_staysUnknown_neverPretends7x() {
        HostEsVersionProvider p = new HostEsVersionProvider(() -> {
            throw new RuntimeException("connection refused");
        });
        assertNull("探测失败必须返回 null（未知），不得兜底成版本号", p.currentVersion());
        assertEquals("探测失败必须是 UNKNOWN，不得是 TYPELESS_7X",
                EsVersionCaps.MappingTypeMode.UNKNOWN, p.mappingTypeMode());
        // 与「真的是 7.x」可区分——这正是 DEFAULT_MAJOR=7 做不到的事
        assertEquals(EsVersionCaps.MappingTypeMode.TYPELESS_7X, providerReturning("7.10.2").mappingTypeMode());
    }

    /** 控制集群未绑定（自举形态）→ client 为 null 时保持未知，且<b>不抛异常</b>（不阻断启动）。 */
    @Test
    public void nullClient_staysUnknownWithoutThrowing() {
        HostEsVersionProvider p = new HostEsVersionProvider(() -> null);
        assertNull(p.currentVersion());
        assertEquals(EsVersionCaps.MappingTypeMode.UNKNOWN, p.mappingTypeMode());
    }

    /**
     * 探测失败<b>不写缓存</b>，下次调用会重试——这是「不硬失败」的另一半：
     * 失败必须是可恢复的，否则一次网络抖动就永久退化。
     */
    @Test
    public void failedProbeIsRetriedOnNextCall() {
        AtomicInteger calls = new AtomicInteger();
        AtomicReference<Boolean> healthy = new AtomicReference<>(false);
        HostEsVersionProvider p = new HostEsVersionProvider(() -> {
            calls.incrementAndGet();
            if (!healthy.get()) {
                throw new RuntimeException("cluster not ready");
            }
            return null; // 走 null-client 分支，同样返回未知
        });
        assertNull(p.currentVersion());
        assertNull(p.currentVersion());
        assertEquals("失败不得写缓存，每次都应重试", 2, calls.get());
    }

    /** 路由器未注入 provider 时宿主版本为未知——退化为「诚实版」的修复前行为，不是 7.x。 */
    @Test
    public void routerWithoutProvider_hostVersionIsNull() {
        EsClientRouter router = new EsClientRouter(() -> null, new StubConnStore(), null);
        router.clear();
        assertNull("未注入 provider 时宿主版本应为未知", router.currentEsVersion());
        assertEquals(EsVersionCaps.MappingTypeMode.UNKNOWN,
                EsVersionCaps.mappingTypeMode(router.currentEsVersion()));
    }

    /**
     * <b>接线断言</b>：宿主（无 target 绑定）时，{@code currentEsVersion()} 必须来自 provider。
     *
     * <p>证伪：把 {@code EsClientRouter.currentEsVersion()} 改回
     * {@code return connId == null ? null : ...}（即 #67 的原始代码），本条立刻红——
     * 这正是「修复真的接上了」的判据，且判据是<b>返回值</b>而非调用时序。</p>
     */
    @Test
    public void routerReturnsHostVersionForHostTarget() {
        EsClientRouter router = new EsClientRouter(() -> null, new StubConnStore(), null);
        router.setHostVersionProvider(providerReturning("6.7.2"));
        router.clear(); // 无绑定 = 宿主
        assertEquals("宿主目标必须拿到探测到的宿主版本", "6.7.2", router.currentEsVersion());
        assertEquals(EsVersionCaps.MappingTypeMode.TYPED_6X,
                EsVersionCaps.mappingTypeMode(router.currentEsVersion()));
    }

    /** 绑定了远程 connId 时仍走连接档案，宿主 provider 不得越权覆盖。 */
    @Test
    public void routerStillUsesConnStoreForRemoteTarget() {
        StubConnStore store = new StubConnStore();
        store.version = "8.17.0";
        EsClientRouter router = new EsClientRouter(() -> null, store, null);
        router.setHostVersionProvider(providerReturning("6.7.2"));
        try {
            router.bind("conn-1");
            assertEquals("远程目标必须用连接档案的版本", "8.17.0", router.currentEsVersion());
        } finally {
            router.clear();
        }
    }

    /**
     * <b>C1 看守：控制集群重绑到另一个物理集群后，宿主版本缓存必须跟着换。</b>
     *
     * <p>{@code ControlClusterResolver.bindBootstrap} 会 {@code control.set(candidate)}
     * 把控制集群原子切到<b>另一台 ES</b>。若版本缓存只按「探到过就永不再探」写，
     * 7.x 重绑到 6.x 后宿主仍报 7.x → {@code TYPELESS_7X} → {@code createIndex} 走 typeless
     * → 6.x 上 {@code mapper_parsing_exception}：<b>#67 的原始故障换条路径复现</b>。</p>
     *
     * <p><b>判据落在值上</b>（规则三）：断言 {@code mappingTypeMode()} 由
     * {@code TYPELESS_7X} 变成 {@code TYPED_6X}，不是「探测方法被再调用了一次」这类时序性质。</p>
     *
     * <p>证伪：把 {@code currentVersion()} 的缓存判据从
     * {@code cached.client == client} 改回「{@code cached != null} 就返回」——本条立刻红，
     * 且红在 mappingTypeMode 这个值上（期望 TYPED_6X，实得 TYPELESS_7X）。</p>
     */
    @Test
    public void rebindToDifferentCluster_reprobesVersion() {
        FakeCluster sevenX = new FakeCluster("7.10.2");
        FakeCluster sixX = new FakeCluster("6.7.2");
        AtomicReference<FakeCluster> bound = new AtomicReference<>(sevenX);
        HostEsVersionProvider p = new HostEsVersionProvider(() -> bound.get().client);

        assertEquals("7.10.2", p.currentVersion());
        assertEquals(EsVersionCaps.MappingTypeMode.TYPELESS_7X, p.mappingTypeMode());

        // 控制集群重绑到另一个物理集群（6.x）——没有任何人通知本 provider
        bound.set(sixX);

        assertEquals("重绑后必须重探到新集群的版本，不得沿用旧集群缓存", "6.7.2", p.currentVersion());
        assertEquals("重绑 7.x -> 6.x 后必须变成 TYPED_6X，否则 createIndex 会在 6.x 上 mapper_parsing_exception",
                EsVersionCaps.MappingTypeMode.TYPED_6X, p.mappingTypeMode());
    }

    /** 反向同样成立：6.x 重绑到 7.x 后不得继续包 {@code _doc} 层。 */
    @Test
    public void rebindFrom6xTo7x_alsoReprobes() {
        FakeCluster sixX = new FakeCluster("6.7.2");
        FakeCluster sevenX = new FakeCluster("7.10.2");
        AtomicReference<FakeCluster> bound = new AtomicReference<>(sixX);
        HostEsVersionProvider p = new HostEsVersionProvider(() -> bound.get().client);

        assertEquals(EsVersionCaps.MappingTypeMode.TYPED_6X, p.mappingTypeMode());
        bound.set(sevenX);
        assertEquals("重绑 6.x -> 7.x 后必须变成 TYPELESS_7X",
                EsVersionCaps.MappingTypeMode.TYPELESS_7X, p.mappingTypeMode());
    }

    /**
     * 同一个 client 实例不得重复探测——自失效的代价必须只在「真的换了集群」时付出。
     *
     * <p>没有这条，把缓存整个删掉（每次都探）也能让上面两条通过：
     * <b>「什么样的错误实现能让断言照样通过」</b>的答案就是「根本不缓存」。本条堵住它。</p>
     */
    @Test
    public void sameClientIsProbedOnlyOnce() {
        FakeCluster cluster = new FakeCluster("6.7.2");
        HostEsVersionProvider p = new HostEsVersionProvider(() -> cluster.client);

        assertEquals("6.7.2", p.currentVersion());
        assertEquals("6.7.2", p.currentVersion());
        assertEquals(EsVersionCaps.MappingTypeMode.TYPED_6X, p.mappingTypeMode());
        assertEquals("同一 client 只应探测一次（缓存命中）", 1, cluster.probes.get());
    }

    // ---------------------------------------------------------------- helpers

    /**
     * 一台假 ES：{@code GET /} 回自己的 {@code version.number}，并记下被探了几次。
     *
     * <p>刻意<b>不</b>覆写 {@code currentVersion()}——那会把「缓存该不该复用」这段被测逻辑整个绕过。
     * 这里从真实的 {@code GET /} 探测路径进入，缓存键的行为才真的被覆盖。</p>
     */
    private static final class FakeCluster {
        final org.elasticsearch.client.RestHighLevelClient client;
        final AtomicInteger probes = new AtomicInteger();

        FakeCluster(String version) {
            this.client = org.elasticsearch.client.EsFakeClients.respondingWith(
                    "{\"version\":{\"number\":\"" + version + "\"}}", probes);
        }
    }
    /**
     * 造一个「已探到指定版本」的 provider：覆写 {@code currentVersion} 直接给值，
     * 不依赖真实 HTTP，也不用反射戳私有字段（那会让测试与实现细节耦合）。
     */
    private static HostEsVersionProvider providerReturning(String version) {
        return new HostEsVersionProvider(() -> null) {
            @Override
            public String currentVersion() {
                return version;
            }
        };
    }

    /** 最小 ConnStore 桩：只有 getVersion 有行为，其余返回空/no-op。 */
    private static class StubConnStore implements ConnStore {
        String version;

        @Override
        public String getVersion(String id) {
            return version;
        }

        @Override
        public java.util.List<java.util.Map<String, Object>> list() {
            return java.util.Collections.emptyList();
        }

        @Override
        public io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn get(String id) {
            return null;
        }

        @Override
        public String getName(String id) {
            return null;
        }

        @Override
        public java.util.Map<String, Object> save(String id, String name, String url, String username,
                                                  String password, String minRole, Integer connectTimeoutMs,
                                                  Integer socketTimeoutMs, String env) {
            return java.util.Collections.emptyMap();
        }

        @Override
        public void updateVersion(String id, String esVersion) {
        }

        @Override
        public void delete(String id) {
        }
    }
}
