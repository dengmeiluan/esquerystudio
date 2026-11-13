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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@code profile} 必须进 DSL body，绝不能进 URL 查询参数。
 *
 * <p><b>这是一个从未能工作过的功能</b>。「Profile 火焰图」页面走
 * {@code api.searchDsl(..., {profile:true})} → {@code EsIndexAdmin.searchDsl}，
 * 而后者原先把 {@code profile=true} 拼进了 URL。已对 ES 7.10.1 实测：
 *
 * <pre>
 * POST /idx/_search?profile=true        → illegal_argument_exception:
 *                                          contains unrecognized parameter: [profile]
 * POST /idx/_search  {"profile":true}   → 正常返回 profile.shards（5 个分片）
 * </pre>
 *
 * 也就是说该页面 100% 报错，用户截图里的「参数不合法」正是这句。
 * 注意 {@code explain} 恰好相反 —— 实测 {@code _search?explain=true} <b>合法</b>，
 * 所以它留在 URL 里是对的，本测试不许把它一起改掉。
 */
public class ProfileFlagTest {

    private static final ObjectMapper M = new ObjectMapper();

    /**
     * 空 DSL 是原字符串拼接实现的致命输入。
     *
     * <p>原实现 {@code body.substring(0, body.lastIndexOf('}')) + ",\"profile\":true}"}
     * 对 {@code "{}"} 会算出 {@code substring(0,1)="{"}，拼出 <b>{@code {,"profile":true}}</b>
     * —— 非法 JSON。这条把「输出必须能被解析」钉死，而不只是看它含不含某个子串。
     */
    @Test
    public void emptyDslProducesValidJsonNotBrokenBrace() throws Exception {
        for (String input : new String[]{"{}", "", "   ", null}) {
            String out = EsIndexAdmin.withProfileFlag(input);

            JsonNode node = M.readTree(out);   // 非法 JSON 会在这里抛，是本条的主判据
            assertThat(node.isObject())
                    .as("输入 [" + input + "] 的产物必须是合法 JSON 对象，实际: " + out)
                    .isTrue();
            assertThat(node.get("profile").asBoolean())
                    .as("输入 [" + input + "] 必须带上 profile=true")
                    .isTrue();
            assertThat(out)
                    .as("不得出现 {, 这种原字符串拼接留下的畸形开头")
                    .doesNotContain("{,");
        }
    }

    /** 已有 DSL 内容必须原样保留，只是多一个 profile 标记。 */
    @Test
    public void existingDslIsPreservedAndProfileAdded() throws Exception {
        String out = EsIndexAdmin.withProfileFlag("{\"query\":{\"match_all\":{}},\"size\":5}");

        JsonNode node = M.readTree(out);
        assertThat(node.get("profile").asBoolean()).isTrue();
        assertThat(node.get("size").asInt()).as("原有 size 不得被吃掉").isEqualTo(5);
        assertThat(node.at("/query/match_all").isObject()).as("原有 query 不得被吃掉").isTrue();
    }

    /** 用户已自己写了 profile:false 时，本方法的语义是「开启 profile」，须覆盖为 true。 */
    @Test
    public void explicitProfileFalseIsOverriddenToTrue() throws Exception {
        String out = EsIndexAdmin.withProfileFlag("{\"profile\":false,\"query\":{\"match_all\":{}}}");

        assertThat(M.readTree(out).get("profile").asBoolean()).isTrue();
    }

    /**
     * 非法 JSON 走本类 {@code count()} 的既有约定：抛 IllegalArgumentException，
     * 而不是把原文丢给 ES。丢给 ES 的后果是用户拿到一次「没有 profile 数据的普通搜索」，
     * 却不知道为什么 —— 静默降级比报错更糟。
     */
    @Test
    public void invalidJsonFailsFastWithReadableMessage() {
        assertThatThrownBy(() -> EsIndexAdmin.withProfileFlag("{not json"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("DSL 不是合法 JSON");
    }

    /**
     * 接线守卫：{@code searchDsl} 方法体内不许再把 profile 拼进 URL。
     *
     * <p><b>为什么必须有这条</b>：上面几条测的是 {@code withProfileFlag} 这个纯函数，
     * 它写得再对，只要 {@code searchDsl} 里那行 {@code qp.add("profile=true")} 还在，
     * 线上就依然 100% 报错，而纯函数测试全绿。本项目这个失效模式已重复出现四次。
     *
     * <p>截取范围按<b>方法闭合花括号</b>计算，不用固定字符窗口：本波另一个测试就因为
     * 固定 1400 字符窗口越过方法末尾、读到邻居方法的代码而产生了假绿。
     */
    @Test
    public void searchDslMustNotPutProfileInUrl() throws Exception {
        String src = readSource();
        String bodyOfSearchDsl = methodBody(src, "public Map<String, Object> searchDsl(");

        assertThat(bodyOfSearchDsl)
                .as("searchDsl 必须真的存在且被截取到")
                .contains("_search");
        assertThat(bodyOfSearchDsl)
                .as("profile 绝不能进 URL —— ES 会报 unrecognized parameter: [profile]")
                .doesNotContain("profile=true");
        assertThat(bodyOfSearchDsl)
                .as("profile 必须改为注入 body")
                .contains("withProfileFlag(");
        assertThat(bodyOfSearchDsl)
                .as("explain 实测是合法 URL 参数，不许被一起改掉")
                .contains("explain=true");
    }

    private static String readSource() throws Exception {
        File f = new File("src/main/java/io/github/dengmeiluan/esquerystudio/console/core/EsIndexAdmin.java");
        assertThat(f).as("源码文件须存在（测试须在模块根目录下运行）").exists();
        return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
    }

    /** 从方法签名处按花括号配平截出方法体，避免固定字符窗口越界读到邻居方法。 */
    private static String methodBody(String src, String signature) {
        int start = src.indexOf(signature);
        assertThat(start).as("未找到方法签名: " + signature).isGreaterThanOrEqualTo(0);
        int open = src.indexOf('{', start);
        int depth = 0;
        for (int i = open; i < src.length(); i++) {
            char c = src.charAt(i);
            if (c == '{') { depth++; }
            else if (c == '}') {
                depth--;
                if (depth == 0) { return src.substring(open, i + 1); }
            }
        }
        throw new AssertionError("方法体花括号未配平: " + signature);
    }
}
