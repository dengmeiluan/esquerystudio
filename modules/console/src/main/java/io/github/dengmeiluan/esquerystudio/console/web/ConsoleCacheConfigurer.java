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

import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.TimeUnit;

/**
 * 控制台静态资源缓存策略（console 模式专属）。
 *
 * <p>{@code /esquerystudio/assets/**} 是 vite 构建产物，文件名带内容 hash（如 {@code vendor-CuY2EBrL.js}），
 * 内容变则文件名必然变 —— 可以安全地 immutable 长缓存：二次进入控制台首屏 ~767KB 零传输。
 * 三个 HTML 入口（{@code console/index.html} 与 static 根下两个跳转壳）文件名恒定，
 * 必须 no-cache（每次协商），保证发版后浏览器即刻拿到引用新 hash 资产的新 HTML
 * —— 旧 HTML 若被缓存，其引用的旧 hash 资产已随构建清空，会 404 白屏。</p>
 *
 * <p><b>与 Spring Security 的交互</b>：宿主若用 Security 默认 headers，
 * {@code CacheControlHeadersWriter} 会对一切响应写 {@code no-store} 覆盖此处的头 ——
 * 需宿主把 {@code /esquerystudio/assets/**} 加入 {@code WebSecurity.ignoring()}
 * （宿主 已落地）。无 Security 的宿主此处头直接生效。</p>
 *
 * <p>与 {@link io.github.dengmeiluan.esquerystudio.console.client.ConsoleAssetGuard} 互斥：
 * guard 只在 client 模式注册（资源 404），本类只在 console 模式装配。
 * 精确 pattern 优先于 Spring Boot 默认 {@code /**} 资源 handler，不影响宿主其它静态资源。</p>
 *
 * @author aicoding
 */
public class ConsoleCacheConfigurer implements WebMvcConfigurer {

    /** 资产缓存一年（与内容 hash 约定匹配：改名即新 URL，旧缓存永不误用） */
    static final long ASSETS_MAX_AGE_DAYS = 365L;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // location 与 Spring Boot 默认静态根一致（classpath:/static/）：
        // /esquerystudio/assets/** 的 pathWithinMapping 是通配段（vendor-xxx.js），故 location 指到 assets 目录；
        // 精确 pattern 的 pathWithinMapping 是完整请求路径，故 html 条目 location 留在 static 根
        registry.addResourceHandler("/esquerystudio/assets/**")
                .addResourceLocations("classpath:/static/esquerystudio/assets/")
                .setCacheControl(CacheControl.maxAge(ASSETS_MAX_AGE_DAYS, TimeUnit.DAYS).cachePublic());
        registry.addResourceHandler("/esquerystudio/index.html", "/esquerystudio.html")
                .addResourceLocations("classpath:/static/")
                .setCacheControl(CacheControl.noCache());
    }
}
