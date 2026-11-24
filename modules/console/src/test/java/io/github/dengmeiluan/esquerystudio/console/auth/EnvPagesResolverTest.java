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
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import java.util.Arrays;
import java.util.Collections;
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
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 环境页面模板解析器的测试族。
 *
 * <p>覆盖模板键大小写归一、空模板全拒语义、模板对静态键与连接读写键的封顶，
 * 以及未配置环境时的原样透传行为。</p>
 */
@RunWith(Enclosed.class)
public class EnvPagesResolverTest {

    /** 批次 983：env 页面模板必须大小写归一，空模板=全拒而不是跳过收缩。 */
    public static class EnvPagesResolver983 {

        private static ConnStore storeWithEnv(String env) {
            return new ConnStore() {
                @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
                @Override public RemoteClusterConn get(String id) {
                    if (!"c1".equals(id)) return null;
                    RemoteClusterConn c = new RemoteClusterConn();
                    c.setEnv(env);
                    return c;
                }
                @Override public String getName(String id) { return "c1".equals(id) ? "QA" : null; }
                @Override public String getVersion(String id) { return null; }
                @Override public Map<String, Object> save(String id, String name, String url, String username,
                        String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                    throw new UnsupportedOperationException();
                }
                @Override public void delete(String id) { }
                @Override public void updateVersion(String id, String version) { }
            };
        }

        private static EnvPagesResolver resolver(String env, Map<String, Set<String>> templates) {
            ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
            props.setEnvPages(templates);
            return new EnvPagesResolver(storeWithEnv(env), props);
        }

        @Test
        public void 环境模板空集表示全拒而不是不收缩() {
            Map<String, Set<String>> templates = new LinkedHashMap<>();
            templates.put("PROD", new LinkedHashSet<>());
            EnvPagesResolver r = resolver("prod", templates);
            Set<String> effective = r.effectivePages("c1",
                    new HashSet<>(Arrays.asList("overview", "search")));
            assertTrue("空模板必须收缩为空集，实际=" + effective, effective.isEmpty());
            assertTrue(!r.staticWriteAllowed("c1", "overview", new HashSet<>(Arrays.asList("overview"))));
        }

        @Test
        public void 环境模板键大小写不敏感() {
            Map<String, Set<String>> templates = new LinkedHashMap<>();
            templates.put("prod", new LinkedHashSet<>(Collections.singletonList("overview")));
            EnvPagesResolver r = resolver("PROD", templates);
            Set<String> effective = r.effectivePages("c1",
                    new HashSet<>(Arrays.asList("overview", "search")));
            assertEquals(new HashSet<>(Collections.singletonList("overview")), effective);
        }

        @Test
        public void 未配置该环境仍原样透传() {
            Map<String, Set<String>> templates = new LinkedHashMap<>();
            templates.put("PROD", new LinkedHashSet<>(Collections.singletonList("overview")));
            EnvPagesResolver r = resolver("qa", templates);
            assertNull(r.pagesFor("c1"));
            Set<String> effective = r.effectivePages("c1",
                    new HashSet<>(Arrays.asList("overview", "search")));
            assertEquals(new HashSet<>(Arrays.asList("overview", "search")), effective);
        }
    }

    /** 批次 984：env 页模板必须同时封顶静态键与 conn 读写键，不能被 conn 读键绕过。 */
    public static class EnvPagesResolver984 {

        private static ConnStore store(String env) {
            return new ConnStore() {
                @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
                @Override public RemoteClusterConn get(String id) {
                    if (!"c1".equals(id)) return null;
                    RemoteClusterConn c = new RemoteClusterConn();
                    c.setEnv(env);
                    return c;
                }
                @Override public String getName(String id) { return "c1".equals(id) ? "QA" : null; }
                @Override public String getVersion(String id) { return null; }
                @Override public Map<String, Object> save(String id, String name, String url, String username,
                        String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                    throw new UnsupportedOperationException();
                }
                @Override public void delete(String id) { }
                @Override public void updateVersion(String id, String version) { }
            };
        }

        private static EnvPagesResolver resolver(String env, Set<String> envPages) {
            Map<String, Set<String>> templates = new LinkedHashMap<>();
            templates.put("PROD", envPages);
            ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
            props.setEnvPages(templates);
            return new EnvPagesResolver(store(env), props);
        }

        private static Set<String> grants(String... keys) {
            return new HashSet<>(Arrays.asList(keys));
        }

        @Test
        public void 环境模板同时收缩静态键与conn读写键() {
            EnvPagesResolver r = resolver("prod",
                    new LinkedHashSet<>(Collections.singletonList("overview")));
            Set<String> gp = grants("overview", "search",
                    "conn:c1:search", "conn:c1:w:search", "conn:c1:w:overview");
            Set<String> effective = r.effectivePages("c1", gp);
            assertTrue("env 内页保留：" + effective, effective.contains("overview"));
            assertFalse("conn 读键不得把 env 外页面并回：" + effective, effective.contains("search"));
            assertFalse("conn 写键同样受 env 封顶", r.writeAllowed("c1", "search", gp));
            assertTrue("env 内 conn 写键保留", r.writeAllowed("c1", "overview", gp));
            assertFalse("静态键写权受 env 封顶", r.staticWriteAllowed("c1", "search", gp));
            assertTrue("静态键在 env 内仍可写", r.staticWriteAllowed("c1", "overview", gp));
        }

        @Test
        public void 宿主目标不受连接env模板影响() {
            EnvPagesResolver r = resolver("prod",
                    new LinkedHashSet<>(Collections.singletonList("overview")));
            Set<String> gp = grants("search");
            assertTrue("宿主无环境模板", r.staticWriteAllowed("host", "search", gp));
            assertTrue(r.effectivePages("host", gp).contains("search"));
        }

        @Test
        public void 显式空模板连conn授权也全拒() {
            EnvPagesResolver r = resolver("prod", new LinkedHashSet<>());
            Set<String> gp = grants("overview", "conn:c1:search", "conn:c1:w:search");
            assertTrue(r.effectivePages("c1", gp).isEmpty());
            assertFalse(r.writeAllowed("c1", "search", gp));
            assertFalse(r.staticWriteAllowed("c1", "overview", gp));
        }

        @Test
        public void 未配置环境模板保持原样透传() {
            EnvPagesResolver r = resolver("dev",
                    new LinkedHashSet<>(Collections.singletonList("overview")));
            Set<String> gp = grants("search", "conn:c1:w:search");
            assertTrue(r.effectivePages("c1", gp).contains("search"));
            assertTrue(r.writeAllowed("c1", "search", gp));
            assertTrue(r.staticWriteAllowed("c1", "search", gp));
        }
    }
}
