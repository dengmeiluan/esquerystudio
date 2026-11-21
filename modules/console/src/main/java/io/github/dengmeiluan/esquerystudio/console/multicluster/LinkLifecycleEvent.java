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

/**
 * 连接生命周期事件():连接档案创建/删除后由 {@link ConnStore} 实现发布,
 * 宿主(如 宿主的连接菜单供给器)监听后同步自家 RBAC 菜单——新增连接自动注册
 * 菜单目录、删除连接级联移除,控制台不再维护第二份授权配置。
 *
 * <p>契约:事件为通知性质(监听方失败不影响连接保存本身);不含密码等敏感字段。</p>
 *
 * @author aicoding
 */
public class LinkLifecycleEvent {

    public enum Type { SAVED, DELETED }

    private final Type type;
    private final String connId;
    private final String name;
    /** 环境标识 PROD/STAGING/QA/DEV(可为空)——宿主按环境差异化授权策略(QA/UAT 全授、生产读写分授)。 */
    private final String env;

    public LinkLifecycleEvent(Type type, String connId, String name, String env) {
        this.type = type;
        this.connId = connId;
        this.name = name;
        this.env = env;
    }

    public Type getType() { return type; }
    public String getConnId() { return connId; }
    public String getName() { return name; }
    public String getEnv() { return env; }

    @Override
    public String toString() {
        return "LinkLifecycleEvent{" + type + ", connId=" + connId + ", name=" + name + ", env=" + env + '}';
    }
}
