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

package io.github.dengmeiluan.esquerystudio.console.spi;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

/**
 * ManagedEsIndex.indexKey() 的 default 反推逻辑必须与改名前逐字等价。
 * 这是唯一有逻辑的 default 方法，改名过程中最容易被顺手"优化"坏。
 */
public class ManagedEsIndexTest {

    static class AssetBasicInfoES { }
    static class BondQuoteInfoES { }
    static class FooBar { }
    static class ES { }
    static class XES { }

    private static String keyOf(final Class<?> c) {
        return new ManagedEsIndex() {
            @Override
            public Class<?> entityClass() {
                return c;
            }
        }.indexKey();
    }

    @Test
    public void stripsEsSuffixAndLowercasesFirstChar() {
        assertEquals("assetBasicInfo", keyOf(AssetBasicInfoES.class));
        assertEquals("bondQuoteInfo", keyOf(BondQuoteInfoES.class));
    }

    @Test
    public void withoutEsSuffixJustLowercasesFirstChar() {
        assertEquals("fooBar", keyOf(FooBar.class));
    }

    /** 简名恰好是 "ES"（长度 2）时不许剥掉后缀，否则会得到空串 —— 原实现用 length() > 2 守住。 */
    @Test
    public void doesNotStripWhenSimpleNameIsExactlyEs() {
        assertEquals("eS", keyOf(ES.class));
    }

    /** 长度 3 的 "XES" 可以剥，得到 "x"。 */
    @Test
    public void stripsWhenLengthIsThree() {
        assertEquals("x", keyOf(XES.class));
    }
}
