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

package io.github.dengmeiluan.esquerystudio.console.observability;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleAuthInterceptor;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditEvent;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleOpsAuditStore;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsolePrincipal;
import io.github.dengmeiluan.esquerystudio.console.auth.ConsoleRole;
import io.github.dengmeiluan.esquerystudio.console.auth.PropertiesAuthDelegate;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.control.ConsoleSetupController;
import io.github.dengmeiluan.esquerystudio.console.control.ControlClusterResolver;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexRebuildService;
import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.console.core.IndexNameResolver;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import io.github.dengmeiluan.esquerystudio.console.insight.action.ConfirmTokenService;
import io.github.dengmeiluan.esquerystudio.console.insight.action.GuardedAction;
import io.github.dengmeiluan.esquerystudio.console.insight.action.GuardedActionExecutor;
import io.github.dengmeiluan.esquerystudio.console.insight.action.GuardedActionRegistry;
import io.github.dengmeiluan.esquerystudio.console.multicluster.EsClusterConnController;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import io.github.dengmeiluan.esquerystudio.console.web.InternalEsRebuildExceptionAdvice;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteEsClientFactory;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * (b)轨5【Java 全栈可观测】七件（Observability550 范式：Logback ListAppender
 * 直挂 logger 断言 WARN 事件；PropertiesAuthDelegate lastEndpointWarnAt 首败节流为同款范式）。
 * <b>全部改动 = 补 WARN 留痕 / 补错误码，返回值与控制流契约零变更</b>；TDD 先红后绿。
 *
 * <ol>
 *   <li>P1 jwt 臂验签失败 debug 静默 → PropertiesAuthDelegate claims==null 分支节流 WARN
 *       （secret/publicKey 配错全量验签失败时运维零痕；JwtVerifier catch→null 契约保持）。</li>
 *   <li>P1 advice assignableTypes 追加 validate 包 InternalConfigLabController 与 client 包
 *       DesiredStateController——两处业务 ISE（漂移无对象/期望配置序列化失败）不再落宿主 500
 *       拍平，返回结构化 {code,message}；既有 4 家覆盖零变动。</li>
 *   <li>P2 GuardedActionExecutor 审计序列化失败 catch 全静默 → WARN（高危动作审计丢失必须留痕）。</li>
 *   <li>P2 ConsoleAuthInterceptor connStore.getName 失败臂静默 → 节流 WARN
 *       （connName 恒 null 审计集群列说谎零痕；审计仍落、connName 仍 null 契约不变）。</li>
 *   <li>P2 ConsoleRole.parse 解析失败静默降 VIEWER → 节流 WARN（带原始串，不落 token/凭据；
 *       返回 VIEWER 契约不变）。</li>
 *   <li>P2 两处 inline 探测错误体：message null 兜底改中文 + 补 code:"PROBE_FAILED"
 *       （既有 ok/message 键保留零破坏）。</li>
 *   <li>P2 EsIndexRebuildService 三方法四处 catch(Exception) 把 registry 异常与「未注册直传」
 *       静默合流 → debug 留痕（带异常类名；未注册物理索引名直传是合法主路径，维持 debug
 *       不升 WARN 防刷屏；控制流零变更）。</li>
 * </ol>
 *
 * <p>桩基线：无 mockito（本仓惯例），HttpServletRequest/Response 动态代理桩
 * （Observability550 先例）；ControlClusterResolver / RemoteEsClientFactory 为非 final 类，
 * 测试匿名子类覆写（不改动黑名单文件本身）。</p>
 *
 * @author aicoding
 */
public class Observability558Test {

    /* ══ 第 1 件：jwt 臂验签失败节流 WARN ══ */

    private static final String JWT_WARN_MARKER = "jwt 验签失败";
    private static final String JWT_SECRET = "test-secret-558";

