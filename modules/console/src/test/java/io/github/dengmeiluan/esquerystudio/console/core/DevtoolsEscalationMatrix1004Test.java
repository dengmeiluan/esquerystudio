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

/**
 * 批次 1004：开发者工具（DevTools / REST 直连）越权矩阵。
 *
 * <p>这两页的写键在连接模型下等于「目标连接的数据面全权」，因此**内核守卫是唯一的边界**：
 * 非 ADMIN 的每一次透传都要过 {@link EsIndexAdmin#guardRawGuarded}。本测试把「能做什么/
 * 不能做什么」逐条钉死——新增 allowlist 项或放宽守卫时，这里必须同步，否则红。</p>
 *
 * <p>分类：</p>
 * <ul>
 *   <li>A 集群/系统管理写 —— 全拒（有专属页面写键，不许借 devtools 越权）；</li>
 *   <li>B 索引结构写 —— 全拒（建删索引/mapping/settings/alias/close/forcemerge/rollover）；</li>
 *   <li>C 控制面索引 —— 路径/通配/请求体三条通道全拒；</li>
 *   <li>D 路径与方法变形 —— 归一化后仍拒；</li>
 *   <li>E 数据面 —— 放行（这是 devtools 的正当用途）；</li>
 *   <li>F 资源释放 —— 仅 DELETE 形态放行（PIT/scroll）。</li>
 * </ul>
 */
public class DevtoolsEscalationMatrix1004Test {

    private final EsIndexAdmin admin = new EsIndexAdmin(null);

    private interface Throwing {
        void run() throws Exception;
    }

    private static void blocked(Throwing r, String why) {
        try {
            r.run();
            fail("必须拒绝：" + why);
        } catch (Exception expected) {
            /* 期望：ControlPlaneGuardException / IllegalArgumentException */
        }
    }

    private static void allowed(Throwing r, String why) {
        try {
            r.run();
        } catch (Exception e) {
            fail("应放行但被拒：" + why + " —— " + e.getMessage());
        }
    }

    private void blocked(String method, String path, String body, String why) {
        blocked(() -> admin.guardRawGuarded(method, path, body), method + " " + path + "（" + why + "）");
    }

    private void allowed(String method, String path, String body, String why) {
        allowed(() -> admin.guardRawGuarded(method, path, body), method + " " + path + "（" + why + "）");
    }

    /* ═══ A 集群/系统管理写：一律拒绝（各页都有自己的写键） ═══ */

    @Test
    public void A_集群与系统管理写全拒() {
        blocked("PUT", "/_cluster/settings", "{\"persistent\":{\"x\":1}}", "集群设置");
        blocked("POST", "/_cluster/settings", "{}", "集群设置");
        blocked("PUT", "/_cluster/settings/persistent", "{}", "集群设置子路径");
        blocked("POST", "/_cluster/reroute", "{}", "分片路由");
        blocked("POST", "/_cluster/allocation/explain", "{}", "分配诊断写形态");
        blocked("PUT", "/_security/user/evil", "{\"password\":\"x\"}", "账号");
        blocked("POST", "/_security/role/evil", "{}", "角色");
        blocked("PUT", "/_security/api_key", "{}", "API Key");
        blocked("PUT", "/_index_template/evil", "{\"index_patterns\":[\"*\"]}", "可组合模板");
        blocked("PUT", "/_component_template/evil", "{}", "组件模板");
        blocked("PUT", "/_template/evil", "{\"index_patterns\":[\"*\"]}", "旧模板");
        blocked("PUT", "/_scripts/evil", "{\"script\":{\"lang\":\"painless\",\"source\":\"1\"}}", "已存脚本");
        blocked("PUT", "/_ingest/pipeline/evil", "{}", "管道");
        blocked("POST", "/_ilm/start", null, "ILM 开关");
        blocked("POST", "/_ilm/stop", null, "ILM 开关");
        blocked("PUT", "/_ilm/policy/evil", "{}", "ILM 策略");
        blocked("PUT", "/_slm/policy/evil", "{}", "快照生命周期");
        blocked("POST", "/_snapshot/repo/snap", "{}", "建快照");
        blocked("POST", "/_snapshot/repo/snap/_restore", "{}", "恢复快照");
        blocked("DELETE", "/_snapshot/repo/snap", null, "删快照");
        blocked("POST", "/_reindex", "{\"source\":{\"index\":\"a\"},\"dest\":{\"index\":\"b\"}}", "reindex");
        blocked("POST", "/_aliases", "{}", "批量别名切换");
        blocked("PUT", "/_watcher/watch/evil", "{}", "Watcher");
        blocked("PUT", "/_ml/anomaly_detectors/evil", "{}", "ML");
        blocked("PUT", "/_transform/evil", "{}", "Transform");
        blocked("PUT", "/_rollup/job/evil", "{}", "Rollup");
        blocked("PUT", "/_remote/info", "{}", "远端连接");
        blocked("POST", "/_nodes/reload_secure_settings", null, "节点安全配置");
        blocked("POST", "/_tasks/abc/_cancel", null, "任务取消");
        blocked("POST", "/_license/start_trial", null, "License");
    }

