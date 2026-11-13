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

package io.github.dengmeiluan.esquerystudio.console.probe;

import io.github.dengmeiluan.esquerystudio.console.lock.EsRebuildLockStore;
import io.github.dengmeiluan.esquerystudio.console.lock.VersionAwareLockDocPort;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps;
import io.github.dengmeiluan.esquerystudio.console.multicluster.HostEsVersionProvider;
import org.apache.http.HttpHost;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * -67 阶段④演练：<b>走真实的 {@link EsRebuildLockStore} 类</b>在 6.7.2 上抢锁。
 *
 * <p><b>为什么必须重跑</b>：阶段⑤ Step 8 的「8 进程恰好 1 个成功」是用 <b>curl 复刻 6.x 形态</b>
 * 得出的——脚本发的是 6.x 形态，而代码经 RHLC 发的是 typeless 形态，<b>两条线路不同</b>。
 * 那次证明的是「ES 的 CAS 语义」+「该类在 7.x 上的行为」，<b>不能声称它在 6.x 上可用</b>。
 * 修复后该类在 6.x 上真能跑，于是这次让 N 个线程<b>通过该类本身</b>抢锁，
 * 把证据从「协议层性质」升级为「该类在 6.7.2 上的真实行为」。</p>
 *
 * <p>非 JUnit：main 方法运行，避免污染 CI。只碰 {@code r93_drill_} 前缀，清理在 finally。</p>
 *
 * <pre>
 * mvn -o test-compile
 * mvn -o exec:java -Dexec.classpathScope=test \
 *     -Dexec.mainClass=io.github.dengmeiluan.esquerystudio.console.probe.LockContentionDrill
 * </pre>
 */
public final class LockContentionDrill {

    private static final String ES_HOST = "10.64.10.74";
    private static final int ES_PORT = 9200;
    private static final String LOCK_INDEX = "r93_drill_lock";
    private static final String KEY = "r93_drill_bond_basic";
    private static final int CONTENDERS = 8;

    public static void main(String[] args) throws Exception {
        RestHighLevelClient client = new RestHighLevelClient(
                RestClient.builder(new HttpHost(ES_HOST, ES_PORT, "http")));
        int exit = 0;
        try {
            HostEsVersionProvider hostVersion = new HostEsVersionProvider(() -> client);
            String version = hostVersion.currentVersion();
            EsVersionCaps.MappingTypeMode mode = hostVersion.mappingTypeMode();
            System.out.println("=== lock contention drill (real EsRebuildLockStore) ===");
            System.out.println("host version probed : " + version);
            System.out.println("mappingTypeMode     : " + mode);
            if (!"6.7.2".equals(version) || mode != EsVersionCaps.MappingTypeMode.TYPED_6X) {
                System.out.println("FAIL: expected 6.7.2 / TYPED_6X");
                exit = 1;
            }

            cleanup(client);

            // 每个竞争者一个独立 store 实例（模拟多实例），共用一个集群
            List<EsRebuildLockStore> stores = new ArrayList<>();
            for (int i = 0; i < CONTENDERS; i++) {
                stores.add(new EsRebuildLockStore(
                        new VersionAwareLockDocPort(() -> client, hostVersion), LOCK_INDEX, true));
            }

            // ensureIndex 必须在 6.x 上成功（mapping 带 _doc 包层）。
            // 返回值必须接住：本轮核心教训就是「成败必须是可读取的值」——丢掉返回值等于把判据
            // 交还给控制流，false 时演练会以下一行的栈跟踪而非 FAIL: 收场，exit 也不会被置 1。
            if (!stores.get(0).ensureIndex()) {
                System.out.println("FAIL: ensureIndex returned false");
                exit = 1;
            }
            String mapping = get(client, "/" + LOCK_INDEX + "/_mapping");
            System.out.println("lock index mapping  : " + mapping);
            boolean typed = mapping.contains("\"_doc\"");
            System.out.println("mapping has _doc    : " + typed + (typed ? "  (6.x correct)" : "  FAIL"));
            if (!typed) {
                exit = 1;
            }

            // N 线程同时抢同一个 key
            ExecutorService pool = Executors.newFixedThreadPool(CONTENDERS);
            CyclicBarrier barrier = new CyclicBarrier(CONTENDERS);
            AtomicInteger acquired = new AtomicInteger();
            List<Future<Boolean>> futures = new ArrayList<>();
            for (int i = 0; i < CONTENDERS; i++) {
                final EsRebuildLockStore store = stores.get(i);
                futures.add(pool.submit((Callable<Boolean>) () -> {
                    barrier.await();
                    boolean got = store.tryAcquire(KEY, 60000);
                    if (got) {
                        acquired.incrementAndGet();
                    }
                    return got;
                }));
            }
            int wins = 0;
            for (Future<Boolean> f : futures) {
                if (f.get()) {
                    wins++;
                }
            }
            pool.shutdown();

            System.out.println("contenders          : " + CONTENDERS);
            System.out.println("acquired            : " + wins);
            boolean exactlyOne = wins == 1;
            System.out.println("exactly-one-winner  : " + exactlyOne + (exactlyOne ? "  PASS" : "  FAIL"));
            if (!exactlyOne) {
                exit = 1;
            }

            // 反向对照：锁已被持有且未过期 -> 再抢必须失败
            boolean again = stores.get(0).tryAcquire(KEY, 60000);
            System.out.println("re-acquire held lock: " + again + (again ? "  FAIL" : "  PASS (rejected)"));
            if (again) {
                exit = 1;
            }

            // release 后可再抢 -> 证明释放路径也走通了（不是「永远抢不到」造成的假 PASS）
            stores.get(0).release(KEY);
            boolean afterRelease = stores.get(1).tryAcquire(KEY, 60000);
            System.out.println("acquire after release: " + afterRelease
                    + (afterRelease ? "  PASS" : "  FAIL"));
            if (!afterRelease) {
                exit = 1;
            }
            stores.get(1).release(KEY);

            System.out.println(exit == 0 ? "=== DRILL RESULT: PASS ===" : "=== DRILL RESULT: FAIL ===");
        } finally {
            try {
                cleanup(client);
            } finally {
                client.close();
            }
        }
        System.exit(exit);
    }

    private static void cleanup(RestHighLevelClient client) {
        try {
            client.getLowLevelClient().performRequest(new Request("DELETE", "/" + LOCK_INDEX));
            System.out.println("[cleanup] deleted " + LOCK_INDEX);
        } catch (Exception ignore) {
            // 不存在即可
        }
    }

    private static String get(RestHighLevelClient client, String path) throws Exception {
        return org.apache.http.util.EntityUtils.toString(
                client.getLowLevelClient().performRequest(new Request("GET", path)).getEntity());
    }

    private LockContentionDrill() {
    }
}
