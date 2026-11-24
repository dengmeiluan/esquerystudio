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

package io.github.dengmeiluan.esquerystudio.console.core;

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLock;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.junit.Test;
import org.springframework.data.elasticsearch.annotations.Document;

import java.io.IOException;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 *  +12：{@link EsIndexRebuildService} 手术后<b>幸存方法仍然做对了事</b>的判据。
 *
 * <p><b>为什么需要本类</b>：本 Task 删掉了 service 的 SPI 重建路径，并对
 * {@code status} / {@code health} / {@code rebuildEmpty} 三个<b>幸存方法做了原地手术</b>
 * （摘掉 job 块、能力位、triggerReload 分支）。这三处此前<b>零测试覆盖</b>，
 * 而「编译过了」只能证明<b>没有静态引用残留</b>，完全不能证明<b>行为仍然正确</b>——
 * 例如把 {@code status()} 整个改成 {@code return null}、或让 {@code rebuildEmpty}
 * 少切一次别名，编译同样是绿的。故判据必须落在<b>返回值</b>与<b>实际调用序列</b>上。</p>
 *
 * <p>不覆盖已删除的方法（它们不存在了），只覆盖<b>保留下来的契约</b>。</p>
 */
public class EsIndexRebuildServiceSurvivingBehaviorTest {

    @Document(indexName = "foo_alias")
    static class FooES { }

    /** 记录 admin 上真实发生的调用序列——切换/删除这类副作用只能靠序列断言，返回值看不见。 */
    static class RecordingAdmin extends EsIndexAdmin {
        final List<String> calls = new java.util.ArrayList<>();
        boolean aliasExists = true;
        String writeIndex = "foo_alias_v20240101000000";
        Set<String> indicesByAlias = new LinkedHashSet<>(Arrays.asList("foo_alias_v20240101000000"));
        boolean indexExists = false;

        RecordingAdmin() {
            super(null);
        }

        @Override public boolean aliasExists(String alias) { calls.add("aliasExists:" + alias); return aliasExists; }
        @Override public boolean indexExists(String index) { calls.add("indexExists:" + index); return indexExists; }
        @Override public String getWriteIndex(String alias) { calls.add("getWriteIndex:" + alias); return writeIndex; }
        @Override public Set<String> getIndicesByAlias(String alias) { calls.add("getIndicesByAlias:" + alias); return indicesByAlias; }
        @Override public String getMapping(String index) { calls.add("getMapping:" + index); return "{}"; }
        @Override public void createIndex(String i, String s, String m) { calls.add("createIndex:" + i); }
        @Override public void switchWriteIndex(String a, String n, String o) { calls.add("switchWriteIndex:" + a + ":" + n + ":" + o); }
        @Override public void removeAlias(String a, String p) { calls.add("removeAlias:" + a + ":" + p); }
        @Override public void deleteIndex(String i) { calls.add("deleteIndex:" + i); }
        @Override public Map<String, Object> inspect(String name, int size) { calls.add("inspect:" + name); return java.util.Collections.singletonMap("index", name); }
        @Override Map<String, Object> inspectInternal(String name, int size) { calls.add("inspect:" + name); return java.util.Collections.singletonMap("index", name); }
        /* 2.1.7：系统页走 trusted 通道（锁索引名由装配处注入，通用守卫会拒绝该名） */
        @Override Map<String, Object> inspectSystemIndex(String name, int size) { calls.add("inspect:" + name); return java.util.Collections.singletonMap("index", name); }
        @Override Map<String, Object> querySystemIndex(String name, String dsl, int size) { calls.add("query:" + name); return java.util.Collections.singletonMap("index", name); }
    }

    /** 不碰 ES 的锁守卫：只记录 acquire/release，get() 返回可控的锁视图。 */
    static class FakeLockGuard extends RebuildLockGuard {
        final List<String> calls = new java.util.ArrayList<>();
        RebuildLock lock;

        FakeLockGuard() {
            super(null, new ESQueryStudioElasticsearchProperties());
        }

