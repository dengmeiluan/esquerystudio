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
import io.github.dengmeiluan.esquerystudio.platform.spi.ManagedEsIndex;

import org.junit.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.StreamUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * 自包含单页的硬约束。
 *
 * <p>它们不是风格偏好 —— 单页要在无外网的业务服务器上打开就必须自包含，
 * 而放错位置（static/）会绕过 client 模式的资源守卫被无条件暴露。</p>
 *
 * <p><b>本类的能力边界</b>：只能断言 HTML 源文本，无法断言渲染后的 DOM 或 JS 运行时行为
 * （项目无前端测试运行时，且本波禁止新增依赖）。所以「空态真的渲染出来了」「复制按钮真的禁用了」
 * 这类命题本类<b>证明不了</b>，只能证明「实现它们的代码在源文件里且形状正确」。
 * 这个缺口在报告的「未验证到什么」里显式列出，不用一条恒真断言假装覆盖。</p>
 */
public class DesiredStatePageTest {

    private static final String PATH = "esquerystudio/desired-state.html";

    private static String html() throws Exception {
        try (InputStream is = new ClassPathResource(PATH).getInputStream()) {
            return StreamUtils.copyToString(is, StandardCharsets.UTF_8);
        }
    }

    @Test
    public void pageExistsAndIsSmall() throws Exception {
        String h = html();
        assertTrue("单页不该为空", h.length() > 500);
        int bytes = h.getBytes(StandardCharsets.UTF_8).length;
        assertTrue("单页必须 < 30KB，实际 " + bytes + " 字节", bytes < 30 * 1024);
    }

    /** 零外部请求：业务服务器可能无外网，任何 CDN 引用都会让页面残废。 */
    @Test
    public void pageHasNoExternalUrls() throws Exception {
        Matcher m = Pattern.compile("(?i)(https?:)?//[a-z0-9.-]+\\.[a-z]{2,}").matcher(html());
        StringBuilder found = new StringBuilder();
        while (m.find()) {
            found.append(m.group()).append(' ');
        }
        assertTrue("单页不得引用任何外部 URL，实际命中: " + found, found.length() == 0);
    }

    /** 不许放进 static/：那里的资源由 Spring Boot 默认处理器无条件暴露，绕过 ConsoleAssetGuard。 */
    @Test
    public void pageIsNotUnderStatic() {
        assertFalse("desired-state.html 不得放在 static/ 下",
                new ClassPathResource("static/esquerystudio/desired-state.html").exists());
        assertFalse("desired-state.html 不得回到旧的 static/esquerystudio/ 下",
                new ClassPathResource("static/esquerystudio/desired-state.html").exists());
        assertFalse("desired-state.html 不得放在 static/ 根下",
                new ClassPathResource("static/desired-state.html").exists());
    }

    /**
     * 修订 ③：页面必须自带「无鉴权 / 仅限内网」的部署约束说明。
     *
     * <p>为什么必须印在页面上而不是只写进设计文档：{@code ConsoleAuthInterceptor} 在 console 模式下
     * 保护 {@code /internal/es/index/**}，而 client 模式下它<b>不装</b> —— 同一个路径前缀在两个模式下
     * 保护级别不同。部署的人必须看得见这件事。</p>
     *
     * <p>判别力：把这句话从页面删掉即红。用「内网」+「鉴权」两个关键要素同时命中，
     * 避免只匹配一个泛用词导致其它文案误命中而恒真。</p>
     */
    @Test
    public void pageCarriesNoAuthIntranetOnlyNotice() throws Exception {
        String h = html();
        assertTrue("页面必须显著声明仅限内网访问（client 模式下 /internal/es/index/** 无鉴权守护）",
                h.contains("内网"));
        assertTrue("页面必须显著声明本页不含鉴权", h.contains("鉴权"));
        assertTrue("页面必须提醒不要暴露到公网", h.contains("公网"));
    }

