#!/usr/bin/env node
/* Smoke test for mcp/esquerystudio-local-mcp.mjs against a mock Elasticsearch.
 * Proves: stdio MCP handshake, multi-connection discovery, the single-track
 * group + action call surface (per-tool names are rejected), write opt-in, and
 * real HTTP calls without Spring Boot or a browser. The second mock server
 * (AWS-shaped) drives the cross-vendor compare/diff/throttle smoke paths. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function mockEs() {
  /* 有状态 mock：scroll 会话按 scrollId 记页数（两页数据），_bulk 按请求行数生成逐条结果，
     _aliases 调用留档供切换断言。 */
  const scrollSessions = new Map();
  let scrollSeq = 0;
  /* 结构同步目标 PUT 序列按目标索引名各自计数：同一批请求里多个 sync_structure
     调用（只读负例在 --allow-write 会真跑）互不干扰轮次 */
  const syncPuts = new Map();
  const aliasCalls = [];
  const doc = (id) => ({ _id: id, _index: 'research', _source: { title: 'doc-' + id, created: '2026-01-01' } });
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const send = (value) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
      const notFound = () => { res.statusCode = 404; send({ error: { type: 'index_not_found_exception', reason: 'no such index' } }); };
      if (req.url.startsWith('/_cluster/health')) return send({ status: 'green', number_of_nodes: 1, number_of_data_nodes: 1 });
      if (req.url === '/' || req.url === '') return send({ version: { number: '8.13.0' } });
      /* 能力探测：插件清单带 aliyun 特征插件（apack，按插件 id 聚合——probe 只读 id 字段）
         → probe_capabilities 断言 vendor=aliyun */
      if (req.url.startsWith('/_nodes/plugins')) {
        return send({ nodes: { n1: { name: 'n1', plugins: [{ id: 'apack', name: 'apack' }] } } });
      }
      if (req.url.startsWith('/_cat/indices')) {
        /* compare_capabilities 的分片数查询（h=index,pri）：补 sync-src 5 片驱动
           shard_oversize 判定；其余目录调用（h 列更长）维持原样 */
        if (req.url.includes('h=index,pri')) {
          return send([{ index: 'research', pri: '1' }, { index: 'sync-src', pri: '5' }]);
        }
        return send([{ index: 'research' }, { index: '.system' }]);
      }
      /* 编排搬运面：scroll 两个会话页（2 条 + 1 条），_count 固定 3，_bulk 按行数回 created。 */
      if (req.url.startsWith('/research/_search?scroll=')) {
        const id = 'mock-scroll-' + (++scrollSeq);
        scrollSessions.set(id, 1);
        return send({ _scroll_id: id, hits: { hits: [doc('1'), doc('2')] } });
      }
      /* throttle 冒烟源：首屏延迟 300ms，保证 start 返回后作业仍在 RUNNING，
         运行中调速调用有确定的落点窗口（后续页走通用 scroll 处理器）。 */
      if (req.url.startsWith('/slow-src/_search?scroll=')) {
        const id = 'mock-scroll-' + (++scrollSeq);
        scrollSessions.set(id, 1);
        return setTimeout(() => send({ _scroll_id: id, hits: { hits: [doc('1'), doc('2')] } }), 300);
      }
      if (req.url.startsWith('/slow-src/_count')) return send({ count: 3 });
      if (req.url.startsWith('/_search/scroll')) {
        if (req.method === 'DELETE') return send({ succeeded: true });
        let sid = '';
        try { sid = JSON.parse(body).scroll_id || ''; } catch { /* ignore */ }
        const page = scrollSessions.get(sid) || 0;
        scrollSessions.set(sid, page + 1);
        return send({ _scroll_id: sid, hits: { hits: page === 1 ? [doc('3')] : [] } });
      }
      if (req.url.startsWith('/_bulk')) {
        const ops = body.split('\n')
          .filter((line) => { const t = line.trim(); return t.startsWith('{"index"') || t.startsWith('{"create"'); }).length;
        return send({ errors: false, items: Array.from({ length: ops }, () => ({ index: { result: 'created', status: 201 } })) });
      }
      if (req.url.startsWith('/research/_count')) return send({ count: 3 });
      if (req.url.startsWith('/_data_stream')) return send(req.method === 'GET' ? { data_streams: [{ name: 'logs-app' }] } : { acknowledged: true });
      if (req.url.startsWith('/_component_template')) return send({ component_templates: [{ name: 'base' }] });
      if (req.url.includes('/_clone/') || req.url.includes('/_shrink/') || req.url.includes('/_split/')) return send({ acknowledged: true });
      if (req.url.startsWith('/research/_mapping')) {
        return req.method === 'PUT'
          ? send({ acknowledged: true })
          : send({ research: { mappings: { properties: { title: { type: 'text' }, created: { type: 'date' } } } } });
      }
      if (req.url.startsWith('/research/_settings')) {
        return req.method === 'PUT' ? send({ acknowledged: true })
          : send({ research: { settings: { index: {
            number_of_shards: '1', number_of_replicas: '1', uuid: 'u-1',
            creation_date: '1700000000000', provided_name: 'research', version: { created: '8500000' },
          } } } });
      }
      if (req.url.startsWith('/research/_forcemerge')) return send({ _shards: { total: 1, successful: 1, failed: 0 } });
      if (req.url.startsWith('/research/_search')) return send({ hits: { hits: [] } });
      if (req.url.startsWith('/research/_mget')) return send({ docs: [{ _id: '1' }, { _id: '2' }] });
      if (req.url.startsWith('/research/_update_by_query')) return send({ updated: 2 });
      if (req.url.startsWith('/research/_delete_by_query')) return send({ deleted: 1 });
      if (req.url.startsWith('/_reindex')) return send({ created: 2 });
      if (req.url.startsWith('/research/_analyze')) return send({ tokens: [{ token: 'x', position: 0 }] });
      if (req.url.startsWith('/research/_validate/query')) return send({ valid: true, explanations: [] });
      if (req.url.startsWith('/research/_termvectors/1')) return send({ term_vectors: {} });
      if (req.url.startsWith('/research/_search/template')) return send({ hits: { hits: [] } });
      if (req.url.startsWith('/_render/template')) return send({ template_output: {} });
      if (req.url.startsWith('/research/_alias')) {
        return req.method === 'POST' ? send({ acknowledged: true }) : send({ research: { aliases: { research_alias: {} } } });
      }
      /* 重建目标索引：GET _settings 404（不存在），PUT 建索引成功。 */
      if (req.url.startsWith('/reindex-research') || req.url.startsWith('/xmigrate-dest')) {
        if (req.method === 'GET') return notFound();
        return send({ acknowledged: true, index: req.url.slice(1).split('/')[0] });
      }
      if (req.url.startsWith('/_cluster/allocation/explain')) return send({ index: 'research', shard: 0 });
      if (req.url.startsWith('/research/_shard_stores')) return send({ indices: { research: { shards: {} } } });
      if (req.url.startsWith('/_cluster/pending_tasks')) return send({ tasks: [] });
      if (req.url.startsWith('/_slm/policy')) return send(req.method === 'GET' ? { policies: {} } : { acknowledged: true });
      if (req.url.startsWith('/_slm/status')) return send({ operation_mode: 'RUNNING' });
      if (req.url.startsWith('/_slm/stats')) return send({ snapshots_taken: 1 });
      if (req.url.startsWith('/_cluster/settings')) return send(req.method === 'PUT' ? { acknowledged: true } : { persistent: {}, transient: {}, defaults: {} });
      if (req.url.startsWith('/_cluster/reroute')) return send({ acknowledged: true });
      if (req.url.startsWith('/_snapshot/repo1/_all')) return send({ snapshots: [{ snapshot: 's1' }] });
      if (req.url.startsWith('/_snapshot/repo1/s1/_status')) return send({ snapshots: [{ snapshot: 's1' }] });
      if (req.url.startsWith('/_snapshot/repo1/s2')) return send({ acknowledged: true });
      if (req.url.startsWith('/_snapshot')) return send({ repo1: { type: 'fs', settings: {} } });
      if (req.url.startsWith('/research/_ilm/explain')) return send({ indices: { research: { phase: 'hot' } } });
      /* ilm-missing 预查样本：ilm-x 在目标 404（精确匹配放在 /_ilm/policy 通配之前） */
      if (req.url === '/_ilm/policy/ilm-x') {
        res.statusCode = 404;
        return send({ error: { type: 'status_exception', reason: 'policy [ilm-x] does not exist' } });
      }
      if (req.url.startsWith('/_ilm/policy')) return send(req.method === 'GET' ? { policy1: { version: 1 } } : { acknowledged: true });
      if (req.url.startsWith('/_ilm/start')) return send({ acknowledged: true });
      if (req.url.startsWith('/_ilm/status')) return send({ operation_mode: 'RUNNING' });
      if (req.url.startsWith('/_cluster/state/metadata')) return send({ metadata: { stored_scripts: { s1: {} } } });
      if (req.url.startsWith('/_scripts/s1')) return send({ acknowledged: true });
      if (req.url.startsWith('/_tasks/')) return send({ task: { id: 'node:1' } });
      if (req.url.startsWith('/_sql')) return send({ columns: [], rows: [] });
      if (req.url.startsWith('/research/_doc/1')) return send({ result: 'updated', _id: '1' });
      if (req.url.startsWith('/research_new')) return send({ acknowledged: true, index: 'research_new' });
      if (req.url.startsWith('/research_alias/_rollover')) return send({ acknowledged: true, new_index: 'research-000002' });
      if (req.url.startsWith('/_aliases')) {
        aliasCalls.push({ url: req.url, body });
        return send({ acknowledged: true });
      }
      /* 结构同步源：阿里云形态 settings（flat：厂商私有 index.apack.knn + ik 分词器定义
         + 兼容矩阵各规则的样本键）与字段级 analyzer 引用；带一个 sync-alias 别名。 */
      if (req.url.startsWith('/sync-src/_settings')) {
        return send({ 'sync-src': { settings: {
          'index.number_of_shards': '5',
          'index.number_of_replicas': '1',
          'index.apack.knn': 'true',
          'index.ttl': '86400000',
          'index.routing.allocation.include.tag': 'hot',
          'index.store.type': 'niofs',
          'index.auto_expand_replicas': '0-all',
          'index.lifecycle.name': 'ilm-x',
          'index.custom.private': 'x',
          'index.uuid': 'u-2',
          'index.creation_date': '1700000000000',
          'index.provided_name': 'sync-src',
          'index.version.created': '8500000',
          'index.analysis.tokenizer.ik_max_word.type': 'ik_max_word',
        } } });
      }
      if (req.url.startsWith('/sync-src/_mapping')) {
        return send({ 'sync-src': { mappings: { properties: {
          title: { type: 'text', analyzer: 'ik_max_word' },
          created: { type: 'date' },
        } } } });
      }
      if (req.url.startsWith('/sync-src/_alias')) {
        return send({ 'sync-src': { aliases: { 'sync-alias': {} } } });
      }
      /* 结构同步目标：兼容矩阵已预剔除 apack/ttl/routing/ilm/ik 后，PUT 第一轮只剩
         unknown setting [index.custom.private]（驱动 reactive 兜底剔除）→ 第二轮建成。 */
      if (req.url.startsWith('/sync-dest') || req.url.startsWith('/sync-plan') || req.url.startsWith('/sync-verify')) {
        if (req.method === 'PUT') {
          const destName = req.url.slice(1).split('/')[0];
          const round = (syncPuts.get(destName) || 0) + 1;
          syncPuts.set(destName, round);
          if (round === 1) {
            res.statusCode = 400;
            return send({ error: {
              root_cause: [{ type: 'illegal_argument_exception', reason: 'unknown setting [index.custom.private] please check that any required plugins are installed' }],
              type: 'illegal_argument_exception', reason: 'unknown setting [index.custom.private] please check that any required plugins are installed',
            } });
          }
          return send({ acknowledged: true, index: destName });
        }
        return notFound();
      }
      if (req.url.startsWith('/_index_template/tpl')) return send({ acknowledged: true });
      res.statusCode = 404;
      send({ error: { type: 'not_found', reason: req.url } });
    });
  });
  server.aliasCalls = aliasCalls;
  server.syncPuts = syncPuts;
  return server;
}

