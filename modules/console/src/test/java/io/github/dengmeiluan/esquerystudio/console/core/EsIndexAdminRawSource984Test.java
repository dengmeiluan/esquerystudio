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

import java.net.URLEncoder;

import static org.junit.Assert.fail;

/** 非 ADMIN raw/DevTools：source 参数、_msearch 复数头与模板字段不得绕过控制面守卫。 */
public class EsIndexAdminRawSource984Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private static String enc(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    private static void assertRejected(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (ControlPlaneGuardException expected) {
            // ok
        }
    }

    private static void assertAllowed(Runnable r, String why) {
        try {
            r.run();
        } catch (RuntimeException e) {
            fail("不应拒绝：" + why + "，实际=" + e.getMessage());
        }
    }

    @Test
    public void source参数不能绕过SQL控制面守卫() {
        String body = "{\"query\":\"SELECT * FROM esquerystudio_user\"}";
        assertRejected(() -> admin.guardRawGuarded("GET", "/_sql?source=" + enc(body), null),
                "source SQL 读取控制面");
    }

    @Test
    public void source参数不能绕过mget控制面守卫() {
        String body = "{\"docs\":[{\"_index\":\"esquerystudio_user\",\"_id\":\"admin\"}]}";
        assertRejected(() -> admin.guardRawGuarded("GET", "/_mget?source=" + enc(body), null),
                "source mget 读取控制面");
    }

    @Test
    public void source参数不能绕过二级索引守卫() {
        String body = "{\"query\":{\"indices\":{\"indices\":[\".securit*\"],"
                + "\"query\":{\"match_all\":{}}}}}";
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs/_search?source=" + enc(body), null),
                "source 搜索 indices 二级数据源");
    }

    @Test
    public void 重复source参数拒绝以免首末值口径分裂() {
        String clean = "{\"query\":{\"match_all\":{}}}";
        String evil = "{\"query\":\"SELECT * FROM esquerystudio_user\"}";
        assertRejected(() -> admin.guardRawGuarded("GET",
                        "/_sql?source=" + enc(evil) + "&source=" + enc(clean), null),
                "重复 source 首恶末净");
    }

    @Test
    public void source_content_type非JSON拒绝() {
        assertRejected(() -> admin.guardRawGuarded("GET",
                        "/logs/_search?source=" + enc("{\"query\":{\"match_all\":{}}}")
                                + "&source_content_type=application/yaml", null),
                "非 JSON source");
    }

    @Test
    public void msearch复数indices头不能绕过() {
        String body = "{\"indices\":\"esquerystudio_user\"}\n{\"query\":{\"match_all\":{}}}\n";
        assertRejected(() -> admin.guardRawGuarded("POST", "/_msearch", body),
                "_msearch indices 头");
    }

    @Test
    public void msearch空索引数组不能退化为全量() {
        String body = "{\"index\":[]}\n{\"query\":{\"match_all\":{}}}\n";
        assertRejected(() -> admin.guardRawGuarded("POST", "/_msearch", body),
                "_msearch 空数组");
    }

    @Test
    public void msearch内部空行导致头体错位一律拒绝() {
        String body = "{\"index\":\"logs\"}\n\n"
                + "{\"indices\":\"esquerystudio_user\"}\n{\"query\":{\"match_all\":{}}}\n";
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_msearch", body),
                "_msearch 空行错位");
    }

    @Test
    public void msearch末尾换行仍放行() {
        String body = "{\"index\":\"logs-1\"}\n{\"query\":{\"match_all\":{}}}\n";
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_msearch", body),
                "_msearch 末尾换行");
    }

    @Test
    public void msearch路径前缀形态同样检查复数头() {
        String body = "{\"indices\":\"esquerystudio_ops_audit\"}\n{\"query\":{\"match_all\":{}}}\n";
        assertRejected(() -> admin.guardRawGuarded("GET", "/logs/_msearch?source=" + enc(body), null),
                "路径前缀 _msearch source");
    }

    @Test
    public void 搜索模板inline字段同样过二级索引守卫() {
        String inline = "{\"query\":{\"terms\":{\"f\":{\"index\":\"esquerystudio_user\","
                + "\"id\":\"1\",\"path\":\"p\"}}}}";
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search/template",
                        "{\"inline\":" + quote(inline) + "}"),
                "inline 模板二级数据源");
    }

    @Test
    public void 模板参数不得出现在lookup结构键位() {
        String inline = "{\"query\":{\"terms\":{\"f\":{\"{{k}}\":\"esquerystudio_user\","
                + "\"id\":\"1\",\"path\":\"p\"}}}}";
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search/template",
                        "{\"inline\":" + quote(inline) + "}"),
                "Mustache 参数键渲染为 lookup index");
    }

    @Test
    public void 普通动态字段键模板仍放行() {
        String inline = "{\"query\":{\"match\":{\"{{field}}\":\"{{keyword}}\"}}}";
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_search/template",
                        "{\"inline\":" + quote(inline) + "}"),
                "动态字段键 match 模板");
    }

    @Test
    public void 已存模板id即使同时带source也拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search/template",
                        "{\"source\":\"{}\",\"id\":\"admin-tpl\"}"),
                "id 与 source 并存（last-field-wins）");
    }

    @Test
    public void BOM前缀的已存模板id同样拒绝() {
        assertRejected(() -> admin.guardRawGuarded("POST", "/logs/_search/template",
                        "\uFEFF{\"id\":\"admin-tpl\"}"),
                "BOM + id");
    }

    @Test
    public void 合法业务搜索正文中的控制面字样不再误杀() {
        assertAllowed(() -> admin.guardRawGuarded("POST", "/logs/_search",
                        "{\"query\":{\"match\":{\"message\":\"esquerystudio_user .security\"}}}"),
                "业务日志检索控制面字样");
    }

    @Test
    public void 合法业务source搜索仍放行() {
        String body = "{\"query\":{\"match\":{\"message\":\"esquerystudio_user\"}}}";
        assertAllowed(() -> admin.guardRawGuarded("GET", "/logs/_search?source=" + enc(body), null),
                "业务 source 搜索");
    }

    @Test
    public void 合法msearch业务索引仍放行() {
        String body = "{\"index\":\"logs-1\"}\n{\"query\":{\"match_all\":{}}}\n";
        assertAllowed(() -> admin.guardRawGuarded("POST", "/_msearch", body),
                "业务 _msearch");
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
