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

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.rest.EsClientContext;
import org.elasticsearch.client.RestClient;

/**
 * Host {@link EsClientContext}: one low-level client, server version probed lazily from
 * {@code GET /} on first use (never at startup, and never guessed when the probe fails —
 * unknown stays unknown so the version-aware layer picks dual-compatible request shapes).
 */
public class BootEsClientContext implements EsClientContext {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final RestClient client;
    private volatile String version;
    private volatile boolean probed;

    public BootEsClientContext(RestClient client) {
        this.client = client;
    }

    @Override
    public RestClient currentClient() {
        return client;
    }

    @Override
    public String currentEsVersion() {
        if (!probed) {
            synchronized (this) {
                if (!probed) {
                    version = probeVersion(client);
                    probed = true;
                }
            }
        }
        return version;
    }

    static String probeVersion(RestClient client) {
        try {
            org.elasticsearch.client.Response response =
                    client.performRequest(new org.elasticsearch.client.Request("GET", "/"));
            String body = org.apache.http.util.EntityUtils.toString(response.getEntity());
            JsonNode number = MAPPER.readTree(body).path("version").path("number");
            String value = number.isMissingNode() ? null : number.asText(null);
            return value == null || value.trim().isEmpty() ? null : value.trim();
        } catch (Exception e) {
            return null;
        }
    }
}
