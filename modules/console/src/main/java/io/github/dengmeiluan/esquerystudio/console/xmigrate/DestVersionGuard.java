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

import io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps;

/**
 * 迁移前的目标集群大版本守卫（台账 #69）。
 *
 * <p><b>被守的性质</b>：{@link SliceWorker} 写目标集群用的是 high-level
 * {@code RestHighLevelClient.bulk(...)}（{@code SliceWorker:177/196}），RHLC 7.6.2 产出的 bulk action
 * <b>不带 {@code _type}</b>，而 6.x 的 {@code _bulk} <b>要求 {@code _type}</b>。
 * {@code SliceWorker:29} 的 javadoc 把「目标同大版本」写成了假设，但<b>没有任何代码强制它</b>。</p>
 *
 * <p><b>为什么必须在起迁移前拦</b>：失败模式很差——不是启动就报错，而是<b>迁到一半 bulk 400</b>，
 * 留下半拷贝的目标索引。产线 ES 是 6.7.2 且业务索引会持续往新集群迁，撞上概率高。
 * 读侧早已跨版本处理妥当（low-level scroll / 剥 6.x 单 type 包装 / low-level {@code _count}），
 * <b>唯独写侧没有对称处理</b>——本类补上这一环。</p>
 *
 * <p><b>三态，且「未知」必须一路保持为「未知」</b>（#67 的教训延伸）：
 * {@link EsVersionCaps#majorOrNull(String)} 返回的 {@code Integer} <b>可能为 null</b>。
 * 未知<b>不许</b>在中间某层被折叠成「不同 major」再拒绝——虽然两者都拒绝，
 * 但使用者要据此采取<b>不同的行动</b>（一个是换客户端/换目标集群，一个是查连通性），
 * 所以报错文本必须不同。<b>不许把未知伪装成已知，哪怕结论恰好一样。</b></p>
 *
 * <p><b>未知为什么选「拒绝」而不是「带警告放行」</b>：{@code HostEsVersionProvider} 对探测失败
 * 采取「不硬失败、保持未知、下次重试」，那是为<b>启动期</b>设计的——一次网络抖动不该锁死应用。
 * 但迁移是<b>用户显式发起的、有半拷贝残留风险的破坏性长操作</b>，同一个「未知」在两个场景下的
 * 正确响应本就不同；把启动期的宽容照搬过来，是把设计意图当成了通用原则。
 * 且探测只是一个 {@code GET /}——探不到本身就说明目标集群此刻不健康，那就更不该起迁移。
 * 重试成本极低（重发一次迁移请求），而半拷贝索引的清理成本高。</p>
 *
 * @author aicoding
 */
public final class DestVersionGuard {

    /**
     * 本 starter 编译期绑定的 RHLC 大版本。bulk 请求形态由<b>客户端</b>决定，
     * 所以这里要的是客户端的 major，不是宿主服务端的 major。
     */
    static final int CLIENT_MAJOR = 7;

    private DestVersionGuard() {
    }

    /** 守卫判定结果三态：与 {@link EsVersionCaps.MappingTypeMode} 同构，「未知」不与任何版本同形。 */
    public enum Verdict {
        /** 目标与客户端同大版本：放行。 */
        ALLOW,
        /** 目标大版本与客户端<b>确定不同</b>：拒绝。 */
        REJECT_MAJOR_MISMATCH,
        /** 目标版本<b>探测不到</b>：拒绝，但与 {@link #REJECT_MAJOR_MISMATCH} 是<b>不同</b>的结论。 */
        REJECT_UNKNOWN
    }

    /**
     * 判定目标集群版本是否可安全承接 bulk 写入。
     *
     * @param destVersion 目标集群 {@code version.number}（如 {@code 6.7.2}）；
     *                    null/空/不可解析一律 {@link Verdict#REJECT_UNKNOWN}——<b>不回落成任何 major</b>
     */
    public static Verdict verdict(String destVersion) {
        Integer major = EsVersionCaps.majorOrNull(destVersion);
        if (major == null) {
            return Verdict.REJECT_UNKNOWN;
        }
        return major == CLIENT_MAJOR ? Verdict.ALLOW : Verdict.REJECT_MAJOR_MISMATCH;
    }

    /**
     * 拒绝时的可操作报错文本；{@link Verdict#ALLOW} 返回 null。
     *
     * <p>两种拒绝的文本<b>刻意不同</b>：使用者要据此采取不同行动。</p>
     */
    public static String rejectMessage(String destVersion) {
        switch (verdict(destVersion)) {
            case ALLOW:
                return null;
            case REJECT_MAJOR_MISMATCH:
                return "拒绝起迁移：目标集群是 " + destVersion + "（大版本 "
                        + EsVersionCaps.majorOrNull(destVersion) + "），而本应用的 ES 客户端是 "
                        + CLIENT_MAJOR + ".x。写入用的 bulk 请求形态由客户端决定，跨大版本会在搬运途中被目标集群拒绝（400），"
                        + "留下半拷贝的目标索引。请改用与目标集群同大版本的应用实例执行本次迁移，"
                        + "或把目标换成 " + CLIENT_MAJOR + ".x 集群。";
            case REJECT_UNKNOWN:
                return "拒绝起迁移：探测不到目标集群的版本"
                        + (destVersion == null || destVersion.trim().isEmpty()
                            ? "（GET / 未返回 version.number）"
                            : "（version.number=\"" + destVersion + "\" 无法解析出大版本）")
                        + "。这与「版本不匹配」是两回事——此处并非已知不兼容，而是无法确认是否兼容，"
                        + "而迁移一旦跨大版本会留下半拷贝索引，代价不对称，故不猜。"
                        + "请检查目标集群连通性（控制集群是否已绑定、网络/鉴权是否正常），确认可访问后重试本次迁移。";
            default:
                throw new IllegalStateException("unreachable");
        }
    }
}
