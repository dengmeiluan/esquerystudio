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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * -C2：starter 全部控制台端点的 <b>ES 异常兜底</b>——按包生效（{@code io.github.dengmeiluan.esquerystudio.console} 下的
 * 所有 controller），把 {@link java.io.IOException}（含 {@code ResponseException}）与
 * {@link org.elasticsearch.ElasticsearchException} 转成结构化 {@code {error,code,message}}，
 * message 内含 ES 原始报错体，前端 {@code friendlyEsError} 据此提取 {@code root_cause.reason}。
 *
 * <p>修的问题：此前只有 {@link InternalEsIndexRebuildController}（本地 Exception handler）与
 * {@code InsightController}（IOException handler）能透出 ES 原因；xmigrate / 连接管理 / 首连向导 /
 * 登录 / config-lab / adhoc-rebuild 这些端点的 ES 异常一路落到宿主 {@code GlobalWebExceptionHandler}，
 * 被拍平成「内部错误:traceId」——用户与运维都拿不到任何 ES 侧线索。</p>
 *
 * <p>刻意<b>不</b>声明 {@code @ExceptionHandler(Exception.class)}：那会连 Spring MVC 自身的
 * 参数绑定异常（本该 400）一起吃掉拍成 500，也会把真正的代码 bug 伪装成可读错误。非 ES 异常继续走宿主
 * 全局 advice（ERROR 日志 + 告警），职责不变。</p>
 *
 * <p>Order 排在两个 {@code HIGHEST_PRECEDENCE} 业务 advice 之后、宿主全局 advice
 * （无 {@code @Order} = LOWEST）之前：业务拒绝码（LOCK_CONFLICT/BAD_REQUEST 等）优先，ES 故障由本类接管。</p>
 *
 * <p>：log.error 补 60s 全局单键节流（AtomicLong，范式= JwtVerifier
 * lastParseWarnAt）——ES 故障（如控制集群宕机）时每个失败请求都打全栈 ERROR 会刷屏淹没
 * 业务日志，且故障期间每条的栈几乎相同。首条仍 ERROR 带全栈（告警职责保留），60s 窗口内
 * 静默；HTTP 响应体与状态码逐字节不变（节流只动日志，错误透传给前端的职责不受影响）。</p>
 *
 * @author aicoding
 */
@RestControllerAdvice(basePackages = "io.github.dengmeiluan.esquerystudio.console")
@Order(Ordered.HIGHEST_PRECEDENCE + 100)
public class InternalEsErrorFallbackAdvice {

    private static final Logger log = LoggerFactory.getLogger(InternalEsErrorFallbackAdvice.class);

    /** ERROR 日志节流间隔与全局单键（ES 故障期间的重复全栈刷屏根治）。 */
    private static final long ERROR_LOG_THROTTLE_MS = 60_000L;
    private static final AtomicLong lastErrorLogAt = new AtomicLong(0);

    /** ES 侧失败：4xx 透传原状态码，5xx 与网络故障 → 502。ERROR 级日志保留（原先由宿主 advice 承担的告警职责），起 60s 节流。
     *  错误体补 {@code endpoint}（method + " " + requestURI），供前端/运维定位失败端点。 */
    @ExceptionHandler({java.io.IOException.class, org.elasticsearch.ElasticsearchException.class})
    public ResponseEntity<Map<String, Object>> esError(Exception e, javax.servlet.http.HttpServletRequest request) {
        int status = EsErrorMapper.httpStatusOf(e);
        long now = System.currentTimeMillis();
        long last = lastErrorLogAt.get();
        if (now - last > ERROR_LOG_THROTTLE_MS && lastErrorLogAt.compareAndSet(last, now)) {
            log.error("es console endpoint failed, status={}", status, e);
        }
        return ResponseEntity.status(status).body(EsErrorMapper.esErrorBody(e, EsErrorMapper.endpointOf(request)));
    }
}
