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

package io.github.dengmeiluan.esquerystudio.server;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * standalone 模块结构契约：可执行应用 jar 与库 jar 的纪律互为镜像。
 *
 * <p>库 jar（仓根）：BOOT-INF=0、ES 栈 provided、repackage skip=true；
 * 应用 jar（本模块）：repackage 生效（fat jar）、ES 栈 compile 由本模块自带、
 * starter 依赖版本与仓根版本同步（防两坐标漂移）。</p>
 */
class ServerPomContractTest {

    private static String read(Path path) throws IOException {
        return new String(Files.readAllBytes(path), "UTF-8");
    }

    private static String repoPom() throws IOException {
        return read(Paths.get(System.getProperty("esquerystudio.root", System.getProperty("user.dir")), "pom.xml"));
    }

    private static String standalonePom() throws IOException {
        return read(Paths.get(System.getProperty("esquerystudio.root", System.getProperty("user.dir")),
                "apps/server/pom.xml"));
    }

    @Test
    public void starterDependencyVersionMatchesRepoVersion() throws IOException {
        String repo = repoPom();
        String standalone = standalonePom();

        String artifact = "esquerystudio-console";
        assertTrue(standalone.contains("<artifactId>" + artifact + "</artifactId>"),
                "server pom must depend on esquerystudio-console");

        // 仓根 <version> 在 <parent> 之后第一处 project version；standalone 引用必须与其同步
        String repoVersion = projectVersion(repo);
        String expected = "<version>${project.version}</version>";
        int at = standalone.indexOf(artifact);
        assertTrue(at > 0, "esquerystudio-console dependency missing");
        String tail = standalone.substring(at);
        assertTrue(tail.contains(expected),
                "server must use reactor version ${project.version} for esquerystudio-console (root " + repoVersion + ")");
    }

    @Test
    public void executableJarDiscipline() throws IOException {
        String standalone = standalonePom();

        // 应用 jar：repackage 生效（parent 默认绑定），且绝不配 skip=true
        assertFalse(standalone.replaceAll("(?s)<!--.*?-->", "")
                        .contains("<skip>true</skip>"),
                "standalone must stay a bootable fat jar — never skip repackage");

        // ES 栈由本模块 compile 自带（starter 侧是 provided），版本走 parent BOM
        String withoutComments = standalone.replaceAll("(?s)<!--.*?-->", "");
        for (String required : Arrays.asList(
                "spring-boot-starter-web",
                "spring-boot-starter-data-elasticsearch",
                "elasticsearch-rest-high-level-client")) {
            assertTrue(withoutComments.contains(required),
                    "standalone pom must declare compile dependency " + required);
        }
    }

    private static String projectVersion(String pom) {
        // 跳过 <parent> 段，取项目自身 <version>
        int parentEnd = pom.indexOf("</parent>");
        int at = pom.indexOf("<version>", parentEnd);
        int end = pom.indexOf("</version>", at);
        return pom.substring(at + "<version>".length(), end).trim();
    }

    @Test
    public void readmeTeachesDefaultCredentialsAndFirstBootOrder() throws IOException {
        Path readme = Paths.get(System.getProperty("user.dir"), "README.md");
        String body = read(readme);

        // 首启第一公里必须文档化：默认账号+先 Setup 后登录的顺序+兜底账号失效语义
        for (String required : Arrays.asList(
                "`admin` / `esquerystudio`",
                "首次启动顺序",
                "SETUP_REQUIRED",
                "创建自己的账号")) {
            assertTrue(body.contains(required),
                    "standalone README must teach first-boot credential guidance: " + required);
        }
    }
}
