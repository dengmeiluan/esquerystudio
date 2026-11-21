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

package io.github.dengmeiluan.esquerystudio.console.config;

import io.github.dengmeiluan.esquerystudio.console.lock.EsRebuildLockStore;
import io.github.dengmeiluan.esquerystudio.console.lock.RebuildLockStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;

/**
 * M6 启动 IO 异步化：把 starter 的 ES store ensureIndex 调用从 @PostConstruct
 * 移到 ApplicationReadyEvent 之后异步执行。
 *
 * 收益：
 *  - bean 装配不做 ES IO，ES 抖动不阻塞 ApplicationContext 启动
 *  - 整个 starter 在容器 ready 后用单个 daemon 线程串行 ensureIndex（互不阻塞）
 *  - 失败仅告警；首次业务写时 ES 仍会自动建（auto_create_index 启用时）
 *
 * <p> 阶段⑤：audit / job 两个 store 随 SPI 重建路径退役，本类只剩 lock 一个。</p>
 *
 * @author aicoding
 */
public class EsRebuildBootstrapRunner {

    private static final Logger logger = LoggerFactory.getLogger(EsRebuildBootstrapRunner.class);

    private final ObjectProvider<RebuildLockStore> lockStoreProvider;

    public EsRebuildBootstrapRunner(ObjectProvider<RebuildLockStore> lockStoreProvider) {
        this.lockStoreProvider = lockStoreProvider;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        Thread t = new Thread(this::ensureAllIndices, "esquerystudio-bootstrap");
        t.setDaemon(true);
        t.start();
    }

    private void ensureAllIndices() {
        // lock：ensureIndex() 返回布尔，成功与否有<b>值</b>可判
        ensureChecked("lock", () -> {
            RebuildLockStore store = lockStoreProvider.getIfAvailable();
            return !(store instanceof EsRebuildLockStore) || ((EsRebuildLockStore) store).ensureIndex();
        });
    }

    /**
     * -67：<b>不再靠「没抛异常」判定成功</b>。
     *
     * <p>各 store 的 {@code ensureIndex()} 本身就是旁路设计——内部 catch 掉异常只打 WARN，
     * 因此这里<b>永远</b>收不到异常，旧代码于是无论真实成败都打出 {@code "xxx index ensured"}。
     * 实测日志里出现过这对相邻行：</p>
     * <pre>
     * WARN  [RebuildLock] ensureIndex failed (...): Timeout connecting to [localhost/127.0.0.1:9200]
     * INFO  [EsRebuildBootstrapRunner] lock index ensured      &lt;-- 紧跟其后的假成功
     * </pre>
     *
     * <p>判据因此必须落在<b>值</b>上：本方法要求 action 返回布尔，
     * 「有没有抛异常」这个控制流信号不再参与判定。</p>
     */
    private void ensureChecked(String tag, java.util.concurrent.Callable<Boolean> action) {
        boolean ok;
        try {
            ok = Boolean.TRUE.equals(action.call());
        } catch (Exception e) {
            logger.warn("[EsRebuildBootstrapRunner] {} ensureIndex threw: {}", tag, e.getMessage(), e);
            return;
        }
        if (ok) {
            logger.info("[EsRebuildBootstrapRunner] {} index ensured", tag);
        } else {
            logger.warn("[EsRebuildBootstrapRunner] {} index NOT ensured (see preceding WARN); "
                    + "first write will fail if auto_create_index is disabled", tag);
        }
    }
}
