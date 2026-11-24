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

package io.github.dengmeiluan.esquerystudio.console.validate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 第 ：索引配置形态归一化单测——实报 payload 形态固化。
 *
 * <p>实报链路：Mapping 页「发送到托管重建」→ validate 全是误报
 * （UNKNOWN_SETTING_KEY×1 + TYPE_NAME_WRAPPER ERROR + ANALYZER_UNDEFINED×12，dry-run 被挡）。
 * 根因 = inspect 返回的 settings/mappings 段保留索引名壳 + HLRC Settings keySet 天然 flat。
 * 归一化器必须把「ES 原样响应形态」无损还原为建索引标准形态。</p>
 */
public class IndexConfigNormalizerTest {

    private static final ObjectMapper M = new ObjectMapper();

    /** 实报 settings 形态：索引名壳 + flat 平铺键 + 数组字符串 */
    private static final String FLAT_SHELLED_SETTINGS = "{\n"
            + "  \"sentiment_news_published\": {\n"
            + "    \"index.analysis.analyzer.my_hanlp_index_analyzer.char_filter\": \"[my_html_strip, my_char_filter]\",\n"
            + "    \"index.analysis.analyzer.my_hanlp_index_analyzer.filter\": \"[my_synonym, lowercase]\",\n"
            + "    \"index.analysis.analyzer.my_hanlp_index_analyzer.tokenizer\": \"hanlp_index\",\n"
            + "    \"index.analysis.analyzer.my_keyword_analyzer.tokenizer\": \"keyword\",\n"
            + "    \"index.analysis.char_filter.my_char_filter.pattern\": \"[^\\\\u4e00-\\\\u9fa5_a-zA-Z0-9]\",\n"
            + "    \"index.analysis.char_filter.my_char_filter.type\": \"pattern_replace\",\n"
            + "    \"index.analysis.filter.my_synonym.type\": \"synonym_graph\",\n"
            + "    \"index.analysis.tokenizer.my_wildcard_tokenizer.type\": \"ngram\",\n"
            + "    \"index.number_of_shards\": \"5\",\n"
            + "    \"index.number_of_replicas\": \"1\",\n"
            + "    \"index.uuid\": \"AA2dO9yQQy6ODPKku1IZlA\",\n"
            + "    \"index.version.created\": \"7100099\"\n"
            + "  }\n"
            + "}";

    @Test
    public void stripsIndexShellAndRegroupsFlatAnalysis() throws Exception {
        IndexConfigNormalizer.Result r = IndexConfigNormalizer.normalize(FLAT_SHELLED_SETTINGS, null);
        assertNotNull(r.settingsJson);
        JsonNode root = M.readTree(r.settingsJson);
        JsonNode idx = root.get("index");
        assertNotNull("应产出 {index:{...}} 标准形态", idx);
        assertEquals("5", idx.get("number_of_shards").asText());

        JsonNode analysis = idx.get("analysis");
        assertNotNull("analysis 平铺键应归组成嵌套对象", analysis);
        JsonNode hanlp = analysis.at("/analyzer/my_hanlp_index_analyzer");
        assertFalse(hanlp.isMissingNode());
        assertEquals("hanlp_index", hanlp.get("tokenizer").asText());
        assertEquals(2, hanlp.get("filter").size());
        assertEquals("my_synonym", hanlp.get("filter").get(0).asText());
        assertEquals("ngram", analysis.at("/tokenizer/my_wildcard_tokenizer/type").asText());
        assertEquals("pattern_replace", analysis.at("/char_filter/my_char_filter/type").asText());
        // GET 响应系统键（uuid/version.created 等）随归一剥离——手动粘贴路径与自动取源
        // 路径（cleanedSettingsJson）行为对齐；原样落建索引会被部分集群拒（unknown setting）
        assertTrue("uuid 应被剥离", idx.get("uuid") == null || idx.get("uuid").isMissingNode());
        assertTrue("version.created 应被剥离", idx.get("version") == null || idx.get("version").isMissingNode());
        assertTrue("剥壳动作应出标注", r.notes.stream().anyMatch(n -> n.contains("sentiment_news_published")));
        assertTrue("归组动作应出标注", r.notes.stream().anyMatch(n -> n.contains("analysis")));
        assertTrue("系统键剥离动作应出标注", r.notes.stream().anyMatch(n -> n.contains("uuid")));
    }

