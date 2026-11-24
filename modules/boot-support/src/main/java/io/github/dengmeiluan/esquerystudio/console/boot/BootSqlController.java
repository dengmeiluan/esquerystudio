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

import io.github.dengmeiluan.esquerystudio.rest.EsRestClient;
import io.github.dengmeiluan.esquerystudio.rest.EsRestResponse;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Unified modern SQL path for the Boot 3/4 artifacts: one {@code _sql} endpoint,
 * no 6.x {@code _xpack/sql} branch. ES 6.7 hosts remain on the Boot 2.3 legacy artifact.
 */
@RestController
@RequestMapping("/internal/es/index/boot")
public class BootSqlController {

    private final EsRestClient client;

    public BootSqlController(EsRestClient client) {
        this.client = client;
    }

    @PostMapping(value = "/sql", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> sql(@RequestBody(required = false) String body) throws Exception {
        String payload = body == null || body.trim().isEmpty() ? "{\"query\":\"SHOW TABLES\"}" : body;
        EsRestResponse response = client.perform("POST", "/_sql?format=json", payload);
        if (response.status() == 404 || response.status() == 400) {
            // Generic fallback, not a version branch: 6.7 exposes SQL under _xpack/sql.
            response = client.perform("POST", "/_xpack/sql?format=json", payload);
        }
        return ResponseEntity.status(response.status())
                .contentType(MediaType.APPLICATION_JSON)
                .body(response.body());
    }
}
