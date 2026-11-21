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
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;

import java.util.Locale;
import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.regex.Pattern;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 快速开始文档与实际 SPI 零漂移守卫：
 * ①ManagedEsIndex 实际接口=entityClass()+default indexKey()（ 后 SPI 窄化为
 *   「声明受管索引」，重建走宿主 Adhoc；legacy provider 已废弃且 fail-fast 拒绝）——
 *   文档不得再教用户实现 alias()/writeIndex()/settings()/mapping() 等已退役方法；
 * ②文档 Maven 坐标版本与 pom.xml 一致（不残留旧内部版本号）；
 * ③quickstart.md 快速流程=@Document 实体声明+mapping auto-register（当前真实流程）。
 */
public class QuickstartSnippetContractTest {

    private final Path starterRoot = Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", ".")))
            .toAbsolutePath().normalize();

    private final String managedEsIndex = read(
            starterRoot.resolve("platform/src/main/java/io/github/dengmeiluan/esquerystudio/platform/spi/ManagedEsIndex.java"));
    private final String readme = read(starterRoot.resolve("README.md"));
    private final String readmeEn = read(starterRoot.resolve("README_EN.md"));
    private final String quickstart = read(starterRoot.resolve("docs/integration/quickstart.md"));
    private final String pom = read(starterRoot.resolve("pom.xml"));

    @Test
    public void managedEsIndexHasNoLegacyRebuildMethods() {
        /*  后 SPI 只剩 entityClass()+default indexKey()——重建能力已迁宿主 Adhoc。
         * 只查方法声明形态（javadoc 退役注记合法）；实体重建能力走宿主 Adhoc 托管重建。 */
        for (String dead : new String[]{
                "default String alias()", "String alias();",
                "String writeIndex(", "Settings settings()",
                "XContentBuilder mapping(", "void fullReload(", "String fullReload("}) {
            assertFalse("ManagedEsIndex 不应含已退役方法声明 " + dead,
                    managedEsIndex.contains(dead));
        }
        assertTrue("ManagedEsIndex 应以 entityClass 为唯一抽象方法",
                managedEsIndex.contains("Class<?> entityClass()"));
    }

    @Test
    public void quickstartDoesNotTeachLegacyProvider() {
        /* legacy provider 通道已废弃：扫描器发现残留实现 fail-fast 拒绝启动 */
        assertFalse("quickstart 不应教用户实现 ManagedEsIndex（legacy provider 已废弃）",
                quickstart.contains("implements ManagedEsIndex"));
        assertTrue("quickstart 应明示手写 ManagedEsIndex 不可用",
                quickstart.contains("ManagedEsIndex") && quickstart.contains("废弃"));
    }

    @Test
    public void quickstartTeachesDocumentEntityAndAutoRegister() {
        assertTrue("quickstart 应含 @Document 实体声明",
                quickstart.contains("@Document"));
        assertTrue("quickstart 应含 mapping auto-register 配置",
                quickstart.contains("esquerystudio.elasticsearch.mapping.auto-register"));
        assertTrue("quickstart 应指向 desired-state 页",
                quickstart.contains("desired-state"));
    }

    @Test
    public void quickstartVersionMatchesPom() {
        String pomVersion = extractFirstVersion(pom);
        assertTrue("pom 应为 semver 三段（不含 .RELEASE 后缀），实际=" + pomVersion,
                pomVersion.matches("\\d+\\.\\d+\\.\\d+"));
        assertFalse("quickstart 不应残留旧内部版本号",
                quickstart.contains("2.6.5.RELEASE") || quickstart.contains("2.9."));
        assertTrue("quickstart 应引用当前版本 " + pomVersion,
                quickstart.contains(pomVersion));
    }

    @Test
    public void readmeQuickStartDoesNotTeachLegacySpi() {
        assertFalse("README 快速开始不应教实现 ManagedEsIndex（legacy 已废弃）",
                readme.contains("implements ManagedEsIndex"));
        assertFalse(readmeEn.contains("implements ManagedEsIndex"));
    }

    @Test
    public void readmeQuickStartTeachesAutoRegisterFlow() {
        assertTrue("README 应含 mapping auto-register 流程",
                readme.contains("esquerystudio.elasticsearch.mapping.auto-register") || readme.contains("desired-state"));
        assertTrue(readmeEn.contains("desired-state") || readmeEn.contains("auto-register")
                || readmeEn.toLowerCase(Locale.ROOT).contains("auto-register"));
    }

    private static String extractFirstVersion(String pom) {
        java.util.regex.Matcher m = Pattern.compile(
                "<version>([^<]+)</version>").matcher(
                pom.substring(pom.indexOf("<artifactId>esquerystudio</artifactId>")));
        return m.find() ? m.group(1) : "";
    }

    private static String read(Path path) {
        try {
            return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new AssertionError("无法读取 " + path, e);
        }
    }
}