    @Test
    public void standardFormPassesThroughUntouched() {
        String std = "{\"index\":{\"number_of_shards\":\"5\",\"analysis\":{\"analyzer\":{\"a\":{\"tokenizer\":\"keyword\"}}}}}";
        IndexConfigNormalizer.Result r = IndexConfigNormalizer.normalize(std, null);
        assertEquals("标准形态原样返回（避免无谓重写）", std, r.settingsJson);
        assertTrue(r.notes.isEmpty());
    }

    @Test
    public void settingsWrapperShellStripped() throws Exception {
        // GET /{idx}/_settings 完整形态：{idx:{settings:{index:{...}}}}
        String json = "{\"sentiment_news_published\":{\"settings\":{\"index\":{\"number_of_shards\":\"5\"}}}}";
        IndexConfigNormalizer.Result r = IndexConfigNormalizer.normalize(json, null);
        JsonNode idx = M.readTree(r.settingsJson).get("index");
        assertEquals("5", idx.get("number_of_shards").asText());
    }

    @Test
    public void linterSeesDefinitionsAfterNormalize() {
        // 端到端：同一份带壳 flat settings，归一化后 linter 应登记 analyzer 定义——
        // mapping 引用 my_keyword_analyzer 不再报 ANALYZER_UNDEFINED
        String mapping = "{\"sentiment_news_published\":{\"properties\":{\"title\":{\"type\":\"text\",\"analyzer\":\"my_hanlp_index_analyzer\"}}}}";
        IndexConfigNormalizer.Result nr = IndexConfigNormalizer.normalize(FLAT_SHELLED_SETTINGS, mapping);
        IndexConfigLinter linter = new IndexConfigLinter();
        java.util.List<ConfigIssue> issues = linter.lint(nr.settingsJson, nr.mappingJson);
        for (ConfigIssue i : issues) {
            assertFalse("不应再有 ANALYZER_UNDEFINED（定义已在 analysis 树中）: " + i.getMessage(),
                    "ANALYZER_UNDEFINED".equals(i.getCode()));
            assertFalse("系统键已随归一剥离，不应再报 uuid/version 的 UNKNOWN_SETTING_KEY: " + i.getMessage(),
                    "UNKNOWN_SETTING_KEY".equals(i.getCode()));
        }
    }

    @Test
    public void getOnlySystemKeysAndNullsStripped() throws Exception {
        // 跨集群结构拷贝原样形态：flat 平铺 + 系统只读键 + 显式重置的 null 值键 +
        // 厂商特性键（replication.type，保留交 Dry-run 裁决）+ 拓扑绑定键（routing）
        String json = "{\n"
                + "  \"onshore-bond-basic\": {\n"
                + "    \"index.analysis.analyzer.my_analyzer.tokenizer\": \"my_wildcard_tokenizer\",\n"
                + "    \"index.analysis.tokenizer.my_wildcard_tokenizer.type\": \"ngram\",\n"
                + "    \"index.creation_date\": \"1780575334821\",\n"
                + "    \"index.uuid\": \"dIcA5AL9RQ2UUJ728yBqDw\",\n"
                + "    \"index.provided_name\": \"onshore-bond-basic_v20260604\",\n"
                + "    \"index.version.created\": \"7100099\",\n"
                + "    \"index.replication.type\": \"segment\",\n"
                + "    \"index.routing.allocation.include._tier_preference\": \"data_content\",\n"
                + "    \"index.refresh_interval\": null,\n"
                + "    \"index.merge.policy.max_merged_segment\": null,\n"
                + "    \"index.number_of_shards\": \"5\"\n"
                + "  }\n"
                + "}";
        IndexConfigNormalizer.Result r = IndexConfigNormalizer.normalize(json, null);
        JsonNode idx = M.readTree(r.settingsJson).get("index");
        assertTrue("creation_date 应被剥离", !idx.has("creation_date"));
        assertTrue("uuid 应被剥离", !idx.has("uuid"));
        assertTrue("provided_name 应被剥离", !idx.has("provided_name"));
        assertTrue("version 应被剥离", !idx.has("version"));
        assertTrue("routing（含 _tier_preference 拓扑绑定）应被剥离", !idx.has("routing"));
        assertTrue("null 值键 refresh_interval 应被剥离", !idx.has("refresh_interval"));
        assertTrue("null 值键 merge.policy.max_merged_segment 应被剥离", !idx.has("merge"));
        assertTrue("replication.type 是厂商真实配置，保留交 Dry-run 裁决（非 analysis 前缀保持平铺键形态）",
                idx.has("replication.type") && "segment".equals(idx.get("replication.type").asText()));
        assertEquals("number_of_shards 保留", "5", idx.get("number_of_shards").asText());
        assertEquals("tokenizer 值必须原样保留（防掩埋污染回归）", "my_wildcard_tokenizer",
                idx.path("analysis").path("analyzer").path("my_analyzer").path("tokenizer").asText());
        assertTrue("剥离动作应出标注",
                r.notes.stream().anyMatch(n -> n.contains("creation_date") && n.contains("uuid")));
    }

