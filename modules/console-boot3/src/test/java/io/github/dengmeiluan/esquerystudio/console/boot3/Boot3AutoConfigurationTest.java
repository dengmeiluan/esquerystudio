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

package io.github.dengmeiluan.esquerystudio.console.boot3;

import io.github.dengmeiluan.esquerystudio.console.boot.BootConsoleApiController;
import io.github.dengmeiluan.esquerystudio.console.boot.BootHealthController;
import io.github.dengmeiluan.esquerystudio.console.boot.BootRootController;
import io.github.dengmeiluan.esquerystudio.console.boot.BootSearchController;
import io.github.dengmeiluan.esquerystudio.console.boot.BootSqlController;
import io.github.dengmeiluan.esquerystudio.console.boot.EsQueryStudioBootAutoConfiguration;
import io.github.dengmeiluan.esquerystudio.rest.EsRestClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Proves the mount comes from auto-configuration, not the app class: this test lives in its
 * own context and asserts the shared controllers are registered by the imports file.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class Boot3AutoConfigurationTest {

    @DynamicPropertySource
    static void esProperties(DynamicPropertyRegistry registry) {
        registry.add("esquerystudio.elasticsearch.url", () -> "http://127.0.0.1:1");
    }

    @Autowired
    private ApplicationContext context;

    @Test
    void sharedControllersAreRegisteredByAutoConfiguration() {
        assertEquals(1, context.getBeansOfType(EsQueryStudioBootAutoConfiguration.class).size());
        assertEquals(1, context.getBeansOfType(BootHealthController.class).size());
        assertEquals(1, context.getBeansOfType(BootSearchController.class).size());
        assertEquals(1, context.getBeansOfType(BootSqlController.class).size());
        assertEquals(1, context.getBeansOfType(BootConsoleApiController.class).size());
        assertEquals(1, context.getBeansOfType(BootRootController.class).size());
        assertEquals(1, context.getBeansOfType(EsRestClient.class).size());
    }
}