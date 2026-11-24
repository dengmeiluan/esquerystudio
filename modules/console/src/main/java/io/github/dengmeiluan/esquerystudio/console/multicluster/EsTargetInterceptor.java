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

import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleConnVisibility;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;

/**
 * 目标集群拦截器（把请求头 {@code X-Es-Target: <connId>} 绑定到
 * {@link EsClientRouter} 的 ThreadLocal，数据面操作即刻切到目标集群。
 *
 * <p><b>白名单语义</b>：只有数据面通道（URI 含 {@code /cluster/}、{@code /insight}、
 * {@code /config-lab/validate}，或以 {@code /adhoc-rebuild/prepare}、{@code /adhoc-rebuild/start}
 * 结尾）跟随目标头；控制面端点（登录鉴权、provider 重建、adhoc 的 status/jobs/abort/
 * confirm-switch、config-lab 漂移检测、连接管理本身）无视目标头、恒定作用于宿主集群——
 * 远程集群上不存在 provider/作业/锁，跟随只会制造错觉与事故。</p>
 *
 * <p><b> 缺陷 A 修复</b>：config-lab 的 validate（Dry-run 临时索引试建）改为数据面——
 * 不同版本集群对同一配置的裁决本就不同（如 6.x 需 type 包裹、分词器插件差异），Dry-run 只有
 * 打目标集群才有意义；且校验器页面的「导入现有索引」「校验通过建索引」本就走 /cluster/**
 * 跟随目标，validate 恒定宿主会造成同页三个动作两种目标的语义撕裂。drift 依赖宿主 provider
 * 注册表，维持宿主专属。</p>
 *
 * <p><b> 集群级权限隔离</b>：绑定前校验当前登录角色是否满足连接档案的 minRole，
 * 不满足回 403 {@code CONN_FORBIDDEN}；档案已删回 404 友好文案。principal 由
 * {@link ConsoleAuthInterceptor} 先行存入 request attribute（注册时以 order 保证先后）。</p>
 *
 * <p><b>.2 宿主集群隐藏模式</b>：{@code host-cluster-visible=false}（纯管理平台形态）时，
 * 数据面请求必须携带连接档案目标，无目标或目标为 host 直接 403 {@code HOST_DISABLED}——
 * 前端藏入口只是体验，后端拒绝才是防线（控制集群仅存元数据，不得被当成数据面目标直捣）。</p>
 *
 * @author aicoding
 */
public class EsTargetInterceptor implements HandlerInterceptor {

    /** 前端切换器写入的目标头：connId 或 {@code host}。 */
    public static final String HEADER = "X-Es-Target";

    private final EsClientRouter router;
    private final ConnStore connStore;
    private final boolean hostVisible;

    public EsTargetInterceptor(EsClientRouter router, ConnStore connStore, boolean hostVisible) {
        this.router = router;
        this.connStore = connStore;
        this.hostVisible = hostVisible;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String target = request.getHeader(HEADER);
        /* 必须用鉴权层归一化后的路径判定数据面：裸 URI 的 ;矩阵参数 会让
           /cluster;x=1/delete-index 漏判为控制面并清掉目标绑定，实际执行落到宿主。 */
        Object normalized = request.getAttribute(ConsoleAuthInterceptor.ATTR_NORMALIZED_PATH);
        String uri = normalized instanceof String && !((String) normalized).isEmpty()
                ? (String) normalized : request.getRequestURI();
        // insight 分析器属数据面，同样跟随目标头（否则分析恒打宿主集群）
        // config-lab/validate 的 Dry-run 同样跟随目标头（版本差异下裁决结果不同）
        // target-aware adhoc：prepare/start 是数据面入口——重建必须作用于用户当前选中的集群；
        //   其余 adhoc 端点（status/jobs/abort/confirm-switch）查的是宿主控制面的作业/存储，维持控制面
        /* /progress 直接走 EsIndexAdmin（路由感知）：远端 delete/update-by-query 的任务
           进度必须查发起任务的集群，不能恒定回落宿主。
           判定与审计归属共用 ConsoleAuthInterceptor.followsTarget，防执行/记账两套口径。 */
        boolean dataPlane = ConsoleAuthInterceptor.followsTarget(uri, request.getMethod());
        Object p = request.getAttribute(ConsoleAuthInterceptor.ATTR_PRINCIPAL);
        ConsolePrincipal principal = p instanceof ConsolePrincipal ? (ConsolePrincipal) p : null;
        String tid = target == null || target.trim().isEmpty()
                ? EsClientRouter.HOST : target.trim();
        if (dataPlane && !hostVisible && EsClientRouter.HOST.equalsIgnoreCase(tid)) {
            deny(response, 403, "{\"code\":\"HOST_DISABLED\",\"message\":\"当前部署未开放宿主集群，请先在顶栏选择集群连接\"}");
            return false;
        }
        if (dataPlane) {
            /* 连接隔离必须在目标绑定点完成：页面门只看“有没有某页授权”，不知道用户
               能不能看这条连接。纯 conn 模型用户带别人的 X-Es-Target、或省略头回落到
               宿主，都必须在这里被挡住——前端 canSeeConn 只是体验层。 */
            if (EsClientRouter.HOST.equalsIgnoreCase(tid)) {
                if (!ConsoleConnVisibility.canSeeHost(principal)) {
                    deny(response, 403, "{\"code\":\"CONN_FORBIDDEN\",\"message\":\"当前身份未获宿主集群授权\"}");
                    return false;
                }
            } else {
                // 每次绑定都回查档案——minRole/页面授权改动即刻生效，不留权限缓存窗口
                RemoteClusterConn conn = connStore.get(tid);
                if (conn == null) {
                    deny(response, 404, "{\"code\":\"CONN_NOT_FOUND\",\"message\":\"连接不存在或已被删除\"}");
                    return false;
                }
                if (!ConsoleConnVisibility.canSeeResolved(principal, tid, conn)) {
                    ConsoleRole required = ConsoleRole.parse(conn.getMinRole());
                    /* 两种不可见分开说：角色不足=升角色；角色够但页面授权缺失=去宿主系统勾选
                       （产线实报混用误导——提示升角色对缺页面授权的用户根本解决不了）。 */
                    boolean roleShort = principal == null || !principal.getRole().atLeast(required);
                    String msg = roleShort
                            ? "当前角色无权访问该集群连接（需 " + required.name() + " 及以上），请联系管理员调整连接的最低角色或切换其他集群目标"
                            : "该集群连接未授权给当前身份，请联系管理员在宿主系统勾选该连接的页面授权";
                    deny(response, 403, "{\"code\":\"CONN_FORBIDDEN\",\"message\":\"" + msg.replace("\"", "\\\"")
                            + "\",\"required\":\"" + required.name() + "\"}");
                    return false;
                }
            }
        }
        if (dataPlane && target != null && !target.trim().isEmpty()) {
            router.bind(tid);
        } else {
            router.clear(); // 容器线程复用：无头/控制面请求必须清残留
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        router.clear();
    }

    private static void deny(HttpServletResponse response, int status, String body) throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
    }
}
