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

import com.sun.net.httpserver.HttpServer;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * 在途 reindex task 限流（throttle → ES {@code _rethrottle}）测试。
 *
 * <p><b>裁决面</b>：仅 FULL_REINDEX / CATCHUP 阶段且有 currentTaskId 时有效——其余阶段
 * 没有 bulk-by-scroll task 可调速，必须以明确文案拒绝；0 值照 start 的防误填先例拒绝。</p>
 *
 * <p><b>透传面</b>：用 JDK 内置 HttpServer 起一个本地 ES 假端点，断言真实发出的
 * HTTP 请求方法/路径/参数（{@code POST /_tasks/{taskId}/_rethrottle?requests_per_second=N}），
 * -1（恢复全速）原样透传——不依赖异常类型这类代理判别。</p>
 */
public class AdhocThrottleTest {

    private static AdhocRebuildService service(java.util.function.Supplier<RestHighLevelClient> client) {
        return new AdhocRebuildService(null, client, 600_000L);
    }

    private static AdhocRebuildJob runningJob(String jobId, String stage, String taskId) {
        AdhocRebuildJob job = AdhocRebuildJob.minimal(jobId);
        job.setStage(stage);
        job.setCurrentTaskId(taskId);
        return job;
    }

    private static void inject(AdhocRebuildService service, AdhocRebuildJob job) throws Exception {
        Field f = AdhocRebuildService.class.getDeclaredField("jobs");
        f.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, AdhocRebuildJob> jobs = (Map<String, AdhocRebuildJob>) f.get(service);
        jobs.put(job.getJobId(), job);
    }

    // ------------------------------------------------------------------ 裁决

    @Test
    public void throttle_zeroIsRejectedAsLikelyMistake() throws Exception {
        AdhocRebuildService service = service(() -> null);
        inject(service, runningJob("job-0", "CATCHUP", "node1:1"));

        Throwable thrown = catchThrowable(() -> service.throttle("job-0", 0.0));

        assertThat(thrown).as("0 在 ES 等同不限，与「未设置」不可区分，照 start 先例拒绝")
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不得为 0");
    }

    @Test
    public void throttle_outsideReindexStages_isRejected() throws Exception {
        AdhocRebuildService service = service(() -> null);
        inject(service, runningJob("job-swap", "SWITCH", "node1:2"));

        Throwable thrown = catchThrowable(() -> service.throttle("job-swap", 500.0));

        assertThat(thrown).as("非 reindex 阶段没有可调速的 task，明确报错而不是转发给 ES")
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SWITCH")
                .hasMessageContaining("FULL_REINDEX");
    }

    @Test
    public void throttle_withoutInFlightTask_isRejected() throws Exception {
        AdhocRebuildService service = service(() -> null);
        inject(service, runningJob("job-notask", "CATCHUP", null));

        Throwable thrown = catchThrowable(() -> service.throttle("job-notask", 500.0));

        assertThat(thrown).as("轮次间隙没有在途 task，提前拒绝而非让 ES 报晦涩错误")
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("在途");
    }

    @Test
    public void throttle_unknownJob_isRejected() {
        AdhocRebuildService service = service(() -> null);

        Throwable thrown = catchThrowable(() -> service.throttle("nope", 500.0));

        assertThat(thrown).isInstanceOf(IllegalArgumentException.class);
    }

    // ------------------------------------------------------------------ 透传

    /** 本地假 ES：记录收到的请求行，返回 200 + {"ok":true}。 */
    private static HttpServer fakeEs(List<String> requests) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            requests.add(ex.getRequestMethod() + " " + ex.getRequestURI().getPath()
                    + "?" + ex.getRequestURI().getQuery());
            byte[] body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream os = ex.getResponseBody()) {
                os.write(body);
            }
        });
        server.start();
        return server;
    }

    @Test
    public void throttle_forwardsRethrottleWithRequestedRate() throws Exception {
        List<String> requests = new CopyOnWriteArrayList<>();
        HttpServer es = fakeEs(requests);
        RestHighLevelClient client = new RestHighLevelClient(org.elasticsearch.client.RestClient.builder(
                new org.apache.http.HttpHost("127.0.0.1", es.getAddress().getPort(), "http")));
        try {
            AdhocRebuildService service = service(() -> client);
            inject(service, runningJob("job-r", "FULL_REINDEX", "node7:42"));

            Map<String, Object> out = service.throttle("job-r", 250.5);

            assertThat(out.get("jobId")).isEqualTo("job-r");
            assertThat(requests).as("rethrottle 必须打在 currentTaskId 上并携带速率参数")
                    .containsExactly("POST /_tasks/node7:42/_rethrottle?requests_per_second=250.5");
        } finally {
            client.close();
            es.stop(0);
        }
    }

    @Test
    public void throttle_negativeOneRestoresUnlimited_andIsForwardedVerbatim() throws Exception {
        List<String> requests = new CopyOnWriteArrayList<>();
        HttpServer es = fakeEs(requests);
        RestHighLevelClient client = new RestHighLevelClient(org.elasticsearch.client.RestClient.builder(
                new org.apache.http.HttpHost("127.0.0.1", es.getAddress().getPort(), "http")));
        try {
            AdhocRebuildService service = service(() -> client);
            inject(service, runningJob("job-u", "CATCHUP", "node7:43"));

            service.throttle("job-u", -1.0);

            assertThat(requests).as("-1（恢复全速）原样透传给 ES 的 rethrottle 端点")
                    .containsExactly("POST /_tasks/node7:43/_rethrottle?requests_per_second=-1.0");
        } finally {
            client.close();
            es.stop(0);
        }
    }

    /**
     * FINAL_CATCHUP（切换后终追）同样持有 currentTaskId 的 bulk-by-scroll task——
     * 浏览器端已按三阶段白名单实现，服务端口径对齐，不得在终追阶段拒绝调速。
     */
    @Test
    public void throttle_finalCatchupStage_isForwarded() throws Exception {
        List<String> requests = new CopyOnWriteArrayList<>();
        HttpServer es = fakeEs(requests);
        RestHighLevelClient client = new RestHighLevelClient(org.elasticsearch.client.RestClient.builder(
                new org.apache.http.HttpHost("127.0.0.1", es.getAddress().getPort(), "http")));
        try {
            AdhocRebuildService service = service(() -> client);
            inject(service, runningJob("job-fc", "FINAL_CATCHUP", "node7:44"));

            service.throttle("job-fc", 80.0);

            assertThat(requests).as("终追阶段的在途 task 同样可调速（三阶段白名单）")
                    .containsExactly("POST /_tasks/node7:44/_rethrottle?requests_per_second=80.0");
        } finally {
            client.close();
            es.stop(0);
        }
    }
}
