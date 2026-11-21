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

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.Test;
import org.junit.experimental.runners.Enclosed;
import org.junit.runner.RunWith;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 权限映射拦截器的加固回归测试族。
 *
 * <p>覆盖页面写能力归属、环境模板口径、共享端点段边界匹配、任务/连接/安装端点角色档位，
 * 以及集群级写动作识别与护栏动作写档等拦截器执法规则。</p>
 */
@RunWith(Enclosed.class)
public class PermMapHardenTest {

    /** 批次 983：页面写能力与真实 UI 动作对拍（browser 只有读面）。 */
    public static class PermMapHarden983 {

        @Test
        public void browser写键不再获得文档覆盖权() {
            for (String path : new String[]{
                    "/internal/es/index/cluster/doc",
                    "/internal/es/index/cluster/doc/update",
                    "/internal/es/index/cluster/update-document",
                    "/internal/es/index/cluster/update-partial"}) {
                List<String> pages = ConsoleAuthInterceptor.sharedWritePages(path);
                assertTrue("必须登记共享写映射：" + path, pages != null);
                assertFalse("browser 不应出现在写归属：" + path, pages.contains("browser"));
            }
        }

        @Test
        public void browser仍保留文档读面() {
            List<String> pages = ConsoleAuthInterceptor.sharedReadPages("/internal/es/index/cluster/doc");
            assertTrue(pages != null && pages.contains("browser"));
        }
    }

    /** 批次 985：权限面板/环境模板口径与拦截器执法一致。 */
    public static class PermMapHarden985 {

        @Test
        public void 共享写权限面板必须过env模板() {
            Set<String> gp = new HashSet<>(Collections.singletonList("conn:c1:w:aliases"));
            assertTrue(ConsoleAuthInterceptor.hasSharedWriteGrant("c1", gp,
                    new HashSet<>(Collections.singletonList("aliases"))));
            assertFalse(ConsoleAuthInterceptor.hasSharedWriteGrant("c1", gp,
                    new HashSet<>(Collections.singletonList("overview"))));
        }

        @Test
        public void env模板重复键先到先得与执行侧一致() {
            ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
            Map<String, Set<String>> templates = new LinkedHashMap<>();
            templates.put("prod", new LinkedHashSet<>(Arrays.asList("search", "overview")));
            templates.put("PROD", new LinkedHashSet<>(Collections.singletonList("overview")));
            props.setEnvPages(templates);
            EnvPagesResolver resolver = new EnvPagesResolver(null, props);
            Map<String, Set<String>> out = resolver.configuredTemplates();
            /* 执行侧 pagesFor 大小写不敏感取首个匹配，configuredTemplates 必须同序先到先得。 */
            assertEquals(new LinkedHashSet<>(Arrays.asList("search", "overview")), out.get("PROD"));
        }
    }

    /** 批次 986：共享端点映射按路径段边界匹配，前缀相同的新动作 id 不得继承旧页权限。 */
    public static class PermMapHarden986 {

        @Test
        public void 共享写端点不得命中同前缀的更长动作id() {
            assertNotNull(ConsoleAuthInterceptor.sharedWritePages(
                    "/internal/es/index/insight/actions/apply-index-settings/execute"));
            assertNull(ConsoleAuthInterceptor.sharedWritePages(
                    "/internal/es/index/insight/actions/apply-index-settings-extra/execute"));
        }

        @Test
        public void 共享读端点不得命中同前缀的更长端点() {
            assertNotNull(ConsoleAuthInterceptor.sharedReadPages(
                    "/internal/es/index/cluster/query?index=logs"));
            assertNull(ConsoleAuthInterceptor.sharedReadPages(
                    "/internal/es/index/cluster/query-extra?index=logs"));
        }
    }

    /** 批次 987：任务取消提档与 abort 族对齐、连接同步只读豁免、desired-state.html 按页收口。 */
    public static class PermMapHarden987 {

        private static final String BASE = "/internal/es/index";

        @Test
        public void 任务取消与重建中止同档() {
            assertEquals(ConsoleRole.REBUILD_OP,
                    ConsoleAuthInterceptor.requiredRole("POST", BASE + "/cluster/tasks/cancel?taskId=t1"));
        }

        @Test
        public void 任务观测读面维持全角色() {
            assertEquals(ConsoleRole.VIEWER,
                    ConsoleAuthInterceptor.requiredRole("GET", BASE + "/cluster/tasks"));
        }

        @Test
        public void 连接同步状态GET豁免到观测档() {
            assertEquals(ConsoleRole.VIEWER,
                    ConsoleAuthInterceptor.requiredRole("GET", BASE + "/clusters/sync"));
            assertEquals(ConsoleRole.ADMIN,
                    ConsoleAuthInterceptor.requiredRole("POST", BASE + "/clusters/sync/run"));
        }

        @Test
        public void 连接保存删除仍是管理员档() {
            assertEquals(ConsoleRole.ADMIN,
                    ConsoleAuthInterceptor.requiredRole("POST", BASE + "/clusters/save"));
            assertEquals(ConsoleRole.ADMIN,
                    ConsoleAuthInterceptor.requiredRole("POST", BASE + "/clusters/delete"));
        }

        @Test
        public void desiredStateHtml变体按页收口() {
            List<String> pages = ConsoleAuthInterceptor.sharedReadPages(BASE + "/desired-state.html");
            assertNotNull("html 变体必须登记共享读页面，不能因段边界匹配漏收口", pages);
            assertEquals(Arrays.asList("config-drift", "adhoc-rebuild", "indices", "mapping"), pages);
        }
    }

    /**
     * 批次 988：已绑定后 setup/apply|test 与 rebind 同档（控制面归属切换/凭据流转）——
     * 拦截器层即 ADMIN，不再依赖控制器 alreadyBound 兜底；未绑定 bootstrap 走 SETUP 短路
     * （早于角色门），不受提档影响。
     */
    public static class PermMapHarden988 {

        private static final String BASE = "/internal/es/index";

        @Test
        public void 已绑定后Setup应用与测试是管理员档() {
            assertEquals(ConsoleRole.ADMIN,
                    ConsoleAuthInterceptor.requiredRole("POST", BASE + "/setup/apply"));
            assertEquals(ConsoleRole.ADMIN,
                    ConsoleAuthInterceptor.requiredRole("POST", BASE + "/setup/test"));
        }

        @Test
        public void 重绑维持管理员档() {
            assertEquals(ConsoleRole.ADMIN,
                    ConsoleAuthInterceptor.requiredRole("POST", BASE + "/setup/rebind"));
        }

        @Test
        public void 只读POST清单段边界匹配() {
            /* 既有只读端点照旧命中（段精确 / 段前缀 / query 串 / 矩阵参数） */
            org.junit.Assert.assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/query"));
            org.junit.Assert.assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/sql"));
            org.junit.Assert.assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/sql/close"));
            org.junit.Assert.assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/pit/open"));
            org.junit.Assert.assertTrue(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/count?a=b"));
            /* 前缀内的新形态（counter-reset/counterX）不得被 contains 静默认成只读 */
            org.junit.Assert.assertFalse(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/counter-reset"));
            org.junit.Assert.assertFalse(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/counterX"));
            org.junit.Assert.assertFalse(ConsoleAuthInterceptor.isReadonlyPost(BASE + "/cluster/query-admin"));
        }
    }

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
    public static class PermMapHarden1002 {

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
}
