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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.regex.Pattern;

/** Controlled DSL search proxy shared by the Boot 3/4 artifacts. */
@RestController
@RequestMapping("/internal/es/index/boot")
public class BootSearchController {

    private static final Pattern SAFE_INDEX = Pattern.compile("[A-Za-z0-9_.,*+-]+");

    private final EsRestClient client;

    public BootSearchController(EsRestClient client) {
        this.client = client;
    }

    @PostMapping(value = "/search", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> search(@RequestParam("index") String index,
                                         @RequestBody(required = false) String body) throws Exception {
        if (!SAFE_INDEX.matcher(index).matches()) {
            return ResponseEntity.badRequest().body("{\"error\":\"invalid index\"}");
        }
        EsRestResponse response = client.perform("POST", "/" + index + "/_search",
                body == null || body.trim().isEmpty() ? "{\"query\":{\"match_all\":{}}}" : body);
        return ResponseEntity.status(response.status())
                .contentType(MediaType.APPLICATION_JSON)
                .body(response.body());
    }
}
