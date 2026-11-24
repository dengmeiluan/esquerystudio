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

import io.github.dengmeiluan.esquerystudio.console.xmigrate.PlanRecord;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;

import java.util.List;
import java.util.Map;

/** Structure sync + saved-plan surface used by the console-only MCP tool group. */
public interface McpStructureSyncService {

    McpPlanStore planStore();

    Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                      String fallbackAnalyzer);

    Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                      String fallbackAnalyzer, boolean syncAliases, boolean dryRun);

    Map<String, Object> syncStructure(RemoteClusterConn conn, String sourceIndex, String destIndex,
                                      String fallbackAnalyzer, boolean syncAliases, boolean dryRun,
                                      String expectPlanDigest, RemoteClusterConn destConn, String destConnId);

    Map<String, Object> smartSync(String srcConnId, RemoteClusterConn conn, String sourceIndex, String destIndex,
                                  RemoteClusterConn destConn, String destConnId, boolean syncAliases,
                                  String fallbackAnalyzer, boolean autoTune, boolean apply, String expectPlanDigest);

    Map<String, Object> smartSync(String srcConnId, RemoteClusterConn conn, String sourceIndex, String destIndex,
                                  RemoteClusterConn destConn, String destConnId, boolean syncAliases,
                                  String fallbackAnalyzer, boolean autoTune, boolean apply, String expectPlanDigest,
                                  String mode);

    Map<String, Object> compareCapabilities(String srcConnId, RemoteClusterConn srcConn, String sourceIndex,
                                            String destConnId, RemoteClusterConn destConn, String destIndex);

    Map<String, Object> diffStructure(RemoteClusterConn srcConn, String sourceIndex,
                                      RemoteClusterConn destConn, String destIndex);

    Map<String, Object> diffStructure(RemoteClusterConn srcConn, String sourceIndex,
                                      RemoteClusterConn destConn, String destIndex,
                                      Integer autoTunedShards, List<String> removedKeys);

    Map<String, Object> verifyEquivalence(RemoteClusterConn srcConn, String sourceIndex, String destConnId,
                                          RemoteClusterConn destConn, String destIndex, Integer sampleSize,
                                          List<String> sampleFields, String aggField, Integer aggSize);

    Map<String, Object> verifyEquivalence(RemoteClusterConn srcConn, String sourceIndex, String destConnId,
                                          RemoteClusterConn destConn, String destIndex, Integer sampleSize,
                                          List<String> sampleFields, String aggField, Integer aggSize,
                                          boolean structureOnly);
}
