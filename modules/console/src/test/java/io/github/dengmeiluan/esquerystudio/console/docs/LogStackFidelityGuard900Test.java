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
public class LogStackFidelityGuard900Test {

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
