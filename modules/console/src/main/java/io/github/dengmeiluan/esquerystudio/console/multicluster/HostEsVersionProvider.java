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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;

/**
 * 宿主（控制）集群服务端版本探测与缓存（-67）。
 *
 * <p><b>为什么需要它</b>：远程集群的版本由连接档案在探活/测试连接时回写
 * （{@code ConnStore.updateVersion}），但<b>宿主集群没有连接档案</b>——
 * {@code updateVersion} 的两个调用点都以 connId 为前提，全仓<b>没有任何地方探测宿主版本</b>。
 * 于是 {@code EsClientRouter.currentEsVersion()} 对宿主恒返回 null，宿主被一律当成 7.x，
 * 6.x 分叉路径（{@code createIndexLegacy6} 等）<b>对宿主永远不可达</b>。
 * 本类补上这一环：宿主没有档案，但有 RHLC，取 {@code GET /} 的 {@code version.number} 即可。</p>
 *
 * <p><b>探不到怎么办——本类最重要的设计决定</b>：</p>
 * <ol>
 *   <li><b>不假装知道。</b> 返回 {@code null}，由 {@link EsVersionCaps#mappingTypeMode(String)}
 *       映射成 {@link EsVersionCaps.MappingTypeMode#UNKNOWN}。绝不回退成某个 major 数字——
 *       任何数字都同时是某个真实集群的合法答案，拿它兼表「未知」会让断言<b>永远分不清</b>
 *       「没探到」与「真的是这个版本」（{@code DEFAULT_MAJOR = 7} 正是这个错误）。</li>
 *   <li><b>不硬失败。</b> 探测失败仅 WARN 并保持未知，<b>不阻断启动</b>：本 starter 设计上就要能在
 *       控制集群绑定之前启动（自举/BOOTSTRAP 形态），把 ES 变成启动硬依赖会让一次网络抖动直接锁死应用。</li>
 *   <li><b>下次调用自动重试。</b> 失败<b>不</b>写缓存，因此绑定完成/网络恢复后的第一次调用即可探到并缓存；
 *       无需重启、无需定时任务。</li>
 *   <li><b>换了集群自动重探。</b> 缓存键是 {@code (client 实例, 版本)} 二元组而非单纯的版本字符串：
 *       控制集群重绑（{@code ControlClusterResolver.bindBootstrap}）会把宿主换成<b>另一个物理集群</b>，
 *       此时 client 实例必然变化，缓存自动失效。<b>不依赖调用方在重绑后记得通知本类</b>——
 *       靠纪律的失效机制会在下一个新增重绑入口时无声失守。</li>
 * </ol>
 *
 * <p>未知时调用方<b>不应猜版本</b>，而应改用 6.x 与 7.x/8.x 都合法的请求形态
 * （如 {@code PUT /{index}/_doc/{id}?op_type=create}）——把「未知」从需要决策的分支
 * 变成不需要决策的分支。</p>
 *
 * <p>线程安全：{@code volatile} 缓存 + 幂等探测，并发首调最多多打几次 {@code GET /}，无副作用。</p>
 *
 * @author aicoding
 */
public class HostEsVersionProvider {

    private static final Logger LOG = LoggerFactory.getLogger(HostEsVersionProvider.class);

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** client 获取失败 warn 节流间隔（热路径硬前提，范式= PropertiesAuthDelegate）。 */
    private static final long WARN_THROTTLE_MS = 60_000L;

    private final Supplier<RestHighLevelClient> hostClient;

    /** client 获取失败 WARN 节流器（实例级，CAS 抢占防并发重复告警）。 */
    private final AtomicLong lastUnavailableWarnAt = new AtomicLong(0L);

    /**
     * 缓存的 {@code (探测所用的 client, 探到的版本)} 二元组；null = 尚无成功探测。
     *
     * <p><b>为什么缓存 client 而不只缓存版本</b>：{@code ControlClusterResolver.bindBootstrap}
     * 会把控制集群原子切换到<b>另一个物理集群</b>（Setup apply 与 rebind 共用该入口）。
     * 若只缓存版本字符串，重绑后宿主版本仍报旧集群的值——7.x 重绑到 6.x 后仍报 7.x，
     * {@code createIndex} 继续走 typeless，6.x 上 {@code mapper_parsing_exception}，
     * 即 #67 的原始故障换条触发路径复现（反向亦然：6.x→7.x 后仍多包一层 {@code _doc}）。</p>
     *
     * <p><b>为什么不靠在 bindBootstrap 末尾调 invalidate()</b>：那依赖<b>调用方纪律</b>——
     * 下一个新增重绑入口的人会忘，而忘了不会有任何测试变红。把 client 身份纳入缓存键后，
     * 换了集群就<b>必然</b>换了 client 实例，重探是数据决定的，不依赖任何调用方记得做什么。
     * 与 {@code LockDocPort} 的取向一致：<b>让错误不可能 &gt; 检测错误</b>。</p>
     */
    private volatile VersionSnapshot snapshot;

