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

import org.elasticsearch.client.ResponseException;
import org.junit.Test;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 *  .5：{@link StaleWriteBlockDetector.RestClientEsProbe} 的剥壳与异常路径。
 *
 * <h3>为什么这层非测不可</h3>
 * <p>{@code StaleWriteBlockDetectorTest} 全部走 {@code StubProbe}，桩直接返回已剥好的 Map，
 * <b>整个 REST 回包解析层零覆盖</b>。剥错一层、404 被吞、空 body 解析炸——
 * 任何一种发生，本任务都是<b>静默失效而测试全绿</b>，与线上「业务写不进去却没告警」同构。</p>
 *
 * <h3>fixture 来源：真 ES 6.7.2 抓包，原样保留</h3>
 * <p>下面两段 JSON 是在真实 ES 6.7.2 上执行 {@code GET /{index}/_settings} 与
 * {@code GET /_alias/{alias}} 抓到的原始回包。<b>注意类型不对称</b>：
 * settings 里的 {@code blocks.write} 是<b>字符串</b> {@code "true"}，
 * 而 {@code _alias} 里的 {@code is_write_index} 是<b>真布尔</b> {@code true}。
 * {@code _alias} 不是 settings，不走 settings 的字符串化路径——这个不对称是<b>真实的</b>。
 * fixture 必须原样保留，<b>不许「统一」成同一种类型</b>：统一了测试就比真实世界宽松，
 * 生产上的类型形态反而没人测。</p>
 */
public class RestClientEsProbeTest {

    private static final String PHYSICAL = "r93_block_probe";
    private static final String ALIAS = "r93_block_alias";

    /** 真 ES 6.7.2 回包：GET /r93_block_probe/_settings —— blocks.write 是字符串 "true"。 */
    private static final String SETTINGS_JSON =
            "{\"r93_block_probe\":{\"settings\":{\"index\":{\"number_of_shards\":\"5\","
                    + "\"blocks\":{\"write\":\"true\"},\"provided_name\":\"r93_block_probe\","
                    + "\"creation_date\":\"1785591539745\",\"number_of_replicas\":\"1\","
                    + "\"uuid\":\"19QcGLzQTiKMKMC0bqUCyw\",\"version\":{\"created\":\"6070299\"}}}}}";

    /** 真 ES 6.7.2 回包：GET /_alias/r93_block_alias —— is_write_index 是真布尔 true。 */
    private static final String ALIAS_JSON =
            "{\"r93_block_probe\":{\"aliases\":{\"r93_block_alias\":{\"is_write_index\":true}}}}";

    /**
     * 覆写 I/O 接缝的 probe：按 path 返回预置的<b>原始响应体字符串</b>，或抛预置异常。
     *
     * <p>返回字符串（而非 Map）是刻意的——这样 JSON 解析本身也落在被测范围内，
     * 空 body、数组回包这些解析期失效模式才测得到。</p>
     */
    private static final class FixtureProbe extends StaleWriteBlockDetector.RestClientEsProbe {
        final Map<String, String> bodyByPath = new LinkedHashMap<>();
        final Map<String, IOException> throwByPath = new LinkedHashMap<>();

        FixtureProbe() {
            super(null);
        }

        @Override
        String performJson(String method, String path) throws IOException {
            IOException boom = throwByPath.get(path);
            if (boom != null) {
                throw boom;
            }
            if (!bodyByPath.containsKey(path)) {
                throw new AssertionError("测试未预置该 path 的回包，说明实现请求了预期之外的地址: " + path);
            }
            return bodyByPath.get(path);
        }
    }

    /** 构造一个状态码为 code 的 ResponseException，用来仿真 ES 的非 2xx 回包。 */
    private static ResponseException responseException(int code) throws IOException {
        org.apache.http.HttpResponse http = new org.apache.http.message.BasicHttpResponse(
                new org.apache.http.message.BasicStatusLine(
                        new org.apache.http.ProtocolVersion("HTTP", 1, 1), code, "reason"));
        http.setEntity(new org.apache.http.entity.StringEntity("{\"error\":\"x\"}", "UTF-8"));
        org.elasticsearch.client.Response resp = newResponse(http);
        return new ResponseException(resp);
    }

    /**
     * {@code org.elasticsearch.client.Response} 的构造器是包私有的，
     * 用同包工具类构造——不引入任何新依赖（mock 框架一律不许加）。
     */
    private static org.elasticsearch.client.Response newResponse(org.apache.http.HttpResponse http) {
        return org.elasticsearch.client.EsResponses.of(http);
    }