        @Override public void acquire(String indexKey) { calls.add("acquire:" + indexKey); }
        @Override public void release(String indexKey) { calls.add("release:" + indexKey); }
        @Override public void renewOrFail(String indexKey) { calls.add("renew:" + indexKey); }
        @Override public RebuildLock get(String indexKey) { return lock; }
        @Override public String selfOwner() { return "self-owner"; }
    }

    private static IndexMetaRegistry registryWithFoo() {
        RebuildableIndexMeta meta = new RebuildableIndexMeta(
                (ManagedEsIndex) () -> FooES.class, "foo_alias", "foo_alias", null, "{\"properties\":{}}");
        IndexMetaRegistry registry = new IndexMetaRegistry(null, java.util.Collections.emptyList()) {
            @Override public RebuildableIndexMeta getByKey(String indexKey) {
                if (!"foo".equals(indexKey)) throw new IllegalArgumentException("未登记 indexKey=" + indexKey);
                return meta;
            }
            @Override public List<String> listIndexKeys() { return java.util.Collections.singletonList("foo"); }
        };
        return registry;
    }

    private static EsIndexRebuildService service(RecordingAdmin admin, FakeLockGuard guard) {
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        return new EsIndexRebuildService(registryWithFoo(), admin, guard,
                new IndexNameResolver(admin, props, null), props);
    }

    // ───────── status()：保留的是「别名/相位/契约/锁」四块，删掉的是 job 与能力位 ─────────

    /**
     * 别名态下 status 必须仍然产出别名视图与契约卡。
     *
     * <p>能让这条通过的错误实现：几乎没有——它同时钉住 4 个键的<b>取值</b>
     * （不是「非空」），phase 取错、别名视图漏读、契约卡少字段都会红。</p>
     */
    @Test
    public void statusOnAliasStillReportsAliasViewAndContract() throws IOException {
        RecordingAdmin admin = new RecordingAdmin();
        Map<String, Object> status = service(admin, new FakeLockGuard()).status("foo");

        assertEquals("indexKey 必须原样回传", "foo", status.get("indexKey"));
        assertEquals("name 取别名名", "foo_alias", status.get("name"));
        assertEquals("别名存在时 isAlias=true", Boolean.TRUE, status.get("isAlias"));
        assertEquals("别名态 phase 必须是 ALIAS", "ALIAS", status.get("phase"));
        assertEquals("aliasIndices 必须来自 admin", admin.indicesByAlias, status.get("aliasIndices"));
        assertEquals("writeIndex 必须来自 admin", admin.writeIndex, status.get("writeIndex"));

        @SuppressWarnings("unchecked")
        Map<String, Object> contract = (Map<String, Object>) status.get("contract");
        assertNotNull("契约卡不可丢失", contract);
        assertEquals(FooES.class.getName(), contract.get("entityClass"));
        assertEquals("foo_alias", contract.get("aliasName"));
        assertEquals("foo_alias", contract.get("physicalIndexPrefix"));
        assertEquals("实体声明了 mapping，hasMapping 必须为 true", Boolean.TRUE, contract.get("hasMapping"));
    }

    /**
     * 能力位与 job 块必须<b>确实消失</b>——这是本 Task 声称删干净的正面判据。
     *
     * <p>若有人把能力位以别的形式加回来（或 job 块残留），本条红。</p>
     */
    @Test
    public void statusNoLongerExposesCapabilityBitsOrJobBlock() throws IOException {
        Map<String, Object> status = service(new RecordingAdmin(), new FakeLockGuard()).status("foo");

        assertFalse("能力接口已删，status 不该再有 supportsIncrementalReplay",
                status.containsKey("supportsIncrementalReplay"));
        assertFalse("能力接口已删，status 不该再有 hasPhysicalDeletion",
                status.containsKey("hasPhysicalDeletion"));
        assertFalse("作业追踪已删，status 不该再有 job 块", status.containsKey("job"));

        @SuppressWarnings("unchecked")
        Map<String, Object> contract = (Map<String, Object>) status.get("contract");
        assertFalse("fullReload SPI 已删", contract.containsKey("supportsFullReload"));
        assertFalse("能力接口已删", contract.containsKey("supportsIncrementalReplay"));
        assertFalse("能力接口已删", contract.containsKey("hasPhysicalDeletion"));
    }

