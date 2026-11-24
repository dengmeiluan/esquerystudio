/**
 * 1439：请求体语义档「路由矩阵」总闸。
 *
 * 本会话按端点逐批补齐 bodyKindForPath 分档与 W6/lint 接线；这份矩阵把所有档位与
 * 代表路径钉在一起，并反向断言「档位全集 = 矩阵覆盖集」——新增档位必须同步矩阵，
 * 路径/方法守卫（_simulate、_update、_start、api_key/grant…）也不会被后续规则吞掉。
 */
import { describe, it, expect } from 'vitest';
import { bodyKindForPath, type BodyKind } from '../utils/dslCompletionContext';
import { ES_ENDPOINTS } from '../utils/esEndpoints';

type Row = [string, string, BodyKind];

const MATRIX: Row[] = [
  ['/idx/_search', 'POST', 'search'],
  ['/idx/_settings', 'PUT', 'settings'],
  ['/idx/_mapping', 'PUT', 'mapping'],
  ['/_index_template/logs', 'PUT', 'template'],
  ['/_component_template/base', 'PUT', 'template'],
  ['/idx/_doc', 'POST', 'doc'],
  ['/idx/_doc/1', 'PUT', 'doc'],
  ['/idx/_create/1', 'PUT', 'doc'],
  ['/idx/_source', 'GET', 'doc'],
  ['/_analyze', 'POST', 'analyze'],
  ['/idx', 'PUT', 'index-body'],
  ['/idx/_alias/a1', 'PUT', 'alias-body'],
  ['/_aliases', 'POST', 'aliases-body'],
  ['/_reindex', 'POST', 'reindex-body'],
  ['/_sql', 'POST', 'sql-body'],
  ['/_sql/translate', 'POST', 'sql-body'],
  ['/idx/_update/1', 'POST', 'update-body'],
  ['/_transform/_preview', 'POST', 'transform-body'],
  ['/_transform/daily/_update', 'POST', 'transform-body'],
  ['/idx/_rollover', 'POST', 'rollover-body'],
  ['/idx/_delete_by_query', 'POST', 'dbq-body'],
  ['/idx/_update_by_query', 'POST', 'ubq-body'],
  ['/idx/_count', 'POST', 'query-body'],
  ['/idx/_explain/1', 'POST', 'query-body'],
  ['/idx/_validate/query', 'POST', 'query-body'],
  ['/idx/_search/template', 'POST', 'template-search-body'],
  ['/_render/template', 'POST', 'template-search-body'],
  ['/idx/_mget', 'POST', 'mget-body'],
  ['/_scripts/my-script', 'PUT', 'stored-script-body'],
  ['/_scripts/my-script', 'POST', 'stored-script-body'],
  ['/_scripts/my-script/painless_test', 'POST', 'stored-script-body'],
  ['/_scripts/my-script/_execute', 'POST', 'script-execute-body'],
  ['/_search/scroll', 'POST', 'scroll-body'],
  ['/_search/scroll', 'DELETE', 'clear-scroll-body'],
  ['/_clear_scroll', 'POST', 'clear-scroll-body'],
  ['/idx/_termvectors/1', 'POST', 'termvectors-body'],
  ['/idx/_mtermvectors', 'POST', 'mtermvectors-body'],
  ['/idx/_msearch', 'POST', 'msearch-body'],
  ['/idx/_msearch/template', 'POST', 'msearch-template-body'],
  ['/idx/_bulk', 'POST', 'bulk-body'],
  ['/idx/_field_caps', 'POST', 'field-caps-body'],
  ['/idx/_terms_enum', 'POST', 'terms-enum-body'],
  ['/idx/_rank_eval', 'POST', 'rank-eval-body'],
  ['/idx/_eql/search', 'POST', 'eql-body'],
  ['/_cluster/settings', 'PUT', 'cluster-settings-body'],
  ['/_cluster/reroute', 'POST', 'reroute-body'],
  ['/_cluster/allocation/explain', 'POST', 'allocation-explain-body'],
  ['/_snapshot/repo', 'PUT', 'snapshot-repo-body'],
  ['/_snapshot/repo', 'POST', 'snapshot-repo-body'],
  ['/_snapshot/repo/snap', 'PUT', 'snapshot-create-body'],
  ['/_snapshot/repo/snap/_restore', 'POST', 'snapshot-restore-body'],
  ['/_snapshot/repo/snap/_clone/target', 'PUT', 'snapshot-clone-body'],
  ['/_snapshot/repo/snap/_mount', 'POST', 'snapshot-mount-body'],
  ['/_slm/policy/nightly', 'PUT', 'slm-policy-body'],
  ['/_ilm/policy/nightly', 'PUT', 'ilm-policy-body'],
  ['/_ilm/move/logs', 'POST', 'ilm-move-body'],
  ['/_watcher/watch/error-rate', 'PUT', 'watch-body'],
  ['/_watcher/watch/error-rate', 'POST', 'watch-body'],
  ['/_security/role/analyst', 'PUT', 'security-role-body'],
  ['/_security/user/jdoe', 'PUT', 'security-user-body'],
  ['/_security/role_mapping/devs', 'PUT', 'security-role-mapping-body'],
  ['/_security/api_key', 'POST', 'security-api-key-body'],
  ['/_security/api_key', 'PUT', 'security-api-key-body'],
  ['/_ingest/pipeline/logs-v1', 'PUT', 'ingest-pipeline-body'],
  ['/_ingest/pipeline/_simulate', 'POST', 'ingest-simulate-body'],
  ['/_enrich/policy/users', 'PUT', 'enrich-policy-body'],
  ['/_transform/daily', 'PUT', 'transform-body'],
  ['/_rollup/job/daily', 'PUT', 'rollup-job-body'],
  ['/_ml/datafeeds/latency', 'PUT', 'ml-datafeed-body'],
  ['/_ml/anomaly_detectors/latency', 'PUT', 'ml-job-body'],
  ['/_ml/filters/safe-domains', 'PUT', 'ml-filter-body'],
  ['/_ml/filters/safe-domains/_update', 'POST', 'ml-filter-update-body'],
  ['/_ml/calendars/outages', 'PUT', 'ml-calendar-body'],
  ['/_ml/calendars/outages/events', 'POST', 'ml-calendar-events-body'],
  ['/idx/_graph/explore', 'POST', 'graph-explore-body'],
  ['/follower/_ccr/follow', 'PUT', 'ccr-follow-body'],
  ['/_ccr/auto_follow/leader', 'PUT', 'ccr-auto-follow-body'],
  ['/_security/api_key/grant', 'POST', 'security-api-key-grant-body'],
  ['/_security/_query/api_key', 'POST', 'security-api-key-query-body'],
  ['/_security/_query/api_key', 'GET', 'security-api-key-query-body'],
  ['/_security/api_key', 'DELETE', 'security-api-key-invalidate-body'],
  ['/_security/cross_cluster/api_key', 'POST', 'security-cross-cluster-api-key-body'],
  ['/_security/privilege', 'PUT', 'security-privilege-body'],
  ['/_security/privilege', 'POST', 'security-privilege-body'],
  ['/_watcher/watch/error-rate/_execute', 'POST', 'watch-execute-body'],
  ['/_watcher/watch/_execute', 'POST', 'watch-inline-execute-body'],
  ['/_license', 'PUT', 'license-body'],
  ['/_nodes/reload_secure_settings', 'POST', 'nodes-reload-secure-settings-body'],
  ['/_nodes/node-a/reload_secure_settings', 'POST', 'nodes-reload-secure-settings-body'],
  ['/idx/_close', 'POST', 'none'],
  ['/idx/_forcemerge', 'POST', 'none'],
  ['/_scripts', 'GET', 'none'],
];

