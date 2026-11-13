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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import java.util.List;

/**
 * 连接中心 ES 连接贡献 SPI(连接中心自动同步批):宿主(如 宿主,与 infra starter 同进程)
 * 注册本接口 Bean,把连接中心的 ES 连接喂给 {@link ClusterConnSyncEngine} 周期 upsert 进
 * {@link ConnStore}。两 starter 保持零 Maven 依赖,契约仿 {@code ConsoleAuditContributor} 范式:
 * <b>注册即生效 / 不注册零影响 / 异常不反噬</b>——引擎对 {@link #contribute()} 抛错一次 WARN 后
 * 本进程永久降级,绝不影响控制台主流程。凭据 reveal 走连接中心既有审计通道,是宿主实现的责任。
 *
 * @author aicoding
 */
public interface ClusterConnContributor {

    /** 连接中心当前全部 ES 连接的可同步视图;实现方自行分页拉取与凭据 reveal,返回 null 视为空。 */
    List<ContributedEsCluster> contribute();
}
