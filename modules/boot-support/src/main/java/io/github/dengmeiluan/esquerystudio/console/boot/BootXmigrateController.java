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

package io.github.dengmeiluan.esquerystudio.console.boot;

import io.github.dengmeiluan.esquerystudio.console.boot.auth.ConsoleAuthProvider;
import io.github.dengmeiluan.esquerystudio.console.boot.auth.ConsolePrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

/**
 * The UI talks to cross-cluster migration under {@code /internal/es/xmigrate} (no
 * {@code /index}); this thin controller serves that prefix. Migration jobs are not
 * migrated yet, so the only honest answer is an empty list.
 */
@RestController
@RequestMapping("/internal/es/xmigrate")
public class BootXmigrateController {

    private static final MediaType JSON = MediaType.APPLICATION_JSON;

    @Autowired(required = false)
    private ConsoleAuthProvider authProvider;

    @Value("${esquerystudio.boot.dev-bootstrap-auth:false}")
    private boolean bootstrapAuth;

    @GetMapping("/jobs")
    public ResponseEntity<String> jobs() {
        return authenticated()
                ? ResponseEntity.ok().contentType(JSON).body("[]")
                : ResponseEntity.status(401).contentType(JSON)
                        .body("{\"code\":\"UNAUTHORIZED\",\"message\":\"host auth not configured\"}");
    }

    private boolean authenticated() {
        if (authProvider != null) {
            Optional<ConsolePrincipal> hosted = authProvider.currentPrincipal();
            if (hosted != null && hosted.isPresent()) {
                return true;
            }
        }
        return bootstrapAuth;
    }
}