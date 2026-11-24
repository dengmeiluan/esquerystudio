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

import io.github.dengmeiluan.esquerystudio.console.multicluster.ClusterConnContributor;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ClusterConnSyncEngine;
import org.junit.After;
import org.junit.Test;

import java.util.Collections;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

/**
 * 连接中心自动同步批:装配双门布线测试(直调 @Bean 方法体,仿 AuditContributorWiringTest——
 * 无 mockito/ObjectProvider 桩固定返回)。锁定:contributor 缺席→null(零行为);
 * 开关关→null;双门齐备→引擎在场且可 shutdown 清线程。
 */
public class ClusterConnSyncWiringTest {

    private ClusterConnSyncEngine wired;

    @After
    public void tearDown() {
        if (wired != null) {
            wired.shutdown();
        }
    }

    private static <T> org.springframework.beans.factory.ObjectProvider<T> provider(T value) {
        return new org.springframework.beans.factory.ObjectProvider<T>() {
            @Override public T getObject() { if (value == null) throw new UnsupportedOperationException(); return value; }
            @Override public T getObject(Object... args) { return getObject(); }
            @Override public T getIfAvailable() { return value; }
            @Override public T getIfUnique() { return value; }
        };
    }

    private static final ClusterConnContributor CONTRIBUTOR =
            () -> Collections.emptyList();

    private ClusterConnSyncEngine build(ClusterConnContributor contributor, boolean enabled) {
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        props.getConsole().getConnSync().setEnabled(enabled);
        // initialDelay 拉大:测试窗口内绝不真跑调度轮;tearDown shutdown 清线程
        props.getConsole().getConnSync().setInitialDelaySeconds(3600);
        ESQueryStudioConsoleAutoConfiguration.ConsoleModeConfiguration cfg =
                new ESQueryStudioConsoleAutoConfiguration.ConsoleModeConfiguration();
        return cfg.clusterConnSyncEngine(null, null, provider(null), provider(contributor), props);
    }

    @Test
    public void 未注册贡献者_引擎缺席() {
        assertNull(build(null, true));
    }

    @Test
    public void 开关未开_引擎缺席() {
        assertNull(build(CONTRIBUTOR, false));
    }

    @Test
    public void 双门齐备_引擎在场() {
        wired = build(CONTRIBUTOR, true);
        assertNotNull(wired);
    }
}
