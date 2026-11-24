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

package io.github.dengmeiluan.esquerystudio.console.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.annotation.Transient;
import org.springframework.data.elasticsearch.annotations.Field;

import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 反射扫 ES 实体的字段，产出 field -&gt; (javaType, esType, @Field 注解值) 三元信息。
 *
 * <p>用途：宿主侧把它与「ES 侧采样出的存储形态」交叉，查  实测的 30 格矩阵判定
 * date 兼容风险 —— 有了这一列就是查表，没有它只能猜。</p>
 *
 * <p><b>两个 null 语义互不相同，前端不许合并处理</b>：</p>
 * <table border="1">
 *   <tr><th>列</th><th>值</th><th>含义</th></tr>
 *   <tr><td>{@code esType}</td><td>null 且 row 级 {@code mappingParsed==true}</td>
 *       <td>mapping 解析成功、但里面没有这个键 —— 该字段<b>走 dynamic mapping</b>
 *           （spec  信号⑤，风险判定要用它）</td></tr>
 *   <tr><td>{@code esType}</td><td>null 且 row 级 {@code mappingParsed==false}</td>
 *       <td><b>我们不知道</b> —— mappingJson 缺失或没解析成功，<b>不得</b>据此判定 dynamic mapping</td></tr>
 *   <tr><td>{@code esFormat}</td><td>null</td>
 *       <td>mapping 里该字段没写 {@code format}（或整个 mapping 未解析）。
 *           规则 {@code SECONDS_IN_FORMATLESS_DATE} 据此判定；与 {@code esType} 同源同址，
 *           故未解析时两者一同缺席，不会出现「type 不可用而 format 可用」的中间态</td></tr>
 *   <tr><td>{@code annType}/{@code annFormat}</td><td>null</td>
 *       <td><b>整个 {@code @Field} 都没写</b></td></tr>
 *   <tr><td>{@code annType}/{@code annFormat}</td><td>{@code "Auto"} / {@code "none"}</td>
 *       <td><b>注解在、但该项未指定</b>。这是 sdes 4.0.9 的枚举默认值（{@code javap -v} 实测：
 *           {@code FieldType.Auto} / {@code DateFormat.none}），是<b>哨兵值不是缺席</b>，
 *           与上一行的 null 是两回事</td></tr>
 * </table>
 *
 * <p><b>{@code mappingParsed} 为何必要</b>（修订一）：业务侧的 mappingJson 由
 * {@code IndexMetaRegistry.readAnnotationPath} 原样读取 classpath 资源，<b>不做任何 JSON 校验</b>；
 * 而唯一会校验它的 {@code IndexConfigValidator} 只在 {@code esquerystudio.elasticsearch.mode=console} 下装配，
 * client 模式的业务应用根本没有它。所以「坏 JSON」在本方法是<b>可达</b>路径，
 * 必须让「解析失败」成为一等值，而不是伪装成「字段不在 mapping 里」。</p>
 *
 * <p><b>{@code mappingParsed} 为何在 row 级而非字段级</b>（评审 I-2）：它是
 * <b>「这个索引的 mappingJson」的属性，不是某个字段的属性</b>。放进字段行等于把一个
 * per-index 事实复制 N 份，再要求消费方挑一行当代表 —— 由此派生出两个缺陷：
 * 消费方须依赖 {@code fields[0]}（与列表顺序耦合），且<b>字段列表为空的合法实体</b>
 * （无 {@code @Field}、无非 transient 字段）无从取值，会被误判成「未解析」——
 * 那正是「缺席与合法值同形」的又一次复发。故本类只暴露 {@link #mappingParsed(String)}
 * 由 {@code DesiredStatePayload} 置于 row 级，字段行不再携带该键。</p>
 *
 * <p><b>明确局限</b>（spec ，必须如实对外声明，不许假装完备）：
 * <ul>
 *   <li>{@code @Transient} 字段跳过；static / synthetic 字段跳过</li>
 *   <li>只取 {@code getDeclaredFields()}，<b>不含继承字段</b>。实体一般无继承；若有则会漏检</li>
 *   <li>集合 / 数组字段记录<b>声明类型本身</b>（如 {@code java.lang.Long[]}），不解元素类型</li>
 *   <li>只看顶层 {@code properties}，<b>不递归子对象</b>（{@code properties.x.properties.y} 扫不到）</li>
 *   <li>任何反射或解析失败都不抛，最差返回空列表 —— 一个字段扫不出来不该让整个端点 500</li>
 * </ul>
 *
 * <p>纯静态方法、无 Spring 依赖、<b>零 ES 读取</b>（spec  业务侧硬约束：
 * 只反射 + 解析业务方自己声明的 mappingJson，不连 ES 查真实 mapping）。</p>
 */
public final class EntityFieldScanner {

    private static final Logger LOG = LoggerFactory.getLogger(EntityFieldScanner.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private EntityFieldScanner() {
    }

    public static List<Map<String, Object>> scan(Class<?> entityClass, String mappingJson) {
        if (entityClass == null) {
            return Collections.emptyList();
        }
        JsonNode props = parseProperties(mappingJson);
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        java.lang.reflect.Field[] declared;
        try {
            declared = entityClass.getDeclaredFields();
        } catch (Throwable t) {
            /* 静默 emptyList→WARN——getDeclaredFields 抛 Throwable 属 JVM 级
               异常（NoClassDefFoundError 等），全字段扫描无痕归零则  矩阵静默失明无从
               排查；吞异常契约不变（返回 emptyList 控制流零改动）。同族 null 返回点核查：
               sdesVersion() 的 Throwable→null 与 parseProperties() 的 catch→null 均为文档化
               正常路径（前者 jar 无 Implementation-Version 常态、后者契约内解析失败经
               mappingParsed=false 可辨），维持静默，见 Observability547Test 备案 */
            LOG.warn("[EntityFieldScanner] getDeclaredFields failed class={}: {}",
                    entityClass.getName(), t.getMessage(), t);
            return Collections.emptyList();
        }
        for (java.lang.reflect.Field f : declared) {
            if (f.isSynthetic() || Modifier.isStatic(f.getModifiers())
                    || f.isAnnotationPresent(Transient.class)) {
                continue;
            }
            String declaredName = f.getName();
            Field ann = f.getAnnotation(Field.class);
            String name = declaredName;
            String annType = null;
            String annFormat = null;
            String annPattern = null;
            if (ann != null) {
                // value() 与 name() 在 sdes 4.0.9 里互为 @AliasFor 别名（javap 实测两者都存在），
                // 两个都读一次是防御性写法：不同 sdes 小版本上哪个被填充并不保证。
                if (ann.value() != null && !ann.value().isEmpty()) {
                    name = ann.value();
                } else if (ann.name() != null && !ann.name().isEmpty()) {
                    name = ann.name();
                }
                // 注意：type()/format() 未显式指定时返回枚举默认值（Auto / none）而非 null，
                // 此处刻意<b>不</b>把默认值规整成 null —— 「注解在但未指定」与「没写注解」必须可分辨。
                //
                // format()/pattern() 的返回形态在 sdes 4.0.x（单值）与 4.4.x（数组）间不同，
                // 编译期直调会把返回类型钉进字节码 → 换版本抛 NoSuchMethodError，
                // 且只在真正访问该字段时才炸（启动期不报）——第一个撞见的是打开 desired-state 页的人。
                // 故经 SdesCompat 反射取值。type()/value()/name() 两版签名相同（javap 实测），保持直调。
                annType = ann.type() == null ? null : ann.type().name();
                annFormat = SdesCompat.formatName(ann);
                annPattern = SdesCompat.pattern(ann);
            }
            Map<String, Object> row = new LinkedHashMap<String, Object>();
            row.put("name", name);
            row.put("declaredName", declaredName);
            row.put("javaType", f.getType().getName());
            row.put("esType", esTypeOf(props, name));
            row.put("esFormat", esFormatOf(props, name));
            row.put("annType", annType);
            row.put("annFormat", annFormat);
            row.put("annPattern", annPattern);
            out.add(row);
        }
        return out;
    }

    /**
     * mappingJson 是否解析出了可用的 {@code properties} —— <b>per-index 事实，置于 payload row 级</b>。
     *
     * <p>为 false 的五种输入：mappingJson 为 null / 为空白 / 非合法 JSON /
     * 无 {@code properties} 键 / {@code properties} 不是对象。</p>
     *
     * <p><b>消费方必读</b>：为 false 时，{@code fields[].esType} 的 null <b>不表示</b>
     * 「该字段走 dynamic mapping」，只表示「我们不知道」，不得据此做风险判定。
     * 其中「mappingJson 为 null」是业务方没写 {@code @Mapping} 的<b>正常路径</b>（非异常），
     * 要区分二者请同时看 row 级的 {@code mappingJson} 是否为 null。</p>
     */
    public static boolean mappingParsed(String mappingJson) {
        return parseProperties(mappingJson) != null;
    }

    /** sdes 版本：从 {@link Field} 所在 jar 的 manifest 读 Implementation-Version；读不到返 null。 */
    public static String sdesVersion() {
        try {
            String v = Field.class.getPackage().getImplementationVersion();
            return v == null || v.isEmpty() ? null : v;
        } catch (Throwable t) {
            return null;
        }
    }

    /**
     * 解析出 mapping 的 properties 节点。
     *
     * @return 解析成功且 properties 是对象时返回该节点；<b>其余一切情形返回 null</b>
     *         （mappingJson 为 null/空、不是合法 JSON、没有 properties 键、properties 不是对象）。
     *         调用方据此置 {@code mappingParsed=false}，让「解析失败」与「字段不在 mapping 里」可分辨。
     */
    private static JsonNode parseProperties(String mappingJson) {
        if (mappingJson == null || mappingJson.trim().isEmpty()) {
            return null;
        }
        try {
            JsonNode root = MAPPER.readTree(mappingJson);
            JsonNode props = root.path("properties");
            return props.isObject() ? props : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static String esTypeOf(JsonNode props, String name) {
        return textAttr(props, name, "type");
    }

    /**
     * mapping 里该字段的 {@code format} 键；无则 null。
     *
     * <p><b>为何由后端产出而非前端现取</b>（  裁定四）：它是 spec  规则 1
     * {@code SECONDS_IN_FORMATLESS_DATE} 唯一的 mapping 侧输入。若前端为此自行解析一次
     * mappingJson，仓库里就有<b>两个 mapping 解析器</b> —— 它们此刻一致，从此各自演化；
     * 且「后端 {@code mappingParsed=false} 而前端解析成功读出了 format」这种错位状态
     * 在类型上完全合法。{@code esFormat} 与 {@code esType} 是同一类元信息、同一个提取动作，
     * 必须同址产出。附带好处：{@code mappingParsed==false} 时两者一同为 null，降级行为天然一致。</p>
     *
     * <p><b>原样返回，不做切分或规整</b>：多 format 以 {@code ||} 连写
     * （如 {@code strict_date_optional_time||epoch_millis||epoch_second}），
     * 消费方要在其中找 {@code epoch_second}，任何加工都会让它失准。</p>
     */
    private static String esFormatOf(JsonNode props, String name) {
        return textAttr(props, name, "format");
    }

    /** 取 {@code properties.<name>.<attr>} 的文本值；缺任一层、或该值非文本时一律返回 null。 */
    private static String textAttr(JsonNode props, String name, String attr) {
        if (props == null) {
            return null;
        }
        JsonNode f = props.get(name);
        if (f == null || !f.isObject()) {
            return null;
        }
        JsonNode v = f.get(attr);
        return v == null || !v.isTextual() ? null : v.asText();
    }
}
