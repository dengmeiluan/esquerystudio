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
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** 批次 983：env 页面模板必须大小写归一，空模板=全拒而不是跳过收缩。 */
public class EnvPagesResolver983Test {

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