    /** 非别名态：phase 必须按索引是否存在区分 CONCRETE / ABSENT，且不产出别名视图。 */
    @Test
    public void statusWithoutAliasReportsConcreteOrAbsent() throws IOException {
        RecordingAdmin concrete = new RecordingAdmin();
        concrete.aliasExists = false;
        concrete.indexExists = true;
        assertEquals("同名具体索引存在 → CONCRETE",
                "CONCRETE", service(concrete, new FakeLockGuard()).status("foo").get("phase"));

        RecordingAdmin absent = new RecordingAdmin();
        absent.aliasExists = false;
        absent.indexExists = false;
        Map<String, Object> status = service(absent, new FakeLockGuard()).status("foo");
        assertEquals("都不存在 → ABSENT", "ABSENT", status.get("phase"));
        assertFalse("非别名态不该有 aliasIndices", status.containsKey("aliasIndices"));
    }

    /** 锁视图仍必须按 RebuildLock 的充血方法产出 owner/expired/self ——  的锁能力不受本次删除影响。 */
    @Test
    public void statusStillExposesLockView() throws IOException {
        FakeLockGuard guard = new FakeLockGuard();
        guard.lock = new RebuildLock("other-owner",
                System.currentTimeMillis() - 1000, System.currentTimeMillis() + 60_000, 1L, 1L);

        @SuppressWarnings("unchecked")
        Map<String, Object> lockMap = (Map<String, Object>)
                service(new RecordingAdmin(), guard).status("foo").get("lock");

        assertNotNull("有锁时必须产出锁视图", lockMap);
        assertEquals("other-owner", lockMap.get("owner"));
        assertEquals("未到期 → expired=false", Boolean.FALSE, lockMap.get("expired"));
        assertEquals("owner 非本实例 → self=false", Boolean.FALSE, lockMap.get("self"));
    }

    /** 无锁时不产出 lock 键（而不是塞一个空壳）。 */
    @Test
    public void statusOmitsLockViewWhenNoLock() throws IOException {
        assertFalse("无锁时不该有 lock 键",
                service(new RecordingAdmin(), new FakeLockGuard()).status("foo").containsKey("lock"));
    }

    // ───────── health()：保留锁汇总，删掉 stuckJobs 与 noFullReloadSafetyNet ─────────

    /** 锁汇总必须按 self/other/expired 正确归类——这是 health 手术后仅存的实质内容。 */
    @Test
    public void healthStillSummarizesLocksByOwnership() {
        FakeLockGuard guard = new FakeLockGuard();
        guard.lock = new RebuildLock("self-owner",
                System.currentTimeMillis() - 1000, System.currentTimeMillis() + 60_000, 1L, 1L);

        Map<String, Object> health = service(new RecordingAdmin(), guard).health();

        @SuppressWarnings("unchecked")
        Map<String, Object> locks = (Map<String, Object>) health.get("locks");
        assertEquals("本实例持有 → self=1", 1, locks.get("self"));
        assertEquals(0, locks.get("other"));
        assertEquals(0, locks.get("expired"));
        assertEquals("self-owner", health.get("self"));
        assertEquals("totalIndices 取自 registry", 1, health.get("totalIndices"));
        assertNotNull("checkedAt 必须有值", health.get("checkedAt"));
    }

    /** 过期锁必须计入 expired 而不是 self —— 归类逻辑在手术中被保留下来，钉住它。 */
    @Test
    public void healthCountsExpiredLockAsExpired() {
        FakeLockGuard guard = new FakeLockGuard();
        guard.lock = new RebuildLock("self-owner",
                System.currentTimeMillis() - 120_000, System.currentTimeMillis() - 60_000, 1L, 1L);

        @SuppressWarnings("unchecked")
        Map<String, Object> locks = (Map<String, Object>)
                service(new RecordingAdmin(), guard).health().get("locks");

        assertEquals("已过期的锁必须归 expired", 1, locks.get("expired"));
        assertEquals("过期锁不该同时算作本实例持有", 0, locks.get("self"));
    }

