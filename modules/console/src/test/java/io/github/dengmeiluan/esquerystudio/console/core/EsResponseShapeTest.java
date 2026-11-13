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

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

/**
 * -C1：ES 6.x/7.x/8.x 响应形态兼容行为守门。
 *
 * <p>锁住三段版本感知解析逻辑，防未来重构回归：
 * ① {@link EsIndexAdmin#parseHitsTotal}——hits.total 数字（6.x）与对象（7.x+）双形态归一；
 * ② {@link EsIndexAdmin#unwrapTypeLayer}——6.x mapping type 包层剥离（）；
 * ③ {@link EsIndexAdmin#legacyBulkNdjson}——6.x bulk action 行 _type 注入（）。</p>
 *
 * @author aicoding
 */
public class EsResponseShapeTest {

    private static final ObjectMapper M = new ObjectMapper();

    // ═══ ① hits.total 双形态 ═══

    @Test
    public void hitsTotal_v6Number_passthrough() {
        assertEquals(123, EsIndexAdmin.parseHitsTotal(123));
        assertEquals(0, EsIndexAdmin.parseHitsTotal(0));
    }

    @Test
    public void hitsTotal_v7Object_extractsValue() throws Exception {
        Map<String, Object> v7 = M.readValue("{\"value\":123,\"relation\":\"eq\"}", Map.class);
        assertEquals(123, EsIndexAdmin.parseHitsTotal(v7));
    }

    @Test
    public void hitsTotal_null_passthrough() {
        assertNull(EsIndexAdmin.parseHitsTotal(null));
    }

    // ═══ ② mapping type 包层剥离 ═══

    @Test
    public void unwrapTypeLayer_v6TypedMapping_unwrapped() throws Exception {
        Map<String, Object> v6 = M.readValue(
                "{\"_doc\":{\"properties\":{\"name\":{\"type\":\"keyword\"}}}}", Map.class);
        Map<String, Object> out = EsIndexAdmin.unwrapTypeLayer(v6);
        assertTrue("剥层后应直含 properties", out.containsKey("properties"));
        assertFalse(out.containsKey("_doc"));
    }

    @Test
    public void unwrapTypeLayer_v6CustomTypeName_unwrapped() throws Exception {
        // 老索引可能是自定义 type 名，不止 _doc
        Map<String, Object> v6 = M.readValue(
                "{\"bond_info\":{\"properties\":{\"code\":{\"type\":\"keyword\"}}}}", Map.class);
        assertTrue(EsIndexAdmin.unwrapTypeLayer(v6).containsKey("properties"));
    }

    @Test
    public void unwrapTypeLayer_v7TypelessMapping_untouched() throws Exception {
        Map<String, Object> v7 = M.readValue(
                "{\"properties\":{\"name\":{\"type\":\"keyword\"}}}", Map.class);
        assertSame("7.x 形态必须原样返回", v7, EsIndexAdmin.unwrapTypeLayer(v7));
    }

    @Test
    public void unwrapTypeLayer_emptyOrNull_untouched() {
        assertNull(EsIndexAdmin.unwrapTypeLayer(null));
        Map<String, Object> empty = new LinkedHashMap<>();
        assertSame(empty, EsIndexAdmin.unwrapTypeLayer(empty));
    }

    @Test
    public void unwrapTypeLayer_v6EmptyTypeBody_untouched() throws Exception {
        // 6.x 空 mapping（type 层内无 properties）：不剥层，前端按空字段处理，行为一致
        Map<String, Object> v6Empty = M.readValue("{\"_doc\":{}}", Map.class);
        assertSame(v6Empty, EsIndexAdmin.unwrapTypeLayer(v6Empty));
    }

    // ═══ ③ 6.x bulk NDJSON _type 注入 ═══

    @Test
    public void legacyBulkNdjson_injectsTypeIntoActionLine() {
        String ndjson = "{\"index\":{\"_index\":\"bond\",\"_id\":\"1\"}}\n{\"name\":\"a\"}\n";
        String out = EsIndexAdmin.legacyBulkNdjson(null, ndjson, idx -> "my_type");
        String[] lines = out.split("\n");
        assertTrue("action 行应注入 _type", lines[0].contains("\"_type\":\"my_type\""));
        assertEquals("source 行必须原样透传", "{\"name\":\"a\"}", lines[1]);
    }

    @Test
    public void legacyBulkNdjson_existingType_notOverwritten() {
        String ndjson = "{\"index\":{\"_index\":\"bond\",\"_type\":\"old_type\",\"_id\":\"1\"}}\n{\"name\":\"a\"}\n";
        String out = EsIndexAdmin.legacyBulkNdjson(null, ndjson, idx -> "new_type");
        assertTrue("已有 _type 不得覆盖", out.contains("\"_type\":\"old_type\""));
        assertFalse(out.contains("new_type"));
    }

    @Test
    public void legacyBulkNdjson_deleteHasNoSourceLine() {
        String ndjson = "{\"delete\":{\"_index\":\"bond\",\"_id\":\"1\"}}\n"
                + "{\"index\":{\"_index\":\"bond\",\"_id\":\"2\"}}\n{\"name\":\"b\"}\n";
        String out = EsIndexAdmin.legacyBulkNdjson(null, ndjson, idx -> "_doc");
        String[] lines = out.split("\n");
        assertEquals("delete 无 source 行，共 3 行", 3, lines.length);
        assertTrue(lines[0].contains("\"delete\""));
        assertTrue(lines[1].contains("\"index\""));
    }

    @Test
    public void legacyBulkNdjson_pathIndexFallback_andCache() {
        // meta 无 _index 时回退方法级 index；同索引 type 反查只调一次（缓存）
        final int[] calls = {0};
        String ndjson = "{\"index\":{\"_id\":\"1\"}}\n{\"a\":1}\n{\"index\":{\"_id\":\"2\"}}\n{\"a\":2}\n";
        String out = EsIndexAdmin.legacyBulkNdjson("bond", ndjson, idx -> {
            calls[0]++;
            return "resolved";
        });
        assertEquals("同索引 type 反查应走缓存只调一次", 1, calls[0]);
        assertTrue(out.contains("\"_type\":\"resolved\""));
    }

    @Test
    public void legacyBulkNdjson_noIndexAnywhere_fallsBackToDoc() {
        String ndjson = "{\"index\":{\"_id\":\"1\"}}\n{\"a\":1}\n";
        String out = EsIndexAdmin.legacyBulkNdjson(null, ndjson, idx -> "should_not_be_called");
        assertTrue("无索引名回退 _doc", out.contains("\"_type\":\"_doc\""));
    }

    @Test
    public void legacyBulkNdjson_unparsableLine_passthrough() {
        String ndjson = "not-json-line\n{\"index\":{\"_index\":\"bond\"}}\n{\"a\":1}\n";
        String out = EsIndexAdmin.legacyBulkNdjson(null, ndjson, idx -> "_doc");
        assertTrue("解析失败的行原样透传留给 ES 报错", out.startsWith("not-json-line\n"));
    }
}
