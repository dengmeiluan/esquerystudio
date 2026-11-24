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

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

/**
 * 健康概览版本合并（包内静态纯函数）——raw 版本探测退役的配套契约。
 * root JSON 的 version.number 并入健康概览；空/无版本静默不动。
 */
public class EsIndexAdminMergeVersionTest {

    @Test
    public void 正常合并_root版本数字入health() throws Exception {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "green");
        EsIndexAdmin.mergeVersion(health, "{\"cluster_name\":\"x\",\"version\":{\"number\":\"7.10.1\",\"build_flavor\":\"default\"}}");
        assertEquals("7.10.1", health.get("version"));
        assertEquals("green", health.get("status"));
    }

    @Test
    public void 空串与无版本静默不动() throws Exception {
        Map<String, Object> health = new HashMap<>();
        EsIndexAdmin.mergeVersion(health, "");
        assertFalse(health.containsKey("version"));
        EsIndexAdmin.mergeVersion(health, "{\"cluster_name\":\"x\"}");
        assertFalse(health.containsKey("version"));
        EsIndexAdmin.mergeVersion(health, "{\"version\":{}}");
        assertFalse(health.containsKey("version"));
    }

    @Test
    public void null入参不动() throws Exception {
        Map<String, Object> health = new HashMap<>();
        EsIndexAdmin.mergeVersion(health, null);
        assertFalse(health.containsKey("version"));
    }
}
