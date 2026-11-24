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

package io.github.dengmeiluan.esquerystudio.console.client;

import org.junit.Test;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 *  .5（台账 #65）：启动期发现「写别名当前指向的物理索引被挡写」。
 *
 * <p>本类钉的不是「有没有挡写」，而是<b>业务此刻能不能写</b>——判据是写别名指向的那个物理索引。
 * 常规重建成功切换后旧物理索引上的挡写是无害残留，不该告警。</p>
 *
 * <p><b>fixture 取值域刻意不重叠</b>：别名 {@code probe_alias}、物理 {@code phys_20260801}，
 * 二者不同且不互为子串——否则「把别名当物理索引输出」「两个字段搞混」这类错误测不出来。</p>
 */
public class StaleWriteBlockDetectorTest {

    private static final String ALIAS = "probe_alias";
    private static final String PHYSICAL = "phys_20260801";

    /** 收集 error 级告警文本的桩（替代读日志——断言落在产出上，不落在日志框架上）。 */
    private static final class CapturingSink implements StaleWriteBlockDetector.AlertSink {
        final List<String> alerts = new ArrayList<>();
        final List<String> warns = new ArrayList<>();

        @Override
        public void alert(String message) {
            alerts.add(message);
        }

        @Override
        public void warn(String message, Throwable cause) {
            warns.add(message);
        }
    }

    /**
     * 可编程 ES 桩。按别名分别配置「写索引解析结果」与「该物理索引的 settings」，
     * 或让某个别名直接抛异常。
     */
    private static final class StubProbe implements StaleWriteBlockDetector.EsProbe {
        final Map<String, String> writeIndexByAlias = new LinkedHashMap<>();
        final Map<String, Map<String, Object>> settingsByIndex = new LinkedHashMap<>();
        final Map<String, RuntimeException> throwByAlias = new LinkedHashMap<>();
        final List<String> settingsQueried = new ArrayList<>();

        @Override
        public String resolveWriteIndex(String alias) throws IOException {
            RuntimeException boom = throwByAlias.get(alias);
            if (boom != null) {
                throw boom;
            }
            return writeIndexByAlias.get(alias);
        }

        @Override
        public Map<String, Object> getIndexSettings(String physicalIndex) throws IOException {
            settingsQueried.add(physicalIndex);
            Map<String, Object> s = settingsByIndex.get(physicalIndex);
            return s == null ? Collections.<String, Object>emptyMap() : s;
        }
    }

    /** ES 真实回包形态：settings 里的布尔被字符串化。value 类型由调用方决定，专供第 3 条用。 */
    private static Map<String, Object> settingsWithWriteBlock(Object value) {
        Map<String, Object> blocks = new LinkedHashMap<>();
        blocks.put("write", value);
        Map<String, Object> index = new LinkedHashMap<>();
        index.put("blocks", blocks);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("index", index);
        return root;
    }

    private static StaleWriteBlockDetector detector(StubProbe probe, CapturingSink sink, String... aliases) {
        return new StaleWriteBlockDetector(Arrays.asList(aliases), probe, sink);
    }

    // ---------------------------------------------------------------------------------------
    // 1. 写别名指向的索引被挡写 → 产出一条告警，四要素齐全
    // ---------------------------------------------------------------------------------------

    /**
     * <b>本断言声称防的失败模式</b>：检测到挡写却不告警，或告警文本缺少运维定位/处置所需信息
     * （别名名、物理索引名、两种可能、解除命令）。
     *
     * <p>不用 contains(alias) 单独判——ALIAS 与 PHYSICAL 不互为子串，两条 contains
     * 同时成立才能说明两个字段都被正确输出，而不是同一个值被打印了两遍。</p>
     */
    @Test
    public void blockedWriteIndexProducesOneAlertCarryingAllFourElements() {
        StubProbe probe = new StubProbe();
        probe.writeIndexByAlias.put(ALIAS, PHYSICAL);
        probe.settingsByIndex.put(PHYSICAL, settingsWithWriteBlock("true"));
        CapturingSink sink = new CapturingSink();

        detector(probe, sink, ALIAS).scan();

        assertThat(sink.alerts).as("挡写必须产出恰好一条告警").hasSize(1);
        String msg = sink.alerts.get(0);
        assertThat(msg).as("必须含别名名").contains(ALIAS);
        assertThat(msg).as("必须含物理索引名").contains(PHYSICAL);
        assertThat(msg).as("必须含 index.blocks.write 事实").contains("index.blocks.write");
        assertThat(msg).as("必须并列『正在进行』这一可能").contains("正在进行");
        assertThat(msg).as("必须并列『中断』这一可能").contains("中断");
        assertThat(msg).as("必须给出 宿主控制台这个排查入口").contains("宿主");
        assertThat(msg).as("必须给出解除命令的 _settings 路径").contains("_settings");
        assertThat(msg).as("解除命令必须针对物理索引而非别名")
                .contains("/" + PHYSICAL + "/_settings");
    }

