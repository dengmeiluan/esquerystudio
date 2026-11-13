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

package io.github.dengmeiluan.esquerystudio.console.docs;

import java.util.Locale;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public class IntegrationDocsContractTest {

    private static final List<String> TOPICS = Arrays.asList(
            "quickstart.md",
            "configuration-reference.md",
            "troubleshooting.md",
            "mapping-auto-register.md",
            "entity-mapping.md",
            "desired-state.md",
            "mapping-conflict-to-adhoc.md"
    );

    private static final List<String> REQUIRED_ENTRYPOINT_TERMS = Arrays.asList(
            "/internal/es/index/desired-state.html",
            "esquerystudio.elasticsearch.mapping.auto-register",
            "MappingReconcile",
            "conflict-policy",
            "USE_ADHOC_REBUILD"
    );

    private static final List<String> REQUIRED_STATUSES_AND_REASONS = Arrays.asList(
            "DISABLED",
            "SKIPPED_NO_CLIENT",
            "SKIPPED_INDEX_MISSING",
            "FAILED_INDEX_MISSING",
            "NO_CHANGE",
            "UPDATED",
            "CONFLICT",
            "MAPPING_UNPARSED",
            "FAILED_CONNECTIVITY",
            "FAILED_ES",
            "RUNNER_FAILED",
            "AMBIGUOUS_CLIENT",
            "NO_MAPPING_SOURCE",
            "USE_ADHOC_REBUILD"
    );

    private static final List<String> INTERNAL_REPORT_DETAILS = Arrays.asList(
            "AUTO_REGISTER_OFF",
            "READ_FAILED",
            "INDEX_MISSING",
            "DESIRED_OR_ACTUAL_MAPPING_UNPARSED",
            "MAPPING_CONFLICT",
            "ADDITIONS_SERIALIZATION_FAILED",
            "PUT_FAILED",
            "POST_WRITE_READ_FAILED",
            "POST_WRITE_TARGET_CHANGED",
            "POST_WRITE_INDEX_MISSING",
            "POST_WRITE_VERIFICATION_FAILED",
            "AMBIGUOUS_ALIAS_TARGET"
    );

    private final Path starterRoot = Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", ".")))
            .toAbsolutePath().normalize();
    private final Path integrationRoot = starterRoot.resolve("docs/integration");

    @Test
    public void integrationIndexLinksEveryTopicAndAllTargetsExist() throws IOException {
        Path index = integrationRoot.resolve("README.md");
        assertTrue("missing integration index: " + index, Files.isRegularFile(index));
        String indexContent = read(index);

        for (String topic : TOPICS) {
            Path target = integrationRoot.resolve(topic);
            assertTrue("missing integration topic: " + target, Files.isRegularFile(target));
            assertTrue("integration index must link " + topic,
                    indexContent.contains("(" + topic + ")"));
        }
    }

    @Test
    public void searchableEntrypointsExposeMappingIntegrationTerms() throws IOException {
        List<Path> entrypoints = Arrays.asList(
                starterRoot.resolve("README.md"),
                starterRoot.resolve("docs/integration/quickstart.md"),
                starterRoot.resolve("ui/src/data/integrationGuide.ts")
        );

        for (Path entrypoint : entrypoints) {
            String content = read(entrypoint);
            for (String term : REQUIRED_ENTRYPOINT_TERMS) {
                assertTrue(entrypoint + " must contain searchable term " + term,
                        content.contains(term));
            }
        }
    }

    @Test
    public void integrationDocsCoverEveryRuntimeStatusAndReason() throws IOException {
        StringBuilder allDocs = new StringBuilder();
        allDocs.append(read(integrationRoot.resolve("README.md")));
        for (String topic : TOPICS) {
            allDocs.append('\n').append(read(integrationRoot.resolve(topic)));
        }

        for (String statusOrReason : REQUIRED_STATUSES_AND_REASONS) {
            assertTrue("integration docs must cover " + statusOrReason,
                    allDocs.toString().contains(statusOrReason));
        }
    }

    @Test
    public void configurationReferenceShowsJavaDefaults() throws IOException {
        String reference = read(integrationRoot.resolve("configuration-reference.md"));
        ESQueryStudioElasticsearchProperties.Mapping defaults = new ESQueryStudioElasticsearchProperties().getMapping();

        assertMarkdownTableDefault(reference, "esquerystudio.elasticsearch.mapping.auto-register",
                defaults.getAutoRegister());
        assertMarkdownTableDefault(reference, "esquerystudio.elasticsearch.mapping.conflict-policy",
                defaults.getConflictPolicy());
        assertMarkdownTableDefault(reference, "esquerystudio.elasticsearch.mapping.missing-index-policy",
                defaults.getMissingIndexPolicy());
    }

    @Test
    public void configurationDefaultComparisonRejectsWrongTableValues() {
        ESQueryStudioElasticsearchProperties.Mapping defaults = new ESQueryStudioElasticsearchProperties().getMapping();
        String mutatedTable = "| 配置键 | Java 默认值 | 允许值 | 行为 |\n"
                + "|---|---|---|---|\n"
                + "| `esquerystudio.elasticsearch.mapping.auto-register` | `off` | `startup`, `off` | wrong |\n"
                + "| `esquerystudio.elasticsearch.mapping.conflict-policy` | `warn` | `fail`, `warn` | wrong |\n"
                + "| `esquerystudio.elasticsearch.mapping.missing-index-policy` | `fail` | `skip`, `fail` | wrong |\n";

        assertThrows(AssertionError.class, () -> assertMarkdownTableDefault(
                mutatedTable, "esquerystudio.elasticsearch.mapping.auto-register", defaults.getAutoRegister()));
        assertThrows(AssertionError.class, () -> assertMarkdownTableDefault(
                mutatedTable, "esquerystudio.elasticsearch.mapping.conflict-policy", defaults.getConflictPolicy()));
        assertThrows(AssertionError.class, () -> assertMarkdownTableDefault(
                mutatedTable, "esquerystudio.elasticsearch.mapping.missing-index-policy", defaults.getMissingIndexPolicy()));
    }

    @Test
    public void adhocPagesRejectGlobalTargetSelectorUntilTargetRoutingIsDelivered() throws IOException {
        List<String> safetyPages = Arrays.asList(
                "desired-state.md",
                "mapping-conflict-to-adhoc.md"
        );

        for (String page : safetyPages) {
            String content = read(integrationRoot.resolve(page));
            for (String term : Arrays.asList(
                    "X-Es-Target",
                    "Adhoc",
                    "不控制",
                    "尚未交付",
                    "Adhoc 专属目标选择器",
                    "执行预览",
                    "后端目标路由与确认")) {
                assertTrue(page + " must contain target safety term " + term,
                        content.contains(term));
            }
        }
    }

    @Test
    public void multiInstanceAndConflictExamplesMatchRuntimePaths() throws IOException {
        String autoRegister = read(integrationRoot.resolve("mapping-auto-register.md"));
        assertTrue(autoRegister.contains("只有初始读取已经看到 additions 存在"));
        assertTrue(autoRegister.contains("两个实例都可能返回 `UPDATED`"));

        String conflict = read(integrationRoot.resolve("mapping-conflict-to-adhoc.md"));
        for (String path : Arrays.asList(
                "path=properties.legs actual=object desired=nested",
                "path=properties.description actual=text desired=keyword",
                "path=properties.tradeTime actual=long desired=date")) {
            assertTrue("conflict example must contain " + path, conflict.contains(path));
        }
        assertFalse(conflict.contains("path=properties.legs.type"));
        assertFalse(conflict.contains("path=properties.description.type"));
        assertFalse(conflict.contains("path=properties.tradeTime.type"));
    }

    @Test
    public void mappingDocsRequireUniqueAliasTargetAndPinnedPhysicalWrite() throws IOException {
        String autoRegister = read(integrationRoot.resolve("mapping-auto-register.md"));
        for (String required : Arrays.asList(
                "唯一物理索引",
                "固定到该物理索引",
                "POST_WRITE_TARGET_CHANGED")) {
            assertTrue("mapping-auto-register.md must contain " + required,
                    autoRegister.contains(required));
        }

        String troubleshooting = read(integrationRoot.resolve("troubleshooting.md"));
        for (String required : Arrays.asList(
                "多目标别名",
                "AMBIGUOUS_ALIAS_TARGET",
                "POST_WRITE_TARGET_CHANGED",
                "初始解析为多目标别名",
                "写后复读得到多目标别名")) {
            assertTrue("troubleshooting.md must contain " + required,
                    troubleshooting.contains(required));
        }
    }

    @Test
    public void troubleshootingTeachesHostRunnerSetupRequiredTolerance() throws IOException {
        String troubleshooting = read(integrationRoot.resolve("troubleshooting.md"));

        // 宿主启动期 Runner 消费控制面 API 的容错课:未绑定属新环境常态,
        // 直接调用无容错=应用启动失败死锁(Setup 须经 console 完成)
        for (String required : Arrays.asList(
                "SetupRequiredException",
                "Setup 首连",
                "ApplicationRunner",
                "降级",
                "死锁")) {
            assertTrue("troubleshooting.md must contain " + required,
                    troubleshooting.contains(required));
        }
    }

    @Test
    public void dynamicTemplatesAreDocumentedAsManualOnly() throws IOException {
        String autoRegister = read(integrationRoot.resolve("mapping-auto-register.md"));

        for (String required : Arrays.asList(
                "`dynamic_templates` 是 manual-only",
                "实际缺失",
                "内容不同",
                "DYNAMIC_TEMPLATE_CONFLICT",
                "USE_ADHOC_REBUILD",
                "conflict-policy=fail",
                "conflict-policy=warn",
                "properties")) {
            assertTrue("mapping-auto-register.md must contain " + required,
                    autoRegister.contains(required));
        }
        assertFalse(autoRegister.contains("目标缺失时补入完整 `dynamic_templates`"));
        assertFalse(autoRegister.contains("`dynamic_templates` 在实际完全缺失时可整体新增"));
    }

    @Test
    public void troubleshootingSeparatesSearchableLogsFromInternalDetails() throws IOException {
        String troubleshooting = read(integrationRoot.resolve("troubleshooting.md"));
        assertTrue(troubleshooting.contains("汇总日志可搜索字段"));
        assertTrue(troubleshooting.contains("MappingReconcileReport 内部 `detail`"));
        assertTrue(troubleshooting.contains("reason=AMBIGUOUS_ALIAS_TARGET"));
        assertTrue(troubleshooting.contains("reason=POST_WRITE_TARGET_CHANGED"));
        assertTrue(troubleshooting.contains("targets="));
        assertTrue(troubleshooting.contains("RUNNER_FAILED"));
        assertTrue(troubleshooting.contains("NO_MAPPING_SOURCE"));
        for (String detail : INTERNAL_REPORT_DETAILS) {
            assertTrue("troubleshooting must cover internal detail " + detail,
                    troubleshooting.contains(detail));
        }
    }

    @Test
    public void clientOnboardingAvoidsBroadInternalEndpoint404Claims() throws IOException {
        for (String entrypoint : Arrays.asList("README.md", "docs/integration/quickstart.md")) {
            String content = read(starterRoot.resolve(entrypoint));
            assertFalse(entrypoint + " must not claim the shared prefix is absent",
                    content.contains("/internal/es/index/*"));
            assertFalse(entrypoint + " must not claim all console endpoints are absent",
                    content.contains("控制台端点全 404"));
            assertTrue(content.contains("InternalEsIndexRebuildController"));
            assertTrue(content.contains("/internal/es/index/keys"));
            assertTrue(content.contains("/internal/es/index/desired-state.html"));
        }
    }

    @Test
    public void entityMappingExplainsUnannotatedCollectionPhases() throws IOException {
        String entityMapping = read(integrationRoot.resolve("entity-mapping.md"));
        assertTrue(entityMapping.contains("MappingBuilder"));
        assertTrue(entityMapping.contains("不会推导出 `object`"));
        assertTrue(entityMapping.contains("Elasticsearch dynamic mapping"));
        assertTrue(entityMapping.contains("object -> nested"));
    }

    @Test
    public void integrationDocsHaveNoPlaceholdersAndBalancedCodeFences() throws IOException {
        List<String> docs = Arrays.asList(
                "README.md",
                "quickstart.md",
                "configuration-reference.md",
                "troubleshooting.md",
                "mapping-auto-register.md",
                "entity-mapping.md",
                "desired-state.md",
                "mapping-conflict-to-adhoc.md"
        );

        for (String doc : docs) {
            String content = read(integrationRoot.resolve(doc));
            String upper = content.toUpperCase(Locale.ROOT);
            assertFalse(doc + " contains TODO placeholder", upper.matches("(?s).*\\bTODO\\b.*"));
            assertFalse(doc + " contains TBD placeholder", upper.matches("(?s).*\\bTBD\\b.*"));
            assertFalse(doc + " contains FIXME placeholder", upper.matches("(?s).*\\bFIXME\\b.*"));
            assertFalse(doc + " contains Chinese placeholder", content.contains("待补充"));
            assertFalse(doc + " contains Chinese placeholder", content.contains("待完善"));
            assertEquals(doc + " has an unbalanced triple-backtick fence count",
                    0, countOccurrences(content, "```") % 2);
        }
    }

    private static String read(Path path) throws IOException {
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }

    private static void assertMarkdownTableDefault(String markdown,
                                                   String exactKey,
                                                   String expectedDefault) {
        String actualDefault = null;
        int matchingRows = 0;
        for (String line : markdown.split("\\R")) {
            List<String> cells = splitMarkdownTableRow(line);
            if (cells.size() >= 2 && exactKey.equals(normalizeTableCell(cells.get(0)))) {
                matchingRows++;
                actualDefault = normalizeTableCell(cells.get(1));
            }
        }
        assertEquals("expected exactly one Markdown table row for " + exactKey,
                1, matchingRows);
        assertEquals("wrong documented Java default for " + exactKey,
                expectedDefault, actualDefault);
    }

    private static List<String> splitMarkdownTableRow(String line) {
        String trimmed = line.trim();
        if (trimmed.indexOf('|') < 0) {
            return new ArrayList<String>();
        }
        List<String> cells = new ArrayList<String>();
        StringBuilder cell = new StringBuilder();
        for (int i = 0; i < trimmed.length(); i++) {
            char current = trimmed.charAt(i);
            if (current == '\\' && i + 1 < trimmed.length()
                    && trimmed.charAt(i + 1) == '|') {
                cell.append('|');
                i++;
            } else if (current == '|') {
                cells.add(cell.toString());
                cell.setLength(0);
            } else {
                cell.append(current);
            }
        }
        cells.add(cell.toString());
        if (!cells.isEmpty() && cells.get(0).trim().isEmpty()) {
            cells.remove(0);
        }
        if (!cells.isEmpty() && cells.get(cells.size() - 1).trim().isEmpty()) {
            cells.remove(cells.size() - 1);
        }
        return cells;
    }

    private static String normalizeTableCell(String cell) {
        String normalized = cell.trim();
        if (normalized.length() >= 2 && normalized.charAt(0) == '`'
                && normalized.charAt(normalized.length() - 1) == '`') {
            normalized = normalized.substring(1, normalized.length() - 1).trim();
        }
        return normalized;
    }

    private static int countOccurrences(String text, String needle) {
        int count = 0;
        int offset = 0;
        while ((offset = text.indexOf(needle, offset)) >= 0) {
            count++;
            offset += needle.length();
        }
        return count;
    }
}
