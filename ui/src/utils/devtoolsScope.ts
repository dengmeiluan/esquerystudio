import { stripJsonComments } from './jsonc';

/**
 * DevTools 非 ADMIN 写范围（与后端 EsIndexAdmin.guardRawSystemWrite /
 * guardRawIndexWrite 数据面白名单同口径）：只允许检索、文档、批量、SQL 等
 * 数据面写；集群设置/别名/快照/模板/脚本等管理写必须 ADMIN。
 * 该函数只用于前端预暴露，最终边界仍在后端 guardRawGuarded。
 */
const SYSTEM_DATA_WRITE = new Set([
  '/_bulk', '/_msearch', '/_msearch/template', '/_mget',
  '/_search', '/_search/template', '/_count',
  '/_async_search', '/_field_caps', '/_analyze', '/_render/template',
  /* SQL 只镜像后端的三个具名子路由：/ _sql/** 整段放行会让新增子路由（如
     DELETE /_sql/async/{id}）自动获得写权限。 */
  '/_sql', '/_sql/close', '/_sql/translate',
  '/_xpack/sql', '/_xpack/sql/close', '/_xpack/sql/translate',
]);

/* 根级 PIT/scroll 与后端 987 同口径：POST 开全集群 PIT/续读 scroll 等价全量读必须拒，
   仅 DELETE（显式清理资源）放行；限定索引的 POST /logs/_pit 走索引级白名单。 */
const SYSTEM_DATA_WRITE_DELETE_ONLY = new Set(['/_pit', '/_search/scroll']);

const INDEX_DATA_WRITE_OPS = new Set([
  '_doc', '_create', '_update', '_bulk', '_delete_by_query', '_update_by_query',
  '_search', '_count', '_msearch', '_mget', '_explain', '_validate',
  '_field_caps', '_termvectors', '_mtermvectors', '_analyze', '_pit',
  '_terms_enum', '_rank_eval', '_knn_search',
]);

/* 后端 RAW_INDEX_MUTATING_GET 镜像：这些“读”动词在 ES 侧会改状态
   （refresh/flush/cache/forcemerge/close/open/rollover/bulk/dbq/ubq/reindex）。 */
const INDEX_MUTATING_GET = new Set([
  '_refresh', '_flush', '_cache', '_forcemerge', '_close', '_open',
  '_rollover', '_delete_by_query', '_update_by_query', '_bulk', '_reindex',
]);

/* 后端 RAW_INDEX_TOPOLOGY_READ_DENY 镜像：索引级分片拓扑读与根形态同权拒绝——
   根形态（/_recovery 等）已在 SYSTEM_READ_DENY，分片恢复/段/存储/统计借索引前缀
   绕根清单会带出节点名与传输地址。`_search_shards` 的响应自带 nodes[].transport_address，
   与根形态 /_search_shards 同一口径拒绝。后端清单新增拒绝项时此处必须同步（两处清单注释互指）。 */
const INDEX_TOPOLOGY_READ_DENY = new Set(['_recovery', '_shard_stores', '_segments', '_stats', '_search_shards']);

/* 后端 guardRawSystemRead 的 RAW_SYSTEM_READ_DENY 同源镜像（段前缀）：
   非 ADMIN 的系统管理读（账号/快照/脚本/节点/模板/任务等）在客户端即禁用，
   不再亮钮后端 403。后端清单新增拒绝项时此处必须同步（两处清单注释互指）。 */
