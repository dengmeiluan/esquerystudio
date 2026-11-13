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

package io.github.dengmeiluan.esquerystudio.console.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.annotation.PostConstruct;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

/**
 * 把「宿主 ES 栈版本契约」从隐形假设变成启动期可见的显式约束。
 *
 * <p>起因（实测）：starter 编译期是 sdes 4.0.9，而宿主可能自带 4.4.x。
 * 两版之间有 4 个签名不兼容点，其中两个落在 {@code EntityFieldScanner}
 * —— client 模式 desired-state 的必经之路。原来的失败形态是
 * <b>启动完全正常，业务应用打开页面才抛 {@code NoSuchMethodError}</b>，
 * 第一个撞见的人既不知道原因也不知道该改什么。</p>
 *
 * <p><b>为什么只 WARN 不拦</b>：契约点已由 {@code SdesCompat} 反射化，
 * 探测不满足并不等于一定不能用；而「超出我们验证过的版本区间」与
 * 「确定不兼容」是两件事，把前者当后者拦掉会让接入方卡在一个假问题上。
 * 真不能用时那几个点自己会抛，且届时日志里已有本类的 WARN 可对照。</p>
 *
 * <p>本类是<i>诊断件</i>：只读探测 + 打日志，无任何副作用。带
 * {@code @ConditionalOnMissingBean}（宿主想换自己的诊断是正当需求），
 * 但<b>不</b>按 mode 条件装配 —— client 模式正是断裂点所在，
 * 只在 console 装等于让最需要这条诊断的一方拿不到它。</p>
 */
public class EsStackContractValidator {

    private static final Logger LOG = LoggerFactory.getLogger(EsStackContractValidator.class);

    /**
     * starter 侧<b>已适配</b>的 sdes 版本前缀（≠「端到端已实测」）。
     *
     * <p><b>这是「已适配区间」的单一来源</b>：README 的版本矩阵与
     * {@code EntityFieldScannerTest} 里那条 manifest 断言都以此为准，改动时三处必须同步。</p>
     *
     * <p>⚠ <b>措辞刻意区分</b>：本常量说的是「starter 自己的字节码在该版本上无断裂」
     * （4.0.x / 4.4.x 均实测 0 BREAKS），<b>不</b>等于该版本端到端可用 ——
     * sdes 4.4.x 配 ES 7.10.x 时 sdes 自身会抛 {@code NoSuchFieldError: INDEX_CONTENT_TYPE}，
     * starter 无从介入。端到端结论见 README 版本矩阵，那里区分了
     * 「端到端可用 / 未实测 / 不可用」三态。</p>
     */
    public static final String VERIFIED_SDES = "4.0.x, 4.4.x（starter 侧已适配）";

    /** 探测结果：不满足的契约点描述；全满足返回空列表。 */
    public static List<String> probe() {
        List<String> unmet = new ArrayList<String>();
        checkMethod(unmet, "org.springframework.data.elasticsearch.annotations.Field", "format");
        checkMethod(unmet, "org.springframework.data.elasticsearch.annotations.Field", "pattern");
        checkMethod(unmet, "org.springframework.data.elasticsearch.core.IndexOperations", "refresh");
        checkMethod(unmet, "org.springframework.data.elasticsearch.core.query.NativeSearchQueryBuilder",
                "withPageable", "org.springframework.data.domain.Pageable");
        return unmet;
    }

    /** 实测 sdes 版本；取不到返回 {@code "unknown"}（探测不到 ≠ 不兼容）。 */
    public static String detectedSdesVersion() {
        try {
            Class<?> k = Class.forName("org.springframework.data.elasticsearch.annotations.Field");
            String v = k.getPackage() == null ? null : k.getPackage().getImplementationVersion();
            return v == null || v.trim().isEmpty() ? "unknown" : v;
        } catch (Throwable t) {
            /* 静默兜底补 debug 留痕（异常类名+message）——探测失败与「确实无版本」
               在日志上可区分，排障不再两眼一抹黑；返回 "unknown" 契约不变。 */
            LOG.debug("[EsStackContract] sdes 版本探测失败（按 unknown 处理）：{}: {}",
                    t.getClass().getName(), t.getMessage());
            return "unknown";
        }
    }