    /**
     * 修订 ②：必须存在真正的空态引导文案，而不是渲染一张空表格。
     *
     * <p>零索引是新接入方最可能遇到的<b>第一个画面</b>（刚加 starter、还没声明任何 ManagedEsIndex）。
     * 空态若只是空表格，人无法区分「自己没配好 / 页面坏了 / starter 没生效」三种情况。
     * 故空态必须指出<b>下一步做什么</b>：实现 ManagedEsIndex 并注册为 Bean。</p>
     *
     * <p><b>普查修正（台账 #86 ）</b>：原写 {@code h.contains("ManagedEsIndex")} +
     * {@code h.contains("Bean") || h.contains("@Component")}，两个锚都只是<b>裸词</b>。
     * 实测把 {@code showEmpty()} 里整段 {@code .steps} 引导（三条 {@code <li>}）全部删掉、
     * 只在 JS 注释里留下 {@code // ManagedEsIndex / Bean / @Component} 一行 ——
     * <b>37 条全绿</b>。也就是说：用户在空态看到的是一个没有任何下一步指引的光板面板，
     * 而这两条断言买到的只是「这两个词在文件里出现过」，与它们声称守护的
     * 「空态有可操作引导」<b>完全无关</b>。
     *
     * <p>现收紧为绑定 {@code showEmpty()} 真正拼进 {@code innerHTML} 的
     * <b>完整 {@code <li>} 字面量</b>：它们只可能出现在渲染分支里，注释与文档都无法满足。</p>
     *
     * <p>判别力：删掉空态分支、删掉 {@code .steps} 引导、或把引导降级成泛泛的「暂无数据」，均红。</p>
     *
     * <p><b> 起断言的对象变了，原因记此</b>：原来这两条钉的是
     * 「实现 {@code ManagedEsIndex} 接口」+「注册为 Spring Bean」。本波把手写 provider 通道
     * <b>整体废除</b>（残留实现会被 {@code ManagedEsIndexScanner} fail-fast 点名，应用起不来），
     * 于是那段引导从「可操作」变成了<b>有害</b> —— 照着做会把应用搞成启动失败。
     * 断言随之改为钉新引导（加 {@code @Document}）<b>并且</b>钉那句反向警示，
     * 后者防的是「新引导加了、旧引导也留着」这种两头都说的退化。</p>
     */
    @Test
    public void pageHasEmptyStateWithActionableGuidance() throws Exception {
        String h = html();
        assertTrue("空态必须渲染「给实体加 @Document」这一步（仅文件里出现过该词不算）",
                h.contains("<li>给 ES 实体类加 <code>@Document</code>"));
        assertTrue("空态必须渲染「实体要在 @SpringBootApplication 基础包下」这一步",
                h.contains("<code>@SpringBootApplication</code> 的基础包下"));
        assertTrue("空态必须显式警示不要再手写 ManagedEsIndex —— 该通道已废弃，照做会启动失败",
                h.contains("再手写 <code>ManagedEsIndex</code> 实现"));
        assertFalse("不得再教人「实现 ManagedEsIndex 接口」——该通道已废弃",
                h.contains("<li>实现 <code>ManagedEsIndex</code> 接口"));
        assertFalse("不得再教人「注册为 Spring Bean」——该通道已废弃",
                h.contains("<li>把该实现注册为 Spring Bean"));
    }

    /**
     * 空态下「复制全部」必须被禁用 —— 不能让人复制一个 {@code []} 粘到 宿主。
     *
     * <p><b>本条曾是恒真断言</b>：原写法 {@code h.contains("disabled")} 会被页面 CSS 里的
     * 4 处 {@code :disabled} 选择器满足 —— 把所有 JS 禁用逻辑和 {@code <button disabled>}
     * 全删光、只留那几行 CSS，它照样绿。现收紧为指向真正的禁用<b>逻辑</b>
     * （对按钮 DOM 属性的赋值），CSS 无法满足它。</p>
     *
     * <p>能力边界：这仍只证明「代码在」，不证明「运行时真禁用了」——
     * 后者由 e2e C 幕的 {@code isDisabled()} 覆盖。</p>
     */
    @Test
    public void pageDisablesCopyAllWhenEmpty() throws Exception {
        String h = html();
        assertTrue("必须有对复制全部按钮 disabled 属性的赋值逻辑（仅 CSS 里的 :disabled 选择器不算）",
                h.contains("copyAllBtn.disabled"));
    }

