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

import java.util.List;

/**
 * 控制台审计——宿主贡献者 SPI（宿主把自己的操作流水并入控制台审计页，
 * 让「控制台操作」与「宿主侧操作」在同一张审计流水里可回溯——控制台经 iframe 嵌入宿主时，
 * 宿主的审计（含来源 IP、宿主动作语汇）是控制台自管审计之外的关键互补证据。
 *
 * <p><b>约定成俗（与 {@link ConsoleAuthDelegate} 同一 SPI 哲学）</b>：</p>
 * <ul>
 *   <li>宿主注册本接口 Bean 即生效，不注册零影响（查询层只做合并装饰）；</li>
 *   <li>出参为 {@link ConsoleOpsAuditEvent} 类型化记录（timestamp 必填）；
 *       {@code action} 建议归一为 {@code HOST_OP}（前端动作筛选词表内），宿主原始动作语汇
 *       放 {@code detail}（如 {@code module=DMQ action=路由切换}），{@code source} 留空由
 *       合并层统一 stamp 为 {@code host}；</li>
 *   <li>契约红线：{@code search} 抛出的任何异常由合并层吞掉并 WARN 一次性留痕——
 *       宿主贡献者故障绝不反噬控制台自身审计查询。</li>
 * </ul>
 *
 * @author aicoding
 */
public interface ConsoleAuditContributor {

    /**
     * 拉取宿主侧审计记录（timestamp 倒序，最多 size 条；记录数可少于 size——合并层负责
     * 全局排序裁剪）。
     *
     * @param username 用户过滤（null/空=不过滤；语义对齐 {@link ConsoleOpsAuditStore#search}）
     * @param action   动作过滤（null/空=不过滤；宿主动作已归一时可直接比对）
     * @param size     最大条数（调用方已钳 ≤500）
     * @param from     起始偏移（分页；实现可不支持，返回前 size 条即可）
     * @param sinceMs  时间下界（毫秒 epoch，null=不限）
     */
    List<ConsoleOpsAuditEvent> search(String username, String action, int size, int from, Long sinceMs);
}