    // ---------------------------------------------------------------------------------------
    // 1. 正常回包：剥壳必须剥到正确的层，且保留真实类型
    // ---------------------------------------------------------------------------------------

    /**
     * <b>防的失败模式</b>：剥壳少剥一层（返回 {@code {"settings":{...}}}）或多剥一层
     * （返回 {@code {"number_of_shards":...}}）。两种都会让 {@code isWriteBlocked}
     * 在真实回包上返回 false —— 线上永远不告警，而 StubProbe 测试全绿。
     */
    @Test
    public void settingsResponseIsUnwrappedToTheIndexLevel() throws IOException {
        FixtureProbe probe = new FixtureProbe();
        probe.bodyByPath.put("/" + PHYSICAL + "/_settings", SETTINGS_JSON);

        Map<String, Object> settings = probe.getIndexSettings(PHYSICAL);

        // 剥到 settings 层：顶层键应是 "index"，而不是 "settings"，也不是 "number_of_shards"
        assertThat(settings).as("必须剥到 settings 层——顶层键是 index").containsKey("index");
        assertThat(settings).as("不许少剥一层（顶层还留着 settings）").doesNotContainKey("settings");
        assertThat(settings).as("不许多剥一层（直接暴露 index 的子键）").doesNotContainKey("number_of_shards");
    }

    /**
     * 剥壳结果必须能被 {@code isWriteBlocked} 直接判为挡写。
     *
     * <p>这是把 probe 与判定串起来的<b>端到端形状验证</b>：只断言「剥到了 index 层」还不够，
     * 层对了但键名对不上照样漏报。这里用真实回包直连真实判定函数。</p>
     */
    @Test
    public void realSettingsResponseIsRecognizedAsWriteBlocked() throws IOException {
        FixtureProbe probe = new FixtureProbe();
        probe.bodyByPath.put("/" + PHYSICAL + "/_settings", SETTINGS_JSON);

        assertThat(StaleWriteBlockDetector.isWriteBlocked(probe.getIndexSettings(PHYSICAL)))
                .as("真 ES 6.7.2 回包（blocks.write 为字符串 \"true\"）必须被判为挡写")
                .isTrue();
    }

    /**
     * <b>防的失败模式</b>：把 {@code _alias} 回包的<b>别名</b>当成物理索引名返回。
     * 返回别名会让后续 {@code GET /{alias}/_settings} 的剥壳（按物理名取键）拿到 null → 静默不告警。
     */
    @Test
    public void aliasResponseResolvesToPhysicalIndexNotAliasName() throws IOException {
        FixtureProbe probe = new FixtureProbe();
        probe.bodyByPath.put("/_alias/" + ALIAS, ALIAS_JSON);

        String resolved = probe.resolveWriteIndex(ALIAS);

        assertThat(resolved).as("必须返回物理索引名").isEqualTo(PHYSICAL);
        assertThat(resolved).as("绝不能把别名当物理索引返回").isNotEqualTo(ALIAS);
    }

    // ---------------------------------------------------------------------------------------
    // 2. 404：别名/索引不存在是正常状态，不该走异常路径
    // ---------------------------------------------------------------------------------------

    /**
     * <b>防的失败模式</b>：别名不存在时 404 冒泡成 {@code ResponseException}，
     * 被 {@code scanOne} 的 {@code catch(Throwable)} 记成 warn + 堆栈。
     * 首次部署时每个尚未建别名的索引每次启动都刷一条——满屏噪音，真告警被淹没。
     */
    @Test
    public void missingAliasReturnsNullInsteadOfThrowing() throws IOException {
        FixtureProbe probe = new FixtureProbe();
        probe.throwByPath.put("/_alias/" + ALIAS, responseException(404));

        assertThat(probe.resolveWriteIndex(ALIAS))
                .as("别名不存在（404）是正常状态，必须返回 null 而不是抛异常")
                .isNull();
    }

    /** 索引不存在时 {@code GET /{index}/_settings} 同样返 404 → 空 settings，不抛。 */
    @Test
    public void missingIndexReturnsEmptySettingsInsteadOfThrowing() throws IOException {
        FixtureProbe probe = new FixtureProbe();
        probe.throwByPath.put("/" + PHYSICAL + "/_settings", responseException(404));

        assertThat(probe.getIndexSettings(PHYSICAL))
                .as("索引不存在（404）必须返回空 settings 而不是抛异常")
                .isEmpty();
    }