    /**
     * 三态（加载中 / 空 / 错误）必须各自可区分，错误态必须显示 HTTP 状态码。
     *
     * <p>状态码是排查的第一手信息：403 与 500 与 404 的处置完全不同，
     * 把它们都渲染成「加载失败」等于把人送回去猜。</p>
     *
     * <p><b>第一条曾近乎恒真</b>：原写法 {@code h.contains("加载")} 在删掉整个
     * {@code showLoading()} 后，仍会被错误态文案「加载失败」满足。
     * 现收紧为指向加载态函数本身。</p>
     *
     * <p><b>普查修正（第二条）</b>：原写 {@code h.contains("xhr.status")}，而它在页面里出现 6 次，
     * 其中 3 次只是分支判断（{@code xhr.status === 0}、{@code < 200}、{@code >= 300}）。
     * 实测把错误文案改成不含状态码后，剩余 3 处仍让它绿 —— <b>10 条全绿而缺陷放行</b>。
     * 现收紧为断言状态码真的被<b>拼进传给 showError 的文案</b>。</p>
     */
    @Test
    public void pageDistinguishesLoadingAndErrorStatesWithStatusCode() throws Exception {
        String h = html();
        assertTrue("必须有独立的加载中态函数（错误态的「加载失败」文案不算）",
                h.contains("function showLoading("));
        assertTrue("错误态文案必须把 HTTP 状态码拼进去（仅在分支条件里用 xhr.status 不算）",
                h.contains("showError('加载失败：HTTP ' + xhr.status"));
    }

    /**
     * 所有来自 payload 的值必须转义后再进 DOM —— 索引名与 mapping JSON 都可能含 {@code <}。
     *
     * <p>判别力：页面用 {@code innerHTML} 拼表格，若某个字段漏了 {@code esc()} 包裹，
     * 含 {@code <} 的 mapping 会破坏 DOM 结构甚至注入。本条断言转义函数存在且覆盖三个必要字符。</p>
     */
    @Test
    public void pageEscapesPayloadValues() throws Exception {
        String h = html();
        assertTrue("必须有转义函数", h.contains("function esc("));
        assertTrue("必须转义 &", h.contains("&amp;"));
        assertTrue("必须转义 <", h.contains("&lt;"));
        assertTrue("必须转义 >", h.contains("&gt;"));
    }

    /**
     * 「复制全部」必须复制服务端响应原文（{@code responseText}），零再序列化。
     *
     * <p>为什么：若走 {@code JSON.stringify(rows)} 往返，复制出来的文本的键序就由
     * <b>浏览器引擎的对象键序实现</b>保证，而不是由服务端保证 —— 这正是修订 ① 要根除的
     * 「正确性寄托在别人的实现上」。更实际的后果是页面复制的文本与 {@code curl} 拿到的
     * 不是同一份，排查时互相打架。复制原文让两者字节相同。</p>
     *
     * <p>判别力：把复制全部改回 {@code JSON.stringify(rows,null,2)} 即红。</p>
     *
     * <p><b>普查修正</b>：正向那条原写 {@code h.contains("rawText")}，而 {@code rawText}
     * 在页面里共出现 7 次（声明、3 处赋值、parse、空值守卫、复制调用）。实测把复制调用
     * 改成再序列化后，剩余 6 处仍让它绿 —— 抓到那次破坏的其实是下面的 {@code assertFalse}。
     * 现收紧为指向<b>复制调用点本身</b>，使正反两条<b>各自都能独立证伪</b>。</p>
     */
    @Test
    public void copyAllUsesRawResponseTextNotReserialized() throws Exception {
        String h = html();
        assertTrue("「复制全部」的复制调用必须以 rawText 为参数（仅出现 rawText 变量名不算）",
                h.contains("copy(rawText,"));
        assertFalse("「复制全部」不得对整个 rows 再序列化 —— 那会让复制文本的键序由浏览器决定，"
                        + "且与 curl 拿到的文本不一致",
                h.contains("JSON.stringify(rows,") || h.contains("JSON.stringify(rows ,")
                        || h.contains("JSON.stringify(rows)"));
    }

