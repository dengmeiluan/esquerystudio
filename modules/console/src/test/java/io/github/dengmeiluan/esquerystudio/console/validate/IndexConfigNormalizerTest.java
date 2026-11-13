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
        // uuid 等 flat 键保留（清理是 cleanedSettingsJson 的职责，归一化只管形态）
        assertEquals("AA2dO9yQQy6ODPKku1IZlA", idx.get("uuid").asText());
        assertTrue("剥壳动作应出标注", r.notes.stream().anyMatch(n -> n.contains("sentiment_news_published")));
        assertTrue("归组动作应出标注", r.notes.stream().anyMatch(n -> n.contains("analysis")));
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
            // uuid/version 等系统键的 UNKNOWN_SETTING_KEY 是 linter 既有语义（只读键本就不可复制），
            // 本批只保证「壳键与 analyzer 引用误报」消失
            if ("UNKNOWN_SETTING_KEY".equals(i.getCode())) {
                assertTrue("不应再报壳键 UNKNOWN_SETTING_KEY: " + i.getMessage(),
                        !i.getMessage().contains("sentiment_news_published"));
            }
        }
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