const SYSTEM_READ_DENY = new Set([
  '/_security', '/_xpack/security', '/_snapshot', '/_watcher', '/_xpack/watcher',
  '/_scripts', '/_ingest', '/_ilm', '/_xpack/ilm', '/_slm', '/_ml', '/_xpack/ml',
  '/_transform', '/_xpack/transform', '/_rollup', '/_xpack/rollup',
  '/_ccr', '/_xpack/ccr', '/_remote', '/_nodes', '/_cluster/state',
  '/_cluster/settings', '/_mapping', '/_settings', '/_cat/repositories', '/_cat/snapshots',
  '/_cat/count', '/_cat/segments', '/_cat/recovery', '/_cat/allocation', '/_stats',
  '/_search_shards', '/_segments', '/_recovery', '/_shard_stores', '/_cat/fielddata',
  '/_resolve', '/_alias', '/_aliases',
  '/_tasks', '/_cat/tasks', '/_cluster/allocation', '/_cluster/pending_tasks', '/_cat/pending_tasks',
  '/_cat/templates', '/_index_template', '/_component_template', '/_template',
  '/_cat/nodes', '/_cat/nodeattrs', '/_cat/thread_pool', '/_cat/plugins',
  /* master 身份 / 投票排除清单：节点 id/name 与选主成员的直接出口。
     清单按「deny 本身或 deny + /」匹配——`/_cluster/voting` 匹配不到
     `/_cluster/voting_config_exclusions`，必须写全（后端同源注释）。 */
  '/_cat/master', '/_cluster/voting', '/_cluster/voting_config_exclusions',
  '/_cat/transforms', '/_cat/ml', '/_cat/component_templates',
  '/_data_stream', '/_features', '/_license', '/_xpack/license', '/_xpack/usage',
  '/_cluster/stats', '/_enrich', '/_monitoring',
  /* 1046：新版采集/连接器/同义词/查询规则/弹性伸缩/可搜索快照的元数据面（可带凭据/容量）。 */
  '/_logstash', '/_connector', '/_synonyms', '/_query_rules', '/_autoscaling', '/_searchable_snapshots',
  '/_search/scroll', '/_cat/hot_threads', '/_dangling', '/_xpack',
  '/_script_context', '/_script_language', '/_migration', '/_async_search/status',
  '/_refresh', '/_flush', '/_cache', '/_forcemerge', '/_close', '/_open', '/_reindex',
]);

/* 后端同款特例：_authenticate 是客户端自省（谁在问），无控制面泄露。 */
const SYSTEM_READ_DENY_EXACT_ALLOW = new Set(['/_security/_authenticate', '/_xpack/security/_authenticate']);

/** 后端段前缀口径镜像：deny 本身或 deny 后紧跟新段（deny + '/'）。 */
function systemReadDenied(clean: string): boolean {
  /* 后端守卫统一按小写判定（/ _NODES 与 /_nodes 同权）：前端不归一就会在
     「大写变体」上亮钮，点下去必 403。 */
  const key = clean.toLowerCase();
  if (SYSTEM_READ_DENY_EXACT_ALLOW.has(key)) return false;
  /* 异步查询结果（async search / async SQL / EQL）按 id 取回：id 即凭据，
     结果集按执行者权限生成。提交动作不受影响，只挡按 id 取回/查状态。 */
  if (key.startsWith('/_async_search/') || key.startsWith('/_sql/async/')
      || key.startsWith('/_xpack/sql/async/') || key.startsWith('/_eql/search/')) return true;
  if (SYSTEM_READ_DENY.has(key)) return true;
  for (const deny of SYSTEM_READ_DENY) {
    if (key.startsWith(deny + '/')) return true;
  }
  return false;
}

/** 后端 canonicalRawPath 的 TS 侧简化镜像：剥 query/fragment、URL 解码、折叠空段与 `.` 段。
 * 非法 % 序列解码失败保持字面（后端对非法序列 fail-closed 拒绝，前端字面大多不在
 * 白名单同样被拒——两侧保守方向一致）。`..` 段不折叠：由调用方的 includes('..') 拒绝。 */
function canonicalPath(raw: string): string {
  let p = String(raw || '').split('?')[0].split('#')[0];
  try { p = decodeURIComponent(p); } catch { /* 非法 % 序列保持字面 */ }
  const segs = p.split('/').filter(s => s !== '' && s !== '.');
  return segs.length === 0 ? '/' : '/' + segs.join('/');
}

/** 后端 typed 兼容路由拒绝的镜像：/logs/_doc/_bulk、/logs/_doc/1/_update 这类把
 * 操作动词后置到第 3/4 段的旧版路由形态，后端整体拒绝（守卫按第 2 段分派会漏掉
 * 全部 body 守卫）——前端同口径禁用，不再亮「可执行」让用户碰后端 403。 */
function typedRouteVerbLater(segs: string[]): boolean {
  for (let i = 2; i < segs.length; i++) {
    const seg = segs[i].toLowerCase();
    if (INDEX_DATA_WRITE_OPS.has(seg) || INDEX_MUTATING_GET.has(seg)
        || INDEX_TOPOLOGY_READ_DENY.has(seg) || seg === '_mapping' || seg === '_alias') {
      return true;
    }
  }
  return false;
}