/* 组 + action 调用构造：单轨客户端面只有一个形态。 */
const call = (id, group, action, args = {}, extra = {}) => ({
  jsonrpc: '2.0', id, method: 'tools/call', ...extra,
  params: { name: group, arguments: { ...args, action } },
});

/* 跨厂商对照 mock：AWS 形态（repository-s3 插件 → vendor=aws，版本 7.10.2），
   只覆盖 compare_capabilities/diff_structure 用到的面（根信息/插件/健康/diff-dest
   结构读取；ILM 等未知路径一律 404，正好当策略缺失）。 */
function mockAwsEs() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (value) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
      if (req.url.startsWith('/_cluster/health')) return send({ status: 'green', number_of_nodes: 1, number_of_data_nodes: 1 });
      if (req.url === '/' || req.url === '') return send({ cluster_name: 'aws-mock', version: { number: '7.10.2' } });
      if (req.url.startsWith('/_nodes/plugins')) {
        return send({ nodes: { n1: { name: 'n1', plugins: [{ id: 'repository-s3', name: 'repository-s3' }] } } });
      }
      if (req.url.startsWith('/_cat/indices')) return send([]);
      /* diff_structure 目标：sync_structure 建成后的形态（apack/ttl/routing/ilm/ik/
           custom.private 已不在、title.analyzer 已按缺省回退降级为 standard）；
           replicas 故意不同验证忽略规则 */
      if (req.url.startsWith('/diff-dest/_settings')) {
        return send({ 'diff-dest': { settings: {
          'index.number_of_shards': '5',
          'index.number_of_replicas': '2',
          'index.auto_expand_replicas': '0-all',
          'index.store.type': 'niofs',
          'index.uuid': 'u-3',
          'index.creation_date': '1700000000001',
          'index.provided_name': 'diff-dest',
          'index.version.created': '7100199',
        } } });
      }
      if (req.url.startsWith('/diff-dest/_mapping')) {
        return send({ 'diff-dest': { mappings: { properties: { title: { type: 'text', analyzer: 'standard' }, created: { type: 'date' } } } } });
      }
      res.statusCode = 404;
      send({ error: { type: 'not_found', reason: req.url } });
    });
  });
  return server;
}