const ALL_KINDS: BodyKind[] = [
  'search', 'settings', 'mapping', 'template', 'doc', 'analyze', 'index-body', 'alias-body',
  'aliases-body', 'reindex-body', 'sql-body', 'update-body', 'rollover-body', 'dbq-body', 'ubq-body',
  'query-body', 'template-search-body', 'mget-body', 'stored-script-body', 'script-execute-body',
  'scroll-body', 'clear-scroll-body', 'termvectors-body', 'mtermvectors-body', 'msearch-body',
  'msearch-template-body', 'bulk-body', 'field-caps-body', 'terms-enum-body', 'rank-eval-body',
  'eql-body', 'cluster-settings-body', 'reroute-body', 'allocation-explain-body',
  'snapshot-repo-body', 'snapshot-create-body', 'snapshot-restore-body', 'slm-policy-body',
  'ilm-policy-body', 'watch-body', 'security-role-body', 'security-user-body',
  'security-role-mapping-body', 'security-api-key-body', 'ingest-pipeline-body',
  'ingest-simulate-body', 'enrich-policy-body', 'transform-body', 'rollup-job-body',
  'ml-datafeed-body', 'ml-job-body', 'ml-filter-body', 'ml-calendar-body',
  'ml-calendar-events-body', 'graph-explore-body', 'ccr-follow-body', 'ccr-auto-follow-body',
  'security-api-key-grant-body', 'license-body', 'security-api-key-query-body',
  'security-api-key-invalidate-body', 'ml-filter-update-body',
  'security-cross-cluster-api-key-body', 'watch-execute-body',
  'security-privilege-body', 'ilm-move-body', 'snapshot-clone-body',
  'watch-inline-execute-body', 'snapshot-mount-body', 'nodes-reload-secure-settings-body', 'none',
];