    /** 已删除的两个字段必须确实不在返回值里。 */
    @Test
    public void healthNoLongerReportsStuckJobsOrFullReloadSafetyNet() {
        Map<String, Object> health = service(new RecordingAdmin(), new FakeLockGuard()).health();
        assertFalse("作业追踪已删", health.containsKey("stuckJobs"));
        assertFalse("fullReload SPI 已删", health.containsKey("noFullReloadSafetyNet"));
    }

    // ───────── rebuildEmpty()：保留「建新→切换→摘旧别名→删旧」，删掉 triggerReload 分支 ─────────

    /**
     * 空索引重建的<b>动作序列</b>必须完整保留：建新索引 → 切 write 别名 → 摘旧别名 → 删旧索引。
     *
     * <p><b>本条防的失败模式</b>：手术时顺手删掉某一步（比如漏了 deleteIndex 或 removeAlias），
     * 返回值照样长得对、编译照样过、其它断言照样绿——只有序列断言能发现。
     * 顺序同样重要：先删旧索引再切别名会造成真空期。</p>
     */
    @Test
    public void rebuildEmptyStillPerformsFullSwapSequence() throws IOException {
        RecordingAdmin admin = new RecordingAdmin();
        FakeLockGuard guard = new FakeLockGuard();

        Map<String, Object> result = service(admin, guard).rebuildEmpty("foo");

        String old = "foo_alias_v20240101000000";
        assertEquals("oldPhysical 必须是切换前的 write 索引", old, result.get("oldPhysical"));
        assertEquals("空重建后 docCount 恒为 0", 0, result.get("docCount"));
        assertEquals("foo", result.get("indexKey"));

        String newPhysical = (String) result.get("newPhysical");
        assertNotNull("必须产出新物理索引名", newPhysical);
        assertTrue("新物理索引名须为 前缀_v<版本>，实际=" + newPhysical,
                newPhysical.startsWith("foo_alias_v"));
        assertFalse("新索引不能与旧索引同名", newPhysical.equals(old));

        int createAt = admin.calls.indexOf("createIndex:" + newPhysical);
        int switchAt = admin.calls.indexOf("switchWriteIndex:foo_alias:" + newPhysical + ":" + old);
        int removeAt = admin.calls.indexOf("removeAlias:foo_alias:" + old);
        int deleteAt = admin.calls.indexOf("deleteIndex:" + old);

        assertTrue("必须建新物理索引，实际调用=" + admin.calls, createAt >= 0);
        assertTrue("必须原子切换 write 别名，实际调用=" + admin.calls, switchAt >= 0);
        assertTrue("必须把旧索引摘出别名，实际调用=" + admin.calls, removeAt >= 0);
        assertTrue("必须删掉旧物理索引，实际调用=" + admin.calls, deleteAt >= 0);
        assertTrue("顺序错误：必须先建新索引再切别名", createAt < switchAt);
        assertTrue("顺序错误：必须先切别名再摘旧别名", switchAt < removeAt);
        assertTrue("顺序错误：必须先摘别名再删旧索引", removeAt < deleteAt);
    }

    /** 全程必须持锁：起点 acquire、终点 release，否则多实例可并发切同一个别名。 */
    @Test
    public void rebuildEmptyAcquiresAndReleasesLock() throws IOException {
        FakeLockGuard guard = new FakeLockGuard();
        service(new RecordingAdmin(), guard).rebuildEmpty("foo");

        assertEquals("必须恰好 acquire 一次、release 一次，实际=" + guard.calls,
                Arrays.asList("acquire:foo", "release:foo"), guard.calls);
    }