function runLocal(configPath, extra = [], env = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [
      join(ROOT, 'mcp/esquerystudio-local-mcp.mjs'), '--config', configPath, ...extra,
    ], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('error', reject);
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      call(3, 'es_connections', 'list'),
      call(68, 'es_connections', 'probe', { connection: 'prod' }),
      call(4, 'es_indices', 'list'),
      call(5, 'es_cluster', 'health'),
      call(7, 'es_rest', 'call', { method: 'POST', path: '/research/_search', body: {} }),
      call(8, 'es_rest', 'call', { method: 'POST', path: '/_bulk', body: {} }),
      { jsonrpc: '2.0', id: 51, method: 'resources/list' },
      { jsonrpc: '2.0', id: 52, method: 'resources/templates/list' },
      { jsonrpc: '2.0', id: 53, method: 'resources/read', params: { uri: 'esquerystudio://connections' } },
      { jsonrpc: '2.0', id: 54, method: 'resources/read', params: { uri: 'esquerystudio://index/prod/research/mapping' } },
      { jsonrpc: '2.0', id: 55, method: 'prompts/list' },
      { jsonrpc: '2.0', id: 56, method: 'prompts/get', params: { name: 'diagnose_slow_query', arguments: { connection: 'prod', index: 'research' } } },
      call(57, 'es_data_streams', 'list'),
      call(58, 'es_data_streams', 'get', { name: 'logs-app' }),
      call(59, 'es_data_streams', 'stats', { name: 'logs-app' }),
      call(60, 'es_templates', 'component_list'),
      { jsonrpc: '2.0', id: 66, method: 'completion/complete', params: { ref: { type: 'ref/prompt' }, argument: { name: 'connection', value: 'p' } } },
      { jsonrpc: '2.0', id: 67, method: 'completion/complete', params: { ref: { type: 'ref/prompt' }, argument: { name: 'index', value: 'res' } } },
      call(69, 'es_batch', 'delete_by_query', { index: 'research', query: { match_all: {} } },
        { _meta: { 'io.modelcontextprotocol/clientCapabilities': { elicitation: {} } } }),
      /* 单轨负例：旧细粒度名直调必须按未知工具拒绝。 */
      { jsonrpc: '2.0', id: 70, method: 'tools/call', params: { name: 'es_get_mapping', arguments: { index: 'research' } } },
      /* 单轨负例：组调用缺 action 必须明确报错。 */
      { jsonrpc: '2.0', id: 71, method: 'tools/call', params: { name: 'es_indices', arguments: { index: 'research' } } },
      /* 本地编排读面：prepare/connect_check/resolve_preview/preflight/fetch_config/dest_indices/reconcile；
         写面 start 未开 --allow-write 必须照写工具拦截形态报错。 */
      call(72, 'es_adhoc_rebuild', 'start', { index: 'research' }),
      call(73, 'es_adhoc_rebuild', 'prepare', { index: 'research' }),
      call(74, 'es_xmigrate', 'connect_check', { srcConnId: 'qa' }),
      call(75, 'es_xmigrate', 'resolve_preview', { srcConnId: 'qa' }),
      call(76, 'es_xmigrate', 'preflight', { srcConnId: 'qa', sourceIndex: 'research', destIndex: 'xmigrate-dest', destConnId: 'host' }),
      call(77, 'es_xmigrate', 'fetch_config', { srcConnId: 'qa', sourceIndex: 'research' }),
      call(78, 'es_xmigrate', 'dest_indices', {}),
      call(79, 'es_xmigrate', 'reconcile', { srcConnId: 'qa', sourceIndex: 'research', destConnId: 'host', destIndex: 'research' }),
      call(80, 'es_adhoc_rebuild', 'events', { jobId: 'no-such-job' }),
      /* 结构同步是写 action：未开 --allow-write 必须照写工具拦截形态报错；
         dryRun=true 是只读预览，无 --allow-write 也必须放行。 */
      call(82, 'es_xmigrate', 'sync_structure', { srcConnId: 'qa', sourceIndex: 'sync-src', destIndex: 'sync-dest-neg' }),
      call(83, 'es_xmigrate', 'probe_capabilities', { connection: 'qa' }),
      call(84, 'es_xmigrate', 'sync_structure', { srcConnId: 'qa', sourceIndex: 'sync-src', destIndex: 'sync-plan', dryRun: true }),
      /* v3 新读 action：能力对比（同厂商与跨厂商各一段）+ 结构比对（含目标缺失负例）。 */
      call(85, 'es_xmigrate', 'compare_capabilities', { srcConnId: 'qa', sourceIndex: 'sync-src', destConnId: 'host' }),
      call(86, 'es_xmigrate', 'diff_structure', { srcConnId: 'qa', sourceIndex: 'sync-src', destConnId: 'aws', destIndex: 'diff-dest' }),
      call(87, 'es_xmigrate', 'compare_capabilities', { srcConnId: 'qa', sourceIndex: 'sync-src', destConnId: 'aws' }),
      { jsonrpc: '2.0', id: 88, method: 'prompts/get', params: { name: 'cross_cloud_structure_sync', arguments: { srcConnId: 'qa', destConnId: 'host' } } },
      call(89, 'es_xmigrate', 'diff_structure', { srcConnId: 'qa', sourceIndex: 'sync-src', destConnId: 'aws', destIndex: 'no-such-dest' }),
      /* 参数边界负例：dryRun=true 时携带 expectPlanDigest 必须明确拒绝（预览不存在漂移校验）。 */
      call(90, 'es_xmigrate', 'sync_structure',
        { srcConnId: 'qa', sourceIndex: 'sync-src', destIndex: 'sync-plan', dryRun: true, expectPlanDigest: 'deadbeefdeadbeef' }),
    ];
    if (extra.includes('--allow-write')) {
      requests.push(
        call(6, 'es_documents', 'index', { index: 'research', id: '1', document: { title: 'x' } }),
        call(9, 'es_indices', 'create', { index: 'research_new', settings: { number_of_shards: 1 }, mappings: { properties: { title: { type: 'text' } } } }),
        call(10, 'es_indices', 'put_mapping', { index: 'research', mappings: { properties: { tag: { type: 'keyword' } } } }),
        call(11, 'es_indices', 'update_settings', { index: 'research', settings: { index: { number_of_replicas: 1 } } }),
        call(12, 'es_indices', 'alias', { actions: [{ add: { index: 'research', alias: 'research_alias' } }] }),
        call(13, 'es_indices', 'rollover', { alias: 'research_alias', dryRun: true }),
        call(14, 'es_indices', 'force_merge', { index: 'research', maxNumSegments: 1 }),
        call(15, 'es_templates', 'put', { name: 'tpl', template: { index_patterns: ['research-*'], template: { settings: { number_of_shards: 1 } } } }),
        call(16, 'es_templates', 'delete', { name: 'tpl' }),
        call(17, 'es_indices', 'delete', { index: 'research_new' }),
        call(18, 'es_batch', 'update_by_query', { index: 'research', query: { term: { status: 'draft' } }, script: { source: 'ctx._source.x = 1' }, maxDocs: 10 }),
        call(19, 'es_batch', 'delete_by_query', { index: 'research', query: { term: { status: 'draft' } } }),
        call(20, 'es_batch', 'reindex', { body: { source: { index: 'research' }, dest: { index: 'research_copy' } } }),
        call(21, 'es_analysis', 'analyze', { index: 'research', body: { analyzer: 'standard', text: 'hello' } }),
        call(22, 'es_cluster', 'settings'),
        call(23, 'es_snapshots', 'repos'),
        call(24, 'es_snapshots', 'list', { repo: 'repo1' }),
        call(25, 'es_snapshots', 'status', { repo: 'repo1', name: 's1' }),
        call(26, 'es_lifecycle', 'ilm_policies'),
        call(27, 'es_automation', 'scripts'),
        call(28, 'es_cluster', 'task_detail', { taskId: 'node:1' }),
        call(29, 'es_cluster', 'update_settings', { body: { persistent: { 'cluster.routing.allocation.enable': 'all' } } }),
        call(30, 'es_cluster', 'reroute', { body: { commands: [] }, dryRun: true }),
        call(31, 'es_snapshots', 'create', { repo: 'repo1', name: 's2' }),
        call(32, 'es_snapshots', 'delete', { repo: 'repo1', name: 's2' }),
        call(33, 'es_lifecycle', 'ilm_put', { name: 'policy1', policy: { policy: { phases: {} } } }),
        call(34, 'es_lifecycle', 'ilm_delete', { name: 'policy1' }),
        call(35, 'es_automation', 'script_put', { id: 's1', script: { script: { lang: 'painless', source: '1' } } }),
        call(36, 'es_automation', 'script_delete', { id: 's1' }),
        call(37, 'es_lifecycle', 'ilm_start'),
        call(38, 'es_lifecycle', 'ilm_status'),
        call(39, 'es_search', 'validate', { index: 'research', body: { query: { match_all: {} } } }),
        call(40, 'es_documents', 'term_vectors', { index: 'research', id: '1', fields: 'title' }),
        call(41, 'es_search', 'search_template', { index: 'research', body: { source: { query: { match_all: {} } } } }),
        call(42, 'es_search', 'render_template', { body: { source: { query: { match_all: {} } } } }),
        call(43, 'es_indices', 'detail', { index: 'research', sampleSize: 1 }),
        call(44, 'es_cluster', 'allocation_explain', { body: { index: 'research', shard: 0 } }),
        call(45, 'es_cluster', 'shard_stores', { index: 'research', status: 'red,yellow' }),
        call(46, 'es_cluster', 'pending_tasks'),
        call(47, 'es_lifecycle', 'slm_policies'),
        call(48, 'es_lifecycle', 'slm_status'),
        call(49, 'es_lifecycle', 'slm_execute', { policyId: 'nightly' }),
        call(50, 'es_search', 'mget', { index: 'research', ids: ['1', '2'] }),
        call(61, 'es_data_streams', 'create', { name: 'logs-app' }),
        call(62, 'es_indices', 'clone', { index: 'research', target: 'research_clone', body: { settings: { number_of_shards: 1 } } }),
        call(63, 'es_indices', 'shrink', { index: 'research', target: 'research_shrink' }),
        call(64, 'es_indices', 'split', { index: 'research', target: 'research_split' }),
        call(65, 'es_data_streams', 'delete', { name: 'logs-app' }),
        /* 结构同步双层收敛：planned 兼容矩阵预剔除（apack/ttl/routing/ilm/ik）后，
           reactive 只兜底 unknown setting [index.custom.private] 一轮 → 建成；
           syncAliases=true 随迁 sync-alias。 */
        call(81, 'es_xmigrate', 'sync_structure', { srcConnId: 'qa', sourceIndex: 'sync-src', destIndex: 'sync-dest', syncAliases: true }),
      );
    }
    child.stdin.write(requests.map((r) => JSON.stringify(r)).join('\n') + '\n');
    setTimeout(() => { child.kill(); resolveRun(out); }, 3500);
  });
}

function responses(text) {
  return text.split('\n').filter((line) => line.trim().startsWith('{')).map((line) => JSON.parse(line));
}

/* 交互式会话：编排 action 需要先拿 start 返回的 jobId 再轮询 status，逐请求一问一答。 */
function startLocal(configPath, extra = [], env = {}) {
  const child = spawn(process.execPath, [
    join(ROOT, 'mcp/esquerystudio-local-mcp.mjs'), '--config', configPath, ...extra,
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  const seen = new Map();
  const waiters = [];
  let buf = '';
  let errText = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('{')) continue;
      const msg = JSON.parse(line);
      seen.set(msg.id, msg);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].id === msg.id) {
          const waiter = waiters.splice(i, 1)[0];
          waiter.resolve(msg);
        }
      }
    }
  });
  child.stderr.on('data', (d) => { errText += d.toString(); });
  const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');
  const resp = (id) => new Promise((resolve, reject) => {
    if (seen.has(id)) return resolve(seen.get(id));
    const waiter = { id, resolve };
    waiters.push(waiter);
    setTimeout(() => {
      const at = waiters.indexOf(waiter);
      if (at >= 0) {
        waiters.splice(at, 1);
        reject(new Error(`response ${id} timeout; stderr: ${errText}`));
      }
    }, 10_000);
  });
  return { child, send, resp };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const resultOf = async (session, id) => {
  const reply = await session.resp(id);
  assert.equal(reply.result?.isError, false, `call ${id} failed: ${reply.result?.content?.[0]?.text}`);
  return JSON.parse(reply.result.content[0].text);
};
function toolResult(responsesList, id) {
  const hit = responsesList.find((r) => r.id === id);
  assert.ok(hit?.result?.content?.[0]?.text, `response ${id} must be a tool result`);
  return JSON.parse(hit.result.content[0].text);
}

