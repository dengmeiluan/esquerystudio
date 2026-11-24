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

import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateJobES;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.MigrateRequest;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;

import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/** Cross-cluster migration orchestration used by the console-only MCP tool group. */
public interface McpMigrateService {

    Map<String, Object> resolvePreview(RemoteClusterConn raw);

    List<Map<String, Object>> connectCheck(RemoteClusterConn conn);

    Map<String, Object> fetchSourceConfig(RemoteClusterConn conn, String sourceIndex);

    Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                      String fallbackAnalyzer);

    Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                      String fallbackAnalyzer, boolean syncAliases, boolean dryRun);

    Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                      String fallbackAnalyzer, boolean syncAliases, boolean dryRun,
                                      String expectPlanDigest, RemoteClusterConn destConn, String destConnId);

    Map<String, Object> compareCapabilities(String srcConnId, RemoteClusterConn srcConn, String sourceIndex,
                                            String destConnId, RemoteClusterConn destConn, String destIndex);

    Map<String, Object> diffStructure(RemoteClusterConn srcConn, String sourceIndex,
                                      RemoteClusterConn destConn, String destIndex);

    Map<String, Object> smartSync(String srcConnId, String sourceIndex, String destConnId, String destIndex,
                                  boolean syncAliases, String fallbackAnalyzer, boolean autoTune,
                                  boolean apply, String expectPlanDigest);

    Map<String, Object> verifyEquivalence(String jobId, String srcConnId, String sourceIndex, String destConnId,
                                          String destIndex, Integer sampleSize, List<String> sampleFields,
                                          String aggField, Integer aggSize);

    Map<String, Object> verifyEquivalence(RemoteClusterConn srcConn, String sourceIndex, String destConnId,
                                          RemoteClusterConn destConn, String destIndex, Integer sampleSize,
                                          List<String> sampleFields, String aggField, Integer aggSize);

    Map<String, Object> probeCapabilities(RemoteClusterConn conn, String index);

    Map<String, Object> probeHostCapabilities(String index);

    Map<String, Object> preflight(MigrateRequest req);

    String start(MigrateRequest req);

    String start(MigrateRequest req, String ownerUsername, String ownerRole);

    String resume(String jobId, RemoteClusterConn conn);

    void abort(String jobId);

    MigrateJobES progress(String jobId);

    List<MigrateJobES> jobs(int limit);

    Map<String, Object> throttle(String jobId, int rps);

    Map<String, Object> delete(String jobId);

    Map<String, Object> deleteOlderThan(int days, Predicate<MigrateJobES> scope);

    List<Map<String, Object>> destIndices();

    Map<String, Object> events(String jobId);

    /** Source-side doc count for reconcile (console builds a temporary remote client). */
    Long reconcileSourceCount(RemoteClusterConn conn, String sourceIndex);
}
