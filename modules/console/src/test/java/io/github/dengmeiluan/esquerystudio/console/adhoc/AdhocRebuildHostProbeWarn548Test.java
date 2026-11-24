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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLock;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLockStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertTrue;

/**
 * {@link AdhocRebuildService#start(Map)} 宿主版本探测失败 <b>debug 升 WARN</b>
 * （观测缺口收口，模板：JdbcConnStoreUpdateVersionWarnTest 的 ListAppender 范式）。
 *
 * <p><b>缺口与裁决</b>：target 快照契约（start 内注释在案）宣称「名称/版本做创建时快照——
 * 连接此后改名/删除不影响历史作业的语义与审计」，但宿主路径探测失败仅 {@code logger.debug}——
 * 快照缺失意味着 job 记录 targetEsVersion 恒空，「历史作业跑在哪个 ES 版本上」的审计语义丢失，
 * 与契约相悖；且探测仅在 start 时一次（低频），逐条 WARN 无刷屏风险，故升 WARN 留痕、不抛。
 * 升级不改控制流：异常仍吞在 try 内，start 主流程零变化。</p>
 *
 * <p>打点路径（直构造+覆写桩，本仓无 mockito；覆写先例：AdhocTargetExecutionTest.RecordingRouter）：
 * 路由器覆写 {@code currentEsVersion()} 直接抛（catch 守的正是「public API 任何 Exception」），
 * admin 桩 aliasExists=true 走别名模式让 start 走通，client 供给 null（异步 worker NPE 转 FAILED
 * 是既有测试在案的预期观测终点，不影响本批断言）。断言：WARN 事件存在且含「host version probe
 * failed」标识、start 正常返回（不抛）。</p>
 *
 * @author aicoding
 */
public class AdhocRebuildHostProbeWarn548Test {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(AdhocRebuildService.class)).addAppender(appender);
    }

    @After
    public void tearDown() {
        ((Logger) LoggerFactory.getLogger(AdhocRebuildService.class)).detachAppender(appender);
    }

    /** 宿主版本探测失败必须落 WARN（版本快照缺失=丢审计语义），且异常吞在店内、start 不抛。 */
    @Test
    public void hostProbeFailureLeavesWarnWithoutThrowing() throws Exception {
        EsIndexAdmin admin = new AliasModeAdminStub();
        AdhocRebuildService service = new AdhocRebuildService(
                admin, () -> null, 60_000L, alwaysAcquireLocks(), 60_000L,
                new InMemoryAdhocJobStore(), throwingVersionRouter(), emptyConns());

        Map<String, Object> req = new HashMap<>();
        req.put("index", "orders");
        req.put("strategy", "MANUAL");
        req.put("settingsJson", "{\"number_of_shards\":1}");
        req.put("mappingJson", "{\"properties\":{}}");

        Map<String, Object> out = service.start(req);

        assertTrue("start 必须正常返回（探测失败不阻断建作业）", out != null);
        assertTrue("宿主版本探测失败必须落服务端 WARN（含 host version probe failed 标识），此前只有 debug",
                countProbeWarn() >= 1);
    }

    /* ── 桩设施 ── */

    /** 覆写 currentEsVersion 直接抛：宿主探测失败的触发点（catch 守的就是任何 Exception）。 */
    private static EsClientRouter throwingVersionRouter() {
        return new EsClientRouter(() -> {
            throw new IllegalStateException("控制集群未绑定(桩)");
        }, emptyConns(), new RemoteEsClientFactory(100, 100) {
            @Override
            public RestHighLevelClient build(RemoteClusterConn c) {
                return null;
            }
        }) {
            @Override
            public String currentEsVersion() {
                throw new IllegalStateException("GET / 探测断连(桩)");
            }
        };
    }

    /** 别名模式最小 admin：aliasExists=true + getWriteIndex 给定值，start 走通到作业创建。 */
    private static class AliasModeAdminStub extends EsIndexAdmin {
        AliasModeAdminStub() {
            super(null);
        }

        @Override
        public boolean aliasExists(String alias) {
            return true;
        }

        @Override
        public String getWriteIndex(String alias) {
            return "src_idx";
        }

        @Override
        public boolean indexExists(String index) {
            return false;
        }
    }

    /** tryAcquire 恒成功的锁桩（start 校验后取锁路径放行）。 */
    private static RebuildLockStore alwaysAcquireLocks() {
        return new RebuildLockStore() {
            @Override public boolean tryAcquire(String indexKey, long leaseMs) { return true; }
            @Override public boolean renew(String indexKey, long leaseMs) { return true; }
            @Override public void release(String indexKey) { }
            @Override public void forceRelease(String indexKey) { }
            @Override public RebuildLock get(String indexKey) { return null; }
            @Override public String owner() { return "pid1@hostA"; }
        };
    }

    /** 空档案桩（宿主路径不触达，仅满足 router/服务构造形状）。 */
    private static ConnStore emptyConns() {
        return new ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return null; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                                                     String password, String minRole, Integer connectTimeoutMs,
                                                     Integer socketTimeoutMs, String env) {
                return new HashMap<>();
            }
            @Override public void updateVersion(String id, String esVersion) { }
            @Override public void delete(String id) { }
        };
    }

    private int countProbeWarn() {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && e.getFormattedMessage().contains("host version probe failed")) {
                n++;
            }
        }
        return n;
    }
}
