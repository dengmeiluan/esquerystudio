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

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 控制索引幂等初始化（向导绑定控制集群时把控制面三索引建出来——
 * 对标 Kibana 首次连接 ES 自建 {@code .kibana} 系统索引的行为。
 *
 * <p>幂等语义：索引已存在（{@code resource_already_exists_exception}）视为成功；
 * 重复 apply / rebind 同集群无害。lock 索引由首写自建，不在此列（job/audit 已随  阶段⑤退役）。</p>
 *
 * <p><b>-67 版本感知</b>：原实现用 {@code CreateIndexRequest.mapping(SEED_MAPPING, JSON)}，
 * RHLC 7.x 把它序列化成 typeless mappings，<b>6.x 上 400 mapper_parsing_exception</b>
 * （「Root mapping definition has unsupported parameters: [updatedAt ...]」，6.7.2 实测）
 * ——即产线 6.x 宿主上向导绑定必然失败。</p>
 *
 * <p>本类<b>不能</b>复用 {@code HostEsVersionProvider} 的缓存：绑定时传入的是<b>候选</b> client，
 * 此刻它还不是宿主（宿主可能尚未绑定或指向别处），必须就地从该 client 探版本。</p>
 *
 * @author aicoding
 */
public class ControlIndexInitializer {

    private static final Logger LOG = LoggerFactory.getLogger(ControlIndexInitializer.class);

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 极简显式 mapping：动态映射起步，仅锚定排序字段类型，控制面字段结构由首写补全。 */
    private static final String SEED_MAPPING = "{\"properties\":{\"updatedAt\":{\"type\":\"long\"}}}";

    /** 6.x 与 7.x/8.x 双方都合法的 type 名。 */
    private static final String DOC_TYPE = "_doc";

    /** ES 对「索引已存在」的 {@code error.type} 取值——幂等判据就是这个值。 */
    private static final String ALREADY_EXISTS_TYPE = "resource_already_exists_exception";

    private final ESQueryStudioElasticsearchProperties properties;

    public ControlIndexInitializer(ESQueryStudioElasticsearchProperties properties) {
        this.properties = properties;
    }

    /** 幂等确保控制面三索引存在（用户/连接档案/操作审计）。任何一个失败即抛，由绑定流程整体回滚。 */
    public void ensureAll(RestHighLevelClient client) {
        List<String> indices = Arrays.asList(
                properties.getConsole().getAuth().getUserIndexName(),
                properties.getConsole().getConnIndexName(),
                properties.getConsole().getAuth().getOpsAuditIndexName());
        // 就地探候选集群版本：绑定时它还不是宿主，拿不到 HostEsVersionProvider 的缓存
        EsVersionCaps.MappingTypeMode mode = probeMode(client);
        for (String index : indices) {
            ensure(client, index, mode);
        }
    }

    /** 候选集群的 mapping type 形态；探不到 = UNKNOWN（不假装 7.x）。 */
    private EsVersionCaps.MappingTypeMode probeMode(RestHighLevelClient client) {
        try {
            Response resp = client.getLowLevelClient().performRequest(new Request("GET", "/"));
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            Object version = root.get("version");
            String number = version instanceof Map ? String.valueOf(((Map<?, ?>) version).get("number")) : null;
            EsVersionCaps.MappingTypeMode mode = EsVersionCaps.mappingTypeMode(number);
            LOG.info("[ControlIndexInitializer] 候选控制集群版本={} mappingTypeMode={}", number, mode);
            return mode;
        } catch (Exception e) {
            LOG.warn("[ControlIndexInitializer] 候选集群版本探测失败，按「未知」处理"
                    + "（typeless 首发 + 400 后 typed 重试）: {}", e.getMessage(), e);
            return EsVersionCaps.MappingTypeMode.UNKNOWN;
        }
    }

