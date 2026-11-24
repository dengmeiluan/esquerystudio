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

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "esquerystudio.boot.dev-bootstrap-auth=true",
                "esquerystudio.boot.allow-writes=true"
        })
class Boot3HealthSmokeTest {

    private static HttpServer stub;
    private static int port;

    @DynamicPropertySource
    static void esProperties(DynamicPropertyRegistry registry) throws IOException {
        if (stub == null) {
            stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            stub.createContext("/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                String json = path.endsWith("/_search")
                        ? "{\"hits\":{\"total\":{\"value\":1,\"relation\":\"eq\"},\"hits\":[{\"_id\":\"doc-1\"}]}}"
                        : path.endsWith("/_sql")
                        ? "{\"columns\":[{\"name\":\"n\",\"type\":\"long\"}],\"rows\":[[1]]}"
                        : path.contains("/_cat/indices")
                        ? "[{\"index\":\"orders\",\"health\":\"green\",\"status\":\"open\"}]"
                        : path.contains("/_cat/aliases")
                        ? "[{\"alias\":\"orders\",\"index\":\"orders\"}]"
                        : path.contains("/_cat/shards")
                        ? "[{\"index\":\"orders\",\"shard\":\"0\"}]"
                        : path.endsWith("/_settings")
                        ? "{\"orders\":{\"settings\":{\"index\":{\"number_of_shards\":\"1\"}}}}"
                        : path.endsWith("/_mapping")
                        ? "{\"orders\":{\"mappings\":{\"properties\":{\"title\":{\"type\":\"text\"}}}}}"
                        : path.endsWith("/_alias") && !path.contains("/_cat/")
                        ? "{\"orders\":{\"aliases\":{\"orders\":{}}}}"
                        : path.endsWith("/_cluster/health")
                        ? "{\"status\":\"green\",\"number_of_nodes\":1}"
                        : path.endsWith("/_count")
                        ? "{\"count\":1}"
                        : "{\"cluster_name\":\"boot3-stub\",\"version\":{\"number\":\"8.18.1\"}}";
                byte[] body = json.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            stub.start();
            port = stub.getAddress().getPort();
        }
        registry.add("esquerystudio.elasticsearch.url", () -> "http://127.0.0.1:" + port);
    }

    @AfterAll
    static void stopStub() {
        if (stub != null) {
            stub.stop(0);
        }
    }

    @Autowired
    private TestRestTemplate rest;

    @Autowired
    private io.github.dengmeiluan.esquerystudio.rest.EsClientContext esClientContext;
    @Autowired
    private io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin esIndexAdmin;

    @Test
    void engineBeansRunOnThisBaseline() throws Exception {
        org.junit.jupiter.api.Assertions.assertEquals("8.18.1", esClientContext.currentEsVersion());
        org.junit.jupiter.api.Assertions.assertTrue(esIndexAdmin.indexExists("orders"));
        org.junit.jupiter.api.Assertions.assertEquals(1L,
                ((Number) esIndexAdmin.count("orders", "").get("count")).longValue());
    }

    @Test
    @SuppressWarnings("unchecked")
    void healthReportsTheClustersOwnVersion() {
        ResponseEntity<Map> response = rest.getForEntity("/internal/es/index/boot/health", Map.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("8.18.1", response.getBody().get("version"));
        assertEquals("boot3-stub", response.getBody().get("cluster"));
        assertEquals("esquerystudio-console-boot3", response.getBody().get("artifact"));
        assertEquals(true, response.getBody().get("ok"));
    }

    @Test
    void servesTheExistingVueConsoleShell() {
        ResponseEntity<String> response = rest.getForEntity("/esquerystudio.html", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("ESQueryStudio"));
    }

    @Test
    void searchProxyExecutesDslAgainstTheCluster() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> response = rest.postForEntity(
                "/internal/es/index/boot/search?index=boot3-test",
                new HttpEntity<>("{\"query\":{\"match_all\":{}}}", headers),
                String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("doc-1"));
    }

    @Test
    void writeEndpointsUseRawDocRoutes() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<String> updated = rest.postForEntity(
                "/internal/es/index/cluster/update-document?index=orders&id=1",
                new HttpEntity<>("{\"title\":\"x\"}", headers), String.class);
        assertEquals(HttpStatus.OK, updated.getStatusCode());

        ResponseEntity<String> partial = rest.postForEntity(
                "/internal/es/index/cluster/update-partial?index=orders&id=1",
                new HttpEntity<>("{\"title\":\"y\"}", headers), String.class);
        assertEquals(HttpStatus.OK, partial.getStatusCode());

        ResponseEntity<String> deleted = rest.postForEntity(
                "/internal/es/index/cluster/delete-by-id?index=orders&id=1", null, String.class);
        assertEquals(HttpStatus.OK, deleted.getStatusCode());

        ResponseEntity<String> mapping = rest.postForEntity(
                "/internal/es/index/cluster/put-mapping?index=orders",
                new HttpEntity<>("{\"properties\":{\"title\":{\"type\":\"text\"}}}", headers), String.class);
        assertEquals(HttpStatus.OK, mapping.getStatusCode());

        ResponseEntity<String> settings = rest.postForEntity(
                "/internal/es/index/cluster/update-settings?index=orders",
                new HttpEntity<>("{\"number_of_replicas\":1}", headers), String.class);
        assertEquals(HttpStatus.OK, settings.getStatusCode());

        ResponseEntity<String> created = rest.postForEntity(
                "/internal/es/index/cluster/create-index?index=orders2",
                new HttpEntity<>("{\"settings\":\"{}\",\"mapping\":\"{\\\"properties\\\":{}}\"}", headers), String.class);
        assertEquals(HttpStatus.OK, created.getStatusCode());
        assertTrue(created.getBody().contains("\"ok\":true"));

        ResponseEntity<String> deletedIndex = rest.postForEntity(
                "/internal/es/index/cluster/delete-index?index=orders2", null, String.class);
        assertEquals(HttpStatus.OK, deletedIndex.getStatusCode());

        ResponseEntity<String> merged = rest.postForEntity(
                "/internal/es/index/cluster/force-merge?index=orders&maxSegments=1", null, String.class);
        assertEquals(HttpStatus.OK, merged.getStatusCode());
        assertTrue(merged.getBody().contains("\"ok\":true"));
    }

