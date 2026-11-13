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

import static org.junit.Assert.assertThrows;

/**
 * 1046：嵌套 legacy template 的控制面目标旁路回归锚。
 *
 * <p>{@code query.template.inline} 是 Mustache 模板：字符串不是合法 JSON 时旧实现只在根级
 * fail-closed，嵌套形态被静默放行，渲染后的 terms lookup / wrapper 可指向控制面索引。</p>
 */
public class SearchTemplateGuard1046Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    @Test
    public void 嵌套模板渲染控制面terms_lookup被拒() {
        assertThrows(RuntimeException.class, () -> admin.guardSearchBody(
                "{\"query\":{\"template\":{\"inline\":\"{\\\"terms\\\":{\\\"u\\\":{\\\"index\\\":\\\"{{#x}}.security{{/x}}\\\"}}}\",\"params\":{}}}}"));
    }

    @Test
    public void 拆分section拼接的控制面名同样被拒() {
        assertThrows(RuntimeException.class, () -> admin.guardSearchBody(
                "{\"query\":{\"template\":{\"inline\":\"{{#a}}.sec{{/a}}{{#b}}urity{{/b}}\",\"params\":{}}}}"));
    }

    @Test
    public void 普通嵌套模板不误杀() {
        admin.guardSearchBody(
                "{\"query\":{\"template\":{\"inline\":\"{\\\"term\\\":{\\\"user\\\":\\\"{{q}}\\\"}}\",\"params\":{\"q\":\"alice\"}}}}");
    }

    @Test
    public void 校验器临时索引前缀不再对通用写通道豁免() {
        assertThrows(RuntimeException.class, () -> admin.guardIndexName("esquerystudio_validate_123_ab"));
        assertThrows(RuntimeException.class, () -> admin.guardIndexName("ESQUERYSTUDIO_ELASTICSEARCH_VALIDATE_123_AB"));
    }
}
