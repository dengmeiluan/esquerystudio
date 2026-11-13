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

import javax.servlet.http.HttpServletRequest;

/**
 * 宿主鉴权委托 SPI（宿主应用（如 宿主）注册本接口 Bean 后，
 * 控制台请求先交宿主校验自己的凭据（如 {@code X-Es-Host-Token} 里的宿主 JWT），
 * 认出则免控制台内置登录直接放行；返回 {@code null} 交回内置 token 鉴权（两套并存，互不排斥）。
 *
 * <p>返回的 {@link ConsolePrincipal} 应以 {@code delegated=true} 构造——
 * 前端据此隐藏「退出/改密」（凭据归宿主管），审计正常落控制集群。</p>
 *
 * <p>角色映射由宿主自定（建议：管理员→ADMIN、运维→OPERATOR、其余→VIEWER）。</p>
 *
 * @author aicoding
 */
public interface ConsoleAuthDelegate {

    /**
     * 用宿主自己的凭据体系解析请求身份。
     *
     * @param request 当前 HTTP 请求
     * @return 宿主认出的身份（建议 delegated=true）；认不出返回 {@code null}（交回内置鉴权，不视为失败）
     */
    ConsolePrincipal authenticate(HttpServletRequest request);

    /**
     * 登出时尝试吊销当前令牌（可选实现）。
     *
     * <p>宿主签发的令牌控制台无法真正撤销；实现方可在本实例维护短期拒绝表
     * （{@link DelegatedTokenRevocations}），至少让「已退出」的令牌在本实例立即失效。
     * 返回 false 表示该模式无可吊销的服务端会话（如 header 模式）。</p>
     *
     * @param token 当前请求携带的原始令牌（可能为 null）
     * @return 是否在本实例建立了拒绝
     */
    default boolean revoke(String token) {
        return false;
    }

    /**
     * 本请求是否携带了该委托模式的凭证。
     *
     * <p>用于区分「没带宿主凭证（可回落内置登录）」与「带了但不被接受（不得回落）」：
     * 后者若回落到浏览器里残留的旧内置 ADMIN token，会让一个已被宿主撤销的会话
     * 静默升级成更强的本地身份。默认 false = 未知，保持既有回退语义。</p>
     */
    default boolean hasCredential(javax.servlet.http.HttpServletRequest request) {
        return false;
    }

    /**
     * 本请求携带的委托令牌原文（jwt/endpoint 模式；header 模式无令牌返回 null）。
     * 登出时据此登记本地拒绝表——不能拿内置 token 顶替。
     */
    default String tokenOf(javax.servlet.http.HttpServletRequest request) {
        return null;
    }
}
