package io.github.dengmeiluan.example.demo;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.DelegatedTokenRevocations;
import org.junit.jupiter.api.Test;

import javax.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 参考委托的四条契约（接入方最容易漏的部分）。
 *
 * <p>这些断言同时也是文档：漏实现任何一个，控制台都会出现「登出无效」或
 * 「宿主撤销后仍能进」的静默缺口，而不是编译错误。</p>
 */
class SampleHostAuthDelegateTest {

    private static HttpServletRequest req(String header, String value) {
        return (HttpServletRequest) Proxy.newProxyInstance(
                SampleHostAuthDelegateTest.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class},
                (proxy, m, args) -> {
                    if ("getHeader".equals(m.getName())) return header.equals(args[0]) ? value : null;
                    Class<?> rt = m.getReturnType();
                    return rt == boolean.class ? false : rt == int.class ? 0 : null;
                });
    }

    private static String token(String user, String hostRole) {
        return Base64.getEncoder()
                .encodeToString((user + ":" + hostRole).getBytes(StandardCharsets.UTF_8));
    }

    private final SampleHostAuthDelegate delegate = new SampleHostAuthDelegate();

    @Test
    void 宿主角色映射到控制台角色_未命中降为只读() {
        assertEquals(ConsoleRole.ADMIN, principal("u1", "superadmin").getRole());
        assertEquals(ConsoleRole.OPERATOR, principal("u1", "ops").getRole());
        assertEquals(ConsoleRole.VIEWER, principal("u1", "viewer").getRole());
        /* 未知宿主角色不得升权 */
        assertEquals(ConsoleRole.VIEWER, principal("u1", "root-god").getRole());
    }

    @Test
    void 委托身份必须标记delegated并带页面授权() {
        ConsolePrincipal p = principal("deng_test_x1", "ops");
        assertTrue(p.isDelegated(), "宿主身份必须 delegated=true（前端据此隐藏退出/改密）");
        assertNotNull(p.getGrantedPages(), "只读/运维身份应显式下发页面集，而不是 null(全量)");
        assertTrue(p.getGrantedPages().contains("conn:host:search"));
        assertNull(principal("deng_test_x2", "superadmin").getGrantedPages(),
                "超管按角色全量，不回页面集");
    }

    @Test
    void 无凭证或坏令牌返回null_交回内置登录而不是抛异常() {
        assertNull(delegate.authenticate(req("X-Other", "v")), "没带宿主凭证：交给内置登录");
        assertNull(delegate.authenticate(req(SampleHostAuthDelegate.TOKEN_HEADER, "not-base64!!")));
        assertNull(delegate.authenticate(req(SampleHostAuthDelegate.TOKEN_HEADER,
                Base64.getEncoder().encodeToString("no-colon".getBytes(StandardCharsets.UTF_8)))));
        /* 这三条对应内核的「带凭证但未被接受 → 拒绝回落内置身份」分支 */
        assertTrue(delegate.hasCredential(req(SampleHostAuthDelegate.TOKEN_HEADER, "not-base64!!")),
                "坏令牌也是「带了宿主凭证」，必须阻断回落");
    }

    @Test
    void 登出登记拒绝表_同一令牌立即失效() {
        /* 拒绝表是包级私有（外部宿主只读），这里用「本次唯一令牌」避免测试间串扰：
           退出前不存在、退出后存在，足以证明登记生效且只影响该令牌。 */
        String t = token("logout-" + System.nanoTime(), "viewer");
        String other = token("other-" + System.nanoTime(), "viewer");
        assertFalse(DelegatedTokenRevocations.isRevoked(t), "构造前提：该令牌此前未被吊销");
        assertTrue(delegate.revoke(t));
        assertTrue(DelegatedTokenRevocations.isRevoked(t), "退出后令牌必须进本实例拒绝表");
        assertFalse(DelegatedTokenRevocations.isRevoked(other), "不得误伤其他令牌");
    }

    private ConsolePrincipal principal(String user, String hostRole) {
        ConsolePrincipal p = delegate.authenticate(
                req(SampleHostAuthDelegate.TOKEN_HEADER, token(user, hostRole)));
        assertNotNull(p, "合法演示令牌应被识别");
        return p;
    }
}