/* 根级检索类端点（无索引前缀）：非 ADMIN 只有两种合法形态——路径带索引
   （/{index}/_search）或 body 带有效 pit.id。裸调用=全量读，会把控制面索引一并读出来。
   与后端 EsIndexAdmin.guardAllIndexRead 同口径；此前前端一律放行、后端 403（看得见点不了）。 */
const ROOT_SEARCH_PATHS = new Set([
  '/_search', '/_count', '/_field_caps', '/_async_search',
  '/_terms_enum', '/_rank_eval', '/_search/template',
]);

/** 根级检索是否缺少索引范围（缺=前端提前禁用；PIT 搜索按 ES 契约不带 index，故 body 可豁免）。 */
export function nonAdminRootSearchNeedsIndex(rawPath: string, body?: string | null): boolean {
  const raw = String(rawPath || '');
  const qAt = raw.indexOf('?');
  const pathOnly = canonicalPath(qAt >= 0 ? raw.slice(0, qAt) : raw).toLowerCase();
  if (!ROOT_SEARCH_PATHS.has(pathOnly)) return false;
  let b = String(body || '').trim();
  if (!b && qAt >= 0) {
    /* ES 的 ?source= 与 body 同权：只认 body 会把「?source={"pit":...}」的合法 PIT
       搜索在 UI 侧误禁（后端允许，有权限的人点不了）。 */
    for (const pair of raw.slice(qAt + 1).split('#')[0].split('&')) {
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      try {
        if (decodeURIComponent(pair.slice(0, eq)) !== 'source') continue;
        b = decodeURIComponent(pair.slice(eq + 1)).trim();
        break;
      } catch {
        return true; /* 编码非法：后端 fail-closed */
      }
    }
  }
  if (b) {
    try {
      const o = JSON.parse(stripJsonComments(b));
      /* 与后端 searchBodyHasPit 同口径：pit.id 非空，且不得再带 index/indices
         （带了就是「路径/参数与 PIT 各说一个目标」，后端按 non-PIT 全量处理并拒绝）。 */
      if (o && o.pit && String(o.pit.id || '').trim() && !('index' in o) && !('indices' in o)) {
        return false;
      }
    } catch {
      /* 非法 JSON 交由后端原始报错 */
    }
  }
  return true;
}

/**
 * index/indices 查询参数不构成「已限定目标」的凭据（后端 guardRawIndexQueryParam 同原因）：
 * 无法证明目标端按其路由（被忽略即全量读），且与路径并存时目标二义。非 ADMIN 一律禁用。
 */
export function nonAdminIndexQueryParamRejected(rawPath: string): boolean {
  const raw = String(rawPath || '');
  const qAt = raw.indexOf('?');
  if (qAt < 0) return false;
  const query = raw.slice(qAt + 1).split('#')[0];
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    let key = pair;
    try {
      key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
    } catch {
      return true; /* 编码非法：后端 fail-closed */
    }
    if (key === 'index' || key === 'indices') return true;
  }
  return false;
}

/* 控制面索引的轻量镜像（后端 isControlIndexName/couldMatchControl 的常用形态）：
   点号系统索引、控制词根精确/前后缀、可能命中控制面的通配字面前缀。
   只用于前端提前禁用，最终边界仍在后端。 */

/* _cat 索引目录（indices/aliases/shards）会枚举全部索引名，服务端靠 format=json + index 列
   做行级过滤；不带 format=json 或投影掉了 index 列时后端直接拒绝，前端同口径提前禁用。
   子路径形态 /_cat/indices/logs 与大小写变体必须同样命中——后端是前缀匹配 + 小写判定。 */
const CAT_METADATA_ROOTS = ['/_cat/indices', '/_cat/aliases', '/_cat/shards'];

function isCatMetadataPath(clean: string): boolean {
  const k = clean.toLowerCase();
  return CAT_METADATA_ROOTS.some((root) => k === root || k.startsWith(root + '/'));
}

