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

package io.github.dengmeiluan.esquerystudio.console.auth;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 批次 1002：权限加固回归锚。
 *
 * <p>覆盖四条「写面口径」修复，每条都对应一类真实越权/误拦形态：</p>
 * <ul>
 *   <li>集群级 ILM 开关（ilm/start|stop）不吃单索引页写键的语义——连接模型补 rank3 硬门；</li>
 *   <li>连接档案根路径的写形态必须落在系统管理域（GET 列表仍可读）；</li>
 *   <li>护栏动作评估面（estimate/dry-run）是只读 POST，不能把只读页持有人拦在门外，
 *       而 execute 仍是写档；</li>
 *   <li>热 Setting 两个入口同一页集——index-settings/indices/optimizer 写键不再被 403。</li>
 * </ul>
 */
public class PermMapHarden1002Test {

    private static final String BASE = "/internal/es/index";

    @Test
    public void 集群级ILM开关按尾段识别不吞子路径() {
        assertTrue(ConsoleAuthInterceptor.isClusterScopeWrite(BASE + "/cluster/ilm/start"));
        assertTrue(ConsoleAuthInterceptor.isClusterScopeWrite(BASE + "/cluster/ilm/stop"));
        /* 全集群分片重试同属集群级动作（diag 页其余端点全是只读诊断） */
        assertTrue(ConsoleAuthInterceptor.isClusterScopeWrite(BASE + "/cluster/reroute/retry-failed"));
        /* ILM 策略是集群级共享件；SLM 执行/任务取消同样不带索引目标 */
        assertTrue(ConsoleAuthInterceptor.isClusterScopeWrite(BASE + "/cluster/ilm/policy"));
        assertTrue(ConsoleAuthInterceptor.isClusterScopeWrite(BASE + "/cluster/slm/execute"));
        assertTrue(ConsoleAuthInterceptor.isClusterScopeWrite(BASE + "/cluster/tasks/cancel"));
        /* 单索引生命周期动作不属于集群级开关 */
        assertFalse(ConsoleAuthInterceptor.isClusterScopeWrite(BASE + "/cluster/ilm/move"));
        assertFalse(ConsoleAuthInterceptor.isClusterScopeWrite(BASE + "/cluster/ilm/status"));
        /* 段边界：前缀子路径不得被尾匹配吞掉 */
        assertFalse(ConsoleAuthInterceptor.isClusterScopeWrite(BASE + "/cluster/ilm/start-preview"));
        assertFalse(ConsoleAuthInterceptor.isClusterScopeWrite(BASE + "/cluster/tasks/cancel-preview"));
    }

    @Test
    public void 集群级ILM开关静态模型维持专项档() {
        /* 三个 rank3 专项同 rank：requiredRole 统一返回 REBUILD_OP 作 canonical 标记，
           atLeast 保证 CLUSTER_OP/AUDIT_OP 同样通过 */
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/cluster/ilm/start"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/cluster/ilm/stop"));
        assertTrue(ConsoleRole.REBUILD_OP.atLeast(ConsoleRole.CLUSTER_OP));
        /* 读侧不被写关键词误提档（有权限的 VIEWER 不被挡） */
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", BASE + "/cluster/ilm/status"));
    }

    @Test
    public void 连接档案根路径写是管理员档读仍可读() {
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/clusters"));
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("PUT", BASE + "/clusters"));
        /* 列表是脱敏只读观测：VIEWER 可读，不能因根路径一刀切被拦 */
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", BASE + "/clusters"));
        /* 子路径行为不变 */
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/clusters/save"));
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", BASE + "/clusters/sync"));
    }

    @Test
    public void 护栏动作评估面与执行面同为写档() {
        /* estimate 成功即签发 confirmToken（写意图的凭证），dry-run 与 execute 同门——
           三者都不能按只读放行：连接模型下只有走「共享写」分支才会置位
           ATTR_CONN_WRITE_GRANTED，动作执行器才能用页写键替代 minRole。
           误判成只读会让持 w:index-settings 的 VIEWER 在「影响预估」处被 403。 */
        assertFalse(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/insight/actions/apply-index-settings/estimate"));
        assertFalse(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/insight/actions/apply-index-settings/dry-run"));
        assertFalse(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/insight/actions/apply-index-settings/execute"));
        /* 只读的影响分析（编辑器防抖实时调用）仍是 VIEWER 档 */
        assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/insight/settings-impact"));
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/insight/settings-impact"));
        assertEquals(ConsoleRole.OPERATOR,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/insight/actions/apply-index-settings/estimate"));
        assertEquals(ConsoleRole.OPERATOR,
                ConsoleAuthInterceptor.requiredRole("POST", BASE + "/insight/actions/apply-index-settings/execute"));
    }

    @Test
    public void 集群级动作的页集含集群设置_避免口径倒挂() {
        /* cluster-settings 写键本就能执行任意 reroute / 改集群设置；若做不了更窄的
           retry-failed 或集群级 ILM 开关，就是「权限更大的人反而被拦」的口径倒挂。 */
        List<String> retry = ConsoleAuthInterceptor.sharedWritePages(BASE + "/cluster/reroute/retry-failed");
        assertNotNull(retry);
        assertTrue(retry.contains("diag"));
        assertTrue(retry.contains("cluster-settings"));

        for (String p : new String[]{"start", "stop"}) {
            List<String> ilm = ConsoleAuthInterceptor.sharedWritePages(BASE + "/cluster/ilm/" + p);
            assertNotNull("ilm/" + p + " 必须登记共享写（cluster-settings 页可用）", ilm);
            assertTrue(ilm.contains("lifecycle"));
            assertTrue(ilm.contains("cluster-settings"));
        }
    }

    @Test
    public void 热Setting两入口同一页集() {
        List<String> pages = ConsoleAuthInterceptor.sharedWritePages(BASE + "/cluster/update-settings");
        assertNotNull("update-settings 必须登记共享写（否则 index-settings 页写键被 403）", pages);
        assertTrue(pages.contains("mapping"));
        assertTrue(pages.contains("index-settings"));
        assertTrue(pages.contains("indices"));
        assertTrue(pages.contains("optimizer"));
        /* 两条入口共享全部热更页（mapping 是 update-settings 的合法归属页，不必反向出现） */
        List<String> other = ConsoleAuthInterceptor.sharedWritePages(BASE + "/cluster/index-settings/update");
        assertNotNull(other);
        assertTrue(new java.util.HashSet<>(pages).containsAll(other));
        /* 段边界：update-settings-extra 不得命中共享写 */
        assertNull(ConsoleAuthInterceptor.sharedWritePages(BASE + "/cluster/update-settings-extra"));
    }
}