    /**
     * 两列独立展示 {@code alias} 与 {@code physicalIndexPrefix}。
     *
     * <p>两者今天恒等（{@code IndexMetaRegistry} 对两者传同一个 resolved），但<b>契约上不保证相等</b>
     * （见 {@code RebuildableIndexMeta} 对 physicalIndexPrefix 的 javadoc）。
     * 合并成一列、或在相等时渲染成「同左」，都会把契约信息藏起来，
     * 让人误以为二者被设计为永远相等 —— 那正是刚在 javadoc 上修掉的误解。</p>
     */
    @Test
    public void pageRendersAliasAndPrefixAsIndependentColumns() throws Exception {
        String h = html();
        assertTrue("必须渲染 alias 列", h.contains("r.alias"));
        assertTrue("必须渲染 physicalIndexPrefix 列（brief 原稿漏了这一列）",
                h.contains("r.physicalIndexPrefix"));
    }

    // --------------------------------------------------------------------------------------
    //  评审 I-1：Step 7 的 date 字段列此前在 src/test/java 全无覆盖 ——
    // 把「未知」分支删掉、让未解析显示 0，后端能全绿。以下四条补上看守。
    //
    // 断言刻意不落在孤立词上（本波已知 contains(单个词) 形态薄弱），
    // 而是落在<b>判别条件本身</b>：护住的是「三态由谁决定」，不是「某个词出现过」。
    // --------------------------------------------------------------------------------------

    /**
     * date 字段信息必须存在，且计数口径是 esType==='date'（不是 annType，也不是 javaType 猜测）。
     *
     * <p><b> 起第一条的锚点换了，原因记此</b>：页面由<b>表格改为卡片</b>，
     * 整张 {@code <table>} 连同 {@code <thead>} 一起消失，原锚 {@code "<th>date 字段"}
     * 在新页面里<b>不可能存在</b> —— 它守的是「表头有这一列」，而卡片式布局根本没有列表头。
     * 若不换锚，本条会因为页面形态变更而恒红，而不是因为被测行为丢失。</p>
     *
     * <p><b>新锚为何等强</b>：{@code datePill()} 里那条把 date 字段<b>计数渲染进徽章</b>的
     * return 语句字面量。它满足与原锚相同的判别力要求：
     * <ul>
     *   <li>唯一 —— 全文件仅出现一次，且只可能出现在真正的渲染分支里；</li>
     *   <li>可证伪 —— 把卡片里的 date 渲染（{@code datePill} 及其调用）删掉，本条立刻红；</li>
     *   <li>不是裸词 —— {@code "date"} 在本文件里出现数十次（CSS、注释、tooltip、esType 判断），
     *       用裸词做锚会在信息整块删除后<b>仍然绿</b>，那正是本类 javadoc 反复记录的恒真陷阱。</li>
     * </ul>
     * 已实测变异验证：删掉 date 渲染块 → 本条红；恢复 → 绿。</p>
     */
    @Test
    public void pageRendersDateFieldColumnCountedByEsType() throws Exception {
        String h = html();
        assertTrue("卡片必须把 date 字段计数渲染进徽章（删掉该渲染块时本条必须红；"
                        + "裸词 \"date\" 不算——它在 CSS/注释/tooltip 里到处都有）",
                h.contains("return '<span class=\"pill b dc\" title=\"' + esc(tip2) + '\">date 字段 ' + n + '</span>';"));
        assertTrue("date 计数口径必须是 esType==='date'",
                h.contains("esType === 'date'") || h.contains("esType==='date'"));
    }

