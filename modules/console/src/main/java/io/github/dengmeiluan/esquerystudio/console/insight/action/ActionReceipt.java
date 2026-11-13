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

package io.github.dengmeiluan.esquerystudio.console.insight.action;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 *  护栏动作执行回执。
 *
 * <p>{@code ConsoleOpsAuditStore.record} 为异步 void（无返回 id），故回执 id 由
 * 本类自生成 UUID，审计 detail JSON 里同样带 receiptId——前端/运维可按 receiptId
 * 在审计视图检索到对应流水。</p>
 *
 * @author aicoding
 */
public class ActionReceipt {

    private final String receiptId;
    private final String actionId;
    private final long executedAt;
    private final Map<String, Object> result;

    public ActionReceipt(String actionId, Map<String, Object> result) {
        this.receiptId = UUID.randomUUID().toString();
        this.actionId = actionId;
        this.executedAt = System.currentTimeMillis();
        this.result = result;
    }

    public String getReceiptId() {
        return receiptId;
    }

    public String getActionId() {
        return actionId;
    }

    public long getExecutedAt() {
        return executedAt;
    }

    public Map<String, Object> getResult() {
        return result;
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("receiptId", receiptId);
        m.put("actionId", actionId);
        m.put("executedAt", executedAt);
        m.put("result", result);
        m.put("auditHint", "审计流水可按 receiptId 检索");
        return m;
    }
}
