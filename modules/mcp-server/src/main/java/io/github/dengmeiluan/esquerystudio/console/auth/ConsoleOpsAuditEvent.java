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

package io.github.dengmeiluan.esquerystudio.console.auth;

/**
 * 控制台操作审计——审计记录唯一类型（不留余地的类型化改造）：
 * 写入路径（record）与查询路径（search 出参）同构，旧「ES 响应 Map 形态即 SPI 契约」的
 * 泄漏在清除——存储实现不再把 {@code hits.hits[]._source} 包装当返回值，线缆形态
 * 由 {@code ConsoleAuthController} 单点组装为 {@code records:[...]}。
 *
 * <p><b>维度全集</b>（20260921 产线权限审计定案的四缺口全补）：</p>
 * <ul>
 *   <li>身份：{@code username/displayName/role}</li>
 *   <li>动作：{@code method/uri/action/httpStatus/detail}</li>
 *   <li>所属集群：{@code connId/connName}（X-Es-Target 与连接实名）——PAGE_DENIED 与
 *       高危 raw 从此可答「发生在哪个集群」</li>
 *   <li>来源与耗时：{@code ip}（XFF 首跳→X-Real-IP→remoteAddr）、{@code costMs}</li>
 *   <li>归属：{@code source}（console=控制台自管档 / host=宿主贡献者并入），
 *       查询侧必非空，写入侧可空（存储 stamp 为 console）</li>
 *   <li>时序：{@code timestamp}（写入侧由存储 stamp；查询侧为落档时刻）</li>
 * </ul>
 *
 * <p>不可变；写入路径允许 null 字段（落档静默省略），查询路径字段按档位实况回填。</p>
 *
 * @author aicoding
 */
public final class ConsoleOpsAuditEvent {

    private final String username;
    private final String displayName;
    private final String role;
    private final String method;
    private final String uri;
    private final String action;
    private final int httpStatus;
    private final String detail;
    private final String connId;
    private final String connName;
    private final String ip;
    private final Long costMs;
    private final String source;
    private final Long timestamp;

    private ConsoleOpsAuditEvent(Builder b) {
        this.username = b.username;
        this.displayName = b.displayName;
        this.role = b.role;
        this.method = b.method;
        this.uri = b.uri;
        this.action = b.action;
        this.httpStatus = b.httpStatus;
        this.detail = b.detail;
        this.connId = b.connId;
        this.connName = b.connName;
        this.ip = b.ip;
        this.costMs = b.costMs;
        this.source = b.source;
        this.timestamp = b.timestamp;
    }

    public static Builder builder() {
        return new Builder();
    }

    public String getUsername() { return username; }
    public String getDisplayName() { return displayName; }
    public String getRole() { return role; }
    public String getMethod() { return method; }
    public String getUri() { return uri; }
    public String getAction() { return action; }
    public int getHttpStatus() { return httpStatus; }
    public String getDetail() { return detail; }
    public String getConnId() { return connId; }
    public String getConnName() { return connName; }
    public String getIp() { return ip; }
    public Long getCostMs() { return costMs; }
    public String getSource() { return source; }
    public Long getTimestamp() { return timestamp; }

    /** 审计记录构造器；connId/connName/ip/source 自动空串归 null。 */
    public static final class Builder {
        private String username;
        private String displayName;
        private String role;
        private String method;
        private String uri;
        private String action;
        private int httpStatus;
        private String detail;
        private String connId;
        private String connName;
        private String ip;
        private Long costMs;
        private String source;
        private Long timestamp;

        public Builder username(String v) { this.username = v; return this; }
        public Builder displayName(String v) { this.displayName = v; return this; }
        public Builder role(String v) { this.role = v; return this; }
        public Builder method(String v) { this.method = v; return this; }
        public Builder uri(String v) { this.uri = v; return this; }
        public Builder action(String v) { this.action = v; return this; }
        public Builder httpStatus(int v) { this.httpStatus = v; return this; }
        public Builder detail(String v) { this.detail = v; return this; }
        public Builder connId(String v) { this.connId = emptyToNull(v); return this; }
        public Builder connName(String v) { this.connName = emptyToNull(v); return this; }
        public Builder ip(String v) { this.ip = emptyToNull(v); return this; }
        public Builder costMs(Long v) { this.costMs = v; return this; }
        public Builder source(String v) { this.source = emptyToNull(v); return this; }
        public Builder timestamp(Long v) { this.timestamp = v; return this; }

        public ConsoleOpsAuditEvent build() {
            return new ConsoleOpsAuditEvent(this);
        }

        private static String emptyToNull(String v) {
            return v == null || v.trim().isEmpty() ? null : v.trim();
        }
    }
}