    /* ═══ B 索引结构写：一律拒绝（必须走对应页面写键） ═══ */

    @Test
    public void B_索引结构写全拒() {
        blocked("DELETE", "/logs", null, "删索引");
        blocked("PUT", "/new-index", "{}", "建索引");
        blocked("POST", "/logs/_close", null, "关索引");
        blocked("POST", "/logs/_open", null, "开索引");
        blocked("PUT", "/logs/_mapping", "{\"properties\":{}}", "改 mapping");
        blocked("PUT", "/logs/_settings", "{\"index\":{\"number_of_replicas\":0}}", "改 settings");
        blocked("POST", "/logs/_alias/hot", "{}", "加别名");
        blocked("DELETE", "/logs/_alias/hot", null, "删别名");
        blocked("POST", "/logs/_forcemerge", null, "force-merge");
        blocked("POST", "/logs/_rollover", "{}", "rollover");
        blocked("POST", "/logs/_cache/clear", null, "清缓存");
        blocked("POST", "/logs/_refresh", null, "refresh 写形态");
        blocked("POST", "/logs/_flush", null, "flush 写形态");
        blocked("POST", "/_all/_refresh", null, "全量 refresh");
        blocked("DELETE", "/_all", null, "全量删除");
        blocked("DELETE", "/*", null, "通配删除");
    }

    /* ═══ C 控制面索引：路径 / 通配 / 请求体三通道 ═══ */

    @Test
    public void C_控制面索引三通道全拒() {
        /* 路径通道 */
        blocked("PUT", "/esquerystudio_user/_doc/1", "{\"password\":\"x\"}", "直写账号索引");
        blocked("DELETE", "/esquerystudio_user/_doc/1", null, "删账号文档");
        blocked("POST", "/esquerystudio_user/_search", "{}", "查账号索引");
        blocked("POST", "/.security/_search", "{}", "系统隐藏索引");
        blocked("POST", "/_esquerystudio_lock/_doc/1", "{}", "控制索引（下划线前缀）");
        /* 通配通道：可能命中控制面的一律拒 */
        blocked("POST", "/logs*_esquerystudio_lock/_delete_by_query", "{\"query\":{\"match_all\":{}}}", "后缀控制索引");
        blocked("POST", "/esquerystudio*/_search", "{}", "控制面通配");
        blocked("DELETE", "/logs-*", null, "通配删索引（可能命中控制面）");
        /* 请求体通道 */
        blocked("POST", "/_bulk",
                "{\"index\":{\"_index\":\"esquerystudio_user\",\"_id\":\"1\"}}\n{\"role\":\"ADMIN\"}\n",
                "bulk 夹带控制索引");
        blocked("POST", "/logs/_bulk",
                "{\"index\":{\"_index\":\"esquerystudio_user\"}}\n{\"role\":\"ADMIN\"}\n",
                "索引前缀 bulk 夹带控制索引");
        blocked("POST", "/_msearch",
                "{\"index\":\"esquerystudio_user\"}\n{\"query\":{\"match_all\":{}}}\n", "msearch 夹带");
        blocked("POST", "/logs/_msearch",
                "{\"index\":\"esquerystudio_user\"}\n{}\n", "索引前缀 msearch 夹带");
        blocked("POST", "/_mget", "{\"docs\":[{\"_index\":\"esquerystudio_user\",\"_id\":\"1\"}]}", "mget 夹带");
        blocked("POST", "/_sql", "{\"query\":\"SELECT * FROM esquerystudio_user\"}", "SQL 读控制面");
        blocked("POST", "/_sql", "{\"query\":\"DELETE FROM esquerystudio_user\"}", "SQL 写控制面");
        blocked("POST", "/logs/_update/1",
                "{\"script\":{\"source\":\"ctx._index='esquerystudio_user'\"}}", "_index 改写脚本");
        blocked("POST", "/logs/_update_by_query",
                "{\"script\":{\"source\":\"ctx._index='esquerystudio_user'\"}}", "UBQ 改目标索引");
        blocked("POST", "/_render/template", "{\"id\":\"evil\"}", "按已存 id 渲染");
        blocked("GET", "/_render/template/evil", null, "路径形态已存模板");
        blocked("POST", "/_search/template", "{\"id\":\"evil\"}", "按已存 id 搜索");
    }

