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
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 配置门禁「可执行修复动作」单测——issue 的 fix 字段（识别后确认一键移除）。
 *
 * <p>本批只覆盖 REMOVE_SETTING：UNKNOWN_SETTING_KEY（L1）与 dry-run 的
 * {@code unknown setting [index.xxx]}（L2）两个产生点。fix 是机器可执行契约，
 * 前端据此渲染「一键移除」按钮，确认门后改写审编框 settings。</p>
 */
public class IndexConfigLinterFixTest {

    @Test
    public void unknownSettingKeyCarriesRemoveFix() {
        IndexConfigLinter linter = new IndexConfigLinter();
        String settings = "{\"index\":{\"number_of_shards\":\"5\",\"replication.type\":\"segment\"}}";
        List<ConfigIssue> issues = linter.lint(settings, null);
        ConfigIssue hit = null;
        for (ConfigIssue i : issues) {
            if ("UNKNOWN_SETTING_KEY".equals(i.getCode())) {
                hit = i;
            }
        }
        assertTrue("应报 UNKNOWN_SETTING_KEY", hit != null);
        Map<String, Object> m = hit.toMap();
        @SuppressWarnings("unchecked")
        Map<String, Object> fix = (Map<String, Object>) m.get("fix");
        assertTrue("fix 应存在且为 REMOVE_SETTING", fix != null && "REMOVE_SETTING".equals(fix.get("action")));
        assertEquals("key 应为剥 index. 前缀后的相对键", "replication.type", fix.get("key"));
    }

    @Test
    public void knownSettingKeyHasNoFix() {
        IndexConfigLinter linter = new IndexConfigLinter();
        String settings = "{\"index\":{\"number_of_shards\":\"5\"}}";
        for (ConfigIssue i : linter.lint(settings, null)) {
            assertNull("已知键不应携带 fix: " + i, i.toMap().get("fix"));
        }
    }

    @Test
    public void toMapOmitsFixWhenAbsent() {
        Map<String, Object> m = ConfigIssue.info(ConfigIssue.LAYER_ADVISOR, "X", "", "m", null).toMap();
        assertTrue("无 fix 时 toMap 不应含 fix 键（纯增量契约）", !m.containsKey("fix"));
    }
}
