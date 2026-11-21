/**
 * 1439：外围写体收口——ML 过滤器/日历（含事件）、Graph 探索、CCR 跟随/自动跟随、
 * 代授 API Key、许可证更新。
 *
 * 这些端点此前一律落 search 默认档：根层键给 query/sort/aggs，写下去 ES 直接 400。
 * 本单源锁定四件事：
 * 1) 路由按方法与子路径精确分派（GET/DELETE/_update/start_trial 不得被写体吞掉）；
 * 2) 根键/嵌套元素键各自成档，lint 共用同一目录（目录和白名单不手抄两份）；
 * 3) 区域助手：query 位回落整棵查询补全，事件/顶点/许可证条目按元素分派；
 * 4) W6/lint 两侧接线都在（只加路由不接补全等于没做）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  bodyKindForPath, STRUCTURED_VALUE_ENUMS,
  mlCalendarEventsRegionAt, graphExploreRegionAt,
  securityApiKeyGrantRegionAt, securityApiKeyQueryRegionAt, securityCrossClusterApiKeyRegionAt, ilmMoveRegionAt,
  watchInlineExecuteRegionAt, licenseRegionAt,
  mlFilterBodyRootKeys, mlFilterUpdateBodyRootKeys, mlCalendarBodyRootKeys, mlCalendarEventKeys,
  graphExploreBodyRootKeys, graphVertexKeys, graphHopKeys,
  ccrFollowBodyRootKeys, ccrAutoFollowBodyRootKeys,
  securityApiKeyGrantBodyRootKeys, securityApiKeyGrantKeys,
  securityApiKeyQueryBodyRootKeys, securityApiKeyInvalidateBodyRootKeys,
  securityCrossClusterApiKeyBodyRootKeys, securityCrossClusterAccessKeys, securityCrossClusterAccessEntryKeys,
  watchExecuteBodyRootKeys, securityPrivilegeEntryKeys, securityPrivilegeRegionAt,
  ilmMoveBodyRootKeys, ilmMoveStepKeys,
  snapshotCloneBodyRootKeys, watchInlineExecuteBodyRootKeys, snapshotMountBodyRootKeys,
  nodesReloadSecureSettingsBodyRootKeys,
  licenseBodyRootKeys, licenseEntryKeys,
} from '../utils/dslCompletionContext';
import { lintStructuredBody } from '../utils/dslLint';

const monacoSrc = readFileSync(join(__dirname, '../components/MonacoEditor.vue'), 'utf-8');
const lintSrc = readFileSync(join(__dirname, '../utils/dslLint.ts'), 'utf-8');

describe('1439 外围写体：路由按方法/子路径精确分派', () => {
  it('写体各归其档', () => {
    expect(bodyKindForPath('/_ml/filters/safe-domains', 'PUT')).toBe('ml-filter-body');
    expect(bodyKindForPath('/_ml/calendars/outages', 'PUT')).toBe('ml-calendar-body');
    expect(bodyKindForPath('/_ml/calendars/outages/events', 'POST')).toBe('ml-calendar-events-body');
    expect(bodyKindForPath('/logs/_graph/explore', 'POST')).toBe('graph-explore-body');
    expect(bodyKindForPath('/follower/_ccr/follow', 'PUT')).toBe('ccr-follow-body');
    expect(bodyKindForPath('/_ccr/auto_follow/leader', 'PUT')).toBe('ccr-auto-follow-body');
    expect(bodyKindForPath('/_security/api_key/grant', 'POST')).toBe('security-api-key-grant-body');
    expect(bodyKindForPath('/_security/_query/api_key', 'POST')).toBe('security-api-key-query-body');
    expect(bodyKindForPath('/_security/_query/api_key', 'GET')).toBe('security-api-key-query-body');
    expect(bodyKindForPath('/_security/api_key', 'PUT')).toBe('security-api-key-body');
    expect(bodyKindForPath('/_security/api_key', 'DELETE')).toBe('security-api-key-invalidate-body');
    expect(bodyKindForPath('/_ml/filters/safe-domains/_update', 'POST')).toBe('ml-filter-update-body');
    expect(bodyKindForPath('/_security/cross_cluster/api_key', 'POST')).toBe('security-cross-cluster-api-key-body');
    expect(bodyKindForPath('/_watcher/watch/error-rate/_execute', 'POST')).toBe('watch-execute-body');
    expect(bodyKindForPath('/_security/privilege', 'PUT')).toBe('security-privilege-body');
    expect(bodyKindForPath('/_security/privilege', 'POST')).toBe('security-privilege-body');
    expect(bodyKindForPath('/_ilm/move/logs', 'POST')).toBe('ilm-move-body');
    expect(bodyKindForPath('/_snapshot/repo/snap/_clone/target', 'PUT')).toBe('snapshot-clone-body');
    expect(bodyKindForPath('/_snapshot/repo/snap/_mount', 'POST')).toBe('snapshot-mount-body');
    expect(bodyKindForPath('/_watcher/watch/_execute', 'POST')).toBe('watch-inline-execute-body');
    expect(bodyKindForPath('/_nodes/reload_secure_settings', 'POST')).toBe('nodes-reload-secure-settings-body');
    expect(bodyKindForPath('/_nodes/node-a/reload_secure_settings', 'POST')).toBe('nodes-reload-secure-settings-body');
    expect(bodyKindForPath('/_license', 'PUT')).toBe('license-body');
    expect(bodyKindForPath('/_license', 'POST')).toBe('license-body');
  });

  it('回归：创建 API Key 仍走创建体，不被 grant 规则抢走', () => {
    expect(bodyKindForPath('/_security/api_key', 'POST')).toBe('security-api-key-body');
    expect(bodyKindForPath('/_security/api_key/', 'POST')).toBe('security-api-key-body');
  });

  it('只读/动作子路由回落 search（不误吞无体端点）', () => {
    expect(bodyKindForPath('/_ml/filters/safe-domains', 'GET')).toBe('search');
    expect(bodyKindForPath('/_ml/calendars/outages', 'DELETE')).toBe('search');
    expect(bodyKindForPath('/_ml/calendars/outages/events', 'PUT')).toBe('search');
    expect(bodyKindForPath('/_ml/calendars/outages/events', 'GET')).toBe('search');
    expect(bodyKindForPath('/logs/_graph/explore', 'GET')).toBe('search');
    expect(bodyKindForPath('/follower/_ccr/follow', 'GET')).toBe('search');
    expect(bodyKindForPath('/_ccr/auto_follow/leader', 'GET')).toBe('search');
    expect(bodyKindForPath('/_ccr/auto_follow', 'PUT')).toBe('search');
    expect(bodyKindForPath('/_license', 'GET')).toBe('search');
    expect(bodyKindForPath('/_license/start_trial', 'POST')).toBe('search');
    expect(bodyKindForPath('/_security/api_key/grant', 'GET')).toBe('search');
    expect(bodyKindForPath('/_security/_query/api_key', 'DELETE')).toBe('search');
    /* 旧的非官方路径形态不再抢档（真实检索路径是 /_security/_query/api_key） */
    expect(bodyKindForPath('/_security/api_key/_query', 'POST')).toBe('search');
    expect(bodyKindForPath('/_ml/filters/safe-domains/_update', 'PUT')).toBe('search');
    expect(bodyKindForPath('/_ml/filters/safe-domains/_update', 'DELETE')).toBe('search');
    expect(bodyKindForPath('/_security/cross_cluster/api_key', 'GET')).toBe('search');
    expect(bodyKindForPath('/_watcher/watch/error-rate/_execute', 'GET')).toBe('search');
    expect(bodyKindForPath('/_security/privilege/myapp/read', 'PUT')).toBe('search');
    expect(bodyKindForPath('/_ilm/move/logs', 'GET')).toBe('search');
    expect(bodyKindForPath('/_snapshot/repo/snap/_clone', 'POST')).toBe('search');
    expect(bodyKindForPath('/_snapshot/repo/snap/_clone', 'PUT')).toBe('search');
    expect(bodyKindForPath('/_snapshot/repo/snap/_mount', 'GET')).toBe('search');
    expect(bodyKindForPath('/_snapshot/repo/snap/_mount', 'PUT')).toBe('search');
    expect(bodyKindForPath('/_watcher/watch/_execute', 'GET')).toBe('search');
    expect(bodyKindForPath('/_nodes/reload_secure_settings', 'GET')).toBe('search');
    expect(bodyKindForPath('/_nodes/stats', 'POST')).toBe('search');
    /* 按 id 试跑仍是独立档，不被内联规则吞 */
    expect(bodyKindForPath('/_watcher/watch/error-rate/_execute', 'POST')).toBe('watch-execute-body');
  });
});

