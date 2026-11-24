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

package io.github.dengmeiluan.esquerystudio.console.auth;

import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 *  值建议收口：AuditFacetsStore——buildFacetsBody 三 terms（by_action/by_conn/by_user）
 * + must_not 排除 metrics/alert 同族混居 doc；facets() 解析 by_user 桶进 users 键
 * （ 只加了请求体没加解析的半成品在此补完）；失败回空仍带 users 键（前端契约恒全）。
 */
public class AuditFacetsStoreTest {

    private static final String PREFIX = "esquerystudio_ops_audit";

    @Test
    public void buildFacetsBody_四terms含byUserByUri_mustNot排除混居() {
        String body = AuditFacetsStore.buildFacetsBody();
        assertTrue(body.contains("\"by_action\":{\"terms\":{\"field\":\"action\",\"size\":20}}"));
        assertTrue(body.contains("\"by_conn\":{\"terms\":{\"field\":\"connName\",\"size\":20}}"));
        assertTrue("username 维度值建议聚合",
                body.contains("\"by_user\":{\"terms\":{\"field\":\"username\",\"size\":20}}"));
        assertTrue("uri 维度值建议聚合（真实 Top URI 供前缀筛选兜建议）",
                body.contains("\"by_uri\":{\"terms\":{\"field\":\"uri\",\"size\":20}}"));
        assertTrue("must_not 排除指标/告警 doc（计数只算探活流水）",
                body.contains("{\"term\":{\"kind\":\"metrics\"}}"));
        assertTrue(body.contains("{\"term\":{\"kind\":\"alert\"}}"));
    }

    /** 端到端：by_user/by_uri 桶解析进 users/uris 键（ 半成品补完——此前响应缺 users 字段）。 */
    @Test
    public void facets_byUserByUri桶进对应键() throws Exception {
        RestHighLevelClient client = EsFakeClients.scripted(req -> "{\"aggregations\":{"
                + "\"by_action\":{\"buckets\":[{\"key\":\"LOGIN\",\"doc_count\":9}]},"
                + "\"by_conn\":{\"buckets\":[{\"key\":\"腾讯云QA\",\"doc_count\":7}]},"
                + "\"by_user\":{\"buckets\":[{\"key\":\"test-user-1\",\"doc_count\":5},"
                + "{\"key\":\"viewer_test\",\"doc_count\":2}]},"
                + "\"by_uri\":{\"buckets\":[{\"key\":\"/index/_search\",\"doc_count\":11},"
                + "{\"key\":\"/auth/login\",\"doc_count\":4}]}}}");
        AuditFacetsStore store = new AuditFacetsStore(() -> client, PREFIX);
        Map<String, Object> out = store.facets();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> users = (List<Map<String, Object>>) out.get("users");
        assertEquals("users 键在响应契约内", 2, users.size());
        assertEquals("test-user-1", users.get(0).get("key"));
        assertEquals(5L, users.get(0).get("count"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> uris = (List<Map<String, Object>>) out.get("uris");
        assertEquals("uris 键在响应契约内", 2, uris.size());
        assertEquals("/index/_search", uris.get(0).get("key"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> actions = (List<Map<String, Object>>) out.get("actions");
        assertEquals(1, actions.size());
    }

    /** 失败回空：actions/conns/users/uris 四键恒在（前端 ?.[x] || [] 消费，绝不 NPE/串味）。 */
    @Test
    public void facets_失败回空_四键恒在() {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            throw new RuntimeException("boom");
        });
        AuditFacetsStore store = new AuditFacetsStore(() -> client, PREFIX);
        Map<String, Object> out = store.facets();
        assertTrue(out.get("actions") instanceof List);
        assertTrue(out.get("conns") instanceof List);
        assertTrue(out.get("users") instanceof List);
        assertTrue("uris 键恒在（ 契约）", out.get("uris") instanceof List);
        assertEquals(0, ((List<?>) out.get("uris")).size());
    }
}
