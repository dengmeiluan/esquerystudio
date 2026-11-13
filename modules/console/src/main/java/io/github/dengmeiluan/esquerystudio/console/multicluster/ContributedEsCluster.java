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

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * {@link ClusterConnContributor} 单条贡献载体(builder,连接中心自动同步批):连接中心一条
 * ES 连接的可同步视图。<b>密码红线</b>:{@code password} 明文仅服务端内存流转
 * (契约同 {@link ConnStore}),绝不打日志、不入报告、不进异常 message。
 *
 * @author aicoding
 */
public final class ContributedEsCluster {

    private final String sourceId;   // 源系统稳定唯一键(如 infra connectionId),幂等锚点
    private final String name;       // 显示名
    private final String url;        // http(s)://host[:port] 单节点形态(多节点取首节点)
    private final String username;   // 可空(无认证集群合法)
    private final String password;   // 可空;明文仅内存流转
    private final String rawEnv;     // 连接中心原始环境值(dev/qa/uat/prod…),可空,映射在引擎侧
    private final String minRole;    // 可空 → 引擎用配置默认
    private final List<String> allUris; // 节点全集(去重判定与报告用),可空
    private final String skipReason;    // 非空=宿主声明不可同步(如仅 apiKey),引擎跳过并计入报告
    private final String authType;      // BASIC(默认,账密)/API_KEY(password 位承载 ApiKey),可空

    private ContributedEsCluster(Builder b) {
        this.sourceId = b.sourceId;
        this.name = b.name;
        this.url = b.url;
        this.username = b.username;
        this.password = b.password;
        this.rawEnv = b.rawEnv;
        this.minRole = b.minRole;
        this.allUris = b.allUris == null ? null : Collections.unmodifiableList(new ArrayList<>(b.allUris));
        this.skipReason = b.skipReason;
        this.authType = b.authType;
    }

    public static Builder builder() {
        return new Builder();
    }

    public String getSourceId() { return sourceId; }
    public String getName() { return name; }
    public String getUrl() { return url; }
    public String getUsername() { return username; }
    public String getPassword() { return password; }
    public String getRawEnv() { return rawEnv; }
    public String getMinRole() { return minRole; }
    public List<String> getAllUris() { return allUris; }
    public String getSkipReason() { return skipReason; }
    public String getAuthType() { return authType; }

    /** toString 脱敏:密码不出场(红线)。 */
    @Override
    public String toString() {
        return "ContributedEsCluster{" + sourceId + ", " + name + ", " + url
                + ", env=" + rawEnv + (skipReason == null ? "" : ", skip=" + skipReason) + "}";
    }

    public static final class Builder {
        private String sourceId;
        private String name;
        private String url;
        private String username;
        private String password;
        private String rawEnv;
        private String minRole;
        private List<String> allUris;
        private String skipReason;
        private String authType;

        public Builder sourceId(String v) { this.sourceId = v; return this; }
        public Builder name(String v) { this.name = v; return this; }
        public Builder url(String v) { this.url = v; return this; }
        public Builder username(String v) { this.username = v; return this; }
        public Builder password(String v) { this.password = v; return this; }
        public Builder rawEnv(String v) { this.rawEnv = v; return this; }
        public Builder minRole(String v) { this.minRole = v; return this; }
        public Builder allUris(List<String> v) { this.allUris = v; return this; }
        public Builder skipReason(String v) { this.skipReason = v; return this; }
        public Builder authType(String v) { this.authType = v; return this; }

        public ContributedEsCluster build() {
            return new ContributedEsCluster(this);
        }
    }
}