/** 后端 queryProjectsIndex 镜像：h/headers 每组都必须含 index（或 * / index.*）。 */
function catProjectsIndex(query: string): boolean {
  if (!query.trim()) return true; /* 默认列含 index */
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    let key = pair;
    let value = '';
    try {
      key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
      value = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
    } catch {
      return false;
    }
    if (key !== 'h' && key !== 'headers') continue;
    let hasIndex = false;
    for (const col of value.split(',')) {
      let c = col.trim();
      const order = c.indexOf(':');
      if (order > 0) c = c.slice(0, order).trim();
      if (c === 'index' || c === '*' || c.startsWith('index.')) hasIndex = true;
    }
    if (!hasIndex) return false;
  }
  return true;
}

/** _cat 索引目录是否缺少 format=json 或 index 列（缺=无法行级过滤控制面，非 ADMIN 禁用）。 */
export function nonAdminCatNeedsJson(rawPath: string): boolean {
  const raw = String(rawPath || '');
  const qAt = raw.indexOf('?');
  const clean = canonicalPath(qAt >= 0 ? raw.slice(0, qAt) : raw);
  if (!isCatMetadataPath(clean)) return false;
  const query = qAt >= 0 ? raw.slice(qAt + 1).split('#')[0] : '';
  let hasJson = false;
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    let key = pair;
    let value = '';
    try {
      key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
      value = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
    } catch {
      return true;
    }
    if (key === 'format' && value.trim().toLowerCase() === 'json') hasJson = true;
  }
  if (!hasJson) return true;
  return !catProjectsIndex(query);
}

/** 按 id 取回异步查询结果（async search / async SQL / EQL）：id 即凭据，非 ADMIN 禁用。 */
export function nonAdminAsyncResultRead(rawPath: string): boolean {
  const k = canonicalPath(rawPath).toLowerCase();
  return k.startsWith('/_async_search/') || k.startsWith('/_sql/async/')
    || k.startsWith('/_xpack/sql/async/') || k.startsWith('/_eql/search/');
}

/** 首段是否指向控制面/系统索引（含通配可能命中）——非 ADMIN 提前禁用。
 * 与后端 guardRawGuarded 的段判定同口径：首段是系统 API（_ 前缀）时逐段检查后续
 * 索引位（_cat/indices/esquerystudio* 这类形态），首段是索引时只检查首段（与后端一致，
 * 文档 id 不按索引名解释）。_all 在任何段都等于隐式全量。 */
export function nonAdminControlIndexDenied(rawPath: string): boolean {
  const clean = canonicalPath(rawPath);
  const segs = clean.split('/').filter(Boolean);
  if (!segs.length) return false;
  const first = segs[0].toLowerCase();
  if (first === '_all') return true;
  const tokenDenied = (raw: string): boolean => {
    const t = raw.trim().replace(/^[+-]/, '').toLowerCase();
    if (!t) return false;
    if (t === '*' || t === '_all') return true;
    if (t.startsWith('.')) return true;
    if (t.startsWith('esquerystudio')
      || t === 'esquerystudio_adhoc_job' || t.startsWith('esquerystudio_adhoc_job-')
      || t.endsWith('_esquerystudio_lock') || t.endsWith('_esquerystudio_migrate_job')) return true;
    /* 通配字面前缀可覆盖控制索引（es_*、e* 等）时同样拒绝（后端 couldMatchControl 镜像）。 */
    const literal = t.replace(/[*?].*$/, '');
    if (literal !== t
      && ['esquerystudio', 'esquerystudio_adhoc_job', '_esquerystudio_lock', '_esquerystudio_migrate_job']
        .some((r) => r.startsWith(literal))) return true;
    return false;
  };
  if (!first.startsWith('_')) {
    return first.split(',').some(tokenDenied);
  }
  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i].toLowerCase();
    if (seg === '_all') return true;
    if (!seg.startsWith('_') && seg.split(',').some(tokenDenied)) return true;
  }
  return false;
}

