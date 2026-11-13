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
 * 控制台操作审计——结构化查询对象（20260922 快筛批）：快筛维度的 SPI 载体，
 * 与 {@link ConsoleOpsAuditEvent} 落档维度一一对应，全部过滤语义下推存储档
 * （ES 档=bool.filter 的 term/range/prefix/wildcard；JDBC 档维持基线三过滤，
 * 统一只用 ES 单载体约定后新筛选能力仅在 ES 档承诺）。
 *
 * <p><b>契约</b>：null/空串维度 = 不过滤；{@code size} 实现侧钳制 ≤500；
 * {@code fromMs/toMs} 为毫秒 epoch 闭区间；{@code kw} 对 detail 做包含匹配
 * （ES wildcard 形态，{@code * ?} 为通配元字符，内部工具不过度转义）。</p>
 *
 * <p>老签名 {@link ConsoleOpsAuditStore#search(String, String, int, int, Long)}
 * 仍是抽象入口（宿主自定义实现零破坏），本对象经 default 桥接进入：
 * 未升级实现自动退化为基线三过滤（username/action/fromMs），扩维静默忽略。</p>
 *
 * @author aicoding
 */
public final class ConsoleOpsAuditQuery {

    private final String username;
    private final String action;
    private final Long fromMs;
    private final Long toMs;
    private final String connId;
    private final String connName;
    private final String role;
    private final String method;
    private final Integer httpStatus;
    private final String source;
    private final String ip;
    private final Long minCostMs;
    private final String uriPrefix;
    private final String kw;
    private final int size;
    private final int from;

    private ConsoleOpsAuditQuery(Builder b) {
        this.username = b.username;
        this.action = b.action;
        this.fromMs = b.fromMs;
        this.toMs = b.toMs;
        this.connId = b.connId;
        this.connName = b.connName;
        this.role = b.role;
        this.method = b.method;
        this.httpStatus = b.httpStatus;
        this.source = b.source;
        this.ip = b.ip;
        this.minCostMs = b.minCostMs;
        this.uriPrefix = b.uriPrefix;
        this.kw = b.kw;
        this.size = b.size;
        this.from = b.from;
    }

    /** 基线三过滤工厂：旧 5 参签名语义的等价查询对象（sinceMs → fromMs）。 */
    public static ConsoleOpsAuditQuery legacy(String username, String action, int size, int from, Long sinceMs) {
        return builder().username(username).action(action).fromMs(sinceMs).size(size).from(from).build();
    }

    public static Builder builder() {
        return new Builder();
    }

    public String getUsername() { return username; }
    public String getAction() { return action; }
    public Long getFromMs() { return fromMs; }
    public Long getToMs() { return toMs; }
    public String getConnId() { return connId; }
    public String getConnName() { return connName; }
    public String getRole() { return role; }
    public String getMethod() { return method; }
    public Integer getHttpStatus() { return httpStatus; }
    public String getSource() { return source; }
    public String getIp() { return ip; }
    public Long getMinCostMs() { return minCostMs; }
    public String getUriPrefix() { return uriPrefix; }
    public String getKw() { return kw; }
    public int getSize() { return size; }
    public int getFrom() { return from; }

    /** 查询构造器；字符串维度自动空串归 null（null=不过滤）。 */
    public static final class Builder {
        private String username;
        private String action;
        private Long fromMs;
        private Long toMs;
        private String connId;
        private String connName;
        private String role;
        private String method;
        private Integer httpStatus;
        private String source;
        private String ip;
        private Long minCostMs;
        private String uriPrefix;
        private String kw;
        private int size = 100;
        private int from;

        public Builder username(String v) { this.username = emptyToNull(v); return this; }
        public Builder action(String v) { this.action = emptyToNull(v); return this; }
        public Builder fromMs(Long v) { this.fromMs = v; return this; }
        public Builder toMs(Long v) { this.toMs = v; return this; }
        public Builder connId(String v) { this.connId = emptyToNull(v); return this; }
        public Builder connName(String v) { this.connName = emptyToNull(v); return this; }
        public Builder role(String v) { this.role = emptyToNull(v); return this; }
        public Builder method(String v) { this.method = emptyToNull(v); return this; }
        public Builder httpStatus(Integer v) { this.httpStatus = v; return this; }
        public Builder source(String v) { this.source = emptyToNull(v); return this; }
        public Builder ip(String v) { this.ip = emptyToNull(v); return this; }
        public Builder minCostMs(Long v) { this.minCostMs = v; return this; }
        public Builder uriPrefix(String v) { this.uriPrefix = emptyToNull(v); return this; }
        public Builder kw(String v) { this.kw = emptyToNull(v); return this; }
        public Builder size(int v) { this.size = v; return this; }
        public Builder from(int v) { this.from = v; return this; }

        public ConsoleOpsAuditQuery build() {
            return new ConsoleOpsAuditQuery(this);
        }

        private static String emptyToNull(String v) {
            return v == null || v.trim().isEmpty() ? null : v.trim();
        }
    }
}