    @Test
    public void standardFormWithSystemKeysAlsoStripped() throws Exception {
        // 标准 {index:{...}} 形态但携带系统键：短路返回分支不得漏剥
        String json = "{\"index\":{\"number_of_shards\":\"5\",\"uuid\":\"u-1\",\"creation_date\":\"123\"}}";
        IndexConfigNormalizer.Result r = IndexConfigNormalizer.normalize(json, null);
        JsonNode idx = M.readTree(r.settingsJson).get("index");
        assertEquals("5", idx.get("number_of_shards").asText());
        assertTrue("标准形态下的 uuid 同样剥离", !idx.has("uuid"));
        assertTrue("标准形态下的 creation_date 同样剥离", !idx.has("creation_date"));
    }

    @Test
    public void mappingIndexShellStrippedNotTypeError() throws Exception {
        // 实报 mapping 形态：索引名壳 + properties 直下——曾被误判为 6.x type 包裹 ERROR
        String mapping = "{\"sentiment_news_published\":{\"properties\":{\"title\":{\"type\":\"text\",\"analyzer\":\"standard\"}}}}";
        IndexConfigNormalizer.Result r = IndexConfigNormalizer.normalize(null, mapping);
        JsonNode root = M.readTree(r.mappingJson);
        assertTrue("剥壳后顶层应直接是 properties", root.has("properties"));
        assertTrue(r.notes.stream().anyMatch(n -> n.contains("sentiment_news_published")));

        IndexConfigLinter linter = new IndexConfigLinter();
        java.util.List<ConfigIssue> issues = linter.lint(null, r.mappingJson);
        for (ConfigIssue i : issues) {
            assertFalse("不应再报 TYPE_NAME_WRAPPER: " + i.getMessage(),
                    "TYPE_NAME_WRAPPER".equals(i.getCode()));
        }
    }

    @Test
    public void realSixxTypeWrapperStillDetected() throws Exception {
        // 真 6.x 多 type 形态：两个非结构键各带 properties——归一化不动，linter 照报
        String mapping = "{\"type_a\":{\"properties\":{\"f\":\"x\"}},\"type_b\":{\"properties\":{}}}"
                .replace("\"x\"", "{\"type\":\"keyword\"}");
        IndexConfigNormalizer.Result r = IndexConfigNormalizer.normalize(null, mapping);
        IndexConfigLinter linter = new IndexConfigLinter();
        java.util.List<ConfigIssue> issues = linter.lint(null, r.mappingJson);
        assertTrue("多 type 应保留 TYPE_NAME_WRAPPER 报错",
                issues.stream().anyMatch(i -> "TYPE_NAME_WRAPPER".equals(i.getCode())));
    }

    @Test
    public void emptyAndInvalidInputsPassThrough() {
        IndexConfigNormalizer.Result r = IndexConfigNormalizer.normalize("", null);
        assertEquals(null, r.settingsJson);
        r = IndexConfigNormalizer.normalize(null, "  ");
        assertEquals(null, r.mappingJson);
        r = IndexConfigNormalizer.normalize("not json{", null);
        assertEquals("语法错误原样交 Linter 报", "not json{", r.settingsJson);
    }
}
