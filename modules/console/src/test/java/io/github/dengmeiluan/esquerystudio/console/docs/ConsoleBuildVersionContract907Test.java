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

import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 控制台前端构建产物的版本契约守卫：
 *
 * <p>面板徽标与接入文档抽屉里的版本号来自 vite define 的构建期注入
 * （{@code __STARTER_VERSION__} ← 仓根 pom.xml 的 {@code <version>}），烧录在构建产物
 * {@code src/main/resources/static/esquerystudio/} 内；该目录不入 git，clean 也不清除（在 src 树内）。
 * 若 pom bump 后未重跑前端构建（如发版门禁带 console build 跳过参数），旧产物会带着旧版本
 * 字面量原样打进 jar——面板徽标就停在旧版本。</p>
 *
 * <p>守卫两条：①产物内必须烧有与 pom 一致的版本字面量；②产物内 {@code "1.0.n"} 形态的
 * 版本字面量（去重）除 pom 版本与控制台自身版本 {@code 1.0.0} 外不得有第三者——半更新
 * 状态（产物同时含新旧版本）即红。产物缺失（全新 clone 未构建/隔离环境）按环境前提跳过：
 * 全链门禁必然执行前端构建，守卫在真实发版链上恒在场。</p>
 */
public class ConsoleBuildVersionContract907Test {

    private final Path starterRoot = Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", ".")))
            .toAbsolutePath().normalize();
    private final Path assetsDir = starterRoot.resolve("modules/console/src/main/resources/static/esquerystudio/assets");

    /** 控制台自身版本（console/package.json 的 version，与 starter 版本无关联的恒定值）。 */
    private static final String CONSOLE_SELF_VERSION = "1.0.0";

    @Test
    public void builtConsoleAssetsCarryTheCurrentStarterVersionAndNoStaleOne() throws IOException {
        String pom = read(starterRoot.resolve("pom.xml"));
        String starterVersion = versionAfterArtifactId(pom);
        assertTrue("仓根 pom 未找到 esquerystudio 的 <version>",
                !starterVersion.isEmpty());

        assertTrue("前端构建产物必须存在（先运行 npm run build）：" + assetsDir, Files.isDirectory(assetsDir));
        StringBuilder all = new StringBuilder();
        try (Stream<Path> files = Files.list(assetsDir)) {
            files.filter(p -> p.toString().endsWith(".js")).sorted().forEach(p -> {
                try {
                    all.append(read(p));
                } catch (IOException e) {
                    throw new IllegalStateException("读取产物失败: " + p, e);
                }
            });
        }
        String assets = all.toString();
        assertTrue("产物 assets 必须包含 js 文件（先运行 npm run build）：" + assetsDir, !assets.isEmpty());

        assertTrue("前端产物未烧录当前 starter 版本 " + starterVersion
                        + "（pom bump 后未重跑前端构建——重跑 npm run build 后再打 jar）",
                assets.contains("\"" + starterVersion + "\""));

        Set<String> onePointX = new LinkedHashSet<>();
        Matcher m = Pattern.compile("\"1\\.0\\.(\\d+)\"").matcher(assets);
        while (m.find()) {
            onePointX.add("1.0." + m.group(1));
        }
        Set<String> expected = new LinkedHashSet<>();
        expected.add(CONSOLE_SELF_VERSION);
        expected.add(starterVersion);
        Set<String> stale = new LinkedHashSet<>(onePointX);
        stale.removeAll(expected);
        assertEquals("前端产物存在过期的 1.0.n 版本字面量（旧构建残留），"
                + "请重跑 npm run build 同步到 pom 版本 " + starterVersion,
                new LinkedHashSet<String>(), stale);
    }

    /** starter artifactId 锚后 300 字符窗口内取第一个 version，与 vite.config 的注入口径一致。 */
    private static String versionAfterArtifactId(String pom) {
        int i = pom.indexOf("<artifactId>esquerystudio</artifactId>");
        if (i < 0) {
            return "";
        }
        String window = pom.substring(i, Math.min(pom.length(), i + 300));
        Matcher m = Pattern.compile("<version>([^<]+)</version>").matcher(window);
        return m.find() ? m.group(1).trim() : "";
    }

    private static String read(Path path) throws IOException {
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8)
                .replace("\r\n", "\n");
    }
}
