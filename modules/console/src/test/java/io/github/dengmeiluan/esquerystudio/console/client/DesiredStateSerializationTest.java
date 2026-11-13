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

import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * -5：在<b>真正决定结果的那一层</b>断言 —— 序列化后的字符串。
 *
 * <p>为什么必须有本类：{@code DesiredStatePayloadTest} 的 7 条断言止步于 {@code Map} 层。
 * 而决定「人复制到的文本」与「宿主 收到的 JSON」长什么样的是 Jackson，
 * 若交给<b>宿主的</b> {@code ObjectMapper} 序列化，两个核心保证都会在 Map 之外被推翻：</p>
 * <ul>
 *   <li>宿主开 {@code ORDER_MAP_ENTRIES_BY_KEYS} → 键序变字母序 → 可 diff 性失效；</li>
 *   <li>宿主开 {@code NON_NULL} → {@code mappingJson}/{@code settingsJson} 两个键<b>整个消失</b>
 *       → 宿主侧 {@code === null} 读到 {@code undefined} 返回 false
 *       → 「无 mapping 需二次确认」的门被<b>静默跳过</b>。</li>
 * </ul>
 * <p>而 Map 层的 7 条测试在这两种情况下<b>照样全绿</b>。这是跨系统已发布契约，
 * 正确性不该寄托在每个接入方的 Jackson 配置上，故 controller 自持 mapper 预序列化，
 * 由本类钉住其输出字节。</p>
 */
public class DesiredStateSerializationTest {

    static class AssetBasicInfoES { }

    static class BondQuoteInfoES { }

    private static RebuildableIndexMeta meta(final Class<?> entity, String alias, String prefix,
                                             String settings, String mapping) {
        ManagedEsIndex decl = new ManagedEsIndex() {
            @Override
            public Class<?> entityClass() {
                return entity;
            }
        };
        return new RebuildableIndexMeta(decl, alias, prefix, settings, mapping);
    }

    private static String writeOne(String settings, String mapping) {
        return DesiredStateJson.write(DesiredStatePayload.of(Collections.singletonList(
                meta(AssetBasicInfoES.class, "asset_basic_info_alias", "asset_basic_info_prefix",
                        settings, mapping)), null));
    }

    /**
     * 键序在<b>字符串层</b>固定为契约的 6 键顺序。
     *
     * <p>判别力：宿主/自持 mapper 若开 {@code ORDER_MAP_ENTRIES_BY_KEYS}，
     * 实际输出会变字母序（alias, entityClass, indexKey, mappingJson, physicalIndexPrefix, settingsJson），
     * 与期望的下标序不符 → 红。Map 层断言对此完全无感。</p>
     */
    @Test
    public void keyOrderIsFixedInSerializedText() {
        String json = writeOne("{\"s\":1}", "{\"m\":2}");
        int iIndexKey = json.indexOf("\"indexKey\"");
        int iEntityClass = json.indexOf("\"entityClass\"");
        int iAlias = json.indexOf("\"alias\"");
        int iPrefix = json.indexOf("\"physicalIndexPrefix\"");
        int iSettings = json.indexOf("\"settingsJson\"");
        int iMapping = json.indexOf("\"mappingJson\"");

        assertTrue("序列化文本里找不到 indexKey，实际=" + json, iIndexKey >= 0);
        assertTrue("序列化文本里找不到 entityClass，实际=" + json, iEntityClass >= 0);
        assertTrue("序列化文本里找不到 alias，实际=" + json, iAlias >= 0);
        assertTrue("序列化文本里找不到 physicalIndexPrefix，实际=" + json, iPrefix >= 0);
        assertTrue("序列化文本里找不到 settingsJson，实际=" + json, iSettings >= 0);
        assertTrue("序列化文本里找不到 mappingJson，实际=" + json, iMapping >= 0);

        assertEquals("键在序列化文本中的出现顺序必须是契约的 6 键序（宿主若开 ORDER_MAP_ENTRIES_BY_KEYS 会变字母序）"
                        + "，实际=" + json,
                Arrays.asList(iIndexKey, iEntityClass, iAlias, iPrefix, iSettings, iMapping),
                sorted(iIndexKey, iEntityClass, iAlias, iPrefix, iSettings, iMapping));
    }

    private static java.util.List<Integer> sorted(int... xs) {
        java.util.List<Integer> l = new java.util.ArrayList<Integer>();
        for (int x : xs) {
            l.add(x);
        }
        Collections.sort(l);
        return l;
    }

