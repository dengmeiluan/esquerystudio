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

package io.github.dengmeiluan.esquerystudio.console.probe;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.apache.http.HttpHost;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.RestClient;
import org.elasticsearch.client.RestHighLevelClient;

import java.util.Map;

/**
 *   阶段⑤′演练：在真实 QA 6.7.2 上验证 {@code date-forms} 采样口径。
 *
 * <p><b>本演练要证的两件事</b>（其一是硬门）：</p>
 * <ol>
 *   <li><b>match_all 有系统性偏倚</b>——分两批写入形态不同的文档后，{@code match_all} 是否
 *       只返回先写入的那批。这决定了端点该用哪种采样口径，是经验问题不是推理问题。</li>
 *   <li><b>random_score 在 6.7.2 上可跑通且能混采两批</b>——6.x 的 function_score 语法与
 *       7.x 可能不同，必须实测。</li>
 * </ol>
 *
 * <p>走<b>真实的 {@link EsIndexAdmin#queryDsl}</b>（端点实际调用的那条线路），
 * 而不是 curl 复刻——curl 只能证明协议层性质，证明不了本代码的行为。</p>
 *
 * <p><b>本类故意没有任何 {@code @Test} 方法</b>，是需要活 ES 的<b>人工复现程序</b>，
 * 不在 CI 里执行。之所以要说明这点：它长得像测试，但<b>它不看守任何东西</b>——
 * 曾经把采样口径的判据只放在本类里，结果把实现改回 {@code match_all} 时全量测试照样全绿。
 * <b>未执行的代码证明不了行为。</b></p>
 *
 * <p><b>该性质在 CI 侧的看守是</b>：
 * {@code EsIndexRebuildServiceDateFormsTest#dateFormsSamplesWithRandomScoreNotDocOrder}、
 * {@code #dateFormsDslDoesNotStartWithBareMatchAll}、
 * {@code #dateFormsReportsSamplingModeInResponse}
 * ——它们用桩 admin 截获真实发出的 DSL 字符串，改回 {@code match_all} 会红。
 * 本类保留的价值是「{@code match_all} 偏倚真实存在」这一<b>经验事实</b>的复现程序：
 * 那件事离了活 ES 测不了。</p>
 *
 * <p>非 JUnit：main 方法运行，避免污染 CI 与依赖 QA 可达性。
 * 只碰 {@code r93_} 前缀，清理在 {@code finally}。</p>
 *
 * <pre>
 * mvn -o test-compile
 * mvn -o exec:java -Dexec.classpathScope=test \
 *     -Dexec.mainClass=io.github.dengmeiluan.esquerystudio.console.probe.DateFormSamplingDrill
 * </pre>
 */
public final class DateFormSamplingDrill {

