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

import io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps.MappingTypeMode;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * -C1 / -67：{@link EsVersionCaps} 版本能力矩阵守门——版本感知的唯一判定入口，
 * 判定翻转会让 6.x/8.x 目标集群的所有分叉路径（type 层、bulk、SQL endpoint）集体走错。
 *
 * <p><b>-67 改动说明（不是「改断言迁就实现」，而是原断言把缺陷写成了预期）</b>：
 * 本文件原有 {@code major_unknownFallsBackTo7} 与
 * {@code assertFalse("版本未知按 7.x：不得走 typed 路径", requiresMappingType(null))}，
 * 它们把「未知 == 7.x」<b>固化成了契约</b>。而这正是 #67 的根因——
 * 宿主集群永远探不到版本，于是永远被当成 7.x，6.x 宿主上 adhoc 重建构造性不可用。
 * 保留那两条断言就无法修复缺陷，故改为断言「未知有<b>独立取值</b>、不与任何版本同形」。</p>
 *
 * @author aicoding
 */
public class EsVersionCapsTest {

    @Test
    public void majorOrNull_parsesTypicalVersions() {
        assertEquals(Integer.valueOf(6), EsVersionCaps.majorOrNull("6.8.23"));
        assertEquals(Integer.valueOf(7), EsVersionCaps.majorOrNull("7.10.1"));
        assertEquals(Integer.valueOf(8), EsVersionCaps.majorOrNull("8.17.0"));
        assertEquals(Integer.valueOf(9), EsVersionCaps.majorOrNull("9.4"));
        assertEquals("产线宿主实际版本", Integer.valueOf(6), EsVersionCaps.majorOrNull("6.7.2"));
    }

    /**
     * 核心断言：<b>未知不得被表示成任何 major 数字</b>。
     *
     * <p>本仓已 7 次栽在「用一个合法值表示缺席，而那个值本身也是真实答案」上，
     * {@code DEFAULT_MAJOR = 7} 是第 6 次。只要未知能被写成数字，
     * 断言就<b>永远分不清</b>「没探到」与「真的是这个版本」。</p>
     */
    @Test
    public void majorOrNull_unknownIsNullNotAFallbackNumber() {
        assertNull("null 版本必须返回 null，不得兜底成数字", EsVersionCaps.majorOrNull(null));
        assertNull("空串必须返回 null", EsVersionCaps.majorOrNull(""));
        assertNull("非法版本串必须返回 null", EsVersionCaps.majorOrNull("abc"));
        assertNull("负数版本必须返回 null", EsVersionCaps.majorOrNull("-1.0"));
    }

    /** 三态：未知有独立取值，真实集群永远产不出它——因此它可以被断言。 */
    @Test
    public void mappingTypeMode_isTriStateAndUnknownIsDistinct() {
        assertEquals(MappingTypeMode.TYPED_6X, EsVersionCaps.mappingTypeMode("6.7.2"));
        assertEquals(MappingTypeMode.TYPED_6X, EsVersionCaps.mappingTypeMode("5.6.16"));
        assertEquals(MappingTypeMode.TYPELESS_7X, EsVersionCaps.mappingTypeMode("7.10.2"));
        assertEquals(MappingTypeMode.TYPELESS_7X, EsVersionCaps.mappingTypeMode("8.17.0"));

        // 未知既不是 TYPED_6X 也不是 TYPELESS_7X——它是第三种取值
        assertEquals(MappingTypeMode.UNKNOWN, EsVersionCaps.mappingTypeMode(null));
        assertEquals(MappingTypeMode.UNKNOWN, EsVersionCaps.mappingTypeMode(""));
        assertEquals(MappingTypeMode.UNKNOWN, EsVersionCaps.mappingTypeMode("garbage"));
    }

    /**
     * 「未知」与「真的是 7.x」<b>必须可区分</b>——这条是防第 8 次的核心看守。
     *
     * <p>证伪方式：把 {@code mappingTypeMode} 的 UNKNOWN 分支改成返回 TYPELESS_7X
     * （即恢复 DEFAULT_MAJOR=7 的旧语义），本条立刻红。</p>
     */
    @Test
    public void unknownIsDistinguishableFromRealSevenX() {
        assertFalse("未知不得与真实 7.x 同形，否则断言永远分不清「没探到」和「真的是 7.x」",
                EsVersionCaps.mappingTypeMode(null) == EsVersionCaps.mappingTypeMode("7.10.2"));
        assertFalse("未知不得与真实 6.x 同形",
                EsVersionCaps.mappingTypeMode(null) == EsVersionCaps.mappingTypeMode("6.7.2"));
    }

    @Test
    public void requiresMappingType_onlyWhenCertain6x() {
        assertTrue(EsVersionCaps.requiresMappingType("6.8.23"));
        assertTrue(EsVersionCaps.requiresMappingType("6.7.2"));
        assertFalse(EsVersionCaps.requiresMappingType("7.6.2"));
        assertFalse(EsVersionCaps.requiresMappingType("8.15.0"));
        // 未知返回 false 表示「不确定需要 type 包层」，调用方应改用 mappingTypeMode 走双兼容形态，
        // 而不是把 false 读成「就是 7.x」
        assertFalse("未知时本方法只表示「不确定」", EsVersionCaps.requiresMappingType(null));
        assertEquals("未知的语义须经三态入口读取", MappingTypeMode.UNKNOWN, EsVersionCaps.mappingTypeMode(null));
    }

    @Test
    public void hitsTotalIsObject_from7x() {
        assertFalse(EsVersionCaps.hitsTotalIsObject("6.8.23"));
        assertTrue(EsVersionCaps.hitsTotalIsObject("7.6.2"));
        assertTrue(EsVersionCaps.hitsTotalIsObject("8.17.0"));
        assertFalse("未知不启用 7.x 形态假设", EsVersionCaps.hitsTotalIsObject(null));
    }

    @Test
    public void featureGates_minorBoundaries() {
        // data streams 7.9+；composable template 7.8+；kNN 8.0+
        assertFalse(EsVersionCaps.supportsDataStreams("7.8.1"));
        assertTrue(EsVersionCaps.supportsDataStreams("7.9.0"));
        assertTrue(EsVersionCaps.supportsDataStreams("8.0.0"));
        assertFalse(EsVersionCaps.supportsComposableTemplate("7.7.0"));
        assertTrue(EsVersionCaps.supportsComposableTemplate("7.8.0"));
        assertFalse(EsVersionCaps.supportsKnnSearch("7.17.0"));
        assertTrue(EsVersionCaps.supportsKnnSearch("8.15.0"));
    }

    /** 版本未知时一律不启用新特性（不确定则保守）。 */
    @Test
    public void featureGates_unknownDisablesEverything() {
        assertFalse(EsVersionCaps.supportsDataStreams(null));
        assertFalse(EsVersionCaps.supportsComposableTemplate(null));
        assertFalse(EsVersionCaps.supportsKnnSearch(null));
    }
}
