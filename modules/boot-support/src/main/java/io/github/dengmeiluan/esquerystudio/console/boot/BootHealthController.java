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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reports the cluster's own version; the artifact name distinguishes Boot 3 vs Boot 4. */
@RestController
@RequestMapping("/internal/es/index/boot")
public class BootHealthController {

    private static final Pattern VERSION = Pattern.compile("\"number\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern CLUSTER = Pattern.compile("\"cluster_name\"\\s*:\\s*\"([^\"]+)\"");

    private final EsRestClient client;
    private final String artifact;

    public BootHealthController(EsRestClient client,
                                @Value("${esquerystudio.artifact:esquerystudio-console-boot}") String artifact) {
        this.client = client;
        this.artifact = artifact;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("artifact", artifact);
        try {
            EsRestResponse response = client.perform("GET", "/", null);
            if (response.status() >= 400) {
                body.put("ok", false);
                body.put("error", "HTTP " + response.status());
                body.put("message", response.body());
                return ResponseEntity.status(503).body(body);
            }
            body.put("ok", true);
            body.put("cluster", extract(CLUSTER, response.body()));
            body.put("version", extract(VERSION, response.body()));
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            body.put("ok", false);
            body.put("error", e.getClass().getSimpleName());
            body.put("message", e.getMessage());
            return ResponseEntity.status(503).body(body);
        }
    }

    private static String extract(Pattern pattern, String json) {
        Matcher matcher = pattern.matcher(json == null ? "" : json);
        return matcher.find() ? matcher.group(1) : null;
    }
}