/** 单值目标是否命中控制面（复用首段判定；用于 body/docs/SQL 的二级目标）。 */
function bodyTargetDenied(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const t = value.trim().replace(/^["'`\[]|["'`\]]$/g, '');
  if (!t) return false;
  return nonAdminControlIndexDenied('/' + t);
}

/**
 * 通配/日期数学/跨集群目标的**非阻断提示**（1048）。
 *
 * <p>这些模式需要服务端解析真实索引后才能判断是否命中控制面，前端不能安全预拒
 * （预拒会误伤合法 `logs-*` 检索）。因此在可执行时用 tooltip 提前说明「后端解析，
 * 命中控制面会拒绝」，避免用户以为通配一定放行。</p>
 */
export function nonAdminWildcardTargetAdvisory(rawPath: string, body?: string | null): string | null {
  const raw = String(rawPath || '');
  const path = raw.split('?')[0];
  const segs = canonicalPath(path).split('/').filter(Boolean);
  const first = (segs[0] || '').toLowerCase();
  const target = first.startsWith('_') ? (segs[1] || '') : first;
  const wild = /[*?]/.test(target) || target.includes('<') || target.includes(':');
  if (wild) {
    return '通配/日期数学/跨集群目标由后端解析真实索引：若命中控制面索引会被拒绝；建议优先用精确索引名或 PIT';
  }
  const b = String(body || '');
  if (b) {
    if (/"(?:_?index|indices)"\s*:\s*"[^"]*[*?<:]/.test(b)) {
      return '请求体里的通配/日期数学/跨集群目标由后端解析：命中控制面索引会被拒绝';
    }
    if (/_sql/i.test(path) && /\b(?:FROM|JOIN)\s+[^\s;()]*[*?<:]/.test(b)) {
      return 'SQL 通配/日期数学目标由后端解析：命中控制面索引会被拒绝';
    }
  }
  return null;
}

/**
 * 结构化多目标端点（_bulk/_msearch/_mget/_mtermvectors/_sql）的 body 级目标镜像。
 *
 * <p>这些端点的目标索引不在路径上，而在动作行/请求头/docs/SQL 语句里；后端
 * `guardStructuredRawBody` 会逐条校验，前端只按路径预检就会「亮着可执行、点下去 403」。
 * 只解析目标字段，不盲扫文档正文——正文里出现 {@code .security} 是合法业务字段，
 * 盲扫会把正常写入误杀（与后端注释同一理由）。</p>
 */
export function nonAdminBodyTargetsControl(path: string, body?: string | null): boolean {
  const b = String(body || '').trim();
  if (!b) return false;
  const segs = canonicalPath(path).toLowerCase().split('/').filter(Boolean);
  const first = segs[0] || '';
  const op = first.startsWith('_') ? first : (segs[1] || '');
  if (op === '_bulk') {
    const lines = b.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 2) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const o = JSON.parse(line);
        for (const k of Object.keys(o || {})) {
          const action = o[k];
          if (action && bodyTargetDenied(action._index)) return true;
        }
      } catch {
        /* 非法动作行交由后端原始报错 */
      }
    }
    return false;
  }
  if (op === '_msearch') {
    /* 根路径 /_msearch 的空头 = 不限索引（全量读，后端 guardMsearchBody 拒绝）。
       带索引前缀时 ES 把路径索引当作头的默认索引，空头只查该索引，属既有语义。 */
    const rootedAtBulkOp = first.startsWith('_');
    const lines = b.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 2) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const o = JSON.parse(line);
        if (rootedAtBulkOp && !o.index && !o.indices) return true;
        if (bodyTargetDenied(o.index)) return true;
        /* ES 接受 string 与 array 两种 indices 形态（后端两种都校验）。 */
        if (bodyTargetDenied(o.indices)) return true;
        if (Array.isArray(o.indices) && o.indices.some(bodyTargetDenied)) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }
  if (op === '_mget' || op === '_mtermvectors' || op === '_termvectors') {
    try {
      const o = JSON.parse(stripJsonComments(b));
      if (Array.isArray(o?.docs) && o.docs.some((d: any) => d && bodyTargetDenied(d._index))) return true;
      if (bodyTargetDenied(o?.index) || bodyTargetDenied(o?.parameters?.index)) return true;
      return false;
    } catch {
      return false;
    }
  }
  if (op === '_sql' || (first === '_xpack' && segs[1] === 'sql')) {
    try {
      const o = JSON.parse(stripJsonComments(b));
      /* SQL 注释里的控制面词不应造成前端误禁：后端 guardSql 先剥注释再解析目标。 */
      const q = (typeof o?.query === 'string' ? o.query : '')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n\r]*/g, ' ');
      /* FROM/JOIN 后的逗号列表是多个目标：旧正则只吃到第一个逗号前
         （FROM logs, esquerystudio_user 漏检后者）。整段捕获后逐个 token 判定。 */
      const re = /\b(?:FROM|JOIN)\s+([^\s,;()]+(?:\s*,\s*[^\s,;()]+)*)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(q)) !== null) {
        for (const token of m[1].split(',')) {
          if (bodyTargetDenied(token.trim())) return true;
        }
      }
    } catch {
      /* ignore */
    }
    return false;
  }
  /* 检索类 body 的二级数据源（terms/terms_set lookup、percolate、MLT、wrapper、
     indices 查询、indices_boost、内嵌 _index）与路径同权：后端 guardSearchBody
     逐层扫描，前端只按路径预检会亮「可执行」按钮后 403。 */
  if (op === '_search' || op === '_count' || op === '_render') {
    try {
      const o = JSON.parse(stripJsonComments(b));
      /* 按已存模板 id 渲染/检索会回显/执行 ADMIN 写入的模板体（后端 guardStoredTemplateReference
         同口径）；路径形态 /_render/template/{id} 见下面 index 级判定。 */
      if (o && typeof o === 'object' && !Array.isArray(o) && (o as any).id !== undefined) return true;
      return searchBodyTargetsControl(o);
    } catch {
      return false;
    }
  }
  return false;
}