    /* ═══ D 路径与方法变形：归一化后仍拒 ═══ */

    @Test
    public void D_路径与方法变形不得绕过() {
        blocked("PUT", "//_cluster/settings", "{}", "重复斜杠");
        blocked("PUT", "/./_cluster/settings", "{}", "点段");
        blocked("PUT", "/logs/../_cluster/settings", "{}", "目录穿越");
        blocked("PUT", "/_cluster/../_cluster/settings", "{}", "穿越回绕");
        blocked("PUT", "/%5Fcluster/settings", "{}", "%5F 编码下划线");
        blocked("PUT", "/_SECURITY/user/evil", "{\"password\":\"x\"}", "大写变体");
        blocked("PUT", "/_Cluster/Settings", "{}", "混合大小写");
        blocked("PUT", "/logs/_doc/..%2F..%2F_security/user/evil", "{}", "文档 ID 穿越");
        /* 方法白名单（raw 入口校验，先于任何 I/O） */
        blocked(() -> admin.raw("TRACE", "/", null), "TRACE 不在方法白名单");
        blocked(() -> admin.raw("PATCH", "/logs/_doc/1", "{}"), "PATCH 不在方法白名单");
        blocked(() -> admin.raw("GET", "http://evil.example.com/", null), "绝对 URL 不是合法 ES 路径");
        blocked(() -> admin.raw("GET", "/logs#frag", null), "URI 片段分隔符");
    }

    /* ═══ E 数据面：放行（devtools 的正当用途） ═══ */

    @Test
    public void E_数据面读写放行() {
        allowed("GET", "/logs/_search?size=1", null, "检索");
        allowed("POST", "/logs/_search", "{\"query\":{\"match_all\":{}},\"size\":1}", "DSL 检索");
        /* 根级检索只有两种合法形态：路径带索引（/{index}/_search）或 PIT body。
           查询参数 index/indices 不算限定——无法证明目标端按其路由，被忽略即全量读。 */
        blocked("POST", "/_search", "{\"query\":{\"match_all\":{}}}", "根检索无 index=全量读");
        blocked("POST", "/_search?index=logs", "{\"query\":{\"match_all\":{}}}",
                "查询参数不构成目标限定");
        blocked("GET", "/_count?indices=logs", null, "查询参数不构成目标限定");
        blocked("GET", "/logs/_search?index=orders", null, "路径与查询参数目标二义");
        /* PIT 搜索是唯一豁免形态：body 带有效 pit.id 时不要求显式 index */
        allowed("POST", "/_search", "{\"pit\":{\"id\":\"abc\"},\"query\":{\"match_all\":{}}}", "PIT 搜索");
        allowed("GET", "/logs/_count", null, "计数");
        allowed("PUT", "/logs/_doc/1", "{\"a\":1}", "写文档");
        allowed("POST", "/logs/_doc", "{\"a\":1}", "自动 ID 写文档");
        allowed("POST", "/logs/_update/1", "{\"doc\":{\"a\":2}}", "局部更新");
        allowed("DELETE", "/logs/_doc/1", null, "删文档");
        allowed("POST", "/_bulk",
                "{\"index\":{\"_index\":\"logs\",\"_id\":\"1\"}}\n{\"a\":1}\n", "批量写");
        allowed("POST", "/logs/_delete_by_query", "{\"query\":{\"term\":{\"a\":1}}}", "按查询删（业务索引）");
        allowed("POST", "/logs/_update_by_query", "{\"query\":{\"term\":{\"a\":1}}}", "按查询改（业务索引）");
        allowed("POST", "/_sql", "{\"query\":\"SELECT * FROM logs LIMIT 1\"}", "SQL 查业务索引");
        allowed("POST", "/_analyze", "{\"text\":\"abc\"}", "分词");
        allowed("GET", "/_cat/indices?format=json", null, "索引目录（JSON 行式+行过滤）");
        allowed("GET", "/_security/_authenticate", null, "身份自省");
        allowed("POST", "/logs/_pit?keep_alive=1m", null, "索引级 PIT（显式索引）");
    }

    /* ═══ G 本轮实测补齐的绕过形态（1124） ═══ */

    /**
     * 矩阵原先只测了「根级检索 body 形态」，而真实绕过首选是**查询串**：
     * {@code GET /_search?q=*} 不带 body 也能全量读；{@code ?source=} 与 body 同权。
     * 同时确认系统段后接索引名的形态（{@code /_search/x}）按索引位逐段判定。
     */
    @Test
    public void G_根级检索的查询串形态同样被拒() {
        blocked("GET", "/_search?q=*", null, "q 通配全量读");
        blocked("GET", "/_search?q=*&size=100", null, "q 通配全量读（带 size）");
        blocked("GET", "/_count?q=*", null, "count 的 q 通配");
        blocked("GET", "/_search?source=%7B%22query%22%3A%7B%22match_all%22%3A%7B%7D%7D%7D",
                null, "source 参数形态的根级检索");
        blocked("GET", "/_search_shards", null, "分片视图枚举索引名");
        /* 系统段 + 索引位：第二段起逐段做控制面判定 */
        blocked("POST", "/_search/point_in_time", null, "系统段后的索引位");
    }