describe('1439 外围写体：目录与 lint 同源', () => {
  it('根键目录覆盖官方字段', () => {
    expect(mlFilterBodyRootKeys).toEqual(['description', 'items']);
    expect(mlFilterUpdateBodyRootKeys).toEqual(['description', 'add_items', 'remove_items']);
    expect(mlCalendarBodyRootKeys).toEqual(['job_ids', 'description']);
    expect(mlCalendarEventKeys).toEqual([
      'description', 'start_time', 'end_time', 'skip_result', 'skip_model_update', 'force_time_shift',
    ]);
    expect(graphExploreBodyRootKeys).toEqual(['query', 'vertices', 'connections', 'controls']);
    expect(graphVertexKeys).toEqual([
      'field', 'size', 'min_doc_count', 'shard_min_doc_count', 'include', 'exclude',
    ]);
    expect(ccrFollowBodyRootKeys).toContain('leader_index');
    expect(ccrFollowBodyRootKeys).toContain('data_stream_name');
    expect(ccrFollowBodyRootKeys).toContain('read_poll_timeout');
    expect(ccrAutoFollowBodyRootKeys).toContain('follow_index_pattern');
    expect(ccrAutoFollowBodyRootKeys).toContain('leader_index_exclusion_patterns');
    expect(securityApiKeyGrantBodyRootKeys).toEqual([
      'grant_type', 'access_token', 'username', 'password', 'api_key',
    ]);
    expect(securityApiKeyGrantKeys).toEqual(['name', 'expiration', 'role_descriptors', 'metadata']);
    expect(securityApiKeyQueryBodyRootKeys).toEqual([
      'query', 'from', 'size', 'sort', 'search_after', 'aggregations', 'aggs',
    ]);
    expect(securityApiKeyInvalidateBodyRootKeys).toEqual(['ids', 'name', 'owner', 'realm_name', 'username']);
    expect(securityCrossClusterApiKeyBodyRootKeys).toEqual(['name', 'access', 'expiration', 'metadata']);
    expect(securityCrossClusterAccessKeys).toEqual(['search', 'replication']);
    expect(securityCrossClusterAccessEntryKeys).toEqual(['names', 'field_security', 'query']);
    expect(watchExecuteBodyRootKeys).toEqual([
      'trigger_data', 'alternative_input', 'ignore_condition', 'action_modes', 'record_execution',
      'simulated_actions',
    ]);
    expect(securityPrivilegeEntryKeys).toEqual(['actions', 'metadata']);
    expect(ilmMoveBodyRootKeys).toEqual(['current_step', 'next_step']);
    expect(ilmMoveStepKeys).toEqual(['phase', 'action', 'name']);
    expect(snapshotCloneBodyRootKeys).toEqual(['indices', 'index_settings', 'ignore_index_settings']);
    expect(snapshotMountBodyRootKeys).toEqual([
      'index', 'renamed_index', 'index_settings', 'ignore_index_settings', 'storage',
    ]);
    expect(watchInlineExecuteBodyRootKeys).toEqual([
      'watch', 'trigger_data', 'alternative_input', 'ignore_condition', 'action_modes', 'record_execution',
      'simulated_actions',
    ]);
    expect(nodesReloadSecureSettingsBodyRootKeys).toEqual(['secure_settings_password']);
    expect(licenseBodyRootKeys).toEqual(['licenses', 'license']);
    expect(licenseEntryKeys).toContain('uid');
    expect(licenseEntryKeys).toContain('max_resource_units');
  });

  it('合法体零告警', () => {
    expect(lintStructuredBody('ml-filter-body', '{"description":"safe","items":["*.example.com"]}')).toEqual([]);
    expect(lintStructuredBody('ml-filter-update-body',
      '{"description":"safe","add_items":["*.example.com"],"remove_items":["*.old.com"]}')).toEqual([]);
    expect(lintStructuredBody('security-api-key-query-body',
      '{"query":{"wildcard":{"name":"my-api-*"}},"from":0,"size":10,'
      + '"sort":[{"creation":{"order":"desc"}}],"search_after":["v"],"aggs":{}}')).toEqual([]);
    expect(lintStructuredBody('security-api-key-invalidate-body',
      '{"ids":["k1"],"owner":true,"realm_name":"native1","username":"u"}')).toEqual([]);
    expect(lintStructuredBody('security-cross-cluster-api-key-body',
      '{"name":"ccs","access":{"search":[{"names":["logs-*"]}],"replication":[{"names":["archive-*"]}]}}')).toEqual([]);
    expect(lintStructuredBody('watch-execute-body',
      '{"ignore_condition":false,"record_execution":true,"action_modes":{"notify":"force_execute"},'
      + '"simulated_actions":{"use_all":true}}')).toEqual([]);
    expect(lintStructuredBody('security-privilege-body',
      '{"myapp":{"read":{"actions":["read"],"metadata":{}}}}')).toEqual([]);
    expect(lintStructuredBody('ilm-move-body',
      '{"current_step":{"phase":"hot","action":"rollover"},"next_step":{"phase":"warm","action":"forcemerge"}}')).toEqual([]);
    expect(lintStructuredBody('snapshot-clone-body',
      '{"indices":"logs-*","index_settings":{"index.number_of_replicas":1},"ignore_index_settings":["index.refresh_interval"]}')).toEqual([]);
    expect(lintStructuredBody('snapshot-mount-body',
      '{"index":"logs","renamed_index":"logs-restored","storage":"shared_cache"}')).toEqual([]);
    expect(lintStructuredBody('nodes-reload-secure-settings-body',
      '{"secure_settings_password":"secret"}')).toEqual([]);
    expect(lintStructuredBody('watch-inline-execute-body',
      '{"watch":{"trigger":{"schedule":{"interval":"5m"}},"input":{"simple":{}},'
      + '"condition":{"always":{}},"actions":{"log":{"logging":{"text":"fired"}}}},'
      + '"record_execution":false}')).toEqual([]);
    expect(lintStructuredBody('ml-calendar-body', '{"job_ids":["j1"],"description":"outages"}')).toEqual([]);
    expect(lintStructuredBody('ml-calendar-events-body',
      '{"events":[{"description":"m","start_time":1700000000000,"end_time":1700003600000,'
      + '"skip_result":true,"skip_model_update":false,"force_time_shift":3600}]}')).toEqual([]);
    expect(lintStructuredBody('graph-explore-body',
      '{"query":{"match_all":{}},"vertices":[{"field":"a","size":3}],'
      + '"controls":{"sample_size":50,"sample_diversity":{"field":"c","max_docs_per_value":1}},'
      + '"connections":{"vertices":[{"field":"b"}],"query":{"match_all":{}},'
      + '"connections":{"vertices":[{"field":"c"}]}}}')).toEqual([]);
    expect(lintStructuredBody('ccr-follow-body',
      '{"remote_cluster":"leader","leader_index":"logs","max_outstanding_read_requests":12,'
      + '"read_poll_timeout":"1m","settings":{"index.number_of_replicas":1}}')).toEqual([]);
    expect(lintStructuredBody('ccr-auto-follow-body',
      '{"remote_cluster":"leader","follow_index_pattern":"{{leader_index}}-follower",'
      + '"leader_index_patterns":["logs-*"],"leader_index_exclusion_patterns":["*-test"]}')).toEqual([]);
    expect(lintStructuredBody('security-api-key-grant-body',
      '{"grant_type":"access_token","access_token":"t","api_key":{"name":"k","expiration":"1d"}}')).toEqual([]);
    expect(lintStructuredBody('license-body',
      '{"licenses":[{"uid":"u","type":"enterprise","issue_date_in_millis":1,'
      + '"expiry_date_in_millis":2,"issued_to":"c","issuer":"e","signature":"s"}]}')).toEqual([]);
  });

  it('非法根键/元素键各自报点，消息带区块名', () => {
    expect(lintStructuredBody('ml-filter-body', '{"item":[]}')
      .some(f => f.rule === 'body-root-key' && f.message.includes('ML 过滤器体'))).toBe(true);
    expect(lintStructuredBody('ml-calendar-events-body',
      '{"events":[{"start_time":1,"end_time":2,"skip":true}]}')
      .some(f => f.message.includes('日历事件 #1'))).toBe(true);
    expect(lintStructuredBody('ml-filter-update-body', '{"item":[]}')
      .some(f => f.message.includes('ML 过滤器更新体'))).toBe(true);
    expect(lintStructuredBody('security-api-key-query-body', '{"sorts":[]}')
      .some(f => f.message.includes('API Key 检索体'))).toBe(true);
    expect(lintStructuredBody('security-api-key-invalidate-body', '{"key_ids":[]}')
      .some(f => f.message.includes('API Key 吊销体'))).toBe(true);
    expect(lintStructuredBody('security-cross-cluster-api-key-body', '{"acces":{}}')
      .some(f => f.message.includes('跨集群 API Key 体'))).toBe(true);
    expect(lintStructuredBody('security-cross-cluster-api-key-body',
      '{"access":{"search":[{"name":[]}]}}')
      .some(f => f.message.includes('跨集群 search #1'))).toBe(true);
    expect(lintStructuredBody('watch-execute-body', '{"record":true}')
      .some(f => f.message.includes('试跑 Watch 体'))).toBe(true);
    expect(lintStructuredBody('security-privilege-body', '{"myapp":{"read":{"action":[]}}}')
      .some(f => f.message.includes('应用权限 myapp/read'))).toBe(true);
    expect(lintStructuredBody('ilm-move-body', '{"current_step":{"phas":"hot"}}')
      .some(f => f.message.includes('ILM 当前步骤'))).toBe(true);
    expect(lintStructuredBody('snapshot-clone-body', '{"index":[]}')
      .some(f => f.message.includes('克隆快照体'))).toBe(true);
    expect(lintStructuredBody('snapshot-mount-body', '{"idx":[]}')
      .some(f => f.message.includes('挂载快照体'))).toBe(true);
    expect(lintStructuredBody('nodes-reload-secure-settings-body', '{"password":"x"}')
      .some(f => f.message.includes('重载密钥库体'))).toBe(true);
    expect(lintStructuredBody('watch-inline-execute-body', '{"watc":{}}')
      .some(f => f.message.includes('内联试跑 Watch 体'))).toBe(true);
    expect(lintStructuredBody('watch-inline-execute-body', '{"watch":{"triger":{}}}')
      .some(f => f.message.includes('内联 Watch 定义'))).toBe(true);
    expect(lintStructuredBody('watch-inline-execute-body',
      '{"watch":{"trigger":{"schedule":{"intervall":"5m"}}}}')
      .some(f => f.message.includes('内联 Watch 调度'))).toBe(true);
    expect(lintStructuredBody('watch-inline-execute-body',
      '{"watch":{"actions":{"log":{"loging":{}}}}}')
      .some(f => f.message.includes('内联 Watch 动作 log'))).toBe(true);
    expect(lintStructuredBody('graph-explore-body',
      '{"vertices":[{"filed":"a"}],"connections":{"vertex":[]}}')
      .some(f => f.message.includes('顶点 #1'))).toBe(true);
    expect(lintStructuredBody('graph-explore-body',
      '{"vertices":[{"filed":"a"}],"connections":{"vertex":[]}}')
      .some(f => f.message.includes('Graph hop #1'))).toBe(true);
    expect(lintStructuredBody('ccr-follow-body', '{"remote_cluster":"x","leader_idx":"y"}')
      .some(f => f.message.includes('CCR 跟随体'))).toBe(true);
    expect(lintStructuredBody('ccr-auto-follow-body', '{"remote_cluster":"x","follow_pattern":"y"}')
      .some(f => f.message.includes('CCR 自动跟随模式'))).toBe(true);
    expect(lintStructuredBody('security-api-key-grant-body',
      '{"grant_type":"token","granttt":{},"api_key":{"nam":"x"}}')
      .some(f => f.message.includes('代授 API Key 体'))).toBe(true);
    expect(lintStructuredBody('security-api-key-grant-body',
      '{"grant_type":"token","api_key":{"nam":"x"}}')
      .some(f => f.message.includes('代授 API Key 参数'))).toBe(true);
    expect(lintStructuredBody('license-body', '{"licences":[]}')
      .some(f => f.message.includes('许可证体'))).toBe(true);
    expect(lintStructuredBody('license-body', '{"licenses":[{"uidd":"x"}]}')
      .some(f => f.message.includes('许可证 #1'))).toBe(true);
  });
});