    // ---------------------------------------------------------------------------------------
    // 2. 未被挡写 → 零告警（防「无条件告警」这种恒真实现）
    // ---------------------------------------------------------------------------------------

    /** <b>防的失败模式</b>：实现只要遍历到索引就告警，不看 blocks.write 的值。 */
    @Test
    public void unblockedWriteIndexProducesNoAlert() {
        StubProbe probe = new StubProbe();
        probe.writeIndexByAlias.put(ALIAS, PHYSICAL);
        probe.settingsByIndex.put(PHYSICAL, settingsWithWriteBlock("false"));
        CapturingSink sink = new CapturingSink();

        detector(probe, sink, ALIAS).scan();

        assertThat(sink.alerts).as("未挡写不该有任何告警").isEmpty();
    }

    /** settings 里根本没有 blocks.write 键（绝大多数正常索引的真实形态）→ 零告警。 */
    @Test
    public void absentWriteBlockSettingProducesNoAlert() {
        StubProbe probe = new StubProbe();
        probe.writeIndexByAlias.put(ALIAS, PHYSICAL);
        probe.settingsByIndex.put(PHYSICAL, Collections.<String, Object>emptyMap());
        CapturingSink sink = new CapturingSink();

        detector(probe, sink, ALIAS).scan();

        assertThat(sink.alerts).as("无 blocks.write 键不该告警").isEmpty();
    }

    // ---------------------------------------------------------------------------------------
    // 3. 字符串化的 "true" 必须识别（本任务最可能踩的坑）
    // ---------------------------------------------------------------------------------------

    /**
     * <b>防的失败模式</b>：实现写成 {@code Boolean.TRUE.equals(v)}。
     * ES 的 settings 回包会把布尔<b>字符串化</b>（{@code true}→{@code "true"}），
     * 该实现在线上<b>永远识别不到</b>挡写，而若测试也用布尔构造 fixture 就会一路假绿。
     *
     * <p>所以这里<b>只</b>用字符串 {@code "true"} —— 与第 1 条的布尔形态互补，
     * 两条都在，才同时覆盖两种回包形态。</p>
     */
    @Test
    public void stringifiedTrueIsRecognizedAsBlocked() {
        StubProbe probe = new StubProbe();
        probe.writeIndexByAlias.put(ALIAS, PHYSICAL);
        probe.settingsByIndex.put(PHYSICAL, settingsWithWriteBlock("true"));
        CapturingSink sink = new CapturingSink();

        detector(probe, sink, ALIAS).scan();

        assertThat(sink.alerts).as("字符串 \"true\" 必须与布尔 true 同样被识别为挡写").hasSize(1);
    }

    /** 布尔 true 形态同样识别（防「只认字符串、不认布尔」的反向偏窄实现）。 */
    @Test
    public void booleanTrueIsRecognizedAsBlocked() {
        StubProbe probe = new StubProbe();
        probe.writeIndexByAlias.put(ALIAS, PHYSICAL);
        probe.settingsByIndex.put(PHYSICAL, settingsWithWriteBlock(Boolean.TRUE));
        CapturingSink sink = new CapturingSink();

        detector(probe, sink, ALIAS).scan();

        assertThat(sink.alerts).as("布尔 true 必须被识别为挡写").hasSize(1);
    }

    // ---------------------------------------------------------------------------------------
    // 4. ES 抛异常 → 不抛出、不影响启动，且记 warn
    // ---------------------------------------------------------------------------------------

