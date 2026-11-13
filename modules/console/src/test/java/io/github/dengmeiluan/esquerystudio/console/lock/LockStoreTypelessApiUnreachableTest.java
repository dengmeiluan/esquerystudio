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

package io.github.dengmeiluan.esquerystudio.console.lock;

import org.junit.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * -67 <b>防复发看守</b>：证明「锁层写出 typeless RHLC 请求」在<b>类型层面不可达</b>。
 *
 * <p><b>为什么需要它</b>：{@code putMappingVersionAware} / {@code _update} / {@code _explain} /
 * {@code _termvectors} 早在 / 就做了版本感知兜底，<b>唯独  新加的锁绕过了全部惯例</b>。
 * 原因不是能力缺失，而是——<b>惯例只活在老代码里，不活在任何能拦住新代码的地方</b>。</p>
 *
 * <p><b>看守形式：让错误不可能，而不是检测错误。</b>
 * {@link EsRebuildLockStore} 不再持有 {@code RestHighLevelClient}，只持有 {@link LockDocPort}。
 * 端口按<b>意图</b>建模（{@code createIfAbsent}/{@code replaceIfUnchanged}/{@code deleteIfUnchanged}），
 * <b>词汇表里根本没有「发一个 typeless 请求」这个概念</b>——
 * 想写错必须先改端口签名，那是评审看得见的显式动作。</p>
 *
 * <p><b>本看守抓不到什么（自曝绕过方式，按本仓既有先例的标准）</b>：</p>
 * <ol>
 *   <li><b>反射</b>：用反射拿到 {@code VersionAwareLockDocPort.client} 再发裸请求——抓不到。</li>
 *   <li><b>新增一个不经端口的类</b>：另写一个 {@code XxxLockStore} 直接注入 RHLC——本测试只锁
 *       {@code EsRebuildLockStore} 一个类型，抓不到。</li>
 *   <li><b>改端口签名</b>：往 {@link LockDocPort} 里加一个 {@code index(IndexRequest)} 方法——
 *       测试第 3 条会红（端口不得暴露 ES 类型），但如果连这条一起改掉就抓不到。</li>
 *   <li><b>端口实现内部写错路径</b>：本测试不看路径字符串——那由
 *       {@code VersionAwareLockDocPortPathTest} 断言 path 值来守。两者互补，缺一不可。</li>
 * </ol>
 *
 * @author aicoding
 */
public class LockStoreTypelessApiUnreachableTest {

    private static final String RHLC = "org.elasticsearch.client.RestHighLevelClient";

    /**
     * 1) {@link EsRebuildLockStore} 的构造器<b>不得</b>接受 RHLC（或其 Supplier）。
     *
     * <p>证伪：把构造器改回 {@code EsRebuildLockStore(Supplier<RestHighLevelClient>, String, boolean)}
     * —— 本条立刻红。</p>
     */
    @Test
    public void lockStoreConstructor_doesNotAcceptRestHighLevelClient() {
        Constructor<?>[] ctors = EsRebuildLockStore.class.getConstructors();
        assertEquals("锁存储应只有一个构造器", 1, ctors.length);
        for (java.lang.reflect.Type t : ctors[0].getGenericParameterTypes()) {
            assertFalse("锁存储构造器不得接受 RestHighLevelClient（哪怕包在 Supplier 里）: " + t,
                    t.getTypeName().contains(RHLC));
        }
        assertTrue("锁存储必须经 LockDocPort 窄端口",
                ctors[0].getParameterTypes()[0] == LockDocPort.class);
    }

    /** 2) {@link EsRebuildLockStore} 的任何字段都不得是 RHLC —— 拿不到裸客户端就发不出裸请求。 */
    @Test
    public void lockStoreFields_holdNoEsClient() {
        for (Field f : EsRebuildLockStore.class.getDeclaredFields()) {
            assertFalse("锁存储不得持有 RestHighLevelClient: " + f,
                    f.getGenericType().getTypeName().contains(RHLC));
        }
    }

    /**
     * 3) {@link LockDocPort} 的签名<b>不得泄漏任何 ES 客户端类型</b>。
     *
     * <p>这是「意图端口 vs 动词端口」的机械判据：一旦端口出现
     * {@code index(IndexRequest)} 这类方法，裸请求对象就原路漏回来，收窄等于没做。
     * 端口只许出现 JDK 类型 + 自己的 {@code LockDoc}。</p>
     */
    @Test
    public void portSignatures_leakNoElasticsearchTypes() {
        for (Method m : LockDocPort.class.getDeclaredMethods()) {
            assertFalse("端口返回类型不得是 ES 类型: " + m,
                    m.getGenericReturnType().getTypeName().startsWith("org.elasticsearch"));
            for (java.lang.reflect.Type t : m.getGenericParameterTypes()) {
                assertFalse("端口入参不得是 ES 类型（否则裸请求对象原路漏回）: " + m + " <- " + t,
                        t.getTypeName().startsWith("org.elasticsearch"));
            }
        }
    }

    /** 4) 端口必须真的提供 CAS 语义的意图方法——契约是签名里的值，不是标志位组合。 */
    @Test
    public void portExposesIntentNamedCasOperations() throws Exception {
        // seqNo / primaryTerm 是显式参数：调用方无法「忘记」带 CAS 条件而退化成无条件覆写
        Method replace = LockDocPort.class.getMethod("replaceIfUnchanged",
                String.class, String.class, java.util.Map.class, long.class, long.class);
        assertEquals(boolean.class, replace.getReturnType());

        Method del = LockDocPort.class.getMethod("deleteIfUnchanged",
                String.class, String.class, long.class, long.class);
        assertEquals(boolean.class, del.getReturnType());

        // createIfAbsent 用返回值表达「抢到/没抢到」，而不是靠调用方解析异常状态码
        Method create = LockDocPort.class.getMethod("createIfAbsent",
                String.class, String.class, java.util.Map.class);
        assertEquals(boolean.class, create.getReturnType());
    }
}
