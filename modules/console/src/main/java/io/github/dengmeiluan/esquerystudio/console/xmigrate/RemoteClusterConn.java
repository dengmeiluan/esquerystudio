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

import java.util.Locale;
import java.util.Objects;

/**
 * 旧集群连接信息（值对象）。
 *
 * <p><b>安全约束</b>：本对象承载密码，<b>仅在内存流转</b>——只驻留于单次请求 body 与
 * {@link RunningMigrations} 的运行态句柄；<b>绝不持久化到 {@link MigrateJobES}、不打日志、不入异常 message</b>。
 * {@link #toString()} 对密码脱敏，可安全打印。</p>
 */
public final class RemoteClusterConn {

    private String scheme = "http";
    private String host;
    private int port = 9200;
    private String username;
    private String password;

    /**
     * 可选：按<b>环境变量 / 配置属性名</b>引用，由服务端从自身运行环境（OS env + 已加载 nacos 共享配置 + 应用属性）
     * 解析出真实值。适用于"只知道变量名、填不出实际值（尤其密码）"的场景。非空时优先于对应字面值。
     * 也可直接在 {@link #host}/{@link #username}/{@link #password} 字面里写 {@code ${NAME}} 表达式。
     */
    private String hostRef;
    private String portRef;
    private String userRef;
    private String passwordRef;

    /**
     *  连接档案字段：访问本连接所需的最低控制台角色（VIEWER/OPERATOR/ADMIN），
     * 空 = VIEWER（全员可见可用）；独立超时为 null 时回退 starter 全局 migrate 超时。
     * 三者<b>纳入 equals/hashCode</b>——{@link io.github.dengmeiluan.esquerystudio.console.multicluster.EsClientRouter}
     * 依赖档案指纹变化触发长连接重建（超时变更必须重建 client 才生效）。
     */
    private String minRole;
    /** 环境标识 PROD/STAGING/QA/DEV（连接级权限封顶 env-role-cap 的解析输入）。 */
    private String env;
    /**
     * 连接中心自动同步批·API Key 认证：认证形态 BASIC（默认，账密）/ API_KEY
     * （password 位承载 ApiKey 秘钥，客户端以 Authorization: ApiKey 头建连）。
     * 纳入 equals/hashCode——认证方式变化必须触发路由长连接重建（同 minRole/超时语义）。
     */
    private String authType;
    private Integer connectTimeoutMs;
    private Integer socketTimeoutMs;

    public RemoteClusterConn() {
    }

    public RemoteClusterConn(String scheme, String host, int port, String username, String password) {
        if (scheme != null && !scheme.isEmpty()) {
            this.scheme = scheme;
        }
        this.host = host;
        this.port = port;
        this.username = username;
        this.password = password;
    }

    /**
     * 解析一次性粘贴形态 {@code http(s)://user:pass@host:port}（user:pass 与 port 可缺省）。
     *
     * @throws IllegalArgumentException 形态非法（无 host）
     */
    public static RemoteClusterConn parse(String url) {
        if (url == null || url.trim().isEmpty()) {
            throw new IllegalArgumentException("远端连接串为空");
        }
        String s = url.trim();
        String scheme = "http";
        int schemeIdx = s.indexOf("://");
        if (schemeIdx > 0) {
            scheme = s.substring(0, schemeIdx);
            s = s.substring(schemeIdx + 3);
        }
        String username = null;
        String password = null;
        int at = s.lastIndexOf('@');
        if (at >= 0) {
            String cred = s.substring(0, at);
            s = s.substring(at + 1);
            int colon = cred.indexOf(':');
            if (colon >= 0) {
                username = cred.substring(0, colon);
                password = cred.substring(colon + 1);
            } else {
                username = cred;
            }
        }
        String host;
        int port = 9200;
        int colon = s.indexOf(':');
        if (colon >= 0) {
            host = s.substring(0, colon);
            String portStr = s.substring(colon + 1);
            int slash = portStr.indexOf('/');
            if (slash >= 0) {
                portStr = portStr.substring(0, slash);
            }
            try {
                port = Integer.parseInt(portStr.trim());
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("端口非法: " + portStr);
            }
        } else {
            int slash = s.indexOf('/');
            host = slash >= 0 ? s.substring(0, slash) : s;
        }
        if (host == null || host.trim().isEmpty()) {
            throw new IllegalArgumentException("无法解析 host: " + url);
        }
        return new RemoteClusterConn(scheme, host.trim(), port, username, password);
    }

