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
import org.junit.Test;
import org.junit.experimental.runners.Enclosed;
import org.junit.runner.RunWith;

import static org.junit.Assert.assertTrue;

/**
 * 日志堆栈保真守卫测试族：扫描主源码的 SLF4J 日志调用，确保高价值排障面的日志
 * 不以 {@code e.getMessage()} 收尾而丢弃异常堆栈。锁面按域划分——error 级、节流
 * 首报与措辞变体、分布式锁域、探测面域、连接同步域、跨集群迁移域、adhoc 域以及
 * warn/info/trace 级别面——每个嵌套类独立扫描一个锁面，互不共享扫描状态。
 * 解析按「参数段不含拉丁分号」的近似口径执行，误差方向是漏报不误伤。
 */
@RunWith(Enclosed.class)
public class LogStackFidelityGuardTest {

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
    public static class LogStackFidelityGuard885 {

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

/**
 * 节流告警的堆栈保真守卫（措辞变体域）：间隔节流（「N s 内不再重复告警」）与一次性降级
 * （「此后降级不再尝试」「永久降级」）的告警是排障的高价值窗口——间隔节流的每一条都是
 * 窗口、一次性降级的首条是唯一窗口。日志调用若以 {@code e.getMessage()} 收尾，只留异常
 * 消息文本、堆栈被丢弃——ES 客户端异常的根因（超时/拒连/鉴权失败）常在 cause 链与调用栈
 * 里，只有 message 一行时排障无从定位。SLF4J 允许在占位符实参之后追加一个 Throwable
 * （超出占位符的尾参按堆栈打印、消息文本不变），堆栈保真与既有输出形态可以并存。
 * error 级与「首次，后续失败仅累计不再打」标记形态由 LogStackFidelityGuard885Test 锁定，
 * 本类只锁上述三种措辞变体。解析按「参数段不含拉丁分号」的近似口径（消息文本含分号会
 * 截断解析，误差方向是漏报不误伤）。
 */
    public static class LogStackFidelityGuard886 {

    /** 跨行日志调用：.级别( 参数 ); */
    private static final Pattern LOG_CALL = Pattern.compile(
            "\\.(trace|debug|info|warn|error)\\(([^;]*?)\\)\\s*;", Pattern.DOTALL);

    /** 尾参=任意接收者的 getMessage() 调用 */
    private static final Pattern MESSAGE_TAIL = Pattern.compile(
            "^[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*\\.getMessage\\(\\)$");

    /** 节流语汇变体（一次性降级首报 + 间隔节流告警） */
    private static final String[] THROTTLE_VARIANT_MARKS = {
            "此后降级不再尝试", "永久降级", "内不再重复告警",
    };

    @Test
    public void throttledVariantWarningsKeepThrowable() throws IOException {
        List<String> violations = scan((level, args) -> {
            boolean marked = false;
            for (String mark : THROTTLE_VARIANT_MARKS) {
                if (args.contains(mark)) {
                    marked = true;
                    break;
                }
            }
            return marked && isMessageTail(args);
        });
        assertTrue("节流变体告警日志以 getMessage() 收尾（堆栈丢失，尾参应追加异常对象）: " + violations,
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
    public static class LogStackFidelityGuard889 {

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
    public static class LogStackFidelityGuard893 {

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
    public static class LogStackFidelityGuard898 {

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

/**
 * adhoc 作业域的堆栈保真守卫：该域的告警全部是「失败被刻意忽略、不反噬主流程」的
 * 静默降级路径，日志是失败发生的<b>唯一留痕</b>——
 *
 * <ol>
 * <li><b>版本探测失败</b>（{@code [AdhocRebuild]} host version probe failed）：探测不到
 * 目标集群版本时按未知版本继续，堆栈区分是连接拒绝还是端点缺失；</li>
 * <li><b>任务取消失败</b>（{@code [AdhocRebuild]} cancel task failed）：取消不阻断重建
 * 收尾，堆栈区分是任务已完成还是控制面不可达；</li>
 * <li><b>时间字段候选解析失败</b>（{@code [AdhocRebuild]} parse mapping failed）：候选
 * 集合为空继续，堆栈区分是映射缺失还是 JSON 结构不符；</li>
 * <li><b>作业落库失败</b>（{@code [esquerystudio-adhoc-es]} / {@code [esquerystudio-adhoc-jdbc]}
 * 落作业失败）：作业档案写不进去时重建照跑，堆栈区分是索引映射冲突还是连接断开；</li>
 * <li><b>作业删除失败</b>（同标签族删除作业失败）：删除失败留脏档案，堆栈区分是
 * 404 还是网关错误；</li>
 * <li><b>作业载荷反序列化失败</b>（同标签族 payload 反序列化失败）：降级返回骨架
 * 数据，「数据损坏」与「真的为空」靠堆栈鉴别。</li>
 * </ol>
 *
 * <p>日志调用若以 {@code getMessage()} 收尾，只留异常消息文本、堆栈被丢弃。SLF4J 允许在
 * 占位符实参之后追加一个 Throwable（超出占位符的尾参按堆栈打印、消息文本不变），堆栈保真
 * 与既有输出形态可以并存。error 级、节流措辞族、分布式锁域、探测面域、连接同步域与迁移域
 * 由 LogStackFidelityGuard885Test / 886Test / 889Test / 893Test / 898Test 锁定，本类只锁
 * adhoc 包三文件（域=包路径，域内九处告警全部在 catch 块内、异常变量名恒为 {@code e}）。
 * 解析按「参数段不含拉丁分号」的近似口径（消息文本含分号会截断解析，误差方向是漏报
 * 不误伤）。</p>
 */
    public static class LogStackFidelityGuard900 {

    /** 跨行日志调用：.级别( 参数 ); */
    private static final Pattern LOG_CALL = Pattern.compile(
            "\\.(trace|debug|info|warn|error)\\(([^;]*?)\\)\\s*;", Pattern.DOTALL);

    /** 尾参=任意接收者的 getMessage() 调用 */
    private static final Pattern MESSAGE_TAIL = Pattern.compile(
            "^[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*\\.getMessage\\(\\)$");

    /** adhoc 域=包路径锁（域内三文件九处告警全量在册，五标签唯一性论证不需要） */
    private static final String ADHOC_DOMAIN_SEGMENT = "/io/github/dengmeiluan/esquerystudio/console/adhoc/";

    @Test
    public void adhocDomainLogsKeepThrowable() throws IOException {
        List<String> violations = scan((path, level, args) -> {
            boolean inDomain = path.replace('\\', '/').contains(ADHOC_DOMAIN_SEGMENT);
            return inDomain && isMessageTail(args);
        });
        assertTrue("adhoc 域日志以 getMessage() 收尾（静默降级面唯一留痕丢堆栈，尾参应追加异常对象）: "
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
    public static class LogStackFidelityGuard901 {

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
}