/** 搜索 DSL 目标扫描（后端 guardSearchTargets 的 TS 镜像）：只认结构化目标键，
 * 不盲扫文档正文/查询值（业务日志里出现 .security 字样是合法的）。 */
function searchBodyTargetsControl(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(searchBodyTargetsControl);
  if (!node || typeof node !== 'object') return false;
  const o = node as Record<string, any>;
  if (bodyTargetDenied(o._index)) return true;
  for (const key of ['terms', 'terms_set']) {
    const clause = o[key];
    if (!clause || typeof clause !== 'object' || Array.isArray(clause)) continue;
    for (const v of Object.values(clause)) {
      if (v && typeof v === 'object' && !Array.isArray(v)
        && bodyTargetDenied((v as any).index)) return true;
    }
  }
  for (const key of ['percolate', 'indexed_shape']) {
    const c = o[key];
    if (c && typeof c === 'object' && bodyTargetDenied((c as any).index)) return true;
  }
  const mlt = o.more_like_this;
  const mltList = Array.isArray(mlt) ? mlt : (mlt ? [mlt] : []);
  for (const m of mltList) {
    if (!m || typeof m !== 'object') continue;
    const likes = Array.isArray(m.like) ? m.like : (m.like ? [m.like] : []);
    for (const d of likes) {
      if (d && typeof d === 'object' && bodyTargetDenied((d as any)._index)) return true;
    }
  }
  const boost = o.indices_boost ?? o.index_boost;
  if (Array.isArray(boost)) {
    for (const one of boost) {
      if (one && typeof one === 'object') {
        for (const k of Object.keys(one)) if (bodyTargetDenied(k)) return true;
      } else if (bodyTargetDenied(one)) return true;
    }
  } else if (boost && typeof boost === 'object') {
    for (const k of Object.keys(boost)) if (bodyTargetDenied(k)) return true;
  }
  const indicesQuery = o.indices;
  if (indicesQuery && typeof indicesQuery === 'object' && !Array.isArray(indicesQuery)
    && Array.isArray((indicesQuery as any).indices)
    && (indicesQuery as any).indices.some(bodyTargetDenied)) return true;
  const wrapper = o.wrapper;
  if (wrapper && typeof wrapper === 'object') {
    for (const key of ['query', 'inline', 'source', 'template']) {
      const raw = (wrapper as any)[key];
      if (typeof raw !== 'string' || !raw.trim()) continue;
      let decoded = raw;
      try { decoded = atob(raw); } catch { /* 非 base64：按 JSON 原文尝试 */ }
      try { if (searchBodyTargetsControl(JSON.parse(decoded))) return true; } catch { /* 非 JSON */ }
    }
  }
  return Object.values(o).some(searchBodyTargetsControl);
}

