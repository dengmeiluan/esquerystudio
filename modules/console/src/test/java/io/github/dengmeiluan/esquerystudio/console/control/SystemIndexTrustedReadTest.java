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

package io.github.dengmeiluan.esquerystudio.console.control;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 2.1.7：系统页「查询 DSL」闭环——锁索引是 starter 自家控制面索引，通用数据接口守卫
 * 会拒绝其名，导致 /system 页的查询恒 403、mapping/alias 恒 mappingsError。
 *
 * <p>修法：只给 {@code EsIndexRebuildService.inspectSystem/querySystem} 开放 trusted 读
 * （索引名来自装配处注入的 lockIndexName，非用户输入）；通用 query/inspect 仍走守卫。</p>
 *
 * <p>源码锚（Observability547Test 直读 src/main/java 先例）。</p>
 */
public class SystemIndexTrustedReadTest {

    private static String read(String rel) throws Exception {
        return new String(Files.readAllBytes(
                Paths.get("src/main/java/io/github/dengmeiluan/esquerystudio/console/" + rel)), StandardCharsets.UTF_8);
    }

    /** 源码窗口：从签名起取 N 字符（不做括号配对——方法体内含 JSON 字符串花括号）。 */
    private static String window(String src, String signature, int n) {
        int i = src.indexOf(signature);
        assertTrue("方法不存在：" + signature, i >= 0);
        return src.substring(i, Math.min(src.length(), i + n));
    }

    @Test
    public void serviceUsesTrustedChannelsOnlyForSystemEndpoints() throws Exception {
        String svc = read("core/EsIndexRebuildService.java");
        String inspect = window(svc, "public Map<String, Object> inspectSystem(String which)", 600);
        String query = window(svc, "public Map<String, Object> querySystem(String which, String dslJson, int size)", 600);
        assertTrue("inspectSystem 应走系统索引专用读", inspect.contains("esIndexAdmin.inspectSystemIndex(systemIndexName(which), 20)"));
        assertTrue("querySystem 应走系统索引专用查询", query.contains("esIndexAdmin.querySystemIndex(systemIndexName(which), dslJson"));
        assertFalse("inspectSystem 不得回退通用 inspectInternal", inspect.contains("inspectInternal("));
        assertFalse("querySystem 不得回退通用 queryDslInternal", query.contains("queryDslInternal("));
    }

    @Test
    public void adminTrustedMethodsPassTrustedFlag() throws Exception {
        String src = read("core/EsIndexAdmin.java");
        String inspect = window(src, "Map<String, Object> inspectSystemIndex(String exactIndexName, int sampleSize)", 300);
        String query = window(src, "Map<String, Object> querySystemIndex(String exactIndexName, String dslJson, int size)", 300);
        assertTrue(inspect.contains("inspect(exactIndexName, sampleSize, false, true)"));
        assertTrue(query.contains("queryDsl(exactIndexName, dslJson, size, false, java.util.Collections.emptyMap(), true)"));
    }

    @Test
    public void trustedFlagRoutesToUnguardedLowLevelClient() throws Exception {
        String src = read("core/EsIndexAdmin.java");
        String performJson = window(src, "private Map<String, Object> performJson(String method, String path, String body, boolean trustedControl)", 700);
        assertTrue("performJson trusted 分支应走 performUnguarded",
                performJson.contains("trustedControl ? performUnguarded(req) : performGuarded(req)"));
        String flatQuery = window(src, "java.util.Map<String, String> requestParams, boolean trustedControl)", 4000);
        assertTrue("queryDsl trusted 分支应走 performUnguarded",
                flatQuery.contains("trustedControl ? performUnguarded(req) : performGuarded(req)"));
        String plainPerform = window(src, "private Map<String, Object> performJson(String method, String path, String body)", 300);
        assertTrue("普通 performJson 必须委托 false（不允许默认开逃生门）",
                plainPerform.contains("performJson(method, path, body, false)"));
    }

    @Test
    public void genericQueryStillGuardedAndControlGuardIntact() throws Exception {
        String src = read("core/EsIndexAdmin.java");
        String generic = window(src, "public Map<String, Object> queryDsl(String indexOrAlias, String dslJson, int size)", 300);
        assertTrue("通用 queryDsl 必须保持 guard=true", generic.contains("queryDsl(indexOrAlias, dslJson, size, true)"));
        String pathGuard = window(src, "void guardControlPath(String path)", 3000);
        assertTrue("路径守卫仍把首段交给索引名守卫", pathGuard.contains("guardIndexName(lower)"));
        String nameGuard = window(src, "void guardIndexName(String name)", 2500);
        assertTrue("控制面守卫仍在（通用路径必须拒绝锁索引）",
                nameGuard.contains("if (isControlIndexName(n))") && nameGuard.contains("throw new ControlPlaneGuardException"));
    }
}