    /** PropertiesAuthDelegate jwt 模式组装（secret 配 HS256），并挂 ListAppender。 */
    private PropertiesAuthDelegate jwtDelegate(ListAppender<ILoggingEvent> appender) {
        appender.start();
        ((Logger) LoggerFactory.getLogger(PropertiesAuthDelegate.class)).addAppender(appender);
        ESQueryStudioElasticsearchProperties.Delegate props = new ESQueryStudioElasticsearchProperties.Delegate();
        props.setMode("jwt");
        props.getJwt().setSecret(JWT_SECRET);
        return new PropertiesAuthDelegate(props);
    }

    private void detach(Class<?> loggerClass, ListAppender<ILoggingEvent> appender) {
        ((Logger) LoggerFactory.getLogger(loggerClass)).detachAppender(appender);
    }

    /** 垃圾 token（三段但验签必败）：验签失败臂的确定性触发器。 */
    private HttpServletRequest badJwtRequest() {
        return headerRequest("Authorization", "garbage.header.sig");
    }

    /** 验签失败：返回 null 交回内置鉴权（契约不变）+ 必须落节流 WARN。 */
    @Test
    public void jwtVerifyFailureLeavesWarnAndStillFallsBack() {
        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        PropertiesAuthDelegate delegate = jwtDelegate(appender);
        try {
            ConsolePrincipal p = delegate.authenticate(badJwtRequest());

            assertNull("验签失败契约不变：仍返回 null 交回内置鉴权", p);
            assertTrue("jwt 验签失败必须落服务端 WARN（debug 级对运营不可见=secret 配错零痕）",
                    countWarn(appender, JWT_WARN_MARKER) >= 1);
        } finally {
            detach(PropertiesAuthDelegate.class, appender);
        }
    }

    /** 60s 节流：连续两次验签失败只落一条（防无效 token 高频探测刷屏）。 */
    @Test
    public void jwtVerifyFailureThrottledWithin60s() {
        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        PropertiesAuthDelegate delegate = jwtDelegate(appender);
        try {
            delegate.authenticate(badJwtRequest());
            delegate.authenticate(badJwtRequest());

            assertEquals("首条 WARN 后 60s 内必须静默（节流防刷屏）",
                    1, countWarn(appender, JWT_WARN_MARKER));
        } finally {
            detach(PropertiesAuthDelegate.class, appender);
        }
    }

    /** 合法 JWT（手签 HS256）：照常认出身份、零 WARN（升档不得误伤合法链路）。 */
    @Test
    public void jwtHappyPathStaysSilent() throws Exception {
        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        PropertiesAuthDelegate delegate = jwtDelegate(appender);
        try {
            /* 984：生产装配默认 require-exp=true（缺 exp 的令牌等同永久凭证），
               合法样本必须带未过期的数值 exp。 */
            String token = hs256(JWT_SECRET, "{\"sub\":\"u1\",\"roles\":[\"OPERATOR\"],\"exp\":"
                    + (System.currentTimeMillis() / 1000L + 3600L) + "}");
            ConsolePrincipal p = delegate.authenticate(headerRequest("Authorization", "Bearer " + token));

            assertNotNull("合法 token 必须照常认出（宿主身份语义不变）", p);
            assertEquals("u1", p.getUsername());
            assertEquals("升档只动失败臂：合法路径不得产生任何 WARN",
                    0, countWarn(appender, JWT_WARN_MARKER));
        } finally {
            detach(PropertiesAuthDelegate.class, appender);
        }
    }

    /* ══ 第 2 件：advice assignableTypes 追加两 controller ══ */

