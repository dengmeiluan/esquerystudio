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

import org.junit.Test;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 迁移环境变量解析只允许源连接变量，禁止借 resolve-preview 读取任意应用配置；
 * 敏感变量被用作 username 时不得回显。
 */
public class CrossClusterMigrateEnvRef973Test {

    private static CrossClusterMigrateService service(Map<String, Object> props) {
        StandardEnvironment env = new StandardEnvironment();
        env.getPropertySources().addFirst(new MapPropertySource("test", props));
        return new CrossClusterMigrateService(null, null, null, null, null, null, null, env, null);
    }

    private static RemoteClusterConn conn() {
        return new RemoteClusterConn();
    }

    @Test
    public void 允许源连接变量引用() {
        Map<String, Object> props = new HashMap<>();
        props.put("SOURCE_ES_HOST", "https://source.internal");
        props.put("SOURCE_ES_PORT", "9201");
        props.put("SOURCE_ES_USER", "ops");
        RemoteClusterConn c = conn();
        c.setHostRef("SOURCE_ES_HOST");
        c.setPortRef("SOURCE_ES_PORT");
        c.setUserRef("SOURCE_ES_USER");
        Map<String, Object> out = service(props).resolvePreview(c);
        assertEquals("https://source.internal", out.get("host"));
        assertEquals(9201, out.get("port"));
        assertEquals("ops", out.get("username"));
    }

    @Test
    public void 任意Spring配置引用被拒绝() {
        RemoteClusterConn c = conn();
        c.setUserRef("spring.datasource.password");
        try {
            service(new HashMap<String, Object>()).resolvePreview(c);
            fail("任意 Spring 配置引用必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("不允许"));
        }
    }

    @Test
    public void 字面占位符同样只允许源连接变量() {
        RemoteClusterConn c = conn();
        c.setUsername("${spring.datasource.password}");
        try {
            service(new HashMap<String, Object>()).resolvePreview(c);
            fail("任意 Spring 占位符必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("不允许"));
        }
    }

    @Test
    public void 敏感变量作为username时不回显() {
        Map<String, Object> props = new HashMap<>();
        props.put("SOURCE_ES_PASSWORD", "p@ssw0rd");
        RemoteClusterConn c = conn();
        c.setUserRef("SOURCE_ES_PASSWORD");
        Map<String, Object> out = service(props).resolvePreview(c);
        assertNull("敏感变量不得作为 username 回显", out.get("username"));
        assertTrue(((List<?>) out.get("unresolved")).contains("username"));
    }

    @Test
    public void 控制台鉴权秘密引用被拒绝() {
        Map<String, Object> props = new HashMap<>();
        props.put("esquerystudio.elasticsearch.console.auth.token-secret", "hmac-secret");
        RemoteClusterConn c = conn();
        c.setHostRef("esquerystudio.elasticsearch.console.auth.token-secret");
        try {
            service(props).resolvePreview(c);
            fail("控制台 token secret 引用必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("不允许"));
        }
    }

    @Test
    public void 字面量控制台秘密占位符同样拒绝() {
        RemoteClusterConn c = conn();
        c.setHost("${esquerystudio.elasticsearch.console.auth.fallback-password}");
        try {
            service(new HashMap<String, Object>()).resolvePreview(c);
            fail("控制台兜底密码占位符必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("不允许"));
        }
    }

    @Test
    public void 敏感变量作为host时不回显() {
        Map<String, Object> props = new HashMap<>();
        props.put("SOURCE_ES_PASSWORD", "secret-host-value");
        RemoteClusterConn c = conn();
        c.setHostRef("SOURCE_ES_PASSWORD");
        Map<String, Object> out = service(props).resolvePreview(c);
        assertNull("敏感变量不得作为 host 回显", out.get("host"));
        assertTrue(((List<?>) out.get("unresolved")).contains("host"));
    }

    @Test
    public void portRef解析失败不回声原值() {
        Map<String, Object> props = new HashMap<>();
        props.put("SOURCE_ES_PORT", "p@ssw0rd");
        RemoteClusterConn c = conn();
        c.setPortRef("SOURCE_ES_PORT");
        try {
            service(props).resolvePreview(c);
            fail("非数字端口必须拒绝");
        } catch (IllegalArgumentException e) {
            assertTrue("报错文本不得包含原值", !e.getMessage().contains("p@ssw0rd"));
        }
    }
}
