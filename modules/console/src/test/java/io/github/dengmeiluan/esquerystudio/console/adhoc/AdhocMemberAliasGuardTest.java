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

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * 直连重建的<b>成员别名安全门</b>：删除物理索引会连带断开其所属别名的成员关系，
 * 业务侧查询将失效——源物理索引还是其他别名的成员时，直连切换（删旧物理 + 以旧名
 * 建别名）会让那些别名失去唯一成员、业务查询 404。
 *
 * <p>三层防线各自的可观测面：</p>
 * <ul>
 *   <li>prepare 透出 {@code memberAliases}（信息层：向导据此显示警示与别名 chip）；
 *       反查失败容忍回空列表，不得反噬 prepare；</li>
 *   <li>start 直连模式 + 成员别名非空 → IllegalArgumentException 硬拒（消息点名别名，
 *       引导改用别名入口），且拒绝发生在取锁/建作业之前；</li>
 *   <li>start 反查失败 → 保守拒绝（fail-closed）：无法确认成员身份时放行，等于安全门
 *       在 ES 抖动的瞬间失效。</li>
 * </ul>
 *
 * <p>别名模式（isAlias）不受门禁影响：别名切换是 write-index swap，不动成员关系。</p>
 *
 * <p>桩式样与 {@code Observability554Test} 同源：admin 匿名子类桩掉探测方法
 * （EsFakeClients 实体过不了高层 RHLC 解析），低层 REST（_alias/_settings/_count）
 * 交给 scripted 假 client 按端点应答。</p>
 */
public class AdhocMemberAliasGuardTest {

    private static final String PHYS = "qa_bond_basic_adhoc_20260806134223";
    private static final String BIZ_ALIAS = "qa_onshore-bond-basic_bond_basic_asset_basic_info";

    /** 直连物理索引最小 admin 桩：非别名 + 索引存在 + mapping 给定。 */
    private static EsIndexAdmin physicalAdmin() {
        return new EsIndexAdmin(null) {
            @Override
            public boolean aliasExists(String alias) {
                return false;
            }

            @Override
            public boolean indexExists(String index) {
                return true;
            }

            @Override
            public String getMapping(String index) {
                return "{\"properties\":{\"created_at\":{\"type\":\"date\"}}}";
            }
        };
    }

    /** 别名模式最小 admin 桩（AdhocStartLockTest.StartableAdmin 同款先例）。 */
    private static EsIndexAdmin aliasAdmin() {
        return new EsIndexAdmin(null) {
            @Override
            public boolean aliasExists(String alias) throws IOException {
                return true;
            }

            @Override
            public String getWriteIndex(String alias) throws IOException {
                return "src_phys";
            }

            @Override
            public boolean indexExists(String index) throws IOException {
                return false;
            }

            @Override
            public String getMapping(String index) throws IOException {
                return "{\"properties\":{\"created_at\":{\"type\":\"date\"}}}";
            }
        };
    }

