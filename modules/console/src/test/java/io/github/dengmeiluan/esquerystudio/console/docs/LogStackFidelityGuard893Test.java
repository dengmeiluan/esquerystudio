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
 * 多集群连接同步域的堆栈保真守卫：四类连接同步告警是排障的唯一窗口——
 *
 * <ol>
 * <li><b>调度轮失败</b>（{@code [ConnSync]} scheduled round）：定时同步轮异常意味着连接
 * 档案停止演进（探活/版本/同步状态全部滞后），只有堆栈能区分是 ES 不可达、索引映射
 * 漂移还是代码缺陷；</li>
 * <li><b>保存即探失败</b>（{@code [ConnSync]} probeOne）：连接保存后的即时探测失败意味着
 * 状态点秒级可见的承诺失明，排障依赖异常类型定位是拒连、超时还是认证失败；</li>
 * <li><b>连接档案写入失败</b>（{@code [EsConnStore]} / {@code [JdbcConnStore]}
 * updateVersion / markSyncState / ensureSchema）：探活到新版本但档案写不进时版本漂移
 * 无从排查，堆栈区分是 schema 缺失、映射冲突还是存储不可用；</li>
 * <li><b>客户端关闭失败</b>（{@code [EsClientRouter]} close client）：旧客户端 close
 * 失败是连接泄漏的直接线索，堆栈区分是网络中断还是客户端生命周期缺陷。</li>
 * </ol>
 *
 * <p>日志调用若以 {@code getMessage()} 收尾，只留异常消息文本、堆栈被丢弃。SLF4J 允许在
 * 占位符实参之后追加一个 Throwable（超出占位符的尾参按堆栈打印、消息文本不变），堆栈保真
 * 与既有输出形态可以并存。error 级、节流措辞族、分布式锁域与探测面域由
 * LogStackFidelityGuard885Test / 886Test / 889Test 锁定，本类只锁上述连接同步域四个标签
 * （四标签在主源码全站唯一，已核）。解析按「参数段不含拉丁分号」的近似口径（消息文本含
 * 分号会截断解析，误差方向是漏报不误伤）。</p>
 */
public class LogStackFidelityGuard893Test {

    /** 跨行日志调用：.级别( 参数 ); */
    private static final Pattern LOG_CALL = Pattern.compile(
            "\\.(trace|debug|info|warn|error)\\(([^;]*?)\\)\\s*;", Pattern.DOTALL);

    /** 尾参=任意接收者的 getMessage() 调用 */
    private static final Pattern MESSAGE_TAIL = Pattern.compile(
            "^[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*\\.getMessage\\(\\)$");

    /** 连接同步域标签族（每标签在主源码唯一归属一个类） */
    private static final String[] CONN_SYNC_DOMAIN_MARKS = {
            "[ConnSync]", "[EsClientRouter]", "[EsConnStore]", "[JdbcConnStore]",
    };

    @Test
    public void connSyncDomainLogsKeepThrowable() throws IOException {
        List<String> violations = scan((level, args) -> {
            boolean marked = false;
            for (String mark : CONN_SYNC_DOMAIN_MARKS) {
                if (args.contains(mark)) {
                    marked = true;
                    break;
                }
            }
            return marked && isMessageTail(args);
        });
        assertTrue("连接同步域日志以 getMessage() 收尾（同步停摆/版本漂移/连接泄漏时堆栈丢失，尾参应追加异常对象）: "
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
