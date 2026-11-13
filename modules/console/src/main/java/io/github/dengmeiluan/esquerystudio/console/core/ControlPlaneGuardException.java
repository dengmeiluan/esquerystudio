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

package io.github.dengmeiluan.esquerystudio.console.core;

/**
 * 控制面守卫拒绝：请求被控制面保护策略拒之门外——控制索引不可触达、通配模式可能命中
 * 控制面、路径穿越片段、请求体引用控制索引、非管理员恢复全部等。
 *
 * <p>继承 {@link IllegalArgumentException} 保持既有防御链兼容（guard*Body 内层
 * {@code catch (IllegalArgumentException) rethrow} 与服务层 {@code catch (IAE)} 分支
 * 全部原样生效）；HTTP 面由 {@code InternalEsRebuildExceptionAdvice} 的专用 handler
 * 升格为 403 FORBIDDEN——与 {@code ConsoleAuthInterceptor} 的权限拒绝
 * （403 {@code {code:"FORBIDDEN"}}）同语义，区别于入参畸形：结构校验类 IAE（body 为空、
 * DSL 非 JSON、index_patterns 形态错误等）不换型，维持 400 BAD_REQUEST。</p>
 */
public class ControlPlaneGuardException extends IllegalArgumentException {

    public ControlPlaneGuardException(String message) {
        super(message);
    }
}
