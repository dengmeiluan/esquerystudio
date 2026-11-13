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
 * 跨集群迁移端点（{@code /internal/es/xmigrate/**}）的局部异常处理：把业务规则拒绝转结构化
 * {@code {code,message}}，前端据 code 精确渲染。与 {@link InternalEsRebuildExceptionAdvice} 同形、各自托底。
 */
@RestControllerAdvice(assignableTypes = CrossClusterMigrateController.class)
@Order(Ordered.HIGHEST_PRECEDENCE)
public class InternalEsMigrateExceptionAdvice {

    /** 入参非法。 */
    public static final String CODE_BAD_REQUEST = "BAD_REQUEST";
    /**  引用已存连接但登录角色低于档案 minRole。 */
    public static final String CODE_CONN_FORBIDDEN = "CONN_FORBIDDEN";
    /** 连接旧集群失败。 */
    public static final String CODE_REMOTE_CONNECT_FAILED = "REMOTE_CONNECT_FAILED";
    /** 目标索引相关（不存在 / 已存在）。 */
    public static final String CODE_DEST_INDEX = "DEST_INDEX";
    /** 作业状态不允许该操作（运行中 / 已完成）。 */
    public static final String CODE_JOB_STATE = "JOB_STATE";
    /** 兜底业务规则拒绝。 */
    public static final String CODE_RULE_REJECTED = "RULE_REJECTED";

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> illegalArg(IllegalArgumentException e,
            javax.servlet.http.HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(body(CODE_BAD_REQUEST, e.getMessage(), EsErrorMapper.endpointOf(request)));
    }

    @ExceptionHandler(SecurityException.class)
    public ResponseEntity<Map<String, Object>> connForbidden(SecurityException e,
            javax.servlet.http.HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(body(CODE_CONN_FORBIDDEN, e.getMessage(), EsErrorMapper.endpointOf(request)));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> illegalState(IllegalStateException e,
            javax.servlet.http.HttpServletRequest request) {
        String msg = e.getMessage() == null ? "" : e.getMessage();
        String code;
        if (msg.contains("连接旧集群失败")) {
            code = CODE_REMOTE_CONNECT_FAILED;
        } else if (msg.contains("目标索引") || msg.contains("源索引不存在")) {
            code = CODE_DEST_INDEX;
        } else if (msg.contains("仍在运行") || msg.contains("已完成")) {
            code = CODE_JOB_STATE;
        } else {
            code = CODE_RULE_REJECTED;
        }
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body(code, msg, EsErrorMapper.endpointOf(request)));
    }

    private static Map<String, Object> body(String code, String message, String endpoint) {
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("code", code);
        // 连接失败臂的 message 内嵌远端集群地址：与 EsErrorMapper 错误通道同一脱敏口径
        b.put("message", message == null ? null : EsErrorMapper.sanitizeTopology(message));
        if (endpoint != null && !endpoint.trim().isEmpty()) {
            b.put("endpoint", endpoint);
        }
        return b;
    }
}
