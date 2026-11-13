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

package io.github.dengmeiluan.esquerystudio.console.web;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 重建运维端点（{@code /internal/es/index/**}）的局部异常处理：把 {@link IllegalStateException} / {@link IllegalArgumentException}
 * 这类业务规则拒绝（锁冲突 / 状态守卫不通过 / 物理索引名校验失败）转成<b>结构化 JSON</b>
 * （含 {@code code} 字段），前端据 {@code code} 精确渲染（替代原先靠 regex 抓 message 文案）。
 *
 * <p><b>不处理</b> {@link java.io.IOException} 与 ES/RestHighLevelClient 异常——这些应继续走宿主全局
 * {@code GlobalWebExceptionHandler} 落 ERROR 日志（基础设施类异常，需告警）。本 advice 仅托底"业务可恢复"异常。</p>
 *
 * <p>{@link Order Order(HIGHEST_PRECEDENCE)} 优先于宿主全局 advice 接管，确保结构化 JSON 不被宿主默认处理覆盖。</p>
 *
 * @author aicoding
 */
@RestControllerAdvice(assignableTypes = {InternalEsIndexRebuildController.class,
        io.github.dengmeiluan.esquerystudio.console.multicluster.EsClusterConnController.class,
        io.github.dengmeiluan.esquerystudio.console.control.ConsoleSetupController.class,
        io.github.dengmeiluan.esquerystudio.console.adhoc.InternalAdhocRebuildController.class,
        // validate 包 ConfigLab 场景（drift 无注册 provider 的 ISE）与 client 包
        // DesiredState 场景（期望配置序列化失败的 ISE）——业务可恢复 ISE 不再落宿主 500 拍平，
        // 统一转结构化 {code,message}；既有 4 家行为零变动
        io.github.dengmeiluan.esquerystudio.console.validate.InternalConfigLabController.class,
        io.github.dengmeiluan.esquerystudio.console.client.DesiredStateController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class InternalEsRebuildExceptionAdvice {

    /** 锁冲突：indexKey 正被 owner=X 重建中 */
    public static final String CODE_LOCK_CONFLICT = "LOCK_CONFLICT";
    /** 锁失效：本实例已不再持有锁（疑似租约过期被强夺） */
    public static final String CODE_LOCK_LOST = "LOCK_LOST";
    /** 状态守卫拒绝：未到收尾完成阶段、首迁已切换不可回滚、无作业记录、物理索引名不一致等 */
    public static final String CODE_STAGE_GUARD = "STAGE_GUARD";
    /** 入参非法 */
    public static final String CODE_BAD_REQUEST = "BAD_REQUEST";
    /** 控制面守卫拒绝：与 ConsoleAuthInterceptor 的权限拒绝（403 {code:"FORBIDDEN"}）同语义 */
    public static final String CODE_FORBIDDEN = "FORBIDDEN";
    /** 兜底业务规则拒绝 */
    public static final String CODE_RULE_REJECTED = "RULE_REJECTED";
    /**  控制台尚未绑定控制集群（前端弹首连向导） */
    public static final String CODE_SETUP_REQUIRED = "SETUP_REQUIRED";
    /**  已绑定但控制集群不可达（绝不回落 SETUP） */
    public static final String CODE_CONTROL_CLUSTER_DOWN = "CONTROL_CLUSTER_DOWN";

    @ExceptionHandler(io.github.dengmeiluan.esquerystudio.console.control.SetupRequiredException.class)
    public ResponseEntity<Map<String, Object>> setupRequired(io.github.dengmeiluan.esquerystudio.console.control.SetupRequiredException e,
            javax.servlet.http.HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body(CODE_SETUP_REQUIRED, e.getMessage(),
                EsErrorMapper.endpointOf(request)));
    }

    @ExceptionHandler(org.springframework.dao.DataAccessResourceFailureException.class)
    public ResponseEntity<Map<String, Object>> controlClusterDown(org.springframework.dao.DataAccessResourceFailureException e,
            javax.servlet.http.HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(body(CODE_CONTROL_CLUSTER_DOWN, "控制集群不可达: "
                        + EsErrorMapper.sanitizeTopology(e.getMessage()),
                        EsErrorMapper.endpointOf(request)));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> illegalState(IllegalStateException e,
            javax.servlet.http.HttpServletRequest request) {
        String msg = e.getMessage() == null ? "" : e.getMessage();
        String code;
        if (msg.contains("正被 owner=")) {
            code = CODE_LOCK_CONFLICT;
        } else if (msg.contains("重建锁已失效") || msg.contains("重建锁已被他人持有")) {
            code = CODE_LOCK_LOST;
        } else if (msg.contains("未到收尾完成阶段") || msg.contains("首迁已切换") || msg.contains("无作业记录")
                || msg.contains("物理索引名") || msg.contains("无进行中作业") || msg.contains("已有进行中作业")
                || msg.contains("拒绝删除别名当前写索引") || msg.contains("别名不存在") || msg.contains("别名已存在")
                || msg.contains("旧具体索引不存在") || msg.contains("目标物理索引")) {
            code = CODE_STAGE_GUARD;
        } else {
            code = CODE_RULE_REJECTED;
        }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body(code, msg, EsErrorMapper.endpointOf(request)));
    }

    /**
     * 控制面守卫拒绝升格 403：保护策略拒绝（控制索引不可触达/通配可能命中控制面/路径穿越/
     * 请求体引用控制索引/非管理员恢复全部）不是入参畸形——Spring 选 handler 按最具体匹配，
     * 本臂优先于 {@link #illegalArg}。结构校验类 IAE 不抛此型，维持 400。
     */
    @ExceptionHandler(io.github.dengmeiluan.esquerystudio.console.core.ControlPlaneGuardException.class)
    public ResponseEntity<Map<String, Object>> controlPlaneGuard(
            io.github.dengmeiluan.esquerystudio.console.core.ControlPlaneGuardException e,
            javax.servlet.http.HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(body(CODE_FORBIDDEN, e.getMessage(), EsErrorMapper.endpointOf(request)));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> illegalArg(IllegalArgumentException e,
            javax.servlet.http.HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(body(CODE_BAD_REQUEST, e.getMessage(), EsErrorMapper.endpointOf(request)));
    }

    /** 旧口径入口保留（{@link InternalEsIndexRebuildController} 本地 handler 委派用），响应形状 {code,message} 逐字节不变。 */
    ResponseEntity<Map<String, Object>> illegalState(IllegalStateException e) {
        return illegalState(e, null);
    }

    /** 旧口径入口保留（本地 handler 委派用）。 */
    ResponseEntity<Map<String, Object>> illegalArg(IllegalArgumentException e) {
        return illegalArg(e, null);
    }

    private static Map<String, Object> body(String code, String message, String endpoint) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("code", code);
        b.put("message", message);
        if (endpoint != null && !endpoint.trim().isEmpty()) {
            b.put("endpoint", endpoint);
        }
        return b;
    }
}