/* 光标位用 | 标记：去掉标记后的下标即 offset，避免手算偏移。 */
function at(src: string): [string, number] {
  const i = src.indexOf('|');
  return [src.slice(0, i) + src.slice(i + 1), i];
}

describe('1439 外围写体：区域助手（query 位回落 / 元素分派）', () => {
  it('日历事件区域：根 / events 元素 / 更深', () => {
    expect(mlCalendarEventsRegionAt(...at('{ "|": 1 }'))).toBe('root');
    expect(mlCalendarEventsRegionAt(...at('{ "events": [ { "|": 1 } ] }'))).toBe('event');
    expect(mlCalendarEventsRegionAt(...at('{ "events": [ { "start_time": { "|": 1 } } ] }'))).toBe('deep');
  });

  it('Graph 区域：根 query 与 hop.query 都回落查询补全', () => {
    expect(graphExploreRegionAt(...at('{ "|": 1 }'))).toBe('root');
    expect(graphExploreRegionAt(...at('{ "query": { "|": 1 } }'))).toBe('query');
    expect(graphExploreRegionAt(...at('{ "connections": { "query": { "|": 1 } } }'))).toBe('query');
    expect(graphExploreRegionAt(...at('{ "vertices": [ { "|": 1 } ] }'))).toBe('vertex');
    expect(graphExploreRegionAt(...at('{ "connections": { "vertices": [ { "|": 1 } ] } }'))).toBe('vertex');
    expect(graphExploreRegionAt(...at('{ "controls": { "|": 1 } }'))).toBe('controls');
    expect(graphExploreRegionAt(...at('{ "controls": { "sample_diversity": { "|": 1 } } }'))).toBe('sample-diversity');
    expect(graphExploreRegionAt(...at('{ "connections": { "|": 1 } }'))).toBe('hop');
    expect(graphExploreRegionAt(...at('{ "connections": { "connections": { "|": 1 } } }'))).toBe('hop');
  });

  it('应用权限区域：根 / 应用层 / 权限条目 / 更深', () => {
    expect(securityPrivilegeRegionAt(...at('{ "|": 1 }'))).toBe('root');
    expect(securityPrivilegeRegionAt(...at('{ "myapp": { "|": 1 } }'))).toBe('app');
    expect(securityPrivilegeRegionAt(...at('{ "myapp": { "read": { "|": 1 } } }'))).toBe('privilege');
    expect(securityPrivilegeRegionAt(...at('{ "myapp": { "read": { "metadata": { "|": 1 } } } }'))).toBe('deep');
  });

  it('API Key 检索区域：根 / query 回落 / 更深', () => {
    expect(securityApiKeyQueryRegionAt(...at('{ "|": 1 }'))).toBe('root');
    expect(securityApiKeyQueryRegionAt(...at('{ "query": { "|": 1 } }'))).toBe('query');
    expect(securityApiKeyQueryRegionAt(...at('{ "query": { "wildcard": { "|": 1 } } }'))).toBe('query');
    expect(securityApiKeyQueryRegionAt(...at('{ "query": { "wildcard": { "name": "x" } }, "from": { "|": 1 } }'))).toBe('deep');
  });

  it('跨集群 Key 区域：根 / access / 权限元素 / 更深', () => {
    expect(securityCrossClusterApiKeyRegionAt(...at('{ "|": 1 }'))).toBe('root');
    expect(securityCrossClusterApiKeyRegionAt(...at('{ "access": { "|": 1 } }'))).toBe('access');
    expect(securityCrossClusterApiKeyRegionAt(...at('{ "access": { "search": [ { "|": 1 } ] } }'))).toBe('entry');
    expect(securityCrossClusterApiKeyRegionAt(...at('{ "access": { "replication": [ { "|": 1 } ] } }'))).toBe('entry');
    expect(securityCrossClusterApiKeyRegionAt(
      ...at('{ "access": { "search": [ { "query": { "|": 1 } } ] } }'),
    )).toBe('query');
    expect(securityCrossClusterApiKeyRegionAt(
      ...at('{ "access": { "search": [ { "query": { "bool": { "|": 1 } } } ] } }'),
    )).toBe('query');
    expect(securityCrossClusterApiKeyRegionAt(...at('{ "access": { "search": [ { "field_security": { "|": 1 } } ] } }'))).toBe('deep');
  });

  it('内联试跑区域：根 / watch 定义 / 触发器·调度·输入·条件·动作', () => {
    expect(watchInlineExecuteRegionAt(...at('{ "|": 1 }'))).toBe('root');
    expect(watchInlineExecuteRegionAt(...at('{ "watch": { "|": 1 } }'))).toBe('watch');
    expect(watchInlineExecuteRegionAt(...at('{ "watch": { "trigger": { "|": 1 } } }'))).toBe('watch-trigger');
    expect(watchInlineExecuteRegionAt(...at('{ "watch": { "trigger": { "schedule": { "|": 1 } } } }'))).toBe('watch-schedule');
    expect(watchInlineExecuteRegionAt(...at('{ "watch": { "trigger": { "chain": [ { "|": 1 } ] } } }'))).toBe('chain-trigger');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "trigger": { "chain": [ { "trigger": { "|": 1 } } ] } } }'),
    )).toBe('chain-trigger-container');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "trigger": { "chain": [ { "trigger": { "schedule": { "|": 1 } } } ] } } }'),
    )).toBe('watch-schedule');
    expect(watchInlineExecuteRegionAt(...at('{ "watch": { "input": { "|": 1 } } }'))).toBe('watch-input');
    expect(watchInlineExecuteRegionAt(...at('{ "watch": { "condition": { "|": 1 } } }'))).toBe('watch-condition');
    expect(watchInlineExecuteRegionAt(...at('{ "watch": { "actions": { "log": { "|": 1 } } } }'))).toBe('watch-action');
    expect(watchInlineExecuteRegionAt(...at('{ "trigger_data": { "|": 1 } }'))).toBe('deep');
    expect(watchInlineExecuteRegionAt(...at('{ "watch": { "input": { "search": { "|": 1 } } } }'))).toBe('search-input');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "input": { "search": { "request": { "|": 1 } } } } }'),
    )).toBe('search-request');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "input": { "http": { "request": { "|": 1 } } } } }'),
    )).toBe('http-request');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "input": { "chain": { "|": 1 } } } }'),
    )).toBe('chain-input-container');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "input": { "chain": { "inputs": [ { "first": { "|": 1 } } ] } } } }'),
    )).toBe('chain-input');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "actions": { "mail": { "email": { "body": { "|": 1 } } } } } }'),
    )).toBe('action-email-body');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "actions": { "chat": { "slack": { "message": { "|": 1 } } } } } }'),
    )).toBe('action-slack-message');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "input": { "http": { "request": { "auth": { "basic": { "|": 1 } } } } } } }'),
    )).toBe('http-auth-basic');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "input": { "search": { "request": { "body": { "|": 1 } } } } } }'),
    )).toBe('watch-search-body');
    expect(watchInlineExecuteRegionAt(
      ...at('{ "watch": { "input": { "search": { "request": { "body": { "query": { "|": 1 } } } } } } }'),
    )).toBe('watch-search-query');
  });

  it('ILM 推进区域：根 / current_step·next_step / 更深', () => {
    expect(ilmMoveRegionAt(...at('{ "|": 1 }'))).toBe('root');
    expect(ilmMoveRegionAt(...at('{ "current_step": { "|": 1 } }'))).toBe('step');
    expect(ilmMoveRegionAt(...at('{ "next_step": { "|": 1 } }'))).toBe('step');
    expect(ilmMoveRegionAt(...at('{ "current_step": { "phase": { "|": 1 } } }'))).toBe('deep');
  });

  it('代授区域：根 / api_key 对象 / 更深', () => {
    expect(securityApiKeyGrantRegionAt(...at('{ "|": 1 }'))).toBe('root');
    expect(securityApiKeyGrantRegionAt(...at('{ "api_key": { "|": 1 } }'))).toBe('api-key');
    expect(securityApiKeyGrantRegionAt(...at('{ "api_key": { "role_descriptors": { "|": 1 } } }'))).toBe('deep');
  });

  it('许可证区域：licenses 元素与 license 对象同档', () => {
    expect(licenseRegionAt(...at('{ "|": 1 }'))).toBe('root');
    expect(licenseRegionAt(...at('{ "licenses": [ { "|": 1 } ] }'))).toBe('entry');
    expect(licenseRegionAt(...at('{ "license": { "|": 1 } }'))).toBe('entry');
    expect(licenseRegionAt(...at('{ "license": { "type": { "|": 1 } } }'))).toBe('deep');
  });

  it('值位枚举：grant_type / 日历事件布尔开关 / Graph 显著性', () => {
    expect(STRUCTURED_VALUE_ENUMS.grant_type.values).toEqual(['access_token', 'password']);
    expect(STRUCTURED_VALUE_ENUMS.skip_result.values).toEqual(['true', 'false']);
    expect(STRUCTURED_VALUE_ENUMS.skip_model_update.values).toEqual(['true', 'false']);
    expect(STRUCTURED_VALUE_ENUMS.use_significance.values).toEqual(['true', 'false']);
    expect(STRUCTURED_VALUE_ENUMS.owner.values).toEqual(['true', 'false']);
    expect(STRUCTURED_VALUE_ENUMS.ignore_condition.values).toEqual(['false', 'true']);
    expect(STRUCTURED_VALUE_ENUMS.record_execution.values).toEqual(['false', 'true']);
    expect(STRUCTURED_VALUE_ENUMS.storage).toEqual({
      values: ['shared_cache', 'full_copy'], quoted: true, detail: '挂载快照的存储方式',
    });
  });
});