    /** <b>防的失败模式</b>：诊断功能把异常抛给启动流程，变成启动阻塞点。 */
    @Test
    public void probeFailureIsSwallowedAndWarned() {
        StubProbe probe = new StubProbe();
        probe.throwByAlias.put(ALIAS, new RuntimeException("es unreachable"));
        CapturingSink sink = new CapturingSink();

        detector(probe, sink, ALIAS).scan();

        assertThat(sink.alerts).as("扫描失败不是业务故障，不该产出 error 级告警").isEmpty();
        assertThat(sink.warns).as("扫描失败必须留下 warn 痕迹").hasSize(1);
    }

    // ---------------------------------------------------------------------------------------
    // 5. ElasticsearchOperations 不可用（HOST_DISABLED）→ 直接跳过，不抛
    // ---------------------------------------------------------------------------------------

    /** probe 为 null 表示宿主无 ES 连接：跳过扫描，不抛、不告警。 */
    @Test
    public void nullProbeSkipsScanWithoutThrowing() {
        CapturingSink sink = new CapturingSink();

        new StaleWriteBlockDetector(Collections.singletonList(ALIAS), null, sink).scan();

        assertThat(sink.alerts).as("无 ES 连接时不该告警").isEmpty();
    }

    /** 别名解析不出写索引（别名不存在／指向多个索引且无 is_write_index）→ 不告警、不抛。 */
    @Test
    public void unresolvableWriteIndexProducesNoAlert() {
        StubProbe probe = new StubProbe();
        CapturingSink sink = new CapturingSink();

        detector(probe, sink, ALIAS).scan();

        assertThat(sink.alerts).as("解析不出写索引时不能瞎告警").isEmpty();
        assertThat(probe.settingsQueried).as("没解析出物理索引就不该去读 settings").isEmpty();
    }

    // ---------------------------------------------------------------------------------------
    // 6. 多索引逐个独立判定：第一个抛异常不能让后面的漏扫
    // ---------------------------------------------------------------------------------------

    /**
     * <b>防的失败模式</b>：整轮扫描只有一层 try/catch，<b>第一个</b>索引抛异常就中断整轮，
     * 后面真正被挡写的索引<b>连同它的告警一起被吞掉</b>——守卫与被守卫者共处同一控制流。
     *
     * <p>fixture 顺序是本条的要害：<b>必须让先扫的那个抛异常</b>。
     * 反过来（先挡写、后抛异常）时，即便实现会中断整轮，告警也已经产出了，测不出这个失效模式。</p>
     */
    @Test
    public void failureOnFirstIndexDoesNotHideBlockOnSecond() {
        String firstAlias = "boom_alias";
        StubProbe probe = new StubProbe();
        probe.throwByAlias.put(firstAlias, new RuntimeException("es unreachable"));
        probe.writeIndexByAlias.put(ALIAS, PHYSICAL);
        probe.settingsByIndex.put(PHYSICAL, settingsWithWriteBlock("true"));
        CapturingSink sink = new CapturingSink();

        detector(probe, sink, firstAlias, ALIAS).scan();

        assertThat(sink.alerts).as("第一个索引失败后，第二个索引的挡写仍必须被发现").hasSize(1);
        assertThat(sink.alerts.get(0)).as("被发现的必须是第二个索引").contains(PHYSICAL);
        assertThat(sink.warns).as("第一个索引的失败仍要留 warn").hasSize(1);
    }

    /** 多个索引同时被挡写 → 每个各出一条，不去重、不只报第一条。 */
    @Test
    public void everyBlockedIndexProducesItsOwnAlert() {
        String otherAlias = "second_alias";
        String otherPhysical = "other_20260801";
        StubProbe probe = new StubProbe();
        probe.writeIndexByAlias.put(ALIAS, PHYSICAL);
        probe.settingsByIndex.put(PHYSICAL, settingsWithWriteBlock("true"));
        probe.writeIndexByAlias.put(otherAlias, otherPhysical);
        probe.settingsByIndex.put(otherPhysical, settingsWithWriteBlock("true"));
        CapturingSink sink = new CapturingSink();

        detector(probe, sink, ALIAS, otherAlias).scan();

        assertThat(sink.alerts).as("两个被挡索引必须各出一条告警").hasSize(2);
        // 不用 find/取第一条来验——那对「产出重复」这个失败模式天然免疫
        assertThat(sink.alerts.get(0)).contains(PHYSICAL);
        assertThat(sink.alerts.get(1)).contains(otherPhysical);
    }

