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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link EsAdhocJobStore} 的 REST 形态往返测试：用 {@link EsFakeClients#scripted} 的
 * 不联网 client 断言<b>发出去的请求形态</b>与<b>回包解析结果</b>，不需要真 ES。
 *
 * <h3>这层测什么、不测什么</h3>
 * <p><b>测</b>：请求方法/路径/body 的形状（upsert 用带 id 的 PUT、排序键是 updated_ts）、
 * 回包 {@code _source}/{@code hits} 的解析与 rehydrate、404 → empty、以及契约红线
 * （save 失败不上抛）。这些都是<b>纯客户端侧逻辑</b>，假 client 有足额判定力。</p>
 *
 * <p><b>不测</b>：mapping 是否真让 {@code updated_ts} 可排序、6.x typed 重试是否真被 ES 接受
 * ——那要真集群，留给集成验证。另外假 client 的
 * {@code ScriptedRestClient} <b>恒回 200 状态码</b>，无法仿真「HEAD 返回 404 但不抛异常」
 * 这个真实 ES 行为，故 {@code ensureIndex} 的建索引分支在此不可达（HEAD 恒 200 →
 * 判为已存在 → 跳过建索引），本测试一律走「索引已存在」路径。</p>
 *
 * @author aicoding
 */
public class EsAdhocJobStoreTest {

    private static final String INDEX = "esquerystudio_adhoc_job";

    private AdhocRebuildJob job(String id, String status) {
        AdhocRebuildJob j = AdhocRebuildJob.minimal(id);
        j.setStatus(status);
        return j;
    }

    /** save 必须是「带文档 id 的 PUT」——这才是同 jobId 覆盖的 upsert，不是 append。 */
    @Test
    public void saveUsesPutWithDocIdSoSameJobIdOverwrites() {
        List<Request> seen = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            seen.add(req);
            return "{\"result\":\"updated\"}";
        });
        new EsAdhocJobStore(() -> client, INDEX).save(job("j1", "RUNNING"));

        Request index = seen.get(seen.size() - 1);
        assertThat(index.getMethod()).isEqualTo("PUT");
        // refresh=true 是刻意的：状态刚变就点开列表页要能看见（读己之写）。
        assertThat(index.getEndpoint()).isEqualTo("/" + INDEX + "/_doc/j1?refresh=true");
        String body = bodyOf(index);
        assertThat(body).contains("\"job_id\":\"j1\"")
                .contains("\"status_name\":\"RUNNING\"")
                .contains("\"updated_ts\":")
                .contains("\"payload_json\":");
    }

    /** 契约红线：ES 侧炸了，save 只 warn 不上抛——持久化永不反噬正在跑的 reindex。 */
    @Test
    public void saveNeverThrowsWhenEsFails() {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            throw new java.io.IOException("es down");
        });
        // 不抛即通过（ensureIndex 的 HEAD 也会炸，同样被吞）。
        new EsAdhocJobStore(() -> client, INDEX).save(job("j1", "RUNNING"));
    }

    /** find 走 GET /_doc/{id}，从 _source.payload_json 回填可查询字段。 */
    @Test
    public void findParsesSourcePayloadAndRehydratesStatus() {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod())) {
                return "{\"_index\":\"" + INDEX + "\",\"_id\":\"j1\",\"found\":true,"
                        + "\"_source\":{\"job_id\":\"j1\",\"status_name\":\"SUCCEEDED\","
                        + "\"payload_json\":\"{\\\"status\\\":\\\"SUCCEEDED\\\",\\\"stage\\\":\\\"DONE\\\"}\"}}";
            }
            return "{}";
        });
        Optional<AdhocRebuildJob> got = new EsAdhocJobStore(() -> client, INDEX).find("j1");
        assertThat(got).isPresent();
        assertThat(got.get().getJobId()).isEqualTo("j1");
        assertThat(got.get().getStatus()).isEqualTo("SUCCEEDED");
    }

    /** 文档不存在（404）返回 empty，而不是抛。 */
    @Test
    public void findReturnsEmptyOn404() {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod())) {
                throw EsFakeClients.responseException(404,
                        "{\"_index\":\"" + INDEX + "\",\"_id\":\"nope\",\"found\":false}");
            }
            return "{}";
        });
        assertThat(new EsAdhocJobStore(() -> client, INDEX).find("nope")).isEmpty();
    }

    /**
     * listRecent 必须按 {@code updated_ts} 倒序排（带 job_id 二级键消同毫秒 flaky），
     * 且按回包 hits 的<b>给定顺序</b>产出——排序由 ES 做，客户端不得重排。
     */
    @Test
    public void listRecentSortsByUpdatedTsDescAndPreservesHitOrder() {
        List<Request> seen = new ArrayList<>();
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            seen.add(req);
            if (req.getEndpoint().endsWith("/_search")) {
                return "{\"hits\":{\"total\":{\"value\":2},\"hits\":["
                        + "{\"_id\":\"b\",\"_source\":{\"job_id\":\"b\",\"updated_ts\":200,"
                        + "\"payload_json\":\"{\\\"status\\\":\\\"RUNNING\\\"}\"}},"
                        + "{\"_id\":\"a\",\"_source\":{\"job_id\":\"a\",\"updated_ts\":100,"
                        + "\"payload_json\":\"{\\\"status\\\":\\\"SUCCEEDED\\\"}\"}}]}}";
            }
            return "{}";
        });
        List<AdhocRebuildJob> out = new EsAdhocJobStore(() -> client, INDEX).listRecent(2);

        assertThat(out).extracting(AdhocRebuildJob::getJobId).containsExactly("b", "a");
        assertThat(out).extracting(AdhocRebuildJob::getStatus).containsExactly("RUNNING", "SUCCEEDED");
        Request search = seen.get(seen.size() - 1);
        assertThat(search.getMethod()).isEqualTo("POST");
        String body = bodyOf(search);
        assertThat(body).contains("\"size\":2")
                .contains("\"updated_ts\":{\"order\":\"desc\"}")
                .contains("\"job_id\":{\"order\":\"desc\"}");
    }

    /** 索引还没建出来（search 404）时列表返回空，不抛——列表页不该因为「一次都没跑过」而报错。 */
    @Test
    public void listRecentReturnsEmptyWhenIndexMissing() {
        RestHighLevelClient client = EsFakeClients.scripted(req -> {
            if (req.getEndpoint().endsWith("/_search")) {
                throw EsFakeClients.responseException(404,
                        "{\"error\":{\"type\":\"index_not_found_exception\"},\"status\":404}");
            }
            return "{}";
        });
        assertThat(new EsAdhocJobStore(() -> client, INDEX).listRecent(10)).isEmpty();
    }

    private String bodyOf(Request req) {
        try {
            return org.apache.http.util.EntityUtils.toString(req.getEntity());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