    /**
     * {@code mappingJson} 为 null 时，字面量 {@code "mappingJson":null} 必须出现在输出里。
     *
     * <p>判别力：mapper 若开 {@code NON_NULL}，该键整个消失 → 字面量找不到 → 红。
     * 与下一条分开成独立方法：合并后前一条失败会让后一条<b>根本不执行</b>，等于失去独立证伪能力。</p>
     */
    @Test
    public void nullMappingJsonSerializesAsExplicitNull() {
        String json = writeOne("{\"s\":1}", null);
        assertTrue("mappingJson 为 null 时必须字面输出 \"mappingJson\": null（NON_NULL 会让整个键消失，"
                        + "导致 宿主的 === null 判定读到 undefined、二次确认门被静默跳过），实际=" + json,
                json.contains("\"mappingJson\": null"));
    }

    /**
     * {@code settingsJson} 为 null 时同样必须字面输出。独立成方法，理由同上。
     */
    @Test
    public void nullSettingsJsonSerializesAsExplicitNull() {
        String json = writeOne(null, "{\"m\":2}");
        assertTrue("settingsJson 为 null 时必须字面输出 \"settingsJson\": null，实际=" + json,
                json.contains("\"settingsJson\": null"));
    }

    /**
     * 换行符固定为 {@code \n}，不随 OS 漂移。
     *
     * <p>判别力：若用 {@code DefaultIndenter.SYSTEM_LINEFEED_INSTANCE}，Windows 上产出 {@code \r\n}
     * → 断言无 {@code \r} 变红。本项目已被平台换行符坑过多次（.ps1 必须 CRLF、.e2e/*.sh 必须 LF），
     * 复制文本与断言都不该随跑测试的机器变化。</p>
     */
    @Test
    public void lineSeparatorIsAlwaysLfNeverPlatformDefault() {
        String json = writeOne("{\"s\":1}", "{\"m\":2}");
        assertTrue("输出应为多行 pretty JSON", json.contains("\n"));
        assertFalse("输出不得含 \\r：换行符必须固定 \\n，否则断言与复制文本随 OS 漂移，实际="
                + json.replace("\r", "<CR>"), json.contains("\r"));
    }

    /**
     * 数组元素必须各自换行缩进（而非 Jackson 默认的 {@code FixedSpaceIndenter} 单行挤在一起）。
     *
     * <p>判别力：不显式 {@code indentArraysWith} 时，Jackson 2.x 的 {@code DefaultPrettyPrinter}
     * 对数组用 {@code FixedSpaceIndenter}，输出形如 {@code [ {...}, {...} ]} ——
     * 元素起始的 <code>{</code> 与前一个 <code>}</code> 之间只有 {@code ", "} 没有换行。
     * 本条断言「元素之间存在换行分隔」。已实测：删掉 {@code indentArraysWith} 后本条变红。</p>
     *
     * <p><b>注意</b>：本条最初写成多个 {@code ||} 备选模式的形式，实测在
     * {@code FixedSpaceIndenter} 下<b>照样通过</b>（其中一个宽松分支恒真）——
     * 那是一条恒真断言。现收紧为单一精确条件。</p>
     */
    @Test
    public void arrayElementsAreIndentedOnSeparateLines() {
        String json = DesiredStateJson.write(DesiredStatePayload.of(Arrays.asList(
                meta(BondQuoteInfoES.class, "b_alias", "b_prefix", "{}", "{}"),
                meta(AssetBasicInfoES.class, "a_alias", "a_prefix", "{}", "{}")), null));
        assertTrue("两个元素之间必须以换行分隔（Jackson 默认 FixedSpaceIndenter 会挤成 \"}, {\"），实际=" + json,
                json.contains("},\n"));
        assertFalse("不得出现 FixedSpaceIndenter 的单行元素分隔 \"}, {\"，实际=" + json,
                json.contains("}, {"));
    }

    /**
     * 空列表序列化为 {@code []} —— 页面「复制全部」在空态被禁用，但端点本身仍须是合法 JSON 数组，
     * 否则 curl 与 宿主 都会拿到解析不了的内容。
     */
    @Test
    public void emptyPayloadSerializesAsEmptyArray() {
        assertEquals("[ ]", DesiredStateJson.write(DesiredStatePayload.of(
                Collections.<RebuildableIndexMeta>emptyList(), null)));
    }