const server = mockEs();
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const port = server.address().port;
const awsServer = mockAwsEs();
await new Promise((resolveListen) => awsServer.listen(0, '127.0.0.1', resolveListen));
const awsPort = awsServer.address().port;
const dir = mkdtempSync(join(tmpdir(), 'esq-local-mcp-'));
const configPath = join(dir, 'mcp.json');
const jobsFile = join(dir, 'jobs.json');
const ledgerEnv = { ESQ_MCP_JOBS_FILE: jobsFile };
writeFileSync(configPath, JSON.stringify({
  defaultConnection: 'prod',
  connections: [
    { id: 'prod', name: 'Production', url: `http://127.0.0.1:${port}`, username: 'elastic', password: 'secret' },
    { id: 'qa', name: 'QA', url: `http://127.0.0.1:${port}`, apiKey: 'id:key' },
    { id: 'aws', name: 'AWS Target', url: `http://127.0.0.1:${awsPort}` },
  ],
}), 'utf8');

try {
  const readOnly = responses(await runLocal(configPath, [], ledgerEnv));
  const init = readOnly.find((r) => r.id === 1)?.result;
  assert.equal(init.resultType, 'complete');
  assert.equal(init.protocolVersion, '2026-07-28');
  assert.deepEqual(init.supportedVersions, ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
  assert.equal(init.recommendedTools.length, 17);
  assert.equal(init.maxRecommendedTools, 17);
  assert.equal(init.serverInfo.mode, 'local');
  assert.equal(init.serverInfo.writes, false);
  assert.ok(init.instructions.includes('es_connections'));

  const listedTools = readOnly.find((r) => r.id === 2).result.tools;
  const readTools = listedTools.map((t) => t.name);
  assert.equal(listedTools.length, 17, 'client-facing tool surface must be 17 action groups');
  assert.equal(listedTools.find((t) => t.name === 'es_rest').annotations.readOnlyHint, false);
  assert.ok(readTools.includes('es_connections'));
  assert.ok(readTools.includes('es_search') && readTools.includes('es_indices'), 'read groups stay visible');
  const readDocs = listedTools.find((t) => t.name === 'es_documents');
  const readDocsActions = readDocs.inputSchema.properties.action.enum;
  assert.ok(readDocsActions.includes('get') && !readDocsActions.includes('index'),
    'write actions must be hidden without --allow-write');
  const readIndices = listedTools.find((t) => t.name === 'es_indices');
  assert.ok(readIndices.inputSchema.properties.action.enum.includes('list'));
  assert.ok(!readIndices.inputSchema.properties.action.enum.includes('create'));
  /* 编排两组的只读面：写 action 全部隐藏，新读 action 可见（adhoc 4 个、xmigrate 12 个）。 */
  const readAdhocActions = listedTools.find((t) => t.name === 'es_adhoc_rebuild')
    .inputSchema.properties.action.enum;
  assert.deepEqual([...readAdhocActions].sort(), ['events', 'jobs', 'prepare', 'status'],
    'es_adhoc_rebuild without --allow-write keeps only read actions');
  const readXmigrateActions = listedTools.find((t) => t.name === 'es_xmigrate')
    .inputSchema.properties.action.enum;
  assert.equal(readXmigrateActions.length, 12, 'es_xmigrate without --allow-write keeps 12 read actions');
  for (const action of ['connect_check', 'resolve_preview', 'dest_indices', 'preflight', 'fetch_config', 'reconcile', 'conflicts', 'probe_capabilities', 'compare_capabilities', 'diff_structure']) {
    assert.ok(readXmigrateActions.includes(action), `read xmigrate action ${action} must stay visible`);
  }
  assert.ok(!readXmigrateActions.includes('start') && !readXmigrateActions.includes('delete_jobs') && !readXmigrateActions.includes('throttle'));
  assert.deepEqual(toolResult(readOnly, 3).map((c) => c.id), ['prod', 'qa', 'aws']);
  const probed = toolResult(readOnly, 68);
  assert.equal(probed.connection, 'prod');
  assert.equal(probed.status, 'GREEN');
  assert.equal(probed.version, '8.13.0');
  assert.deepEqual(toolResult(readOnly, 4).map((i) => i.index), ['research']);
  assert.equal(toolResult(readOnly, 5).status, 'green');
  assert.equal(toolResult(readOnly, 5).version, '8.13.0');
  const rawRead = readOnly.find((r) => r.id === 7)?.result;
  assert.equal(rawRead?.isError, false, 'POST _search is a read query and must pass without --allow-write');
  const rawWrite = readOnly.find((r) => r.id === 8)?.result;
  assert.equal(rawWrite?.isError, true, 'POST _bulk must stay blocked without --allow-write');

  /* 单轨负例：旧细粒度名直调与缺 action 都必须明确报错。 */
  const directCall = readOnly.find((r) => r.id === 70)?.result;
  assert.equal(directCall?.isError, true, 'retired per-tool name must be rejected');
  assert.ok(directCall?.content?.[0]?.text.includes('Unknown tool es_get_mapping'),
    'unknown-tool message must name the rejected tool and the group surface');
  const noAction = readOnly.find((r) => r.id === 71)?.result;
  assert.equal(noAction?.isError, true, 'group call without action must be rejected');
  assert.ok(noAction?.content?.[0]?.text.includes('Missing action for es_indices'));

  /* 编排面：只读下 start 照写工具拦截形态报错；读 action 直连 mock ES 正常返回。 */
  const startBlocked = readOnly.find((r) => r.id === 72)?.result;
  assert.equal(startBlocked?.isError, true, 'adhoc start must stay blocked without --allow-write');
  assert.ok(startBlocked?.content?.[0]?.text.includes('Write tools are disabled'));
  const prepared = toolResult(readOnly, 73);
  assert.equal(prepared.physicalIndex, 'research');
  assert.equal(prepared.suggestedDestIndex, 'reindex-research');
  assert.equal(prepared.docCount, 3);
  assert.deepEqual(prepared.timeFieldCandidates, ['created']);
  assert.deepEqual(prepared.aliasForm, ['research_alias']);
  const connectCheck = toolResult(readOnly, 74);
  assert.equal(connectCheck.reachable, true);
  assert.equal(connectCheck.version, '8.13.0');
  assert.equal(connectCheck.total, 1);
  assert.deepEqual(connectCheck.indices.map((i) => i.index), ['research']);
  const resolvePreview = toolResult(readOnly, 75);
  assert.equal(resolvePreview.protocol, 'http');
  assert.equal(resolvePreview.host, '127.0.0.1');
  assert.equal(resolvePreview.apiKeyConfigured, true);
  const preflight = toolResult(readOnly, 76);
  assert.equal(preflight.destExists, false);
  assert.equal(preflight.srcHealthStatus, 'green');
  assert.equal(preflight.destHealthStatus, 'green');
  const fetchedConfig = toolResult(readOnly, 77);
  assert.equal(fetchedConfig.mapping.research.mappings.properties.title.type, 'text');
  assert.equal(fetchedConfig.settings.research.settings.index.number_of_shards, '1');
  const destIndices = toolResult(readOnly, 78);
  assert.equal(destIndices.destConnId, 'prod');
  assert.deepEqual(destIndices.indices.map((i) => i.index), ['research']);
  const reconciled = toolResult(readOnly, 79);
  assert.equal(reconciled.srcCount, 3);
  assert.equal(reconciled.destCount, 3);
  assert.equal(reconciled.diff, 0);
  const eventsUnknown = readOnly.find((r) => r.id === 80)?.result;
  assert.equal(eventsUnknown?.isError, true, 'events with unknown job id must fail');
  assert.ok(eventsUnknown?.content?.[0]?.text.includes('Unknown adhoc job'));
  const syncBlocked = readOnly.find((r) => r.id === 82)?.result;
  assert.equal(syncBlocked?.isError, true, 'xmigrate sync_structure must stay blocked without --allow-write');
  assert.ok(syncBlocked?.content?.[0]?.text.includes('Write tools are disabled'));
  /* probe_capabilities：mock 插件带 apack → 厂商推断 aliyun（托管），节点规模如实。 */
  const probedCaps = toolResult(readOnly, 83);
  assert.equal(probedCaps.connection, 'qa');
  assert.equal(probedCaps.version, '8.13.0');
  assert.equal(probedCaps.vendor.id, 'aliyun');
  assert.equal(probedCaps.vendor.label, '阿里云 ES');
  assert.ok(probedCaps.vendor.evidence.includes('plugin:apack'));
  assert.deepEqual(probedCaps.plugins, ['apack']);
  assert.equal(probedCaps.nodeCount, 1);
  assert.equal(probedCaps.dataNodeCount, 1);
  assert.equal(probedCaps.managed, true);
  /* dryRun=true 只读预览：无 --allow-write 放行；兼容矩阵预剔除全进 planned，
     不发一次 PUT（syncPuts 无 sync-plan），reactive 全空、别名只列 skipped。 */
  const plan = toolResult(readOnly, 84);
  assert.equal(plan.dryRun, true, 'dryRun sync must report dryRun=true');
  assert.equal(plan.created, false);
  assert.equal(plan.rounds, 0, 'dryRun must not PUT, so rounds stays 0');
  assert.ok(!server.syncPuts.has('sync-plan'), 'dryRun must not send any PUT to the dest index');
  const plannedKeys = plan.planned.removedSettings.map((s) => s.key);
  for (const key of ['index.apack.knn', 'index.ttl', 'index.routing.allocation.include.tag', 'index.lifecycle.name']) {
    assert.ok(plannedKeys.includes(key), `planned prune must remove ${key}`);
  }
  assert.ok(plan.planned.removedSettings.find((s) => s.key === 'index.apack.knn').reason.includes('阿里云 apack 私有设置'));
  assert.ok(plan.planned.removedSettings.find((s) => s.key === 'index.lifecycle.name').reason.includes('目标集群不存在 ILM 策略 ilm-x'));
  assert.equal(plan.planned.removedAnalysis.length, 1);
  assert.equal(plan.planned.removedAnalysis[0].kind, 'tokenizer');
  assert.equal(plan.planned.removedAnalysis[0].name, 'ik_max_word');
  assert.ok(plan.planned.removedAnalysis[0].reason.includes('目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用'),
    'removed-analysis reason aligns with server/browser wording (no vendor suffix)');
  /* 回退分词器缺省 standard：降级条目 to=standard，reason 用英文模板（目标厂商已知） */
  assert.deepEqual(plan.planned.downgradedFields.map((d) => [d.field, d.from, d.to]),
    [['title', 'ik_max_word', 'standard']], 'planned downgrade keeps the field, downgrades to standard');
  assert.equal(plan.planned.downgradedFields[0].reason,
    'target vendor aliyun lacks plugin analysis-ik; analyzer ik_max_word -> standard',
    'downgraded-field reason uses the English vendor/plugin template');
  const adviceKinds = plan.advice.map((a) => a.kind);
  for (const kind of ['shards', 'replicas', 'store']) assert.ok(adviceKinds.includes(kind), `advice must include ${kind}`);
  assert.ok(!adviceKinds.includes('plugin_install'), 'same-vendor sync must not emit plugin_install advice');
  assert.ok(plan.advice.find((a) => a.kind === 'shards').message.includes('源分片 5 片过碎'));
  assert.deepEqual(plan.reactive, { removedSettings: [], removedAnalysis: [], downgradedFields: [] });
  assert.deepEqual(plan.aliases, { skipped: ['sync-alias'], synced: [] });
  assert.equal(plan.source.vendor.id, 'aliyun');
  assert.equal(plan.target.vendor.id, 'aliyun');
  /* v3 计划快照：适配后 create body 与 planDigest（canonical JSON SHA-256 前 16 hex，
     摘要的 aliases 输入恒为源别名全量名单）；body.aliases 为 synced 口径（dryRun 计划：
     syncAliases 未勾选 → 空）。 */
  assert.match(plan.planDigest, /^[0-9a-f]{16}$/, 'planDigest must be 16 lowercase hex chars');
  assert.equal(plan.body.settings.index.number_of_shards, '5');
  assert.ok(!('apack' in plan.body.settings.index), 'planned body must drop vendor-private apack settings');
  assert.equal(plan.body.settings.index.custom.private, 'x', 'reactive-only removal stays in the planned body');
  assert.equal(plan.body.mappings.properties.title.type, 'text');
  assert.equal(plan.body.mappings.properties.title.analyzer, 'standard', 'planned body must reflect the analyzer downgrade');
  assert.deepEqual(plan.body.aliases, [], 'body aliases follow the synced scope (dryRun without syncAliases)');

  /* dryRun=true 携带 expectPlanDigest：明确拒绝（预览不存在计划漂移校验）。 */
  const digestOnDryRun = readOnly.find((r) => r.id === 90)?.result;
  assert.equal(digestOnDryRun?.isError, true, 'expectPlanDigest with dryRun=true must be rejected');
  assert.ok(digestOnDryRun?.content?.[0]?.text.includes('expectPlanDigest only valid with dryRun=false'));

  /* compare_capabilities 同厂商（qa→host，同一 mock）：无版本差、无厂商切换、无插件差集；
     sync-src 5 片 > 目标 1 数据节点 ×3 → 唯一风险 shard_oversize（medium）。 */
  const comparedSame = toolResult(readOnly, 85);
  assert.equal(comparedSame.source.connection, 'qa');
  assert.equal(comparedSame.source.index, 'sync-src');
  assert.equal(comparedSame.target.connection, 'host');
  /* target 回显缺省：destIndex 未传回退 sourceIndex 名 */
  assert.equal(comparedSame.target.index, 'sync-src');
  assert.equal(comparedSame.source.vendor.id, 'aliyun');
  assert.equal(comparedSame.target.vendor.id, 'aliyun');
  assert.deepEqual(comparedSame.source.vendor, { id: 'aliyun', label: '阿里云 ES' });
  assert.ok(Array.isArray(comparedSame.source.evidence) && comparedSame.source.evidence.includes('plugin:apack'));
  assert.equal(comparedSame.diff.versionGap, null);
  assert.equal(comparedSame.diff.vendorChanged, false);
  assert.deepEqual(comparedSame.diff.pluginsOnlyInSource, []);
  assert.deepEqual(comparedSame.diff.pluginsOnlyInTarget, []);
  assert.deepEqual(comparedSame.diff.nodeScale, { sourceDataNodes: 1, targetDataNodes: 1 });
  assert.deepEqual(comparedSame.diff.risks.map((r) => [r.kind, r.severity, r.message, r.action]),
    [['shard_oversize', 'medium', '源索引 5 片超过目标 1 个数据节点的 3 倍，目标侧分片过碎',
      'reduce source shards to <= 3 or scale target data nodes before sync']]);
  assert.equal(comparedSame.source.managed, true);
  assert.equal(comparedSame.source.pluginsReliable, true);

  /* compare_capabilities 跨厂商（qa aliyun 8.13.0 → aws mock 7.10.2 + repository-s3）：
     插件缺失/版本降级/厂商切换/分片过碎四类风险齐发，token 边界下 repository-s3 判 aws。 */
  const comparedAws = toolResult(readOnly, 87);
  assert.equal(comparedAws.target.connection, 'aws');
  assert.equal(comparedAws.target.vendor.id, 'aws');
  assert.ok(comparedAws.target.evidence.includes('plugin:repository-s3'));
  assert.equal(comparedAws.diff.versionGap, '8.13.0 -> 7.10.2');
  assert.equal(comparedAws.diff.vendorChanged, true);
  assert.deepEqual(comparedAws.diff.pluginsOnlyInSource, ['apack']);
  assert.deepEqual(comparedAws.diff.pluginsOnlyInTarget, ['repository-s3']);
  assert.deepEqual(comparedAws.diff.risks.map((r) => [r.kind, r.severity]),
    [['plugin_missing', 'high'], ['version_downgrade', 'medium'], ['vendor_change', 'low'], ['shard_oversize', 'medium']]);
  assert.ok(comparedAws.diff.risks.find((r) => r.kind === 'plugin_missing').message.includes('目标集群缺少插件 apack（源在用）'));
  /* 插件缺失分档：apack 不属于兼容矩阵已知组件 → action 走「目标安装或从计划排除」档 */
  assert.equal(comparedAws.diff.risks.find((r) => r.kind === 'plugin_missing').action,
    'install the plugin on target or exclude the component from the sync plan');
  assert.ok(comparedAws.diff.risks.find((r) => r.kind === 'version_downgrade').message.includes('目标版本 7.10.2 大版本低于源 8.13.0'));
  assert.ok(comparedAws.diff.risks.find((r) => r.kind === 'vendor_change').message.includes('厂商从 aliyun 切换到 aws'));
  assert.ok(comparedAws.diff.risks.every((r) => r.action && r.message));

  /* diff_structure（qa sync-src → aws diff-dest，按 sync 建成后形态）：矩阵计划解释
     apack(vendor-private)/ttl/routing/ilm/ik 平铺键与 title 字段降级；reactive 兜底剔除的
     custom.private 不在矩阵计划内 → 唯一 unexpected；replicas/version 内部键差异被忽略。 */
  const diffed = toolResult(readOnly, 86);
  assert.equal(diffed.sourceIndex, 'sync-src');
  assert.equal(diffed.destIndex, 'diff-dest');
  assert.equal(diffed.destConnId, 'aws');
  const onlySrcKeys = diffed.settingsDiff.onlyInSource.map((s) => s.key);
  for (const key of ['index.apack.knn', 'index.ttl', 'index.routing.allocation.include.tag',
    'index.lifecycle.name', 'index.analysis.tokenizer.ik_max_word.type', 'index.custom.private']) {
    assert.ok(onlySrcKeys.includes(key), `diff must list source-only setting ${key}`);
  }
  assert.deepEqual(diffed.settingsDiff.onlyInTarget, [], 'replicas differences are ignored keys');
  assert.deepEqual(diffed.settingsDiff.valueChanged, []);
  /* mappings 语义属性比较（type+analyzer+search_analyzer+normalizer）：源 ik_max_word vs
     目标建成形态 standard 记 fieldChanged（detail 单属性差异摘要） */
  assert.deepEqual(diffed.mappingsDiff, {
    fieldAdded: [], fieldRemoved: [],
    fieldChanged: [{ field: 'title', sourceType: 'text', targetType: 'text', detail: 'analyzer: ik_max_word -> standard' }],
  }, 'semantic compare covers analysis attrs, downgraded analyzer is a visible field change');
  const expectedRows = diffed.expectedRemovals.map((r) => [r.area, r.key]);
  for (const [area, key] of [['settings', 'index.apack.knn'], ['settings', 'index.ttl'],
    ['settings', 'index.routing.allocation.include.tag'], ['settings', 'index.lifecycle.name'],
    ['analysis', 'tokenizer.ik_max_word'], ['mappings', 'title']]) {
    assert.ok(expectedRows.some(([a, k]) => a === area && k === key), `expectedRemovals must cover ${area}:${key}`);
  }
  assert.equal(diffed.expectedRemovals.find((r) => r.key === 'index.apack.knn').reason,
    'vendor private setting (aliyun) not supported by target vendor aws');
  assert.ok(diffed.expectedRemovals.find((r) => r.key === 'tokenizer.ik_max_word').reason
    .includes('目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用'));
  /* mappings 区（downgradedFields）的 reason 用英文模板：目标厂商已知 */
  assert.equal(diffed.expectedRemovals.find((r) => r.area === 'mappings' && r.key === 'title').reason,
    'target vendor aws lacks plugin analysis-ik; analyzer ik_max_word -> standard');
  assert.deepEqual(diffed.unexpected,
    [{ area: 'settings', key: 'index.custom.private', message: '源设置 index.custom.private 未出现在目标索引，且不在兼容矩阵预期剔除清单内' }]);
  assert.equal(diffed.compatible, false);

  /* diff_structure 负例：目标索引不存在必须明确报错（不能伪 diff）。 */
  const diffMissing = readOnly.find((r) => r.id === 89)?.result;
  assert.equal(diffMissing?.isError, true, 'diff_structure with a missing dest index must fail');
  assert.ok(diffMissing?.content?.[0]?.text.includes('目标索引不存在或不可读，无法 diff'));

  /* cross_cloud_structure_sync 引导词：7 步工作流逐字提供（含 planDigest/expectPlanDigest 闭环）。 */
  const crossCloudPrompt = readOnly.find((r) => r.id === 88).result.messages[0].content.text;
  for (const step of ['probe_capabilities', 'compare_capabilities', 'dryRun:true', 'expectPlanDigest',
    'destCreateMode NONE', 'diff_structure', 'expectedRemovals vs unexpected']) {
    assert.ok(crossCloudPrompt.includes(step), `cross_cloud_structure_sync prompt must mention ${step}`);
  }

  assert.deepEqual(readOnly.find((r) => r.id === 51).result.resources.map((r) => r.uri),
    ['ui://esquerystudio/tool-console', 'esquerystudio://connections', 'esquerystudio://connection/prod', 'esquerystudio://connection/qa', 'esquerystudio://connection/aws']);
  assert.equal(readOnly.find((r) => r.id === 51).result.resources[0].mimeType, 'text/html;profile=mcp-app');
  assert.equal(readOnly.find((r) => r.id === 51).result.resources[1].name, '连接目录');
  const localConnectionResource = readOnly.find((r) => r.id === 51).result.resources
    .find((r) => r.uri === 'esquerystudio://connection/prod');
  assert.equal(localConnectionResource.name, '连接 · Production');
  assert.ok(!localConnectionResource.name.includes('connection-prod'), 'resource names must be human-readable');
  assert.equal(readOnly.find((r) => r.id === 52).result.resourceTemplates.length, 8);
  const mrtr = readOnly.find((r) => r.id === 69)?.result;
  assert.equal(mrtr?.resultType, 'input_required', 'MRTR must return input_required before destructive write');
  assert.equal(mrtr?.inputRequests?.confirm?.method, 'elicitation/create');
  assert.ok(mrtr?.requestState, 'MRTR must return a requestState');
  assert.equal(readOnly.find((r) => r.id === 52).result.resourceTemplates[0].name, '连接详情');
  assert.deepEqual(JSON.parse(readOnly.find((r) => r.id === 53).result.contents[0].text).map((c) => c.id),
    ['prod', 'qa', 'aws']);
  assert.equal(JSON.parse(readOnly.find((r) => r.id === 54).result.contents[0].text).index, 'research');
  assert.deepEqual(readOnly.find((r) => r.id === 55).result.prompts.map((p) => p.name),
    ['diagnose_slow_query', 'design_index_mapping', 'migrate_index', 'review_cluster_capacity', 'triage_failed_search', 'cross_cloud_structure_sync']);
  const guided = readOnly.find((r) => r.id === 56).result.messages[0].content.text;
  assert.ok(guided.includes('`prod`') && guided.includes('`research`') && guided.includes('es_search'));
  assert.ok(toolResult(readOnly, 57).data_streams);
  assert.equal(toolResult(readOnly, 58).data_streams[0].name, 'logs-app');
  assert.ok(toolResult(readOnly, 59).data_streams);
  assert.equal(toolResult(readOnly, 60).component_templates[0].name, 'base');
  const completion = readOnly.find((r) => r.id === 66).result.completion;
  assert.deepEqual(completion.values, ['prod']);
  assert.equal(completion.hasMore, false);
  const indexCompletion = readOnly.find((r) => r.id === 67).result.completion;
  assert.deepEqual(indexCompletion.values, ['research']);

  const writable = responses(await runLocal(configPath, ['--allow-write'], ledgerEnv));
  const writableGroups = writable.find((r) => r.id === 2).result.tools;
  /* 编排两组契约计数：es_adhoc_rebuild 10 action、es_xmigrate 18 action。 */
  const writableAdhocActions = writableGroups.find((t) => t.name === 'es_adhoc_rebuild')
    .inputSchema.properties.action.enum;
  assert.equal(writableAdhocActions.length, 10, 'es_adhoc_rebuild must expose 10 actions');
  assert.ok(writableAdhocActions.includes('events'), 'new adhoc events action must be visible');
  const writableXmigrateActions = writableGroups.find((t) => t.name === 'es_xmigrate')
    .inputSchema.properties.action.enum;
  assert.equal(writableXmigrateActions.length, 18, 'es_xmigrate must expose 18 actions');
  for (const action of ['connect_check', 'resolve_preview', 'dest_indices', 'delete_jobs', 'sync_structure', 'probe_capabilities', 'compare_capabilities', 'diff_structure', 'throttle']) {
    assert.ok(writableXmigrateActions.includes(action), `new xmigrate action ${action} must be visible`);
  }
  const docsActions = writableGroups.find((t) => t.name === 'es_documents').inputSchema.properties.action.enum;
  for (const action of ['index', 'update', 'delete', 'bulk']) {
    assert.ok(docsActions.includes(action), `${action} must be visible with --allow-write`);
  }
  const indexActions = writableGroups.find((t) => t.name === 'es_indices').inputSchema.properties.action.enum;
  for (const action of ['create', 'delete', 'put_mapping', 'update_settings', 'alias', 'rollover', 'force_merge']) {
    assert.ok(indexActions.includes(action), `${action} must be visible with --allow-write`);
  }
  const templateActions = writableGroups.find((t) => t.name === 'es_templates').inputSchema.properties.action.enum;
  assert.ok(templateActions.includes('put') && templateActions.includes('delete'));
  assert.equal(toolResult(writable, 6).result, 'updated');
  assert.equal(toolResult(writable, 9).index, 'research_new');
  assert.equal(toolResult(writable, 10).acknowledged, true);
  assert.equal(toolResult(writable, 11).acknowledged, true);
  assert.equal(toolResult(writable, 12).acknowledged, true);
  assert.equal(toolResult(writable, 13).new_index, 'research-000002');
  assert.equal(toolResult(writable, 14)._shards.total, 1);
  assert.equal(toolResult(writable, 15).acknowledged, true);
  assert.equal(toolResult(writable, 16).acknowledged, true);
  assert.equal(toolResult(writable, 17).index, 'research_new');
  assert.equal(toolResult(writable, 18).updated, 2);
  assert.equal(toolResult(writable, 19).deleted, 1);
  assert.equal(toolResult(writable, 20).created, 2);
  assert.equal(toolResult(writable, 21).tokens[0].token, 'x');
  assert.deepEqual(toolResult(writable, 22).persistent, {});
  assert.equal(toolResult(writable, 23)[0].name, 'repo1');
  assert.equal(toolResult(writable, 24)[0].snapshot, 's1');
  assert.equal(toolResult(writable, 25).snapshots[0].snapshot, 's1');
  assert.equal(toolResult(writable, 26)[0].name, 'policy1');
  assert.equal(toolResult(writable, 27).count, 1);
  assert.equal(toolResult(writable, 28).task.id, 'node:1');
  assert.equal(toolResult(writable, 29).acknowledged, true);
  assert.equal(toolResult(writable, 30).acknowledged, true);
  assert.equal(toolResult(writable, 31).acknowledged, true);
  assert.equal(toolResult(writable, 32).acknowledged, true);
  assert.equal(toolResult(writable, 33).acknowledged, true);
  assert.equal(toolResult(writable, 34).acknowledged, true);
  assert.equal(toolResult(writable, 35).acknowledged, true);
  assert.equal(toolResult(writable, 36).acknowledged, true);
  assert.equal(toolResult(writable, 37).acknowledged, true);
  assert.equal(toolResult(writable, 38).operation_mode, 'RUNNING');
  assert.equal(toolResult(writable, 39).valid, true);
  assert.ok(toolResult(writable, 40).term_vectors);
  assert.ok(toolResult(writable, 41).hits);
  assert.ok(toolResult(writable, 42).template_output);
  assert.equal(toolResult(writable, 43).name, 'research');
  assert.equal(toolResult(writable, 44).index, 'research');
  assert.ok(toolResult(writable, 45).indices);
  assert.ok(Array.isArray(toolResult(writable, 46).tasks));
  assert.ok(toolResult(writable, 47).policies);
  assert.equal(toolResult(writable, 48).status.operation_mode, 'RUNNING');
  assert.equal(toolResult(writable, 49).acknowledged, true);
  assert.equal(toolResult(writable, 50).docs.length, 2);
  assert.equal(toolResult(writable, 61).acknowledged, true);
  assert.equal(toolResult(writable, 62).acknowledged, true);
  assert.equal(toolResult(writable, 63).acknowledged, true);
  assert.equal(toolResult(writable, 64).acknowledged, true);
  assert.equal(toolResult(writable, 65).acknowledged, true);

  /* 结构同步双层收敛：planned 兼容矩阵预剔除（apack/ttl/routing/ilm/ik+字段降级），
     reactive 只兜底 R1 的 unknown setting [index.custom.private] → R2 建成；
     syncAliases=true 把 sync-alias 随迁到目标（POST /_aliases 落进 mock 留档）。 */
  const structure = toolResult(writable, 81);
  assert.equal(structure.created, true, 'sync_structure must converge to created=true');
  assert.equal(structure.rounds, 2, `expected 2 rounds (planned pre-prune + one reactive), got ${structure.rounds}`);
  assert.equal(structure.destIndex, 'sync-dest');
  assert.equal(structure.dryRun, false);
  const plannedKeys81 = structure.planned.removedSettings.map((s) => s.key);
  for (const key of ['index.apack.knn', 'index.ttl', 'index.routing.allocation.include.tag', 'index.lifecycle.name']) {
    assert.ok(plannedKeys81.includes(key), `planned prune must remove ${key}`);
  }
  assert.equal(structure.planned.removedAnalysis.length, 1);
  assert.equal(structure.planned.removedAnalysis[0].name, 'ik_max_word');
  assert.ok(structure.planned.removedAnalysis[0].reason.includes('目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用'));
  assert.deepEqual(structure.planned.downgradedFields.map((d) => [d.field, d.from, d.to]),
    [['title', 'ik_max_word', 'standard']]);
  assert.deepEqual(structure.reactive.removedSettings.map((s) => s.key), ['index.custom.private']);
  assert.ok(String(structure.reactive.removedSettings[0].reason).includes('index.custom.private'));
  assert.equal(structure.source.version, '8.13.0');
  assert.equal(structure.target.version, '8.13.0');
  assert.equal(structure.source.vendor.id, 'aliyun');
  assert.equal(structure.target.vendor.id, 'aliyun');
  assert.deepEqual(structure.aliases, { skipped: [], synced: ['sync-alias'] });
  assert.ok(structure.advice.some((a) => a.kind === 'shards' && a.message.includes('建议 ≤ 3')));
  assert.deepEqual(structure.warnings, []);
  /* v3 执行路径同样返回计划快照：digest 输入的 aliases 恒为源别名全量名单（与 syncAliases
     意图无关），同源下与 84 的 dryRun 摘要一致；body.aliases 为事实成功名单（synced 口径）。 */
  assert.match(structure.planDigest, /^[0-9a-f]{16}$/);
  assert.equal(structure.planDigest, plan.planDigest, 'same source must yield the same plan digest');
  assert.deepEqual(structure.body.aliases, ['sync-alias'], 'executed body aliases are the actually synced list');

  /* 端到端编排：--allow-write 下 adhoc start（scroll 两页 + bulk + 别名切换）到终态，
     events 非空；xmigrate start 跨档案搬运同样到终态；台账落盘且启动时 RUNNING 标
     INTERRUPTED。 */
  const session = startLocal(configPath, ['--allow-write'], ledgerEnv);
  try {
    session.send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    await session.resp(1);
    session.send(call(101, 'es_adhoc_rebuild', 'start', { index: 'research', batchSize: 2 }));
    const started = await resultOf(session, 101);
    assert.ok(started.jobId, 'adhoc start must return a job id immediately');
    assert.equal(started.sourceIndex, 'research');
    assert.equal(started.destIndex, 'reindex-research');
    assert.equal(started.totalDocs, 3);
    let adhocFinal = null;
    for (let round = 0; round < 40 && !adhocFinal; round++) {
      session.send(call(102, 'es_adhoc_rebuild', 'status', { jobId: started.jobId }));
      const snapshot = await resultOf(session, 102);
      if (['SUCCEEDED', 'FAILED', 'ABORTED'].includes(snapshot.status)) adhocFinal = snapshot;
      else await sleep(50);
    }
    assert.equal(adhocFinal?.status, 'SUCCEEDED', `adhoc job must reach SUCCEEDED, got ${adhocFinal?.status}`);
    assert.equal(adhocFinal.migrated, 3, 'two scroll pages (2+1 docs) must all land in the dest index');
    assert.equal(adhocFinal.conflicts, 0);
    assert.equal(adhocFinal.progressPercent, 100);
    session.send(call(103, 'es_adhoc_rebuild', 'events', { jobId: started.jobId }));
    const timeline = await resultOf(session, 103);
    assert.ok(timeline.events.length >= 3, 'event timeline must be non-empty');
    assert.ok(timeline.events.some((e) => e.stage === 'prepare' && e.status === 'RUNNING'));
    assert.ok(timeline.events.some((e) => e.stage === 'switch' && e.status === 'SUCCEEDED'));
    session.send(call(104, 'es_adhoc_rebuild', 'jobs', {}));
    const adhocJobs = await resultOf(session, 104);
    assert.ok(adhocJobs.some((j) => j.jobId === started.jobId && j.status === 'SUCCEEDED'));

    session.send(call(111, 'es_xmigrate', 'start', {
      srcConnId: 'qa', sourceIndex: 'research', destIndex: 'xmigrate-dest',
      destCreateMode: 'COPY_FROM_SOURCE', batchSize: 2,
    }));
    const xStarted = await resultOf(session, 111);
    assert.ok(xStarted.jobId);
    assert.equal(xStarted.srcConnId, 'qa');
    let xFinal = null;
    for (let round = 0; round < 40 && !xFinal; round++) {
      session.send(call(112, 'es_xmigrate', 'status', { jobId: xStarted.jobId }));
      const snapshot = await resultOf(session, 112);
      if (['SUCCEEDED', 'FAILED', 'ABORTED'].includes(snapshot.status)) xFinal = snapshot;
      else await sleep(50);
    }
    assert.equal(xFinal?.status, 'SUCCEEDED', `xmigrate job must reach SUCCEEDED, got ${xFinal?.status}`);
    assert.equal(xFinal.migrated, 3);
    session.send(call(113, 'es_xmigrate', 'conflicts', { jobId: xStarted.jobId }));
    /* 冲突样本形态对齐服务端 McpController：{jobId, conflicts, conflictSamples, sampleCap, note} */
    const conflicts = await resultOf(session, 113);
    assert.equal(conflicts.conflicts, 0);
    assert.deepEqual(conflicts.conflictSamples, []);
    assert.equal(conflicts.sampleCap, 1000);
    assert.ok(conflicts.note.includes('环形收集'));

    /* MRTR digest 缺陷正控：elicitation 回传键（inputResponses/requestState）嵌进
       arguments 重发时，剥离必须发生在 digest 验签之前——此前该形态恒 -32602。 */
    const elicitationMeta = { _meta: { 'io.modelcontextprotocol/clientCapabilities': { elicitation: {} } } };
    session.send(call(121, 'es_batch', 'delete_by_query',
      { index: 'research', query: { match_all: {} } }, elicitationMeta));
    const mrtrFirst = await session.resp(121);
    assert.equal(mrtrFirst.result?.resultType, 'input_required');
    const mrtrState = mrtrFirst.result.requestState;
    assert.ok(mrtrState, 'MRTR first call must return a requestState');
    session.send(call(122, 'es_batch', 'delete_by_query',
      { index: 'research', query: { match_all: {} },
        inputResponses: { confirm: { action: 'accept', content: { confirm: true } } },
        requestState: mrtrState }, elicitationMeta));
    const mrtrEmbedded = await resultOf(session, 122);
    assert.equal(mrtrEmbedded.deleted, 1, 'MRTR confirm embedded in arguments must pass digest verification');
    session.send(call(123, 'es_batch', 'delete_by_query',
      { index: 'research', query: { match_all: {} },
        inputResponses: { confirm: { action: 'accept', content: { confirm: true } } },
        requestState: 'mrtr-bogus' }, elicitationMeta));
    const mrtrBadState = await session.resp(123);
    assert.equal(mrtrBadState.error?.code, -32602, 'an unknown confirmation state must still be rejected');

    /* sync_structure v3 digest 闭环：dryRun 取 planDigest → 错 digest 拒绝（含双 digest 与
       漂移提示）→ 正 digest 执行成功且返回同值 digest。 */
    session.send(call(131, 'es_xmigrate', 'sync_structure',
      { srcConnId: 'qa', sourceIndex: 'sync-src', destIndex: 'sync-verify', dryRun: true }));
    const verifyPlan = await resultOf(session, 131);
    assert.match(verifyPlan.planDigest, /^[0-9a-f]{16}$/);
    session.send(call(132, 'es_xmigrate', 'sync_structure',
      { srcConnId: 'qa', sourceIndex: 'sync-src', destIndex: 'sync-verify', expectPlanDigest: 'deadbeefdeadbeef' }));
    const drifted = await session.resp(132);
    assert.equal(drifted.result?.isError, true, 'a wrong expectPlanDigest must reject the execution');
    const driftedText = drifted.result?.content?.[0]?.text || '';
    assert.ok(driftedText.includes('计划摘要不匹配，拒绝执行：期望'),
      'the drift error must use the unified Chinese message');
    assert.ok(driftedText.includes('deadbeefdeadbeef') && driftedText.includes(verifyPlan.planDigest),
      'the mismatch error must carry both digests');
    assert.ok(driftedText.includes('source structure drifted, re-run dryRun'));
    session.send(call(133, 'es_xmigrate', 'sync_structure',
      { srcConnId: 'qa', sourceIndex: 'sync-src', destIndex: 'sync-verify', expectPlanDigest: verifyPlan.planDigest }));
    const verified = await resultOf(session, 133);
    assert.equal(verified.created, true);
    assert.equal(verified.planDigest, verifyPlan.planDigest, 'a matching digest must let the execution through');
    assert.deepEqual(verified.body.aliases, [], 'executed body aliases follow the synced scope (no syncAliases)');

    /* throttle：slow-src 首屏延迟 300ms 提供 RUNNING 窗口；运行中调速返回
       {ok,jobId,rps,appliedAt} 且台账可查；终态/未知作业调速必须报错。 */
    session.send(call(141, 'es_xmigrate', 'start',
      { srcConnId: 'qa', sourceIndex: 'slow-src', destIndex: 'research', destCreateMode: 'NONE', batchSize: 2 }));
    const throttledJob = await resultOf(session, 141);
    assert.ok(throttledJob.jobId);
    session.send(call(142, 'es_xmigrate', 'throttle', { jobId: throttledJob.jobId, rps: 1000 }));
    const throttled = await resultOf(session, 142);
    assert.equal(throttled.ok, true);
    assert.equal(throttled.jobId, throttledJob.jobId);
    assert.equal(throttled.rps, 1000);
    assert.ok(Number.isFinite(throttled.appliedAt));
    /* 边界负例：rps<-1 明确拒绝（-1 是不限速哨兵，不再归一），rps=0 保持拒绝 */
    session.send(call(146, 'es_xmigrate', 'throttle', { jobId: throttledJob.jobId, rps: -2 }));
    const negativeRps = await session.resp(146);
    assert.equal(negativeRps.result?.isError, true, 'rps < -1 must be rejected');
    assert.ok(negativeRps.result?.content?.[0]?.text.includes('rps 不得小于 -1：不限速请传 -1'));
    session.send(call(147, 'es_xmigrate', 'throttle', { jobId: throttledJob.jobId, rps: 0 }));
    const zeroRps = await session.resp(147);
    assert.equal(zeroRps.result?.isError, true, 'rps = 0 must stay rejected');
    assert.ok(zeroRps.result?.content?.[0]?.text.includes('rps 不得为 0'));
    let throttledFinal = null;
    for (let round = 0; round < 40 && !throttledFinal; round++) {
      session.send(call(143, 'es_xmigrate', 'status', { jobId: throttledJob.jobId }));
      const snapshot = await resultOf(session, 143);
      if (['SUCCEEDED', 'FAILED', 'ABORTED'].includes(snapshot.status)) throttledFinal = snapshot;
      else await sleep(50);
    }
    assert.equal(throttledFinal?.status, 'SUCCEEDED', `throttled job must reach SUCCEEDED, got ${throttledFinal?.status}`);
    assert.equal(throttledFinal.migrated, 3);
    assert.equal(throttledFinal.throttleRps, 1000, 'the applied throttle must be visible in the job snapshot');
    assert.ok(throttledFinal.recentEvents.some((e) => e.stage === 'THROTTLE' && e.status === 'RUNNING'),
      'throttle events must use the uppercase THROTTLE stage');
    session.send(call(144, 'es_xmigrate', 'throttle', { jobId: throttledJob.jobId, rps: 500 }));
    const terminalThrottle = await session.resp(144);
    assert.equal(terminalThrottle.result?.isError, true, 'throttling a terminal job must fail');
    assert.ok(terminalThrottle.result?.content?.[0]?.text.includes('仅运行中作业可调速'));
    session.send(call(145, 'es_xmigrate', 'throttle', { jobId: 'xmgr-no-such', rps: 1 }));
    const unknownThrottle = await session.resp(145);
    assert.equal(unknownThrottle.result?.isError, true, 'throttling an unknown job must fail');
    assert.ok(unknownThrottle.result?.content?.[0]?.text.includes('Unknown xmigrate job'));

    /* 别名切换真实落到 mock：源别名 remove、目标别名 add，读别名保序；
       结构同步 syncAliases=true 的 add sync-alias 也在此留档。 */
    const aliasSwitch = server.aliasCalls
      .map((c) => { try { return JSON.parse(c.body); } catch { return null; } })
      .filter((b) => b && Array.isArray(b.actions))
      .flatMap((b) => b.actions);
    assert.ok(aliasSwitch.some((a) => a.remove && a.remove.index === 'research' && a.remove.alias === 'research_alias'),
      'alias switch must remove the source alias');
    assert.ok(aliasSwitch.some((a) => a.add && a.add.index === 'reindex-research' && a.add.alias === 'research_alias'),
      'alias switch must add the dest alias');
    assert.ok(aliasSwitch.some((a) => a.add && a.add.index === 'sync-dest' && a.add.alias === 'sync-alias'),
      'sync_structure syncAliases=true must add the source alias on the dest index');

    /* 台账落盘：两类作业各一条终态记录，无 RUNNING 残留。 */
    const persisted = JSON.parse(readFileSync(jobsFile, 'utf8'));
    assert.equal(persisted.adhoc[0].status, 'SUCCEEDED');
    assert.equal(persisted.xmigrate[0].status, 'SUCCEEDED');
    assert.equal(persisted.adhoc[0].migrated, 3);
  } finally {
    session.child.kill();
  }

  /* 进程退出语义：上次 RUNNING 的作业在新进程启动时标 INTERRUPTED。 */
  writeFileSync(jobsFile, JSON.stringify({
    adhoc: [{
      jobId: 'adhoc-stale-1', type: 'adhoc', status: 'RUNNING', writeMode: 'index',
      createdAt: Date.now(), updatedAt: Date.now(), startedAt: Date.now(), finishedAt: null,
      migrated: 1, conflicts: 0, errors: 0, pages: 1, totalDocs: 3,
      conflictSamples: [], events: [], error: null, lastBulkError: null,
      connId: 'prod', sourceIndex: 'research', sourcePhysicalIndex: 'research',
      destIndex: 'reindex-research', strategy: 'INCREMENTAL', batchSize: 2,
      pauseBeforeSwitch: false, deleteOldIndex: false, timeField: null,
    }],
    xmigrate: [],
  }), 'utf8');
  const staleSession = startLocal(configPath, [], ledgerEnv);
  try {
    staleSession.send({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    await staleSession.resp(1);
    staleSession.send(call(201, 'es_adhoc_rebuild', 'status', { jobId: 'adhoc-stale-1' }));
    const stale = await resultOf(staleSession, 201);
    assert.equal(stale.status, 'INTERRUPTED', 'orphaned RUNNING job must load as INTERRUPTED');
    assert.ok(stale.recentEvents.some((e) => e.stage === 'startup' && e.status === 'INTERRUPTED'));
  } finally {
    staleSession.child.kill();
  }

  console.log('[local-mcp] OK — stdio handshake, 3 connections, single-track group + action calls (per-tool names rejected), read tools, write opt-in, resources/prompts (6 incl. cross_cloud_structure_sync), data streams/index topology, direct ES HTTP, index lifecycle, batch data ops, cluster/snapshot/ILM/scripts/diagnostics, local scroll+bulk rebuild & cross-cluster migration orchestration (10 adhoc + 18 xmigrate actions incl. token-boundary vendor inference, planned/reactive two-layer structure sync v3 with dryRun preview + planDigest/body + expectPlanDigest drift gate, compare_capabilities risk matrix, diff_structure expected-vs-unexpected reconciliation, in-flight throttle, MRTR confirm embedded in arguments, ledger + alias switch + interrupted-on-restart)');
} finally {
  awsServer.close();
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
