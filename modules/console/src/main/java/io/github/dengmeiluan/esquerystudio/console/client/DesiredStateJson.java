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

package io.github.dengmeiluan.esquerystudio.console.client;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * -5：把 {@link DesiredStatePayload} 的 payload 序列化成<b>确定的文本</b>。
 *
 * <p><b>为什么不交给宿主的 {@code ObjectMapper}</b>：{@code DesiredStatePayload} 的两个核心保证
 * —— 「键序固定」与「{@code mappingJson}/{@code settingsJson} 为 null 原样透出」—— 都止步于
 * {@code Map} 层。决定用户复制到的<b>文本</b>长什么样的是 Jackson，而 Jackson 由宿主控制：</p>
 * <ul>
 *   <li>宿主开 {@code ORDER_MAP_ENTRIES_BY_KEYS} → 键序变字母序 → 可 diff 性失效；</li>
 *   <li>宿主开 {@code NON_NULL} → 两个 json 键<b>整个从输出消失</b> → 宿主侧
 *       {@code === null} 判定读到 {@code undefined} 返回 false →
 *       「无 mapping 需二次确认」的门被<b>静默跳过</b>。</li>
 * </ul>
 * <p>这是<b>跨系统已发布契约</b>，正确性不该寄托在每个接入方的 Jackson 配置上。
 * 故本类自持 mapper —— 与 starter 既有惯例一致（{@code AdhocRebuildService}、
 * {@code BuiltinConsoleAuthService}、{@code EsConsoleOpsAuditStore}、{@code JwtVerifier}
 * 都用 {@code private static final ObjectMapper MAPPER = new ObjectMapper()}）。</p>
 *
 * <p><b>格式刻意固定为 2 空格缩进 + {@code ": "} 分隔 + {@code \n} 换行</b>，三点都不是随手选的：</p>
 * <ul>
 *   <li>2 空格缩进与 {@code ": "} 分隔，使输出与浏览器 {@code JSON.stringify(x, null, 2)}
 *       <b>逐字节一致</b> —— 页面「复制全部」透传服务端原文、「复制单行」走浏览器序列化，
 *       两者对同一份数据必须产出同一段文本；</li>
 *   <li>换行符<b>刻意固定 {@code \n} 而非平台换行符</b>（即不用
 *       {@code DefaultIndenter.SYSTEM_LINEFEED_INSTANCE}）：否则 Windows 上产出 {@code \r\n}，
 *       断言与复制文本都会随 OS 漂移。<b>不要「顺手改成平台默认」。</b></li>
 * </ul>
 */
final class DesiredStateJson {

    /** 2 空格缩进 + 固定 \n —— 不要换成 SYSTEM_LINEFEED_INSTANCE，见类注释。 */
    private static final DefaultIndenter INDENTER = new DefaultIndenter("  ", "\n");

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final ObjectWriter WRITER = MAPPER.writer(prettyPrinter());

    private DesiredStateJson() {
    }

    /**
     * Jackson 2.x 的 {@code DefaultPrettyPrinter} 默认对<b>数组</b>用 {@code FixedSpaceIndenter}，
     * 输出形如 {@code [ {...}, {...} ]}（元素挤在一行）。必须显式 {@code indentArraysWith}
     * 才能让每个元素各自换行 —— 人要读、要 diff 的就是这个格式。
     *
     * <p>同时把字段分隔符从 Jackson 默认的 {@code " : "} 覆写为 {@code ": "}，
     * 与浏览器 {@code JSON.stringify(x, null, 2)} <b>逐字节一致</b>。这不是洁癖：</p>
     * <ul>
     *   <li>页面「复制全部」透传服务端原文、「复制单行」走浏览器序列化 ——
     *       若冒号形态不同，同一页面两个按钮对同一份数据产出不同文本，使用者无法判断哪个权威；</li>
     *   <li>宿主侧若对粘贴的 payload 做 diff（ configDiff），
     *       冒号空格差异会制造<b>满屏假差异</b>。</li>
     * </ul>
     * <p>由 {@code DesiredStateSerializationTest} 钉住冒号形态。</p>
     */
    private static DefaultPrettyPrinter prettyPrinter() {
        DefaultPrettyPrinter pp = new JsonStringifyStylePrinter();
        pp.indentObjectsWith(INDENTER);
        pp.indentArraysWith(INDENTER);
        return pp;
    }

    /**
     * 唯一差异：字段名与值之间用 {@code ": "}（JS 风格）而非 Jackson 默认的 {@code " : "}。
     *
     * <p><b>{@code createInstance()} 必须覆写并返回本类型</b>——{@code DefaultPrettyPrinter}
     * 自身有可变状态、非线程安全，Jackson 每次序列化都会调 {@code createInstance()} 拷贝一份。</p>
     *
     * <p>在本项目的 Jackson <b>2.11.4</b> 上，不覆写的后果是<b>快速失败</b>而非静默降级：
     * {@code createInstance()} 首指令即校验 {@code getClass() != DefaultPrettyPrinter.class}
     * 并抛 {@code IllegalStateException: Failed `createInstance()`: X does not override method; it has to}。
     * 实测确认（独立小程序跑 2.11.4）。对本端点意味着 <b>HTTP 500</b>，不是「格式变丑」——
     * 不要因为以为「失效了也就是难看点」而低估它。</p>
     *
     * <p>（更老的 Jackson 版本才是静默退化回基类行为、覆写无声失效。若哪天降级依赖版本，
     * 失败形态会从 500 变成静默错格式，届时 {@code prettyPrinterSurvivesInstanceCopyAcrossCalls}
     * 仍是唯一能察觉它的守卫。）</p>
     */
    private static final class JsonStringifyStylePrinter extends DefaultPrettyPrinter {

        private static final long serialVersionUID = 1L;

        JsonStringifyStylePrinter() {
            super();
        }

        private JsonStringifyStylePrinter(JsonStringifyStylePrinter base) {
            super(base);
        }

        @Override
        public DefaultPrettyPrinter createInstance() {
            return new JsonStringifyStylePrinter(this);
        }

        @Override
        public void writeObjectFieldValueSeparator(JsonGenerator g) throws IOException {
            g.writeRaw(": ");
        }
    }

    /**
     * 序列化为确定文本。序列化失败抛 {@link IllegalStateException} ——
     * 入参是 {@code DesiredStatePayload} 造出的纯 String/null 的 Map，不存在无法序列化的情况；
     * 真出现即为编程错误，应当炸而不是回一段半截 JSON 让人复制走。
     */
    static String write(List<Map<String, Object>> payload) {
        try {
            return WRITER.writeValueAsString(payload);
        } catch (Exception e) {
            throw new IllegalStateException("期望配置序列化失败", e);
        }
    }
}