    private static final String ES_HOST = "10.64.10.74";
    private static final int ES_PORT = 9200;
    private static final String INDEX = "r93__dateform_drill";
    private static final ObjectMapper OM = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        RestHighLevelClient client = new RestHighLevelClient(
                RestClient.builder(new HttpHost(ES_HOST, ES_PORT, "http")));
        RestClient ll = client.getLowLevelClient();
        EsIndexAdmin admin = new EsIndexAdmin(client);
        int exit = 0;
        try {
            System.out.println("=== date-form sampling drill (QA " + ES_HOST + ") ===");
            System.out.println("server version : " + version(ll));

            drop(ll);
            create(ll);
            // 20 条 epoch_millis；：20 条 ISO 串。严格先后写入。
            bulk(ll, "a", 20, true);
            refresh(ll);
            bulk(ll, "b", 20, false);
            refresh(ll);

            System.out.println("\n--- [1] match_all size=20 (brief 原口径) x3 ---");
            boolean biased = true;
            for (int i = 0; i < 3; i++) {
                int[] c = tallyBatches(admin, "{\"query\":{\"match_all\":{}}}", 20);
                System.out.printf("  run%d: one_millis=%d two_iso=%d%n", i + 1, c[0], c[1]);
                if (c[1] > 0) {
                    biased = false;
                }
            }
            System.out.println("  => match_all 偏倚存在（第二组样本恒 0）: " + biased);

            System.out.println("\n--- [2] random_score size=20 (采用口径) x3 ---");
            boolean mixes = true;
            String rnd = "{\"query\":{\"function_score\":{\"query\":{\"match_all\":{}},\"random_score\":{}}}}";
            for (int i = 0; i < 3; i++) {
                int[] c = tallyBatches(admin, rnd, 20);
                System.out.printf("  run%d: one_millis=%d two_iso=%d%n", i + 1, c[0], c[1]);
                if (c[1] == 0) {
                    mixes = false;
                }
            }
            System.out.println("  => random_score 每次都混到第二组: " + mixes);

            System.out.println("\n--- [3] getMapping 剥 6.x type 包层后能否挑出 date 字段 ---");
            String mapping = admin.getMapping(INDEX);
            System.out.println("  getMapping  : " + mapping);
            System.out.println("  dateFieldsOf: "
                    + io.github.dengmeiluan.esquerystudio.console.validate.DateFormSampler.dateFieldsOf(mapping));

            System.out.println("\n--- [4] EsIndexRebuildService.dateForms 真实响应体 ---");
            io.github.dengmeiluan.esquerystudio.console.core.EsIndexRebuildService svc = dateFormsService(client, admin);
            System.out.println("  " + OM.writeValueAsString(svc.dateForms(INDEX, 50)));

            if (!biased || !mixes) {
                System.out.println("\nUNEXPECTED: 采样口径结论与预期不符，见上面原始输出");
                exit = 1;
            }
        } finally {
            try {
                drop(ll);
                System.out.println("\ncleanup: " + INDEX + " dropped; remaining r93_* = " + countR93(ll));
            } catch (Exception e) {
                System.out.println("cleanup FAILED: " + e);
            }
            client.close();
        }
        System.exit(exit);
    }

    /** 组装真实 EsIndexRebuildService（空 registry：索引名直传，正是集群级只读端点的路径）。 */
    private static io.github.dengmeiluan.esquerystudio.console.core.EsIndexRebuildService dateFormsService(
            RestHighLevelClient client, EsIndexAdmin admin) {
        io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties props =
                new io.github.dengmeiluan.esquerystudio.console.config.ESQueryStudioElasticsearchProperties();
        io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry registry =
                new io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry(
                        null, java.util.Collections.emptyList());
        return new io.github.dengmeiluan.esquerystudio.console.core.EsIndexRebuildService(
                registry, admin, null,
                new io.github.dengmeiluan.esquerystudio.console.core.IndexNameResolver(admin, props, null), props);
    }

    /** 返回 {命中数, 命中数}——走真实 EsIndexAdmin.queryDsl。 */
    @SuppressWarnings("unchecked")
    private static int[] tallyBatches(EsIndexAdmin admin, String dsl, int size) throws Exception {
        Map<String, Object> resp = admin.queryDsl(INDEX, dsl, size);
        int one = 0, two = 0;
        for (Object h : (java.util.List<Object>) resp.get("hits")) {
            Map<String, Object> src = (Map<String, Object>) ((Map<String, Object>) h).get("_source");
            if ("one_millis".equals(src.get("batch"))) one++;
            else if ("two_iso".equals(src.get("batch"))) two++;
        }
        return new int[]{one, two};
    }

    private static String version(RestClient ll) throws Exception {
        Map<String, Object> root = json(ll, new Request("GET", "/"));
        return String.valueOf(((Map<?, ?>) root.get("version")).get("number"));
    }

    private static void create(RestClient ll) throws Exception {
        Request r = new Request("PUT", "/" + INDEX);
        r.setJsonEntity("{\"settings\":{\"number_of_shards\":1,\"number_of_replicas\":0},"
                + "\"mappings\":{\"_doc\":{\"properties\":{"
                + "\"t\":{\"type\":\"date\",\"format\":\"epoch_millis||strict_date_optional_time\"},"
                + "\"batch\":{\"type\":\"keyword\"}}}}}");
        ll.performRequest(r);
    }

    private static void bulk(RestClient ll, String idPrefix, int n, boolean millisForm) throws Exception {
        StringBuilder sb = new StringBuilder();
        for (int i = 1; i <= n; i++) {
            sb.append("{\"index\":{\"_id\":\"").append(idPrefix).append(i).append("\"}}\n");
            String v = millisForm
                    ? "175400000000" + (i % 10)
                    : "\"2025-08-01T06:13:2" + (i % 10) + "Z\"";
            sb.append("{\"t\":").append(v).append(",\"batch\":\"")
                    .append(millisForm ? "one_millis" : "two_iso").append("\"}\n");
        }
        Request r = new Request("POST", "/" + INDEX + "/_doc/_bulk");
        r.setJsonEntity(sb.toString());
        r.addParameter("refresh", "true");
        ll.performRequest(r);
    }

    private static void refresh(RestClient ll) throws Exception {
        ll.performRequest(new Request("POST", "/" + INDEX + "/_refresh"));
    }

    private static void drop(RestClient ll) {
        try {
            ll.performRequest(new Request("DELETE", "/" + INDEX));
        } catch (Exception ignored) {
            // 索引不存在时 404，属正常
        }
    }

    private static String countR93(RestClient ll) throws Exception {
        Request r = new Request("GET", "/_cat/indices/r93_*");
        r.addParameter("h", "index");
        String body = org.apache.http.util.EntityUtils.toString(
                ll.performRequest(r).getEntity()).trim();
        return body.isEmpty() ? "0" : body.replace("\n", ",");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> json(RestClient ll, Request r) throws Exception {
        return OM.readValue(
                org.apache.http.util.EntityUtils.toString(ll.performRequest(r).getEntity()), Map.class);
    }

    private DateFormSamplingDrill() {
    }
}
