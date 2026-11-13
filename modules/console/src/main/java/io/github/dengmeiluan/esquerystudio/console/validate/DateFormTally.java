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

package io.github.dengmeiluan.esquerystudio.console.validate;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * {@link DateFormSampler#tally} 的结果——<b>计数与样例分两棵树</b>。
 *
 * <p><b>为什么不是一棵树。</b> 曾经的形态是 {@code Map<String,Map<String,Object>>}，
 * 把计数（{@code Integer}）与样例（{@code List<String>}）混装在同一个 value map 里，
 * 靠「{@code _} 前缀键是样例，遍历计数时跳过」这条约定区分。评审指出该约定不可执行：</p>
 *
 * <ul>
 *   <li>下游  是 <b>TypeScript</b>，序列化成 JSON 后样例键与计数键<b>完全平级</b>，
 *       {@code Object.entries(forms[f]).reduce(sum)} 会把数组加进计数——<b>静默算错</b>；</li>
 *   <li>Java 侧加个 {@code isSampleKey()} 访问器<b>救不了 TS 消费方</b>；</li>
 *   <li>这条约定必须跨 <b>Java → JSON → TypeScript 三层</b>被人记住才成立。</li>
 * </ul>
 *
 * <p>分成两棵树后，{@link #getForms()} 的值域<b>纯计数</b>，
 * 结构上不可能混进样例，<b>没有人需要记住任何事</b>。</p>
 *
 * @author aicoding
 */
public final class DateFormTally {

    private final Map<String, Map<String, Integer>> forms;
    private final Map<String, Map<String, List<String>>> samples;

    public DateFormTally(Map<String, Map<String, Integer>> forms,
                         Map<String, Map<String, List<String>>> samples) {
        this.forms = forms == null ? Collections.<String, Map<String, Integer>>emptyMap() : forms;
        this.samples = samples == null
                ? Collections.<String, Map<String, List<String>>>emptyMap() : samples;
    }

    /**
     * {@code field -> (form -> count)}。<b>值域恒为计数</b>，可直接求和。
     */
    public Map<String, Map<String, Integer>> getForms() {
        return forms;
    }

    /**
     * {@code field -> (form -> 去重截断样例)}，仅 {@link DateFormSampler#OTHER} 与
     * {@link DateFormSampler#AMBIGUOUS_SMALL} 两个「需人工判读」的桶会出现；
     * 无样例的字段<b>不出现在本 map 里</b>（不产生空壳键）。
     */
    public Map<String, Map<String, List<String>>> getSamples() {
        return samples;
    }
}
