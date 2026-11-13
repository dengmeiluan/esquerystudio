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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Adhoc（无 provider）托管重建端点。
 *
 * <p>路径落在 {@code internal/es/index/adhoc-rebuild} 下，写端点由鉴权拦截器按
 * {@code adhoc-rebuild/start|abort|confirm-switch} 升 rank3；连接模型下 job 属于启动时
 * 捕获的目标连接——列表/状态/中止/确认切换只允许当前目标连接的作业，防持 A 连接写键
 * 操作用 B 连接发起的重建（跨目标接管）。</p>
 *
 * <p>异常语义沿用 starter 约定：IllegalArgument/IllegalState 由
 * {@code InternalEsRebuildExceptionAdvice} 转为结构化 {@code {code,message}}。</p>
 */
@RestController
@RequestMapping("internal/es/index/adhoc-rebuild")
public class InternalAdhocRebuildController {

    private static final String TARGET_HEADER = "X-Es-Target";
    private static final String HOST_TARGET = "host";

    private final AdhocRebuildService adhocRebuildService;
    private final EnvPagesResolver envPagesResolver;
    private final boolean pageAuthEnabled;

    public InternalAdhocRebuildController(AdhocRebuildService adhocRebuildService,
                                          EnvPagesResolver envPagesResolver,
                                          boolean pageAuthEnabled) {
        this.adhocRebuildService = adhocRebuildService;
        this.envPagesResolver = envPagesResolver;
        this.pageAuthEnabled = pageAuthEnabled;
    }

    /** 向导第一步：探测逻辑名形态 + 预填 settings/mapping/docCount/timeField 候选 */
    @GetMapping("/prepare")
    public Map<String, Object> prepare(@RequestParam("index") String index) throws IOException {
        return adhocRebuildService.prepare(index);
    }

    /** 启动托管重建（body 见 {@link AdhocRebuildService#start}） */
    @PostMapping("/start")
    public Map<String, Object> start(@RequestBody Map<String, Object> req, HttpServletRequest request) throws IOException {
        ConsolePrincipal p = principal(request);
        return adhocRebuildService.start(req,
                p == null ? null : p.getUsername(),
                p == null ? null : p.getRole().name());
    }

    /** 作业进度快照（连接模型：只允许当前目标连接的作业） */
    @GetMapping("/status")
    public Map<String, Object> status(@RequestParam("jobId") String jobId, HttpServletRequest request) {
        requireJobTarget(jobId, request);
        return adhocRebuildService.status(jobId);
    }

    /** 请求中止（连接模型：只允许当前目标连接 + 作业创建者本人/ADMIN） */
    @PostMapping("/abort")
    public Map<String, Object> abort(@RequestParam("jobId") String jobId, HttpServletRequest request) {
        requireJobTarget(jobId, request);
        requireJobOwner(jobId, request);
        return adhocRebuildService.abort(jobId);
    }

    /**
     * 人工放行切换（仅对 pauseBeforeSwitch=true 的作业有效）。
     *
     * <p>若等待已超时/中止，返回 IllegalState 错误而非成功 —— 谎报成功会让操作者
     * 以为切换正在进行，而实际作业已中止、写阻断已解除。</p>
     */
    @PostMapping("/confirm-switch")
    public Map<String, Object> confirmSwitch(@RequestParam("jobId") String jobId, HttpServletRequest request) {
        requireJobTarget(jobId, request);
        requireJobOwner(jobId, request);
        return adhocRebuildService.confirmSwitch(jobId);
    }

    /** 全部作业（连接模型：只列当前目标连接的作业；按启动时间倒序） */
    @GetMapping("/jobs")
    public List<Map<String, Object>> jobs(HttpServletRequest request) {
        List<Map<String, Object>> all = adhocRebuildService.listJobs();
        if (!connModel(request)) return all;
        String current = normalizeTarget(request.getHeader(TARGET_HEADER));
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> job : all) {
            if (current.equals(normalizeTarget(job.get("targetId") == null
                    ? null : String.valueOf(job.get("targetId"))))) {
                filtered.add(job);
            }
        }
        return filtered;
    }

    /** 连接模型下 job 目标必须与当前请求目标一致；静态/内置模型维持全局管理语义。 */
    private void requireJobTarget(String jobId, HttpServletRequest request) {
        if (!connModel(request)) return;
        Map<String, Object> job = adhocRebuildService.status(jobId);
        String jobTarget = normalizeTarget(job.get("targetId") == null
                ? null : String.valueOf(job.get("targetId")));
        String current = normalizeTarget(request.getHeader(TARGET_HEADER));
        if (!jobTarget.equals(current)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "作业属于目标集群 " + jobTarget + "，当前目标 " + current + "——请切换目标后再操作");
        }
    }

    /**
     * 作业归属：连接模型下，中止/人工放行只允许创建者本人或 ADMIN。
     *
     * <p>页面写键是「连接级」授权——同连接内持 w:adhoc-rebuild 的同事可以观测进度，
     * 但不能替代创建者做不可逆动作（中止会解除写阻断、确认会执行别名切换）。
     * 旧作业无 owner（升级前持久化）维持连接级语义：升级后仍要能收尾，不能一刀切拒绝。</p>
     */
    private void requireJobOwner(String jobId, HttpServletRequest request) {
        ConsolePrincipal p = principal(request);
        /* connModel 已把 ADMIN 排除在外；这里再判一次是为了直调/未来复用时语义自洽。 */
        if (p == null || p.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN)) return;
        Map<String, Object> job = adhocRebuildService.status(jobId);
        Object owner = job.get("ownerUsername");
        String ownerName = owner == null ? "" : String.valueOf(owner).trim();
        if (ownerName.isEmpty()) return; // legacy：无归属记录，维持连接级
        if (ownerName.equals(p.getUsername())) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "作业 " + jobId + " 由 " + ownerName + " 创建：中止/确认切换仅限创建者本人或 ADMIN。"
                        + "同连接其他成员可观测进度，但不能替代创建者执行不可逆动作。");
    }

    private boolean connModel(HttpServletRequest request) {
        if (!pageAuthEnabled || envPagesResolver == null) return false;
        ConsolePrincipal principal = principal(request);
        if (principal == null) return false;
        // ADMIN 是全局超管：不受连接作业过滤/目标一致性限制
        if (principal.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN)) return false;
        return principal.getGrantedPages() != null
                && envPagesResolver.inConnModel(principal.getGrantedPages());
    }

    private static ConsolePrincipal principal(HttpServletRequest request) {
        Object attr = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return attr instanceof ConsolePrincipal ? (ConsolePrincipal) attr : null;
    }

    private static String normalizeTarget(String target) {
        if (target == null || target.trim().isEmpty() || HOST_TARGET.equalsIgnoreCase(target.trim())) {
            return HOST_TARGET;
        }
        return target.trim();
    }
}
