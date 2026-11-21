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
import java.util.List;
import java.util.Map;

/**
 *  护栏动作注册表。
 *
 * <p>构造收 {@code List<GuardedAction>}（AutoConfig 集合注入），后续批次新增动作
 * 只需注册新的 {@link GuardedAction} Bean，协议层零改动。</p>
 *
 * @author aicoding
 */
public class GuardedActionRegistry {

    private final Map<String, GuardedAction> actions = new LinkedHashMap<>();

    public GuardedActionRegistry(List<GuardedAction> actionList) {
        if (actionList != null) {
            for (GuardedAction a : actionList) {
                actions.put(a.id(), a);
            }
        }
    }

    /** 按 id 取动作，未注册抛 IllegalArgumentException（上层转 400）。 */
    public GuardedAction get(String actionId) {
        GuardedAction a = actions.get(actionId);
        if (a == null) {
            throw new IllegalArgumentException("未知动作: " + actionId);
        }
        return a;
    }

    /** 授权闸 fail-closed 判据（1031）：actionId 是否已注册——未注册写请求在授权层
        直接拒绝，不落兜底角色门（动态 actionId 不得借角色档回落漏进静态/混合模型）。 */
    public boolean contains(String actionId) {
        return actionId != null && actions.containsKey(actionId);
    }
}
