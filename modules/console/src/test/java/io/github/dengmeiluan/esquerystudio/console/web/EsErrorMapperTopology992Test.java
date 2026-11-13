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

import java.io.IOException;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 批次 992：错误体内网拓扑脱敏——RHLC message 内嵌的完整 URL 与 ES 节点坐标
 * [host:port] 不随响应外发（VIEWER 级只读端点错误体同样可达）；root_cause 语义
 * 与裸地址诊断粒度（连接异常定位，既有契约锁）不受影响。
 */
public class EsErrorMapperTopology992Test {

    @Test
    public void URL形态脱敏() {
        String out = EsErrorMapper.sanitizeTopology(
                "method [GET], host [http://10.1.2.3:9200], URI [/x], status line [HTTP/1.1 404]");
        assertFalse("完整 URL（协议+主机+端口）不得外发", out.contains("http://10.1.2.3:9200"));
        assertFalse(out.contains("http://"));
        assertTrue("脱敏占位可读", out.contains("[redacted-host]"));
    }

    @Test
    public void 方括号节点坐标脱敏() {
        String out = EsErrorMapper.sanitizeTopology(
                "Failed to execute phase [query], shard [logs][0], node [ABC123], [10.8.0.5:9300][indices:...]");
        assertFalse("ES 节点坐标不得外发", out.contains("10.8.0.5:9300"));
        assertTrue(out.contains("[redacted-host]"));
    }

    @Test
    public void 裸地址诊断粒度保留() {
        String out = EsErrorMapper.sanitizeTopology("Connection refused: 10.0.0.9:9200");
        assertEquals("裸 IPv4:port 是连接异常诊断粒度（既有契约），原样保留",
                "Connection refused: 10.0.0.9:9200", out);
    }

    @Test
    public void describe集成脱敏且RootCause语义保留() {
        String body = "method [GET], host [http://10.1.2.3:9200], URI [/nope/_mapping], "
                + "{\"error\":{\"root_cause\":[{\"type\":\"index_not_found_exception\","
                + "\"reason\":\"no such index [nope]\"}]}}";
        String msg = EsErrorMapper.describe(new IOException(body));
        assertFalse("describe 输出不得含完整 URL", msg.contains("http://10.1.2.3:9200"));
        assertTrue("root_cause 语义保留（前端 friendlyEsError 链路）", msg.contains("index_not_found_exception"));
        assertTrue(msg.contains("no such index [nope]"));
        assertTrue("类名前缀保留", msg.startsWith("IOException: "));
    }

    @Test
    public void 无拓扑消息零误伤() {
        assertEquals("no such index [nope]", EsErrorMapper.sanitizeTopology("no such index [nope]"));
        assertEquals(null, EsErrorMapper.sanitizeTopology(null));
        assertEquals("", EsErrorMapper.sanitizeTopology(""));
        /* 索引名带方括号但非 host:port 形态不受影响 */
        String keep = "no such index [logs-2026.08]";
        assertEquals(keep, EsErrorMapper.sanitizeTopology(keep));
    }
}