    /**
     * 字段分隔符必须是 {@code ": "}（JS 风格），<b>不得</b>是 Jackson 默认的 {@code " : "}。
     *
     * <p>为什么这是被守住的性质而非巧合：页面「复制全部」透传服务端原文、「复制单行」走浏览器
     * {@code JSON.stringify(row, null, 2)}。两者冒号形态若不同，同一页面上两个按钮对同一份数据
     * 产出不同文本，使用者无法判断哪个权威；且 宿主侧对粘贴 payload 做 diff 时
     * （ configDiff）会制造满屏假差异。</p>
     *
     * <p>判别力：去掉 {@code JsonStringifyStylePrinter} 覆写（回落 Jackson 默认）→
     * 输出含 {@code " : "} → 两条断言均红。</p>
     */
    @Test
    public void fieldSeparatorMatchesBrowserStringifyExactly() {
        String json = writeOne("{}", "{}");
        assertTrue("字段分隔符必须是 JS 风格的 \": \"，实际=" + json, json.contains("\"indexKey\": "));
        assertFalse("不得出现 Jackson 默认的 \" : \" —— 它与浏览器 JSON.stringify 不一致，实际=" + json,
                json.contains("\" : "));
    }

    /**
     * {@code createInstance()} 必须返回覆写后的子类型。
     *
     * <p>为什么单列一条：{@code DefaultPrettyPrinter} 自身有可变状态、非线程安全，Jackson 每次
     * 序列化都会 {@code createInstance()} 拷贝一份。本项目的 Jackson <b>2.11.4</b> 对此
     * <b>快速失败</b>：不覆写时抛
     * {@code IllegalStateException: Failed `createInstance()`: X does not override method; it has to}
     * （已用独立小程序实测确认），对本端点即 <b>HTTP 500</b>，而非「格式变丑」。
     * 更老的 Jackson 版本才是静默退化回基类行为、覆写无声失效。</p>
     *
     * <p>本条「连续两次序列化都保持 JS 风格且逐字节相同」同时覆盖两种失败形态：
     * 2.11.4 上因抛异常而红，老版本上因冒号退化而红。</p>
     */
    @Test
    public void prettyPrinterSurvivesInstanceCopyAcrossCalls() {
        String first = writeOne("{}", "{}");
        String second = writeOne("{}", "{}");
        assertEquals("同一输入两次序列化必须逐字节一致", first, second);
        assertTrue("第二次序列化仍须是 JS 风格冒号（createInstance 未覆写会让覆写静默失效），实际=" + second,
                second.contains("\"indexKey\": "));
    }

    /**
     * 全量输出的确切字节形态，必须等价于浏览器 {@code JSON.stringify(payload, null, 2)}。
     *
     * <p>为什么需要本条：页面「复制全部」复制的就是这段 {@code responseText} 原文
     * （零再序列化、与 curl 拿到的字节相同）。它是人真正粘到 宿主的文本，
     * 必须逐字节钉死，而不是只断言「包含某某子串」。</p>
     *
     * <p>判别力：缩进宽度改 4、数组元素改回 Jackson 默认的单行 {@code FixedSpaceIndenter}、
     * 对象分隔符从 {@code " : "} 变 {@code ":"}、键序变化 —— 任一发生均红。</p>
     */
    @Test
    public void wholePayloadFormatMatchesBrowserStringifyTwoSpaceStyle() {
        String json = writeOne(null, null);
        String expected = "[\n"
                + "  {\n"
                + "    \"indexKey\": \"assetBasicInfo\",\n"
                + "    \"entityClass\": \"" + AssetBasicInfoES.class.getName() + "\",\n"
                + "    \"alias\": \"asset_basic_info_alias\",\n"
                + "    \"physicalIndexPrefix\": \"asset_basic_info_prefix\",\n"
                + "    \"settingsJson\": null,\n"
                + "    \"mappingJson\": null,\n"
                + "    \"mappingParsed\": false,\n"
                + "    \"derivedMappingJson\": null,\n"
                + "    \"sdesVersion\": \"" + EntityFieldScanner.sdesVersion() + "\",\n"
                + "    \"fields\": [ ]\n"
                + "  }\n"
                + "]";
        assertEquals("「复制全部」复制的就是这段原文，其确切形态必须稳定", expected, json);
    }

