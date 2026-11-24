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
import io.github.dengmeiluan.esquerystudio.platform.pages.ConsolePageCatalog;

import io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import org.junit.Test;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 批次 994：xmigrate/adhoc 审计归属头存在性校验——归属头不经过 EsTargetInterceptor
 * 校验的迁移族端点，未知 X-Es-Target 不落连接账（防伪造目标头把写操作记到他人
 * 连接名下误导法证）。Top 榜单控制面过滤与监控落库脱敏见 multicluster 包同批测试。
 */
public class AuditTargetGuard994Test {

    /* ---------------- 审计归属：xmigrate 族伪造头不落连接账 ---------------- */

    private static final class CapturingAudit implements ConsoleOpsAuditStore {
        ConsoleOpsAuditEvent last;
        @Override public void record(ConsoleOpsAuditEvent event) { this.last = event; }
        @Override public java.util.List<ConsoleOpsAuditEvent> search(String u, String a, int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    }

    private static ConsoleAuthInterceptor interceptor(CapturingAudit audit) {
        /* VIEWER 打 xmigrate/start 走拒绝路径（ROLE_DENIED 落档）——稳定触发审计事件，
           供归属断言消费。 */
        EsConsoleAuthorizer authorizer = req -> new ConsolePrincipal(
                "fs_ou_x1", ConsoleRole.VIEWER, false);
        ControlClusterResolver resolver = new ControlClusterResolver(null, null, null, null, null, "auto") {
            @Override public boolean bound() { return true; }
        };
        ConnStore stubStore = new ConnStore() {
            @Override public java.util.List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { return "3556353a".equals(id) ? "腾讯云UAT" : null; }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                    String password, String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
                throw new UnsupportedOperationException();
            }
            @Override public void delete(String id) { }
            @Override public void updateVersion(String id, String version) { }
        };
        EnvPagesResolver envPagesResolver = new EnvPagesResolver(stubStore, new io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties());
        return new ConsoleAuthInterceptor(authorizer, audit, resolver, ConsolePageCatalog.load(),
                true, envPagesResolver, stubStore);
    }

    private static javax.servlet.http.HttpServletRequest stubWrite(String uri, String targetHeader) {
        Map<String, String> headers = new HashMap<>();
        if (targetHeader != null) headers.put("X-Es-Target", targetHeader);
        java.lang.reflect.InvocationHandler h = (proxy, m, args) -> {
            switch (m.getName()) {
                case "getRequestURI": return uri;
                case "getContextPath": case "getServletPath": return "";
                case "getPathInfo": return null;
                case "getMethod": return "POST";
                case "getHeader": return headers.get(args[0]);
                case "getRemoteAddr": return "127.0.0.1";
                case "getAttribute": return null;
                case "setAttribute": return null;
                case "getQueryString": return null;
                default: throw new UnsupportedOperationException(m.getName());
            }
        };
        return (javax.servlet.http.HttpServletRequest) java.lang.reflect.Proxy.newProxyInstance(
                AuditTargetGuard994Test.class.getClassLoader(),
                new Class<?>[]{javax.servlet.http.HttpServletRequest.class}, h);
    }

    @Test
    public void xmigrate伪造未知目标头不落连接账() throws Exception {
        CapturingAudit audit = new CapturingAudit();
        ConsoleAuthInterceptor it = interceptor(audit);
        javax.servlet.http.HttpServletResponse resp = (javax.servlet.http.HttpServletResponse)
                java.lang.reflect.Proxy.newProxyInstance(getClass().getClassLoader(),
                        new Class<?>[]{javax.servlet.http.HttpServletResponse.class}, (p, m, a) -> {
                            switch (m.getName()) {
                                case "setStatus": case "setContentType": case "setCharacterEncoding": return null;
                                case "getOutputStream": return new javax.servlet.ServletOutputStream() {
                                    @Override public void write(int b) { }
                                    @Override public boolean isReady() { return true; }
                                    @Override public void setWriteListener(javax.servlet.WriteListener l) { }
                                };
                                default: throw new UnsupportedOperationException(m.getName());
                            }
                        });
        it.preHandle(stubWrite("/internal/es/xmigrate/start", "ghost-conn-id"), resp, new Object());
        assertTrue("VIEWER 打迁移写应落 ROLE_DENIED 审计", audit.last != null);
        assertNull("伪造的未知 X-Es-Target 不得落 connId（auditTarget 存在性校验）",
                audit.last.getConnId());
        assertNull(audit.last.getConnName());
    }

    @Test
    public void xmigrate已知目标头照旧落连接账() {
        /* 源码锚：connectionWorkflow 分支在 connStore 解析得到实名时保持记账（回归防过禁）。 */
        String src;
        try {
            src = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(
                    "src/main/java/io/github/dengmeiluan/esquerystudio/console/auth/ConsoleAuthInterceptor.java")),
                    java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        assertTrue("未知 id 才摘除连接归属（resolved == null && connectionWorkflow）",
                src.contains("if (resolved == null && connectionWorkflow)"));
        assertTrue("已知 id 照旧落账（connId=targetIsConn 时落）",
                src.contains(".connId(targetIsConn ? targetId.trim() : null)"));
    }
}