    /**
     * <b>I-3 两态互斥（一）</b>：mappingJson 为 null（业务方没写 {@code @Mapping}）是正常路径，
     * 必须由 {@code r.mappingJson == null} 这个条件<b>单独</b>分支出来。
     *
     * <p>若把它并入「未解析」，页面会对没写 mapping 的业务方说「你的 mapping 没解析成功」，
     * 让他去查一个不存在的 JSON 语法错误 —— 那是  刚清掉的「撒谎的界面」。</p>
     */
    @Test
    public void pageDistinguishesUndeclaredMappingByItsOwnBranch() throws Exception {
        String h = html();
        assertTrue("必须有 r.mappingJson == null 的独立分支来识别「未声明」",
                h.contains("if (r.mappingJson == null) {"));
        assertTrue("未声明态必须有自己的返回分支（return 语句，注释/tooltip 无法满足）",
                h.contains("return '<span class=\"dc\" title=\"' + esc(why) + '\">'"));
        assertTrue("未声明态必须仍打「未声明」标，不得混成失败/错误态",
                h.contains("<span class=\"tag no\">未声明</span></span>'"));
        /*  起该分支的解释文案<b>必须分两态</b>：
           原文案「未写 @Mapping，字段类型由 ES 推断」在有 derivedMappingJson 时是假话
           —— 字段类型来自注解推导，不是 ES 推断。 */
        assertTrue("有注解推导时必须说明字段类型来自推导、而非 ES 推断",
                h.contains("r.derivedMappingJson != null"));
        assertTrue("真动态态才可以说「由 ES 动态推断」",
                h.contains("字段类型将由 ES 动态推断"));
        assertFalse("不得再无条件声称「字段类型由 ES 推断」——有注解推导时那是假话",
                h.contains("未写 @Mapping，字段类型由 ES 推断"));
    }

    /**
     * <b>I-3 两态互斥（二）</b>：「mapping 未解析」必须是 {@code dateCell} 里一条真正的
     * <b>返回分支</b>，且排在「未声明」之后 —— 否则 mappingJson 为 null 的行会先命中它，又变回撒谎。
     *
     * <p><b>断言为何绑到整条 return 语句</b>：最初写成
     * {@code h.contains("r.mappingParsed !== true")} + {@code h.indexOf("mapping 未解析") > ...}，
     * 结果把 {@code dateCell} 的未知分支整段删掉后<b>照样全绿</b> ——
     * 前者匹配到了 {@code dateDetailRow} 里同形的守卫，后者匹配到了表头 tooltip 里的说明文字。
     * 两个锚都落在了与被测行为无关的文本上。故此处改为匹配<b>完整的返回语句</b>，
     * 它只可能出现在真正的分支里。</p>
     */
    @Test
    public void unparsedWordingIsGuardedByMappingParsedAndOrderedAfterUndeclared() throws Exception {
        String h = html();
        String undeclaredReturn =
                "return '<span class=\"dc\" title=\"' + esc(why) + '\">'";
        String unparsedReturn =
                "return '<span class=\"tag no\">未知</span><div class=\"hint\">mapping 未解析</div>'";
        int undeclared = h.indexOf(undeclaredReturn);
        int unparsed = h.indexOf(unparsedReturn);
        assertTrue("「未声明」必须是一条真正的返回分支，而不只是注释里提到过", undeclared >= 0);
        assertTrue("「未解析」必须是一条真正的返回分支（删掉该分支让未解析显示 0 时本条必须红）",
                unparsed >= 0);
        assertTrue("「未声明」分支必须排在「未解析」之前，否则 mappingJson==null 会被误报为未解析",
                undeclared < unparsed);
    }

    /**
     * 展开区必须写明判定不在业务侧做（spec §1.1 业务侧零 ES 读取），
     * 且明细只列 name / javaType —— 不得出现任何风险结论字样。
     */
    @Test
    public void dateDetailSaysRiskVerdictBelongsTo宿主() throws Exception {
        String h = html();
        assertTrue("展开区必须写明风险判定在 宿主侧执行",
                h.contains("风险判定请在 宿主侧执行"));
        assertTrue("展开区必须说明理由是业务侧零 ES 读取", h.contains("业务侧零 ES 读取"));
    }