    /**
     * <b>单行</b>复制的形态：页面按钮调用 {@code JSON.stringify(rows[i], null, 2)}，复制的是
     * <b>单个对象</b>（顶层无数组外层缩进）。本条钉住「全量输出里的元素，去掉外层 2 空格缩进后，
     * 恰好等于单独复制该行应得的文本」。
     *
     * <p>为什么与上一条分开：两者是<b>不同的两段文本</b> —— 数组里的元素带 2 空格外层缩进，
     * 单独复制的一行不带。合并断言会掩盖其中一个。页面上这是两个不同按钮，用户会分别用到。</p>
     *
     * <p><b>本条的能力边界</b>：它断言的是「服务端全量输出的元素部分，其结构与浏览器单行序列化
     * 应得的结构一致」，用的是服务端文本去缩进后的结果。它<b>不</b>执行浏览器的
     * {@code JSON.stringify}（项目无 JS 运行时，且本波禁止新增依赖），
     * 所以「浏览器实际吐出的字节」未被本条覆盖 —— 该缺口在报告中显式列出。</p>
     *
     * <p>判别力：服务端键序变化、缩进宽度变化、{@code null} 被省略，均红。</p>
     */
    @Test
    public void singleRowShapeMatchesDeIndentedElement() {
        String whole = writeOne(null, null);
        // 剥掉首行 "[" 与末行 "]"，再去掉每行的 2 空格外层缩进
        String[] lines = whole.split("\n");
        assertEquals("首行应为单独的 [", "[", lines[0]);
        assertEquals("末行应为单独的 ]", "]", lines[lines.length - 1]);
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i < lines.length - 1; i++) {
            assertTrue("数组内每行都应带 2 空格外层缩进，实际行=" + lines[i], lines[i].startsWith("  "));
            sb.append(lines[i].substring(2));
            if (i < lines.length - 2) {
                sb.append('\n');
            }
        }
        String expected = "{\n"
                + "  \"indexKey\": \"assetBasicInfo\",\n"
                + "  \"entityClass\": \"" + AssetBasicInfoES.class.getName() + "\",\n"
                + "  \"alias\": \"asset_basic_info_alias\",\n"
                + "  \"physicalIndexPrefix\": \"asset_basic_info_prefix\",\n"
                + "  \"settingsJson\": null,\n"
                + "  \"mappingJson\": null,\n"
                + "  \"mappingParsed\": false,\n"
                + "  \"derivedMappingJson\": null,\n"
                + "  \"sdesVersion\": \"" + EntityFieldScanner.sdesVersion() + "\",\n"
                + "  \"fields\": [ ]\n"
                + "}";
        assertEquals("单行复制应得的形态漂移", expected, sb.toString());
    }

    /**
     * 自持 mapper 与宿主 {@code ObjectMapper} 的配置<b>无关</b>。
     *
     * <p>判别力：这是修订 ① 的核心命题的直接证据 —— 构造一个开了
     * {@code ORDER_MAP_ENTRIES_BY_KEYS} + {@code NON_NULL} 的 mapper（模拟被这样配置的宿主），
     * 确认它<b>确实</b>会破坏两个保证；再确认我们的 {@code DesiredStateJson} 在同一进程内不受影响。
     * 若哪天有人把 {@code DesiredStateJson} 改成接收外部注入的 mapper，本条会红。</p>
     */
    @Test
    public void selfHeldMapperIsImmuneToHostMapperConfiguration() throws Exception {
        java.util.List<java.util.Map<String, Object>> payload = DesiredStatePayload.of(
                Collections.singletonList(meta(AssetBasicInfoES.class, "a_alias", "a_prefix", null, null)), null);

        com.fasterxml.jackson.databind.ObjectMapper hostile =
                new com.fasterxml.jackson.databind.ObjectMapper();
        hostile.configure(com.fasterxml.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
        hostile.setSerializationInclusion(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL);
        String hostileJson = hostile.writeValueAsString(payload);

        // 先证明这个威胁是真的，而不是假想 —— 否则下面那条断言可能是恒真的。
        assertFalse("前提失效：宿主 mapper 开 NON_NULL 后 mappingJson 竟仍在，本测试的命题需重新审视，实际="
                + hostileJson, hostileJson.contains("mappingJson"));
        assertTrue("前提失效：宿主 mapper 开 ORDER_MAP_ENTRIES_BY_KEYS 后键序竟未变字母序，实际=" + hostileJson,
                hostileJson.indexOf("\"alias\"") < hostileJson.indexOf("\"indexKey\""));

        // 同一进程、同一 payload，自持 mapper 不受影响。
        String ours = DesiredStateJson.write(payload);
        assertTrue("自持 mapper 必须保留 mappingJson:null，实际=" + ours,
                ours.contains("\"mappingJson\": null"));
        assertTrue("自持 mapper 必须保持 indexKey 在 alias 之前，实际=" + ours,
                ours.indexOf("\"indexKey\"") < ours.indexOf("\"alias\""));
    }
}