/** health 的 index/shards 级视图会枚举控制面索引名（后端 queryRequestsIndexLevel 同口径）。
 * 根路径与 /_cluster/health/{index} 形态都检查 level=indices|shards。 */
export function nonAdminHealthLevelEnumeration(rawPath: string): boolean {
  const raw = String(rawPath || '');
  const qAt = raw.indexOf('?');
  const clean = canonicalPath(qAt >= 0 ? raw.slice(0, qAt) : raw).toLowerCase();
  if (clean !== '/_cluster/health' && !clean.startsWith('/_cluster/health/')) return false;
  if (qAt < 0) return false;
  const query = raw.slice(qAt + 1).split('#')[0];
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    try {
      const key = decodeURIComponent(pair.slice(0, eq));
      const value = decodeURIComponent(pair.slice(eq + 1)).trim().toLowerCase();
      if (key === 'level' && (value === 'indices' || value === 'shards')) return true;
    } catch {
      return true; /* 编码非法：后端 fail-closed */
    }
  }
  return false;
}

export function nonAdminDataPlaneWriteAllowed(method: string, path: string, body?: string | null): boolean {
  const m = String(method || 'GET').toUpperCase();
  const clean = canonicalPath(path);
  if (!clean.startsWith('/') || clean.includes('..') || clean.includes(';')) return false;
  /* 后端对 %2F/%3B/%5C/%00 解码后的分隔符 fail-closed（防路由语义分歧）：
     前端若先解码再放行，会出现「亮可执行、后端拒绝」。 */
  if (/%2f|%3b|%5c|%00/i.test(String(path || '').split('?')[0])) return false;
  /* 先钉目标再分派读写：查询参数不算限定、控制面索引/通配直接拒、根级检索要路径或 PIT。
     GET/POST 同规则（后端两处守卫同口径）。 */
  if (nonAdminIndexQueryParamRejected(path)) return false;
  if (nonAdminHealthLevelEnumeration(path)) return false;
  if (nonAdminCatNeedsJson(path)) return false;
  if (nonAdminControlIndexDenied(path)) return false;
  if (nonAdminRootSearchNeedsIndex(path, body)) return false;
  /* body 里的二级目标（bulk 动作行 / msearch 头 / mget docs / SQL FROM）与路径同权：
     只按路径预检会让「指向控制面的批量写」亮成可执行，点下去才 403。 */
  if (nonAdminBodyTargetsControl(path, body)) return false;
  const segs = clean.split('/').filter(Boolean);
  /* 根路径 GET 是集群名/版本的自省（后端不拦）：不能因为「没有路径段」把有权限的人挡在门外。 */
  if (segs.length === 0) return m === 'GET' || m === 'HEAD';
  const first = segs[0].toLowerCase();
  if (m === 'GET' || m === 'HEAD') {
    /* 读侧镜像系统读拒绝清单（992）：系统管理读在客户端即禁用——所见即所得，
       不再亮钮后端 403；索引级读不受限（清单全部是 /_ 系统前缀）。 */
    if (systemReadDenied(clean)) return false;
    const second = segs[1]?.toLowerCase();
    if (second && INDEX_MUTATING_GET.has(second)) return false;
    if (second && INDEX_TOPOLOGY_READ_DENY.has(second)) return false;
    if (typedRouteVerbLater(segs)) return false;
    return true;
  }
  /* 后端 raw 方法白名单只认 GET/POST/PUT/DELETE/HEAD：OPTIONS/CONNECT/TRACE 等
     UI 不会出现的方法不得落入写白名单（L-6 对齐，防白名单段名误放行）。 */
  if (m !== 'POST' && m !== 'PUT' && m !== 'DELETE') return false;
  if (first.startsWith('_')) {
    if (SYSTEM_DATA_WRITE.has(clean)) return true;
    if (m === 'DELETE' && SYSTEM_DATA_WRITE_DELETE_ONLY.has(clean)) return true;
    /* SQL 只放行具名子路由（见 SYSTEM_DATA_WRITE）：整段前缀放行会让新增子路由
       自动获得写权限。 */
    return false;
  }
  if (segs.length < 2) return false;
  if (typedRouteVerbLater(segs)) return false;
  return INDEX_DATA_WRITE_OPS.has(segs[1].toLowerCase());
}
