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

import java.util.Map;

/** Saved cross-cloud sync plans (console store; absent in host forms). */
public interface McpPlanStore {

    int CAP = 50;

    String NOT_FOUND_PREFIX = "同步计划不存在: ";

    PlanRecord savePlan(String srcConnId, String sourceIndex, String destConnId, String destIndex,
                        boolean syncAliases, String fallbackAnalyzer, boolean autoTune,
                        Map<String, Object> preview);

    PlanRecord find(String planId);

    McpPlanListing list();

    Map<String, Object> applyWithDigest(PlanRecord plan, String expectPlanDigest, McpPlanRunner runner);
}
