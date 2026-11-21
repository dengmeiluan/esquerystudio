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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Adhoc（无 provider）托管重建端点。
 *
 * <p>路径落在 {@code internal/es/index/adhoc-rebuild} 下，写端点由鉴权拦截器按
 * {@code adhoc-rebuild} 写动词（start/abort/confirm-switch/retry 及 jobs/{jobId}/throttle）
 * 升 rank3；连接模型下 job 属于启动时
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

    /**
     * 作业事件时间线：{@code {jobId, events:[{ts,stage,status,detail}]}}（ts 升序）。
     * 记录作业创建、阶段推进、每轮 reindex 完成、确认门开/放行/超时与终态落定；
     * 归属门与 /status 同档（观测面，连接模型下限当前目标连接）。
     */
    @GetMapping("/jobs/{jobId}/events")
    public Map<String, Object> events(@PathVariable("jobId") String jobId, HttpServletRequest request) {
        requireJobTarget(jobId, request);
        return adhocRebuildService.events(jobId);
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

    /**
     * 失败/中止作业复用原配置一键重启（body {@code {jobId, overrides?}}）。
     *
     * <p>沿用原 jobId 复位状态，历史轮次 rounds 继续累加——status 轮询无需换 id。
     * {@code overrides}（2026-11-21 对账批）可选键 requestsPerSecond / slices / batchSize，
     * 未传字段沿用原值；解析与裁决在 service 层（非法值明确拒绝，不静默忽略）。
     * 归属门照抄 abort（创建者本人或 ADMIN）：重启会再次触碰别名切换等不可逆动作。</p>
     */
    @PostMapping("/retry")
    public Map<String, Object> retry(@RequestBody Map<String, Object> req, HttpServletRequest request) {
        String jobId = req.get("jobId") == null ? null : String.valueOf(req.get("jobId")).trim();
        if (jobId == null || jobId.isEmpty()) {
            throw new IllegalArgumentException("jobId 不能为空");
        }
        requireJobTarget(jobId, request);
        requireJobOwner(jobId, request);
        @SuppressWarnings("unchecked")
        Map<String, Object> overrides = req.get("overrides") instanceof Map
                ? (Map<String, Object>) req.get("overrides") : null;
        return adhocRebuildService.retry(jobId, overrides);
    }

    /**
     * 删除单条终态作业记录（RUNNING/AWAIT_CONFIRM 拒绝——删了会留下无法观测/中止的孤儿任务）。
     *
     * <p>只清控制面的作业记录，不触碰 ES 侧索引/task；键级为普通写（与 GET /jobs 的
     * 读可见面同域、破坏力等同记录维护），连接模型下仍受目标一致性约束。</p>
     */
    @DeleteMapping("/jobs/{jobId}")
    public Map<String, Object> deleteJob(@PathVariable("jobId") String jobId, HttpServletRequest request) {
        requireJobTarget(jobId, request);
        return adhocRebuildService.delete(jobId);
    }

    /**
     * 批量清理 N 天前的终态作业，返回 {@code {deleted:N}}。
     *
     * <p>连接模型下只清当前目标连接的作业（与 /jobs 列表过滤同口径，防跨目标误删）；
     * 静态/内置模型全局清理。</p>
     */
    @DeleteMapping("/jobs")
    public Map<String, Object> deleteJobs(@RequestParam("olderThanDays") int olderThanDays,
                                          HttpServletRequest request) {
        if (olderThanDays <= 0) {
            throw new IllegalArgumentException("olderThanDays 必须为正整数");
        }
        String target = connModel(request) ? normalizeTarget(request.getHeader(TARGET_HEADER)) : null;
        Map<String, Object> result = adhocRebuildService.deleteOlderThan(olderThanDays, target);
        return Collections.singletonMap("deleted", result.get("deleted"));
    }

    /**
     * 对作业在途的 reindex task 限速（body {@code {requestsPerSecond}}，-1 恢复全速）。
     *
     * <p>仅 FULL_REINDEX / CATCHUP / FINAL_CATCHUP 阶段且有 currentTaskId 时有效。
     * 归属门（requireJobOwner）刻意不设：限速可随时调回，同连接持写键的成员协助降速
     * 不受创建者归属限制。键级归级则是另一层裁决：拦截器把本端点与 abort/confirm-switch
     * 同按 REBUILD_OP（rank3）写档——对生产重建作业的速率干预（尤其恢复全速）会即时
     * 改变目标集群负载，与 abort 同为重建生命周期干预，按危险写键归级；动作可逆只
     * 影响归属门的取舍，不作为键级降档的理由。</p>
     */
    @PostMapping("/jobs/{jobId}/throttle")
    public Map<String, Object> throttle(@PathVariable("jobId") String jobId,
                                        @RequestBody Map<String, Object> req,
                                        HttpServletRequest request) throws IOException {
        Object rps = req.get("requestsPerSecond");
        if (!(rps instanceof Number)) {
            throw new IllegalArgumentException("requestsPerSecond 必须为数字（-1 表示恢复全速）");
        }
        requireJobTarget(jobId, request);
        return adhocRebuildService.throttle(jobId, ((Number) rps).doubleValue());
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
