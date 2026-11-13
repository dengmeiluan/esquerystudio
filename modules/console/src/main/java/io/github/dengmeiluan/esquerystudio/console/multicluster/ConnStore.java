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

import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;

import java.util.List;
import java.util.Map;

/**
 * 多集群连接档案存储 SPI（ 平台化底座）：把「集群档案存哪」从实现里解耦——
 * 独立部署默认落控制集群 ES 索引（{@link EsConnStore}）；嵌入宿主（如 宿主）时
 * 可切宿主数据库表（{@link JdbcConnStore}，配置 {@code esquerystudio.elasticsearch.console.store=jdbc}）；
 * 宿主注册自定义本接口 Bean 则完全接管（{@code @ConditionalOnMissingBean} 让位）。
 *
 * <p>契约红线：密码只在服务端流转——{@link #list()} 一律脱敏（只给 hasPassword 布尔），
 * {@link #get(String)} 才含明文且仅供服务端建连使用。</p>
 *
 * @author aicoding
 */
public interface ConnStore {

    /** 全部连接（脱敏视图：不含密码明文，只给 hasPassword 布尔），按 name 排序。 */
    List<Map<String, Object>> list();

    /** 按 id 取完整连接（含密码，仅服务端内部使用）；不存在返回 null。 */
    RemoteClusterConn get(String id);

    /** 连接显示名（不存在返回 null）。 */
    String getName(String id);

    /**
     * 档案里的服务端版本（探活回写）；未探到/不存在返回 null。
     * <p>-67：null 表示<b>未知</b>，调用方须经 {@link EsVersionCaps#mappingTypeMode(String)}
     * 显式处理，<b>不得假设 7.x</b>。</p>
     */
    String getVersion(String id);

    /**
     * 保存连接（新建或覆盖）。
     *
     * @param id               为空则生成短 id
     * @param name             显示名（必填）
     * @param url              连接串 {@code http(s)://[user:pass@]host[:port]}（必填）
     * @param username         独立传的用户名（优先于 url 内嵌）
     * @param password         独立传的密码；<b>编辑时留空 = 保留旧密码</b>
     * @param minRole          访问本连接的最低角色；空 = VIEWER
     * @param connectTimeoutMs 独立连接超时；null = 用全局默认
     * @param socketTimeoutMs  独立读超时；null = 用全局默认
     * @param env              环境标识：PROD/STAGING/QA/DEV；空 = 未标注
     * @return 脱敏视图
     */
    Map<String, Object> save(String id, String name, String url, String username, String password,
                             String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env);

    /**
     * 保存连接（扩展形态，API Key 认证支持）：authType="API_KEY" 时 secret 参数承载
     * ApiKey 秘钥（es 控制台以 {@code Authorization: ApiKey} 头建连，用户名可空）；
     * "BASIC"/null 时与 9 参形态等价（secret 即密码）。
     * 默认实现降级调用 9 参形态（丢弃 authType）——宿主自定义 ConnStore 向后兼容，
     * 仅 API Key 档案不可用（会以 basic 尝试鉴权失败）。
     */
    default Map<String, Object> save(String id, String name, String url, String username, String secret,
                                     String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs,
                                     String env, String authType) {
        return save(id, name, url, username, secret, minRole, connectTimeoutMs, socketTimeoutMs, env);
    }

    /** 回写服务端版本号（探活/测试连接成功后调）；失败不抛——版本是增强信息。 */
    void updateVersion(String id, String esVersion);

    /** 删除连接（幂等）。 */
    void delete(String id);

    /**
     * 连接中心同步域状态标记(连接中心自动同步批):state="STALE"=源已失联,null=恢复正常。
     * 默认 no-op——宿主自定义 ConnStore 档安全忽略;两内置档落库并在 {@link #list()}
     * 脱敏视图透出 {@code syncState} 键。实现须吞异常只留日志(与 {@link #updateVersion}
     * 同款红线:标记是增强信息,绝不反噬同步主流程)。
     */
    default void markSyncState(String id, String state) {
    }

    /** 同步档案软删除标记值:人工删除的同步档案落此标记保留为墓碑,不再被自动同步回灌。 */
    String STATE_DISMISSED = "DISMISSED";

    /**
     * 同步档案软删除(幂等):档案保留为墓碑——两内置档落 syncState=DISMISSED 后,
     * {@link #list()} 脱敏读面不再透出、{@link #get(String)} 返回 null(管理列表/探活/
     * 指标/路由整体隐身),自动同步引擎据此跳过重建。手工域档案不走此路径,仍走 {@link #delete(String)}。
     * 默认 no-op——宿主自定义 ConnStore 档安全忽略(退回物理删除语义);实现须吞异常只留日志
     * (与 {@link #markSyncState} 同款红线:目录语义变更,绝不反噬请求主流程)。
     */
    default void markDismissed(String id) {
    }

    /**
     * 读单条连接档案的同步域状态标记(与 {@link #markSyncState} 成对的读面):
     * "STALE"/"DISMISSED" 等,无标记或档案不存在返回 null。
     * 默认恒 null——宿主自定义 ConnStore 档按「无标记」处理,自动同步引擎不触发软删跳过。
     */
    default String getSyncState(String id) {
        return null;
    }
}