    @Test
    void queryWorkbenchProxiesReadEndpoints() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<String> query = rest.postForEntity(
                "/internal/es/index/cluster/query?index=orders&size=5",
                new HttpEntity<>("{\"query\":{\"match_all\":{}}}", headers), String.class);
        assertEquals(HttpStatus.OK, query.getStatusCode());
        assertTrue(query.getBody().contains("doc-1"));

        ResponseEntity<String> profile = rest.postForEntity(
                "/internal/es/index/cluster/profile?index=orders",
                new HttpEntity<>("{\"query\":{\"match_all\":{}}}", headers), String.class);
        assertEquals(HttpStatus.OK, profile.getStatusCode());
        assertTrue(profile.getBody().contains("doc-1"));

        ResponseEntity<String> sql = rest.postForEntity(
                "/internal/es/index/cluster/sql",
                new HttpEntity<>("SELECT 1", headers), String.class);
        assertEquals(HttpStatus.OK, sql.getStatusCode());
        assertTrue(sql.getBody().contains("\"rows\""));

        ResponseEntity<String> settings = rest.getForEntity(
                "/internal/es/index/cluster/index-settings?index=orders", String.class);
        assertEquals(HttpStatus.OK, settings.getStatusCode());
        assertTrue(settings.getBody().contains("number_of_shards"));
    }

    @Test
    void remainingReadSurfacesAnswerWithout404() {
        String[] paths = {
                "/internal/es/index/cluster/settings",
                "/internal/es/index/cluster/snapshot/repos",
                "/internal/es/index/cluster/ilm/policies",
                "/internal/es/index/cluster/ilm/status",
                "/internal/es/index/cluster/slm/policies",
                "/internal/es/index/cluster/slm/status",
                "/internal/es/index/cluster/watcher",
                "/internal/es/index/cluster/remote-clusters",
                "/internal/es/index/cluster/plugins",
                "/internal/es/index/cluster/templates",
                "/internal/es/index/config-lab/drift/keys",
                "/internal/es/index/auth/users",
                "/internal/es/index/auth/ops-audit",
                "/internal/es/index/auth/audit-facets",
                "/internal/es/index/mcp/keys",
                "/internal/es/index/mcp/keys/calls?limit=10",
                "/internal/es/xmigrate/jobs?limit=30",
                "/internal/es/index/system-inspect?which=lock",
                "/internal/es/index/cluster/templates",
        };
        for (String path : paths) {
            ResponseEntity<String> response = rest.getForEntity(path, String.class);
            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void systemIndexPageStatesItsBoundaryInsteadOf404() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<String> inspect = rest.getForEntity(
                "/internal/es/index/system-inspect?which=lock", String.class);
        assertEquals(HttpStatus.OK, inspect.getStatusCode());
        assertTrue(inspect.getBody().contains("\"docCount\":0"));
        assertTrue(inspect.getBody().contains("boundary"));

        ResponseEntity<String> query = rest.postForEntity(
                "/internal/es/index/system-query?which=lock&size=50",
                new HttpEntity<>("{\"query\":{\"match_all\":{}}}", headers), String.class);
        assertEquals(HttpStatus.OK, query.getStatusCode());
        assertTrue(query.getBody().contains("\"relation\":\"eq\""));
        assertTrue(query.getBody().contains("boundary"));
    }

    @Test
    void queryWorkbenchMappingAndInspectAnswer() {
        ResponseEntity<String> detail = rest.getForEntity(
                "/internal/es/index/cluster/mapping-detail?index=orders", String.class);
        assertEquals(HttpStatus.OK, detail.getStatusCode());
        assertTrue(detail.getBody().contains("title"));

        ResponseEntity<String> inspect = rest.getForEntity(
                "/internal/es/index/cluster/inspect?index=orders&sampleSize=1", String.class);
        assertEquals(HttpStatus.OK, inspect.getStatusCode());
        assertTrue(inspect.getBody().contains("\"docCount\":1"));
        assertTrue(inspect.getBody().contains("title"));
    }

    @Test
    void uiBootstrapEndpointsAnswer() {
        ResponseEntity<String> setup = rest.getForEntity("/internal/es/index/setup/status", String.class);
        assertEquals(HttpStatus.OK, setup.getStatusCode());
        assertTrue(setup.getBody().contains("\"bound\":true"));

        ResponseEntity<String> me = rest.getForEntity("/internal/es/index/auth/me", String.class);
        assertEquals(HttpStatus.OK, me.getStatusCode());
        assertTrue(me.getBody().contains("\"role\":\"ADMIN\""));

        ResponseEntity<String> clusters = rest.getForEntity("/internal/es/index/clusters", String.class);
        assertEquals(HttpStatus.OK, clusters.getStatusCode());
        assertTrue(clusters.getBody().contains("\"id\":\"host\""));

        ResponseEntity<String> overview = rest.getForEntity("/internal/es/index/overview", String.class);
        assertEquals(HttpStatus.OK, overview.getStatusCode());
        assertTrue(overview.getBody().contains("orders"));
        assertTrue(overview.getBody().contains("\"status\":\"green\""));

        ResponseEntity<String> indices = rest.getForEntity("/internal/es/index/cluster/indices", String.class);
        assertEquals(HttpStatus.OK, indices.getStatusCode());
        assertTrue(indices.getBody().contains("orders"));

        ResponseEntity<String> history = rest.getForEntity("/internal/es/index/monitor-history", String.class);
        assertEquals(HttpStatus.OK, history.getStatusCode());
        assertTrue(history.getBody().contains("\"records\":[]"));

        ResponseEntity<String> config = rest.getForEntity("/internal/es/index/ui/config", String.class);
        assertEquals(HttpStatus.OK, config.getStatusCode());

        ResponseEntity<String> pages = rest.getForEntity("/internal/es/index/pages", String.class);
        assertEquals(HttpStatus.OK, pages.getStatusCode());
        assertTrue(pages.getBody().contains("\"groups\""));
        assertTrue(pages.getBody().contains("\"key\":\"search\""));
        assertTrue(pages.getBody().contains("\"route\":\"/search\""));
        assertTrue(me.getBody().contains("\"pages\""));
        // Same single-source contract: 53 pages / 13 groups must not drift.
        assertEquals(53L, (long) countOf(pages.getBody(), "\"key\":\""));
        assertEquals(13L, (long) countOf(pages.getBody(), "\"sort\":"));
    }

    private static int countOf(String text, String needle) {
        int count = 0;
        for (int i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length())) {
            count++;
        }
        return count;
    }

    @Test
    void sqlUsesTheModernSqlEndpoint() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        ResponseEntity<String> response = rest.postForEntity(
                "/internal/es/index/boot/sql",
                new HttpEntity<>("{\"query\":\"SELECT 1\"}", headers),
                String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().contains("\"rows\""));
    }
}
