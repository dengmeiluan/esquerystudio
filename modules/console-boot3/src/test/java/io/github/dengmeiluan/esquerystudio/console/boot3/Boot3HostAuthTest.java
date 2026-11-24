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

import io.github.dengmeiluan.esquerystudio.console.boot.auth.ConsoleAuthProvider;
import io.github.dengmeiluan.esquerystudio.console.boot.auth.ConsolePrincipal;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(Boot3HostAuthTest.HostAuthConfig.class)
class Boot3HostAuthTest {

    @TestConfiguration
    static class HostAuthConfig {
        @Bean
        ConsoleAuthProvider hostAuthProvider() {
            return () -> Optional.of(new ConsolePrincipal(
                    "alice", "Alice", "OPERATOR", Set.of("search")));
        }
    }

    @DynamicPropertySource
    static void esProperties(DynamicPropertyRegistry registry) {
        registry.add("esquerystudio.elasticsearch.url", () -> "http://127.0.0.1:1");
    }

    @Autowired
    private TestRestTemplate rest;

    @Test
    void hostProviderReplacesBootstrapIdentity() {
        ResponseEntity<String> setup = rest.getForEntity("/internal/es/index/setup/status", String.class);
        assertEquals(HttpStatus.OK, setup.getStatusCode());
        assertTrue(setup.getBody().contains("\"authEnabled\":true"));

        ResponseEntity<String> me = rest.getForEntity("/internal/es/index/auth/me", String.class);
        assertEquals(HttpStatus.OK, me.getStatusCode());
        assertTrue(me.getBody().contains("\"username\":\"alice\""));
        assertTrue(me.getBody().contains("\"role\":\"OPERATOR\""));
        assertTrue(me.getBody().contains("\"grantedPages\":[\"search\"]"));

        ResponseEntity<String> clusters = rest.getForEntity("/internal/es/index/clusters", String.class);
        assertEquals(HttpStatus.OK, clusters.getStatusCode());
    }
}
