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

import org.elasticsearch.client.EsFakeClients;
import org.junit.Test;

import java.lang.reflect.Method;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

/**
 * 1046：委托部署关闭内置登录后，存量内置 token 也必须失效。
 *
 * <p>内置 token 的 principal {@code grantedPages=null}（页面门整体关闭）。宿主撤销会话后，
 * 浏览器 localStorage 里残留的旧 token 若仍能通过 {@link DelegatingConsoleAuthorizer} 的
 * 回落校验，就成了一条绕过宿主授权的 ADMIN 旁路。</p>
 */
public class DelegatedBuiltinToken1046Test {

    private static BuiltinConsoleAuthService service(boolean loginEnabled) {
        return new BuiltinConsoleAuthService(
                () -> EsFakeClients.scripted(req -> {
                    if (req.getEndpoint().contains("/_doc/")) {
                        return "{\"found\":true,\"_source\":{\"username\":\"alice\",\"role\":\"OPERATOR\",\"epoch\":0}}";
                    }
                    return "{}";
                }),
                "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "it-secret", loginEnabled);
    }

    @Test
    public void 关闭内置登录后存量token立即失效() throws Exception {
        BuiltinConsoleAuthService enabled = service(true);
        Method issue = BuiltinConsoleAuthService.class.getDeclaredMethod(
                "issueToken", ConsolePrincipal.class, long.class, long.class);
        issue.setAccessible(true);
        String token = (String) issue.invoke(enabled,
                new ConsolePrincipal("alice", ConsoleRole.OPERATOR, false),
                System.currentTimeMillis() + 600_000L, 0L);
        assertNotNull("内置登录开启时签发的 token 应可通过校验", enabled.verifyToken(token));
        assertNull("关闭内置登录后，同一 token 不得再被接受（委托部署防残留旁路）",
                service(false).verifyToken(token));
    }
}
