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
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 批次 985：权限面板/环境模板口径与拦截器执法一致。 */
public class PermMapHarden985Test {

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
