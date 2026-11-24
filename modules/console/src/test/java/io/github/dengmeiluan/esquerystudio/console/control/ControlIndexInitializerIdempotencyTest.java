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

package io.github.dengmeiluan.esquerystudio.console.control;

import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * -67 I1：控制索引初始化的<b>幂等判据必须落在 {@code error.type} 这个值上</b>，
 * 不得落在异常消息文本上。
 *
 * <h3>为什么这层非测不可</h3>
 * <p>{@link ControlIndexInitializer} 是绑定流程（Setup apply / rebind）的<b>必经路径</b>，
 * 且改造前在 6.x 上<b>必然失败</b>（typeless mappings → 400 mapper_parsing_exception）。
 * 改造后走低层 REST，抛的是 {@code ResponseException} 而非 {@code ElasticsearchStatusException}，
 * 消息格式完全变了——若判据仍是 {@code msg.contains(...)}，
 * 「索引已存在」会被误判成「疑似 6.x」→ typed 重试 → 再 400 → 抛 IllegalStateException
 * <b>让整个绑定流程回滚</b>：幂等性从「无害」变成「失败」。</p>
 *
 * <p>fixture 是<b>真实形态</b>的 ES 错误回包（6.7.2 / 7.x 的 resource_already_exists_exception
 * 结构一致），不是自己编的简化 JSON。</p>
 *
 * @author aicoding
 */
public class ControlIndexInitializerIdempotencyTest {

    /** 真实形态：ES 对重复建索引的 400 回包（type 在 error.type，不在顶层）。 */
    private static final String ALREADY_EXISTS_BODY =
            "{\"error\":{\"root_cause\":[{\"type\":\"resource_already_exists_exception\","
                    + "\"reason\":\"index [esquerystudio_user/abc123] already exists\","
                    + "\"index_uuid\":\"abc123\",\"index\":\"esquerystudio_user\"}],"
                    + "\"type\":\"resource_already_exists_exception\","
                    + "\"reason\":\"index [esquerystudio_user/abc123] already exists\","
                    + "\"index_uuid\":\"abc123\",\"index\":\"esquerystudio_user\"},\"status\":400}";

    /** 真实形态：6.x 对 typeless mappings 的 400 回包。 */
    private static final String MAPPER_PARSING_BODY =
            "{\"error\":{\"root_cause\":[{\"type\":\"mapper_parsing_exception\","
                    + "\"reason\":\"Root mapping definition has unsupported parameters:  "
                    + "[properties : {updatedAt={type=long}}]\"}],"
                    + "\"type\":\"mapper_parsing_exception\","
                    + "\"reason\":\"Root mapping definition has unsupported parameters:  "
                    + "[properties : {updatedAt={type=long}}]\"},\"status\":400}";

    private static final String VERSION_7X = "{\"version\":{\"number\":\"7.10.2\"}}";
    private static final String VERSION_6X = "{\"version\":{\"number\":\"6.7.2\"}}";

