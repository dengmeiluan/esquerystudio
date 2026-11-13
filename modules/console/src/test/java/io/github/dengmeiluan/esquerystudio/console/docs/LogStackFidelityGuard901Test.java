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
 * warn / info / trace 级日志的堆栈保真全站守卫：把此前按包域渐进收口的锁面
 * （error 级与节流措辞族由 LogStackFidelityGuard885Test / 886Test 锁定，分布式锁域
 * 与探测面域由 889Test、连接同步域由 893Test、迁移域由 898Test、adhoc 域由
 * 900Test 锁定）升级为级别面收口——catch 块内降级告警的日志是该次失败的
 * 唯一留痕，warn 与 info 级同域同律。
 *
 * <p><b>级别面裁决</b>：error（最高价值排障面）、warn（降级告警）与 info 中的
 * 降级措辞族（「永久回退」「按旧 9 列运行」=本进程唯一降级窗口）入锁；
 * <b>debug 豁免</b>——debug 级生产默认关闭、非排障窗口（届时开 debug 级别可带
 * 堆栈重放），全站现存 6 处 debug 收尾记档观察（core 域 5 处 + config 域 1 处），
 * 不在本锁面内；若未来 debug 级出现新的丢堆栈形态，须先过级别面裁决再扩锁。</p>
 *
 * <p><b>豁免通道</b>：{@code ConfigValidationStartupRunner} 的 {@code issue.getMessage()}
 * 收尾——接收者是校验域对象（ConfigIssue）而非 Throwable，本无堆栈可保，按消息锚
 * {@code [ConfigValidation] indexKey=} 豁免（同类豁免先例：adhoc 域 job.setError
 * 的非日志消费口径）。</p>
 *
 * <p>日志调用若以 {@code getMessage()} 收尾，只留异常消息文本、堆栈被丢弃。SLF4J 允许在
 * 占位符实参之后追加一个 Throwable（超出占位符的尾参按堆栈打印、消息文本不变），堆栈保真
 * 与既有输出形态可以并存。解析按「参数段不含拉丁分号 + 尾参独立判定」的近似口径
 * （消息文本含分号会截断解析，误差方向是漏报不误伤）。</p>
 */
public class LogStackFidelityGuard901Test {

    /** 跨行日志调用：.级别( 参数 ); */
    private static final Pattern LOG_CALL = Pattern.compile(
            "\\.(trace|debug|info|warn|error)\\(([^;]*?)\\)\\s*;", Pattern.DOTALL);

    /** 尾参=任意接收者的 getMessage() 调用 */
    private static final Pattern MESSAGE_TAIL = Pattern.compile(
            "^[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*\\.getMessage\\(\\)$");

    /** 入锁级别集：warn / info / trace（error 已由 885Test 全量锁定，debug 按级别面裁决豁免） */
    private static final List<String> LOCKED_LEVELS =
            java.util.Arrays.asList("trace", "info", "warn");

    /** 豁免锚：ConfigIssue 域对象的消息消费（接收者非 Throwable，无堆栈可保） */
    private static final String CONFIG_ISSUE_LOG_ANCHOR = "[ConfigValidation] indexKey=";

    @Test
    public void warnAndInfoLogsKeepThrowable() throws IOException {
        List<String> violations = scan((path, level, args) -> {
            if (!LOCKED_LEVELS.contains(level) || !isMessageTail(args)) {
                return false;
            }
            return !(path.endsWith("ConfigValidationStartupRunner.java")
                    && args.contains(CONFIG_ISSUE_LOG_ANCHOR));
        });
        assertTrue("warn/info/trace 级日志以 getMessage() 收尾（降级告警唯一留痕丢堆栈，尾参应追加异常对象）: "
                + violations, violations.isEmpty());
    }

    private interface ViolationPredicate {
        boolean matches(String path, String level, String args);
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
                            if (!predicate.matches(p.toString(), m.group(1), args)) {
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
