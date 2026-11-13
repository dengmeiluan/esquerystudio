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

import io.github.dengmeiluan.esquerystudio.console.core.IndexMetaRegistry;
import io.github.dengmeiluan.esquerystudio.console.core.RebuildableIndexMeta;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 *  .5（台账 #65）：启动期发现「写别名当前指向的物理索引处于写阻断状态」。
 *
 * <h3>要解决的故障</h3>
 * <p>{@code WRITE_BLOCK} 策略的重建会给源物理索引加 {@code index.blocks.write=true}，切换别名后解除。
 *  的 {@code pauseBeforeSwitch} 人工确认门会让作业<b>停在挡写状态等人</b>。此时若 宿主 重启，
 * 内存态作业记录全部丢失，没有任何东西记得「我挡了谁的写」，但挡写留在 ES 上无人解除，
 * 业务写入永久失败——而业务侧只看到 {@code cluster_block_exception}，毫无线索。</p>
 *
 * <h3>判据：写别名<b>当前指向</b>的那个物理索引</h3>
 * <p>不是「集群里有没有被挡写的索引」，也不是「历史物理索引有没有被挡写」。
 * 常规重建<b>成功切换后</b>旧物理索引上的挡写是<b>无害残留</b>（别名已指向新索引，业务写新的）。
 * 只有写别名指向的那个索引被挡，才意味着业务<b>此刻真的写不进去</b>。
 * 判据对准「业务能不能写」这个实际后果，不对准「有没有挡写这个现象」。</p>
 *
 * <h3>绝不声称原因</h3>
 * <p>发现挡写时有两种可能且<b>本地无法区分</b>：重建正在进行中（挡写正常）／重建中断了（挡写需人工解除）。
 * 作业状态活在 宿主的内存里，业务侧没有任何办法分辨。所以告警只陈述已确认的事实并<b>并列</b>两种可能，
 * 不排序、不暗示。断言式措辞会把一次<b>正在进行</b>的重建污蔑成故障，运维照着解除就会破坏该次重建，
 * 比不告警更糟。
 *
 * <p>看守这条约束的是<b>两条</b>测试，缺一不可：
 * {@code StaleWriteBlockDetectorTest#alertMustNotAssertACause} 是词黑名单（补丁层，只拦已知说法）；
 * {@code #alertMustPresentBothCausesAsCoequalAlternatives} 才是主看守——它测<b>结构与语气</b>：
 * 同构编号并列、{@code (1)} 在前、明写「无法区分」、两条篇幅不悬殊、且某一条的描述段内不许出现
 * 「通常/更常见/很可能」这类倾向词。违规的本质是语气与排序，光靠枚举禁词拦不住
 * （「上次重建<b>很可能</b>中断了」不含任何禁词，却完全违背本约束）。</p>
 *
 * <h3>为什么是 ApplicationRunner</h3>
 * <p>而不是 {@code SmartInitializingSingleton}：后者在 bean 工厂预实例化阶段触发，此时 web 容器尚未就绪、
 * 其它单例可能仍在初始化，一次慢/挂起的 ES 调用会<b>直接拖住 context refresh 与就绪时间</b>。
 * {@link ApplicationRunner} 在上下文完全 refresh、web 容器已监听之后才跑，慢探测不影响就绪。
 * 本类是纯诊断，产出只进日志，放在最后跑没有任何副作用。</p>
 *
 * @author aicoding
 */
public class StaleWriteBlockDetector implements ApplicationRunner {

    private static final Logger logger = LoggerFactory.getLogger(StaleWriteBlockDetector.class);

    /** 待扫描的写别名清单（来自 {@link IndexMetaRegistry} 登记的索引）。 */
    private final List<String> aliases;

    /** ES 探针；为 null 表示宿主无 ES 连接（HOST_DISABLED），直接跳过扫描。 */
    private final EsProbe probe;

    private final AlertSink sink;

    public StaleWriteBlockDetector(List<String> aliases, EsProbe probe, AlertSink sink) {
        this.aliases = aliases == null ? Collections.<String>emptyList() : aliases;
        this.probe = probe;
        this.sink = sink;
    }

    /**
     * 由 {@link IndexMetaRegistry} 与宿主 client 构造。client 为 null（HOST_DISABLED）时
     * probe 为 null，{@link #scan()} 会跳过并记一行 info。
     */
    public static StaleWriteBlockDetector from(IndexMetaRegistry registry, RestHighLevelClient client) {
        List<String> aliases = new ArrayList<>();
        if (registry != null) {
            for (RebuildableIndexMeta meta : registry.listMetas()) {
                aliases.add(meta.getAliasName());
            }
        }
        return new StaleWriteBlockDetector(aliases, client == null ? null : new RestClientEsProbe(client),
                new Slf4jAlertSink());
    }

    @Override
    public void run(ApplicationArguments args) {
        scan();
    }

    /**
     * 扫描全部登记索引。<b>整体裹 try/catch(Throwable)</b>——诊断功能绝不许变成启动阻塞点。
     *
     * <h3>耗时上界（已评估，刻意不加超时/异步）</h3>
     * <p>本方法<b>串行</b>扫描，每个索引 2 次低层 REST 调用；RHLC 低层 client 默认 socket timeout 30s。
     * 因此最坏耗时约 <b>N × 2 × 30s</b>（N = 登记索引数），且 {@link ApplicationRunner} 是<b>同步</b>的，
     * 这段时间里 {@code SpringApplication.run()} 不返回。</p>
     * <p>之所以判断当前不需要单独处理：这个最坏值只在「ES 端口可连但不回包」（黑洞/半开连接）时才出现——
     * ES 不可达时是<b>秒级</b> connect 失败，正常回包是<b>毫秒级</b>。而真出现黑洞时，宿主自身的 ES 读写
     * 同样会挂死，本探测不是那时的主要矛盾。加超时的代价是要引入独立 {@code RequestConfig}/线程池，
     * 属于新机制；<b>若 N 增长到数十量级，应改为整体限时或挪到异步线程</b>，届时再单独立项。
     * 此处留档是为了让这个上界是<b>已知的</b>，而不是某天线上启动变慢时才被重新发现。</p>
     */
    public void scan() {
        try {
            if (probe == null) {
                logger.info("[EsRebuild] 宿主无可用 ES 连接，跳过写阻断扫描");
                return;
            }
            for (String alias : aliases) {
                scanOne(alias);
            }
        } catch (Throwable t) {
            // 兜底：连遍历本身都失败也不许影响启动
            sink.warn("[EsRebuild] 写阻断扫描整体失败，已跳过（不影响启动）", t);
        }
    }

    /**
     * 单个索引独立判定，<b>各自 try/catch</b>。
     *
     * <p>逐索引兜异常是本方法存在的<b>唯一理由</b>：若只在 {@link #scan()} 那一层兜，
     * 第一个索引抛异常就会中断整轮，后面真正被挡写的索引<b>连同它的告警一起被吞掉</b>。
     * {@code StaleWriteBlockDetectorTest#failureOnFirstIndexDoesNotHideBlockOnSecond} 钉住这一点。</p>
     */
    private void scanOne(String alias) {
        try {
            String physical = probe.resolveWriteIndex(alias);
            if (physical == null || physical.isEmpty()) {
                // 别名不存在，或指向多个索引且无 is_write_index——无法确定「业务写哪个」，不瞎告警
                return;
            }
            if (isWriteBlocked(probe.getIndexSettings(physical))) {
                sink.alert(buildAlert(alias, physical));
            }
        } catch (Throwable t) {
            sink.warn("[EsRebuild] 写阻断扫描失败，已跳过该索引（不影响启动）: alias=" + alias, t);
        }
    }

    /**
     * 判定 settings 中的 {@code index.blocks.write}。
     *
     * <p><b>必须同时认字符串与布尔</b>：ES 的 settings 回包会把布尔<b>字符串化</b>
     * （{@code true} → {@code "true"}）。只写 {@code Boolean.TRUE.equals(v)} 在线上
     * <b>永远识别不到</b>挡写，而若测试也用布尔构造 fixture 就会一路假绿到线上。</p>
     */
    @SuppressWarnings("unchecked")
    static boolean isWriteBlocked(Map<String, Object> settings) {
        if (settings == null) {
            return false;
        }
        Object index = settings.get("index");
        if (!(index instanceof Map)) {
            return false;
        }
        Object blocks = ((Map<String, Object>) index).get("blocks");
        if (!(blocks instanceof Map)) {
            return false;
        }
        Object write = ((Map<String, Object>) blocks).get("write");
        if (write == null) {
            return false;
        }
        // 字符串化形态与布尔形态都要认。
        // 与 RestClientEsProbe#resolveWriteIndex 判 is_write_index 的严格 Boolean.TRUE.equals 刻意不对称，
        // 理由见该处注释：settings 回包字符串化、_alias 回包不字符串化，两者是 ES 的真实差异。
        return Boolean.parseBoolean(String.valueOf(write));
    }

    /**
     * 告警文案。四要素：已确认的事实 / 并列两种可能 / 怎么查 / 怎么解。
     *
     * <p><b>结构是约束的一部分，不只是排版</b>：两种可能必须以同构编号 {@code (1)}/{@code (2)} 并列、
     * {@code (1)} 在前，篇幅相当，且必须明写「无法区分」。措辞刻意避开「残留」「异常退出」
     * 等断言式表达，也避开「通常是」「更可能」这类只加副词就完成暗示的写法——见类注释。
     * {@code StaleWriteBlockDetectorTest#alertMustNotAssertACause} 与
     * {@code #alertMustPresentBothCausesAsCoequalAlternatives} 一起看守这段文案。</p>
     */
    static String buildAlert(String alias, String physical) {
        return "[EsRebuild] 索引 " + alias + " 的写别名当前指向 " + physical
                + "，而该物理索引处于写阻断状态（index.blocks.write=true），"
                + "业务对该索引的写入此刻会失败。\n"
                + "以下两种可能，本地无法区分，未按可能性排序：\n"
                + "  (1) 有一次托管重建正在进行中 —— 挡写属于该次重建的正常中间态，手工解除会破坏该次重建；\n"
                + "  (2) 有一次托管重建已经中断 —— 挡写不再有作业负责解除，需要人工解除才能恢复写入；\n"
                + "请先到 宿主控制台确认有无进行中的作业。确认无作业后，用以下命令解除：\n"
                + "  PUT /" + physical + "/_settings {\"index\":{\"blocks\":{\"write\":false}}}";
    }

    /** ES 探针（两个只读操作），便于单测用桩替换、不连真 ES。 */
    public interface EsProbe {
        /**
         * 别名当前的 write 物理索引（{@code is_write_index=true}）；
         * 无显式标志但仅指向单个索引时返回该唯一索引；否则返回 null。
         */
        String resolveWriteIndex(String alias) throws IOException;

        /** 物理索引的 settings（{@code GET /{index}/_settings}）。 */
        Map<String, Object> getIndexSettings(String physicalIndex) throws IOException;
    }

    /** 告警出口，便于单测把产出收集成 List 断言，而不是去读日志框架。 */
    public interface AlertSink {
        /** 业务此刻真的写不进去，是 error 级。 */
        void alert(String message);

        void warn(String message, Throwable cause);
    }

    private static final class Slf4jAlertSink implements AlertSink {
        @Override
        public void alert(String message) {
            logger.error("{}", message);
        }

        @Override
        public void warn(String message, Throwable cause) {
            logger.warn("{}", message, cause);
        }
    }

    /**
     * 低层 REST 实现。
     *
     * <p>刻意<b>不</b>用 {@code ElasticsearchOperations#getSettings} / {@code IndexOperations#getSettings}：
     * 4.0.9 的 {@code AbstractDefaultIndexOperations#convertSettingsResponseToMap} 用
     * <b>调用方传入的名字</b>去 {@code response.getIndexToSettings().get(indexName)} 取值，
     * 而传别名时 ES 的回包是按<b>物理索引名</b>做键的，取回 null 后直接 NPE。
     * 本类恰恰只在「别名 → 物理索引」之后才读 settings，用不上那条路径。</p>
     *
     * <p>解析别名与读 settings 的姿势与 {@code EsIndexAdmin#getWriteIndex} /
     * {@code #getIndexSettings} 一致——低层 REST 可避开 {@code AliasMetaData}
     * （7.7 改名 {@code AliasMetadata}）的类名变更，兼容宿主锁定的任意 7.x client。</p>
     */
    static class RestClientEsProbe implements EsProbe {

        private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER =
                new com.fasterxml.jackson.databind.ObjectMapper();

        private final RestHighLevelClient client;

        RestClientEsProbe(RestHighLevelClient client) {
            this.client = client;
        }

        @Override
        @SuppressWarnings("unchecked")
        public String resolveWriteIndex(String alias) throws IOException {
            Map<String, Object> resp = getJson("/_alias/" + alias);
            if (resp.isEmpty()) {
                // 别名不存在（404 已在 getJson 里转成 emptyMap），或回包确实为空
                return null;
            }
            for (Map.Entry<String, Object> entry : resp.entrySet()) {
                Object aliasesObj = entry.getValue() instanceof Map
                        ? ((Map<String, Object>) entry.getValue()).get("aliases") : null;
                if (!(aliasesObj instanceof Map)) {
                    continue;
                }
                Object meta = ((Map<String, Object>) aliasesObj).get(alias);
                // 严格 Boolean.TRUE.equals：与 isWriteBlocked 的宽松 parseBoolean 刻意不对称。
                // 实测（真 ES 6.7.2）GET /_alias/{alias} 回包里 is_write_index 是【真布尔】
                //   {"phys":{"aliases":{"alias":{"is_write_index":true}}}}
                // 而 GET /{index}/_settings 回包里 blocks.write 被【字符串化】成 "true"。
                // _alias 不是 settings，不走 settings 的字符串化路径——这个不对称是 ES 的真实行为。
                // 风险登记：若哪天代理层把它字符串化，这里会静默落到下面「仅单索引才返回」的分支，
                // 多索引拓扑下返回 null → 整个检测无声关闭。RestClientEsProbeTest 的 fixture
                // 原样保留这个类型不对称，就是为了让该假设一旦被打破就有测试可改、可查。
                if (meta instanceof Map && Boolean.TRUE.equals(((Map<String, Object>) meta).get("is_write_index"))) {
                    return entry.getKey();
                }
            }
            // 无显式 write 标志时，仅指向单个索引才能确定业务写哪个
            return resp.size() == 1 ? resp.keySet().iterator().next() : null;
        }

        @Override
        @SuppressWarnings("unchecked")
        public Map<String, Object> getIndexSettings(String physicalIndex) throws IOException {
            Map<String, Object> resp = getJson("/" + physicalIndex + "/_settings");
            // 回包形如 {"<physical>":{"settings":{"index":{...}}}}，剥到 settings 层
            Object entry = resp.get(physicalIndex);
            if (!(entry instanceof Map)) {
                return Collections.emptyMap();
            }
            Object settings = ((Map<String, Object>) entry).get("settings");
            return settings instanceof Map ? (Map<String, Object>) settings
                    : Collections.<String, Object>emptyMap();
        }

        /**
         * GET 并解析成 Map。<b>404 转成空 Map</b>，不让它冒泡。
         *
         * <p>RHLC 的低层 client 对任何非 2xx 都抛 {@link org.elasticsearch.client.ResponseException}
         * （{@code IOException} 子类）。别名/索引不存在时 ES 返 404——这是<b>完全正常的状态</b>
         * （首次部署、别名尚未创建），不该走异常路径：否则每个尚未建别名的索引每次启动都刷一条
         * warn + 堆栈，首次部署的业务应用满屏噪音；而且 {@code resolveWriteIndex} 里
         * {@code resp.isEmpty()} 那条分支会变成<b>永不可达的死代码</b>。
         * 显式吃掉 404 后，「不存在」重新走正常返回路径，与
         * {@code EsIndexAdmin#getWriteIndex} 先 {@code aliasExists()} 短路的行为对齐。</p>
         *
         * <p>非 404 的错误（403/500/连接失败）仍然抛出——那是真异常，该记 warn。</p>
         */
        @SuppressWarnings("unchecked")
        private Map<String, Object> getJson(String path) throws IOException {
            String body;
            try {
                body = performJson("GET", path);
            } catch (org.elasticsearch.client.ResponseException e) {
                if (e.getResponse() != null && e.getResponse().getStatusLine() != null
                        && e.getResponse().getStatusLine().getStatusCode() == 404) {
                    return Collections.emptyMap();
                }
                throw e;
            }
            if (body == null || body.trim().isEmpty()) {
                // 空 body：MAPPER.readValue 会抛 MismatchedInputException，这里提前挡掉
                return Collections.emptyMap();
            }
            Object parsed = MAPPER.readValue(body, Object.class);
            // 必须显式判 Map：泛型擦除下 readValue(.., Map.class) 对 JSON 数组回包不会拦，
            // 会一路带着 ArrayList 走到调用方，在 entrySet() 处炸 ClassCastException
            return parsed instanceof Map ? (Map<String, Object>) parsed
                    : Collections.<String, Object>emptyMap();
        }

        /**
         * 发请求并返回<b>原始响应体字符串</b>。
         *
         * <p>提为 package-private 可覆写，是本类唯一的 I/O 接缝：单测覆写它、喂真 ES 抓来的
         * 回包 JSON，就能在<b>不连 ES</b> 的前提下验证剥壳逻辑。返回字符串而非 Map，
         * 是为了让 JSON 解析本身（空 body / 数组回包）也落在被测范围内。</p>
         */
        String performJson(String method, String path) throws IOException {
            Request req = new Request(method, path);
            Response resp = client.getLowLevelClient().performRequest(req);
            return org.apache.http.util.EntityUtils.toString(resp.getEntity());
        }
    }
}