describe('1439 外围写体：W6/lint 接线在（只加路由不算完成）', () => {
  it('Monaco 键档分派覆盖全部新档', () => {
    for (const k of [
      'ml-filter-body', 'ml-calendar-body', 'ml-calendar-events-body', 'graph-explore-body',
      'ccr-follow-body', 'ccr-auto-follow-body', 'security-api-key-grant-body', 'license-body',
      'security-api-key-query-body', 'security-api-key-invalidate-body', 'ml-filter-update-body',
      'security-cross-cluster-api-key-body', 'watch-execute-body',
      'security-privilege-body', 'ilm-move-body', 'snapshot-clone-body', 'watch-inline-execute-body',
      'snapshot-mount-body', 'nodes-reload-secure-settings-body',
    ]) {
      expect(monacoSrc, k).toContain(`bk === '${k}'`);
    }
    expect(monacoSrc).toContain("gphRegion !== 'query'");
  });

  it('lint 分派覆盖全部新档', () => {
    for (const k of [
      'ml-filter-body', 'ml-calendar-body', 'ml-calendar-events-body', 'graph-explore-body',
      'ccr-follow-body', 'ccr-auto-follow-body', 'security-api-key-grant-body', 'license-body',
      'security-api-key-query-body', 'security-api-key-invalidate-body', 'ml-filter-update-body',
      'security-cross-cluster-api-key-body', 'watch-execute-body',
      'security-privilege-body', 'ilm-move-body', 'snapshot-clone-body', 'watch-inline-execute-body',
      'snapshot-mount-body', 'nodes-reload-secure-settings-body',
    ]) {
      expect(lintSrc, k).toContain(`case '${k}'`);
    }
  });
});