    @PostConstruct
    public void report() {
        String v = detectedSdesVersion();

        /* 宿主栈错配 —— fail-fast。
           与下面 starter 侧契约点只 WARN 的**不对称是有意的**：
           starter 侧契约点已由 SdesCompat 反射化，探测不到也可能能用；
           而宿主栈错配是**已实测会炸**的（#96），且炸在建出目标索引之后、留下半拷贝 ——
           启动期拦住的代价远小于运行期炸。 */
        List<String> hostMismatch = probeHostStackMismatch();
        if (!hostMismatch.isEmpty()) {
            StringBuilder msg = new StringBuilder("[EsStackContract] 宿主 ES 栈版本不配套，拒绝启动：\n");
            for (String s : hostMismatch) {
                msg.append("  - ").append(s).append('\n');
            }
            msg.append("  修法二选一（实测：两条路不等价）：\n")
                    .append("    ① 把 elasticsearch 客户端升到与 spring-data-elasticsearch 匹配的版本\n")
                    .append("       ⚠ 仅当服务端 minor >= 客户端 minor 时可行 —— RHLC 官方保证是单向前向兼容\n")
                    .append("       （client_minor <= node_minor）。服务端比客户端老时这条路不可用。\n")
                    .append("    ② 把 spring-data-elasticsearch 降到与当前 elasticsearch 客户端匹配的版本\n")
                    .append("       ⚠ 机制必须是 import spring-data-bom；单写 <spring-data-elasticsearch.version>\n")
                    .append("       属性会被 Boot 引入的 spring-data-bom 静默压过（实测空转）。\n")
                    .append("  参见 starter README「宿主依赖约束」。\n")
                    .append("  ⚠ 不修的后果：迁移/写入类操作会在**建出目标索引之后**抛 ")
                    .append("NoSuchFieldError，留下半拷贝（台账 #96 实测）。");
            throw new IllegalStateException(msg.toString());
        }

        List<String> unmet = probe();
        if (unmet.isEmpty()) {
            /* 措辞刻意限定在「starter 侧」：本探针只查 starter 调用的那几个签名，
               查不出 sdes 内部与 ES 客户端的错配（如 INDEX_CONTENT_TYPE）。
               写成「契约点全部满足」会被读成「这个组合能用」。 */
            LOG.info("[EsStackContract] spring-data-elasticsearch={} starter 侧契约点全部满足"
                    + "（已适配: {}）。注：本检查不覆盖宿主 sdes 与 ES 客户端之间的版本配套", v, VERIFIED_SDES);
            return;
        }
        LOG.warn("[EsStackContract] spring-data-elasticsearch={} 有 {} 个 starter 侧契约点探测不到（已适配: {}）",
                v, unmet.size(), VERIFIED_SDES);
        for (String s : unmet) {
            LOG.warn("[EsStackContract]   未满足: {}", s);
        }
        LOG.warn("[EsStackContract] 若随后出现 NoSuchMethodError / NoSuchFieldError，"
                + "先核对宿主的 spring-data-elasticsearch 与 elasticsearch 客户端版本是否配套"
                + "（见 starter README「宿主依赖约束」）");
    }

    /* ================= ：宿主 sdes 与 ES 客户端的配套校验 ================= */

    /**
     * 宿主自身的 sdes 与 ES 客户端是否配套。
     *
     * <p><b>判据是真实签名，不是版本号区间。</b>台账 #96 的故障是
     * {@code Requests.INDEX_CONTENT_TYPE} 的<b>类型签名</b>在 sdes 与 ES 之间不一致
     * （字段名相同，JVM 判字段不存在）。{@code XContentType} 包路径<i>据称</i>在
     * ES 7.16 迁移，但那是推断 —— 无 ≥7.16 的 jar 可证；签名比对是实测的，
     * 且与「它是哪个版本」无关。</p>
     *
     * @return 错配描述列表；配套或无法判定时返回空列表
     */
    public static List<String> probeHostStackMismatch() {
        List<String> mismatch = new ArrayList<String>();
        String actual = xcontentTypeSignature();
        String expected = sdesExpectedXContentType();
        if (actual == null || expected == null) {
            /* 读不到不等于错配 —— 「未知不可被表示成某个已知值」（#67 教训）。
               此时交由 starter 侧契约点与运行时自身暴露，不在这里猜。 */
            return mismatch;
        }
        compareSignature(mismatch, expected, actual,
                "org.elasticsearch.client.Requests.INDEX_CONTENT_TYPE");
        return mismatch;
    }

    /** ES 侧实际能加载到的 {@code XContentType} 全限定名；取不到返回 null。 */
    public static String xcontentTypeSignature() {
        String[] candidates = {
                "org.elasticsearch.xcontent.XContentType",
                "org.elasticsearch.common.xcontent.XContentType",
        };
        for (String c : candidates) {
            try {
                return Class.forName(c).getName();
            } catch (Throwable ignored) {
                /* 试下一个候选 */
            }
        }
        return null;
    }

