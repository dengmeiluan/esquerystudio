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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.http.HttpServletRequest;

/**
 * 组合鉴权器（宿主委托先行、内置账号兜底。
 *
 * <p>宿主注册 {@link ConsoleAuthDelegate}（如 宿主 校验 X-Es-Host-Token）后，
 * 每个请求先问 delegate；返回 null（本请求不带宿主凭证）则回落内置
 * {@link BuiltinConsoleAuthService} 的 token 校验——两套身份可并存：
 * iframe 嵌入走宿主委托、独立开页走内置登录。</p>
 *
 * <p>delegate 抛异常按「未认证」降级 fallback（宿主鉴权故障不挡死内置登录），
 * 内置校验自身失败仍回 null → 拦截器 401。</p>
 *
 * @author aicoding
 */
public class DelegatingConsoleAuthorizer implements EsConsoleAuthorizer {

    private static final Logger LOG = LoggerFactory.getLogger(DelegatingConsoleAuthorizer.class);

    private final ConsoleAuthDelegate delegate;
    private final EsConsoleAuthorizer fallback;

    public DelegatingConsoleAuthorizer(ConsoleAuthDelegate delegate, EsConsoleAuthorizer fallback) {
        this.delegate = delegate;
        this.fallback = fallback;
    }

    @Override
    public ConsolePrincipal authenticate(HttpServletRequest request) {
        if (delegate != null) {
            try {
                /* 登出吊销必须对**任何**委托生效，不能只靠各实现自觉：
                   自定义委托（宿主内嵌委托）默认 revoke=false、tokenOf=null 时，
                   控制台 /auth/logout 会回 200 但令牌仍可用。只要委托报出原始令牌，
                   本实例的拒绝表就先裁决一次（PropertiesAuthDelegate 内部也查，双保险）。 */
                String delegatedToken = delegate.tokenOf(request);
                if (delegatedToken != null && !delegatedToken.isEmpty()
                        && DelegatedTokenRevocations.isRevoked(delegatedToken)) {
                    LOG.debug("[DelegatingConsoleAuthorizer] 委托令牌已在本实例登出，拒绝复用");
                    return null;
                }
                ConsolePrincipal p = delegate.authenticate(request);
                if (p != null) {
                    return p;
                }
                /* 带了宿主凭证但没被接受（过期/被撤销/宿主拒绝）：不得回落到浏览器里
                   可能残留的内置 token——否则宿主一撤销会话，iframe 反而升级成内置 ADMIN。
                   只有「本请求没带宿主凭证」才回退到内置登录（两套身份并存的既定语义）。 */
                if (carriesHostCredential(request)) {
                    LOG.debug("[DelegatingConsoleAuthorizer] 宿主凭证存在但未被接受：不回落内置登录");
                    return null;
                }
            } catch (Exception e) {
                // WARN 末参补 e——降级留痕只有 getMessage 无从定位宿主侧根因，
                // 堆栈补上；返回 fallback 契约不变
                LOG.warn("[DelegatingConsoleAuthorizer] 宿主委托鉴权异常（降级内置校验）: {}", e.getMessage(), e);
                /* 异常路径同样受「带宿主凭证不得回落」约束：宿主鉴权故障时若回落到浏览器里
                   残留的内置 ADMIN token，一次宿主 500 就能把被撤销的会话升级成本地管理员。
                   只有确认本请求没带宿主凭证才允许降级。hasCredential 自身异常时 fail-closed。 */
                if (carriesHostCredential(request)) {
                    LOG.debug("[DelegatingConsoleAuthorizer] 委托异常且请求携带宿主凭证：不回落内置登录");
                    return null;
                }
            }
        }
        return fallback == null ? null : fallback.authenticate(request);
    }

    /**
     * 本请求是否携带宿主凭证——两种信号取并：
     * ① 委托自觉实现的 {@code hasCredential}；
     * ② 委托报出的令牌原文 {@code tokenOf}（宿主内嵌形态常只实现这条）。
     *
     * <p>只看 ① 会漏掉「实现了 tokenOf、没实现 hasCredential」的自定义委托：默认 false 让
     * 异常/拒绝分支继续回落到内置 token，绕过 1007 的防升级约束。任一信号异常都按
     * 「携带」处理（fail-closed），宁可 401 也不升级身份。</p>
     */
    private boolean carriesHostCredential(HttpServletRequest request) {
        try {
            if (delegate.hasCredential(request)) return true;
        } catch (Exception e) {
            LOG.debug("[DelegatingConsoleAuthorizer] hasCredential 异常，按携带宿主凭证处理");
            return true;
        }
        try {
            String token = delegate.tokenOf(request);
            return token != null && !token.isEmpty();
        } catch (Exception e) {
            LOG.debug("[DelegatingConsoleAuthorizer] tokenOf 异常，按携带宿主凭证处理");
            return true;
        }
    }
}
