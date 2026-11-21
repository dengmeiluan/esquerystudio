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

package io.github.dengmeiluan.esquerystudio.console.insight;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.insight.action.GuardedActionExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * (内部)  现场智能 + 护栏动作端点。
 *
 * <p>挂 {@code internal/es/index/insight} 前缀——鉴权（ConsoleAuthInterceptor）、
 * 多集群目标头（EsTargetInterceptor 已扩 /insight）、CORS、context-path 全自动继承。
 * 角色校验不走 ADMIN_KEYWORDS（动作风险各异），由 {@link GuardedActionExecutor}
 * 按动作 minRole 逐个判。</p>
 *
 * @author aicoding
 */
@RestController
@RequestMapping("internal/es/index/insight")
public class InsightController {

    private final InsightService insightService;
    private final GuardedActionExecutor executor;

    public InsightController(InsightService insightService, GuardedActionExecutor executor) {
        this.insightService = insightService;
        this.executor = executor;
    }

    /** 现场①：settings 变更影响分析（只读，编辑器防抖实时调用）。 */
    @PostMapping("settings-impact")
    @SuppressWarnings("unchecked")
    public Map<String, Object> settingsImpact(@RequestBody Map<String, Object> body) {
        String index = body.get("index") instanceof String ? (String) body.get("index") : null;
        Map<String, Object> changes = body.get("changes") instanceof Map
                ? (Map<String, Object>) body.get("changes") : null;
        return insightService.settingsImpact(index, changes);
    }

    /** 护栏动作：影响预估（成功即签发 confirmToken）。 */
    @PostMapping("actions/{actionId}/estimate")
    public Map<String, Object> estimate(@PathVariable String actionId,
                                        @RequestBody Map<String, Object> params,
                                        HttpServletRequest request) throws IOException {
        return executor.estimate(actionId, params, principal(request));
    }

    /** 护栏动作：零副作用试运行。 */
    @PostMapping("actions/{actionId}/dry-run")
    public Map<String, Object> dryRun(@PathVariable String actionId,
                                      @RequestBody Map<String, Object> params,
                                      HttpServletRequest request) throws IOException {
        return executor.dryRun(actionId, params, principal(request));
    }

    /** 护栏动作：执行（必须携带 estimate 签发的 confirmToken）。 */
    @PostMapping("actions/{actionId}/execute")
    @SuppressWarnings("unchecked")
    public Map<String, Object> execute(@PathVariable String actionId,
                                       @RequestBody Map<String, Object> body,
                                       HttpServletRequest request) throws IOException {
        Map<String, Object> params = body.get("params") instanceof Map
                ? (Map<String, Object>) body.get("params") : new LinkedHashMap<String, Object>();
        String confirmToken = body.get("confirmToken") instanceof String ? (String) body.get("confirmToken") : null;
        return executor.execute(actionId, params, confirmToken, principal(request));
    }

    private static ConsolePrincipal principal(HttpServletRequest request) {
        Object p = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return p instanceof ConsolePrincipal ? (ConsolePrincipal) p : null;
    }

    /** 403：角色不足 / token 无效（无 token、过期、参数被篡改）。错误体补 endpoint（空白不输出），与全包兜底 advice 同口径。 */
    @ExceptionHandler(InsightForbiddenException.class)
    public ResponseEntity<Map<String, Object>> forbidden(InsightForbiddenException e, HttpServletRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", e.getCode());
        body.put("message", e.getMessage());
        String endpoint = io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper.endpointOf(request);
        if (endpoint != null && !endpoint.trim().isEmpty()) {
            body.put("endpoint", endpoint);
        }
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }

    /** 400：参数问题（未知动作 / 缺参 / 含不可热更项等）。错误体补 endpoint（空白不输出）。 */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> badRequest(IllegalArgumentException e, HttpServletRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", "INSIGHT_BAD_REQUEST");
        body.put("message", e.getMessage());
        String endpoint = io.github.dengmeiluan.esquerystudio.console.web.EsErrorMapper.endpointOf(request);
        if (endpoint != null && !endpoint.trim().isEmpty()) {
            body.put("endpoint", endpoint);
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    /* -C2：ES 侧失败（索引不存在、连接异常等）不再本地处理——统一由 InternalEsErrorFallbackAdvice 兜底，
       它同样回 {code:ES_ERROR, message:<含 root_cause 的原始报错体>}，但状态码按 ES 端 4xx 透传（原先一律拍成 502）。 */
}