    /**
     * <b>防的失败模式</b>：为了消 404 噪音把<b>所有</b>非 2xx 都吞掉。
     * 403（权限不足）、500（集群异常）是真故障，吞掉就等于把「探测根本没跑成」
     * 伪装成「探测跑了、没发现问题」——比 404 噪音危险得多。
     */
    @Test
    public void nonNotFoundErrorStillPropagates() throws IOException {
        FixtureProbe probe = new FixtureProbe();
        probe.throwByPath.put("/_alias/" + ALIAS, responseException(403));

        try {
            probe.resolveWriteIndex(ALIAS);
            org.junit.Assert.fail("403 是真故障，必须抛出让上层记 warn，不许与 404 一起被吞");
        } catch (ResponseException expected) {
            assertThat(expected.getResponse().getStatusLine().getStatusCode()).isEqualTo(403);
        }
    }

    // ---------------------------------------------------------------------------------------
    // 3. 畸形回包：空 body / JSON 数组 / 顶层键不是物理名
    // ---------------------------------------------------------------------------------------

    /**
     * <b>防的失败模式</b>：空 body 让 {@code MAPPER.readValue} 抛
     * {@code MismatchedInputException}，被上层吞成 warn。不崩，但也<b>不告警</b>。
     */
    @Test
    public void emptyBodyIsTreatedAsAbsentNotAsParseFailure() throws IOException {
        FixtureProbe probe = new FixtureProbe();
        probe.bodyByPath.put("/_alias/" + ALIAS, "");
        probe.bodyByPath.put("/" + PHYSICAL + "/_settings", "   ");

        assertThat(probe.resolveWriteIndex(ALIAS)).as("空 body 必须当作『没有』，不许抛解析异常").isNull();
        assertThat(probe.getIndexSettings(PHYSICAL)).as("空白 body 同样").isEmpty();
    }

    /**
     * <b>防的失败模式</b>：泛型擦除下 {@code readValue(body, Map.class)} 对 JSON <b>数组</b>
     * 回包不会拦，会带着 ArrayList 一路走到 {@code entrySet()} 才炸 ClassCastException。
     * 报错点离成因十万八千里，且同样被吞成 warn。
     */
    @Test
    public void jsonArrayResponseDoesNotBlowUpWithClassCastException() throws IOException {
        FixtureProbe probe = new FixtureProbe();
        probe.bodyByPath.put("/_alias/" + ALIAS, "[{\"unexpected\":1}]");
        probe.bodyByPath.put("/" + PHYSICAL + "/_settings", "[]");

        assertThat(probe.resolveWriteIndex(ALIAS)).as("数组回包不许炸 ClassCastException").isNull();
        assertThat(probe.getIndexSettings(PHYSICAL)).as("数组回包不许炸 ClassCastException").isEmpty();
    }

    /**
     * <b>防的失败模式</b>：settings 回包的顶层键与请求的物理名不一致（代理层改写、
     * 或误用别名去请求）时，实现若「取第一个值」凑合，会把<b>另一个索引</b>的 settings
     * 当成本索引的——挡写判定张冠李戴。这里钉住：取不到就是取不到，返回空。
     */
    @Test
    public void settingsKeyedByDifferentNameYieldsEmptyNotSomeoneElsesSettings() throws IOException {
        FixtureProbe probe = new FixtureProbe();
        probe.bodyByPath.put("/" + PHYSICAL + "/_settings",
                "{\"some_other_index\":{\"settings\":{\"index\":{\"blocks\":{\"write\":\"true\"}}}}}");

        assertThat(probe.getIndexSettings(PHYSICAL))
                .as("顶层键不是所请求的物理名时必须返回空，不许拿别的索引的 settings 顶替")
                .isEmpty();
    }

    /**
     * {@code _alias} 回包指向<b>多个</b>索引且都无 {@code is_write_index} → 无法确定业务写哪个，
     * 返回 null。这条把 {@code resp.size() == 1} 那个分支的<b>另一侧</b>钉住。
     */
    @Test
    public void aliasPointingToMultipleIndicesWithoutWriteFlagResolvesToNull() throws IOException {
        FixtureProbe probe = new FixtureProbe();
        probe.bodyByPath.put("/_alias/" + ALIAS,
                "{\"idx_a\":{\"aliases\":{\"" + ALIAS + "\":{}}},"
                        + "\"idx_b\":{\"aliases\":{\"" + ALIAS + "\":{}}}}");

        assertThat(probe.resolveWriteIndex(ALIAS))
                .as("别名指向多个索引且无 is_write_index 时无法确定写哪个，必须返回 null")
                .isNull();
    }
}