    private void ensure(RestHighLevelClient client, String index, EsVersionCaps.MappingTypeMode mode) {
        try {
            if (mode == EsVersionCaps.MappingTypeMode.TYPED_6X) {
                createLowLevel(client, index, true);
            } else {
                try {
                    createLowLevel(client, index, false);
                } catch (ResponseException e) {
                    // 版本未知且目标实为 6.x：typeless 400 后用 typed 形态重试一次，
                    // 与 EsIndexAdmin.putMappingVersionAware 的兜底同构。
                    // 6.7.2 实测：typeless 400 时索引不会被建出来，重试无残留风险。
                    if (e.getResponse().getStatusLine().getStatusCode() != 400 || alreadyExists(e)) {
                        throw e;
                    }
                    LOG.info("[ControlIndexInitializer] typeless 建索引 400（目标疑似 6.x），typed 形态重试: {}", index);
                    createLowLevel(client, index, true);
                }
            }
            LOG.info("[ControlIndexInitializer] created control index: {}", index);
        } catch (Exception e) {
            if (alreadyExists(e)) {
                LOG.info("[ControlIndexInitializer] control index already exists (idempotent ok): {}", index);
                return;
            }
            throw new IllegalStateException("初始化控制索引失败: " + index + " - " + e.getMessage(), e);
        }
    }

    /** 低层 PUT /{index}：typed=true 时 mappings 包 {@code _doc} 层（6.x 必需）。 */
    private void createLowLevel(RestHighLevelClient client, String index, boolean typed) throws Exception {
        @SuppressWarnings("unchecked")
        Map<String, Object> seed = OBJECT_MAPPER.readValue(SEED_MAPPING, Map.class);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("mappings", typed ? Collections.singletonMap(DOC_TYPE, seed) : seed);
        Request req = new Request("PUT", "/" + index);
        req.setJsonEntity(OBJECT_MAPPER.writeValueAsString(body));
        client.getLowLevelClient().performRequest(req);
    }

    /**
     * 「索引已存在」判据——<b>落在 {@code error.type} 这个值上，不落在异常消息文本上</b>。
     *
     * <p><b>为什么不能用 {@code msg.contains("resource_already_exists_exception")}</b>：
     * {@code contains} 匹配的是<b>整个非结构化 blob 的子串</b>，而 {@code error.type}
     * 是一个<b>结构化位置上的值</b>。任何<b>提到</b>该字符串的回包都会被误判为「已存在」——
     * 例如真实 {@code error.type} 是 {@code mapper_parsing_exception}、
     * 而 reason 文本里恰好出现该串的 6.x 回包：建索引<b>真的失败了</b>，
     * 却被吞成「幂等成功」，最终<b>索引没建出来而绑定流程报成功</b>。</p>
     *
     * <p>另一侧的代价同样实在：typeless→typed 重试分支里若把「已存在」误判成「疑似 6.x」，
     * 会用 typed 重试、再拿 400，最终抛 {@code IllegalStateException} 让<b>整个绑定流程回滚</b>，
     * 幂等性从「无害」变成「失败」。</p>
     *
     * <p><b>已证伪的一个说法</b>：曾设想「响应体被客户端截断导致 message 里没有 error type」。
     * 实测 rest-client 7.6.2 的 {@code ResponseException.buildMessage}
     * <b>总是</b>把完整响应体 append 进 message（非 repeatable 实体先缓冲再回填），
     * 该失效模式在本版本构造不出来。改判据的理由是上面的<b>子串误匹配</b>，不是截断。</p>
     */
    private static boolean alreadyExists(Throwable e) {
        return ALREADY_EXISTS_TYPE.equals(errorType(e));
    }

    /**
     * 从 {@link ResponseException} 的响应体解析 {@code error.type}；解析不出返回 null。
     *
     * <p>非 ResponseException（或响应体不可读、不是 ES 的标准错误结构）一律返回 null，
     * 由调用方按「不是已存在」处理——<b>宁可多抛一个明确错误，也不要靠文本猜</b>。</p>
     */
    private static String errorType(Throwable e) {
        if (!(e instanceof ResponseException)) {
            return null;
        }
        try {
            String body = org.apache.http.util.EntityUtils.toString(
                    ((ResponseException) e).getResponse().getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            Object error = root.get("error");
            if (!(error instanceof Map)) {
                return null;
            }
            Object type = ((Map<?, ?>) error).get("type");
            return type == null ? null : String.valueOf(type);
        } catch (Exception ignored) {
            // 裁决（三态之③刻意降级维持静默）：此臂只可能因「ResponseException 响应体
            // 不可读 / 非 ES 标准错误结构」触发，返回 null → alreadyExists=false → ensure 抛
            // IllegalStateException → ensureAll 上抛 → 绑定流程整体回滚——失败链全程响亮
            // （回滚报错本身带索引名与 cause），此处再加日志只会双重告警。维持零 WARN，
            // 由 Observability552Test 契约反锁（ensureAll 失败路径全 logger 零 WARN）。
            return null;
        }
    }
}
