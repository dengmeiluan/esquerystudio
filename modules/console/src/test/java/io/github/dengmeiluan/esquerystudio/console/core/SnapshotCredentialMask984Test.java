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

package io.github.dengmeiluan.esquerystudio.console.core;

import org.junit.Test;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** 批次 984：快照仓库凭据递归脱敏覆盖 URL userinfo 与 Authorization 头。 */
public class SnapshotCredentialMask984Test {

    @Test
    public void url内嵌凭据被脱敏() {
        assertEquals("https://***@es.example.com:9200/path",
                EsIndexAdmin.maskUrlUserInfo("https://user:pass@es.example.com:9200/path"));
        assertEquals("s3://bucket/path", EsIndexAdmin.maskUrlUserInfo("s3://bucket/path"));
    }

    @Test
    public void 仓库settings递归脱敏url与authorization头() {
        Map<String, Object> headers = new LinkedHashMap<>();
        headers.put("Authorization", "Basic dXNlcjpwYXNz");
        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("url", "https://user:pass@es.example.com:9200");
        settings.put("headers", headers);
        Map<String, Object> repo = new LinkedHashMap<>();
        repo.put("name", "prod");
        repo.put("settings", settings);

        List<Map<String, Object>> out = EsIndexAdmin.maskSnapshotRepoSecrets(
                Collections.singletonList(repo));
        @SuppressWarnings("unchecked")
        Map<String, Object> masked = (Map<String, Object>) out.get(0).get("settings");
        assertEquals("https://***@es.example.com:9200", masked.get("url"));
        @SuppressWarnings("unchecked")
        Map<String, Object> maskedHeaders = (Map<String, Object>) masked.get("headers");
        assertEquals("***", maskedHeaders.get("Authorization"));
        assertFalse(String.valueOf(out).contains("user:pass"));
        assertFalse(String.valueOf(out).contains("dXNlcjpwYXNz"));
    }
}
