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

import java.util.Locale;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 多集群连接存储（把「自定义 ES 连接串」持久化到<b>控制集群</b>内部索引
 * {@code esquerystudio_conn}，密码只在服务端流转——列表/详情接口一律脱敏，前端永远拿不到明文。
 *
 * <p>与 {@link RemoteClusterConn}（xmigrate 一次性连接，用完即弃）互补：本店保存的是
 * <b>可反复切换的目标集群档案</b>，供 {@link EsClientRouter} 按 connId 建立长连接。
 *  起 client 经 {@code Supplier} 懒解析（控制集群可能在 Setup 绑定后才就绪）。
 *  起为 {@link ConnStore} SPI 的默认档（嵌入宿主时可切 {@link JdbcConnStore}）。</p>
 *
 * @author aicoding
 */
public class EsConnStore implements ConnStore {

    private static final Logger LOG = LoggerFactory.getLogger(EsConnStore.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final java.util.function.Supplier<RestHighLevelClient> controlClient;
    private final String connIndex;
    /** 凭据静态加密（null=旁路：旧构造/单测保持明文行为不变）。 */
    private final ConnCrypto crypto;

    private final org.springframework.context.ApplicationEventPublisher events;

    public EsConnStore(java.util.function.Supplier<RestHighLevelClient> controlClient, String connIndex,
                       org.springframework.context.ApplicationEventPublisher events) {
        this(controlClient, connIndex, events, null);
    }

    public EsConnStore(java.util.function.Supplier<RestHighLevelClient> controlClient, String connIndex,
                       org.springframework.context.ApplicationEventPublisher events, ConnCrypto crypto) {
        this.controlClient = controlClient;
        this.connIndex = connIndex;
        this.events = events;
        this.crypto = crypto;
    }

    /** 全部连接（脱敏视图：不含密码明文，只给 hasPassword 布尔）。 */
    @Override
    public List<Map<String, Object>> list() {
        try {
            Request req = new Request("POST", "/" + connIndex + "/_search");
            req.setJsonEntity("{\"size\":200,\"query\":{\"match_all\":{}}}");
            Response resp = controlClient.get().getLowLevelClient().performRequest(req);
            @SuppressWarnings("unchecked")
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            List<Map<String, Object>> out = new ArrayList<>();
            @SuppressWarnings("unchecked")
            Map<String, Object> hitsWrap = (Map<String, Object>) raw.get("hits");
            if (hitsWrap != null) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> hits = (List<Map<String, Object>>) hitsWrap.get("hits");
                if (hits != null) {
                    for (Map<String, Object> h : hits) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> src = (Map<String, Object>) h.get("_source");
                        if (src != null) {
                            if (STATE_DISMISSED.equalsIgnoreCase(str(src.get("syncState")))) {
                                continue; // 软删墓碑:读面不透出(列表/探活/监控同源自动隐身)
                            }
                            out.add(masked(String.valueOf(h.get("_id")), src));
                        }
                    }
                }
            }
            out.sort((a, b) -> String.valueOf(a.get("name")).compareTo(String.valueOf(b.get("name"))));
            return out;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return new ArrayList<>(); // 索引未建：从未保存过连接
            }
            throw new IllegalStateException("读取集群连接失败: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IllegalStateException("读取集群连接失败: " + e.getMessage(), e);
        }
    }

    /** 按 id 取完整连接（含密码，仅服务端内部使用）；不存在或已软删（墓碑）返回 null。 */
    @Override
    public RemoteClusterConn get(String id) {
        Map<String, Object> src = getSource(id);
        if (src == null || STATE_DISMISSED.equalsIgnoreCase(str(src.get("syncState")))) {
            return null;
        }
        RemoteClusterConn conn = new RemoteClusterConn(
                str(src.get("scheme")), str(src.get("host")),
                src.get("port") instanceof Number ? ((Number) src.get("port")).intValue() : 9200,
                str(src.get("username")), decryptPwd(str(src.get("password"))));
        conn.setMinRole(str(src.get("minRole")));
        conn.setEnv(str(src.get("env")));
        conn.setAuthType(str(src.get("authType")));
        conn.setConnectTimeoutMs(intOrNull(src.get("connectTimeoutMs")));
        conn.setSocketTimeoutMs(intOrNull(src.get("socketTimeoutMs")));
        return conn;
    }

    /** 连接显示名（不存在返回 null）。 */
    @Override
    public String getName(String id) {
        Map<String, Object> src = getSource(id);
        return src == null ? null : str(src.get("name"));
    }

    /** 存储形态密码 → 明文（null crypto=旁路；无前缀=存量明文直通；密文解密失败显性异常）。 */
    private String decryptPwd(String stored) {
        return crypto == null ? stored : crypto.decrypt(stored);
    }

    /** 档案里的服务端版本（探活回写）；未探到/不存在返回 null，调用方按 7.x 默认。 */
    @Override
    public String getVersion(String id) {
        Map<String, Object> src = getSource(id);
        return src == null ? null : str(src.get("esVersion"));
    }

    /**
     * 保存连接（新建或覆盖）。
     *
     * @param id               为空则生成短 id
     * @param name             显示名（必填）
     * @param url              连接串 {@code http(s)://[user:pass@]host[:port]}（必填）
     * @param username         独立传的用户名（优先于 url 内嵌）
     * @param password         独立传的密码；<b>编辑时留空 = 保留旧密码</b>
     * @param minRole          访问本连接的最低角色（；空 = VIEWER
     * @param connectTimeoutMs 独立连接超时（；null = 用全局默认
     * @param socketTimeoutMs  独立读超时（；null = 用全局默认
     * @param env              环境标识（PROD/STAGING/QA/DEV；空 = 未标注。纯展示字段，
     *                         前端据此给切换器/顶栏着色警示（生产红色）；不影响连接指纹与长连接重建
     * @return 脱敏视图
     */
    @Override
    public Map<String, Object> save(String id, String name, String url, String username, String password,
                                    String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs, String env) {
        return doSave(id, name, url, username, password, minRole, connectTimeoutMs, socketTimeoutMs, env, null);
    }

    /** 10 参扩展形态（API Key 认证支持）：authType="API_KEY" 时 password 位承载 ApiKey 秘钥。 */
    @Override
    public Map<String, Object> save(String id, String name, String url, String username, String secret,
                                    String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs,
                                    String env, String authType) {
        return doSave(id, name, url, username, secret, minRole, connectTimeoutMs, socketTimeoutMs, env, authType);
    }

    private Map<String, Object> doSave(String id, String name, String url, String username, String password,
                                       String minRole, Integer connectTimeoutMs, Integer socketTimeoutMs,
                                       String env, String authType) {
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("连接名称不可为空");
        }
        if (env != null && !env.trim().isEmpty()
                && !"PROD".equalsIgnoreCase(env.trim())
                && !"STAGING".equalsIgnoreCase(env.trim())
                && !"QA".equalsIgnoreCase(env.trim())
                && !"DEV".equalsIgnoreCase(env.trim())) {
            throw new IllegalArgumentException("env 仅支持 PROD/STAGING/QA/DEV，实际: " + env);
        }
        if (minRole != null && !minRole.trim().isEmpty()
                && !"VIEWER".equalsIgnoreCase(minRole.trim())
                && !"OPERATOR".equalsIgnoreCase(minRole.trim())
                && !"ADMIN".equalsIgnoreCase(minRole.trim())) {
            throw new IllegalArgumentException("minRole 仅支持 VIEWER/OPERATOR/ADMIN，实际: " + minRole);
        }
        if (connectTimeoutMs != null && (connectTimeoutMs < 100 || connectTimeoutMs > 600_000)) {
            throw new IllegalArgumentException("connectTimeoutMs 需在 100~600000 毫秒之间");
        }
        if (socketTimeoutMs != null && (socketTimeoutMs < 100 || socketTimeoutMs > 3_600_000)) {
            throw new IllegalArgumentException("socketTimeoutMs 需在 100~3600000 毫秒之间");
        }
        if (authType != null && !authType.trim().isEmpty()
                && !"BASIC".equalsIgnoreCase(authType.trim())
                && !"API_KEY".equalsIgnoreCase(authType.trim())) {
            throw new IllegalArgumentException("authType 仅支持 BASIC/API_KEY，实际: " + authType);
        }
        RemoteClusterConn parsed = RemoteClusterConn.parse(url);
        if (username != null && !username.trim().isEmpty()) {
            parsed.setUsername(username.trim());
        }
        if (password != null && !password.isEmpty()) {
            parsed.setPassword(password);
        }
        parsed.validate();

        String docId = (id == null || id.trim().isEmpty())
                ? UUID.randomUUID().toString().replace("-", "").substring(0, 8)
                : id.trim();
        Map<String, Object> old = getSource(docId);
        long now = System.currentTimeMillis();

        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("name", name.trim());
        doc.put("scheme", parsed.getScheme());
        doc.put("host", parsed.getHost());
        doc.put("port", parsed.getPort());
        doc.put("username", parsed.getUsername());
        // 密码留空且已有旧档案 → 沿用旧密码（编辑连接不必重输密码）。
        // 旧档密码是「存储形态」（密文或存量明文）——原样沿用，绝不能把密文再加密一次；
        // 只有本次新提供的密码才走加密（存量明文经再次编辑自动升级为密文）。
        String pwStored;
        if ((parsed.getPassword() == null || parsed.getPassword().isEmpty()) && old != null) {
            pwStored = str(old.get("password"));
        } else {
            pwStored = crypto == null ? parsed.getPassword() : crypto.encrypt(parsed.getPassword());
        }
        doc.put("password", pwStored);
        // minRole 空串视为未设置（= VIEWER），统一存大写档位便于前端直显
        doc.put("minRole", minRole == null || minRole.trim().isEmpty() ? null : minRole.trim().toUpperCase(Locale.ROOT));
        doc.put("connectTimeoutMs", connectTimeoutMs);
        doc.put("socketTimeoutMs", socketTimeoutMs);
        // 环境标识空串视为未标注，统一存大写便于前端直显着色
        doc.put("env", env == null || env.trim().isEmpty() ? null : env.trim().toUpperCase(Locale.ROOT));
        // 连接中心自动同步批·API Key 认证：authType 空缺归一 BASIC；API_KEY 时 password 位承载 ApiKey
        doc.put("authType", authType == null || authType.trim().isEmpty()
                ? "BASIC" : authType.trim().toUpperCase(java.util.Locale.ROOT));
        // esVersion 由探活/测试连接回写，保存档案时沿用旧值（endpoint 变更后首轮探活自动刷新）
        doc.put("esVersion", old != null ? old.get("esVersion") : null);
        // 连接中心同步域:保存沿用旧 syncState(手工编辑失联档案不清标记;引擎轮内显式恢复)
        doc.put("syncState", old != null ? old.get("syncState") : null);
        doc.put("createdAt", old != null && old.get("createdAt") != null ? old.get("createdAt") : now);
        doc.put("updatedAt", now);
        try {
            Request req = new Request("PUT", "/" + connIndex + "/_doc/" + docId + "?refresh=true");
            req.setJsonEntity(MAPPER.writeValueAsString(doc));
            controlClient.get().getLowLevelClient().performRequest(req);
            LOG.info("[EsConnStore] save conn id={} name={} endpoint={}://{}:{}",
                    docId, name.trim(), parsed.getScheme(), parsed.getHost(), parsed.getPort());
            if (events != null) {
                events.publishEvent(new LinkLifecycleEvent(LinkLifecycleEvent.Type.SAVED,
                        docId, name.trim(), doc.get("env") == null ? null : String.valueOf(doc.get("env"))));
            }
            return masked(docId, doc);
        } catch (IOException e) {
            throw new IllegalStateException("保存集群连接失败: " + e.getMessage(), e);
        }
    }

    /**
     * 回写服务端版本号（探活/测试连接成功后调）。与旧值相同则跳过；
     * 失败只记 debug——版本是增强信息，绝不影响探活主流程。
     * 注：用整篇 PUT _doc 而非 _update 端点——后者 6.x/7.x 路径形态不同，控制集群自身也要版本无关。
     */
    @Override
    public void updateVersion(String id, String esVersion) {
        if (id == null || id.trim().isEmpty() || esVersion == null || esVersion.trim().isEmpty()) {
            return;
        }
        try {
            Map<String, Object> src = getSource(id.trim());
            if (src == null || esVersion.trim().equals(str(src.get("esVersion")))) {
                return;
            }
            src.put("esVersion", esVersion.trim());
            Request req = new Request("PUT", "/" + connIndex + "/_doc/" + id.trim() + "?refresh=true");
            req.setJsonEntity(MAPPER.writeValueAsString(src));
            controlClient.get().getLowLevelClient().performRequest(req);
            LOG.info("[EsConnStore] conn id={} esVersion -> {}", id.trim(), esVersion.trim());
        } catch (Exception e) {
            /* debug→WARN——「探活到新版本但 ES 档案写不进」的低频真异常无痕
               则版本不刷新无从排查；只修了 JdbcConnStore 同名方法漏了 ES 店，补齐
               同一句式。吞异常契约不变（版本是增强信息，绝不影响探活主流程） */
            LOG.warn("[EsConnStore] updateVersion failed id={}: {}", id, e.getMessage(), e);
        }
    }

    /**
     * 连接中心同步域状态标记:STALE=源已失联 / DISMISSED=人工软删墓碑(经 {@link #markDismissed}
     * 落库)/ null=恢复(删除键)。用整篇 PUT _doc 而非 _update 端点——6.x/7.x 路径形态不同
     * (updateVersion 同款裁决);失败 WARN 不抛(标记是增强信息,绝不反噬同步主流程)。
     */
    @Override
    public void markSyncState(String id, String state) {
        if (id == null || id.trim().isEmpty()) {
            return;
        }
        try {
            Map<String, Object> src = getSource(id.trim());
            if (src == null) {
                return;
            }
            if (state == null || state.trim().isEmpty()) {
                src.remove("syncState");
            } else {
                src.put("syncState", state.trim().toUpperCase(java.util.Locale.ROOT));
            }
            Request req = new Request("PUT", "/" + connIndex + "/_doc/" + id.trim() + "?refresh=true");
            req.setJsonEntity(MAPPER.writeValueAsString(src));
            controlClient.get().getLowLevelClient().performRequest(req);
        } catch (Exception e) {
            LOG.warn("[EsConnStore] markSyncState failed id={}: {}", id, e.getMessage(), e);
        }
    }

    /** 同步档案软删除:syncState 置 DISMISSED(墓碑保留,契约见 ConnStore);复用 markSyncState 写路径。 */
    @Override
    public void markDismissed(String id) {
        markSyncState(id, STATE_DISMISSED);
    }

    /** 读单条档案的同步域状态标记(STALE/DISMISSED);无标记或档案不存在返回 null。 */
    @Override
    public String getSyncState(String id) {
        Map<String, Object> src = getSource(id);
        return src == null ? null : str(src.get("syncState"));
    }

    /** 删除连接（幂等）。 */
    @Override
    public void delete(String id) {
        try {
            controlClient.get().getLowLevelClient().performRequest(
                    new Request("DELETE", "/" + connIndex + "/_doc/" + id + "?refresh=true"));
            LOG.info("[EsConnStore] delete conn id={}", id);
            if (events != null) {
                events.publishEvent(new LinkLifecycleEvent(LinkLifecycleEvent.Type.DELETED, id, null, null));
            }
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() != 404) {
                throw new IllegalStateException("删除集群连接失败: " + e.getMessage(), e);
            }
        } catch (IOException e) {
            throw new IllegalStateException("删除集群连接失败: " + e.getMessage(), e);
        }
    }

    private Map<String, Object> getSource(String id) {
        if (id == null || id.trim().isEmpty()) {
            return null;
        }
        try {
            Response resp = controlClient.get().getLowLevelClient().performRequest(
                    new Request("GET", "/" + connIndex + "/_doc/" + id));
            @SuppressWarnings("unchecked")
            Map<String, Object> raw = MAPPER.readValue(
                    org.apache.http.util.EntityUtils.toString(resp.getEntity()), Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> src = (Map<String, Object>) raw.get("_source");
            return src;
        } catch (ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return null;
            }
            throw new IllegalStateException("读取集群连接失败: " + e.getMessage(), e);
        } catch (IOException e) {
            throw new IllegalStateException("读取集群连接失败: " + e.getMessage(), e);
        }
    }

    private static Map<String, Object> masked(String id, Map<String, Object> src) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("id", id);
        v.put("name", src.get("name"));
        v.put("scheme", src.get("scheme"));
        v.put("host", src.get("host"));
        v.put("port", src.get("port"));
        v.put("username", src.get("username"));
        String pw = str(src.get("password"));
        v.put("hasPassword", pw != null && !pw.isEmpty());
        // minRole/超时非敏感，脱敏视图直接透出供列表展示与编辑回填
        v.put("minRole", src.get("minRole") == null ? "VIEWER" : src.get("minRole"));
        // 服务端版本（探活回写），前端版本徽章 + 数据面能力门禁的数据源
        v.put("esVersion", src.get("esVersion"));
        // 环境标识（纯展示），切换器/顶栏着色警示的数据源
        v.put("env", src.get("env"));
        // 连接中心自动同步批：认证形态 BASIC/API_KEY（前端表单切换与探活链路凭据注入依据）
        v.put("authType", src.get("authType"));
        v.put("connectTimeoutMs", src.get("connectTimeoutMs"));
        v.put("socketTimeoutMs", src.get("socketTimeoutMs"));
        v.put("createdAt", src.get("createdAt"));
        v.put("updatedAt", src.get("updatedAt"));
        v.put("syncState", src.get("syncState"));
        return v;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Integer intOrNull(Object o) {
        return o instanceof Number ? ((Number) o).intValue() : null;
    }
}
