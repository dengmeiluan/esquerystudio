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

import org.junit.Test;

import static org.junit.Assert.fail;

/**
 * 控制面索引守卫深水补强：别名操作通配、索引详情直读、空首段路径三个绕过面。
 *
 * <p>风险：{@code "esquerystudio*"} 通配不含控制名字面、字面 body 闸拦不住，别名绑上
 * 控制索引后按名守卫全部失明；索引详情接口混用高级客户端调用绕过路径闸；双斜杠
 * 前缀的空首段被静默放行。三者均可由 VIEWER/OPERATOR 档端点触达控制面数据。</p>
 */
public class EsIndexAdminControlGuardDeep969Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private static void assertRejected(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    @Test
    public void 索引详情接口对控制索引名与通配一律拒绝() {
        assertRejected(() -> {
            try { admin.inspect("esquerystudio_user", 50); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "详情直读控制索引");
        assertRejected(() -> {
            try { admin.inspect("esquerystudio_*", 10); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "详情通配控制索引");
    }

    @Test
    public void 宿主自定义控制索引同样不得经详情接口读出() {
        EsIndexAdmin custom = new EsIndexAdmin(null);
        custom.setExtraControlIndexNames(java.util.Arrays.asList("custom_users"));
        assertRejected(() -> {
            try { custom.inspect("custom_users", 10); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "自定义用户库详情");
    }

    @Test
    public void 别名操作拒绝通配与全量绑定控制索引() {
        assertRejected(() -> {
            try { admin.aliasActions("{\"actions\":[{\"add\":{\"index\":\"esquerystudio*\",\"alias\":\"pwn\"}}]}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "别名通配绑定");
        assertRejected(() -> {
            try { admin.aliasActions("{\"actions\":[{\"add\":{\"index\":\"e*\",\"alias\":\"pwn\"}}]}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "短前缀通配");
        assertRejected(() -> {
            try { admin.aliasActions("{\"actions\":[{\"add\":{\"index\":\"*\",\"alias\":\"pwn\"}}]}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "全量通配");
        assertRejected(() -> {
            try { admin.aliasActions("{\"actions\":[{\"add\":{\"index\":\"_all\",\"alias\":\"pwn\"}}]}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "全量别名");
        assertRejected(() -> {
            try { admin.aliasActions("{\"actions\":[{\"add\":{\"index\":[\"logs-*\",\"esquerystudio_user\"],\"alias\":\"pwn\"}}]}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "数组夹带精确名");
        assertRejected(() -> {
            try { admin.aliasActions("{\"actions\":[{\"remove\":{\"index\":\"esquerystudio_ops_audit\",\"alias\":\"old\"}}]}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "remove 精确控制索引");
    }

    @Test
    public void 别名操作正常业务形态放行() {
        // 不触网：守卫拒绝在客户端调用之前；放行形态在 null 客户端下以非受检异常终止——
        // 只要异常不是 IllegalArgumentException 即认为守卫放行
        assertNotRejectedByGuard(() -> {
            try { admin.aliasActions("{\"actions\":[{\"add\":{\"index\":\"logs-2026\",\"alias\":\"logs\"}}]}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "普通索引绑定");
        assertNotRejectedByGuard(() -> {
            try { admin.aliasActions("{\"actions\":[{\"add\":{\"index\":\"logs-2026\",\"alias\":\"a\"}},{\"remove\":{\"index\":\"orders-*\",\"alias\":\"b\"}}]}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "混合多动作");
    }

    @Test
    public void 别名操作自定义控制索引通配同样拒绝() {
        EsIndexAdmin custom = new EsIndexAdmin(null);
        custom.setExtraControlIndexNames(java.util.Arrays.asList("custom_users"));
        assertRejected(() -> {
            try { custom.aliasActions("{\"actions\":[{\"add\":{\"index\":\"custom_users*\",\"alias\":\"pwn\"}}]}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "自定义名通配绑定");
    }

    @Test
    public void 双斜杠空首段折叠出真实首段再判定() {
        assertRejected(() -> admin.guardControlPath("//esquerystudio_user/_search"), "双斜杠控制索引");
        assertRejected(() -> admin.guardControlPath("//ESQUERYSTUDIO_ELASTICSEARCH_USER/_search"), "双斜杠大小写变体");
        assertRejected(() -> admin.guardControlPath("///esquerystudio_user/_search"), "三斜杠");
        assertRejected(() -> admin.guardControlPath("//esquerystudio_user"), "双斜杠无后续段");
        assertRejected(() -> admin.guardControlPath("//esquerystudio*/_search"), "双斜杠通配");
        assertRejected(() -> admin.guardControlPath("//%65squerystudio_user/_search"), "双斜杠百分号编码");
    }

    @Test
    public void 双斜杠正常业务与系统路径不回归() {
        admin.guardControlPath("//logs-2026/_search");
        admin.guardControlPath("//_cluster/health");
        admin.guardControlPath("//_cat/shards");
        admin.guardControlPath("/logs-2026/_search");
        admin.guardControlPath("/");
    }

    @Test
    public void 集群级操作body同样不得引用控制索引() {
        assertRejected(() -> {
            try { admin.clusterReroute("{\"commands\":[{\"allocate_stale_primary\":{\"index\":\"esquerystudio_user\",\"shard\":0,\"node\":\"n1\",\"accept_data_loss\":true}}]}", false, false); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "reroute 引用控制索引");
        assertRejected(() -> {
            try { admin.putClusterSettings("{\"persistent\":{\"action.destructive_requires_name\":\"esquerystudio_user\"}}"); }
            catch (java.io.IOException e) { throw new RuntimeException(e); }
        }, "集群设置引用控制索引");
    }

    private static void assertNotRejectedByGuard(Runnable r, String why) {
        try {
            r.run();
            fail("应到达客户端调用环节（null 客户端以非受检异常终止）：" + why);
        } catch (IllegalArgumentException rejected) {
            fail("业务放行形态不应被守卫拒绝：" + why + " → " + rejected.getMessage());
        } catch (RuntimeException expected) {
            // ok：守卫放行后的 NPE/IO 包装
        }
    }
}
