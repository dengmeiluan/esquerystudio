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
 * 分布式锁与探测面的堆栈保真守卫：这两类告警是排障的高价值窗口——
 *
 * <ol>
 * <li><b>分布式锁域</b>（{@code [RebuildLock]} 标签）：锁的写入/续租/释放/读取失败意味着
 * 重建互斥语义可能失效（误双跑或卡死），根因几乎总在 ES 客户端异常的 cause 链与调用栈里，
 * 只有一行 message 无从定位；</li>
 * <li><b>探测面域</b>（探活/健康探测/宿主与候选集群版本探测/数组字段能力探测）：探测失败
 * 意味着健康面或能力判定失明（按「未知」降级继续运行），排障依赖异常类型与堆栈定位
 * 是超时、拒连还是响应形态漂移。</li>
 * </ol>
 *
 * <p>日志调用若以 {@code e.getMessage()} 收尾，只留异常消息文本、堆栈被丢弃。SLF4J 允许在
 * 占位符实参之后追加一个 Throwable（超出占位符的尾参按堆栈打印、消息文本不变），堆栈保真
 * 与既有输出形态可以并存。error 级、节流首报与节流措辞变体由 LogStackFidelityGuard885Test
 * 与 LogStackFidelityGuard886Test 锁定，本类只锁上述两个域。探测域按措辞族全谱枚举六条
 * 消息字面量（探活/健康/宿主版本/候选集群版本/scripted_metric 采样能力探测各归其位），
 * 解析按「参数段不含拉丁分号」的近似口径（消息文本含分号会截断解析，误差方向是漏报不误伤）。</p>
 */
public class LogStackFidelityGuard889Test {

    /** 跨行日志调用：.级别( 参数 ); */
    private static final Pattern LOG_CALL = Pattern.compile(
            "\\.(trace|debug|info|warn|error)\\(([^;]*?)\\)\\s*;", Pattern.DOTALL);

    /** 尾参=任意接收者的 getMessage() 调用 */
    private static final Pattern MESSAGE_TAIL = Pattern.compile(
            "^[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*\\.getMessage\\(\\)$");

    /** 分布式锁域标签 */
    private static final String LOCK_MARK = "[RebuildLock]";

    /** 探测面域措辞族（逐条精确字面量，域成员=红名单核对基线） */
    private static final String[] PROBE_DOMAIN_MARKS = {
            "indexKey={} probe failed",             // 健康探测（[health]）
            "[ConnHealthProber] probeAll failed",   // 连接探活调度
            "[HostEsVersion] 宿主版本探测失败",       // 宿主版本探测
            "scripted_metric detection failed",     // 数组字段能力探测（scripted_metric 臂）
            "sampling detection also failed",       // 数组字段能力探测（sampling 兜底臂）
            "候选集群版本探测失败",                   // 候选控制集群版本探测
    };

    @Test
    public void lockDomainWarningsKeepThrowable() throws IOException {
        List<String> violations = scan((level, args) ->
                args.contains(LOCK_MARK) && isMessageTail(args));
        assertTrue("分布式锁日志以 getMessage() 收尾（互斥语义失灵时堆栈丢失，尾参应追加异常对象）: " + violations,
                violations.isEmpty());
    }

    @Test
    public void probeDomainWarningsKeepThrowable() throws IOException {
        List<String> violations = scan((level, args) -> {
            boolean marked = false;
            for (String mark : PROBE_DOMAIN_MARKS) {
                if (args.contains(mark)) {
                    marked = true;
                    break;
                }
            }
            return marked && isMessageTail(args);
        });
        assertTrue("探测面日志以 getMessage() 收尾（探测失明排障依赖堆栈，尾参应追加异常对象）: " + violations,
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
