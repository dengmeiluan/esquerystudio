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

import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.atomic.AtomicLong;

/**
 * 控制台角色（rank 越大权限越高）。
 *
 * <p>VIEWER 只读（GET）→ OPERATOR 低危写（普通 POST）→ 专项 rank3（重建/集群/审计）
 * → ADMIN（用户管理/raw 透传/系统管理）。<b>三个 rank3 专项当前同 rank、按 atLeast 互通</b>
 * （与 {@link ConsoleAuthInterceptor#requiredRole} 实现一致；页面授权模型下再由连接/页面键收窄）。
 * 拦截规则见 {@link ConsoleAuthInterceptor}。</p>
 *
 * @author aicoding
 */
public enum ConsoleRole {

    /** 只读：全部 GET 查询/观测。 */
    VIEWER(1),
    /** 操作员：低危写操作（文档编辑、analyze、模板渲染等普通 POST）。 */
    OPERATOR(2),
    /** rank3 重建/迁移专项；当前三专项同 rank 互通。 */
    REBUILD_OP(3),
    /** rank3 索引/集群管理专项；当前三专项同 rank 互通。 */
    CLUSTER_OP(3),
    /** rank3 安全管理专项；当前三专项同 rank 互通。 */
    AUDIT_OP(3),
    /** 超级管理员：一切(含用户管理、raw 透传)。 */
    ADMIN(4);

    private static final Logger LOG = LoggerFactory.getLogger(ConsoleRole.class);

    /** 解析失败 WARN 节流间隔。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    /**
     * 解析失败 WARN 节流计数。枚举天然 JVM 单例，静态即实例；
     * 刻意<b>非 final</b>——测试需反射复位（Observability558Test），产线无碍。
     */
    private static AtomicLong lastParseWarnAt = new AtomicLong(0);

    private final int rank;

    ConsoleRole(int rank) {
        this.rank = rank;
    }

    /** 当前角色是否 ≥ 要求角色。 */
    public boolean atLeast(ConsoleRole required) {
        return this.rank >= required.rank;
    }

    /** 档位数值（包内可见）：账号管理防提权需要比较「授予角色 vs 操作者角色」。 */
    int rankValue() {
        return rank;
    }

    /** 宽容解析（大小写不敏感，无法识别回退 VIEWER）。 */
    public static ConsoleRole parse(String s) {
        if (s == null) {
            return VIEWER;
        }
        try {
            return valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            // 静默降 VIEWER 会让「宿主发了陌生角色串」零痕（静默掉权）——
            // 补节流 WARN 带原始串（仅角色名，不落 token/凭据）；返回 VIEWER 契约不变
            long now = System.currentTimeMillis();
            long last = lastParseWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastParseWarnAt.compareAndSet(last, now)) {
                LOG.warn("[ConsoleRole] 无法识别的角色串「{}」，回退 VIEWER（{}s 内不再重复告警；"
                        + "请核对角色下发方与 role-mapping 配置）", s, WARN_THROTTLE_MS / 1000);
            }
            return VIEWER;
        }
    }
}
