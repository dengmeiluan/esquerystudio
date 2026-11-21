/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.esquerystudio.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 独立部署入口（Kibana 形态）：{@code java -jar esquerystudio-server-*.jar} 即拥有全套控制台。
 *
 * <p>starter 的全部能力走 spring.factories 自动配置（组件为显式 {@code @Bean} 装配，
 * 不依赖组件扫描），本类只提供 Spring Boot 宿主壳：内嵌 web 服务器 + ES 客户端栈由本模块
 * compile 自带。首启无控制集群时控制面为 NONE 模式，浏览器打开控制台走 Setup 向导
 * 完成首连即全套可用；此后自举档案持久在 {@code ~/.esquerystudio/}，重启即达。</p>
 */
@SpringBootApplication
public class ESQueryStudioServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(ESQueryStudioServerApplication.class, args);
    }
}