    // ---------------------------------------------------------------------------------------
    // 7. 告警文本不含断言式措辞（钉住「绝不许声称原因」这条设计约束）
    // ---------------------------------------------------------------------------------------

    /**
     * 断言式措辞黑名单。<b>提为常量而非内联数组</b>：内联在测试方法里，将来有人改文案撞红时，
     * 最省事的做法是顺手把撞上的那个词从数组里删掉——看守就这样被悄悄拆掉了。
     * 提到这里，删词是一次<b>显式修改共享约束</b>的动作，diff 上跑不掉。
     *
     * <p><b>但黑名单只是补丁，不是本条约束的主看守</b>：违规的本质是<b>语气与排序</b>，
     * 而黑名单只能枚举词。「疑似遗留」「未正常结束」「很可能中断了」这类改写不含任何旧禁词，
     * 却同样违背约束。主看守是 {@link #alertMustPresentBothCausesAsCoequalAlternatives}
     * 的结构 + 语义锚点断言。</p>
     */
    private static final List<String> ASSERTIVE_CAUSE_WORDS = Arrays.asList(
            // 原始黑名单
            "残留", "异常退出", "上次重建失败", "重建失败", "孤儿挡写",
            // 评审补充：不含旧禁词、只换说法就能完成断言的措辞
            "遗留", "未正常", "更可能", "通常是", "可能性更大");

    /**
     * 只加副词、不改结构就能完成暗示的「倾向词」。
     *
     * <p>这些词单独出现在文案任何位置都不算违规（比如「通常」出现在处置建议里无害），
     * 违规的是它们出现在<b>某一条可能的描述段内</b>——那就是在给两种可能排优先级。
     * 所以本表只在 {@code (1)}/{@code (2)} 的<b>分段范围内</b>扫描，不做全文 contains。</p>
     */
    private static final List<String> TILT_WORDS = Arrays.asList(
            "通常", "多半", "大概率", "更常见", "更可能", "很可能", "往往", "一般是",
            "多数情况", "可能性更大", "极可能", "疑似");

    /**
     * <b>防的失败模式</b>：文案写成「检测到残留写阻断」「上次重建异常退出」。
     * 一次<b>正在进行</b>的重建会被这种措辞污蔑成故障，运维照着解除挡写就会破坏该次重建——
     * 这比不告警更糟。
     *
     * <p>本条是<b>补丁层</b>：只能拦住已知说法。真正的看守见下一条。</p>
     */
    @Test
    public void alertMustNotAssertACause() {
        String msg = singleAlertForBlockedIndex();

        for (String forbidden : ASSERTIVE_CAUSE_WORDS) {
            assertThat(msg)
                    .as("告警不得使用断言式措辞『%s』——正在进行的重建会被它污蔑成故障", forbidden)
                    .doesNotContain(forbidden);
        }
    }