describe('1439 请求体档位路由矩阵', () => {
  it('每个代表路径都落到预期档位', () => {
    for (const [path, method, kind] of MATRIX) {
      expect(bodyKindForPath(path, method), `${method} ${path}`).toBe(kind);
    }
  });

  it('档位全集 = 矩阵覆盖集（新增档位必须同步矩阵）', () => {
    expect(new Set(MATRIX.map(r => r[2]))).toEqual(new Set(ALL_KINDS));
    expect(ALL_KINDS.length).toBe(new Set(ALL_KINDS).size);
  });

  it('方法/子路径守卫：只读或动作子路由不被写体吞掉', () => {
    const guards: Row[] = [
      ['/_snapshot/_status', 'GET', 'search'],
      ['/_snapshot/repo', 'GET', 'search'],
      ['/_snapshot/repo/snap/_status', 'GET', 'search'],
      ['/_snapshot/repo/snap/_clone', 'POST', 'search'],
      ['/_snapshot/repo/snap/_clone', 'PUT', 'search'],
      ['/_snapshot/repo/snap/_mount', 'GET', 'search'],
      ['/_snapshot/repo/snap/_mount', 'PUT', 'search'],
      ['/_ingest/pipeline/logs-v1', 'GET', 'search'],
      ['/_security/api_key', 'GET', 'search'],
      ['/_security/role/analyst', 'GET', 'search'],
      ['/_security/role_mapping/devs', 'GET', 'search'],
      ['/_security/user/jdoe', 'DELETE', 'search'],
      ['/_ilm/policy/nightly', 'GET', 'search'],
      ['/_ilm/move/logs', 'GET', 'search'],
      ['/_slm/policy/nightly', 'DELETE', 'search'],
      ['/_watcher/watch/error-rate/_execute', 'GET', 'search'],
      ['/_watcher/watch/error-rate/_execute', 'PUT', 'search'],
      ['/_watcher/watch/_execute', 'GET', 'search'],
      ['/_transform/daily/_start', 'POST', 'search'],
      ['/_transform/daily/_preview', 'POST', 'search'],
      ['/_transform/_preview', 'GET', 'search'],
      ['/_transform/daily/_update', 'GET', 'search'],
      ['/_rollup/job/daily/_start', 'POST', 'search'],
      ['/_ml/anomaly_detectors/latency/_update', 'POST', 'search'],
      ['/_ml/datafeeds/latency/_update', 'POST', 'search'],
      ['/_ml/filters/safe-domains/_update', 'PUT', 'search'],
      ['/_ml/filters/safe-domains/_update', 'DELETE', 'search'],
      ['/_ml/filters/safe-domains', 'GET', 'search'],
      ['/_ml/calendars/outages', 'DELETE', 'search'],
      ['/_ml/calendars/outages/events', 'GET', 'search'],
      ['/idx/_graph/explore', 'GET', 'search'],
      ['/follower/_ccr/follow', 'GET', 'search'],
      ['/_ccr/auto_follow/leader', 'GET', 'search'],
      ['/_ccr/auto_follow', 'PUT', 'search'],
      ['/_license', 'GET', 'search'],
      ['/_nodes/reload_secure_settings', 'GET', 'search'],
      ['/_nodes/stats', 'POST', 'search'],
      ['/_license/start_trial', 'POST', 'search'],
      ['/_security/api_key/grant', 'GET', 'search'],
      ['/_security/privilege/myapp/read', 'PUT', 'search'],
      ['/_security/_query/api_key', 'DELETE', 'search'],
      ['/_security/api_key/_query', 'POST', 'search'],
      ['/_security/api_key/_query', 'DELETE', 'search'],
      ['/_enrich/policy/users/_execute', 'POST', 'search'],
    ];
    for (const [path, method, kind] of guards) {
      expect(bodyKindForPath(path, method), `${method} ${path}`).toBe(kind);
    }
  });

  it('全量普查：目录里所有带骨架的预设都有语义档（search 仅限搜索端点）', () => {
    /* 缺陷形态：POST /{index}/_doc 曾因分档只看 '/_doc/' 而落 search，文档体被根键误报。
       这里对目录全量扫描，新增预设若忘了接分档会直接红。 */
    const searchPaths = new Set(['/{index}/_search', '/_search']);
    for (const ep of ES_ENDPOINTS.filter(e => e.body)) {
      const concrete = ep.path.replace('{index}', 'logs').replace(/\{[^}]+\}/g, 'x');
      const kinds = ep.methods.map(m => bodyKindForPath(concrete, m));
      if (searchPaths.has(ep.path)) {
        expect(kinds.every(k => k === 'search'), ep.path).toBe(true);
        continue;
      }
      expect(kinds.some(k => k !== 'search'), `${ep.methods.join('/')} ${ep.path}`).toBe(true);
    }
  });

  it('端点目录里的管理面预设体都落到对应档位（发现入口与补全同源）', () => {
    const expectByPath: Array<[string, BodyKind]> = [
      ['/_index_template/{name}', 'template'],
      ['/_component_template/{name}', 'template'],
      ['/_ingest/pipeline/{pipeline_id}', 'ingest-pipeline-body'],
      ['/_ingest/pipeline/_simulate', 'ingest-simulate-body'],
      ['/_scripts/{id}', 'stored-script-body'],
      ['/_scripts/{id}/_execute', 'script-execute-body'],
      ['/_snapshot/{repository}', 'snapshot-repo-body'],
      ['/_snapshot/{repository}/{snapshot}', 'snapshot-create-body'],
      ['/_snapshot/{repository}/{snapshot}/_restore', 'snapshot-restore-body'],
      ['/_snapshot/{repository}/{snapshot}/_clone/{target_snapshot}', 'snapshot-clone-body'],
      ['/_snapshot/{repository}/{snapshot}/_mount', 'snapshot-mount-body'],
      ['/_slm/policy/{policy_id}', 'slm-policy-body'],
      ['/_ilm/policy/{policy_id}', 'ilm-policy-body'],
      ['/_ilm/move/{index}', 'ilm-move-body'],
      ['/_watcher/watch/{watch_id}', 'watch-body'],
      ['/_transform/{transform_id}', 'transform-body'],
      ['/_transform/_preview', 'transform-body'],
      ['/_transform/{transform_id}/_update', 'transform-body'],
      ['/_rollup/job/{job_id}', 'rollup-job-body'],
      ['/_enrich/policy/{policy_id}', 'enrich-policy-body'],
      ['/_ml/anomaly_detectors/{job_id}', 'ml-job-body'],
      ['/_ml/datafeeds/{datafeed_id}', 'ml-datafeed-body'],
      ['/_security/role/{name}', 'security-role-body'],
      ['/_security/user/{name}', 'security-user-body'],
      ['/_security/role_mapping/{name}', 'security-role-mapping-body'],
      ['/_security/api_key', 'security-api-key-body'],
      ['/_security/api_key/grant', 'security-api-key-grant-body'],
      ['/_security/_query/api_key', 'security-api-key-query-body'],
      ['/_security/cross_cluster/api_key', 'security-cross-cluster-api-key-body'],
      ['/_security/privilege', 'security-privilege-body'],
      ['/_watcher/watch/{watch_id}/_execute', 'watch-execute-body'],
      ['/_watcher/watch/_execute', 'watch-inline-execute-body'],
      ['/_ml/filters/{filter_id}', 'ml-filter-body'],
      ['/_ml/filters/{filter_id}/_update', 'ml-filter-update-body'],
      ['/_ml/calendars/{calendar_id}', 'ml-calendar-body'],
      ['/_ml/calendars/{calendar_id}/events', 'ml-calendar-events-body'],
      ['/{index}/_graph/explore', 'graph-explore-body'],
      ['/{index}/_ccr/follow', 'ccr-follow-body'],
      ['/_ccr/auto_follow/{cluster}', 'ccr-auto-follow-body'],
      ['/_license', 'license-body'],
      ['/_nodes/reload_secure_settings', 'nodes-reload-secure-settings-body'],
      ['/_cluster/reroute', 'reroute-body'],
      ['/_cluster/allocation/explain', 'allocation-explain-body'],
      ['/_cluster/settings', 'cluster-settings-body'],
      ['/{index}/_eql/search', 'eql-body'],
    ];
    for (const [path, kind] of expectByPath) {
      /* 同一路径可能有 GET（无体）与 PUT（有体）两条预设，取带骨架的那条。 */
      const ep = ES_ENDPOINTS.find(e => e.path === path && e.body) ?? ES_ENDPOINTS.find(e => e.path === path);
      expect(ep, `目录缺少 ${path}`).toBeTruthy();
      expect(ep!.body, `${path} 必须有可插入骨架`).toBeTruthy();
      const concrete = path.replace('{index}', 'logs').replace(/\{[^}]+\}/g, 'x');
      expect(bodyKindForPath(concrete, ep!.methods[0]), `${ep!.methods[0]} ${concrete}`).toBe(kind);
    }
    /* 同路径双方法（创建/吊销）：吊销预设按 DELETE 单独校验 */
    const invalidate = ES_ENDPOINTS.find(e => e.path === '/_security/api_key' && e.methods.includes('DELETE'));
    expect(invalidate?.body, '吊销 API Key 预设必须有骨架').toBeTruthy();
    expect(bodyKindForPath('/_security/api_key', 'DELETE')).toBe('security-api-key-invalidate-body');
  });
});
