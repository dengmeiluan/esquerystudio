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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 台账 #69 守卫的三态测试。
 *
 * <p><b>本类守的性质</b>：跨大版本迁移必须在<b>起迁移前</b>被拒，不许跑进 {@link SliceWorker}
 * （RHLC 7.6.2 的 typeless bulk 在 6.x 上 400，失败模式是「迁到一半留下半拷贝索引」）。</p>
 *
 * <p><b>三态必须可区分</b>：ALLOW / 已知不同 major / 未知。后两者<b>结论都是拒绝</b>，
 * 但报错文本必须不同——使用者要据此采取不同行动。若只断言「都拒绝」，
 * 一个把未知折叠成「不同 major」的错误实现<b>照样能通过</b>，那正是 #67 的病根形态。</p>
 *
 * @author aicoding
 */
public class DestVersionGuardTest {

    // ------------------------------------------------------------ 三态：判定

    @Test
    public void sameMajorIsAllowed() {
        assertEquals(DestVersionGuard.Verdict.ALLOW, DestVersionGuard.verdict("7.6.2"));
        assertEquals(DestVersionGuard.Verdict.ALLOW, DestVersionGuard.verdict("7.10.1"));
    }

    /** 产线形态：目标 6.7.2 + 客户端 7.x。 */
    @Test
    public void sixDotXIsRejectedAsMajorMismatch() {
        assertEquals(DestVersionGuard.Verdict.REJECT_MAJOR_MISMATCH, DestVersionGuard.verdict("6.7.2"));
    }

    @Test
    public void eightDotXIsRejectedAsMajorMismatch() {
        assertEquals(DestVersionGuard.Verdict.REJECT_MAJOR_MISMATCH, DestVersionGuard.verdict("8.17.0"));
    }

    /**
     * 探不到 → 「未知」，<b>不是</b>「不同 major」。
     * 这条是 #67 教训的直接看守：不许把未知折叠成任何一个已知结论。
     */
    @Test
    public void unknownVersionIsItsOwnVerdictNotMajorMismatch() {
        for (String bad : new String[]{null, "", "   ", "unknown", "x.y.z", "0.1"}) {
            assertEquals("探不到必须是 REJECT_UNKNOWN，不许折叠成 REJECT_MAJOR_MISMATCH: " + bad,
                    DestVersionGuard.Verdict.REJECT_UNKNOWN, DestVersionGuard.verdict(bad));
        }
    }

    // ------------------------------------------------------------ 三态：报错文本可区分

    @Test
    public void allowHasNoRejectMessage() {
        assertNull(DestVersionGuard.rejectMessage("7.6.2"));
    }

    /**
     * 两种拒绝必须给出<b>不同的指引</b>——判据落在「各自专属的可操作措辞」上。
     *
     * <p>⚠ 这条断言最初写成 {@code assertNotEquals(mismatch, unknown)}，<b>那是假的</b>：
     * 报错文本里插了 {@code destVersion}（{@code "6.7.2"} vs {@code null}），
     * 即便两个分支<b>共用同一段代码</b>，插值也会让两个字符串不相等。
     * 变异「让 UNKNOWN 落进 MAJOR_MISMATCH 分支」时它照样绿——
     * 绿的原因是插值，不是指引真的不同（混杂）。
     * 改成对<b>各自专属措辞</b>的正反双向断言后，该变异即可被抓住。</p>
     */
    @Test
    public void twoRejectionsGiveDifferentActionableGuidance() {
        String mismatch = DestVersionGuard.rejectMessage("6.7.2");
        String unknown = DestVersionGuard.rejectMessage(null);

        // 不匹配：指引是「换同大版本的实例/集群」，不该谈连通性
        assertTrue("不匹配要指引换版本: " + mismatch, mismatch.contains("同大版本的应用实例"));
        assertFalse("不匹配不该把人引去查连通性: " + mismatch, mismatch.contains("连通性"));

        // 未知：指引是「查连通性」，不该宣称版本不兼容
        assertTrue("未知要指引查连通性: " + unknown, unknown.contains("连通性"));
        assertFalse("未知不该指引换版本（我们并不知道版本不兼容）: " + unknown,
                unknown.contains("同大版本的应用实例"));
    }

    /** 不匹配的文本要含可操作信息：具体版本号 + 客户端版本 + 后果 + 怎么办。 */
    @Test
    public void majorMismatchMessageIsActionable() {
        String msg = DestVersionGuard.rejectMessage("6.7.2");
        assertTrue("要报出目标实际版本: " + msg, msg.contains("6.7.2"));
        assertTrue("要报出客户端大版本: " + msg, msg.contains("7"));
        assertTrue("要说清后果是半拷贝索引: " + msg, msg.contains("半拷贝"));
        assertTrue("要给出可操作的下一步: " + msg, msg.contains("请"));
    }

    /**
     * 未知的文本要指向<b>连通性</b>，且<b>不得</b>宣称目标是某个版本——
     * 那就是「把未知伪装成已知」。
     */
    @Test
    public void unknownMessagePointsAtConnectivityAndClaimsNoVersion() {
        String msg = DestVersionGuard.rejectMessage(null);
        assertTrue("要指向连通性排查: " + msg, msg.contains("连通性"));
        assertTrue("要说明这不是已知不兼容: " + msg, msg.contains("无法确认"));
        assertFalse("未知文案不得宣称目标是 6.x: " + msg, msg.contains("6.x"));
        assertFalse("未知文案不得断言大版本不匹配: " + msg, msg.contains("大版本 "));
    }

    /** 版本号存在但不可解析：仍是未知，且要把拿到的原始串回显出来供排查。 */
    @Test
    public void unparsableVersionEchoesRawValueAndStaysUnknown() {
        String msg = DestVersionGuard.rejectMessage("garbage-version");
        assertEquals(DestVersionGuard.Verdict.REJECT_UNKNOWN, DestVersionGuard.verdict("garbage-version"));
        assertTrue("要回显拿到的原始版本串: " + msg, msg.contains("garbage-version"));
    }

    /**
     * 客户端 major 必须与实际编译进来的 RHLC 一致。
     * <p><b>边界说明</b>：{@code CLIENT_MAJOR} 是 {@code static final int} 常量，Java 8 编译期内联，
     * 本测试<b>无法</b>断言它与 pom 里的 RHLC 版本自动同步——升级 RHLC 到 8.x 时改 pom 不会让本条变红。
     * 这是本语言下的真实边界，如实标注：本条只钉住「当前值是 7」，
     * 使其在有人<b>手改</b>该常量时变红，不承担版本漂移的看守。</p>
     */
    @Test
    public void clientMajorMatchesCompiledRhlcMajor() {
        assertEquals(7, DestVersionGuard.CLIENT_MAJOR);
    }
}
