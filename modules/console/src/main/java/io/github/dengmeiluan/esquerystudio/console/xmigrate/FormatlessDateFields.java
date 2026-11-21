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

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * 迁移时对目标 mapping 里「无 {@code format} 的 date 字段」的<b>如实告知</b>（ / spec  改写版）。
 *
 * <p><b>本类只陈述事实，不改任何东西。</b> 这一点是设计的核心，需要交代它的来历：</p>
 *
 * <p>本任务原方案是 {@code DateFormatWidener}——建目标索引时把 date 字段的 {@code format} 加宽成
 * {@code strict_date_optional_time||epoch_millis||epoch_second||...}，宣称「只增宽容度」。
 * <b>该方案已被 ES 6.7.2 实测推翻</b>，两条独立证据：</p>
 * <ol>
 *   <li><b>它没做到它声称要做的事。</b> 无 format 的 date 字段写入 10 位 {@code 1754000000}，
 *       读回 {@code 1970-01-21T07:13:20Z}；加宽成含 {@code epoch_second} 的串后<b>读回完全相同</b>。
 *       原因：ES 按 {@code ||} 顺序取<b>第一个</b>能解析的 format，排在前面的
 *       {@code strict_date_optional_time} 会先以 epoch_millis 语义吃掉纯数字，{@code epoch_second} 永远轮不到。</li>
 *   <li><b>它把响亮的失败变成了静默的错值。</b> {@code format=yyyy-MM-dd} 的字段写入 {@code "1754000000"}
 *       原本是 400 {@code mapper_parsing_exception}（值根本进不来）；加宽后变成 201 + 读回 1970 年。</li>
 * </ol>
 *
 * <p><b>为什么换个 format 串也救不了</b>：{@code epoch_second} 前置则 13 位毫秒值被当秒解析（飞到公元 57000 年），
 * 后置则 10 位秒值被当毫秒解析（掉回 1970 年）。<b>10 位与 13 位在数值上不可区分</b>，
 * 而 mapping 里<b>没有「按大小猜」这种语义</b>——歧义只能在<b>写入侧</b>消解
 * （{@code EpochDateConverters.toMillis} 的 1e12 阈值正是在写入侧做这件事），
 * mapping 侧<b>结构上无解</b>。故加宽方案整体作废，本类取而代之。</p>
 *
 * <p><b>为什么只看 mapping、不采样文档</b>：判断「某字段里是否真的存着 10 位 epoch」需要读源文档并判形态，
 * 而 {@code date-forms} 采样端点已经在做这件事。迁移路径里再做一份就是第二份实现。
 * 本类只回答 mapping 能回答的那部分：<b>哪些 date 字段没有 format</b>——那正是有  风险的那些字段。</p>
 *
 * @author aicoding
 */
public final class FormatlessDateFields {

    private static final Logger LOG = LoggerFactory.getLogger(FormatlessDateFields.class);

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** 会受  影响的 date 系类型：这些类型无 format 时才落入清单。 */
    private static final String T_DATE = "date";
    private static final String T_DATE_NANOS = "date_nanos";
    private static final String T_DATE_RANGE = "date_range";

    private FormatlessDateFields() {
    }

    /**
     * 扫出 mapping 里所有<b>无 {@code format}</b> 的 date 系字段路径（点分，如 {@code o.t}）。
     *
     * <p>纯函数、幂等；非法 JSON / null 一律返回<b>空清单</b>而非抛异常——
     * 告知功能失败不该让整个迁移失败。注意「空」在这里是两种情况的<b>合流</b>
     * （真的没有 vs 解析不了），故调用方文案不可把空清单表述为「已确认无风险」。</p>
     *
     * @param mappingJson 目标 mapping body；可为 7.x 无类型形态，也可带 6.x 单 type 包装
     * @return 不可变清单，按出现顺序；无匹配返回空清单
     */
    public static List<String> scan(String mappingJson) {
        if (mappingJson == null || mappingJson.trim().isEmpty()) {
            return Collections.emptyList();
        }
        try {
            JsonNode root = OBJECT_MAPPER.readTree(mappingJson);
            List<String> out = new ArrayList<>();
            walk(root, "", out);
            return Collections.unmodifiableList(out);
        } catch (Exception e) {
            // 解析失败静默空清单（「真的没有」与「解析不了」合流）——debug 留痕可追，
            // 空清单返回契约不变（调用方文案仍不可把空清单表述为「已确认无风险」）
            LOG.debug("[FormatlessDateFields] 日期字段扫描失败返回空清单：{}: {}",
                    e.getClass().getSimpleName(), e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    /**
     * 递归下行找 {@code properties} 容器。
     *
     * <p>不假设 {@code properties} 出现在哪一层：7.x 是顶层，6.x 在 type 名下面一层，
     * 嵌套对象则更深。于是对任意节点都试着找 {@code properties}，找到就把它的每个 key 当字段处理。</p>
     */
    private static void walk(JsonNode node, String prefix, List<String> out) {
        if (node == null || !node.isObject()) {
            return;
        }
        JsonNode props = node.get("properties");
        if (props != null && props.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = props.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                String path = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
                JsonNode field = e.getValue();
                if (isFormatlessDate(field)) {
                    out.add(path);
                }
                // 嵌套 object/nested 继续下行
                walk(field, path, out);
            }
            return;
        }
        // 没有 properties：可能是 6.x 的 type 包装层（{"_doc":{"properties":...}}），逐个子节点下行。
        // prefix 不累加 type 名——它不是字段路径的一部分。
        Iterator<Map.Entry<String, JsonNode>> it = node.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> e = it.next();
            walk(e.getValue(), prefix, out);
        }
    }

    /** date 系类型 + 无 {@code format} 键。判据落在 type 的<b>值</b>上，不靠「有没有 properties」间接推断。 */
    private static boolean isFormatlessDate(JsonNode field) {
        if (field == null || !field.isObject()) {
            return false;
        }
        JsonNode type = field.get("type");
        if (type == null || !type.isTextual()) {
            return false;
        }
        String t = type.asText();
        if (!T_DATE.equals(t) && !T_DATE_NANOS.equals(t) && !T_DATE_RANGE.equals(t)) {
            return false;
        }
        return field.get("format") == null;
    }

    /**
     * 把清单渲染成给使用者看的告知文案；清单为空返回 null（无话可说时不说话）。
     *
     * <p><b>三要素缺一不可</b>：①事实 ②后果 ③<b>迁移做了什么、没做什么</b>。
     * 第 ③ 条是硬要求——没有它，使用者看到「迁移成功 + 一堆告警」会以为迁移搞坏了什么。
     * 文案中<b>不得</b>出现任何暗示「已处理 / 已兼容 / 已加宽」的措辞：那正是被实测推翻的那个方案的谎。</p>
     */
    public static String describe(List<String> formatlessFields) {
        if (formatlessFields == null || formatlessFields.isEmpty()) {
            return null;
        }
        return "以下 " + formatlessFields.size() + " 个 date 字段在 mapping 中没有声明 format："
                + String.join("、", formatlessFields)
                + "。若其中存有 10 位的 epoch 秒值，ES 会按毫秒解释，读出来是 1970 年附近的时间。"
                + "本次迁移既不会造成这个问题，也不会修复它——源索引什么样，目标索引就什么样，"
                + "mapping 与文档均按原样搬运。是否需要处理，请对照源集群自行判定。";
    }
}
