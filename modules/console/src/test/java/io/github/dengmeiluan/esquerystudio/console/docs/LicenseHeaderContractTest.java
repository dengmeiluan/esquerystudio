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
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * Apache-2.0 许可证头守卫：仓库全部 Java 源文件（主仓 src + standalone 模块）须携带
 * 标准 Apache License 2.0 声明头——源码再分发与第三方审计场景可直接机读识别许可，
 * 与 LICENSE 全文、pom 许可证声明构成三件互相印证的发行链。
 * 判据为「文件以块注释开头 + 许可证名称（含版本号）+ 许可证 URL」三锚齐备，
 * 防止守卫自身的断言字符串恰好出现在代码中部造成自满足假绿。
 */
public class LicenseHeaderContractTest {

    private static final String LICENSE_NAME_ANCHOR = "Licensed under the Apache License, Version 2.0";
    private static final String LICENSE_URL_ANCHOR = "http://www.apache.org/licenses/LICENSE-2.0";

    private final Path starterRoot = Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", ".")))
            .toAbsolutePath().normalize();

    @Test
    public void starterSourcesCarryLicenseHeader() {
        List<Path> sources = new ArrayList<>();
        collectJavaSources(starterRoot.resolve("modules/console/src"), sources);
        collectJavaSources(starterRoot.resolve("platform/src"), sources);
        collectJavaSources(starterRoot.resolve("integrations"), sources);
        assertTrue("ESQueryStudio 模块应存在 Java 源文件（扫描域自证）", sources.size() > 100);
        assertAllCarryLicenseHeader(sources);
    }

    @Test
    public void standaloneSourcesCarryLicenseHeader() {
        List<Path> sources = new ArrayList<>();
        collectJavaSources(starterRoot.resolve("apps/server/src"), sources);
        assertTrue("server 模块应存在 Java 源文件（扫描域自证）", !sources.isEmpty());
        assertAllCarryLicenseHeader(sources);
    }

    @Test
    public void licenseDistributionChainIsClosed() {
        String license = read(starterRoot.resolve("LICENSE"));
        assertTrue("LICENSE 全文应在场并含 Apache License 2.0 正文",
                license.contains("Version 2.0, January 2004"));
        String pom = read(starterRoot.resolve("pom.xml"));
        assertTrue("pom.xml 应声明 Apache-2.0 许可证（发行链与源文件头一致）",
                pom.contains("Apache License, Version 2.0"));
    }

    private void assertAllCarryLicenseHeader(List<Path> sources) {
        List<String> missing = new ArrayList<>();
        for (Path source : sources) {
            String content = read(source);
            boolean carriesHeader = content.startsWith("/*")
                    && content.contains(LICENSE_NAME_ANCHOR)
                    && content.contains(LICENSE_URL_ANCHOR);
            if (!carriesHeader) {
                missing.add(starterRoot.relativize(source).toString());
            }
        }
        if (!missing.isEmpty()) {
            int shown = Math.min(10, missing.size());
            fail("以下 " + missing.size() + " 个 Java 源文件缺 Apache-2.0 许可证头（前 " + shown + " 个）：\n"
                    + String.join("\n", missing.subList(0, shown)));
        }
    }

    private static void collectJavaSources(Path root, List<Path> sink) {
        if (!Files.isDirectory(root)) {
            return;
        }
        try (Stream<Path> stream = Files.walk(root)) {
            stream.filter(Files::isRegularFile)
                    .filter(p -> !p.toString().contains("target"))
                    .filter(p -> p.getFileName().toString().endsWith(".java"))
                    .forEach(sink::add);
        } catch (IOException e) {
            throw new AssertionError("无法遍历 " + root, e);
        }
    }

    private static String read(Path path) {
        try {
            return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new AssertionError("无法读取 " + path, e);
        }
    }
}