    /** scripted client：_alias/{PHYS} 回成员别名表，其余探测端点给最小合法响应。 */
    private static RestHighLevelClient clientWithMemberAliases() {
        return EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod()) && ("/_alias/" + PHYS).equals(req.getEndpoint())) {
                return "{\"" + PHYS + "\":{\"aliases\":{\"" + BIZ_ALIAS + "\":{},\"qa_extra_alias\":{}}}}";
            }
            if ("GET".equals(req.getMethod()) && ("/" + PHYS + "/_settings").equals(req.getEndpoint())) {
                return "{}";
            }
            if ("GET".equals(req.getMethod()) && ("/" + PHYS + "/_count").equals(req.getEndpoint())) {
                return "{\"count\":7}";
            }
            throw EsFakeClients.responseException(503, "{\"error\":{}}");
        });
    }

    /** scripted client：_alias 反查不可达（503，非 404），其余探测端点给最小合法响应。 */
    private static RestHighLevelClient clientWithAliasProbeFailure() {
        return EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod()) && ("/" + PHYS + "/_settings").equals(req.getEndpoint())) {
                return "{}";
            }
            throw EsFakeClients.responseException(503, "{\"error\":{}}");
        });
    }

    private static AdhocRebuildService service(EsIndexAdmin admin, RestHighLevelClient client) {
        return new AdhocRebuildService(admin, () -> client, 600_000L, null, 3_600_000L,
                new InMemoryAdhocJobStore());
    }

    private static Map<String, Object> directReq() {
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("index", PHYS);
        req.put("strategy", "MANUAL");
        req.put("confirmDirectSwap", true);
        req.put("destIndex", "qa_bond_basic_v2");
        req.put("settingsJson", "{\"index\":{}}");
        req.put("mappingJson", "{\"properties\":{}}");
        return req;
    }

    /* ══ prepare：信息透出 ══ */

    /** prepare 必须把源物理索引的成员别名列表原样透出——向导警示与 chip 的唯一数据源。 */
    @Test
    public void prepareReturnsMemberAliasesOfSourcePhysical() throws Exception {
        Map<String, Object> out = service(physicalAdmin(), clientWithMemberAliases()).prepare(PHYS);
        assertThat((java.util.List<?>) out.get("memberAliases"))
                .as("成员别名表须含业务别名与附加别名（ES 返回序）")
                .containsExactly(BIZ_ALIAS, "qa_extra_alias");
    }

    /** 反查失败容忍：回空列表，prepare 整体不反噬（信息层失败不该挡住向导探测）。 */
    @Test
    public void prepareToleratesMemberAliasProbeFailure() throws Exception {
        Map<String, Object> out = service(physicalAdmin(), clientWithAliasProbeFailure()).prepare(PHYS);
        assertThat((java.util.List<?>) out.get("memberAliases"))
                .as("_alias 反查 503 时按空列表返回，不得反噬 prepare")
                .isNotNull()
                .isEmpty();
    }

    /* ══ start：直连安全门 ══ */

    /** 直连 + 成员别名非空 → IAE 硬拒，消息点名别名并引导改用别名入口。 */
    @Test
    public void startRejectsDirectModeWhenPhysicalIsAliasMember() {
        AdhocRebuildService svc = service(physicalAdmin(), clientWithMemberAliases());

        Throwable thrown = catchThrowable(() -> svc.start(directReq()));

        assertThat(thrown)
                .as("源物理索引还是业务别名的成员，直连切换会删除它并连带断开别名——必须硬拒")
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(String.valueOf(thrown.getMessage()))
                .as("错误消息须点名源物理索引、成员别名与建议入口，否则用户无从纠正")
                .contains(PHYS)
                .contains(BIZ_ALIAS)
                .contains("请改用别名名");
        assertThat(svc.listJobs())
                .as("被安全门拒绝的 start 不得留下作业记录")
                .isEmpty();
    }

    /** 别名模式不受门禁影响：别名切换是 write-index swap，不动成员关系。 */
    @Test
    public void startAcceptsAliasModeRegardlessOfMemberAliases() throws Exception {
        /* client 对 _alias 端点全部 503：别名模式下 start 不反查成员别名（无直连门），
           getWriteIndex 走 admin 桩——若实现误把门禁加到别名模式，这里会炸。 */
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("index", "my_alias");
        req.put("strategy", "MANUAL");
        req.put("settingsJson", "{\"index\":{}}");
        req.put("mappingJson", "{\"properties\":{}}");

        Map<String, Object> out = service(aliasAdmin(), clientWithAliasProbeFailure()).start(req);

        assertThat(out.get("jobId"))
                .as("别名模式照常可启动（成员别名门只限直连模式）")
                .isNotNull();
    }

    /** 直连反查失败 → 保守拒绝（fail-closed）：门禁只在「确认非空」上拒绝的对称面。 */
    @Test
    public void startFailsClosedWhenMemberAliasProbeFails() {
        AdhocRebuildService svc = service(physicalAdmin(), clientWithAliasProbeFailure());

        Throwable thrown = catchThrowable(() -> svc.start(directReq()));

        assertThat(thrown)
                .as("无法确认成员身份就放行 = 安全门在 ES 抖动的瞬间静默失效，必须保守拒绝")
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("无法确认索引");
        assertThat(svc.listJobs())
                .as("保守拒绝的 start 不得留下作业记录")
                .isEmpty();
    }
}
