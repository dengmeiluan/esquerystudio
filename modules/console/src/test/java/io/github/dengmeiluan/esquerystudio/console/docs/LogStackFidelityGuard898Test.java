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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.Assert.assertTrue;

/**
 * 跨集群迁移域的堆栈保真守卫：迁移链的告警大多是静默降级路径的<b>唯一留痕</b>——
 *
 * <ol>
 * <li><b>迁移收尾质量面</b>（{@code [CrossClusterMigrateService]} preflight/forceMerge/
 * captureSettings/refresh/waitGreen/countRemote）：预检失败仅不展示 dest 警告、forceMerge
 * 与 refresh 静默吞掉、settings 抓不到用默认值兜底还原、waitGreen 未达 green 继续走——
 * 这些降级都不阻断迁移，日志是「收尾质量缩水」的唯一证据，堆栈区分是远端不可达、
 * 权限拒绝还是映射冲突；</li>
 * <li><b>引导线程吞异常</b>（{@code [MigrateBootstrapRunner]} bootstrap failed）：异步
 * 守护线程死亡无人知晓，堆栈是定位 ensureIndex/sweepInterrupted 失败原因的唯一线索；</li>
 * <li><b>任务档案首写失败</b>（{@code [MigrateJobStore]} ensureIndex）：档案索引建不出来
 * 时首写全部走 auto-create 兜底，堆栈区分是映射冲突还是集群不可用；</li>
 * <li><b>scroll 上下文残留</b>（{@code [SliceWorker]} clearScroll）：清理失败意味着远端
 * scroll 上下文残留到 keep-alive 到期（资源泄漏），堆栈区分是断连还是网关 4xx；</li>
 * <li><b>远端客户端关闭</b>（{@code [CrossClusterMigrateService]} close remote client）：
 * close 失败是连接泄漏的直接线索；</li>
 * <li><b>日期字段扫描降级</b>（{@code [FormatlessDateFields]}）：解析失败静默返回空清单
 * （「真的没有」与「解析不了」合流），这条 debug 是事后鉴别两者的唯一通道。</li>
 * </ol>
 *
 * <p>日志调用若以 {@code getMessage()} 收尾，只留异常消息文本、堆栈被丢弃。SLF4J 允许在
 * 占位符实参之后追加一个 Throwable（超出占位符的尾参按堆栈打印、消息文本不变），堆栈保真
 * 与既有输出形态可以并存。error 级、节流措辞族、分布式锁域、探测面域与连接同步域由
 * LogStackFidelityGuard885Test / 886Test / 889Test / 893Test 锁定，本类只锁上述迁移域
 * 五个标签（五标签在主源码各唯一归属一个类，已核）。解析按「参数段不含拉丁分号」的近似
 * 口径（消息文本含分号会截断解析，误差方向是漏报不误伤）。</p>
 */
public class LogStackFidelityGuard898Test {

    /** 跨行日志调用：.级别( 参数 ); */
    private static final Pattern LOG_CALL = Pattern.compile(
            "\\.(trace|debug|info|warn|error)\\(([^;]*?)\\)\\s*;", Pattern.DOTALL);

    /** 尾参=任意接收者的 getMessage() 调用 */
    private static final Pattern MESSAGE_TAIL = Pattern.compile(
            "^[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*\\.getMessage\\(\\)$");

    /** 迁移域标签族（每标签在主源码唯一归属一个类） */
    private static final String[] XMIGRATE_DOMAIN_MARKS = {
            "[CrossClusterMigrateService]", "[FormatlessDateFields]", "[MigrateBootstrapRunner]",
            "[MigrateJobStore]", "[SliceWorker]",
    };

    @Test
    public void xmigrateDomainLogsKeepThrowable() throws IOException {
        List<String> violations = scan((level, args) -> {
            boolean marked = false;
            for (String mark : XMIGRATE_DOMAIN_MARKS) {
                if (args.contains(mark)) {
                    marked = true;
                    break;
                }
            }
            return marked && isMessageTail(args);
        });
        assertTrue("迁移域日志以 getMessage() 收尾（静默降级面唯一留痕丢堆栈，尾参应追加异常对象）: "
                + violations, violations.isEmpty());
    }

    private interface ViolationPredicate {
        boolean matches(String level, String args);
    }

    private static boolean isMessageTail(String args) {
        String tail = args.substring(args.lastIndexOf(',') + 1).trim();
        return MESSAGE_TAIL.matcher(tail).matches();
    }

    private static List<String> scan(ViolationPredicate predicate) throws IOException {
        List<String> violations = new ArrayList<>();
        Path root = Paths.get(System.getProperty("esquerystudio.root", System.getProperty("basedir", ".")));
        try (Stream<Path> walk = Files.walk(root)) {
            walk.filter(p -> p.toString().endsWith(".java"))
                    .filter(p -> p.toString().replace('\\', '/').contains("/src/main/java/"))
                    .forEach(p -> {
                        String source;
                        try {
                            source = new String(Files.readAllBytes(p), StandardCharsets.UTF_8);
                        } catch (IOException e) {
                            throw new RuntimeException(e);
                        }
                        Matcher m = LOG_CALL.matcher(source);
                        while (m.find()) {
                            String args = m.group(2);
                            if (!predicate.matches(m.group(1), args)) {
                                continue;
                            }
                            int line = 1;
                            for (int i = 0; i < m.start(); i++) {
                                if (source.charAt(i) == '\n') {
                                    line++;
                                }
                            }
                            violations.add(p.getFileName() + ":" + line + " (." + m.group(1) + ")");
                        }
                    });
        }
        return violations;
    }
}
