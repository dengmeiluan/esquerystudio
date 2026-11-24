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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

import static org.junit.Assert.*;

/**
 * 1127：同步等待的透传/SQL 不再只能「改状态词」——
 * 取消要 abort 底层 HTTP（{@code RestClient.Cancellable.cancel()} = 断连接），
 * 台账挂钩与 MCP 接线必须真的把登记口传到底。
 */
public class McpTaskHttpCancel1127Test {

    /** 只记录取消接线，不连真实 ES；三种同步长调用都必须收到非空登记口。 */
    private static class HttpCaptureAdmin extends EsIndexAdmin {
        volatile Consumer<org.elasticsearch.client.Cancellable> restSink;
        volatile Consumer<org.elasticsearch.client.Cancellable> sqlSink;
        volatile Consumer<org.elasticsearch.client.Cancellable> mergeSink;

        HttpCaptureAdmin() { super(null); }

        @Override
        public Map<String, Object> rawCancellable(String method, String path, String body, boolean guarded,
                Consumer<org.elasticsearch.client.Cancellable> onAttach) {
            restSink = onAttach;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("status", 200);
            out.put("body", "{}");
            return out;
        }

        @Override
        public Map<String, Object> sqlQuery(String body, String timeout,
                Consumer<org.elasticsearch.client.Cancellable> onAttach) {
            sqlSink = onAttach;
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("columns", java.util.Collections.emptyList());
            return out;
        }

        @Override
        public Map<String, Object> forceMerge(String index, int maxNumSegments,
                Consumer<org.elasticsearch.client.Cancellable> onAttach) {
            mergeSink = onAttach;
            return new LinkedHashMap<>();
        }
    }

    @Test
    public void cancelInvokesRegisteredHttpAbortAndLateAttachRunsImmediately() throws Exception {
        McpTaskRegistry registry = new McpTaskRegistry(5_000);
        try {
            CountDownLatch abort = new CountDownLatch(1);
            CountDownLatch attached = new CountDownLatch(1);
            McpTaskRegistry.Task task = registry.submit("owner", "es_rest", "host", "r-http-1", control -> {
                control.attachHttpCancel(abort::countDown);
                attached.countDown();
                while (!control.cancelled()) Thread.sleep(5);
                throw new McpTaskRegistry.TaskCancelled(control.cancelReason());
            });
            assertTrue("请求登记口必须先就位", attached.await(2, TimeUnit.SECONDS));
            registry.cancel(task.id, "owner", "CLIENT");
            assertTrue("取消必须触发 HTTP abort", abort.await(2, TimeUnit.SECONDS));
            assertEquals("cancelled", registry.view(task.id, "owner").get("status"));
            assertEquals("CLIENT", registry.view(task.id, "owner").get("cancelReason"));
        } finally {
            registry.shutdown();
        }
    }

    @Test
    public void cancelBeforeAttachStillAbortsAsSoonAsTheRequestIsAttached() throws Exception {
        McpTaskRegistry registry = new McpTaskRegistry(5_000);
        try {
            CountDownLatch workStarted = new CountDownLatch(1);
            AtomicBoolean releaseAttach = new AtomicBoolean(false);
            CountDownLatch abort = new CountDownLatch(1);
            McpTaskRegistry.Task task = registry.submit("owner", "es_rest", "host", "r-http-late", control -> {
                workStarted.countDown();
                /* 请求登记前取消（客户端取消撞上请求提交窗）。真实链路里这段窗口没有可中断阻塞，
                   这里用忽略中断的自旋等待模拟，确保取消只置位、不提前打断登记。 */
                while (!releaseAttach.get()) {
                    try {
                        Thread.sleep(5);
                    } catch (InterruptedException ignore) {
                        /* 取消的线程中断不结束这次提交：登记必须照常发生 */
                    }
                }
                control.attachHttpCancel(abort::countDown);
                while (!control.cancelled()) Thread.sleep(5);
                throw new McpTaskRegistry.TaskCancelled(control.cancelReason());
            });
            assertTrue(workStarted.await(2, TimeUnit.SECONDS));
            registry.cancel(task.id, "owner", "CLIENT");
            releaseAttach.set(true);
            assertTrue("取消早于登记时，attach 必须立即 abort", abort.await(2, TimeUnit.SECONDS));
            assertEquals("cancelled", registry.view(task.id, "owner").get("status"));
        } finally {
            registry.shutdown();
        }
    }

    @Test
    public void completedTaskKeepsItsResultAndNeverAbortsAfterTheFact() throws Exception {
        McpTaskRegistry registry = new McpTaskRegistry(5_000);
        try {
            AtomicBoolean aborted = new AtomicBoolean(false);
            CountDownLatch done = new CountDownLatch(1);
            McpTaskRegistry.Task task = registry.submit("owner", "es_rest", "host", "r-http-2", control -> {
                control.attachHttpCancel(() -> aborted.set(true));
                done.countDown();
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("ok", true);
                return out;
            });
            assertTrue(done.await(2, TimeUnit.SECONDS));
            registry.await(task, 2_000);
            registry.cancel(task.id, "owner", "CLIENT");
            assertEquals("completed", registry.view(task.id, "owner").get("status"));
            assertFalse("已终结的任务不得再 abort（取消不改变已发生的请求）", aborted.get());
        } finally {
            registry.shutdown();
        }
    }

    @Test
    public void mcpSyncCallsHandTheAbortSinkToRestSqlAndForceMerge() {
        HttpCaptureAdmin admin = new HttpCaptureAdmin();
        McpController controller = new McpController(admin, "secret");

        call(controller, "es_rest", args("method", "GET", "path", "/_search", "body", "{}"));
        assertNotNull("es_rest 必须把 HTTP abort 登记口交到底层", admin.restSink);

        call(controller, "es_sql", args("query", "SELECT 1"));
        assertNotNull("es_sql 必须把 HTTP abort 登记口交到底层", admin.sqlSink);

        call(controller, "es_force_merge", args("index", "orders", "maxNumSegments", 1));
        assertNotNull("es_force_merge 必须把 HTTP abort 登记口交到底层", admin.mergeSink);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> call(McpController controller, String name, Map<String, Object> arguments) {
        Map<String, Object> merged = new LinkedHashMap<>();
        String qualified = McpController.TOOL_ACTIONS.get(name);
        String tool = qualified == null ? name : qualified.substring(0, qualified.indexOf(':'));
        if (qualified != null) merged.put("action", qualified.substring(qualified.indexOf(':') + 1));
        merged.putAll(arguments);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("name", tool);
        params.put("arguments", merged);
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("jsonrpc", "2.0");
        req.put("id", "http-cancel");
        req.put("method", "tools/call");
        req.put("params", params);
        Map<String, Object> body = (Map<String, Object>) controller.rpc("Bearer secret", req).getBody();
        Map<String, Object> result = (Map<String, Object>) body.get("result");
        assertEquals("es_rest 类同步调用必须成功返回，错误: "
                + ((Map<?, ?>) ((List<?>) result.get("content")).get(0)).get("text"),
                Boolean.FALSE, result.get("isError"));
        return result;
    }

    private static Map<String, Object> args(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) out.put(String.valueOf(pairs[i]), pairs[i + 1]);
        return out;
    }
}