    /** 注解契约：6 家 controller 全在 assignableTypes（既有 4 家零变动 + 新增 2 家）。 */
    @Test
    public void adviceAssignableTypesCoversConfigLabAndDesiredState() {
        RestControllerAdvice anno =
                InternalEsRebuildExceptionAdvice.class.getAnnotation(RestControllerAdvice.class);
        assertNotNull("advice 的 @RestControllerAdvice 注解必须存在", anno);
        Set<String> names = new HashSet<String>();
        for (Class<?> t : anno.assignableTypes()) {
            names.add(t.getName());
        }
        assertTrue("validate 包 ConfigLab 场景（drift 无对象 ISE）必须被 advice 覆盖",
                names.contains("io.github.dengmeiluan.esquerystudio.console.validate.InternalConfigLabController"));
        assertTrue("client 包 DesiredState 场景（期望配置序列化 ISE）必须被 advice 覆盖",
                names.contains("io.github.dengmeiluan.esquerystudio.console.client.DesiredStateController"));
        // 既有 4 家零变动
        assertTrue(names.contains("io.github.dengmeiluan.esquerystudio.console.web.InternalEsIndexRebuildController"));
        assertTrue(names.contains("io.github.dengmeiluan.esquerystudio.console.multicluster.EsClusterConnController"));
        assertTrue(names.contains("io.github.dengmeiluan.esquerystudio.console.control.ConsoleSetupController"));
        assertTrue(names.contains("io.github.dengmeiluan.esquerystudio.console.adhoc.InternalAdhocRebuildController"));
    }

    /** 直调 advice：两处业务 ISE 转结构化 {code,message}（409 RULE_REJECTED），message 原文保留。 */
    @Test
    public void businessIllegalStateFromNewControllersBecomesStructuredJson() {
        InternalEsRebuildExceptionAdvice advice = new InternalEsRebuildExceptionAdvice();

        ResponseEntity<Map<String, Object>> driftIse = advice.illegalState(
                new IllegalStateException("当前宿主无注册 provider，无漂移检测对象"), null);
        assertEquals("业务 ISE 必须 409 结构化而非落宿主 500 拍平",
                HttpStatus.CONFLICT.value(), driftIse.getStatusCodeValue());
        assertEquals("RULE_REJECTED", driftIse.getBody().get("code"));
        assertTrue("message 原文必须保留（运维排障线索）",
                String.valueOf(driftIse.getBody().get("message")).contains("无漂移检测对象"));

        ResponseEntity<Map<String, Object>> desiredStateIse = advice.illegalState(
                new IllegalStateException("期望配置序列化失败"), null);
        assertEquals(HttpStatus.CONFLICT.value(), desiredStateIse.getStatusCodeValue());
        assertEquals("RULE_REJECTED", desiredStateIse.getBody().get("code"));
        assertEquals("期望配置序列化失败", desiredStateIse.getBody().get("message"));
    }

    /* ══ 第 3 件：GuardedActionExecutor 审计序列化失败 WARN ══ */

    /** 最小 GuardedAction 桩：execute 返回可控 result（注入 Jackson 无法序列化的自引用 map）。 */
    static class StubAction implements GuardedAction {
        Map<String, Object> resultToReturn = new LinkedHashMap<String, Object>();

        @Override public String id() { return "stub-action"; }
        @Override public ConsoleRole minRole() { return ConsoleRole.VIEWER; }
        @Override public String riskLevel() { return GuardedAction.RISK_LOW; }
        @Override public boolean supportsDryRun() { return false; }
        @Override public Map<String, Object> estimate(Map<String, Object> params) {
            return new LinkedHashMap<String, Object>();
        }
        @Override public Map<String, Object> dryRun(Map<String, Object> params) {
            return new LinkedHashMap<String, Object>();
        }
        @Override public Map<String, Object> execute(Map<String, Object> params) {
            return resultToReturn;
        }
    }

    /** 记录型审计 store：record 计数（序列化失败时必须是 0——审计确实丢了）。 */
    static class RecordingAuditStore implements ConsoleOpsAuditStore {
        final List<ConsoleOpsAuditEvent> records = new ArrayList<ConsoleOpsAuditEvent>();

        @Override public void record(ConsoleOpsAuditEvent event) {
            records.add(event);
        }

        @Override public List<ConsoleOpsAuditEvent> search(String username, String action,
                                                           int size, int from, Long sinceMs) {
            return Collections.emptyList();
        }
    }