    /** 不可变的 {@code (client, version)} 二元组：两个字段必须同进同出，拆成两个 volatile 会有撕裂窗口。 */
    private static final class VersionSnapshot {
        final RestHighLevelClient client;
        final String version;

        VersionSnapshot(RestHighLevelClient client, String version) {
            this.client = client;
            this.version = version;
        }
    }

    public HostEsVersionProvider(Supplier<RestHighLevelClient> hostClient) {
        this.hostClient = hostClient;
    }

    /**
     * 宿主集群服务端版本号（如 {@code 6.7.2}）；<b>探不到返回 null 表示「未知」</b>。
     *
     * <p>首次调用触发 {@code GET /} 探测；成功即缓存，失败保持未知并在下次调用重试。
     * <b>宿主 client 被换成另一个实例（控制集群重绑）时缓存自动失效并重探</b>，
     * 无需任何调用方通知。</p>
     */
    public String currentVersion() {
        RestHighLevelClient client = currentClient();
        VersionSnapshot cached = snapshot;
        // 判据落在 client 身份这个**值**上：同一实例才可复用缓存
        if (cached != null && cached.client == client) {
            return cached.version;
        }
        if (client == null) {
            // 控制集群尚未绑定（自举形态），属预期状态，debug 级即可
            LOG.debug("[HostEsVersion] 宿主 client 尚不可用（控制集群未绑定），版本保持未知");
            return null;
        }
        String probed = probe(client);
        if (probed != null) {
            snapshot = new VersionSnapshot(client, probed);
            if (cached != null) {
                LOG.info("[HostEsVersion] 宿主 client 已更换（控制集群重绑），版本重探: {} -> {}",
                        cached.version, probed);
            } else {
                LOG.info("[HostEsVersion] 宿主集群版本探测成功: {}（6.x 将启用 typed mapping 分叉）", probed);
            }
        }
        return probed;
    }

    /** 宿主的 mapping type 形态（三态，未知不与任何版本同形）。 */
    public EsVersionCaps.MappingTypeMode mappingTypeMode() {
        return EsVersionCaps.mappingTypeMode(currentVersion());
    }

    /** 取宿主 client；supplier 自身抛异常（如未绑定时的 SetupRequiredException）一律视为「暂不可用」。 */
    private RestHighLevelClient currentClient() {
        try {
            return hostClient.get();
        } catch (Exception e) {
            // debug→节流 WARN——与同文件探测失败三臂（142/:147/:153）档位拉齐：
            // client 拿不到是持续性状态，debug 对运营不可见=版本恒未知无从排查。supplier 每个
            // 请求都可能摸到（热路径），60s 节流防刷屏（首条留痕含堆栈，后续静默）；
            // client==null 的未绑定预期态臂维持既有静默（见 currentVersion 内 debug）
            long now = System.currentTimeMillis();
            long last = lastUnavailableWarnAt.get();
            if (now - last > WARN_THROTTLE_MS && lastUnavailableWarnAt.compareAndSet(last, now)) {
                LOG.warn("[HostEsVersion] 宿主 client 获取失败（控制集群未就绪），版本保持未知"
                        + "（{}s 内不再重复告警）", WARN_THROTTLE_MS / 1000, e);
            }
            return null;
        }
    }

    /** {@code GET /} 取 {@code version.number}；任何异常都吞掉并返回 null（= 未知）。 */
    private String probe(RestHighLevelClient client) {
        try {
            Response resp = client.getLowLevelClient().performRequest(new Request("GET", "/"));
            String body = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            @SuppressWarnings("unchecked")
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, Map.class);
            Object version = root.get("version");
            if (!(version instanceof Map)) {
                LOG.warn("[HostEsVersion] GET / 响应无 version 段，宿主版本保持未知（将走 6.x/7.x 双兼容形态）");
                return null;
            }
            Object number = ((Map<?, ?>) version).get("number");
            if (number == null || String.valueOf(number).trim().isEmpty()) {
                LOG.warn("[HostEsVersion] GET / 响应 version.number 为空，宿主版本保持未知");
                return null;
            }
            return String.valueOf(number).trim();
        } catch (Exception e) {
            // 不硬失败、不假装知道：保持未知 + 下次调用重试
            LOG.warn("[HostEsVersion] 宿主版本探测失败，保持「未知」并在下次调用重试（不假装 7.x）: {}", e.getMessage(), e);
            return null;
        }
    }
}