    /** 校验最小可连接性字段，非法即抛。 */
    public void validate() {
        if (host == null || host.trim().isEmpty()) {
            throw new IllegalArgumentException("旧集群 host 不可为空");
        }
        if (port <= 0 || port > 65535) {
            throw new IllegalArgumentException("旧集群 port 非法: " + port);
        }
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
            throw new IllegalArgumentException("scheme 仅支持 http/https，实际: " + scheme);
        }
        /* 服务端代连的 SSRF 底线：云元数据/链路本地地址永远不是合法 ES 集群。
           未绑定控制台时 setup/test 是免鉴权入口，不能把主机变成元数据代理。 */
        String h = host.trim().toLowerCase(Locale.ROOT);
        if (h.startsWith("169.254.") || "metadata.google.internal".equals(h)
                || "metadata".equals(h) || "100.100.100.200".equals(h)
                || "fd00:ec2::254".equals(h)) {
            throw new IllegalArgumentException("不允许连接云元数据/链路本地地址: " + host);
        }
        /* 十进制/别名等变体交给解析后判定；只拒绝 link-local/any-local，本机回环仍允许
           （单机部署连 localhost ES 是合法主路径）。解析失败不在这里改写错误形态。 */
        try {
            java.net.InetAddress addr = java.net.InetAddress.getByName(h);
            if (addr.isLinkLocalAddress() || addr.isAnyLocalAddress()) {
                throw new IllegalArgumentException("不允许连接云元数据/链路本地地址: " + host);
            }
        } catch (java.net.UnknownHostException ignore) {
            /* DNS 失败由 REST client 原始报错呈现 */
        }
    }

    public boolean hasCredentials() {
        return username != null && !username.isEmpty();
    }

    public String getScheme() { return scheme; }
    public void setScheme(String scheme) { this.scheme = scheme; }
    public String getHost() { return host; }
    public void setHost(String host) { this.host = host; }
    public int getPort() { return port; }
    public void setPort(int port) { this.port = port; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getHostRef() { return hostRef; }
    public void setHostRef(String hostRef) { this.hostRef = hostRef; }
    public String getPortRef() { return portRef; }
    public void setPortRef(String portRef) { this.portRef = portRef; }
    public String getUserRef() { return userRef; }
    public void setUserRef(String userRef) { this.userRef = userRef; }
    public String getPasswordRef() { return passwordRef; }
    public void setPasswordRef(String passwordRef) { this.passwordRef = passwordRef; }

    public String getAuthType() { return authType; }
    public void setAuthType(String authType) { this.authType = authType; }
    /** API Key 形态：secret 走 Authorization: ApiKey 头而非 basic 账密。 */
    public boolean isApiKeyAuth() {
        return authType != null && "API_KEY".equalsIgnoreCase(authType.trim());
    }

    public String getMinRole() { return minRole; }

    public String getEnv() { return env; }

    public void setEnv(String env) { this.env = env; }
    public void setMinRole(String minRole) { this.minRole = minRole; }
    public Integer getConnectTimeoutMs() { return connectTimeoutMs; }
    public void setConnectTimeoutMs(Integer connectTimeoutMs) { this.connectTimeoutMs = connectTimeoutMs; }
    public Integer getSocketTimeoutMs() { return socketTimeoutMs; }
    public void setSocketTimeoutMs(Integer socketTimeoutMs) { this.socketTimeoutMs = socketTimeoutMs; }

    /** 脱敏 endpoint（不含凭据），可安全打日志。 */
    public String endpoint() {
        return scheme + "://" + host + ":" + port;
    }

    @Override
    public String toString() {
        // 密码脱敏；用户名保留以便排障（用户名通常非敏感）
        return "RemoteClusterConn{" + scheme + "://"
                + (hasCredentials() ? username + ":***@" : "") + host + ":" + port + "}";
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof RemoteClusterConn)) return false;
        RemoteClusterConn that = (RemoteClusterConn) o;
        return port == that.port
                && Objects.equals(scheme, that.scheme)
                && Objects.equals(host, that.host)
                && Objects.equals(username, that.username)
                && Objects.equals(password, that.password)
                && Objects.equals(minRole, that.minRole)
                && Objects.equals(connectTimeoutMs, that.connectTimeoutMs)
                && Objects.equals(socketTimeoutMs, that.socketTimeoutMs)
                && Objects.equals(authType, that.authType);
    }

    @Override
    public int hashCode() {
        return Objects.hash(scheme, host, port, username, password, minRole, connectTimeoutMs, socketTimeoutMs, authType);
    }
}
