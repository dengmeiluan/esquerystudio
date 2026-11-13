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

package io.github.dengmeiluan.esquerystudio.server;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 「java -jar 即全套能力」的自动化证明：空环境（无宿主、无自举档案、无可达集群断言）
 * 起完整上下文，Setup 向导待首连、控制台资源在位、内置认证可登录。
 *
 * <p>home-dir 钉到 target 隔离真实 ~/.esquerystudio 自举档案。</p>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"esquerystudio.elasticsearch.console.home-dir=target/test-bootstrap-home",
                "esquerystudio.elasticsearch.console.sqlite-path=target/test-bootstrap-home/jobs.db"})
class ServerBootSmokeTest {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @org.springframework.beans.factory.annotation.Autowired
    private io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditStore auditStore;

    @org.junit.jupiter.api.Test
    public void sqliteAuditStoreFreshBootSearchWorks() {
        /* 全新 SQLite 档首查审计=首用建表路径——方言错配（MySQL 自增 DDL 落 SQLite）
           曾让该路径 500，审计页整页瘫；此守门锁「空环境起服即可审计」。 */
        assertTrue(auditStore.search(null, null, 10, 0, null).isEmpty(),
                "fresh sqlite audit search must answer (empty) without schema errors");
    }

    @Test
    public void bootsFullCapabilityWithoutHost() {
        // 1) 控制面活着且未绑定（NONE → Setup 向导待首连）
        ResponseEntity<String> status =
                rest.getForEntity("http://localhost:" + port + "/internal/es/index/setup/status", String.class);
        assertEquals(200, status.getStatusCodeValue(), "setup status must answer without any host");
        assertTrue(status.getBody().contains("\"bound\":false"),
                "fresh standalone must report unbound: " + status.getBody());

        // 2) 控制台入口页（starter 自带资源映射，无需宿主 web 配置）
        ResponseEntity<String> page =
                rest.getForEntity("http://localhost:" + port + "/esquerystudio.html", String.class);
        assertEquals(200, page.getStatusCodeValue(), "console entry page must be served");

        // 3) 内置认证路由在位（未登录态 401/200 均可，唯独不允许 404=装配缺失）
        ResponseEntity<String> auth =
                rest.getForEntity("http://localhost:" + port + "/internal/es/index/auth/me", String.class);
        assertNotEquals(404, auth.getStatusCodeValue(), "auth route must be mapped");

        // 3b) 权限自查端点装配在位（404=装配缺失；未登录 401 才是预期拒绝形态）
        ResponseEntity<String> perms =
                rest.getForEntity("http://localhost:" + port + "/internal/es/index/auth/permissions", String.class);
        assertNotEquals(404, perms.getStatusCodeValue(), "permissions endpoint must be wired");

        // 4) 首启体验契约：未绑定控制集群时登录必须优雅 409 引导先 Setup（不是异常栈/500）
        ResponseEntity<String> login = rest.postForEntity(
                "http://localhost:" + port + "/internal/es/index/auth/login",
                java.util.Collections.singletonMap("username", "admin"),
                String.class);
        assertEquals(409, login.getStatusCodeValue(), "login before setup must guide, not crash");
        assertTrue(login.getBody().contains("SETUP_REQUIRED"),
                "login body must carry the SETUP_REQUIRED code: " + login.getBody());

        // 5) Setup 向导本身不受认证拦截（否则首连死锁：登录要控制集群，集群要向导绑）
        ResponseEntity<String> probe = rest.postForEntity(
                "http://localhost:" + port + "/internal/es/index/setup/test",
                java.util.Collections.singletonMap("url", "http://127.0.0.1:9200"),
                String.class);
        assertEquals(200, probe.getStatusCodeValue(),
                "setup test must be reachable without auth on first boot");
    }
}
