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

package io.github.dengmeiluan.esquerystudio.console.mcp;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/** Adhoc rebuild orchestration used by the console-only MCP tool group. */
public interface McpAdhocService {

    Map<String, Object> prepare(String index) throws IOException;

    Map<String, Object> start(Map<String, Object> req) throws IOException;

    Map<String, Object> start(Map<String, Object> req, String ownerUsername, String ownerRole) throws IOException;

    Map<String, Object> status(String jobId);

    Map<String, Object> events(String jobId);

    Map<String, Object> abort(String jobId);

    Map<String, Object> retry(String jobId);

    Map<String, Object> retry(String jobId, Map<String, Object> overrides);

    Map<String, Object> delete(String jobId);

    Map<String, Object> deleteOlderThan(int days, String targetId);

    Map<String, Object> throttle(String jobId, double requestsPerSecond) throws IOException;

    List<Map<String, Object>> listJobs();

    Map<String, Object> confirmSwitch(String jobId);
}