    /**
     * 读 sdes 的 {@code RequestFactory} class 字节流，看它<b>期待</b>哪个 {@code XContentType} 包路径。
     *
     * <p><b>为什么不用反射</b>：反射看到的是 ES 侧<b>真实存在</b>的字段类型，
     * 而 #96 的故障恰恰是「sdes 字节码<b>期待</b>的类型」与之不同 ——
     * 期待值只存在于 sdes 的 class 常量池里，反射看不到它。</p>
     *
     * <p>零依赖实现：class 常量池里类名以 UTF8 常量存放，直接在字节流里搜两种形态。
     * 这不是完整 class parser，但对「找一个已知字符串在不在常量池里」足够可靠
     * （实测判别力：sdes 4.0.9 → 旧路径，sdes 4.4.18 → 新路径，无歧义）。</p>
     *
     * <p>两种形态互不为子串（新路径少了 {@code common/} 一段），故两个 {@code contains}
     * 互不干扰；但<b>必须两个都判并要求恰好一个成立</b> ——
     * 只判一个会在另一种形态下静默误判。</p>
     *
     * @return sdes 期待的全限定名（点分）；读不到或两者同现/同缺时返回 null（不猜）
     */
    private static String sdesExpectedXContentType() {
        String res = "org/springframework/data/elasticsearch/core/RequestFactory.class";
        java.io.InputStream in = EsStackContractValidator.class.getClassLoader().getResourceAsStream(res);
        return sdesExpectedXContentType(in);
    }

    /**
     * 测试接缝（流由外部注入，同 {@code AdhocRebuildService#resolveFieldType} 的
     * package-private 先例）：把「字节流读取失败」臂从静默改为冷路径 WARN。
     * 该臂吞掉的是宿主栈错配检测的<b>整段能力</b>（fail-open 跳过），静默会让
     * 「检测跳过」被误读为「检测通过」。启动期一次性冷路径，WARN 一条不刷屏；
     * 返回 null 契约不变（{@link #probeHostStackMismatch()} 对 null 维持
     * 「无法判定≠错配」原语义；流为 null 即 sdes 不在 classpath，属判据内，静默）。
     *
     * @return sdes 期待的全限定名（点分）；读不到或两者同现/同缺时返回 null（不猜）
     */
    static String sdesExpectedXContentType(java.io.InputStream in) {
        if (in == null) {
            return null;
        }
        try {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                bos.write(buf, 0, n);
            }
            String body = new String(bos.toByteArray(), "ISO-8859-1");
            boolean hasNew = body.contains("org/elasticsearch/xcontent/XContentType");
            boolean hasOld = body.contains("org/elasticsearch/common/xcontent/XContentType");
            if (hasNew && !hasOld) {
                return "org.elasticsearch.xcontent.XContentType";
            }
            if (hasOld && !hasNew) {
                return "org.elasticsearch.common.xcontent.XContentType";
            }
            return null;
        } catch (Throwable t) {
            // 裁决（三态之②回退误导类）：探测失败 = 宿主栈错配检测整段跳过，
            // 启动期一次性冷路径 WARN 留痕（Observability554Test 反锁）；null 契约不变。
            LOG.warn("[EsStackContract] 栈契约检测跳过：sdes RequestFactory 字节流读取失败（{}）"
                    + "—— 无法校验宿主 sdes 与 ES 客户端的 XContentType 签名配套",
                    t.getMessage(), t);
            return null;
        } finally {
            try {
                in.close();
            } catch (Throwable ignored) {
                /* 关流失败不影响判定 */
            }
        }
    }

    /** 两个签名不一致则记一条可操作的错配描述。 */
    private static void compareSignature(List<String> out, String expected, String actual, String what) {
        if (expected.equals(actual)) {
            return;
        }
        out.add(what + " 的类型签名不一致：spring-data-elasticsearch 期待 " + expected
                + "，而 elasticsearch 客户端实际提供 " + actual
                + " —— 两者版本不配套");
    }

    /** 反射查方法是否存在（含继承）；参数类型按全限定名逐位比对。 */
    private static void checkMethod(List<String> unmet, String cls, String method, String... paramTypes) {
        try {
            Class<?> k = Class.forName(cls);
            for (Method m : k.getMethods()) {
                if (!m.getName().equals(method) || m.getParameterTypes().length != paramTypes.length) {
                    continue;
                }
                boolean match = true;
                for (int i = 0; i < paramTypes.length; i++) {
                    if (!m.getParameterTypes()[i].getName().equals(paramTypes[i])) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    return;
                }
            }
            unmet.add(cls + "." + method + "(" + join(paramTypes) + ")");
        } catch (Throwable t) {
            unmet.add(cls + " 不可加载 (" + t.getClass().getSimpleName() + ")");
        }
    }

    private static String join(String[] a) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < a.length; i++) {
            if (i > 0) {
                b.append(", ");
            }
            b.append(a[i].substring(a[i].lastIndexOf('.') + 1));
        }
        return b.toString();
    }
}
