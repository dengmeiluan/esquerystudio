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

import org.junit.Test;

import java.io.File;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/**
 * 兼容层的<b>双版本兑现</b>。
 *
 * <p>其余测试都跑在本机 sdes 4.0.9 上，而本波要修的正是
 * 「4.0.9 过了不代表 4.4.x 过」——「本机这版能用」根本不是本波的命题。
 * 故这里用独立 {@link URLClassLoader} 加载<b>另一版</b> sdes，
 * 直接验证 {@code Field.format()/pattern()} 在那一版上确实返回<b>数组</b>，
 * 即 {@link SdesCompat} 的形态归一不是凭空防御。</p>
 *
 * <p><b>备选 jar 从哪来</b>：由 maven-dependency-plugin 在
 * {@code generate-test-resources} 阶段固定复制到 {@code target/sdes-alt/}，
 * 同时保留本机 m2 / D:/mvn_repository / 宿主 fat jar 的回退查找。
 * jar 缺失直接失败，不以 Assume 跳过代替验证。</p>
 */
public class SdesContractMatrixTest {

    /** 宿主 fat jar 的常规位置（本机开发环境）。 */
    private static final String QH_FATJAR =
            "D:/idea_project/quotehub/backend/target/quote-hub-admin-0.0.1-SNAPSHOT.jar";

    /**
     * 找一份与本机不同大版本的 sdes jar；找不到返回 null。
     *
     * <p>从 fat jar 里取时会解到临时文件（JVM 退出时删）—— 嵌套 jar 不能直接被
     * {@code URLClassLoader} 加载。</p>
     */
    private static File altSdesJar() throws Exception {
        File copied = new File(System.getProperty("basedir", "."),
                "target/sdes-alt/spring-data-elasticsearch-4.4.18.jar");
        if (copied.isFile()) return copied;
        String localRepo = System.getProperty("maven.repo.local", "D:/mvn_repository");
        File local = new File(localRepo + "/org/springframework/data/spring-data-elasticsearch/"
                + "4.4.18/spring-data-elasticsearch-4.4.18.jar");
        if (local.isFile()) return local;
        String home = System.getProperty("user.home");
        File m2 = new File(home + "/.m2/repository/org/springframework/data/spring-data-elasticsearch/"
                + "4.4.18/spring-data-elasticsearch-4.4.18.jar");
        if (m2.isFile()) {
            return m2;
        }
        File fat = new File(QH_FATJAR);
        if (!fat.isFile()) {
            return null;
        }
        JarFile jf = new JarFile(fat);
        try {
            Enumeration<JarEntry> en = jf.entries();
            while (en.hasMoreElements()) {
                JarEntry e = en.nextElement();
                String n = e.getName();
                if (n.startsWith("BOOT-INF/lib/spring-data-elasticsearch-4.4.") && n.endsWith(".jar")) {
                    Path tmp = Files.createTempFile("sdes-alt-", ".jar");
                    tmp.toFile().deleteOnExit();
                    InputStream in = jf.getInputStream(e);
                    try {
                        Files.copy(in, tmp, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                    } finally {
                        in.close();
                    }
                    System.out.println("[matrix] alt sdes extracted from fat jar: " + n);
                    return tmp.toFile();
                }
            }
        } finally {
            jf.close();
        }
        return null;
    }

    /* ---- 不依赖外部 jar 也能锁住的部分：形状归一本身 ---- */

    @Test
    public void 形状归一在数组与单值两种形态下都正确() {
        assertEquals("first", SdesCompat.firstIfArray(new String[]{"first", "second"}));
        assertEquals("solo", SdesCompat.firstIfArray("solo"));
        assertNull(SdesCompat.firstIfArray(new String[0]));
        assertNull(SdesCompat.firstIfArray(null));
    }

    /**
     * 本波全部工作的根据：另一版 sdes 上 {@code Field.format()/pattern()} 返回<b>数组</b>。
     *
     * <p>这条直接测「差异确实存在」。若它红了，说明版本判断的前提变了，
     * 兼容层的必要性需要重新评估 —— 而不是把这条改掉。</p>
     */
    @Test
    public void 另一版sdes上Field注解确实返回数组() throws Exception {
        File jar = altSdesJar();
        assertNotNull("4.4.x sdes jar 必须由 maven-dependency-plugin 提供（不再以跳过代替验证）", jar);

        URLClassLoader alt = new URLClassLoader(new URL[]{jar.toURI().toURL()}, null);
        try {
            Class<?> fieldAnn = alt.loadClass("org.springframework.data.elasticsearch.annotations.Field");
            Method format = fieldAnn.getMethod("format");
            Method pattern = fieldAnn.getMethod("pattern");
            System.out.println("[matrix] alt Field.format()  -> " + format.getReturnType());
            System.out.println("[matrix] alt Field.pattern() -> " + pattern.getReturnType());
            assertTrue("4.4.x 的 Field.format() 应返回数组，实际: " + format.getReturnType(),
                    format.getReturnType().isArray());
            assertTrue("4.4.x 的 Field.pattern() 应返回数组，实际: " + pattern.getReturnType(),
                    pattern.getReturnType().isArray());

            /* 与本机形成对照：本机（4.0.9）必须是单值 —— 两版形态确实不同，
               否则「归一」就是在解决一个不存在的问题。 */
            Method localFormat = org.springframework.data.elasticsearch.annotations.Field.class
                    .getMethod("format");
            assertFalse("本机 sdes 的 Field.format() 应是单值（与 4.4.x 形成对照），实际: "
                            + localFormat.getReturnType(),
                    localFormat.getReturnType().isArray());
        } finally {
            alt.close();
        }
    }

    /**
     * {@code SdesCompat.formatName} 在<b>数组形态</b>下也能取到枚举名。
     *
     * <p>用另一版 sdes 的真实注解形态构造：拿它的 {@code DateFormat} 数组喂
     * {@code firstIfArray}，再验能继续取 {@code name()} —— 覆盖 4.4.x 上的真实路径。</p>
     */
    @Test
    public void 数组形态下仍能取到枚举名() throws Exception {
        File jar = altSdesJar();
        assertNotNull("4.4.x sdes jar 必须由 maven-dependency-plugin 提供（不再以跳过代替验证）", jar);

        URLClassLoader alt = new URLClassLoader(new URL[]{jar.toURI().toURL()}, null);
        try {
            Class<?> dfClass = alt.loadClass("org.springframework.data.elasticsearch.annotations.DateFormat");
            Object[] arr = (Object[]) java.lang.reflect.Array.newInstance(dfClass, 2);
            Object[] consts = dfClass.getEnumConstants();
            assertTrue("另一版 DateFormat 应有枚举常量", consts != null && consts.length >= 2);
            arr[0] = consts[0];
            arr[1] = consts[1];

            Object first = SdesCompat.firstIfArray(arr);
            assertEquals("数组形态应取首元素", consts[0], first);
            /* 取到首元素后必须还能 name() —— formatName 的第二步依赖这一点 */
            Method name = first.getClass().getMethod("name");
            Object nm = name.invoke(first);
            System.out.println("[matrix] alt DateFormat[0].name() = " + nm);
            assertEquals(((Enum<?>) consts[0]).name(), String.valueOf(nm));
        } finally {
            alt.close();
        }
    }
}
