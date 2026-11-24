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

package io.github.dengmeiluan.esquerystudio.console;

import org.junit.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * 根侧 standalone 钉版守卫：standalone 模块的项目版本与 starter 依赖钉版必须跟平
 * 仓根版本。既有 ServerPomContractTest 也锁同语义，但它住在 standalone 模块
 * 测试期——CI 的 standalone 步在依赖解析阶段就因钉版漂移失败，守卫结构性不可达
 * （漂移本身让守卫无法执行）；而根 reactor 不含 standalone 模块，漂移在根侧测试期
 * 无声通过，直到 standalone 步才炸出「Could not find artifact」。
 *
 * <p>本守卫住根 reactor：版本 bump 漏跟 standalone 时，Backend tests 一步即红，
 * 把失败面从「远端 standalone 解析」前移到「根侧测试」，漂移当场现形。
 * （1.0.55 漂移由 standalone/pom.xml 手工跟平修复过一次；1.0.56/1.0.57 两次
 * bump 复发同一漂移——磨盘收口为守卫。）</p>
 */
public class ServerPinGuard1035Test {

    private static String read(Path path) throws IOException {
        return new String(Files.readAllBytes(path), "UTF-8");
    }

    /** 跳过 &lt;parent&gt; 段取项目自身 &lt;version&gt;（两份 pom 同构） */
    private static String projectVersion(String pom) {
        int parentEnd = pom.indexOf("</parent>");
        int at = pom.indexOf("<version>", parentEnd);
        int end = pom.indexOf("</version>", at);
        return pom.substring(at + "<version>".length(), end).trim();
    }

    @Test
    public void serverAndConsolePinFollowRootVersion() throws IOException {
        Path rootPom = Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", ".")), "pom.xml");
        Path serverPom = Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", ".")),
                "apps/server/pom.xml");
        String root = read(rootPom);
        String server = read(serverPom);

        String version = projectVersion(root);
        assertTrue("ESQueryStudio 1.0 root version must stay on the 1.0.x line: " + version,
                version.matches("1\\.0\\.\\d+"));

        String artifact = "esquerystudio-console";
        int at = server.indexOf(artifact);
        assertTrue("server pom must depend on esquerystudio-console", at > 0);
        String tail = server.substring(at);
        assertTrue("server 的 console 依赖版本必须由 reactor 统一（${project.version}）",
                tail.contains("<version>${project.version}</version>"));
    }
}
