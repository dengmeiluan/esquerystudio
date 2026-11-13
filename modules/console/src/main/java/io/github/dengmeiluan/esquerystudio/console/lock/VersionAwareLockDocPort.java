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

package io.github.dengmeiluan.esquerystudio.console.lock;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsVersionCaps;
import io.github.dengmeiluan.esquerystudio.console.multicluster.HostEsVersionProvider;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * {@link LockDocPort} 的版本感知实现（-67）——<b>全仓唯一</b>被允许为锁拼 ES 请求的地方。
 *
 * <p><b>为什么全篇走低层 REST</b>：RHLC 的 {@code IndexRequest.opType(CREATE)}
 * <b>无论是否知道版本</b>都序列化成 {@code PUT /{index}/_create/{id}}——这条 typeless 路由是 7.0 才有的，
 * 6.x 会把 {@code _create} 当成 type 名，报 <b>400 invalid_type_name_exception</b>（6.7.2 实测）。
 * 客户端 API 层面无法关掉这个行为，只能绕开重命名类自己拼路径，
 * 与 {@code EsIndexAdmin} 全篇绕开 RHLC 重命名类的既有做法一致。</p>
 *
 * <p><b>三态路由（6.7.2 实测支撑）</b>：</p>
 * <ul>
 *   <li>{@link EsVersionCaps.MappingTypeMode#TYPED_6X} / {@link EsVersionCaps.MappingTypeMode#UNKNOWN}
 *       → {@code PUT /{index}/_doc/{id}?op_type=create}：6.7.2 实测 <b>201</b>，重复 <b>409</b>（CAS 完好）；
 *       该形态在 7.x/8.x 上同样合法（{@code _doc} 是 7.x 的规范 type 名，{@code op_type} 是标准查询参数）。
 *       <b>未知时因此不需要猜版本</b>——退到一个两边都对的形态。</li>
 *   <li>{@link EsVersionCaps.MappingTypeMode#TYPELESS_7X} → 同样用 {@code _doc} 形态。
 *       统一形态可减少分叉，7.x 上二者等价。</li>
 * </ul>
 *
 * @author aicoding
 */
public class VersionAwareLockDocPort implements LockDocPort {

    private static final Logger LOG = LoggerFactory.getLogger(VersionAwareLockDocPort.class);

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 6.x 与 7.x/8.x 双方都合法的 type 名。 */
    private static final String DOC_TYPE = "_doc";

    private final Supplier<RestHighLevelClient> client;
    private final HostEsVersionProvider hostVersion;

    public VersionAwareLockDocPort(Supplier<RestHighLevelClient> client, HostEsVersionProvider hostVersion) {
        this.client = client;
        this.hostVersion = hostVersion;
    }

    @Override
    public boolean indexExists(String index) throws IOException {
        // 注意：低层 RestClient 对 HEAD 的 404 <b>不抛 ResponseException</b>，而是正常返回 Response
        // （HEAD 无响应体，客户端把它当作合法结果）。实测：这里若按「抛异常=不存在」写，
        // 不存在的索引会被判成"存在"，ensureIndex 直接跳过建索引 —— 6.7.2 演练首跑即栽在这里。
        // 因此判据必须落在**状态码这个值**上，而不是"有没有抛异常"这个控制流。
        try {
            return statusOf("HEAD", "/" + index) == 200;
        } catch (ResponseException e) {
            int sc = e.getResponse().getStatusLine().getStatusCode();
            if (sc == 404) {
                return false;
            }
            throw e;
        }
    }

    @Override
    public void createIndex(String index, String propertiesJson) throws IOException {
        Map<String, Object> mappingBody = parse(propertiesJson);
        Map<String, Object> body = new LinkedHashMap<>();
        // 6.x：mappings 必须带 type 包层，否则 mapper_parsing_exception。
        // 未知：同样包 _doc——6.x 必需，7.x 上 include_type_name 缺省为 false 时会拒绝，
        // 因此未知走「先 typeless、400 再 typed 重试」，与 putMappingVersionAware 同构。
        EsVersionCaps.MappingTypeMode mode = hostVersion.mappingTypeMode();
        if (mode == EsVersionCaps.MappingTypeMode.TYPED_6X) {
            body.put("mappings", Collections.singletonMap(DOC_TYPE, mappingBody));
            perform("PUT", "/" + index, OBJECT_MAPPER.writeValueAsString(body));
            return;
        }
        body.put("mappings", mappingBody);
        try {
            perform("PUT", "/" + index, OBJECT_MAPPER.writeValueAsString(body));
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() != 400) {
                throw e;
            }
            // 版本未知且目标实为 6.x：typeless 建索引 400，用 typed 形态重试一次
            LOG.info("[LockDocPort] 建锁索引 typeless 400（宿主疑似 6.x），typed 形态重试: {}", index);
            Map<String, Object> retry = new LinkedHashMap<>();
            retry.put("mappings", Collections.singletonMap(DOC_TYPE, mappingBody));
            perform("PUT", "/" + index, OBJECT_MAPPER.writeValueAsString(retry));
        }
    }

    @Override
    public boolean createIfAbsent(String index, String id, Map<String, Object> source) throws IOException {
        // 恒用 /{index}/_doc/{id}?op_type=create：6.x 与 7.x/8.x 都合法。
        // 绝不用 RHLC 的 opType(CREATE)——那会发 /_create/{id}，6.x 上 400。
        String path = "/" + index + "/" + DOC_TYPE + "/" + enc(id) + "?op_type=create";
        try {
            perform("PUT", path, OBJECT_MAPPER.writeValueAsString(source));
            return true;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 409) {
                return false;
            }
            throw e;
        }
    }

    @Override
    public boolean replaceIfUnchanged(String index, String id, Map<String, Object> source,
                                      long seqNo, long primaryTerm) throws IOException {
        String path = "/" + index + "/" + DOC_TYPE + "/" + enc(id)
                + "?if_seq_no=" + seqNo + "&if_primary_term=" + primaryTerm;
        try {
            perform("PUT", path, OBJECT_MAPPER.writeValueAsString(source));
            return true;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 409) {
                return false;
            }
            throw e;
        }
    }

    @Override
    public LockDoc get(String index, String id) throws IOException {
        try {
            Map<String, Object> resp = parse(perform("GET", "/" + index + "/" + DOC_TYPE + "/" + enc(id), null));
            if (resp == null || !Boolean.TRUE.equals(resp.get("found"))) {
                return null;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> src = (Map<String, Object>) resp.get("_source");
            return new LockDoc(src, toLong(resp.get("_seq_no")), toLong(resp.get("_primary_term")));
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return null;
            }
            throw e;
        }
    }

    @Override
    public boolean deleteIfUnchanged(String index, String id, long seqNo, long primaryTerm) throws IOException {
        String path = "/" + index + "/" + DOC_TYPE + "/" + enc(id)
                + "?if_seq_no=" + seqNo + "&if_primary_term=" + primaryTerm;
        try {
            perform("DELETE", path, null);
            return true;
        } catch (ResponseException e) {
            int sc = e.getResponse().getStatusLine().getStatusCode();
            if (sc == 409 || sc == 404) {
                return false;
            }
            throw e;
        }
    }

    @Override
    public void deleteAny(String index, String id) throws IOException {
        try {
            perform("DELETE", "/" + index + "/" + DOC_TYPE + "/" + enc(id), null);
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() != 404) {
                throw e;
            }
        }
    }

    /**
     * 发请求并只取<b>状态码</b>（HEAD 探活用）。
     * <p>独立于 {@link #perform} 是因为 HEAD 无响应体，且低层客户端对 HEAD 的 404 不抛异常——
     * 判据必须是状态码这个值。{@code protected} 同样是单测接缝。</p>
     */
    protected int statusOf(String method, String path) throws IOException {
        Response resp = client.get().getLowLevelClient().performRequest(new Request(method, path));
        return resp.getStatusLine().getStatusCode();
    }

    /**
     * 低层 REST 执行；返回响应体文本（无实体返回 null）。
     * <p>{@code protected} 是<b>接缝</b>：单测覆写它即可把「实际发出的 method + path」
     * 捕获成可断言的<b>值</b>（见 {@code VersionAwareLockDocPortPathTest}），无需联网。</p>
     */
    protected String perform(String method, String path, String jsonBody) throws IOException {
        Request req = new Request(method, path);
        if (jsonBody != null) {
            req.setJsonEntity(jsonBody);
        }
        Response resp = client.get().getLowLevelClient().performRequest(req);
        return resp.getEntity() == null ? null : org.apache.http.util.EntityUtils.toString(resp.getEntity());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> parse(String json) throws IOException {
        return json == null ? null : OBJECT_MAPPER.readValue(json, Map.class);
    }

    private static String enc(String id) throws IOException {
        return java.net.URLEncoder.encode(id, "UTF-8");
    }

    private static long toLong(Object v) {
        return v instanceof Number ? ((Number) v).longValue() : 0L;
    }
}
