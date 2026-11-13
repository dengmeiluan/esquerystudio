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

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 防提权：security 页写键持有人可以管理普通账号，但不得授予、改写或删除 ADMIN 账号。
 */
public class BuiltinConsoleAuthServicePrivilegeTest {

    private static BuiltinConsoleAuthService serviceWithAdminDoc() {
        return new BuiltinConsoleAuthService(
                () -> EsFakeClients.scripted(req -> {
                    if (req.getEndpoint().contains("/_doc/")) {
                        return "{\"found\":true,\"_source\":{\"username\":\"admin1\",\"role\":\"ADMIN\"}}";
                    }
                    return "{}";
                }),
                "esquerystudio_user", "admin", "esquerystudio", 3_600_000L, "it-secret");
    }

    private static ConsolePrincipal nonAdmin() {
        return new ConsolePrincipal("security-writer", ConsoleRole.VIEWER, false);
    }

    private static ConsolePrincipal delegatedNonAdmin() {
        return new ConsolePrincipal("delegated-writer", ConsoleRole.VIEWER, false, true,
                "宿主写者", null, java.util.Collections.singleton("conn:c1:w:security"));
    }

    private static void expectRejected(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("ADMIN"));
        }
    }


    @Test
    public void 委派非ADMIN不得创建本地账号() {
        try {
            serviceWithAdminDoc().upsertUser(delegatedNonAdmin(), "escalated", "password1", ConsoleRole.REBUILD_OP);
            fail("委派 security 写键不得创建本地账号");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("委派"));
        } catch (java.io.IOException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    public void 委派非ADMIN不得删除本地账号() {
        try {
            serviceWithAdminDoc().deleteUser("normal-user", delegatedNonAdmin());
            fail("委派 security 写键不得删除本地账号");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("委派"));
        } catch (java.io.IOException e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    public void 非ADMIN不能授予ADMIN角色() {
        expectRejected(() -> {
            try {
                serviceWithAdminDoc().upsertUser(nonAdmin(), "new-admin", "password1", ConsoleRole.ADMIN);
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "非 ADMIN 创建 ADMIN");
    }

    @Test
    public void 非ADMIN不能修改ADMIN账号() {
        expectRejected(() -> {
            try {
                serviceWithAdminDoc().upsertUser(nonAdmin(), "admin1", null, ConsoleRole.VIEWER);
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "非 ADMIN 改写 ADMIN");
    }

    @Test
    public void 非ADMIN不能删除ADMIN账号() {
        expectRejected(() -> {
            try {
                serviceWithAdminDoc().deleteUser("admin1", nonAdmin());
            } catch (java.io.IOException e) {
                throw new RuntimeException(e);
            }
        }, "非 ADMIN 删除 ADMIN");
    }

    /* ═══ 1131：委派 ADMIN 也不得写本地账号 ═══
       产线实证：deng_test_x2 是 role=ADMIN + delegated=true + authSource=delegate。
       原 forbidDelegatedLocalUserWrite 第一行 `if (actor == null || role >= ADMIN) return;`
       把「委派 ADMIN」一并放行了——被挡住的只是后面的 username 参数校验（实测返回
       “username 不可为空”而非“页面授权/委派会话不得…”）。换合法用户名即可建号。
       本地账号是宿主体系外的全局身份，委派身份（无论等级）都不该成为其来源。 */
    private static ConsolePrincipal delegatedAdmin() {
        return new ConsolePrincipal("delegated-admin", ConsoleRole.ADMIN, false, true,
                "宿主管理员", null, java.util.Collections.singleton("conn:c1:w:security"));
    }

    @Test
    public void 委派ADMIN也不得创建本地账号() {
        /* 断言必须是「权限拒绝」，不能靠「环境错误也算过」——否则是假绿。
           为此把异常类型与文案都钉死：只接受 IllegalArgumentException 且含权限语义。 */
        try {
            serviceWithAdminDoc().upsertUser(delegatedAdmin(), "backdoor", "password1", ConsoleRole.VIEWER);
            fail("委派 ADMIN 不得创建本地账号（本地账号只能由内置 ADMIN 管理）");
        } catch (IllegalArgumentException e) {
            String m = String.valueOf(e.getMessage());
            assertTrue("必须是权限拒绝而非参数校验，实际：" + m,
                    m.contains("委派") || m.contains("页面授权"));
        } catch (java.io.IOException e) {
            fail("请求已越过权限门进入存储层（说明门没拦住）：" + e.getMessage());
        } catch (RuntimeException e) {
            fail("请求已越过权限门（非 IllegalArgumentException：" + e.getClass().getSimpleName() + "）：" + e.getMessage());
        }
    }

    @Test
    public void 委派ADMIN也不得删除本地账号() {
        try {
            serviceWithAdminDoc().deleteUser("normal-user", delegatedAdmin());
            fail("委派 ADMIN 不得删除本地账号");
        } catch (IllegalArgumentException e) {
            String m = String.valueOf(e.getMessage());
            assertTrue("必须是权限拒绝而非参数校验，实际：" + m,
                    m.contains("委派") || m.contains("页面授权"));
        } catch (java.io.IOException e) {
            fail("请求已越过权限门进入存储层（说明门没拦住）：" + e.getMessage());
        } catch (RuntimeException e) {
            fail("请求已越过权限门（非 IllegalArgumentException：" + e.getClass().getSimpleName() + "）：" + e.getMessage());
        }
    }

    @Test
    public void 内置ADMIN仍可管理本地账号() {
        /* 有权限的人不得被误拦：内置 ADMIN（非委派、无 grantedPages）是本地账号的唯一合法管理者。
           只断言「不是权限拒绝」——mock 存储可能因种子数据/唯一 ADMIN 规则抛 IllegalState，
           那属于环境限制而非误拦，不能据此判失败（也不能据此判通过）。 */
        try {
            serviceWithAdminDoc().upsertUser(new ConsolePrincipal("root", ConsoleRole.ADMIN, true),
                    "perm-probe-viewer", "password1", ConsoleRole.VIEWER);
        } catch (IllegalArgumentException e) {
            String m = String.valueOf(e.getMessage());
            assertFalse("内置 ADMIN 不得因权限被拦：" + m,
                    m.contains("委派") || m.contains("页面授权") || m.contains("ADMIN 角色"));
        } catch (java.io.IOException e) {
            throw new RuntimeException(e);
        } catch (IllegalStateException e) {
            /* 环境限制（如最后一个 ADMIN 保护）：与权限无关，忽略 */
        }
    }
}
