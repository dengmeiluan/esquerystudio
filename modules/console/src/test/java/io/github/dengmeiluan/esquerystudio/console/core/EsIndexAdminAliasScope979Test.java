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

package io.github.dengmeiluan.esquerystudio.console.core;

import org.junit.Test;

import static org.junit.Assert.fail;

/** config-validator 页只借 alias-actions 完成建索引后的 add 挂载，不能删除别名。 */
public class EsIndexAdminAliasScope979Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private static void rejected(Runnable r, String why) {
        try {
            r.run();
            fail("应拒绝：" + why);
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    @Test
    public void addOnly允许单条add() {
        admin.guardAliasActionsBody(
                "{\"actions\":[{\"add\":{\"index\":\"logs-2026\",\"alias\":\"logs\"}}]}", true);
    }

    @Test
    public void addOnly拒绝remove与remove_index() {
        rejected(() -> admin.guardAliasActionsBody(
                "{\"actions\":[{\"remove\":{\"index\":\"logs-2026\",\"alias\":\"logs\"}}]}", true), "remove");
        rejected(() -> admin.guardAliasActionsBody(
                "{\"actions\":[{\"remove_index\":{\"index\":\"logs-2026\"}}]}", true), "remove_index");
    }

    @Test
    public void addOnly拒绝写路由与额外参数() {
        rejected(() -> admin.guardAliasActionsBody(
                "{\"actions\":[{\"add\":{\"index\":\"logs-2026\",\"alias\":\"logs\",\"is_write_index\":true}}]}",
                true), "is_write_index 改写写路由");
        rejected(() -> admin.guardAliasActionsBody(
                "{\"actions\":[{\"add\":{\"indices\":[\"a\",\"b\"],\"alias\":\"logs\"}}]}", true), "indices 多目标");
        rejected(() -> admin.guardAliasActionsBody(
                "{\"actions\":[{\"add\":{\"index\":\"logs-2026\"}}]}", true), "缺 alias");
    }

    @Test
    public void addOnly拒绝多条动作与非法JSON() {
        rejected(() -> admin.guardAliasActionsBody(
                "{\"actions\":[{\"add\":{\"index\":\"a\",\"alias\":\"x\"}},"
                        + "{\"remove\":{\"index\":\"b\",\"alias\":\"y\"}}]}", true), "多条动作");
        rejected(() -> admin.guardAliasActionsBody("not-json", true), "非法 JSON");
    }

    @Test
    public void aliases页默认形态保持remove能力() {
        admin.guardAliasActionsBody(
                "{\"actions\":[{\"remove\":{\"index\":\"logs-2026\",\"alias\":\"logs\"}}]}");
    }
}
