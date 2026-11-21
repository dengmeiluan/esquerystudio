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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * ES 服务端版本能力矩阵（版本感知架构的唯一判定入口。
 *
 * <p>连接档案在探活/测试连接时记录服务端 {@code version.number}（如 {@code 6.8.23} /
 * {@code 7.10.1} / {@code 8.17.0}），数据面需要按版本分叉的请求（mapping type、
 * hits.total 形态、data streams 等）一律经本类判定，<b>禁止散落 if (version...)</b>——
 * 未来适配 8.x/9.x（阿里云基线 8.15/8.17/9.4）只需在此扩充判定，不动调用方。</p>
 *
 * <p><b>-67：版本未知不再冒充 7.x。</b> 此处原有一句
 * 「版本未知时所有判定按 7.x 默认——探活一轮后自动精确」，<b>那句话对宿主集群从来不成立</b>：
 * {@code ConnStore.updateVersion} 的两个调用点（{@code ConnHealthProber} /
 * {@code EsClusterConnController}）都以 connId 为前提，而宿主没有连接档案，
 * {@code EsClientRouter.currentEsVersion()} 对宿主恒返回 null——<b>宿主根本不存在「探活一轮」</b>。
 * 于是宿主永远被当成 7.x，{@code EsIndexAdmin.createIndexLegacy6} 那条正确路径<b>对宿主永远不可达</b>
 * （产线宿主 6.7.2 上 adhoc 重建构造性不可用）。那句 javadoc 让缺陷长期隐形，已删除。
 * 宿主版本现由 {@code HostEsVersionProvider} 主动探测（{@code GET /} 的 {@code version.number}）。</p>
 *
 * <p><b>「未知」的表示法——本类最重要的约定</b>：未知<b>不可</b>被表示成任何 major 数字。
 * 任何数字（7 也好 6 也好）都同时是某个真实集群的合法答案，一旦拿它兼表「未知」，
 * <b>断言就再也分不清「没探到」和「真的是这个版本」</b>。因此未知有独立取值
 * {@link MappingTypeMode#UNKNOWN}——真实集群<b>永远产不出</b>它，于是它可以被断言。
 * 需要按 mapping type 分叉时一律用 {@link #mappingTypeMode(String)}，
 * <b>不要</b>写 {@code major(v) <= 6} 自己判。</p>
 *
 * @author aicoding
 */
public final class EsVersionCaps {

    private static final Logger LOG = LoggerFactory.getLogger(EsVersionCaps.class);

    /**
     * mapping type 形态——三态，<b>「未知」不与任何版本同形</b>。
     *
     * <p>{@link #UNKNOWN} 时<b>不猜版本</b>：改用 6.x 与 7.x/8.x <b>都合法</b>的请求形态
     * （如 {@code PUT /{index}/_doc/{id}?op_type=create}，6.7.2 实测 201、重复 409，CAS 语义完好），
     * 把「未知」从一个需要决策的分支变成一个<b>不需要决策</b>的分支。</p>
     */
    public enum MappingTypeMode {
        /** 6.x 及以下：mappings 必须带 type 名包一层，文档子路由必须 typed。 */
        TYPED_6X,
        /** 7.x+：typeless 形态。 */
        TYPELESS_7X,
        /** 版本未探到/不可解析：<b>禁止假装知道</b>，走两边都对的形态。 */
        UNKNOWN
    }

    private EsVersionCaps() {
    }

    /**
     * 版本 → mapping type 形态：版本感知分叉的<b>唯一</b>入口。
     *
     * @param version 服务端 {@code version.number}；null/空/非法一律 {@link MappingTypeMode#UNKNOWN}
     */
    public static MappingTypeMode mappingTypeMode(String version) {
        Integer m = majorOrNull(version);
        if (m == null) {
            return MappingTypeMode.UNKNOWN;
        }
        return m <= 6 ? MappingTypeMode.TYPED_6X : MappingTypeMode.TYPELESS_7X;
    }

    /**
     * 解析 major 版本号；<b>无法确定时返回 null，绝不返回兜底数字</b>。
     * <p>这是「未知」的唯一诚实表示：调用方必须显式处理 null，无法把未知误当成某个版本。</p>
     */
    public static Integer majorOrNull(String version) {
        if (version == null || version.trim().isEmpty()) {
            return null;
        }
        String v = version.trim();
        int dot = v.indexOf('.');
        String majorStr = dot > 0 ? v.substring(0, dot) : v;
        try {
            int m = Integer.parseInt(majorStr.trim());
            return m > 0 ? Integer.valueOf(m) : null;
        } catch (NumberFormatException e) {
            // 解析失败静默降为「未知」此前零痕——debug 留痕，null 返回契约不变
            LOG.debug("[EsVersionCaps] major 解析失败按未知处理：input={}", version);
            return null;
        }
    }

    /** 解析 minor 版本号；null/非法返回 0。 */
    public static int minor(String version) {
        if (version == null) {
            return 0;
        }
        String[] parts = version.trim().split("\\.");
        if (parts.length < 2) {
            return 0;
        }
        try {
            return Integer.parseInt(parts[1].trim());
        } catch (NumberFormatException e) {
            // 同 majorOrNull——debug 留痕，0 兜底语义零变
            LOG.debug("[EsVersionCaps] minor 解析失败按 0 处理：input={}", version);
            return 0;
        }
    }

    /**
     * 6.x：建索引 mappings 必须带 type 名包一层（{@code {"mappings":{"_doc":{...}}}}）。
     *
     * <p><b>版本未知返回 false</b>——但调用方<b>不应</b>据此认为「就是 7.x」。未知语义请用
     * {@link #mappingTypeMode(String)} 区分：本方法只回答「是否<i>确定</i>需要 type 包层」，
     * 未知时应走两边都对的形态而非 typeless 形态。保留本方法是为了既有 8 处调用点的兼容。</p>
     */
    public static boolean requiresMappingType(String version) {
        return mappingTypeMode(version) == MappingTypeMode.TYPED_6X;
    }

    /**
     * 7.x+：search 响应 {@code hits.total} 是对象 {@code {value,relation}}；6.x 是数字。
     * <p>版本未知返回 false：解析侧对「数字形态」的兜底是宽松的（对象形态也能识别），
     * 按数字假设失败的代价小于反向。</p>
     */
    public static boolean hitsTotalIsObject(String version) {
        Integer m = majorOrNull(version);
        return m != null && m >= 7;
    }

    /** 7.9+：支持 data streams。版本未知返回 false（不确定则不启用新特性）。 */
    public static boolean supportsDataStreams(String version) {
        Integer m = majorOrNull(version);
        if (m == null) {
            return false;
        }
        return m > 7 || (m == 7 && minor(version) >= 9);
    }

    /** 7.8+：支持 composable index template（{@code _index_template}）。版本未知返回 false。 */
    public static boolean supportsComposableTemplate(String version) {
        Integer m = majorOrNull(version);
        if (m == null) {
            return false;
        }
        return m > 7 || (m == 7 && minor(version) >= 8);
    }

    /** 8.0+：kNN / dense_vector 检索能力世代（阿里云向量场景首推 8.17）。版本未知返回 false。 */
    public static boolean supportsKnnSearch(String version) {
        Integer m = majorOrNull(version);
        return m != null && m >= 8;
    }
}
