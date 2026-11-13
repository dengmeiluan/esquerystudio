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

import org.junit.Test;

import static org.junit.Assert.assertEquals;

/**
 * requiredRole 映射锚点——自助流水 {@code /auth/ops-audit/mine} 全角色可看（VIEWER），
 * 全量审计 {@code /auth/ops-audit} 保持 rank3（AUDIT_OP/CLUSTER_OP/REBUILD_OP/ADMIN），
 * 防自助通道把全量审计门槛拉低；顺手锚住点名的两档高危映射（删索引/用户管理）。
 */
public class ConsoleAuthInterceptorRoleMapTest {

    @Test
    public void 自助流水_mine_任何已认证身份可看() {
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/ops-audit/mine"));
    }

    @Test
    public void 全量审计_opsAudit_仍需rank3() {
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/ops-audit"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/ops-audit?username=a"));
    }

    @Test
    public void mine特例不被AUDIT前缀吞_判定顺序锚() {
        /* containsAny(AUDIT_KEYWORDS) 用 contains("/auth/ops-audit")——/mine 同前缀，
           特例必须先于关键词块命中（防回归：把特例挪到块后立刻 rank3） */
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/ops-audit/mine"));
    }

    @Test
    public void 删索引删文档保持rank3_用户管理保持ADMIN() {
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/delete-index"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/delete-by-id"));
        assertEquals(ConsoleRole.ADMIN,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/users"));
    }

    @Test
    public void GET读端点不因写关键词提档() {
        /* /cluster/ilm/policies 含 /cluster/ilm/policy 子串，但 GET 是观测读，不能提 rank3。 */
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/cluster/ilm/policies"));
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/cluster/ilm/explain"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/ilm/start"));
    }

    @Test
    public void 危险级重划_观测读降档与漏网写升档() {
        /* adhoc 的 GET（任务列表/就绪检查）是观测面：裸词 "/adhoc-rebuild" 退役后 VIEWER 可读 */
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/adhoc-rebuild/jobs"));
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/adhoc-rebuild/prepare"));
        /* adhoc 写动词逐一列出，rank3 不变 */
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/adhoc-rebuild/start"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/adhoc-rebuild/abort"));
        /* 漏网写升 rank3：删备份 / ILM 策略变更 / SLM 执行（原先落缺省 OPERATOR） */
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("DELETE", "/internal/es/index/cluster/snapshot/delete"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("PUT", "/internal/es/index/cluster/ilm/policy"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("DELETE", "/internal/es/index/cluster/ilm/policy"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/slm/execute"));
    }

    @Test
    public void reindexAdvanced写端点升rank3() {
        /* reindex-advanced（@PostMapping cluster/reindex-advanced）是与 /rebuild 同族的重建写端点，
           原先落缺省 OPERATOR；升 rank3（该端点无 GET 形态，裸词不误伤观测面） */
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/reindex-advanced"));
    }

    @Test
    public void 文档编辑保持OPERATOR_查询类POST保持VIEWER() {
        assertEquals(ConsoleRole.OPERATOR,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/update-document"));
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/query"));
    }

    @Test
    public void 迁移探测面与迁移写同档rank3_防VIEWER_SSRF与环境变量读取() {
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/xmigrate/connect-check"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/xmigrate/fetch-config"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/xmigrate/resolve-preview"));
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/xmigrate/preflight"));
    }

    @Test
    public void SQL控制台与索引settings影响分析_只读POST归VIEWER() {
        /* /cluster/sql 裸路径（纯文本 SQL，零写入）此前只列了 /cluster/sql/ 带尾斜杠，
           VIEWER 用 SQL 控制台直接 403；contains 前缀同时覆盖 sql/query 等子路径 */
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/sql"));
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/cluster/sql/query"));
        /* InsightController settings-impact 是只读影响分析（热Setting页只读预览），
           原先漏清单落 OPERATOR → VIEWER 403 */
        assertEquals(ConsoleRole.VIEWER,
                ConsoleAuthInterceptor.requiredRole("POST", "/internal/es/index/insight/settings-impact"));
    }

    @Test
    public void 审计值建议归rank3_不再对VIEWER开放() {
        assertEquals(ConsoleRole.REBUILD_OP,
                ConsoleAuthInterceptor.requiredRole("GET", "/internal/es/index/auth/audit-facets"));
    }
}
