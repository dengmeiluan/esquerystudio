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
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 配置参考文档全量对账守卫：反射遍历 {@link ESQueryStudioElasticsearchProperties} 属性树，
 * 断言 docs/integration/configuration-reference.md 覆盖<b>全部</b>叶键且
 * 文档默认值与 Java 实际逐键一致；反向断言文档不出现属性树之外的幽灵键。
 * 新增配置键忘写文档 → 本守卫即红（文档现在时纪律的机械化）。
 */
public class ConfigurationReferenceContractTest {

    private static final String PROPS_PKG = ESQueryStudioElasticsearchProperties.class.getName() + "$";
    private static final Pattern ROW_KEY = Pattern.compile("^\\|\\s*`(esquerystudio\\.elasticsearch[^`]*)`\\s*\\|");

    private final Path starterRoot = Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", ".")))
            .toAbsolutePath().normalize();
    private final Path reference = starterRoot.resolve("docs/integration/configuration-reference.md");

    @Test
    public void everyPropertyLeafIsDocumentedWithExactDefault() throws Exception {
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        Map<String, String> actual = new TreeMap<>();
        walk(props, "esquerystudio.elasticsearch", actual);

        String doc = read(reference);
        Map<String, String> documented = documentedRows(doc);

        List<String> problems = new ArrayList<>();
        for (Map.Entry<String, String> e : actual.entrySet()) {
            String docDefault = documented.get(e.getKey());
            if (docDefault == null) {
                problems.add("缺行: " + e.getKey());
            } else if (!docDefault.equals(e.getValue())) {
                problems.add("默认值漂移: " + e.getKey() + " 文档=" + docDefault + " 实际=" + e.getValue());
            }
        }
        assertTrue("configuration-reference.md 配置缺口/漂移 " + problems.size() + " 处：\n  "
                + String.join("\n  ", problems), problems.isEmpty());
    }

    @Test
    public void documentedKeysNeverReferencePhantomProperties() throws Exception {
        ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
        Map<String, String> actual = new TreeMap<>();
        walk(props, "esquerystudio.elasticsearch", actual);

        String doc = read(reference);
        List<String> phantoms = new ArrayList<>();
        for (String line : doc.split("\\R")) {
            Matcher m = ROW_KEY.matcher(line);
            if (m.find() && !actual.containsKey(m.group(1))) {
                phantoms.add(m.group(1));
            }
        }
        assertTrue("configuration-reference.md 出现属性树之外的幽灵键: " + phantoms, phantoms.isEmpty());
    }

    /* ── 反射遍历 ── */

    private static void walk(Object node, String prefix, Map<String, String> out) throws Exception {
        Class<?> type = node.getClass();
        while (type != null && type != Object.class) {
            for (Method m : type.getDeclaredMethods()) {
                if (java.lang.reflect.Modifier.isStatic(m.getModifiers())) continue;
                String name = m.getName();
                if (m.getParameterCount() != 0 || m.getReturnType() == void.class) continue;
                String field;
                if (name.startsWith("get") && name.length() > 3) field = decap(name.substring(3));
                else if (name.startsWith("is") && name.length() > 2) field = decap(name.substring(2));
                else continue;
                if ("class".equals(field)) continue;
                Object value = m.invoke(node);
                String key = prefix + "." + kebab(field);
                if (value != null && value.getClass().getName().startsWith(PROPS_PKG)) {
                    walk(value, key, out);
                } else {
                    out.put(key, renderDefault(value));
                }
            }
            type = type.getSuperclass();
        }
    }

    private static String decap(String s) {
        return Character.toLowerCase(s.charAt(0)) + s.substring(1);
    }

    private static String kebab(String camel) {
        return camel.replaceAll("([a-z0-9])([A-Z])", "$1-$2").toLowerCase(Locale.ROOT);
    }

    /** 默认值渲染：与文档表格第二列（去反引号后）逐字对表。 */
    private static String renderDefault(Object v) {
        if (v == null) return "（未设置）";
        if (v instanceof String) {
            String s = (String) v;
            return s.isEmpty() ? "（空串）" : s;
        }
        if (v instanceof Map) return "（空 Map）";
        if (v instanceof Boolean || v instanceof Number) return String.valueOf(v);
        return String.valueOf(v);
    }

    /** 文档表格行 → 键 → 默认值（表格第二列，去反引号）。 */
    private static Map<String, String> documentedRows(String doc) {
        Map<String, String> rows = new LinkedHashMap<>();
        for (String line : doc.split("\\R")) {
            Matcher m = ROW_KEY.matcher(line);
            if (!m.find()) continue;
            String key = m.group(1);
            String[] cells = line.split("\\|");
            String def = cells.length >= 3
                    ? cells[2].replace("`", "").trim()
                    : "";
            rows.put(key, def);
        }
        return rows;
    }

    private static String read(Path path) throws IOException {
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }
}