    /** result 含不可序列化对象 → snapshot 序列化必败 → 此前 catch(Exception ignore) 全静默=审计黑洞无痕。 */
    @Test
    public void auditSerializationFailureLeavesWarnAndKeepsReceipt() throws IOException {
        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(GuardedActionExecutor.class)).addAppender(appender);
        try {
            StubAction action = new StubAction();
            // Jackson 默认 FAIL_ON_EMPTY_BEANS：无属性 Object 序列化必抛 JsonMappingException
            // （可捕获的普通异常；注意不能用 Map 自引用——那会 StackOverflowError，属 Error 不可捕获）
            action.resultToReturn.put("unserializable", new Object());
            RecordingAuditStore store = new RecordingAuditStore();
            ConfirmTokenService tokens = new ConfirmTokenService();
            GuardedActionExecutor executor = new GuardedActionExecutor(
                    new GuardedActionRegistry(Collections.<GuardedAction>singletonList(action)),
                    tokens, store);
            ConsolePrincipal principal = new ConsolePrincipal("u1", ConsoleRole.ADMIN, false);

            Map<String, Object> params = Collections.<String, Object>singletonMap("index", "foo");
            String token = tokens.issue("stub-action", params);
            Map<String, Object> receipt = executor.execute("stub-action", params, token, principal);

            assertNotNull("主流程契约不变：回执照常返回（审计失败绝不反噬业务）", receipt.get("receiptId"));
            assertEquals("审计确实丢失（序列化失败臂真实命中）", 0, store.records.size());
            assertTrue("高危动作审计丢失必须留痕（此前全静默）",
                    countWarn(appender, "护栏动作审计") >= 1);
        } finally {
            detach(GuardedActionExecutor.class, appender);
        }
    }

    /* ══ 第 4 件：ConsoleAuthInterceptor connStore.getName 失败臂节流 WARN ══ */

    private static final String CONN_NAME_WARN_MARKER = "审计集群实名解析失败";

    /** getName 必抛的 ConnStore 桩（连接档案瞬态不可用场景）。 */
    private io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore throwingConnStore() {
        return new io.github.dengmeiluan.esquerystudio.console.multicluster.ConnStore() {
            @Override public List<Map<String, Object>> list() { return Collections.emptyList(); }
            @Override public RemoteClusterConn get(String id) { return null; }
            @Override public String getName(String id) { throw new IllegalStateException("conn store down"); }
            @Override public String getVersion(String id) { return null; }
            @Override public Map<String, Object> save(String id, String name, String url, String username,
                                                      String password, String minRole, Integer connectTimeoutMs,
                                                      Integer socketTimeoutMs, String env) {
                return Collections.emptyMap();
            }
            @Override public void updateVersion(String id, String esVersion) { }
            @Override public void delete(String id) { }
        };
    }

    /** afterCompletion ×2（同一拦截器实例）：WARN 恰 1 条 + 审计仍落、connName 仍 null（契约不变）。 */
    @Test
    public void connNameLookupFailureLeavesThrottledWarnAndAuditStillRecords() {
        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(ConsoleAuthInterceptor.class)).addAppender(appender);
        try {
            RecordingAuditStore store = new RecordingAuditStore();
            ConsoleAuthInterceptor interceptor = new ConsoleAuthInterceptor(
                    null, store, null, null, false, null, throwingConnStore());
            ConsolePrincipal principal = new ConsolePrincipal("u1", ConsoleRole.OPERATOR, false);

            interceptor.afterCompletion(auditRequest(principal), statusResponse(), null, null);
            interceptor.afterCompletion(auditRequest(principal), statusResponse(), null, null);

            assertEquals("同一拦截器实例 60s 内只落一条（审计高频路径靠节流防刷屏）",
                    1, countWarn(appender, CONN_NAME_WARN_MARKER));
            assertEquals("审计契约不变：事件照常落档", 2, store.records.size());
            for (ConsoleOpsAuditEvent e : store.records) {
                assertEquals("connId 照常采集", "conn-1", e.getConnId());
                assertNull("connName 仍 null（尽力而为语义不变）", e.getConnName());
            }
        } finally {
            detach(ConsoleAuthInterceptor.class, appender);
        }
    }

    /* ══ 第 5 件：ConsoleRole.parse 失败降 VIEWER 补节流 WARN ══ */

    /**
     * 枚举静态节流器是 JVM 级状态：测试前反射重置（产线字段刻意声明为非 final 便于复位，
     * 防其他用例先触发 parse 失败把本用例的节流窗口吃掉）。
     */
    @Test
    public void roleParseFallbackLeavesThrottledWarnWithRawString() throws Exception {
        Field throttle = ConsoleRole.class.getDeclaredField("lastParseWarnAt");
        throttle.setAccessible(true);
        throttle.set(null, new AtomicLong(0));

        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        appender.start();
        ((Logger) LoggerFactory.getLogger(ConsoleRole.class)).addAppender(appender);
        try {
            assertEquals("降 VIEWER 契约不变", ConsoleRole.VIEWER, ConsoleRole.parse("GODMODE"));
            assertEquals(ConsoleRole.VIEWER, ConsoleRole.parse("GODMODE"));

            assertEquals("同一未知串连续两次只落一条（节流防刷屏）",
                    1, countWarn(appender, "无法识别的角色串"));
            assertTrue("WARN 必须带原始串（排障线索；不落 token/凭据）",
                    appender.list.stream().anyMatch(e -> e.getLevel() == Level.WARN
                            && e.getFormattedMessage().contains("GODMODE")));

            int before = countWarn(appender, "无法识别的角色串");
            assertEquals("合法角色解析照常（零 WARN）", ConsoleRole.ADMIN, ConsoleRole.parse("ADMIN"));
            assertEquals("null 入参契约不变", ConsoleRole.VIEWER, ConsoleRole.parse(null));
            assertEquals("合法路径与 null 不得新增 WARN", before, countWarn(appender, "无法识别的角色串"));
        } finally {
            detach(ConsoleRole.class, appender);
        }
    }

    /* ══ 第 6 件：inline 探测错误体 code:"PROBE_FAILED" + 中文兜底 ══ */

    /** 探测必败的 client factory 桩（build 即抛，不碰网络）。 */
    private RemoteEsClientFactory factoryThrowing(final RuntimeException boom) {
        return new RemoteEsClientFactory(1000, 1000) {
            @Override public RestHighLevelClient build(RemoteClusterConn conn) {
                throw boom;
            }
        };
    }

    private static Map<String, String> probeBody() {
        Map<String, String> body = new HashMap<String, String>();
        body.put("url", "http://127.0.0.1:9200");
        return body;
    }

    /** 异常无 message（如 NPE 类裸抛）：中文兜底 + code 键，ok/message 既有键保留。 */
    @Test
    public void connTestProbeFailureCarriesProbeFailedCodeAndChineseFallback() {
        EsClusterConnController controller = new EsClusterConnController(
                null, null, factoryThrowing(new RuntimeException()), null);

        Map<String, Object> out = controller.test(probeBody());

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertEquals("错误体必须带 code 键（与 advice 路径 {code,message} 双轨对齐）",
                "PROBE_FAILED", out.get("code"));
        assertEquals("message null 兜底必须是中文（此前裸落异常类名，用户无从下手）",
                "连接探测失败(未知异常类型)", out.get("message"));
    }

    /** 异常带 message：原文保留（零破坏）+ code 键照补。 */
    @Test
    public void connTestProbeFailureKeepsOriginalMessage() {
        EsClusterConnController controller = new EsClusterConnController(
                null, null, factoryThrowing(new IllegalStateException("connect refused: i/o boom")), null);

        Map<String, Object> out = controller.test(probeBody());

        assertEquals(Boolean.FALSE, out.get("ok"));
        assertEquals("PROBE_FAILED", out.get("code"));
        assertEquals("有 message 时原文保留（零破坏）", "connect refused: i/o boom", out.get("message"));
    }

    /** ConsoleSetupController.test 同款：中文兜底 + code 键。 */
    @Test
    public void setupTestProbeFailureCarriesProbeFailedCodeAndChineseFallback() {
        ControlClusterResolver unbound = new ControlClusterResolver(null, null, null, null, null, null) {
            @Override public boolean bound() { return false; }
        };
        ConsoleSetupController controller = new ConsoleSetupController(
                unbound, factoryThrowing(new RuntimeException()), null, null, "test-app", true);

        ResponseEntity<Map<String, Object>> resp = controller.test(probeBody());

        assertEquals(HttpStatus.OK.value(), resp.getStatusCodeValue());
        assertEquals(Boolean.FALSE, resp.getBody().get("ok"));
        assertEquals("PROBE_FAILED", resp.getBody().get("code"));
        assertEquals("连接探测失败(未知异常类型)", resp.getBody().get("message"));
    }

    /* ══ 第 7 件：EsIndexRebuildService catch 臂 debug 留痕 ══ */

    @Document(indexName = "alias_558")
    static class FooES { }

    /** 记录解析结果的 admin 桩：getWriteIndex 必抛（resolveToPhysical 第二臂触发器）。 */
    static class InspectingAdmin extends EsIndexAdmin {
        String lastResolved;

        InspectingAdmin() {
            super(null);
        }

        @Override public Map<String, Object> inspect(String name, int size) {
            lastResolved = name;
            return Collections.<String, Object>singletonMap("index", name);
        }

        @Override public Map<String, Object> queryDsl(String name, String dslJson, int size) throws IOException {
            lastResolved = name;
            return Collections.<String, Object>singletonMap("took", 1);
        }

        @Override public String getWriteIndex(String alias) throws IOException {
            throw new IllegalStateException("write-index boom");
        }
    }

    /** "raw-idx" 未注册（getByKey 抛 ISE），其余键返回固定 meta（别名解析成功路径）。 */
    private IndexMetaRegistry mixedRegistry() {
        return new IndexMetaRegistry(null, Collections.<ManagedEsIndex>emptyList()) {
            @Override public RebuildableIndexMeta getByKey(String indexKey) {
                if ("raw-idx".equals(indexKey)) {
                    throw new IllegalStateException("registry boom");
                }
                return new RebuildableIndexMeta(
                        (ManagedEsIndex) () -> FooES.class, "alias_558", "alias_558", null, "{}");
            }
        };
    }

    /**
     * 四处 catch 臂（inspect/queryDsl/resolveToPhysical×2）：debug 留痕带异常类名 +
     * 「未注册直传/回退别名」契约零变更。
     */
    @Test
    public void registryMissLeavesDebugTraceWithExceptionClassName() throws IOException {
        Logger svcLogger = (Logger) LoggerFactory.getLogger(EsIndexRebuildService.class);
        svcLogger.setLevel(Level.DEBUG);
        ListAppender<ILoggingEvent> appender = new ListAppender<ILoggingEvent>();
        appender.start();
        svcLogger.addAppender(appender);
        try {
            ESQueryStudioElasticsearchProperties props = new ESQueryStudioElasticsearchProperties();
            InspectingAdmin admin = new InspectingAdmin();
            EsIndexRebuildService svc = new EsIndexRebuildService(mixedRegistry(), admin, null,
                    new IndexNameResolver(admin, props, null), props);

            // 未注册物理索引名直传：合法主路径，契约不变（resolved=原名）
            Map<String, Object> inspected = svc.inspect("raw-idx", 10);
            assertEquals("inspect 未注册直传契约不变", "raw-idx", inspected.get("index"));
            svc.queryDsl("raw-idx", "{\"query\":{}}", 10);
            assertEquals("queryDsl 未注册直传契约不变", "raw-idx", admin.lastResolved);
            assertEquals("resolveToPhysical 未注册回原名契约不变", "raw-idx", svc.resolveToPhysical("raw-idx"));
            // 第二臂：别名解析成功但 getWriteIndex 失败 → 回退别名
            assertEquals("resolveToPhysical 写索引失败回退别名契约不变",
                    "alias_558", svc.resolveToPhysical("aliased"));

            long debugWithClassName = appender.list.stream()
                    .filter(e -> e.getLevel() == Level.DEBUG)
                    .filter(e -> e.getFormattedMessage().contains("java.lang.IllegalStateException"))
                    .count();
            assertTrue("四处 catch 臂必须 debug 留痕（带异常类名，此前与「未注册」静默合流零痕）",
                    debugWithClassName >= 4);
        } finally {
            svcLogger.detachAppender(appender);
            svcLogger.setLevel(null);
        }
    }

    /* ── 通用桩与工具 ── */

    /** 只认单个 header 的请求桩（jwt 用例：getHeader(tokenHeader) 返回可切换凭据）。 */
    private HttpServletRequest headerRequest(final String name, final String value) {
        InvocationHandler handler = (proxy, method, args) -> {
            if ("getHeader".equals(method.getName()) && name.equals(args[0])) {
                return value;
            }
            Class<?> rt = method.getReturnType();
            if (rt == boolean.class) {
                return false;
            }
            return null;
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                Observability558Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, handler);
    }

    /** 审计路径请求桩：POST 非只读、X-Es-Target=conn-1、principal/startMs 属性就位。 */
    private HttpServletRequest auditRequest(final ConsolePrincipal principal) {
        final long start = System.currentTimeMillis();
        InvocationHandler handler = (proxy, method, args) -> {
            String name = method.getName();
            if ("getMethod".equals(name)) {
                return "POST";
            }
            if ("getRequestURI".equals(name)) {
                return "/internal/es/index/cluster/update-document";
            }
            if ("getContextPath".equals(name)) {
                return "";
            }
            if ("getHeader".equals(name) && "X-Es-Target".equals(args[0])) {
                return "conn-1";
            }
            if ("getAttribute".equals(name)) {
                String attr = (String) args[0];
                // ATTR_START_MS 是包级常量，此处用字面量（与源码 es.console.audit.startMs 同值）
                if ("es.console.audit.startMs".equals(attr)) {
                    return start;
                }
                if (ConsoleAuthInterceptor.ATTR_PRINCIPAL.equals(attr)) {
                    return principal;
                }
                return null;
            }
            if ("getRemoteAddr".equals(name)) {
                return "127.0.0.1";
            }
            Class<?> rt = method.getReturnType();
            if (rt == boolean.class) {
                return false;
            }
            return null;
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                Observability558Test.class.getClassLoader(),
                new Class<?>[]{HttpServletRequest.class}, handler);
    }

    private HttpServletResponse statusResponse() {
        InvocationHandler handler = (proxy, method, args) -> {
            if ("getStatus".equals(method.getName())) {
                return 200;
            }
            Class<?> rt = method.getReturnType();
            if (rt == boolean.class) {
                return false;
            }
            return null;
        };
        return (HttpServletResponse) Proxy.newProxyInstance(
                Observability558Test.class.getClassLoader(),
                new Class<?>[]{HttpServletResponse.class}, handler);
    }

    /** 手签 HS256 token（JwtVerifier 白名单内合法链路）。 */
    private static String hs256(String secret, String payloadJson) throws Exception {
        String header = base64Url("{\"alg\":\"HS256\"}".getBytes("UTF-8"));
        String body = base64Url(payloadJson.getBytes("UTF-8"));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes("UTF-8"), "HmacSHA256"));
        String sig = base64Url(mac.doFinal((header + "." + body).getBytes("UTF-8")));
        return header + "." + body + "." + sig;
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private int countWarn(ListAppender<ILoggingEvent> appender, String marker) {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && e.getFormattedMessage().contains(marker)) {
                n++;
            }
        }
        return n;
    }
}
