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

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 契约校验器必须在<b>本机这套 sdes（4.0.9）</b>上报「全部满足」。
 *
 * <p>这既是正向对照（证明探针不是恒报失败），也是回归看守 ——
 * 将来谁把 starter 的 sdes 版本换掉而没更新兼容层，这条会红。</p>
 *
 * <p>⚠ 单有「本机全满足」是不够的：一个恒返回空列表的探针也能让它绿。
 * 故另配一条<b>反向对照</b>，喂一个必然不存在的方法，探针必须报出未满足。</p>
 */
public class EsStackContractValidatorTest {

    @Test
    public void 本机sdes下四个契约点全部满足() {
        List<String> unmet = EsStackContractValidator.probe();
        assertTrue("本机 sdes 下不该有未满足的契约点，实际: " + unmet, unmet.isEmpty());
    }

    @Test
    public void 能探测到sdes版本() {
        String v = EsStackContractValidator.detectedSdesVersion();
        assertNotNull(v);
        /* 注：jar 无 Implementation-Version 时会是 unknown，那本身不是缺陷
           （探测不到 ≠ 不兼容），故只断言非空。 */
        assertFalse(v.trim().isEmpty());
    }

    @Test
    public void probe可重复调用且结果稳定() {
        assertEquals(EsStackContractValidator.probe(), EsStackContractValidator.probe());
    }

    /**
     * 反向对照：探针必须<b>有能力</b>报出「不满足」。
     *
     * <p>若探针恒返回空列表，上面那条「本机全满足」照样绿 —— 那个空列表就毫无意义。
     * 这里用与 {@code probe()} 同一套反射逻辑去查一个必然不存在的方法。</p>
     */
    @Test
    public void 探针对不存在的方法必须报未满足() throws Exception {
        java.lang.reflect.Method check = EsStackContractValidator.class.getDeclaredMethod(
                "checkMethod", List.class, String.class, String.class, String[].class);
        check.setAccessible(true);
        List<String> unmet = new java.util.ArrayList<String>();
        check.invoke(null, unmet,
                "org.springframework.data.elasticsearch.annotations.Field",
                "thisMethodMustNotExistR96", new String[0]);
        assertFalse("对必然不存在的方法，探针必须报未满足（否则它的空列表毫无意义）",
                unmet.isEmpty());
    }

    /** 已验证区间是三处共用的单一来源，不该是空串。 */
    @Test
    public void 已验证区间常量非空() {
        assertNotNull(EsStackContractValidator.VERIFIED_SDES);
        assertFalse(EsStackContractValidator.VERIFIED_SDES.trim().isEmpty());
    }

    /* ---- ：宿主 sdes 与 ES 客户端的配套校验 ---- */

    /**
     * 本机（sdes 4.0.9 + ES 7.6.2）是配套的，必须报无错配。
     *
     * <p>正向对照：若这条红了，说明校验逻辑本身有问题 ——
     * 本机组合是 starter 编译期组合，定义上配套。</p>
     */
    @Test
    public void 本机sdes与ES客户端配套无错配() {
        List<String> mismatch = EsStackContractValidator.probeHostStackMismatch();
        assertTrue("本机组合（starter 编译期组合）应无错配，实际: " + mismatch, mismatch.isEmpty());
    }

    /** 能读到 ES 实际提供的 XContentType 全限定名（判据是签名，不是版本号）。 */
    @Test
    public void 能读到ES实际提供的XContentType签名() {
        String sig = EsStackContractValidator.xcontentTypeSignature();
        assertNotNull("应能读到 XContentType 的实际包路径", sig);
        assertTrue("应是 XContentType，实际: " + sig, sig.endsWith(".XContentType"));
        System.out.println("ES 侧实际提供: " + sig);
    }

    /**
     * 反向对照：校验逻辑必须<b>有能力</b>报出错配。
     *
     * <p>若没有这条，「本机无错配」可能只是因为该方法恒返回空列表 —— 那它毫无意义。</p>
     */
    @Test
    public void 校验逻辑对签名不一致必须报错配() throws Exception {
        java.lang.reflect.Method cmp = EsStackContractValidator.class.getDeclaredMethod(
                "compareSignature", List.class, String.class, String.class, String.class);
        cmp.setAccessible(true);
        List<String> out = new java.util.ArrayList<String>();
        cmp.invoke(null, out,
                "org.elasticsearch.xcontent.XContentType",
                "org.elasticsearch.common.xcontent.XContentType", "probe");
        assertFalse("签名不一致时必须报错配（否则「本机无错配」毫无意义）", out.isEmpty());
        System.out.println("反向对照报文: " + out.get(0));
    }

    /**
     * 常量池读法必须在本机 sdes 上读出<b>确定</b>结果，而不是 null。
     *
     * <p>若返回 null，说明「两形态同现或同缺」—— 那时校验器会静默放行，
     * 整条 fail-fast 就形同不存在。这条钉死判别力真的存在。</p>
     */
    @Test
    public void 常量池读法在本机能读出确定的期待签名() throws Exception {
        java.lang.reflect.Method m = EsStackContractValidator.class.getDeclaredMethod(
                "sdesExpectedXContentType");
        m.setAccessible(true);
        Object expected = m.invoke(null);
        assertNotNull("本机 sdes 应能读出确定的期待签名（null 意味着校验器会静默放行）", expected);
        System.out.println("sdes 侧期待: " + expected);
        /* 本机是 4.0.9 → 旧路径。这不是在测 sdes，是在测读法没跑偏。 */
        assertEquals("本机 sdes 4.0.9 应期待旧包路径",
                "org.elasticsearch.common.xcontent.XContentType", expected);
    }
}
