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

package io.github.dengmeiluan.esquerystudio.console.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

/**
 * 批次 1002：PIT keep-alive 资源面加固的算术锚。
 *
 * <p>只读身份可以合法用 PIT 做深度分页，但不能用 {@code 999d} 这类超长值把搜索上下文
 * 无限期钉在目标集群（低成本 DoS）。上限换算必须对 ES 的全部时间单位成立，
 * 且无法识别的字面量要 fail-closed（返回 -1 由调用方拒绝），不能静默当成 0 放行。</p>
 */
public class PitKeepAliveClamp1002Test {

    @Test
    public void 各时间单位换算到毫秒() {
        assertEquals(300_000L, EsIndexAdmin.parseEsTimeMillis("5m"));
        assertEquals(3_600_000L, EsIndexAdmin.parseEsTimeMillis("1h"));
        assertEquals(30_000L, EsIndexAdmin.parseEsTimeMillis("30s"));
        assertEquals(500L, EsIndexAdmin.parseEsTimeMillis("500ms"));
        assertEquals(86_400_000L, EsIndexAdmin.parseEsTimeMillis("1d"));
        assertEquals(1L, EsIndexAdmin.parseEsTimeMillis("1000micros"));
        assertEquals(1L, EsIndexAdmin.parseEsTimeMillis("1000000nanos"));
        /* 大写单位（ES 本身大小写不敏感）同样可解析 */
        assertEquals(300_000L, EsIndexAdmin.parseEsTimeMillis("5M"));
        assertEquals(300_000L, EsIndexAdmin.parseEsTimeMillis(" 5m "));
    }

    @Test
    public void 非法字面量failClosed() {
        assertEquals(-1L, EsIndexAdmin.parseEsTimeMillis(null));
        assertEquals(-1L, EsIndexAdmin.parseEsTimeMillis(""));
        assertEquals(-1L, EsIndexAdmin.parseEsTimeMillis("5"));
        assertEquals(-1L, EsIndexAdmin.parseEsTimeMillis("-1m"));
        assertEquals(-1L, EsIndexAdmin.parseEsTimeMillis("abc"));
        assertEquals(-1L, EsIndexAdmin.parseEsTimeMillis("5 minutes"));
        /* 超长数字不能溢出成负数后绕过上限比较 */
        assertEquals(-1L, EsIndexAdmin.parseEsTimeMillis("99999999999999999999d"));
    }

    @Test
    public void 上限回填用整分整时字面量() {
        assertEquals("1h", EsIndexAdmin.esTimeLiteral(3_600_000L));
        assertEquals("2h", EsIndexAdmin.esTimeLiteral(7_200_000L));
        assertEquals("5m", EsIndexAdmin.esTimeLiteral(300_000L));
        assertEquals("30s", EsIndexAdmin.esTimeLiteral(30_000L));
        assertEquals("1500ms", EsIndexAdmin.esTimeLiteral(1_500L));
    }
}
