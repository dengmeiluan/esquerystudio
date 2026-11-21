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

package io.github.dengmeiluan.esquerystudio.console.lock;

/**
 * 重建分布式锁存储抽象：保证「同一 {@code indexKey} 在多实例宿主下，同时只有一个重建编排在进行」。
 *
 * <p>解决 D1 发起竞态——原 {@code ensureNoRunningJob} 是 check-then-act、无跨实例互斥，多实例/多运维并发
 * 发起同一索引的重建都会通过校验，导致重复建索引/重复切换别名。本抽象用 ES 文档锁
 * （{@code op_type=create} CAS + 过期强夺）提供跨实例互斥，让接入方在分布式场景从容不迫。</p>
 *
 * <p>锁随重建流程的生命周期：{@code rebuild/firstMigrate} 起点获取、跨请求持有、中间步骤续约、终态/abort 释放；
 * 持有者崩溃则租约过期后可被其它实例强夺。</p>
 *
 * @author aicoding
 */
public interface RebuildLockStore {

    /**
     * 尝试获取 {@code indexKey} 的重建锁。
     *
     * @return true=已持锁；false=已被他人持有且未过期（应拒绝发起）
     */
    boolean tryAcquire(String indexKey, long leaseMs);

    /**
     * 续约（延长租约到期时间）。
     *
     * @return true=续约成功；false=锁不存在或已易主（=本实例已失锁，应停止推进）
     */
    boolean renew(String indexKey, long leaseMs);

    /**
     * 释放本实例持有的锁（非本实例持有则跳过，失败仅告警——锁终会因租约过期自动释放）。
     */
    void release(String indexKey);

    /**
     * 强制释放锁（忽略 owner 校验）：用于 {@code abort} 等异常恢复路径——原持锁实例崩溃后无法 release，
     * 卡住的作业需要其它实例 abort 时不应被「非己锁」拦住。abort 已是高危人工操作，强制释放是预期行为。
     */
    void forceRelease(String indexKey);

    /**
     * 读当前锁状态（诊断用，供 status 显示持锁者/到期时间），无锁返回 null。
     */
    RebuildLock get(String indexKey);

    /**
     * 本实例锁标识（owner），用于日志/诊断。
     */
    String owner();

    /**
     * 本实现是否<b>真的在提供互斥</b>（{@code esquerystudio.elasticsearch.lock.enabled}）。
     *
     * <p><b>为什么必须由 store 自己回答，而不能让调用方从 {@link #get} 反推。</b>
     * {@code enabled=false} 时 {@code get} 恒 null，但 {@code get} 返回 null 还有另外两种成因：
     * 锁文档已被释放、以及 <b>ES 读失败</b>（实现吞掉全部异常返回 null）。三者压进同一个 null，
     * 调用方无从分辨 —— 把"ES 抖了一下"误判成"锁没启用"会让作业<b>静默降级为无锁运行</b>：
     * 不报错、不留痕、照常切换别名，比误判失锁（吵闹地拒绝切换）危险得多。
     * 故"我启用了吗"这个问题语义上本就属于 store。</p>
     *
     * <p><b>为什么是 {@code default} 而不是抽象方法。</b>本接口是<b>公开可替换 SPI</b>
     * （装配处带 {@code @ConditionalOnMissingBean}，宿主用同名 Bean 替换是设计内用法）。
     * 加成抽象方法会让宿主侧已有实现<b>编译期直接断裂</b>；本仓 3 个实现都已更新、测试全绿，
     * 恰恰会<b>掩盖仓外断裂</b>。</p>
     *
     * <p><b>为什么默认值取 true 而不是 false。</b>未知实现一律假定"锁在提供互斥"，
     * 使猜错时落在<b>保守的误报方向</b>（多做一次归属校验、必要时吵闹地拒绝切换），
     * 而不是漏报方向（静默跳过全部锁保护）。失效方向的不对称比失效概率更重要。</p>
     */
    default boolean isEnabled() {
        return true;
    }
}