    /** 失败路径必须释放锁，否则该 indexKey 会被一把幽灵锁永久占住。 */
    @Test
    public void rebuildEmptyReleasesLockWhenAliasMissing() {
        RecordingAdmin admin = new RecordingAdmin();
        admin.aliasExists = false;
        FakeLockGuard guard = new FakeLockGuard();

        try {
            service(admin, guard).rebuildEmpty("foo");
            org.junit.Assert.fail("别名不存在时必须抛错");
        } catch (Exception expected) {
            assertTrue("错误信息要点名别名，实际=" + expected.getMessage(),
                    String.valueOf(expected.getMessage()).contains("foo_alias"));
        }
        assertTrue("异常路径也必须释放锁，实际=" + guard.calls, guard.calls.contains("release:foo"));
    }

    /** triggerReload 已随 fullReload SPI 删除：返回值里不该再有这个键。 */
    @Test
    public void rebuildEmptyNoLongerReportsTriggerReload() throws IOException {
        assertFalse("fullReload SPI 已删，triggerReload 不该再出现",
                service(new RecordingAdmin(), new FakeLockGuard()).rebuildEmpty("foo")
                        .containsKey("triggerReload"));
    }

    // ───────── 系统索引查询：job/audit 已退役，只剩 lock ─────────

    /** lock 索引名必须用装配处注入的那个值，而不是就地再推一遍。 */
    @Test
    public void inspectSystemUsesInjectedLockIndexName() throws IOException {
        RecordingAdmin admin = new RecordingAdmin();
        EsIndexRebuildService svc = service(admin, new FakeLockGuard());
        svc.setLockIndexName("prod_app_esquerystudio_lock");

        svc.inspectSystem("lock");

        assertTrue("必须查注入的那个锁索引，实际调用=" + admin.calls,
                admin.calls.contains("inspect:prod_app_esquerystudio_lock"));
    }

    /** 2.1.7：系统页查询同样走 trusted 通道 + 注入的锁索引名（此前恒被通用守卫 403）。 */
    @Test
    public void querySystemUsesInjectedLockIndexNameViaTrustedPath() throws IOException {
        RecordingAdmin admin = new RecordingAdmin();
        EsIndexRebuildService svc = service(admin, new FakeLockGuard());
        svc.setLockIndexName("prod_app_esquerystudio_lock");

        svc.querySystem("lock", "{\"query\":{\"match_all\":{}}}", 20);

        assertTrue("必须查注入的那个锁索引（trusted 通道），实际调用=" + admin.calls,
                admin.calls.contains("query:prod_app_esquerystudio_lock"));
    }

    /** job / audit 已退役，再查必须明确报错，而不是静默查一个不存在的索引。 */
    @Test
    public void inspectSystemRejectsRetiredJobAndAudit() {
        EsIndexRebuildService svc = service(new RecordingAdmin(), new FakeLockGuard());
        svc.setLockIndexName("prod_app_esquerystudio_lock");

        for (String retired : new String[]{"job", "audit"}) {
            try {
                svc.inspectSystem(retired);
                org.junit.Assert.fail("已退役的系统索引 " + retired + " 必须被拒绝");
            } catch (IllegalArgumentException expected) {
                assertTrue("错误信息应指明只剩 lock，实际=" + expected.getMessage(),
                        String.valueOf(expected.getMessage()).contains("lock"));
            } catch (IOException e) {
                throw new AssertionError("不该走到 IO", e);
            }
        }
    }

    /** progress 是纯 taskId 查询，与 SPI 无关，必须原样透传给 admin。 */
    @Test
    public void progressStillDelegatesToAdmin() throws IOException {
        final boolean[] called = {false};
        RecordingAdmin admin = new RecordingAdmin() {
            @Override public ReindexProgress getReindexProgress(String taskId) {
                called[0] = true;
                assertEquals("taskId 必须原样透传", "node:42", taskId);
                return null;
            }
        };
        assertNull(service(admin, new FakeLockGuard()).progress("node:42"));
        assertTrue("progress 必须委托给 admin", called[0]);
    }
}
