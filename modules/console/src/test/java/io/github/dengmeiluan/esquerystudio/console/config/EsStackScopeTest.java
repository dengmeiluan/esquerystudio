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

import org.junit.Test;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import static org.junit.Assert.assertTrue;

/**
 * ES 栈必须是 {@code provided} —— starter 不向宿主传递自己的 ES 版本。
 *
 * <p>为什么这条要测：改回 {@code compile} 不会有任何编译错误、任何测试变红，
 * 但「两套 ES 栈由 Maven 就近原则静默裁决」这个歧义源就回来了 ——
 * 而它导致的故障（{@code NoSuchFieldError}）只在运行时特定路径上出现
 * （台账 #96：sdes 4.4.18 配 ES 7.10.2，且炸在<b>建出目标索引之后</b>，留半拷贝）。
 * 一个改动没有任何看守时，它就会被下一个人顺手改回去。</p>
 *
 * <p>读 pom 文本而非用 Maven API：零新增依赖，且 pom 是这条契约的唯一载体。</p>
 */
public class EsStackScopeTest {

    private static String pom() throws Exception {
        /* 测试的工作目录是模块根，pom 就在旁边；找不到就是环境不对，让它红而不是跳过 */
        File f = new File("pom.xml");
        assertTrue("找不到 pom.xml（cwd=" + new File(".").getAbsolutePath() + "）", f.isFile());
        return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
    }

    /** 取某个 artifactId 所在 {@code <dependency>} 块的文本。 */
    private static String depBlock(String pom, String artifactId) {
        int at = pom.indexOf("<artifactId>" + artifactId + "</artifactId>");
        assertTrue("pom 里应有依赖 " + artifactId, at > 0);
        int start = pom.lastIndexOf("<dependency>", at);
        int end = pom.indexOf("</dependency>", at);
        assertTrue("依赖块边界异常: " + artifactId, start > 0 && end > start);
        return pom.substring(start, end);
    }

    @Test
    public void sdesStarterIsProvided() throws Exception {
        String block = depBlock(pom(), "spring-boot-starter-data-elasticsearch");
        assertTrue("spring-boot-starter-data-elasticsearch 必须是 provided —— "
                        + "starter 不该向宿主传递自己的 sdes 版本。实际块: " + block,
                block.contains("<scope>provided</scope>"));
    }

    @Test
    public void rhlcIsProvided() throws Exception {
        String block = depBlock(pom(), "elasticsearch-rest-high-level-client");
        assertTrue("elasticsearch-rest-high-level-client 必须是 provided。实际块: " + block,
                block.contains("<scope>provided</scope>"));
    }
}