    /**
     * _msearch：头部行 {@code {}} 等于「不限索引」，只有路径或头部显式限定业务索引才放行。
     * _bulk 的 {@code {"index":{}}} 继承路径索引，这是 ES 的既有语义（不是越权）。
     */
    @Test
    public void G_msearch空头与bulk继承语义() {
        blocked("POST", "/_msearch", "{}\n{\"query\":{\"match_all\":{}}}\n", "空头=全量读");
        blocked("POST", "/_msearch", "{}\n{}\n", "空头+空体=全量读");
        blocked("POST", "/logs/_msearch",
                "{\"index\":\"esquerystudio_user\"}\n{\"query\":{\"match_all\":{}}}\n", "头行夹带控制索引");
        /* ES 语义：路径里的索引是头的默认索引。空头 = 只查路径索引（logs），不是全量读；
           只有**根路径** /_msearch 的空头才是全量（已在上面拒绝）。 */
        allowed("POST", "/logs/_msearch", "{}\n{\"query\":{\"match_all\":{}}}\n",
                "空头继承路径索引（ES 既有语义，非全量）");
        /* bulk 显式控制索引必须拒；路径继承业务索引的简写放行 */
        blocked("POST", "/_bulk", "{\"index\":{\"_index\":\"esquerystudio_user\"}}\n{}\n", "bulk 显式控制索引");
        allowed("POST", "/logs/_bulk", "{\"index\":{}}\n{\"a\":1}\n", "bulk 继承路径索引（ES 既有语义）");
    }

    /**
     * _cat 元数据视图：aliases/shards 与 indices 一样可能带出控制面索引名，
     * 因此只允许 JSON 行式返回并由 filterCatControlRows 逐行剔除（守卫不拒、结果侧过滤）。
     */
    @Test
    public void G_cat视图靠结果侧行过滤而非路径拒绝() {
        allowed("GET", "/_cat/aliases?format=json", null,
                "_cat/aliases JSON 行式（结果侧按行剔除控制面）");
        allowed("GET", "/_cat/shards?format=json", null,
                "_cat/shards JSON 行式（结果侧按行剔除控制面）");
        blocked("GET", "/_cat/count", null, "聚合形态无法按行过滤，直接拒");
        blocked("GET", "/_stats", null, "聚合统计无法按行过滤，直接拒");
    }

    /* ═══ F 资源释放：仅 DELETE 形态放行 ═══ */
    @Test
    public void F_根级PIT与scroll仅允许释放() {
        blocked("POST", "/_pit", "{\"keep_alive\":\"1d\"}", "根级开 PIT=全量读");
        allowed("DELETE", "/_pit", "{\"id\":\"abc\"}", "释放自己持有的 PIT");
        blocked("POST", "/_search/scroll", "{\"scroll_id\":\"abc\"}", "续读他人 scroll=全量读");
        allowed("DELETE", "/_search/scroll", "{\"scroll_id\":\"abc\"}", "释放 scroll");
    }

    /* ═══ G 方法面覆盖（1131）：写方法不得因「换了动词」绕过控制面守卫 ═══
       审计背景：拦截器 requiredRole 只把 GET/HEAD/OPTIONS 视为读，其余一律写；
       这里验证 raw 守卫侧对不同动词是否同口径——否则 PATCH/PUT 可能成为旁路。 */
    @Test
    public void G_非GET动词不得绕过控制面守卫() {
        for (String m : new String[]{"PATCH", "PUT", "DELETE", "POST"}) {
            blocked(m, "/.security/_doc/1", "{\"x\":1}", m + " 写控制面索引");
            blocked(m, "/esquerystudio_jobs/_doc/1", "{\"x\":1}", m + " 写控制面索引");
        }
        /* 大小写变体同样拦（目标端/代理可能大小写不敏感） */
        blocked("patch", "/.security/_doc/1", "{}", "小写 patch 变体");
    }

    @Test
    public void G_非GET动词对业务索引维持放行() {
        for (String m : new String[]{"PATCH", "PUT", "POST", "DELETE"}) {
            allowed(m, "/orders/_doc/1", "{\"x\":1}", m + " 业务索引（由页面写键裁决）");
        }
    }
}
