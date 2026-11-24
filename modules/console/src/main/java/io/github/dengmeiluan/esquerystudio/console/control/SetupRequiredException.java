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

package io.github.dengmeiluan.esquerystudio.console.control;

/**
 * 控制台尚未绑定控制集群（ SETUP 模式）时访问控制面存储抛出。
 * 拦截器/异常 advice 捕获后统一回 409 {@code {code:"SETUP_REQUIRED"}}，前端据此弹首连向导。
 *
 * @author aicoding
 */
public class SetupRequiredException extends IllegalStateException {

    public SetupRequiredException() {
        super("控制台尚未绑定控制集群，请先完成 Setup 首连");
    }
}
