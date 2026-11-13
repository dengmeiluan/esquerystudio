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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.EnvPagesResolver;
import io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.CrossClusterMigrateService;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateRequest;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * (内部) ES 跨集群迁移运维接口（客户端 scroll+bulk 搬运）。
 *
 * <p>与零停机重建接口（{@code /internal/es/index/**}）并列、解耦。由 {@code esquerystudio.elasticsearch.web-enabled} 与
 * {@code esquerystudio.elasticsearch.migrate.enabled} 同时为 true 才装配。<b>凭据类请求一律走 POST body，不进 query/日志。</b></p>
 *
 * <p> 起源集群支持引用已存连接档案（{@code srcConnId}/{@code connId}）：服务端取档案含密构造连接，
 * 密码明文不经前端；引用前校验当前登录角色满足档案 minRole（不满足 403 CONN_FORBIDDEN）。</p>
 */
@RestController
@RequestMapping("internal/es/xmigrate")
public class CrossClusterMigrateController {

    private final CrossClusterMigrateService migrateService;
    private final ConnStore connStore;
    private final EnvPagesResolver envPagesResolver;
    private final boolean pageAuthEnabled;

    public CrossClusterMigrateController(CrossClusterMigrateService migrateService, ConnStore connStore,
                                         EnvPagesResolver envPagesResolver, boolean pageAuthEnabled) {
        this.migrateService = migrateService;
        this.connStore = connStore;
        this.envPagesResolver = envPagesResolver;
        this.pageAuthEnabled = pageAuthEnabled;
    }

    /** 旧集群连通性自检 + 列出旧集群索引。connId 非空时用已存档案（body 可传 {}）。 */
    @PostMapping("connect-check")
    public List<Map<String, Object>> connectCheck(@RequestBody RemoteClusterConn conn,
                                                  @RequestParam(required = false) String connId,
                                                  HttpServletRequest request) {
        requireSourceWrite(connId, request);
        return migrateService.connectCheck(pick(conn, connId, request));
    }

    /**
     * 环境变量/${表达式} 解析预览：返回服务端从自身运行环境解析出的 scheme/host/port/username
     * 与"密码是否已解析"，<b>不返回密码值</b>。供"只知变量名、填不出实际值"场景确认解析结果。
     */
    @PostMapping("resolve-preview")
    public Map<String, Object> resolvePreview(@RequestBody RemoteClusterConn conn,
                                              @RequestParam(required = false) String connId,
                                              HttpServletRequest request) {
        requireSourceWrite(connId, request);
        return migrateService.resolvePreview(pick(conn, connId, request));
    }

    /** 迁移前预检：目标索引是否已存在（已存在则同名文档将跳过、结果是合并），供启动确认弹层前置警告。 */
    @PostMapping("preflight")
    public Map<String, Object> preflight(@RequestBody MigrateRequest request, HttpServletRequest http) {
        requireSourceWrite(request.getSrcConnId(), http);
        requireDestWrite(http);
        return migrateService.preflight(request);
    }

    /** 发起迁移（异步），返回 jobId。srcConnId 非空时服务端注入已存档案为源连接。 */
    @PostMapping("start")
    public Map<String, Object> start(@RequestBody MigrateRequest request, HttpServletRequest http) {
        requireSourceWrite(request.getSrcConnId(), http);
        requireDestWrite(http);
        if (request.getSrcConnId() != null && !request.getSrcConnId().trim().isEmpty()) {
            request.setConn(storedConn(request.getSrcConnId(), http));
        }
        ConsolePrincipal p = principal(http);
        String jobId = migrateService.start(request,
                p == null ? null : p.getUsername(),
                p == null ? null : p.getRole().name());
        return ok("jobId", jobId);
    }

    /**
     * 从旧集群读取指定索引的 mapping + settings，供前端预览/编辑后再创建目标索引。
     * 返回 {"mapping": "...", "settings": "..."}。connId 非空时用已存档案。
     */
    @PostMapping("fetch-config")
    public Map<String, Object> fetchConfig(@RequestBody RemoteClusterConn conn,
                                           @RequestParam String sourceIndex,
                                           @RequestParam(required = false) String connId,
                                           HttpServletRequest request) {
        requireSourceWrite(connId, request);
        return migrateService.fetchSourceConfig(pick(conn, connId, request), sourceIndex);
    }

    /** 进度快照（连接模型：只允许作业源连接的写键持有人）。 */
    @GetMapping("progress")
    public MigrateJobES progress(@RequestParam String jobId, HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request);
        return sanitizeJobFor(job, request);
    }

    /** 近期迁移作业列表（连接模型：只列源连接写键可达的作业）。 */
    @GetMapping("jobs")
    public List<MigrateJobES> jobs(@RequestParam(required = false, defaultValue = "20") int limit,
                                   HttpServletRequest request) {
        List<MigrateJobES> all = migrateService.jobs(Math.min(Math.max(limit, 1), 500));
        boolean connModel = connModel(request);
        ConsolePrincipal principal = principal(request);
        List<MigrateJobES> out = new ArrayList<>(all.size());
        for (MigrateJobES job : all) {
            if (connModel && !(job.getSrcConnId() != null && !job.getSrcConnId().trim().isEmpty()
                    && xmigrateWriteAllowed(job.getSrcConnId().trim(), principal))) {
                continue;
            }
            out.add(sanitizeJobFor(job, request));
        }
        return out;
    }

    /** 进度读面脱敏：源集群地址/源连接档案/连接参数/错误样本含内网拓扑与业务数据片段，
        观测级身份只保留进度状态字段；迁移专项（rank3+）排障所需完整信息保留。
        深拷贝后剥离，避免污染服务端作业缓存对象。 */
    private static MigrateJobES sanitizeJobFor(MigrateJobES job, HttpServletRequest request) {
        ConsolePrincipal principal = principal(request);
        if (principal != null && principal.getRole() != null
                && principal.getRole().atLeast(ConsoleRole.REBUILD_OP)) {
            return job;
        }
        MigrateJobES copy;
        try {
            copy = JOB_COPY.convertValue(job, MigrateJobES.class);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "作业数据脱敏失败");
        }
        copy.setRemoteEndpoint(null);
        copy.setSrcConnId(null);
        copy.setSavedSettings(null);
        copy.setErrorSamples(null);
        return copy;
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper JOB_COPY =
            new com.fasterxml.jackson.databind.ObjectMapper();

    /**
     * 迁移写入端（宿主/控制集群）索引清单——目标索引补全专用。
     * 迁移恒定写宿主，与数据面 X-Es-Target 无关，故不走 /cluster/** 数据面通道。
     */
    @GetMapping("dest-indices")
    public List<Map<String, Object>> destIndices(HttpServletRequest request) {
        requireDestWrite(request);
        return migrateService.destIndices();
    }

    /** 续跑（重新供给旧集群凭据；connId 非空时用已存档案）。 */
    @PostMapping("resume")
    public Map<String, Object> resume(@RequestParam String jobId, @RequestBody RemoteClusterConn conn,
                                      @RequestParam(required = false) String connId,
                                      HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request, true);
        if (connModel(request) && job.getSrcConnId() != null && !job.getSrcConnId().trim().isEmpty()) {
            if (connId == null || !job.getSrcConnId().trim().equals(connId.trim())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "续跑必须使用该作业的源连接档案 " + job.getSrcConnId());
            }
        }
        requireSourceWrite(connId, request);
        requireDestWrite(request);
        migrateService.resume(jobId, pick(conn, connId, request));
        return ok("jobId", jobId);
    }

    /** 中止（连接模型：只允许作业源连接的写键持有人）。 */
    @PostMapping("abort")
    public Map<String, Object> abort(@RequestParam String jobId, HttpServletRequest request) {
        MigrateJobES job = migrateService.progress(jobId);
        requireJobSource(job, request, true);
        migrateService.abort(jobId);
        return ok("aborted", jobId);
    }

    /**
     * 连接模型下源连接档案必须有该连接的迁移写键。<b>手输源连接一律拒绝</b>——
     * 手输连接不绑定档案，若放行则持 A 连接写键的用户可绕过源授权读取任意集群并写宿主；
     * 需要临时连接请先在连接中心建档并授予该连接 xmigrate 写键。
     */
    private void requireSourceWrite(String connId, HttpServletRequest request) {
        if (!connModel(request)) return;
        if (connId == null || connId.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "连接模型下必须选择已授权的源连接档案（不支持手输源连接）");
        }
        ConsolePrincipal principal = principal(request);
        if (!xmigrateWriteAllowed(connId.trim(), principal)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "暂无源连接档案 " + connId.trim() + " 的迁移写权限");
        }
    }

    /** conn 写键优先；混合模型静态 xmigrate 页 + 写档角色同样是合法授权（与拦截器同序）。 */
    private boolean xmigrateWriteAllowed(String target, ConsolePrincipal principal) {
        if (principal == null) return false;
        /* 超管是全局权限：连接写键/宿主目标写键都不得把 ADMIN 拦在迁移之外。 */
        if (principal.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN)) return true;
        if (envPagesResolver.writeAllowed(target, "xmigrate", principal.getGrantedPages())) return true;
        return envPagesResolver.staticWriteAllowed(target, "xmigrate", principal.getGrantedPages())
                && principal.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.REBUILD_OP);
    }

    /**
     * 迁移的写入端恒为宿主/控制集群：连接模型下除了源连接写键，还必须持有宿主连接的
     * xmigrate 写键。否则持 A 连接写键的用户可以把任意数据搬进宿主、覆盖宿主业务索引。
     */
    private void requireDestWrite(HttpServletRequest request) {
        if (!connModel(request)) return;
        ConsolePrincipal principal = principal(request);
        if (!xmigrateWriteAllowed("host", principal)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "暂无宿主目标集群的迁移写权限（conn:host:w:xmigrate）");
        }
    }

    /** 连接模型下作业必须记录源连接档案，且操作者持有该档案的迁移写键；旧版/手输作业不下放。 */
    private void requireJobSource(MigrateJobES job, HttpServletRequest request) {
        requireJobSource(job, request, false);
    }

    /**
     * @param mutating true=续跑/中止：在源连接写键之外再校验作业归属（创建者本人或 ADMIN）。
     *                 进度读取保持连接级（团队观测），不因归属把同事挡在排障门外。
     */
    private void requireJobSource(MigrateJobES job, HttpServletRequest request, boolean mutating) {
        if (connModel(request)) {
            String src = job == null ? null : job.getSrcConnId();
            if (src == null || src.trim().isEmpty()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "该迁移作业未记录源连接档案，连接模型下不可操作");
            }
            requireSourceWrite(src, request);
        }
        if (!mutating) return;
        /* 归属检查不依赖连接模型：静态/内置模型的作业同样记录了创建者，
           不能因为部署模型不同就让同事随意续跑/中止别人的迁移。 */
        ConsolePrincipal p = principal(request);
        if (p == null || p.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN)) {
            return;
        }
        String owner = job == null ? null : job.getOwnerUsername();
        if (owner == null || owner.trim().isEmpty()) return; // legacy：连接级语义
        if (owner.trim().equals(p.getUsername())) return;
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "迁移作业 " + job.getJobId() + " 由 " + owner + " 创建：续跑/中止仅限创建者本人或 ADMIN。"
                        + "同连接其他成员可查看进度。");
    }

    private boolean connModel(HttpServletRequest request) {
        if (!pageAuthEnabled || envPagesResolver == null) return false;
        ConsolePrincipal principal = principal(request);
        // ADMIN 是全局超管：不受源连接写键/作业过滤限制
        if (principal != null && principal.getRole().atLeast(io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole.ADMIN)) {
            return false;
        }
        return principal != null && principal.getGrantedPages() != null
                && envPagesResolver.inConnModel(principal.getGrantedPages());
    }

    private static ConsolePrincipal principal(HttpServletRequest request) {
        Object attr = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        return attr instanceof ConsolePrincipal ? (ConsolePrincipal) attr : null;
    }

    private static Map<String, Object> ok(String key, Object value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ok", true);
        m.put(key, value);
        return m;
    }

    /** connId 非空优先用已存档案，否则沿用手输 conn。 */
    private RemoteClusterConn pick(RemoteClusterConn manual, String connId, HttpServletRequest request) {
        if (connId == null || connId.trim().isEmpty()) {
            return manual;
        }
        return storedConn(connId, request);
    }

    /**
     * 按 id 取已存档案（含密码，仅服务端流转）；不存在拒、登录角色低于档案 minRole 拒（403）。
     */
    private RemoteClusterConn storedConn(String connId, HttpServletRequest request) {
        RemoteClusterConn conn = connStore.get(connId.trim());
        if (conn == null) {
            throw new IllegalArgumentException("连接不存在或已被删除: " + connId);
        }
        ConsoleRole required = ConsoleRole.parse(conn.getMinRole());
        Object p = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        ConsoleRole actual = p instanceof ConsolePrincipal ? ((ConsolePrincipal) p).getRole() : ConsoleRole.VIEWER;
        if (!actual.atLeast(required)) {
            throw new SecurityException("当前角色无权使用该集群连接（需 " + required.name() + "）");
        }
        return conn;
    }
}
