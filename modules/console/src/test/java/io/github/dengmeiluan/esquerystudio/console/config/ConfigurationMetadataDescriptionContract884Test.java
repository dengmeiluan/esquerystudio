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

package io.github.dengmeiluan.esquerystudio.console.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * spring-configuration-metadata 全键 description 契约（README「IDE 提示」声称面守卫）。
 *
 * <p>README 构建一节声称：全部配置项带 IDE 提示（{@code spring-boot-configuration-processor}
 * 元数据随 jar 分发）。该元数据的 description 取自字段 javadoc——字段裸声明、或说明写进
 * {@code /*}（非 javadoc）注释块时提取静默丢失，IDE 提示即空。本契约锁：
 * {@code esquerystudio.elasticsearch.*} 全键 description 非空白，声称与元数据恒一致。</p>
 */
public class ConfigurationMetadataDescriptionContract884Test {

    @Test
    @SuppressWarnings("unchecked")
    public void allEsRebuildKeysCarryDescription() throws Exception {
        InputStream in = getClass().getResourceAsStream("/META-INF/spring-configuration-metadata.json");
        assertNotNull("classpath 缺 spring-configuration-metadata.json（annotation processor 未生效）", in);
        Map<String, Object> meta = new ObjectMapper().readValue(in, Map.class);
        List<Map<String, Object>> props = (List<Map<String, Object>>) meta.get("properties");
        assertNotNull(props);
        List<String> missing = new ArrayList<>();
        for (Map<String, Object> p : props) {
            String name = String.valueOf(p.get("name"));
            if (!name.startsWith("esquerystudio.elasticsearch.")) {
                continue;
            }
            Object d = p.get("description");
            if (d == null || String.valueOf(d).trim().isEmpty()) {
                missing.add(name);
            }
        }
        assertTrue("以下配置键缺 IDE 提示（元数据 description 为空）: " + missing, missing.isEmpty());
    }
}