    /**
     * <b>本条是 I1 的核心看守</b>：索引已存在（400 resource_already_exists_exception）
     * 必须被判为幂等成功，{@code ensureAll} <b>不得抛</b>。
     *
     * <p>证伪：把 {@code alreadyExists} 改回
     * {@code String.valueOf(e.getMessage()).contains("resource_already_exists_exception")}
     * —— 因为 {@code ResponseException.getMessage()} 在本仿真下不含响应体，本条立刻红。</p>
     */
    @Test
    public void indexAlreadyExists_isIdempotentSuccess_notFailure() throws Exception {
        List<String> puts = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod())) {
                return VERSION_7X;
            }
            puts.add(req.getEndpoint());
            throw EsFakeClients.responseException(400, ALREADY_EXISTS_BODY);
        });

        new ControlIndexInitializer(new ESQueryStudioElasticsearchProperties()).ensureAll(client);

        assertEquals("三个控制索引都应被尝试创建", 3, puts.size());
    }

    /**
     * 「已存在」<b>不得</b>触发 typed 重试：那会再拿一个 400，最终让绑定流程整体回滚。
     *
     * <p>判据落在<b>实际发出的请求形态</b>这个值上：body 里不许出现 {@code _doc} 包层。</p>
     */
    @Test
    public void alreadyExists_doesNotTriggerTypedRetry() throws Exception {
        List<String> bodies = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod())) {
                return VERSION_7X;
            }
            bodies.add(entity(req));
            throw EsFakeClients.responseException(400, ALREADY_EXISTS_BODY);
        });

        new ControlIndexInitializer(new ESQueryStudioElasticsearchProperties()).ensureAll(client);

        assertEquals("每个索引只应发一次 PUT，不得因误判而 typed 重试", 3, bodies.size());
        for (String b : bodies) {
            assertFalse("「已存在」绝不能触发 typed 重试: " + b, b.contains("\"_doc\""));
        }
    }

    /**
     * 版本未知 + 目标实为 6.x：typeless 400 {@code mapper_parsing_exception} 后
     * 必须用 typed 形态重试一次，且第二发 body 带 {@code _doc} 包层。
     *
     * <p>这条与上一条互为对照：<b>同样是 400，判据不同则行为必须不同</b>——
     * 若判据退化成「400 就重试」或「400 就当已存在」，两条必有一条红。</p>
     */
    @Test
    public void unknownVersion_typelessRejectedBy6x_retriesWithTypedLayer() throws Exception {
        List<String> bodies = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod())) {
                throw new java.io.IOException("version probe failed -> UNKNOWN");
            }
            String body = entity(req);
            bodies.add(body);
            if (!body.contains("\"_doc\"")) {
                throw EsFakeClients.responseException(400, MAPPER_PARSING_BODY);
            }
            return "{\"acknowledged\":true}";
        });

        new ControlIndexInitializer(new ESQueryStudioElasticsearchProperties()).ensureAll(client);

        assertEquals("三个索引各发两次（typeless 被拒 + typed 重试）", 6, bodies.size());
        assertFalse("首发必须是 typeless", bodies.get(0).contains("\"_doc\""));
        assertTrue("重试必须带 _doc 包层，否则 6.x 上永远建不出来",
                bodies.get(1).contains("\"mappings\":{\"_doc\":{"));
    }

    /** 探到 6.x 时首发就该是 typed，不该先撞一次 400。 */
    @Test
    public void known6x_usesTypedLayerOnFirstAttempt() throws Exception {
        List<String> bodies = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod())) {
                return VERSION_6X;
            }
            bodies.add(entity(req));
            return "{\"acknowledged\":true}";
        });

        new ControlIndexInitializer(new ESQueryStudioElasticsearchProperties()).ensureAll(client);

        assertEquals("已知 6.x 时每个索引只需一发", 3, bodies.size());
        assertTrue("已知 6.x 首发就必须带 _doc 包层",
                bodies.get(0).contains("\"mappings\":{\"_doc\":{"));
    }

    /**
     * 真正的失败（非「已存在」）<b>必须抛</b>——幂等判据不许宽到把真错误也吞掉。
     *
     * <p>没有这条，把 {@code alreadyExists} 改成恒真也能让上面几条通过。</p>
     */
    @Test
    public void genuineFailure_stillThrows() throws Exception {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod())) {
                return VERSION_6X;
            }
            throw EsFakeClients.responseException(403,
                    "{\"error\":{\"type\":\"security_exception\",\"reason\":\"action denied\"},\"status\":403}");
        });

        try {
            new ControlIndexInitializer(new ESQueryStudioElasticsearchProperties()).ensureAll(client);
            fail("非「已存在」的错误必须抛出，不得被幂等判据吞掉");
        } catch (IllegalStateException expected) {
            assertTrue("异常应指明是初始化控制索引失败: " + expected.getMessage(),
                    expected.getMessage().contains("初始化控制索引失败"));
        }
    }

    /**
     * <b>这条才是真正区分「解析 error.type」与「message.contains」的证伪点。</b>
     *
     * <p><b>先说清楚一个被证伪推翻的假设</b>：评审设想的失效机制是「响应体被客户端截断，
     * message 里就没有 error type 了」。实测 rest-client 7.6.2 的
     * {@code ResponseException.buildMessage} <b>总是把完整响应体 append 进 message</b>
     * （非 repeatable 实体也会先 BufferedHttpEntity 缓冲再回填），
     * 因此「截断」这个失效模式在本版本<b>构造不出来</b>——单纯换个正常回包，两种判据完全等价。</p>
     *
     * <p><b>但文本判据仍然是错的，错在别处</b>：{@code contains} 匹配的是
     * <b>整个非结构化 blob 的子串</b>，而 {@code error.type} 是一个<b>结构化位置上的值</b>。
     * 于是任何<b>提到</b>该字符串的回包都会被误判为「已存在」——例如 6.x 因
     * mapping 里含名为 {@code resource_already_exists_exception} 的字段而报的
     * mapper_parsing_exception：真实 error.type 是 {@code mapper_parsing_exception}，
     * 文本判据却在 reason 里撞上该串，把「建索引真失败」吞成「幂等成功」，
     * <b>索引根本没建出来而绑定流程报成功</b>。</p>
     *
     * <p>证伪：把 {@code alreadyExists} 改回
     * {@code String.valueOf(e.getMessage()).contains(ALREADY_EXISTS_TYPE)} —— 本条立刻红。</p>
     */
    @Test
    public void errorTypeIsReadFromStructure_notMatchedAsSubstringOfBlob() throws Exception {
        // 真实 error.type 是 mapper_parsing_exception；该串只出现在 reason 文本里
        String misleading = "{\"error\":{\"type\":\"mapper_parsing_exception\","
                + "\"reason\":\"failed to parse field [resource_already_exists_exception] "
                + "in type mapping\"},\"status\":400}";
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod())) {
                return VERSION_6X;
            }
            throw EsFakeClients.responseException(400, misleading);
        });

        try {
            new ControlIndexInitializer(new ESQueryStudioElasticsearchProperties()).ensureAll(client);
            fail("error.type 是 mapper_parsing_exception，必须抛；"
                    + "仅因 reason 文本里出现 resource_already_exists_exception 就判为幂等成功，"
                    + "会让索引没建出来却报绑定成功");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("初始化控制索引失败"));
        }
    }

    private static String entity(Request req) throws java.io.IOException {
        return req.getEntity() == null ? ""
                : org.apache.http.util.EntityUtils.toString(req.getEntity());
    }
}
