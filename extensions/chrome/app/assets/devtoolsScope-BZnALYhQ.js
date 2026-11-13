import{e as le,w as de,f,z as D,p as u,m as x,A as _e,n as ue,R as pe,B as me,T as he,r as I,c as A,o as m,x as fe,G as ye,i as q,t as v,y as j,F as C,g as Y,E as ge}from"./vendor-DCu7J7Gg.js";import{u as Te,aI as H,_ as xe}from"./index-Be6PRRUV.js";import{u as be}from"./usePopupList-BtjR1rkG.js";import{s as U}from"./jsonc-NcQCz5B-.js";const nt=["GET","POST","PUT","DELETE","HEAD"],Q=[{methods:["GET","POST"],path:"/{index}/_search",doc:"搜索文档",body:`{
  "query": {
    "match_all": {}
  }
}`},{methods:["GET","POST"],path:"/_search",doc:"全集群搜索",body:`{
  "query": {
    "match_all": {}
  }
}`},{methods:["GET"],path:"/{index}/_mapping",doc:"查看 mapping"},{methods:["PUT"],path:"/{index}/_mapping",doc:"更新 mapping（加字段）",body:`{
  "properties": {
    "field": { "type": "keyword" }
  }
}`},{methods:["GET"],path:"/{index}/_settings",doc:"查看索引设置"},{methods:["PUT"],path:"/{index}/_settings",doc:"热更索引设置",body:`{
  "index": {
    "refresh_interval": "1s"
  }
}`},{methods:["PUT"],path:"/{index}",doc:"创建索引",body:`{
  "settings": { "number_of_shards": 1, "number_of_replicas": 1 },
  "mappings": { "properties": {} }
}`},{methods:["DELETE"],path:"/{index}",doc:"删除索引（危险）"},{methods:["POST"],path:"/{index}/_doc",doc:"写入文档（自增 ID）",body:`{
  "field": "value"
}`},{methods:["PUT"],path:"/{index}/_doc/{id}",doc:"写入/覆盖文档（指定 ID）",body:`{
  "field": "value"
}`},{methods:["GET"],path:"/{index}/_doc/{id}",doc:"按 ID 取文档"},{methods:["DELETE"],path:"/{index}/_doc/{id}",doc:"按 ID 删文档"},{methods:["POST"],path:"/{index}/_update/{id}",doc:"局部更新文档",body:`{
  "doc": { "field": "value" }
}`},{methods:["POST","PUT"],path:"/{index}/_bulk",doc:"批量写入",body:`{ "index": {} }
{ "field": "value" }
`},{methods:["POST"],path:"/{index}/_update_by_query",doc:"按查询更新",body:`{
  "query": { "match_all": {} }
}`},{methods:["POST"],path:"/{index}/_delete_by_query",doc:"按查询删除（危险）",body:`{
  "query": { "match_all": {} }
}`},{methods:["POST"],path:"/_reindex",doc:"跨索引重建",body:`{
  "source": { "index": "src" },
  "dest": { "index": "dst" }
}`},{methods:["GET","POST"],path:"/{index}/_count",doc:"计数",body:`{
  "query": { "match_all": {} }
}`},{methods:["GET"],path:"/{index}/_aliases",doc:"查看别名"},{methods:["POST"],path:"/_aliases",doc:"别名原子操作",body:`{
  "actions": [
    { "add": { "index": "my-v1", "alias": "my" } }
  ]
}`},{methods:["POST","GET"],path:"/{index}/_refresh",doc:"手动刷新"},{methods:["POST"],path:"/{index}/_forcemerge",doc:"强制合并"},{methods:["POST"],path:"/{index}/_close",doc:"关闭索引"},{methods:["POST"],path:"/{index}/_open",doc:"打开索引"},{methods:["GET"],path:"/_cat/indices",doc:"索引清单"},{methods:["GET"],path:"/_cat/aliases",doc:"别名清单"},{methods:["GET"],path:"/_cat/nodes",doc:"节点清单"},{methods:["GET"],path:"/_cat/shards",doc:"分片清单"},{methods:["GET"],path:"/_cat/allocation",doc:"分片磁盘分配"},{methods:["GET"],path:"/_cat/health",doc:"集群健康（cat）"},{methods:["GET"],path:"/_cluster/health",doc:"集群健康"},{methods:["GET"],path:"/_cluster/stats",doc:"集群统计"},{methods:["GET"],path:"/_cluster/settings",doc:"集群设置"},{methods:["PUT"],path:"/_cluster/settings",doc:"热更集群设置（persistent 持久 / transient 临时）",body:`{
  "persistent": {
    "cluster.routing.allocation.enable": "all"
  }
}`},{methods:["GET","POST"],path:"/_cluster/allocation/explain",doc:"分片分配原因诊断",body:`{
  "index": "my-index",
  "shard": 0,
  "primary": true
}`},{methods:["POST"],path:"/_cluster/reroute",doc:"分片重路由（move / allocate_* / cancel）",body:`{
  "commands": [
    { "move": { "index": "my-index", "shard": 0, "from_node": "node-a", "to_node": "node-b" } }
  ]
}`},{methods:["GET"],path:"/_nodes/stats",doc:"节点统计"},{methods:["POST"],path:"/_nodes/reload_secure_settings",doc:"重载节点密钥库（改 secure settings 后）",body:`{
  "secure_settings_password": "keystore-password"
}`},{methods:["GET"],path:"/_tasks",doc:"任务清单"},{methods:["GET","POST"],path:"/{index}/_search/template",doc:"搜索模板执行"},{methods:["GET","POST"],path:"/{index}/_validate/query",doc:"查询校验",body:`{
  "query": { "match_all": {} }
}`},{methods:["GET","POST"],path:"/{index}/_explain/{id}",doc:"打分明细",body:`{
  "query": { "match_all": {} }
}`},{methods:["POST"],path:"/{index}/_eql/search",doc:"EQL 事件检索（query 是 EQL 串，filter 才是 Query DSL）",body:`{
  "query": "any where true",
  "size": 10
}`},{methods:["PUT","POST"],path:"/_index_template/{name}",doc:"创建/更新索引模板",body:`{
  "index_patterns": ["logs-*"],
  "priority": 100,
  "template": {
    "settings": { "number_of_shards": 1 },
    "mappings": { "properties": { "@timestamp": { "type": "date" } } }
  }
}`},{methods:["PUT","POST"],path:"/_component_template/{name}",doc:"创建/更新组件模板",body:`{
  "template": {
    "settings": { "number_of_replicas": 1 }
  }
}`},{methods:["PUT"],path:"/_ingest/pipeline/{pipeline_id}",doc:"创建/更新 Ingest 管道",body:`{
  "description": "parse logs",
  "processors": [
    { "set": { "field": "env", "value": "prod" } }
  ]
}`},{methods:["POST"],path:"/_ingest/pipeline/_simulate",doc:"管道试跑（内联 pipeline + docs）",body:`{
  "pipeline": { "processors": [ { "set": { "field": "env", "value": "prod" } } ] },
  "docs": [ { "_source": { "message": "hello" } } ],
  "verbose": true
}`},{methods:["PUT","POST"],path:"/_scripts/{id}",doc:"保存 Painless 脚本",body:`{
  "script": {
    "lang": "painless",
    "source": "return 1;"
  }
}`},{methods:["POST"],path:"/_scripts/{id}/_execute",doc:"执行已存脚本",body:`{
  "script": {
    "source": "return 1;"
  }
}`},{methods:["PUT","POST"],path:"/_snapshot/{repository}",doc:"注册快照仓库",body:`{
  "type": "fs",
  "settings": { "location": "/mnt/backup" }
}`},{methods:["PUT","POST"],path:"/_snapshot/{repository}/{snapshot}",doc:"创建快照",body:`{
  "indices": "logs-*",
  "include_global_state": false,
  "partial": false
}`},{methods:["PUT"],path:"/_snapshot/{repository}/{snapshot}/_clone/{target_snapshot}",doc:"克隆快照（目标名在路径上）",body:`{
  "indices": "logs-*"
}`},{methods:["POST"],path:"/_snapshot/{repository}/{snapshot}/_mount",doc:"挂载快照为可搜索索引",body:`{
  "index": "logs",
  "renamed_index": "logs-restored",
  "storage": "shared_cache"
}`},{methods:["POST"],path:"/_snapshot/{repository}/{snapshot}/_restore",doc:"恢复快照",body:`{
  "indices": "logs-*",
  "ignore_unavailable": true,
  "rename_pattern": "(.+)",
  "rename_replacement": "restored_$1"
}`},{methods:["PUT"],path:"/_slm/policy/{policy_id}",doc:"创建/更新 SLM 备份策略",body:`{
  "schedule": "0 30 1 * * ?",
  "name": "<snapshot-{now/d}>",
  "repository": "my_repo",
  "config": { "indices": "logs-*", "include_global_state": false },
  "retention": { "expire_after": "30d", "min_count": 5, "max_count": 50 }
}`},{methods:["POST"],path:"/_ilm/move/{index}",doc:"手动推进索引的 ILM 步骤",body:`{
  "current_step": { "phase": "hot", "action": "rollover" },
  "next_step": { "phase": "warm", "action": "forcemerge" }
}`},{methods:["PUT"],path:"/_ilm/policy/{policy_id}",doc:"创建/更新 ILM 生命周期策略",body:`{
  "policy": {
    "phases": {
      "hot": { "actions": { "rollover": { "max_size": "50gb" } } },
      "delete": { "min_age": "90d", "actions": { "delete": {} } }
    }
  }
}`},{methods:["PUT","POST"],path:"/_watcher/watch/{watch_id}",doc:"创建/更新 Watcher 告警",body:`{
  "trigger": { "schedule": { "interval": "5m" } },
  "input": { "search": { "request": { "indices": ["logs-*"], "body": { "query": { "match_all": {} } } } } },
  "condition": { "compare": { "ctx.payload.hits.total": { "gt": 0 } } },
  "actions": { "notify": { "logging": { "text": "watch fired" } } }
}`},{methods:["POST"],path:"/_watcher/watch/{watch_id}/_execute",doc:"试跑 Watcher 告警（模拟触发/动作）",body:`{
  "ignore_condition": false,
  "record_execution": true
}`},{methods:["POST"],path:"/_watcher/watch/_execute",doc:"内联试跑 Watch（不保存告警）",body:`{
  "watch": {
    "trigger": { "schedule": { "interval": "5m" } },
    "input": { "simple": {} },
    "condition": { "always": {} },
    "actions": { "log": { "logging": { "text": "fired" } } }
  },
  "record_execution": false
}`},{methods:["POST"],path:"/_transform/_preview",doc:"预览 Transform 结果（不创建作业）",body:`{
  "source": { "index": ["logs-*"] },
  "pivot": {
    "group_by": { "day": { "date_histogram": { "field": "@timestamp", "calendar_interval": "1d" } } },
    "aggregations": { "avg_bytes": { "avg": { "field": "bytes" } } }
  }
}`},{methods:["POST"],path:"/_transform/{transform_id}/_update",doc:"更新 Transform 作业配置",body:`{
  "description": "updated transform",
  "sync": { "time": { "field": "@timestamp", "delay": "1m" } }
}`},{methods:["PUT"],path:"/_transform/{transform_id}",doc:"创建/更新 Transform 作业",body:`{
  "source": { "index": ["logs-*"] },
  "dest": { "index": "logs-transformed" },
  "pivot": {
    "group_by": { "day": { "date_histogram": { "field": "@timestamp", "calendar_interval": "1d" } } },
    "aggregations": { "avg_bytes": { "avg": { "field": "bytes" } } }
  }
}`},{methods:["PUT"],path:"/_rollup/job/{job_id}",doc:"创建 Rollup 汇总作业",body:`{
  "index_pattern": "logs-*",
  "rollup_index": "logs-rollup",
  "cron": "0 */30 * * * ?",
  "page_size": 1000,
  "groups": { "date_histogram": { "field": "@timestamp", "calendar_interval": "1h" } },
  "metrics": [ { "field": "bytes", "metrics": ["min", "max", "sum"] } ]
}`},{methods:["PUT"],path:"/_enrich/policy/{policy_id}",doc:"创建/更新 Enrich 策略",body:`{
  "match": {
    "indices": ["users"],
    "match_field": "email",
    "enrich_fields": ["name"]
  }
}`},{methods:["PUT"],path:"/_ml/anomaly_detectors/{job_id}",doc:"创建 ML 异常检测作业",body:`{
  "analysis_config": {
    "bucket_span": "15m",
    "detectors": [ { "function": "mean", "field_name": "responsetime" } ]
  },
  "data_description": { "time_field": "@timestamp" }
}`},{methods:["PUT"],path:"/_ml/datafeeds/{datafeed_id}",doc:"创建 ML 数据馈送",body:`{
  "job_id": "latency-job",
  "indexes": ["logs-*"],
  "query": { "match_all": {} },
  "frequency": "60s"
}`},{methods:["PUT","POST"],path:"/_security/role/{name}",doc:"创建/更新安全角色",body:`{
  "cluster": ["monitor"],
  "indices": [ { "names": ["logs-*"], "privileges": ["read"] } ]
}`},{methods:["PUT","POST"],path:"/_security/user/{name}",doc:"创建/更新安全用户",body:`{
  "password": "change-me",
  "roles": ["viewer"],
  "full_name": "User"
}`},{methods:["PUT","POST"],path:"/_security/role_mapping/{name}",doc:"创建/更新角色映射",body:`{
  "roles": ["viewer"],
  "enabled": true,
  "rules": { "field": { "username": "jdoe" } }
}`},{methods:["PUT","POST"],path:"/_security/api_key",doc:"创建 API Key",body:`{
  "name": "my-api-key",
  "expiration": "30d"
}`},{methods:["POST"],path:"/_security/_query/api_key",doc:"检索 API Key（Query DSL）",body:`{
  "query": { "wildcard": { "name": "my-api-*" } },
  "from": 0,
  "size": 10
}`},{methods:["DELETE"],path:"/_security/api_key",doc:"吊销 API Key（按 id / 名称 / 属主）",body:`{
  "ids": ["key-id"]
}`},{methods:["POST"],path:"/_security/cross_cluster/api_key",doc:"创建跨集群 API Key（search / replication）",body:`{
  "name": "ccs-key",
  "access": {
    "search": [ { "names": ["logs-*"] } ],
    "replication": [ { "names": ["archive-*"] } ]
  }
}`},{methods:["PUT","POST"],path:"/_security/privilege",doc:"创建/更新应用权限（应用名/权限名两层映射）",body:`{
  "myapp": {
    "read": { "actions": ["read"] }
  }
}`},{methods:["PUT"],path:"/_ml/filters/{filter_id}",doc:"创建/更新 ML 过滤器",body:`{
  "description": "safe domains",
  "items": ["*.example.com"]
}`},{methods:["POST"],path:"/_ml/filters/{filter_id}/_update",doc:"更新 ML 过滤器（增删条目）",body:`{
  "add_items": ["*.example.com"],
  "remove_items": ["*.old.com"]
}`},{methods:["PUT"],path:"/_ml/calendars/{calendar_id}",doc:"创建/更新 ML 日历",body:`{
  "job_ids": ["latency-job"],
  "description": "planned outages"
}`},{methods:["POST"],path:"/_ml/calendars/{calendar_id}/events",doc:"向 ML 日历添加计划事件",body:`{
  "events": [
    {
      "description": "maintenance",
      "start_time": 1700000000000,
      "end_time": 1700003600000,
      "skip_result": true
    }
  ]
}`},{methods:["POST"],path:"/{index}/_graph/explore",doc:"Graph 关系探索（种子查询 + 顶点/边）",body:`{
  "query": { "match": { "title": "elasticsearch" } },
  "vertices": [ { "field": "product", "size": 5 } ],
  "connections": { "vertices": [ { "field": "query.raw", "size": 5 } ] }
}`},{methods:["PUT"],path:"/{index}/_ccr/follow",doc:"CCR 跟随远端索引",body:`{
  "remote_cluster": "leader_cluster",
  "leader_index": "leader-index"
}`},{methods:["PUT"],path:"/_ccr/auto_follow/{cluster}",doc:"创建 CCR 自动跟随模式",body:`{
  "remote_cluster": "leader_cluster",
  "follow_index_pattern": "{{leader_index}}-follower",
  "leader_index_patterns": ["logs-*"]
}`},{methods:["POST"],path:"/_security/api_key/grant",doc:"代授 API Key（access_token / password）",body:`{
  "grant_type": "access_token",
  "access_token": "token",
  "api_key": { "name": "granted-key" }
}`},{methods:["PUT","POST"],path:"/_license",doc:"更新许可证（licenses 清单）",body:`{
  "licenses": [
    {
      "uid": "license-uid",
      "type": "enterprise",
      "issue_date_in_millis": 1700000000000,
      "expiry_date_in_millis": 1800000000000,
      "issued_to": "company",
      "issuer": "elastic",
      "signature": "signature"
    }
  ]
}`}];function ke(c){const e=(c||"").replace(/^\//,"").toLowerCase();if(!e)return Q;const n=o=>{const i=o.replace(/^\//,"").toLowerCase().replace("{index}/","");return i.startsWith(e)?0:i.split("/").some(r=>r===e||r==="_"+e)?1:i.includes(e)?2:3};return Q.map(o=>({e:o,r:n(o.path)})).filter(o=>o.r<3||o.e.doc.toLowerCase().includes(e)).sort((o,i)=>o.r-i.r||o.e.path.localeCompare(i.e.path)).map(o=>o.e).slice(0,30)}function ve(c){return c.includes("{index}")}function Se(c,e){return c.replace("{index}",e)}const Pe=["value","placeholder","aria-expanded","aria-controls","aria-activedescendant"],Ee={key:0,class:"epi-stage"},Oe={class:"mono"},we={key:1,class:"epi-hint"},Ae=["id"],qe=["id","aria-selected","onMouseenter","onClick"],Ce=["data-m"],Le={class:"epi-p mono"},Ie={class:"epi-d"},Ue={key:1,class:"epi-idx mono"},We={key:0,class:"epi-mark"},De={class:"epi-ft"},je={key:0,class:"epi-more"},R=50,Re=le({__name:"EndpointPathInput",props:{modelValue:{},placeholder:{},to:{type:[String,Boolean],default:"body"}},emits:["update:modelValue","endpoint","enter"],setup(c,{emit:e}){const n=c,o=e,i=Te(),r=I(),s=I("endpoint"),t=I(null),a=I(null),d=A(()=>((a.value??n.modelValue)||"").split("?")[0].split("/").filter(Boolean).pop()||""),T=A(()=>{const l=d.value,g=l.startsWith("_")?"":l,_=g.toLowerCase(),b=i.indices.map(h=>h.index);if(!_)return{total:b.length,list:b.slice(0,R).map(h=>({kind:"idx",name:h,segs:H(h,"")}))};const k=h=>{const w=h.toLowerCase();return w===_?0:w.startsWith(_)?1:2},L=b.filter(h=>h.toLowerCase().includes(_)).sort((h,w)=>k(h)-k(w)||h.localeCompare(w));return{total:L.length,list:L.slice(0,R).map(h=>({kind:"idx",name:h,segs:H(h,g)}))}}),y=A(()=>s.value==="slot"?Math.max(0,T.value.total-R):0),P=A(()=>s.value==="slot"?T.value.list:ke(n.modelValue||"").map(l=>({kind:"ep",ep:l}))),G=A(()=>P.value.length?"":s.value==="slot"?d.value&&!d.value.startsWith("_")?"没有匹配「"+d.value+"」的索引（仍可手输索引名）":"当前集群暂无索引数据（仍可手输索引名）":"目录里没有匹配「"+(n.modelValue||"")+"」的端点（仍可手输任意路径）"),{open:O,cursor:E,popStyle:ne,teleportTo:se,inplace:M,listId:N,itemId:B,rootEl:oe,listEl:re,openPanel:ae,close:V,onKey:J}=be({items:()=>P.value,onChoose:l=>z(l),onEnter:()=>o("enter"),to:()=>n.to,idPrefix:"epi",activeSelector:".epi-item.act"});function ie(l){return l.kind==="ep"?"ep:"+l.ep.methods.join(",")+" "+l.ep.path:"idx:"+l.name}function ce(l){o("update:modelValue",l.target.value),s.value="endpoint",t.value=null,a.value=null,E.value=0,O.value||ae()}function z(l){var _;if(l.kind==="ep"){if(o("endpoint",l.ep),ve(l.ep.path)){t.value=l.ep,a.value=(n.modelValue||"").includes("/")?null:"",s.value="slot",E.value=0;return}o("update:modelValue",l.ep.path),V(),K();return}const g=((_=t.value)==null?void 0:_.path)||"";o("update:modelValue",Se(g,l.name)),V(),K()}function K(){ge(()=>{const l=r.value;l&&(l.focus(),l.setSelectionRange(l.value.length,l.value.length))})}return de(O,l=>{l||(s.value="endpoint",t.value=null,a.value=null)}),(l,g)=>(m(),f("div",{class:D(["epi",{focus:u(O)}]),ref_key:"rootEl",ref:oe},[x("input",{ref_key:"inputEl",ref:r,class:"epi-inp mono",value:c.modelValue,placeholder:c.placeholder||"",spellcheck:"false",autocomplete:"off",role:"combobox","aria-autocomplete":"list","aria-expanded":u(O)?"true":"false","aria-controls":u(N),"aria-activedescendant":u(O)&&P.value[u(E)]?u(B)(u(E)):void 0,onInput:ce,onKeydown:g[0]||(g[0]=(..._)=>u(J)&&u(J)(..._))},null,40,Pe),(m(),_e(he,{to:u(se),disabled:u(M)},[ue(pe,{name:"pop"},{default:me(()=>[u(O)?(m(),f("div",{key:0,class:D(["epi-pop float-pop",{inplace:u(M)}]),style:ye(u(ne)),onMousedown:g[1]||(g[1]=fe(()=>{},["prevent","stop"]))},[s.value==="slot"&&t.value?(m(),f("div",Ee,[g[2]||(g[2]=q("索引槽位 ",-1)),x("b",Oe,v(t.value.path),1)])):j("",!0),G.value?(m(),f("div",we,v(G.value),1)):(m(),f("div",{key:2,class:"epi-list",ref_key:"listEl",ref:re,role:"listbox",id:u(N)},[(m(!0),f(C,null,Y(P.value,(_,b)=>(m(),f("div",{key:ie(_),class:D(["epi-item",{act:b===u(E)}]),role:"option",id:u(B)(b),"aria-selected":b===u(E),onMouseenter:k=>E.value=b,onClick:k=>z(_)},[_.kind==="ep"?(m(),f(C,{key:0},[x("span",{class:"epi-m mono","data-m":_.ep.methods[0].toLowerCase()},v(_.ep.methods.join("/")),9,Ce),x("span",Le,v(_.ep.path),1),x("span",Ie,v(_.ep.doc),1)],64)):(m(),f("span",Ue,[(m(!0),f(C,null,Y(_.segs,(k,L)=>(m(),f(C,{key:L},[k.m?(m(),f("mark",We,v(k.t),1)):(m(),f(C,{key:1},[q(v(k.t),1)],64))],64))),128))]))],42,qe))),128))],8,Ae)),x("div",De,[y.value>0?(m(),f("span",je,"仍有 "+v(y.value)+" 个，继续输入",1)):j("",!0),g[3]||(g[3]=x("span",{class:"epi-keys"},[x("kbd",{class:"kbd"},"↑↓"),q(" 选择 "),x("kbd",{class:"kbd"},"Enter"),q(" 确认 "),x("kbd",{class:"kbd"},"Esc"),q(" 关闭")],-1))])],38)):j("",!0)]),_:1})],8,["to","disabled"]))],2))}}),st=xe(Re,[["__scopeId","data-v-b576e119"]]),Ge=new Set(["/_bulk","/_msearch","/_msearch/template","/_mget","/_search","/_search/template","/_count","/_async_search","/_field_caps","/_analyze","/_render/template","/_sql","/_sql/close","/_sql/translate","/_xpack/sql","/_xpack/sql/close","/_xpack/sql/translate"]),Me=new Set(["/_pit","/_search/scroll"]),X=new Set(["_doc","_create","_update","_bulk","_delete_by_query","_update_by_query","_search","_count","_msearch","_mget","_explain","_validate","_field_caps","_termvectors","_mtermvectors","_analyze","_pit","_terms_enum","_rank_eval","_knn_search"]),Z=new Set(["_refresh","_flush","_cache","_forcemerge","_close","_open","_rollover","_delete_by_query","_update_by_query","_bulk","_reindex"]),ee=new Set(["_recovery","_shard_stores","_segments","_stats","_search_shards"]),$=new Set(["/_security","/_xpack/security","/_snapshot","/_watcher","/_xpack/watcher","/_scripts","/_ingest","/_ilm","/_xpack/ilm","/_slm","/_ml","/_xpack/ml","/_transform","/_xpack/transform","/_rollup","/_xpack/rollup","/_ccr","/_xpack/ccr","/_remote","/_nodes","/_cluster/state","/_cluster/settings","/_mapping","/_settings","/_cat/repositories","/_cat/snapshots","/_cat/count","/_cat/segments","/_cat/recovery","/_cat/allocation","/_stats","/_search_shards","/_segments","/_recovery","/_shard_stores","/_cat/fielddata","/_resolve","/_alias","/_aliases","/_tasks","/_cat/tasks","/_cluster/allocation","/_cluster/pending_tasks","/_cat/pending_tasks","/_cat/templates","/_index_template","/_component_template","/_template","/_cat/nodes","/_cat/nodeattrs","/_cat/thread_pool","/_cat/plugins","/_cat/master","/_cluster/voting","/_cluster/voting_config_exclusions","/_cat/transforms","/_cat/ml","/_cat/component_templates","/_data_stream","/_features","/_license","/_xpack/license","/_xpack/usage","/_cluster/stats","/_enrich","/_monitoring","/_logstash","/_connector","/_synonyms","/_query_rules","/_autoscaling","/_searchable_snapshots","/_search/scroll","/_cat/hot_threads","/_dangling","/_xpack","/_script_context","/_script_language","/_migration","/_async_search/status","/_refresh","/_flush","/_cache","/_forcemerge","/_close","/_open","/_reindex"]),Ne=new Set(["/_security/_authenticate","/_xpack/security/_authenticate"]);function Be(c){const e=c.toLowerCase();if(Ne.has(e))return!1;if(e.startsWith("/_async_search/")||e.startsWith("/_sql/async/")||e.startsWith("/_xpack/sql/async/")||e.startsWith("/_eql/search/")||$.has(e))return!0;for(const n of $)if(e.startsWith(n+"/"))return!0;return!1}function S(c){let e=String(c||"").split("?")[0].split("#")[0];try{e=decodeURIComponent(e)}catch{}const n=e.split("/").filter(o=>o!==""&&o!==".");return n.length===0?"/":"/"+n.join("/")}function F(c){for(let e=2;e<c.length;e++){const n=c[e].toLowerCase();if(X.has(n)||Z.has(n)||ee.has(n)||n==="_mapping"||n==="_alias")return!0}return!1}const Ve=new Set(["/_search","/_count","/_field_caps","/_async_search","/_terms_enum","/_rank_eval","/_search/template"]);function Je(c,e){const n=String(c||""),o=n.indexOf("?"),i=S(o>=0?n.slice(0,o):n).toLowerCase();if(!Ve.has(i))return!1;let r=String(e||"").trim();if(!r&&o>=0)for(const s of n.slice(o+1).split("#")[0].split("&")){const t=s.indexOf("=");if(!(t<0))try{if(decodeURIComponent(s.slice(0,t))!=="source")continue;r=decodeURIComponent(s.slice(t+1)).trim();break}catch{return!0}}if(r)try{const s=JSON.parse(U(r));if(s&&s.pit&&String(s.pit.id||"").trim()&&!("index"in s)&&!("indices"in s))return!1}catch{}return!0}function ze(c){const e=String(c||""),n=e.indexOf("?");if(n<0)return!1;const o=e.slice(n+1).split("#")[0];for(const i of o.split("&")){if(!i)continue;const r=i.indexOf("=");let s=i;try{s=decodeURIComponent(r<0?i:i.slice(0,r))}catch{return!0}if(s==="index"||s==="indices")return!0}return!1}const Ke=["/_cat/indices","/_cat/aliases","/_cat/shards"];function Ye(c){const e=c.toLowerCase();return Ke.some(n=>e===n||e.startsWith(n+"/"))}function He(c){if(!c.trim())return!0;for(const e of c.split("&")){if(!e)continue;const n=e.indexOf("=");let o=e,i="";try{o=decodeURIComponent(n<0?e:e.slice(0,n)),i=n<0?"":decodeURIComponent(e.slice(n+1))}catch{return!1}if(o!=="h"&&o!=="headers")continue;let r=!1;for(const s of i.split(",")){let t=s.trim();const a=t.indexOf(":");a>0&&(t=t.slice(0,a).trim()),(t==="index"||t==="*"||t.startsWith("index."))&&(r=!0)}if(!r)return!1}return!0}function Qe(c){const e=String(c||""),n=e.indexOf("?"),o=S(n>=0?e.slice(0,n):e);if(!Ye(o))return!1;const i=n>=0?e.slice(n+1).split("#")[0]:"";let r=!1;for(const s of i.split("&")){if(!s)continue;const t=s.indexOf("=");let a=s,d="";try{a=decodeURIComponent(t<0?s:s.slice(0,t)),d=t<0?"":decodeURIComponent(s.slice(t+1))}catch{return!0}a==="format"&&d.trim().toLowerCase()==="json"&&(r=!0)}return r?!He(i):!0}function ot(c){const e=S(c).toLowerCase();return e.startsWith("/_async_search/")||e.startsWith("/_sql/async/")||e.startsWith("/_xpack/sql/async/")||e.startsWith("/_eql/search/")}function te(c){const n=S(c).split("/").filter(Boolean);if(!n.length)return!1;const o=n[0].toLowerCase();if(o==="_all")return!0;const i=r=>{const s=r.trim().replace(/^[+-]/,"").toLowerCase();if(!s)return!1;if(s==="*"||s==="_all"||s.startsWith(".")||s.startsWith("esquerystudio")||s==="esquerystudio_adhoc_job"||s.startsWith("esquerystudio_adhoc_job-")||s.endsWith("_esquerystudio_lock")||s.endsWith("_esquerystudio_migrate_job"))return!0;const t=s.replace(/[*?].*$/,"");return!!(t!==s&&["esquerystudio","esquerystudio_adhoc_job","_esquerystudio_lock","_esquerystudio_migrate_job"].some(a=>a.startsWith(t)))};if(!o.startsWith("_"))return o.split(",").some(i);for(let r=1;r<n.length;r++){const s=n[r].toLowerCase();if(s==="_all"||!s.startsWith("_")&&s.split(",").some(i))return!0}return!1}function p(c){if(typeof c!="string")return!1;const e=c.trim().replace(/^["'`\[]|["'`\]]$/g,"");return e?te("/"+e):!1}function rt(c,e){const o=String(c||"").split("?")[0],i=S(o).split("/").filter(Boolean),r=(i[0]||"").toLowerCase(),s=r.startsWith("_")?i[1]||"":r;if(/[*?]/.test(s)||s.includes("<")||s.includes(":"))return"通配/日期数学/跨集群目标由后端解析真实索引：若命中控制面索引会被拒绝；建议优先用精确索引名或 PIT";const a=String(e||"");if(a){if(/"(?:_?index|indices)"\s*:\s*"[^"]*[*?<:]/.test(a))return"请求体里的通配/日期数学/跨集群目标由后端解析：命中控制面索引会被拒绝";if(/_sql/i.test(o)&&/\b(?:FROM|JOIN)\s+[^\s;()]*[*?<:]/.test(a))return"SQL 通配/日期数学目标由后端解析：命中控制面索引会被拒绝"}return null}function $e(c,e){var s;const n=String(e||"").trim();if(!n)return!1;const o=S(c).toLowerCase().split("/").filter(Boolean),i=o[0]||"",r=i.startsWith("_")?i:o[1]||"";if(r==="_bulk"){const t=n.split(/\r?\n/);for(let a=0;a<t.length;a+=2){const d=t[a].trim();if(d)try{const T=JSON.parse(d);for(const y of Object.keys(T||{})){const P=T[y];if(P&&p(P._index))return!0}}catch{}}return!1}if(r==="_msearch"){const t=i.startsWith("_"),a=n.split(/\r?\n/);for(let d=0;d<a.length;d+=2){const T=a[d].trim();if(T)try{const y=JSON.parse(T);if(t&&!y.index&&!y.indices||p(y.index)||p(y.indices)||Array.isArray(y.indices)&&y.indices.some(p))return!0}catch{}}return!1}if(r==="_mget"||r==="_mtermvectors"||r==="_termvectors")try{const t=JSON.parse(U(n));return!!(Array.isArray(t==null?void 0:t.docs)&&t.docs.some(a=>a&&p(a._index))||p(t==null?void 0:t.index)||p((s=t==null?void 0:t.parameters)==null?void 0:s.index))}catch{return!1}if(r==="_sql"||i==="_xpack"&&o[1]==="sql"){try{const t=JSON.parse(U(n)),a=(typeof(t==null?void 0:t.query)=="string"?t.query:"").replace(/\/\*[\s\S]*?\*\//g," ").replace(/--[^\n\r]*/g," "),d=/\b(?:FROM|JOIN)\s+([^\s,;()]+(?:\s*,\s*[^\s,;()]+)*)/gi;let T;for(;(T=d.exec(a))!==null;)for(const y of T[1].split(","))if(p(y.trim()))return!0}catch{}return!1}if(r==="_search"||r==="_count"||r==="_render")try{const t=JSON.parse(U(n));return t&&typeof t=="object"&&!Array.isArray(t)&&t.id!==void 0?!0:W(t)}catch{return!1}return!1}function W(c){if(Array.isArray(c))return c.some(W);if(!c||typeof c!="object")return!1;const e=c;if(p(e._index))return!0;for(const t of["terms","terms_set"]){const a=e[t];if(!(!a||typeof a!="object"||Array.isArray(a))){for(const d of Object.values(a))if(d&&typeof d=="object"&&!Array.isArray(d)&&p(d.index))return!0}}for(const t of["percolate","indexed_shape"]){const a=e[t];if(a&&typeof a=="object"&&p(a.index))return!0}const n=e.more_like_this,o=Array.isArray(n)?n:n?[n]:[];for(const t of o){if(!t||typeof t!="object")continue;const a=Array.isArray(t.like)?t.like:t.like?[t.like]:[];for(const d of a)if(d&&typeof d=="object"&&p(d._index))return!0}const i=e.indices_boost??e.index_boost;if(Array.isArray(i)){for(const t of i)if(t&&typeof t=="object"){for(const a of Object.keys(t))if(p(a))return!0}else if(p(t))return!0}else if(i&&typeof i=="object"){for(const t of Object.keys(i))if(p(t))return!0}const r=e.indices;if(r&&typeof r=="object"&&!Array.isArray(r)&&Array.isArray(r.indices)&&r.indices.some(p))return!0;const s=e.wrapper;if(s&&typeof s=="object")for(const t of["query","inline","source","template"]){const a=s[t];if(typeof a!="string"||!a.trim())continue;let d=a;try{d=atob(a)}catch{}try{if(W(JSON.parse(d)))return!0}catch{}}return Object.values(e).some(W)}function Fe(c){const e=String(c||""),n=e.indexOf("?"),o=S(n>=0?e.slice(0,n):e).toLowerCase();if(o!=="/_cluster/health"&&!o.startsWith("/_cluster/health/")||n<0)return!1;const i=e.slice(n+1).split("#")[0];for(const r of i.split("&")){const s=r.indexOf("=");if(!(s<0))try{const t=decodeURIComponent(r.slice(0,s)),a=decodeURIComponent(r.slice(s+1)).trim().toLowerCase();if(t==="level"&&(a==="indices"||a==="shards"))return!0}catch{return!0}}return!1}function at(c,e,n){var t;const o=String(c||"GET").toUpperCase(),i=S(e);if(!i.startsWith("/")||i.includes("..")||i.includes(";")||/%2f|%3b|%5c|%00/i.test(String(e||"").split("?")[0])||ze(e)||Fe(e)||Qe(e)||te(e)||Je(e,n)||$e(e,n))return!1;const r=i.split("/").filter(Boolean);if(r.length===0)return o==="GET"||o==="HEAD";const s=r[0].toLowerCase();if(o==="GET"||o==="HEAD"){if(Be(i))return!1;const a=(t=r[1])==null?void 0:t.toLowerCase();return!(a&&Z.has(a)||a&&ee.has(a)||F(r))}return o!=="POST"&&o!=="PUT"&&o!=="DELETE"?!1:s.startsWith("_")?!!(Ge.has(i)||o==="DELETE"&&Me.has(i)):r.length<2||F(r)?!1:X.has(r[1].toLowerCase())}export{st as E,nt as R,rt as a,ze as b,te as c,Je as d,Qe as e,ot as f,$e as g,at as n};
