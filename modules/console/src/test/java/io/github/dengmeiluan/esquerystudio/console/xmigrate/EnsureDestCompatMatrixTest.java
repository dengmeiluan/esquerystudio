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

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.apache.http.HttpHost;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * ensureDestIndex 的兼容矩阵预剔除（COPY_FROM_SOURCE/REBUILD 路径，applyCompatMatrix）：
 * 按目标（宿主）snapshot 跑 CompatMatrix——跨厂商私有 settings 剔除、目标缺失插件的分析
 * 组件级联剔除与字段分词引用降级；宿主探测失败降级为原样返回（不阻断建索引）。
 * 路径表桩（performLowLevel 覆写），不触真实集群。
 */
public class EnsureDestCompatMatrixTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 路径表桩：宿主探测（/ 、/_nodes/plugins、/_cluster/health）经 performLowLevel 覆写回放。 */
    private static class ScriptedService extends CrossClusterMigrateService {
        final Map<String, String> responses = new LinkedHashMap<>();

        ScriptedService() {
            super(() -> new RestHighLevelClient(RestClient.builder(new HttpHost("127.0.0.1", 1))) {
            }, new EsIndexAdmin(null) {
                @Override
                public boolean indexExists(String index) {
                    return false;
                }
            }, null, null, null, null, null, null, null);
        }

        @Override
        Map<String, Object> performLowLevel(RestClient ll, Request req) {
            String raw = responses.get(req.getEndpoint());
            if (raw == null) {
                throw new IllegalStateException("桩缺少响应: " + req.getEndpoint());
            }
            try {
                return MAPPER.readValue(raw, Map.class);
            } catch (Exception e) {
                throw new IllegalStateException("桩响应不是合法 JSON: " + req.getEndpoint(), e);
            }
        }
    }

    private static void hostIsOssNoPlugins(ScriptedService svc) {
        svc.responses.put("/", "{\"version\":{\"number\":\"7.17.9\",\"distribution\":\"default\"}}");
        /* 空插件清单（nodes 存在但无插件）：pluginsReliable=true，ik/apack 组件按目标缺失处理 */
        svc.responses.put("/_nodes/plugins", "{\"nodes\":{\"n1\":{}}}");
        svc.responses.put("/_cluster/health",
                "{\"number_of_nodes\":3,\"number_of_data_nodes\":3}");
    }

    /** 跨厂商私有 settings：源 apack 键（阿里云）在 OSS 目标上被预剔除，其余 settings 保留。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 跨厂商私有settings预剔除() throws Exception {
        ScriptedService svc = new ScriptedService();
        hostIsOssNoPlugins(svc);
        String settings = "{\"index\":{\"number_of_shards\":\"5\",\"number_of_replicas\":\"1\","
                + "\"apack.knn\":\"true\",\"analysis\":{\"analyzer\":{\"cn\":{\"type\":\"custom\","
                + "\"tokenizer\":\"standard\"}}}}}";
        String mapping = "{\"properties\":{\"title\":{\"type\":\"text\",\"analyzer\":\"cn\"}}}";

        String[] out = svc.applyCompatMatrix("orders-v2", "orders", settings, mapping);
        Map<String, Object> adapted = (Map<String, Object>) MAPPER.readValue(out[0], Map.class)
                .get("index");
        assertFalse("阿里云 apack 私有键按目标厂商剔除", adapted.containsKey("apack.knn"));
        assertEquals("可迁移键保留", "5", adapted.get("number_of_shards"));
        assertTrue("无插件依赖的自定义 analyzer 保留", adapted.containsKey("analysis"));
    }

    /** 目标缺失插件的分析组件：ik_max_word 字段引用降级为回退分词器（字段保留）。 */
    @Test
    public void 目标缺失插件组件降级() throws Exception {
        ScriptedService svc = new ScriptedService();
        hostIsOssNoPlugins(svc);
        String settings = "{\"index\":{\"number_of_shards\":\"1\"}}";
        String mapping = "{\"properties\":{\"title\":{\"type\":\"text\",\"analyzer\":\"ik_max_word\"}}}";

        String[] out = svc.applyCompatMatrix("orders-v2", "orders", settings, mapping);
        Map<String, Object> mappings = MAPPER.readValue(out[1], Map.class);
        Map<String, Object> title = (Map<String, Object>) mappings.get("properties");
        title = (Map<String, Object>) title.get("title");
        assertEquals("ik_max_word 降级为 standard（目标无 analysis-ik 插件）",
                "standard", title.get("analyzer"));
    }

    /** 宿主探测失败（路径表无响应）：矩阵按未知目标运行或整体降级，均不阻断——
     *  无可剔内容时建索引输入语义不变（每键原样保留）。 */
    @Test
    @SuppressWarnings("unchecked")
    public void 探测失败不阻断() throws Exception {
        ScriptedService svc = new ScriptedService();
        String settings = "{\"index\":{\"number_of_shards\":\"5\"}}";
        String mapping = "{\"properties\":{\"title\":{\"type\":\"keyword\"}}}";

        String[] out = svc.applyCompatMatrix("orders-v2", "orders", settings, mapping);
        Map<String, Object> adaptedSettings = (Map<String, Object>) MAPPER.readValue(out[0], Map.class)
                .get("index");
        assertEquals("number_of_shards 原样保留", "5", adaptedSettings.get("number_of_shards"));
        Map<String, Object> mappings = MAPPER.readValue(out[1], Map.class);
        Map<String, Object> title = (Map<String, Object>) mappings.get("properties");
        title = (Map<String, Object>) title.get("title");
        assertEquals("无插件依赖的字段不受影响", "keyword", title.get("type"));
    }
}
