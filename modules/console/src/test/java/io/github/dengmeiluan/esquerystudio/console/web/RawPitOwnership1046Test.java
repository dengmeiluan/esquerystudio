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

package io.github.dengmeiluan.esquerystudio.console.web;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 1046：raw PIT 归属的两种旁路形态回归锚。
 *
 * <p>ES 的 {@code ?source=} 与请求体同权；关闭 PIT 的 body 又是根级 {@code {"id":...}}。
 * 只解析 {@code {"pit":{"id":...}}} 会让「借 source 续用他人 PIT」「DELETE /_pit 关他人 PIT」
 * 绕过 {@code PitOwnership}。</p>
 */
public class RawPitOwnership1046Test {

    @Test
    public void source查询参数提取为第二body() {
        String source = InternalEsIndexRebuildController.sourceFromPath(
                "/logs/_search?pretty=true&source=%7B%22pit%22%3A%7B%22id%22%3A%22p1%22%7D%7D");
        assertEquals("{\"pit\":{\"id\":\"p1\"}}", source);
        assertEquals("p1", InternalEsIndexRebuildController.pitIdFromBody(source));
    }

    @Test
    public void source缺失或重复取首值() {
        assertNull(InternalEsIndexRebuildController.sourceFromPath("/logs/_search"));
        assertNull(InternalEsIndexRebuildController.sourceFromPath("/logs/_search?source="));
        assertEquals("first", InternalEsIndexRebuildController.sourceFromPath(
                "/logs/_search?source=first&source=second"));
    }

    @Test
    public void 关闭PIT的根级id可被识别() {
        assertEquals("p-close", InternalEsIndexRebuildController.rootIdFromBody("{\"id\":\"p-close\"}"));
        assertNull(InternalEsIndexRebuildController.rootIdFromBody("{\"pit\":{\"id\":\"p-search\"}}"));
    }

    @Test
    public void PIT关闭形态判定只认DELETE和_pit() {
        assertTrue(InternalEsIndexRebuildController.isPitClose("DELETE", "/_pit"));
        assertTrue(InternalEsIndexRebuildController.isPitClose("delete", "/logs/_pit?pretty=true"));
        assertTrue(!InternalEsIndexRebuildController.isPitClose("POST", "/_pit"));
        assertTrue(!InternalEsIndexRebuildController.isPitClose("DELETE", "/_search/scroll"));
    }

    @Test
    public void SQL游标body可解析() {
        assertEquals("c1", InternalEsIndexRebuildController.sqlCursorFromBody("{\"cursor\":\"c1\"}"));
        assertNull(InternalEsIndexRebuildController.sqlCursorFromBody("{\"query\":\"SELECT 1\"}"));
        assertNull(InternalEsIndexRebuildController.sqlCursorFromBody(null));
    }
}