    /**
     * row 级 {@code mappingParsed} 不得再从 {@code fields[0]} 推断（评审 I-2）。
     *
     * <p>旧实现 {@code fs[0].mappingParsed === true} 有两个毛病：与列表顺序耦合、
     * 且零字段的合法实体取不到值被误判成未解析。</p>
     */
    @Test
    public void pageDoesNotInferMappingParsedFromFirstField() throws Exception {
        String h = html();
        assertFalse("不得从 fields[0] 推断 per-index 的 mappingParsed",
                h.contains("fs[0].mappingParsed") || h.contains("fields[0].mappingParsed"));
    }

    /**
     * JSON 语法高亮存在且不复用 esc()。
     * <p>刻意不锚裸词 hl —— 锚 hl 的<b>关键实现约束</b>：它必须先只转义 &lt;&gt;&amp;（保留字面 "），
     * 否则 esc() 把 " 变 &amp;quot; 会让 key/string 正则全部落空、上不了色（这是本波真踩过的坑）。
     * 删掉 hl 或让它复用 esc() 时本条必须红。
     */
    @Test
    public void pageHighlightsJsonWithFourTokenClasses() throws Exception {
        String h = html();
        assertTrue("必须有 JSON 高亮函数 hl", h.contains("function hl("));
        assertTrue("hl 必须保留字面双引号（不能复用会转 &quot; 的 esc）",
                h.contains("<pre>' + hl(text) + '</pre>"));
        assertTrue("必须有 4 类 token 的 class（key/string/number/bool）",
                h.contains("class=\"jk\"") && h.contains("class=\"js\"")
                        && h.contains("class=\"jn\"") && h.contains("class=\"jb\""));
    }

    /**
     * 复制路径不得被高亮污染：既有 copy(rawText,) 契约（复制全部）不动，
     * 且 per-block 复制取的是 pre.textContent（span/mark 不产生文本，故仍是原始 JSON）。
     */
    @Test
    public void highlightDoesNotPolluteCopy() throws Exception {
        String h = html();
        assertTrue("复制全部仍以原始响应文本为参数", h.contains("copy(rawText,"));
        assertTrue("per-block 复制取 pre.textContent（不含 span/mark）",
                h.contains("copy(pre.textContent,"));
    }

    /**
     * 搜索命中标记只作用于标签间文本：markPre 用 /&gt;([^&lt;]+)&lt;/ 回调，
     * 只在 &gt;...&lt; 之间包 &lt;mark&gt;，永不触碰标签内部（如 class="js"）。
     * 若改成对整段 innerHTML 无差别包 mark，搜 "js" 会标到类名上、破坏语法高亮 —— 那时本条红。
     */
    @Test
    public void searchMarksOnlyTextBetweenTags() throws Exception {
        String h = html();
        assertTrue("必须有命中标记函数 markPre", h.contains("function markPre("));
        assertTrue("命中标记必须限定在 >...< 文本节点内",
                h.contains(">([^<]+)<"));
        assertTrue("搜索用户输入前必须转义正则特殊字符（escRe），否则输入 . [ 会炸",
                h.contains("function escRe("));
    }

    /**
     * 搜索必须既筛卡（按名字）又搜 JSON 正文，命中 JSON 时展开该卡。
     * 锚 filter 里的 jsonHay/inJson 分支：删掉「搜 JSON」只留筛卡时本条红。
     */
    @Test
    public void searchCoversNamesAndJsonBodyAndExpandsOnJsonHit() throws Exception {
        String h = html();
        assertTrue("必须有过滤函数 filter", h.contains("function filter("));
        assertTrue("haystack 必须含名字字段（indexKey/alias/entityClass）",
                h.contains("r.indexKey") && h.contains("r.alias") && h.contains("r.entityClass"));
        assertTrue("haystack 必须含 JSON 正文（settings/mapping）",
                h.contains("r.settingsJson") && h.contains("r.mappingJson"));
        assertTrue("命中 JSON 正文时必须展开该卡（det on）",
                h.contains("det.className = 'det on'"));
        assertTrue("输入事件必须触发 filter", h.contains("qEl.addEventListener('input', filter)"));
    }

}
