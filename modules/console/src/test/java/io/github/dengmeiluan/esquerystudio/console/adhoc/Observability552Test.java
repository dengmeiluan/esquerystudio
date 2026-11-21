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

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.github.dengmeiluan.esquerystudio.console.control.ControlIndexInitializer;
import io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.elasticsearch.client.EsFakeClients;
import org.elasticsearch.client.RestHighLevelClient;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 静默臂治理三态收口（Observability550/551 范式：ListAppender 直挂 logger +
 * 契约反锁双形态）。<b>返回值/降级语义零改动</b>（吞异常契约逐字节不动，只加日志或注释记档），
 * TDD 先红后绿。
 *
 * <ol>
 *   <li>{@link AdhocRebuildService#resolveFieldType}（原 :1094）{@code catch(Exception)}
 *       fallthrough：掩盖 mapping JSON 解析失败——type 静默降级 null 后追平范围查询
 *       不带 {@code format=epoch_millis}，可能漏数。<b>②冷路径 WARN</b>（每作业仅追平编排
 *       一次）带 fieldPath 与堆栈；返回 null 契约不变。反锁：合法 mapping 零 WARN。</li>
 *   <li>{@link EsAdhocJobStore}（原 :379）{@code errorType} 解析失败 {@code return null}：
 *       null → 非「已存在」→ ensureIndex 抛 {@code IllegalStateException}（save 侧契约
 *       WARN、查询侧上抛）——失败链全程响亮，<b>③刻意降级维持静默</b>，零 WARN 契约反锁
 *       （save 恰 1 条 WARN 且只允许是「落作业失败」这一条）。</li>
 *   <li>{@link ControlIndexInitializer}（原 :172）同款 {@code errorType}：null → 绑定流程
 *       整体回滚（ensureAll 上抛 ISE），<b>③刻意降级维持静默</b>，全 logger 零 WARN 反锁。</li>
 *   <li>{@link EsIndexAdmin#putMapping} 反查 6.x legacy type 失败臂（原 :778）回退 {@code _doc}：
 *       6.x 索引若实为自定义 type，后续 PUT 会以「more than 1 type」类误导性错误失败——
 *       <b>②冷路径 WARN</b> 带 index 与堆栈留住真因；回退 _doc 契约不变。
 *       反锁：反查成功（命中 mytype）零 WARN。</li>
 *   <li>{@link EsIndexAdmin#resolveSchema} 样本行探测失败臂（原 :2599）：observedArrayFields
 *       恒空 → isArray 判定降级 → supportsSql 启发式可能把「SQL 会破」误报为安全——
 *       <b>②冷路径 WARN</b> 带 index 与堆栈；主流程返回契约不变（fields 仍按 mapping 给出）。
 *       反锁：样本探测成功路径零 WARN。</li>
 * </ol>
 *
 * <p>桩：{@link EsFakeClients}（本仓测试基线：无 mockito，不联网 client 先例）。
 * 包路径落 adhoc：Site1 经 {@code resolveFieldType} 的 package-private 可见性直调
 * （与同文件 {@code timeFieldCandidates} 同款先例），其余站点走公共入口。</p>
 *
 * @author aicoding
 */
public class Observability552Test {

    private ListAppender<ILoggingEvent> appender;

    @Before
    public void setUp() {
        appender = new ListAppender<ILoggingEvent>();
        appender.start();
        Class<?>[] loggers = {AdhocRebuildService.class, EsAdhocJobStore.class,
                ControlIndexInitializer.class, EsIndexAdmin.class};
        for (Class<?> c : loggers) {
            ((Logger) LoggerFactory.getLogger(c)).addAppender(appender);
        }
    }

    @After
    public void tearDown() {
        Class<?>[] loggers = {AdhocRebuildService.class, EsAdhocJobStore.class,
                ControlIndexInitializer.class, EsIndexAdmin.class};
        for (Class<?> c : loggers) {
            ((Logger) LoggerFactory.getLogger(c)).detachAppender(appender);
        }
    }

    /* ══ 1. AdhocRebuildService.resolveFieldType：mapping 解析失败吞臂 → 冷路径 WARN ══ */

    /** mapping JSON 解析失败：type 仍按 null 处理（契约不变），但必须落带 fieldPath 与堆栈的 WARN。 */
    @Test
    public void mappingParseFailureWarnsAndStillReturnsNull() {
        AdhocRebuildService svc = new AdhocRebuildService(null, null, 0L);

        String type = svc.resolveFieldType("{这不是合法JSON", "created_at");

        assertNull("解析失败契约不变：type 按 null 处理（追平查询不带 format=epoch_millis）", type);
        List<ILoggingEvent> warns = events(Level.WARN, "timeField 类型");
        assertTrue("mapping 解析失败被静默降级=追平语义悄然改变无从排查，必须落 WARN",
                warns.size() >= 1);
        assertTrue("WARN 文案须带 fieldPath（哪个字段类型没解析出来）",
                warns.get(0).getFormattedMessage().contains("created_at"));
        assertNotNull("WARN 须携带 throwable 堆栈", warns.get(0).getThrowableProxy());
    }

    /** 反锁：合法 mapping（解析成功返回 date）路径零 WARN。 */
    @Test
    public void resolveFieldTypeHappyStaysSilent() {
        AdhocRebuildService svc = new AdhocRebuildService(null, null, 0L);

        String type = svc.resolveFieldType(
                "{\"properties\":{\"created_at\":{\"type\":\"date\"}}}", "created_at");

        assertEquals("date", type);
        assertEquals("解析成功路径不得产生任何 WARN", 0, countLevel(Level.WARN, "timeField 类型"));
    }

    /* ══ 2. EsAdhocJobStore.errorType：判据解析失败臂刻意静默（零 WARN 契约） ══ */

    /**
     * 响应体不可解析（非 ES 标准结构）→ errorType 返回 null → 非「已存在」→ ensureIndex 抛
     * ISE → save 契约 WARN「落作业失败」且不上抛。<b>失败链已响亮</b>：断言 save 侧恰 1 条
     * WARN——errorType 判据臂若再落 WARN 即双重告警，反锁为零额外 WARN。
     */
    @Test
    public void jobStoreErrorTypeParseFailureStaysSilentWhileSaveStillWarnsOnce() throws Exception {
        final RestHighLevelClient fake = EsFakeClients.scripted(req -> {
            throw EsFakeClients.responseException(503, "<html>bad-gateway-non-json</html>");
        });
        EsAdhocJobStore store = new EsAdhocJobStore(() -> fake, "obs552_job");

        store.save(AdhocRebuildJob.minimal("j552")); // 契约红线：save 失败不上抛

        assertEquals("save 失败契约不变：恰落 1 条「落作业失败」WARN", 1,
                countLevel(Level.WARN, "落作业失败"));
        assertEquals("errorType 判据臂必须零 WARN（失败链已由 ensureIndex 抛 ISE + save WARN 响亮兜底，"
                        + "判据臂再加日志=双重告警）", 1, warnCountFrom(EsAdhocJobStore.class));
    }

    /* ══ 3. ControlIndexInitializer.errorType：同款刻意静默（全 logger 零 WARN 契约） ══ */

    /**
     * 判据解析失败 → null → 非「已存在」→ ensure 抛 ISE → ensureAll 上抛 → 绑定流程整体回滚。
     * 失败链响亮，probeMode 成功路径本就只有 INFO：<b>全 logger 零 WARN</b> 反锁。
     */
    @Test
    public void controlIndexErrorTypeParseFailureStaysSilentWhileBindRollsBack() throws Exception {
        final RestHighLevelClient fake = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod()) && "/".equals(req.getEndpoint())) {
                return "{\"version\":{\"number\":\"7.10.0\"}}";
            }
            throw EsFakeClients.responseException(400, "<html>not-es-standard</html>");
        });
        ControlIndexInitializer init = new ControlIndexInitializer(new ESQueryStudioElasticsearchProperties());

        try {
            init.ensureAll(fake);
            fail("初始化控制索引失败必须上抛 ISE（绑定流程整体回滚契约）");
        } catch (IllegalStateException e) {
            assertTrue("ISE 文案须带索引名（哪个索引没建出来）",
                    e.getMessage().contains("esquerystudio_user"));
        }
        assertEquals("判据解析失败臂刻意静默：全 logger 零 WARN（失败由 ISE 上抛响亮兜底）",
                0, warnCountFrom(ControlIndexInitializer.class));
    }

    /* ══ 4a. EsIndexAdmin.legacyMappingType（经 putMapping 公共路径）：反查失败 → 冷路径 WARN ══ */

    /**
     * 反查臂（GET _mapping 回包不可解析）→ 回退 _doc 契约不变，但必须落带 index 与堆栈的
     * WARN：6.x 自定义 type 索引回退 _doc 后续 PUT 会以误导性错误失败，WARN 留住真因。
     */
    @Test
    public void legacyTypeReverseLookupFailureWarnsAndStillFallsBackToDoc() throws Exception {
        final RestHighLevelClient fake = EsFakeClients.scripted(req -> {
            String ep = req.getEndpoint();
            if ("GET".equals(req.getMethod()) && "/obs552/_mapping".equals(ep)) {
                return "<html>非JSON，解析必炸";
            }
            if ("PUT".equals(req.getMethod()) && "/obs552/_mapping".equals(ep)) {
                // typeless 首发 400（message 含 mapping type is missing → 触发 typed 重试）
                throw EsFakeClients.responseException(400,
                        "{\"error\":{\"reason\":\"mapping type is missing\"}}");
            }
            // 重试 PUT /obs552/_mapping/_doc：ack（回退 _doc 后 typed 路径放行）
            return "{\"acknowledged\":true}";
        });
        EsIndexAdmin admin = new EsIndexAdmin(fake);

        admin.putMapping("obs552", "{\"properties\":{\"f\":{\"type\":\"keyword\"}}}");

        List<ILoggingEvent> warns = events(Level.WARN, "反查");
        assertTrue("反查失败回退 _doc 必须落 WARN（误导性下游错误的真因在此）", warns.size() >= 1);
        assertTrue("WARN 文案须带 index", warns.get(0).getFormattedMessage().contains("obs552"));
        assertNotNull("WARN 须携带 throwable 堆栈", warns.get(0).getThrowableProxy());
    }

    /** 反锁：反查成功（命中自定义 type mytype）路径零 WARN，typed 重试照常走 mytype。 */
    @Test
    public void legacyTypeReverseLookupHappyStaysSilent() throws Exception {
        final RestHighLevelClient fake = EsFakeClients.scripted(req -> {
            String ep = req.getEndpoint();
            if ("GET".equals(req.getMethod()) && "/obs552/_mapping".equals(ep)) {
                return "{\"obs552\":{\"mappings\":{\"mytype\":{\"properties\":{}}}}}";
            }
            if ("PUT".equals(req.getMethod()) && "/obs552/_mapping".equals(ep)) {
                throw EsFakeClients.responseException(400,
                        "{\"error\":{\"reason\":\"mapping type is missing\"}}");
            }
            return "{\"acknowledged\":true}";
        });
        EsIndexAdmin admin = new EsIndexAdmin(fake);

        admin.putMapping("obs552", "{\"properties\":{\"f\":{\"type\":\"keyword\"}}}");

        assertEquals("反查成功路径不得产生任何 WARN", 0, countLevel(Level.WARN, "反查"));
    }

    /* ══ 4b. EsIndexAdmin.resolveSchema 样本探测臂：失败 → 冷路径 WARN ══ */

    /** 样本行探测失败：主流程仍返回 fields（降级契约不变），但必须落带 index 与堆栈的 WARN。 */
    @Test
    public void schemaSampleProbeFailureWarnsAndStillReturnsFields() throws Exception {
        final RestHighLevelClient fake = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod()) && "/obs552/_mapping".equals(req.getEndpoint())) {
                return "{\"obs552\":{\"mappings\":{\"properties\":"
                        + "{\"title\":{\"type\":\"keyword\"}}}}}";
            }
            throw EsFakeClients.responseException(503, "{\"error\":{}}");
        });
        EsIndexAdmin admin = new EsIndexAdmin(fake);

        Map<String, Object> out = admin.resolveSchema("obs552");

        assertNotNull("降级契约不变：样本探测失败主流程仍返回", out);
        assertNotNull("fields 仍按 mapping 给出（降级不影响 mapping 面）",
                out.get("fields"));
        List<ILoggingEvent> warns = events(Level.WARN, "样本");
        assertTrue("样本探测失败被静默降级=isArray/supportsSql 可能误判且无痕，必须落 WARN",
                warns.size() >= 1);
        assertTrue("WARN 文案须带 index", warns.get(0).getFormattedMessage().contains("obs552"));
        assertNotNull("WARN 须携带 throwable 堆栈", warns.get(0).getThrowableProxy());
    }

    /** 反锁：样本探测成功（hits 带数组样本）路径零 WARN，isArray 照常识别。 */
    @Test
    @SuppressWarnings("unchecked")
    public void schemaSampleProbeHappyStaysSilent() throws Exception {
        final RestHighLevelClient fake = EsFakeClients.scripted(req -> {
            if ("GET".equals(req.getMethod()) && "/obs552/_mapping".equals(req.getEndpoint())) {
                return "{\"obs552\":{\"mappings\":{\"properties\":"
                        + "{\"tags\":{\"type\":\"keyword\"}}}}}";
            }
            return "{\"hits\":{\"hits\":[{\"_source\":{\"tags\":[\"a\",\"b\"]}}]}}";
        });
        EsIndexAdmin admin = new EsIndexAdmin(fake);

        Map<String, Object> out = admin.resolveSchema("obs552");

        List<Map<String, Object>> fields = (List<Map<String, Object>>) out.get("fields");
        boolean tagsArray = false;
        for (Map<String, Object> f : fields) {
            if ("tags".equals(f.get("name")) && Boolean.TRUE.equals(f.get("isArray"))) {
                tagsArray = true;
            }
        }
        assertTrue("样本探测成功：tags 应识别为数组（isArray=true）", tagsArray);
        assertEquals("样本探测成功路径不得产生任何 WARN", 0, countLevel(Level.WARN, "样本"));
    }

    /* ── 工具（Observability551Test 同款） ── */

    private List<ILoggingEvent> events(Level level, String marker) {
        List<ILoggingEvent> out = new ArrayList<ILoggingEvent>();
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == level && e.getFormattedMessage().contains(marker)) {
                out.add(e);
            }
        }
        return out;
    }

    private int countLevel(Level level, String marker) {
        return events(level, marker).size();
    }

    /** 某 logger 名下的全部 WARN 条数（零 WARN 契约反锁用：不看 marker，计数封死）。 */
    private int warnCountFrom(Class<?> loggerOwner) {
        int n = 0;
        for (ILoggingEvent e : appender.list) {
            if (e.getLevel() == Level.WARN && loggerOwner.getName().equals(e.getLoggerName())) {
                n++;
            }
        }
        return n;
    }
}
