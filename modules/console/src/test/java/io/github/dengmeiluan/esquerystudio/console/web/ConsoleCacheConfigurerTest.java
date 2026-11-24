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

package io.github.dengmeiluan.esquerystudio.console.web;

import org.junit.Test;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;

import java.lang.reflect.Field;
import java.util.List;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * 钉住 {@link ConsoleCacheConfigurer} 的实质注册内容（pattern / location / 缓存头）。
 *
 * <p>装配存在性（console 装 / client 不装）由 {@code ClientModeWiringTest} 承担；
 * 本类防的是「装了但配错」——pattern 漂移会让长缓存落空（每次重下 767KB），
 * location 漂移会让控制台资源 404（白屏），html 漏配 no-cache 会让发版后旧 HTML 引用已删除的旧 hash 资产。</p>
 *
 * <p>反射字段名（registrations / pathPatterns / cacheControl / locationValues）
 * 已在 spring-webmvc 5.2.15 核对；未来升级若改名，本测试必须红而不是恒真。</p>
 */
public class ConsoleCacheConfigurerTest {

    @Test
    public void assetsPatternGetsImmutableLongCache() throws Exception {
        Object assets = findByPattern("/esquerystudio/assets/**");
        assertNotNull("必须注册 /esquerystudio/assets/** 专属 handler（带 hash 资产长缓存）", assets);

        String header = cacheHeaderOf(assets);
        assertTrue("资产缓存头须含一年 max-age，实际=" + header, header.contains("max-age=31536000"));
        assertTrue("资产缓存头须含 public（允许共享/中间缓存），实际=" + header, header.contains("public"));

        String locations = locationsOf(assets);
        assertTrue("assets handler 的 location 必须直指 assets 目录（通配段只含文件名），实际=" + locations,
                locations.contains("static/esquerystudio/assets"));
    }

    @Test
    public void htmlEntriesGetNoCache() throws Exception {
        Object html = null;
        for (Object reg : registrations()) {
            if (patternsOf(reg).length == 2) {
                html = reg;
            }
        }
        assertNotNull("必须注册两个 html 入口的专属 handler", html);
        assertArrayEquals("html 入口集合必须与 static 根实际入口一一对应",
                new String[]{"/esquerystudio/index.html", "/esquerystudio.html"},
                patternsOf(html));

        assertEquals("html 入口必须 no-cache（发版后即刻拿到引用新 hash 资产的新 HTML）",
                "no-cache", cacheHeaderOf(html));

        String locations = locationsOf(html);
        assertTrue("html handler 的 location 必须留在 static 根（精确 pattern 的 pathWithinMapping 是完整路径），实际="
                + locations, locations.contains("classpath:/static/"));
    }

    /** 守卫：本 configurer 不允许接管整个 /esquerystudio/**（那会与 client 模式 guard 的职责混淆，且拖慢解析） */
    @Test
    public void doesNotTakeOverBroadEsquerystudioPattern() throws Exception {
        for (Object reg : registrations()) {
            for (String p : patternsOf(reg)) {
                assertTrue("不允许注册宽泛 pattern /esquerystudio/**（只能精确到 assets 与 html 入口），实际=" + p,
                        !"/esquerystudio/**".equals(p));
            }
        }
    }

    // ------------------------------------------------------------------ 反射工具

    private static List<?> registrations() throws Exception {
        ResourceHandlerRegistry registry = new ResourceHandlerRegistry(new GenericApplicationContext(), null);
        new ConsoleCacheConfigurer().addResourceHandlers(registry);
        Field f = ResourceHandlerRegistry.class.getDeclaredField("registrations");
        f.setAccessible(true);
        List<?> regs = (List<?>) f.get(registry);
        assertNotNull("反射未取到 registrations，字段名或结构已变", regs);
        assertEquals("应注册 2 条 handler（esquerystudio assets 长缓存 + html no-cache）", 2, regs.size());
        return regs;
    }

    private static Object findByPattern(String pattern) throws Exception {
        for (Object reg : registrations()) {
            for (String p : patternsOf(reg)) {
                if (pattern.equals(p)) {
                    return reg;
                }
            }
        }
        return null;
    }

    private static String[] patternsOf(Object registration) throws Exception {
        Field f = registration.getClass().getDeclaredField("pathPatterns");
        f.setAccessible(true);
        String[] p = (String[]) f.get(registration);
        assertNotNull("反射未取到 pathPatterns，字段名或结构已变", p);
        return p;
    }

    private static String cacheHeaderOf(Object registration) throws Exception {
        Field f = registration.getClass().getDeclaredField("cacheControl");
        f.setAccessible(true);
        Object cc = f.get(registration);
        assertNotNull("反射未取到 cacheControl，字段名或结构已变", cc);
        String v = ((CacheControl) cc).getHeaderValue();
        assertNotNull("CacheControl 未生成 header 值", v);
        return v;
    }

    private static String locationsOf(Object registration) throws Exception {
        Field f = registration.getClass().getDeclaredField("locationValues");
        f.setAccessible(true);
        List<?> locations = (List<?>) f.get(registration);
        assertNotNull("反射未取到 locationValues，字段名或结构已变", locations);
        assertEquals("每条 handler 应且只应有一个 location", 1, locations.size());
        return String.valueOf(locations.get(0));
    }
}