    /**
     * <b>约束 A 的主看守：结构 + 语义锚点。</b>
     *
     * <p>上一条的黑名单测的是「有没有说某个词」，但违规的本质是<b>语气与排序</b>，两者不同构。
     * 「上次重建<b>很可能</b>中断了」不含任何黑名单词，甚至还含着黑名单测试<b>要求必须有</b>的
     * 「中断」，却 100% 违背约束 A。所以这里改测三件<b>结构性</b>的事：</p>
     *
     * <ol>
     *   <li><b>同构编号并列且 (1) 在 (2) 之前</b>——「并列」这件事在文本上的可验证形态就是编号。
     *       任何把两种可能合并成一句、或改成「主因/次因」叙述的改写，都会让编号消失或错位。</li>
     *   <li><b>必须明示「无法区分」</b>——这是约束 A 的<b>语义核心</b>，也是本条最硬的锚点。
     *       任何断言式改写只有两条路：要么删掉它（本断言直接红），要么留着它同时又去断言原因，
     *       文案当场自相矛盾（「本地无法区分」＋「通常是中断导致」），人工评审一眼可见。</li>
     *   <li><b>两条描述篇幅不得悬殊，且描述段内不得出现倾向词</b>——见下方阈值说明。</li>
     * </ol>
     *
     * <p><b>关于篇幅阈值（40）与它的定位</b>：篇幅对称本身是<b>钝</b>的断言——它抓不住
     * 「(2) <b>更常见</b>」（加三个字，篇幅几乎不变）。所以它<b>不是</b>本条的主力，只负责拦
     * <b>粗暴失衡</b>：把某一条扩写成另一条的两倍长，那本身就是一望即知的侧重。
     * 阈值定 40 而非更宽的值，是因为实测过：真实文案两条差 <b>3</b> 字符，余量足够容纳正常润色；
     * 而放宽到 80 时，一次「把 (1) 扩写近一倍（差 48 字符）」的失衡改写<b>照样能通过</b>——
     * 阈值一旦松到那个程度，这条断言就只是装饰。40 是「实测差 3」与「已知失衡 48」之间的取值。</p>
     *
     * <p><b>真正抓「(2) 更常见」这类改写的是同一条断言里的分段倾向词扫描</b>：
     * 把文案按 {@code (1)}/{@code (2)} 切成两段，在<b>段内</b>扫「通常/多半/更常见/很可能/疑似」等词。
     * 它是<b>位置敏感</b>的——「通常」出现在下方处置建议里无害、出现在某一条可能的描述里就是排序，
     * 这正是全文 contains 黑名单做不到的判别力。篇幅与倾向词两者合起来才补上黑名单的缺口。</p>
     */
    @Test
    public void alertMustPresentBothCausesAsCoequalAlternatives() {
        String msg = singleAlertForBlockedIndex();

        int p1 = msg.indexOf("(1)");
        int p2 = msg.indexOf("(2)");

        assertThat(p1).as("两种可能必须以同构编号 (1) 并列陈述——合并成一句叙述即失去并列形态").isGreaterThanOrEqualTo(0);
        assertThat(p2).as("两种可能必须以同构编号 (2) 并列陈述").isGreaterThanOrEqualTo(0);
        assertThat(p1).as("(1) 必须在 (2) 之前——顺序调换本身就是一种暗示").isLessThan(p2);

        assertThat(msg)
                .as("必须明示『无法区分』：这是约束 A 的语义核心。断言式改写要么删掉它（本断言红）、"
                        + "要么与它自相矛盾（人工可见）")
                .contains("无法区分");

        String branch1 = msg.substring(p1, p2);
        String branch2 = branchTwoText(msg, p2);

        assertThat(Math.abs(branch1.length() - branch2.length()))
                .as("两条可能的描述篇幅不得悬殊——悬殊即暗示了侧重。阈值 40：真实文案实测差 3 字符，"
                        + "余量足够容纳正常润色；而把某一条扩写成另一条两倍长这种粗暴失衡会被拦住。"
                        + "抓『(2) 更常见』这类只加副词的改写靠的是下面的分段倾向词扫描，不靠本条。"
                        + "实际 (1)=%d 字符 / (2)=%d 字符", branch1.length(), branch2.length())
                .isLessThanOrEqualTo(40);

        for (String tilt : TILT_WORDS) {
            assertThat(branch1)
                    .as("(1) 的描述段内不得出现倾向词『%s』——在某一条可能里加副词就是在给两种可能排序", tilt)
                    .doesNotContain(tilt);
            assertThat(branch2)
                    .as("(2) 的描述段内不得出现倾向词『%s』——在某一条可能里加副词就是在给两种可能排序", tilt)
                    .doesNotContain(tilt);
        }
    }

    /**
     * 取 {@code (2)} 那条可能的描述文本：从 {@code (2)} 起到该行结束。
     *
     * <p>不取到文本末尾——后面还跟着排查入口与解除命令，把它们算进 (2) 会让篇幅比较失去意义，
     * 也会让倾向词扫描误伤处置建议里无害的「通常」。</p>
     */
    private static String branchTwoText(String msg, int p2) {
        int lineEnd = msg.indexOf('\n', p2);
        return lineEnd < 0 ? msg.substring(p2) : msg.substring(p2, lineEnd);
    }

    /** 制造一次「写别名指向的索引被挡写」并返回那条唯一告警。 */
    private static String singleAlertForBlockedIndex() {
        StubProbe probe = new StubProbe();
        probe.writeIndexByAlias.put(ALIAS, PHYSICAL);
        probe.settingsByIndex.put(PHYSICAL, settingsWithWriteBlock("true"));
        CapturingSink sink = new CapturingSink();

        detector(probe, sink, ALIAS).scan();

        assertThat(sink.alerts).hasSize(1);
        return sink.alerts.get(0);
    }
}
