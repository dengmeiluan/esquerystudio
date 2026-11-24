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
import org.junit.Test;
import org.springframework.http.ResponseEntity;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class BootConsoleApiControllerTest {

    private static final EsRestClient CLIENT =
            (method, path, body) -> new EsRestResponse(200, "{\"cluster_name\":\"stub\"}");

    @Test
    public void rawGetIsAllowedWithoutWriteSwitch() throws Exception {
        ResponseEntity<String> response = controller(false).raw(request("GET", "/", null));
        assertEquals(200, response.getStatusCodeValue());
        assertTrue(response.getBody().contains("cluster_name"));
    }

    @Test
    public void rawWriteIsDeniedByDefault() throws Exception {
        ResponseEntity<String> response = controller(false)
                .raw(request("POST", "/orders/_doc", "{}"));
        assertEquals(403, response.getStatusCodeValue());
        assertTrue(response.getBody().contains("writes disabled"));
    }

    @Test
    public void rawWriteIsAllowedWhenExplicitlyEnabled() throws Exception {
        ResponseEntity<String> response = controller(true)
                .raw(request("POST", "/orders/_doc", "{}"));
        assertEquals(200, response.getStatusCodeValue());
        assertTrue(response.getBody().contains("\"status\":200"));
    }

    @Test
    public void writeEndpointsAreDeniedByDefault() throws Exception {
        assertEquals(403, controller(false).deleteIndex("orders").getStatusCodeValue());
        assertEquals(403, controller(false).createIndex("orders", null).getStatusCodeValue());
        assertEquals(403, controller(false).clusterForceMerge("orders", 1).getStatusCodeValue());
    }

    @Test
    public void writeEndpointsWorkWhenExplicitlyEnabled() throws Exception {
        assertEquals(200, controller(true).deleteIndex("orders").getStatusCodeValue());
        assertEquals(200, controller(true).clusterForceMerge("orders", 1).getStatusCodeValue());
        assertEquals(200, controller(true).createIndex("orders", null).getStatusCodeValue());
    }

    @Test
    public void rawRejectsTraversalAndUnknownMethods() throws Exception {
        ResponseEntity<String> traversal = controller(true).raw(request("GET", "/../_cluster/health", null));
        assertEquals(400, traversal.getStatusCodeValue());

        ResponseEntity<String> method = controller(true).raw(request("PATCH", "/orders", null));
        assertEquals(400, method.getStatusCodeValue());
    }

    private static BootConsoleApiController controller(boolean allowWrites) {
        return new BootConsoleApiController(CLIENT, "http://localhost:9200", true, allowWrites);
    }

    private static Map<String, String> request(String method, String path, String body) {
        Map<String, String> req = new LinkedHashMap<>();
        req.put("method", method);
        req.put("path", path);
        if (body != null) {
            req.put("body", body);
        }
        return req;
    }
}
