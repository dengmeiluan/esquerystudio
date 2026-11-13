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

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.client.EsFakeClients;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.elasticsearch.client.Request;
import org.junit.Test;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 批次 1005：EsConnStore 凭据加密集成——落库密文形态、编辑留空沿用旧密码时
 * 「存储形态原样沿用」（绝不把密文再加密一次）、get() 解密还原。
 */
public class EsConnStoreCrypto1005Test {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 极简内存 ES：PUT _doc 捕获文档体，GET _doc 回放最近版本。 */
    private static final class InMemoryConnEs {
        final Map<String, String> docs = new ConcurrentHashMap<>();
        final AtomicReference<String> lastPutBody = new AtomicReference<>();

        EsFakeClients.Handler handler = req -> {
            String ep = req.getEndpoint();
            String method = req.getMethod();
            if ("PUT".equals(method) && ep.contains("/_doc/")) {
                lastPutBody.set(org.apache.http.util.EntityUtils.toString(req.getEntity()));
                docs.put(docIdOf(ep), lastPutBody.get());
                return "{}";
            }
            if ("GET".equals(method) && ep.contains("/_doc/")) {
                String body = docs.get(docIdOf(ep));
                return body == null ? "{\"found\":false}"
                        : "{\"found\":true,\"_source\":" + body + "}";
            }
            if (ep.contains("/_search")) {
                return "{\"hits\":{\"total\":{\"value\":0},\"hits\":[]}}";
            }
            return "{}";
        };

        private static String docIdOf(String endpoint) {
            String noQuery = endpoint.split("\\?")[0];
            return noQuery.substring(noQuery.lastIndexOf('/') + 1);
        }
    }

    @Test
    public void 新密码落库为密文且get还原明文() {
        InMemoryConnEs es = new InMemoryConnEs();
        EsConnStore store = new EsConnStore(
                () -> EsFakeClients.scripted(es.handler), "esquerystudio_conn", null,
                ConnCrypto.resolve(null, null));

        store.save("c1", "生产集群", "http://es.prod:9200", "elastic", "plain-pw-123", null, null, null, null);

        String stored = es.docs.get("c1");
        assertNotNull(stored);
        assertTrue("落库密码必须是密文形态", stored.contains("\"password\":\"enc:v1:"));
        assertTrue("落库体不得含明文密码", !stored.contains("plain-pw-123"));

        RemoteClusterConn conn = store.get("c1");
        assertEquals("get() 必须解密还原明文（建连用）", "plain-pw-123", conn.getPassword());
    }

    @Test
    public void 编辑留空沿用旧密码_绝不二次加密() {
        InMemoryConnEs es = new InMemoryConnEs();
        EsConnStore store = new EsConnStore(
                () -> EsFakeClients.scripted(es.handler), "esquerystudio_conn", null,
                ConnCrypto.resolve(null, null));

        store.save("c2", "集群A", "http://a:9200", "u", "first-pw", null, null, null, null);
        String firstCipher = passwordFieldOf(es.docs.get("c2"));
        assertTrue(firstCipher.startsWith("enc:v1:"));

        /* 编辑：改显示名、密码留空 = 沿用旧密码（存储形态原样） */
        store.save("c2", "集群A改名", "http://a:9200", "u", "", null, null, null, null);
        String secondCipher = passwordFieldOf(es.docs.get("c2"));
        assertEquals("沿用旧密码必须是同一密文原样（二次加密会让 get 永远解不回）",
                firstCipher, secondCipher);
        assertEquals("get() 仍解出原始明文", "first-pw", store.get("c2").getPassword());
    }

    @Test
    public void 存量明文档案透明兼容_再保存自动升级密文() {
        InMemoryConnEs es = new InMemoryConnEs();
        ConnCrypto crypto = ConnCrypto.resolve(null, null);
        EsConnStore store = new EsConnStore(
                () -> EsFakeClients.scripted(es.handler), "esquerystudio_conn", null, crypto);

        /* 预置一份存量明文档案（升级前的存量形态） */
        es.docs.put("c3", "{\"name\":\"老档案\",\"scheme\":\"http\",\"host\":\"b\",\"port\":9200,"
                + "\"username\":\"u\",\"password\":\"legacy-plain-pw\"}");
        assertEquals("存量明文读取透明兼容", "legacy-plain-pw", store.get("c3").getPassword());

        /* 任何一次再保存（密码留空=沿用）都把存量明文升级为密文？——留空沿用是「存储形态
           原样」语义：明文沿用明文（升级发生在带新密码的保存）。验证带新密码的保存： */
        store.save("c3", "老档案", "http://b:9200", "u", "new-pw", null, null, null, null);
        assertTrue("带新密码的保存必须落密文", passwordFieldOf(es.docs.get("c3")).startsWith("enc:v1:"));
        assertEquals("new-pw", store.get("c3").getPassword());
    }

    @SuppressWarnings("unchecked")
    private static String passwordFieldOf(String docJson) {
        try {
            return String.valueOf(((Map<String, Object>) MAPPER.readValue(docJson, Map.class)).get("password"));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
