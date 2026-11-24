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

package io.github.dengmeiluan.esquerystudio.console.insight.action;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;

import java.io.IOException;
import java.util.Map;

/**
 *  护栏动作协议：所有"会改变集群状态"的控制台动作统一走
 * estimate（影响预估 + 发 confirmToken）→ 可选 dry-run → execute（验 token）→ 回执审计。
 *
 * <p>API 层强制"未看预估不能执行"：execute 必须携带 estimate 阶段签发的
 * {@link ConfirmTokenService} token，token 绑定 actionId + 参数哈希 + 过期时间，
 * 无 token / 过期 / 参数被篡改一律 403。</p>
 *
 * <p>实现类注册进 {@link GuardedActionRegistry}（AutoConfig 集合注入），
 * 后续批次新增动作对协议层零改动。</p>
 *
 * @author aicoding
 */
public interface GuardedAction {

    /** 风险级：低危（蓝）。 */
    String RISK_LOW = "LOW";
    /** 风险级：中危（黄）。 */
    String RISK_MEDIUM = "MEDIUM";
    /** 风险级：高危（红，前端需输入索引名解锁）。 */
    String RISK_HIGH = "HIGH";

    /** 动作唯一 id（URL 路径段，如 apply-index-settings）。 */
    String id();

    /** 执行该动作要求的最低角色（estimate/dry-run/execute 同门槛：预估本身可能暴露数据面信息）。 */
    ConsoleRole minRole();

    /** 风险级：{@link #RISK_LOW} / {@link #RISK_MEDIUM} / {@link #RISK_HIGH}。 */
    String riskLevel();

    /** 是否支持零副作用 dry-run。 */
    boolean supportsDryRun();

    /**
     * 影响预估：返回人话摘要 + 明细（各动作自定义结构，必含 {@code summary} 键）。
     * <p>参数不满足可执行前提（如含不可热更项）时直接抛 {@link IllegalArgumentException}——
     * 护栏：不可执行的变更不发 token。</p>
     */
    Map<String, Object> estimate(Map<String, Object> params) throws IOException;

    /** 零副作用试运行（仅 {@link #supportsDryRun()} 为 true 时会被调用）。 */
    Map<String, Object> dryRun(Map<String, Object> params) throws IOException;

    /** 真正执行（协议层已完成角色校验与 token 校验）。 */
    Map<String, Object> execute(Map<String, Object> params) throws IOException;
}
