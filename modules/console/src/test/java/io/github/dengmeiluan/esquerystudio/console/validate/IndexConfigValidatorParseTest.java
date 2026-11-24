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

import org.junit.Test;

import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * ES 异常消息解析单测——reason 含内层 {@code [key]} 括号时不得在第一个 {@code ]}
 * 处截断（unknown setting [index.creation_date] 一族），多段（caused by）仍逐段提取。
 */
public class IndexConfigValidatorParseTest {

    @Test
    public void reasonWithInnerBracketNotTruncated() {
        String msg = "Elasticsearch exception [type=illegal_argument_exception, "
                + "reason=unknown setting [index.creation_date] please check that any required plugins are installed]";
        ConfigValidationReport report = new ConfigValidationReport();
        IndexConfigValidator.parseEsError(msg, report);
        List<ConfigIssue> issues = report.getIssues();
        assertEquals(1, issues.size());
        assertEquals("ILLEGAL_ARGUMENT_EXCEPTION", issues.get(0).getCode());
        String m = issues.get(0).getMessage();
        assertTrue("reason 应含完整带括号的键名: " + m, m.contains("unknown setting [index.creation_date]"));
        assertTrue("reason 应吃到段尾而非在第一个 ] 截断: " + m, m.contains("please check"));
    }

    @Test
    public void unknownSettingReasonCarriesRemoveFix() {
        // unknown setting [index.xxx] → 机器可执行修复动作（一键移除），键名剥 index. 前缀
        String msg = "Elasticsearch exception [type=illegal_argument_exception, "
                + "reason=unknown setting [index.replication.type] please check that any required plugins are installed]";
        ConfigValidationReport report = new ConfigValidationReport();
        IndexConfigValidator.parseEsError(msg, report);
        List<ConfigIssue> issues = report.getIssues();
        assertEquals(1, issues.size());
        @SuppressWarnings("unchecked")
        Map<String, Object> fix = (Map<String, Object>) issues.get(0).toMap().get("fix");
        assertTrue("fix 应存在", fix != null);
        assertEquals("REMOVE_SETTING", fix.get("action"));
        assertEquals("replication.type", fix.get("key"));
    }

    @Test
    public void multiSegmentMessageYieldsOneIssuePerSegment() {
        String msg = "Elasticsearch exception [type=illegal_argument_exception, reason=unknown setting [index.replication.type]], "
                + "caused by Elasticsearch exception [type=settings_exception, reason=failed to load settings]";
        ConfigValidationReport report = new ConfigValidationReport();
        IndexConfigValidator.parseEsError(msg, report);
        List<ConfigIssue> issues = report.getIssues();
        assertEquals(2, issues.size());
        assertEquals("ILLEGAL_ARGUMENT_EXCEPTION", issues.get(0).getCode());
        assertTrue(issues.get(0).getMessage().contains("unknown setting [index.replication.type]"));
        assertEquals("SETTINGS_EXCEPTION", issues.get(1).getCode());
        assertTrue(issues.get(1).getMessage().contains("failed to load settings"));
    }

    @Test
    public void nonStandardMessagePassedThroughWhole() {
        String msg = "Connection refused: es-qa.internal:9200";
        ConfigValidationReport report = new ConfigValidationReport();
        IndexConfigValidator.parseEsError(msg, report);
        List<ConfigIssue> issues = report.getIssues();
        assertEquals(1, issues.size());
        assertEquals("DRYRUN_FAILED", issues.get(0).getCode());
        assertTrue(issues.get(0).getMessage().contains(msg));
    }

    @Test
    public void ngramLimitReasonCarriesAddSettingFixWithValue() {
        // ES 指路式限制错误（ngram diff 超限）：错误文本自带键名与实际差值 → 一键补充动作
        String msg = "Elasticsearch exception [type=illegal_argument_exception, "
                + "reason=The difference between max_gram and min_gram in NGram Tokenizer must be "
                + "less than or equal to: [1] but was [39]. This limit can be set by changing the "
                + "[index.max_ngram_diff] index level setting.]";
        ConfigValidationReport report = new ConfigValidationReport();
        IndexConfigValidator.parseEsError(msg, report);
        List<ConfigIssue> issues = report.getIssues();
        assertEquals(1, issues.size());
        @SuppressWarnings("unchecked")
        Map<String, Object> fix = (Map<String, Object>) issues.get(0).toMap().get("fix");
        assertTrue("fix 应存在", fix != null);
        assertEquals("ADD_SETTING", fix.get("action"));
        assertEquals("max_ngram_diff", fix.get("key"));
        assertEquals("39", fix.get("value"));
    }

    @Test
    public void limitReasonWithoutActualValueStillCarriesAddFix() {
        // 无 but was [N] 实际值时仍给补充动作（不带 value），键名剥 index. 前缀
        String msg = "Elasticsearch exception [type=illegal_argument_exception, "
                + "reason=Failed to parse value, This limit can be set by changing the [index.max_ngram_diff] "
                + "index level setting.]";
        ConfigValidationReport report = new ConfigValidationReport();
        IndexConfigValidator.parseEsError(msg, report);
        List<ConfigIssue> issues = report.getIssues();
        assertEquals(1, issues.size());
        @SuppressWarnings("unchecked")
        Map<String, Object> fix = (Map<String, Object>) issues.get(0).toMap().get("fix");
        assertTrue("fix 应存在", fix != null);
        assertEquals("ADD_SETTING", fix.get("action"));
        assertEquals("max_ngram_diff", fix.get("key"));
        assertTrue("无实际值时 fix 不带 value 键", !fix.containsKey("value"));
    }
}
