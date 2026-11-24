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

import static org.junit.Assert.assertTrue;

/**
 * 构建自举与跨平台行尾卫生守卫：
 * ①.gitattributes 在场——仓库行尾规范（text=auto 基线 + shell 脚本恒 LF +
 *   Windows 批处理恒 CRLF + 二进制构件豁免），Windows 开发机与 Linux CI 双端一致；
 * ②Maven Wrapper 三件套在场（mvnw / mvnw.cmd / .mvn/wrapper/maven-wrapper.properties）——
 *   fresh clone 无需预装 Maven 即可构建，分发 URL 钉在当前构建线同一 Maven 版本；
 * ③console 前端声明 Node 引擎下限（机器可读，防旧 Node 静默装坏依赖）；
 * ④README 双语从源码构建节指到 wrapper 无 Maven 自举路径（文档与能力零漂移）。
 */
public class BuildBootstrapContractTest {

    private final Path starterRoot = Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", ".")))
            .toAbsolutePath().normalize();

    @Test
    public void gitattributesNormalizesLineEndings() {
        String attrs = read(starterRoot.resolve(".gitattributes"));
        assertTrue(".gitattributes 应含 text=auto 基线（仓库内文本统一 LF）",
                attrs.contains("text=auto"));
        assertTrue(".gitattributes 应声明 mvnw 恒 LF（Unix shell 脚本跨平台可执行）",
                attrs.contains("mvnw") && attrs.contains("eol=lf"));
        assertTrue(".gitattributes 应声明 Windows 批处理恒 CRLF",
                attrs.contains("eol=crlf"));
        assertTrue(".gitattributes 应豁免二进制构件（jar 不做行尾处理）",
                attrs.contains("*.jar binary"));
    }

    @Test
    public void mavenWrapperBootstrapsBuildWithoutLocalMaven() {
        assertTrue("mvnw 应在场（POSIX 自举脚本）",
                Files.isRegularFile(starterRoot.resolve("mvnw")));
        assertTrue("mvnw.cmd 应在场（Windows 自举脚本）",
                Files.isRegularFile(starterRoot.resolve("mvnw.cmd")));
        String props = read(starterRoot.resolve(".mvn/wrapper/maven-wrapper.properties"));
        assertTrue("wrapper 应钉定 Maven 发行包 distributionUrl",
                props.contains("distributionUrl"));
        assertTrue("wrapper Maven 版本应与当前构建线一致（3.9.9）",
                props.contains("apache-maven-3.9.9-bin.zip"));
    }

    @Test
    public void consolePackageJsonDeclaresNodeEngine() {
        String pkg = read(starterRoot.resolve("ui/package.json"));
        assertTrue("ui/package.json 应声明 engines.node 下限",
                pkg.contains("\"engines\"") && pkg.contains("\"node\""));
        assertTrue("Node 下限应为 >=18（Vite 5 与 CI node 20 双兼容）",
                pkg.contains(">=18"));
    }

    @Test
    public void readmePointsToWrapperBootstrap() {
        assertTrue("README 从源码构建应指到 ./mvnw 无 Maven 自举路径",
                read(starterRoot.resolve("README.md")).contains("./mvnw"));
        assertTrue("README_EN build-from-source should reference ./mvnw",
                read(starterRoot.resolve("README_EN.md")).contains("./mvnw"));
    }

    private static String read(Path path) {
        try {
            return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new AssertionError("无法读取 " + path, e);
        }
    }
}
