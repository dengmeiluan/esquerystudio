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
 * 日志堆栈保真守卫：日志调用若以 {@code e.getMessage()} 收尾，只留异常消息文本、堆栈被丢弃——
 * ES 客户端异常的根因（超时/拒连/鉴权失败）常在 cause 链与调用栈里，只有 message 一行时排障无从定位。
 * SLF4J 允许在占位符实参之后追加一个 Throwable（超出占位符的尾参按堆栈打印、消息文本不变），堆栈保真
 * 与既有输出形态可以并存。本守卫锁两个面：
 *
 * <ol>
 * <li><b>error 级</b>：错误路径是排障的最高价值面，尾参必须携带异常对象；</li>
 * <li><b>节流首报</b>：「首次，后续失败仅累计不再打」形态的首次告警是唯一排障窗口，尾参必须携带异常对象。</li>
 * </ol>
 *
 * <p>warn 级普通降级路径（一行 message 足以定位的忽略/回退）不在此锁域。解析按「参数段不含拉丁
 * 分号」的近似口径（消息文本含分号会截断解析，误差方向是漏报不误伤）。</p>
 */
public class LogStackFidelityGuard885Test {

    /** 跨行日志调用：.级别( 参数 ); */
    private static final Pattern LOG_CALL = Pattern.compile(
            "\\.(trace|debug|info|warn|error)\\(([^;]*?)\\)\\s*;", Pattern.DOTALL);

    /** 尾参=任意接收者的 getMessage() 调用 */
    private static final Pattern MESSAGE_TAIL = Pattern.compile(
            "^[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*\\.getMessage\\(\\)$");

    private static final String THROTTLED_FIRST_MARK = "首次，后续失败仅累计不再打";

    @Test
    public void errorLevelLogsKeepThrowable() throws IOException {
        List<String> violations = scan((level, args) -> "error".equals(level) && isMessageTail(args));
        assertTrue("error 级日志调用以 getMessage() 收尾（堆栈丢失，尾参应追加异常对象）: " + violations,
                violations.isEmpty());
    }

    @Test
    public void throttledFirstWarningKeepsThrowable() throws IOException {
        List<String> violations = scan((level, args) -> args.contains(THROTTLED_FIRST_MARK) && isMessageTail(args));
        assertTrue("节流首报日志以 getMessage() 收尾（首次是唯一排障窗口，堆栈丢失）: " + violations,
                violations.isEmpty());
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
